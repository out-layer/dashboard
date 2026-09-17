'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { eciesEncrypt } from '@/lib/ecies';

/**
 * Connecting a Gmail account, in one page.
 *
 * Google's consent screen, then the same three steps the secrets page takes for
 * any secret: ask the keystore for the row's public key, seal in the browser,
 * and store on chain. The refresh token exists in this tab and nowhere else —
 * the server that exchanges the code hands it straight back and keeps nothing.
 *
 * What is stored is only the token. The OAuth client it belongs to is the
 * connector's own, held as its author secret, so nobody's row carries a
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

type Stage = 'idle' | 'exchanging' | 'sealing' | 'storing' | 'done';

function ConnectGmail() {
  const { accountId, signAndSendTransaction, contractId, viewMethod, network } = useNearWallet();
  const params = useSearchParams();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const projectId = GMAIL_PROJECT[network] ?? GMAIL_PROJECT.testnet;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  // Google matches this against the registered list byte for byte, and the same
  // string has to be sent again at the exchange.
  const redirectUri = useMemo(
    () => (typeof window === 'undefined' ? '' : `${window.location.origin}/connect/gmail`),
    [],
  );

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

  const store = useCallback(
    async (code: string) => {
      setError(null);
      try {
        setStage('exchanging');
        const exchanged = await fetch('/connect/gmail/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        });
        const answer = await exchanged.json().catch(() => ({}));
        if (!exchanged.ok) throw new Error(answer?.error || `The exchange failed (HTTP ${exchanged.status}).`);
        const refreshToken: string = answer.refresh_token;

        setStage('sealing');
        const accessor = { Project: { project_id: projectId } };
        // The row's key, derived by the keystore from the accessor and owner —
        // the same call the secrets page makes, and the reason the token can be
        // sealed here rather than anywhere that could keep it.
        const secretsJson = JSON.stringify({ GMAIL_REFRESH_TOKEN: refreshToken });
        const pubkeyResponse = await fetch(`${coordinatorUrl}/secrets/pubkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessor, owner: accountId, secrets_json: secretsJson }),
        });
        if (!pubkeyResponse.ok) throw new Error(await pubkeyResponse.text());
        const { pubkey } = await pubkeyResponse.json();
        const sealed = eciesEncrypt(pubkey, new TextEncoder().encode(secretsJson));
        const encryptedBase64 = Buffer.from(sealed).toString('base64');

        setStage('storing');
        // Yours alone until you grant an agent, which is the Access screen on
        // the secrets page. A connector row left open would let anyone who
        // names it send mail as you.
        const access = { Whitelist: { accounts: [accountId] } };
        const args = {
          accessor,
          profile: PROFILE,
          encrypted_secrets_base64: encryptedBase64,
          access,
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
        setStage('idle');
      }
    },
    [accountId, contractId, coordinatorUrl, projectId, redirectUri, signAndSendTransaction, viewMethod],
  );

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
    if (!code || !accountId || stage !== 'idle' || txHash) return;
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (!expected || params.get('state') !== expected) {
      setError('This callback did not come from a connection started in this tab. Start again.');
      return;
    }
    void store(code);
  }, [params, accountId, stage, txHash, store]);

  const busy = stage === 'exchanging' || stage === 'sealing' || stage === 'storing';
  const working = {
    exchanging: 'Asking Google for a durable credential…',
    sealing: 'Sealing it to the keystore, in this browser…',
    storing: 'Storing it on chain — approve the transaction in your wallet…',
  } as const;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Connect Gmail" description="Let an agent send mail from your own address." />

      {!clientId && (
        <p className="text-sm text-red-600">
          This deployment has no Google client configured, so the consent screen cannot be opened.
        </p>
      )}

      {stage === 'done' ? (
        <div className="space-y-3">
          <p className="text-sm">
            Connected. Your credential is stored as <code>{PROFILE}</code> under{' '}
            <code>{projectId}</code>, readable by <code>{accountId}</code> and nobody else.
          </p>
          <p className="text-sm">
            Give an agent access on the <a className="underline" href="/secrets">secrets page</a> — its Access
            screen adds an account and can put an expiry on the grant. The agent then names{' '}
            <code>{`{ account_id: "${accountId}", profile: "${PROFILE}" }`}</code> in its call.
          </p>
          {txHash && <p className="text-xs text-gray-500">Transaction {txHash}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            Google will ask you to allow one thing: sending mail. This connector cannot read your
            mailbox — it never asks for a scope that would let it, so no message of yours can reach
            an agent.
          </p>
          <p className="text-sm">
            What is stored is a credential for your account, sealed in this browser to a key only
            the keystore enclave holds. Until you grant an agent, you are the only one who can use
            it.
          </p>
          <button
            onClick={consent}
            disabled={busy || !clientId}
            className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? working[stage as keyof typeof working] : 'Connect Google account'}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
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
