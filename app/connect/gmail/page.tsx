'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { eciesEncrypt } from '@/lib/ecies';

/**
 * Connecting a Gmail account, in two steps and two clicks.
 *
 * The split is not decoration. Everything up to the encryption happens on the
 * way back from Google with no interaction — and then the page STOPS and asks.
 * A wallet cannot be opened from inside that chain: it is not a user gesture,
 * the popup it came from is gone, and Meteor fails on its own internals rather
 * than showing anything a person can act on. So the transaction waits behind a
 * button, which is also where the reader finds out what they are about to sign.
 *
 * What is stored is only the refresh token. The OAuth client it belongs to is
 * the connector's own, held as its author secret, so nobody's row carries a
 * credential of ours for them to extract.
 */

/** The curated Gmail connector, per network. */
const GMAIL_PROJECT: Record<string, string> = {
  testnet: 'connectors.outlayer.testnet/gmail',
  mainnet: 'connectors.outlayer.near/gmail',
};

/** The one scope this connector implements, and the only one asked for. */
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** The profile an agent names in `secrets_ref` to reach this row. */
const PROFILE = 'gmail';

const STATE_KEY = 'outlayer:connect:gmail:state';

type Stage = 'idle' | 'preparing' | 'ready' | 'storing' | 'done';

function ConnectGmail() {
  const { accountId, signAndSendTransaction, contractId, viewMethod, network } = useNearWallet();
  const params = useSearchParams();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /** The sealed credential, waiting for the owner to sign. Ciphertext only: the
   *  token itself is dropped as soon as it has been encrypted. */
  const [sealed, setSealed] = useState<string | null>(null);
  const attempted = useRef(false);

  const projectId = GMAIL_PROJECT[network] ?? GMAIL_PROJECT.testnet;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  // Google matches this against the registered list byte for byte, and the same
  // string has to be sent again at the exchange.
  const redirectUri = useMemo(
    () => (typeof window === 'undefined' ? '' : `${window.location.origin}/connect/gmail`),
    [],
  );

  // The accessor has TWO shapes and they are not interchangeable: the
  // coordinator's enum is internally tagged (`#[serde(tag = "type")]`), the
  // contract's is externally tagged. Sending one where the other is expected is
  // a 422 with nothing in it to explain itself.
  const forCoordinator = useMemo(() => ({ type: 'Project', project_id: projectId }), [projectId]);
  const forContract = useMemo(() => ({ Project: { project_id: projectId } }), [projectId]);

  const consent = useCallback(() => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    // Both are required for a refresh token: offline asks for one, and consent
    // forces the screen for an account that has granted this app before —
    // without which Google sends back an access token that dies in an hour.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    window.location.href = url.toString();
  }, [clientId, redirectUri]);

  /** Step one: the code becomes a credential, and the credential becomes
   *  ciphertext. No wallet, no signature, nothing on chain yet. */
  const prepare = useCallback(
    async (code: string) => {
      setError(null);
      setStage('preparing');
      try {
        const exchanged = await fetch('/connect/gmail/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        });
        const answer = await exchanged.json().catch(() => ({}));
        if (!exchanged.ok) throw new Error(answer?.error || `The exchange failed (HTTP ${exchanged.status}).`);

        // The row's key, derived inside the keystore enclave from the accessor
        // and the owner. Its private half never leaves that enclave, which is
        // what makes it safe to do the sealing here.
        const secretsJson = JSON.stringify({ GMAIL_REFRESH_TOKEN: answer.refresh_token });
        const pubkeyResponse = await fetch(`${coordinatorUrl}/secrets/pubkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessor: forCoordinator, owner: accountId, secrets_json: secretsJson }),
        });
        if (!pubkeyResponse.ok) throw new Error(await pubkeyResponse.text());
        const { pubkey } = await pubkeyResponse.json();

        const bytes = eciesEncrypt(pubkey, new TextEncoder().encode(secretsJson));
        setSealed(Buffer.from(bytes).toString('base64'));
        setStage('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage('idle');
      }
    },
    [accountId, coordinatorUrl, forCoordinator, redirectUri],
  );

  /** Step two, from a click: the ciphertext goes on chain. */
  const finish = useCallback(async () => {
    if (!sealed) return;
    setError(null);
    setStage('storing');
    try {
      // Yours alone until you grant an agent. A connector row left open would
      // let anyone who names it send mail as you.
      const args = {
        accessor: forContract,
        profile: PROFILE,
        encrypted_secrets_base64: sealed,
        access: { Whitelist: { accounts: [accountId] } },
        vault_id: null,
      };
      const cost = await viewMethod({
        contractId,
        method: 'estimate_storage_cost',
        args: { ...args, owner: accountId },
      });
      if (!cost) throw new Error('The contract would not quote the storage cost.');
      const response = await signAndSendTransaction({
        receiverId: contractId,
        actions: [
          actionCreators.functionCall('store_secrets', args, BigInt('50000000000000'), BigInt(String(cost))),
        ],
      });
      setTxHash(response?.transaction?.hash ?? null);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Back to `ready`, not to the start: the credential is still sealed and
      // in hand, so a refused or closed wallet costs another click and not
      // another trip through Google.
      setStage('ready');
    }
  }, [accountId, contractId, forContract, sealed, signAndSendTransaction, viewMethod]);

  // Google sends the browser back here with a code. The state it carries has to
  // be the one this tab generated: without that check, a link could make a
  // signed-in user store an account they never consented to.
  useEffect(() => {
    const refused = params.get('error');
    if (refused) {
      setError(
        refused === 'access_denied'
          ? 'The consent screen was dismissed, so nothing was connected.'
          : `Google refused the consent: ${refused}`,
      );
      return;
    }
    const code = params.get('code');
    if (!code || !accountId || attempted.current) return;
    // Once, and only once. Without this latch a failure inside `prepare` puts
    // the stage back to idle, the effect runs again with the code still in the
    // URL, and the state check — whose value the first pass consumed — reports
    // "not from this tab" over the top of the real reason.
    attempted.current = true;
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    // The code is spent either way. Taking it out of the address bar keeps a
    // reload from retrying something Google will never honour twice.
    window.history.replaceState({}, '', '/connect/gmail');
    if (!expected || params.get('state') !== expected) {
      setError('This callback did not come from a connection started in this tab. Start again.');
      return;
    }
    void prepare(code);
  }, [params, accountId, prepare]);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Connect Gmail" description="Let an agent send mail from your own address." />

      {!clientId && (
        <p className="text-sm text-red-600">
          This deployment has no Google client configured, so the consent screen cannot be opened.
        </p>
      )}

      {stage === 'idle' && (
        <>
          <p className="text-sm">
            Google will ask you to allow one thing: sending mail. This connector cannot read your
            mailbox — it never asks for a scope that would let it, so no message of yours can reach
            an agent.
          </p>
          <button
            onClick={consent}
            disabled={!clientId}
            className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Connect Google account
          </button>
        </>
      )}

      {stage === 'preparing' && (
        <p className="text-sm">Getting a durable credential from Google and encrypting it here…</p>
      )}

      {(stage === 'ready' || stage === 'storing') && (
        <>
          <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
            <p className="font-medium">Google has granted the credential, and it is already encrypted.</p>
            <p>
              The encryption happened in this browser. It was sealed to a key whose private half
              exists only inside the keystore enclave — <strong>not on our servers, and not in
              this page</strong>. From here on nobody can read it, us included.
            </p>
            <p>
              Nothing has been stored yet. One transaction writes the encrypted credential to the
              smart contract, under your account, with a rule that names{' '}
              <strong>only {accountId}</strong>. The enclave will open it for your runs and for
              nobody else&apos;s.
            </p>
            <p>
              When you want your agent to send mail, you add its account to that rule on the{' '}
              <a className="underline" href="/secrets">
                secrets page
              </a>{' '}
              — with an expiry, if you want the access to lapse on its own. You can take it back at
              any time, and the credential never leaves your row while you do.
            </p>
          </div>
          <button
            onClick={finish}
            disabled={stage === 'storing'}
            className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {stage === 'storing'
              ? 'Waiting for your wallet…'
              : 'Finish: store the encrypted key on the contract'}
          </button>
          {stage === 'storing' && (
            <p className="text-xs text-gray-500">Approve the transaction in your wallet.</p>
          )}
        </>
      )}

      {stage === 'done' && (
        <div className="space-y-3 text-sm">
          <p>
            Connected. The credential is stored as <code>{PROFILE}</code> under{' '}
            <code>{projectId}</code>, readable by <code>{accountId}</code> and nobody else.
          </p>
          <p>
            To let an agent send: open the{' '}
            <a className="underline" href="/secrets">
              secrets page
            </a>
            , find this row and add the agent&apos;s account under Access. It then names{' '}
            <code>{`{ account_id: "${accountId}", profile: "${PROFILE}" }`}</code> in its calls.
          </p>
          {txHash && <p className="text-xs text-gray-500">Transaction {txHash}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ConnectGmailPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectGmail />
      </Suspense>
    </RequireWallet>
  );
}
