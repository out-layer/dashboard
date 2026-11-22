'use client';

/**
 * The owner's side of an owner exit: registering an account in the keystore DAO, creating
 * a wallet from the link an agent handed over, and seeing or starting the exit itself.
 *
 * Every transaction and signature is asked of the wallet from the click on a button whose
 * label says what it sends. Nothing is sent on load, after a read, or after another
 * transaction: a step that finished shows the next button and stops.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { toBase64 } from '@/lib/inbox/crypto';
import { getVaultNetworkConfig } from '@/lib/vault';
import {
  accountsOf,
  createOwnerWallet,
  formatNear,
  formatWindow,
  getExitConfig,
  getExitOwner,
  networkOfLink,
  nsDate,
  pendingExitOf,
  prepareOwnerWallet,
  readExitLink,
  type CreatedOwnerWallet,
  type ExitConfig,
  type ExitOwner,
  type PreparedOwnerWallet,
} from '@/lib/owner-exit';

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
const GAS = BigInt('100000000000000');
/** How often, and how many times, the DAO's record is read again for a change that was just sent. */
const LANDING_READ_MS = 1500;
const LANDING_READS = 10;
const ONE_YOCTO = BigInt(1);

const field =
  'h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent';

function Failure({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{children}</p>;
}

function Done({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">{children}</div>;
}

function Section({ title, about, children }: { title: string; about?: ReactNode; children: ReactNode }) {
  return (
    <section className="max-w-3xl space-y-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {about && <p className="text-sm text-muted-foreground">{about}</p>}
      {children}
    </section>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1.5 pr-4 align-top text-muted-foreground">{name}</td>
      <td className="break-all py-1.5 text-foreground">{children}</td>
    </tr>
  );
}

/** The DAO of the connected network, its exit terms and the connected account's record. */
function useExit() {
  const { accountId, network, viewMethod, signAndSendTransaction } = useNearWallet();
  const dao = getVaultNetworkConfig(network).keystoreDaoId;
  const [config, setConfig] = useState<ExitConfig | null>(null);
  const [owner, setOwner] = useState<ExitOwner | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** What the last action came to, by the action's name: shown beside its button. */
  const [outcome, setOutcome] = useState<{ name: string; error?: string; done?: string } | null>(null);
  /** When the record was read: what "now" means for the dates it is compared with. */
  const [readAt, setReadAt] = useState(0);

  const read = useCallback(
    async (account: string) => {
      const [terms, record] = await Promise.all([getExitConfig(viewMethod, dao), getExitOwner(viewMethod, dao, account)]);
      return { terms, record, at: Date.now() };
    },
    [dao, viewMethod],
  );
  const show = useCallback((found: { terms: ExitConfig; record: ExitOwner | null; at: number }) => {
    setConfig(found.terms);
    setOwner(found.record);
    setReadAt(found.at);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    let stale = false;
    read(accountId)
      .then((found) => {
        if (!stale) show(found);
      })
      .catch((e) => {
        if (!stale) setError(said(e));
      });
    return () => {
      stale = true;
    };
  }, [accountId, read, show]);

  /**
   * One call to the DAO, sent from the click that asked for it. What it came to is read
   * from the chain, not taken from the wallet: `landed` says whether the record now shows
   * what the call was for. A wallet that resolves on a failed transaction is not a "done".
   */
  // The account connected now: a reply that arrives after the user switched accounts is
  // not shown under the new one.
  const accountNow = useRef(accountId);
  useEffect(() => {
    accountNow.current = accountId;
  }, [accountId]);

  const send = useCallback(
    async (
      name: string,
      method: string,
      args: Record<string, unknown>,
      deposit: bigint,
      landed: (record: ExitOwner | null) => boolean | Promise<boolean>,
      saidAfter: string,
    ) => {
      if (!accountId) return;
      setBusy(name);
      setOutcome(null);
      try {
        const sent = await signAndSendTransaction({ receiverId: dao, actions: [actionCreators.functionCall(method, args, GAS, deposit)] });
        const failure = sent?.status?.Failure;
        if (failure) throw new Error(`The transaction failed: ${typeof failure === 'string' ? failure : JSON.stringify(failure)}`);
        // The record is read at final finality, and a wallet answers once the transaction
        // has executed, a few blocks earlier: the change is looked for until it shows. The
        // transaction is sent by now, so a read that fails is a read to make again, never a
        // failure of the transaction.
        const sentBy = accountId;
        let found: Awaited<ReturnType<typeof read>> | null = null;
        let shows = false;
        let unread: unknown = null;
        for (let n = 0; !shows && n <= LANDING_READS; n++) {
          if (n > 0) await new Promise((resolve) => setTimeout(resolve, LANDING_READ_MS));
          if (accountNow.current !== sentBy) return;
          try {
            found = await read(sentBy);
            shows = await landed(found.record);
            unread = null;
          } catch (e) {
            unread = e;
          }
        }
        // Another account connected while the record was read: what was read is not its.
        if (accountNow.current !== sentBy) return;
        if (found) show(found);
        setOutcome(
          shows
            ? { name, done: saidAfter }
            : unread && !found
              ? {
                  name,
                  error: `The transaction was sent, and the record in ${dao} could not be read to confirm it (${said(unread)}). Reload the page in a few seconds to see where it stands.`,
                }
              : {
                  name,
                  error: `The record in ${dao} does not show this change. If your wallet reports the transaction as sent, reload the page in a few seconds; if it failed, the wallet's history says why.`,
                },
        );
      } catch (e) {
        setOutcome({ name, error: said(e) });
      } finally {
        setBusy(null);
      }
    },
    [accountId, dao, read, show, signAndSendTransaction],
  );

  return { accountId, network, dao, config, owner, readAt, error, busy, outcome, send };
}

type Exit = ReturnType<typeof useExit>;

/** What the last of these actions came to, shown under their buttons. */
function Outcome({ exit, of }: { exit: Exit; of: string[] }) {
  const outcome = exit.outcome;
  if (!outcome || !of.includes(outcome.name)) return null;
  return outcome.error ? <Failure>{outcome.error}</Failure> : <Done>{outcome.done}</Done>;
}

function Register({ exit }: { exit: Exit }) {
  const { accountId, dao, config, busy, send } = exit;
  const [hours, setHours] = useState<number | null>(null);
  if (!config) return null;
  const inHours = config.minWindowSecs >= 3600;
  const unit = inHours ? 3600 : 60;
  const chosen = (hours ?? config.defaultWindowSecs / unit) * unit;
  const valid = Number.isInteger(chosen) && chosen >= config.minWindowSecs && chosen <= config.maxWindowSecs;
  return (
    <Section
      title="Register this account as an owner"
      about={
        <>
          One transaction to <span className="font-mono">{dao}</span>, once per account. It stores <span className="font-mono">{accountId}</span>{' '}
          and its exit window in the contract — public, like everything on chain — and takes a fee of {formatNear(config.registrationFeeYocto)} NEAR,
          which is not returned. Nothing else is stored and no wallet is created by it. There is no call that removes a registration; an account
          that never creates a wallet is simply never used.
        </>
      }
    >
      <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        Exit window
        <input
          type="number"
          className={`${field} w-24`}
          min={config.minWindowSecs / unit}
          max={config.maxWindowSecs / unit}
          value={hours ?? config.defaultWindowSecs / unit}
          onChange={(event) => setHours(Number(event.target.value))}
        />
        {inHours ? 'hours' : 'minutes'}
        <span className="text-muted-foreground">
          ({formatWindow(config.minWindowSecs)} – {formatWindow(config.maxWindowSecs)})
        </span>
      </label>
      <p className="text-sm text-muted-foreground">
        The window is how long an exit waits between its start and the keys leaving: the time you have to cancel an exit started with a stolen key.
        Raising it later is immediate; lowering it takes effect after the window in force.
      </p>
      <Button
        disabled={busy !== null || !valid}
        onClick={() =>
          void send(
            'register',
            'register_exit_owner',
            { exit_window_sec: chosen },
            config.registrationFeeYocto,
            (record) => record !== null,
            `${accountId} is registered in ${dao}.`,
          )
        }
      >
        {busy === 'register' ? 'Waiting for the wallet…' : `Register ${accountId} in ${dao} — ${formatNear(config.registrationFeeYocto)} NEAR`}
      </Button>
      <Outcome exit={exit} of={['register']} />
    </Section>
  );
}

/** Said under every link that creates nothing: registering for its sake buys nothing. */
function NoWalletFromThisLink() {
  return (
    <p className="text-sm text-muted-foreground">
      No wallet comes of this link as it is. Do not register for its sake: the registration fee is not returned.
    </p>
  );
}

/** A wallet from an agent's link: read it, register if needed, then one signature creates it. */
function FromLink({ token, exit }: { token: string; exit: Exit }) {
  const { accountId, network, owner, readAt } = exit;
  const { signMessage, switchNetwork } = useNearWallet();
  const link = useMemo(() => readExitLink(token), [token]);
  const linkNetwork = link ? networkOfLink(link, (n) => getVaultNetworkConfig(n).keystoreDaoId) : null;
  const [prepared, setPrepared] = useState<PreparedOwnerWallet | null>(null);
  const [created, setCreated] = useState<CreatedOwnerWallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped by "Check again": a read of the link, asked for by a click. */
  const [asked, setAsked] = useState(0);
  const generation = owner?.generation ?? null;

  // A read: what the coordinator will ask this account to sign. Repeated when the account's
  // registration changes, so the message appears once the account is registered.
  useEffect(() => {
    if (!link || !accountId || linkNetwork !== network || created) return;
    let stale = false;
    prepareOwnerWallet(getCoordinatorApiUrl(network), token, accountId)
      .then((answer) => {
        if (!stale) {
          setPrepared(answer);
          setError(null);
        }
      })
      .catch((e) => {
        if (!stale) setError(said(e));
      });
    return () => {
      stale = true;
    };
  }, [link, accountId, linkNetwork, network, token, generation, created, asked]);

  if (!link) {
    return (
      <Section title="A wallet from a link">
        <Failure>This link cannot be read. Ask the agent for a new one.</Failure>
        <NoWalletFromThisLink />
      </Section>
    );
  }
  if (!linkNetwork) {
    return (
      <Section title="A wallet from a link">
        <Failure>
          This link is for <span className="font-mono">{link.dao}</span>, which is not OutLayer&apos;s keystore DAO on mainnet or testnet. Do not use it.
        </Failure>
        <NoWalletFromThisLink />
      </Section>
    );
  }
  if (linkNetwork !== network) {
    return (
      <Section
        title="A wallet from a link"
        about={`This link is for ${linkNetwork}; the wallet connected here is on ${network}. Nothing registered on ${network} serves this link.`}
      >
        <Button onClick={() => switchNetwork(linkNetwork)}>Switch to {linkNetwork}</Button>
      </Section>
    );
  }


  const create = async () => {
    const message = prepared?.message;
    if (!prepared || !message || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      const signed = await signMessage({ message, recipient: prepared.recipient, nonce });
      if (!signed) return;
      if (signed.accountId !== accountId) throw new Error(`The wallet signed as ${signed.accountId}, not as ${accountId}.`);
      setCreated(
        await createOwnerWallet(getCoordinatorApiUrl(network), {
          link: token,
          account_id: accountId,
          public_key: signed.publicKey,
          signature: signed.signature,
          nonce,
        }),
      );
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(false);
    }
  };

  // Nothing a link says is shown, and nothing is offered, until OutLayer has taken the link
  // for one it issued: what follows is drawn from its answer, not from the link's own text.
  if (!prepared) {
    return (
      <Section title="A wallet from a link">
        {error ? (
          <>
            <Failure>{error}</Failure>
            <NoWalletFromThisLink />
            <Button variant="outline" onClick={() => setAsked((n) => n + 1)}>
              Check the link again
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Checking the link with OutLayer…</p>
        )}
      </Section>
    );
  }
  const expired = prepared.expires_at * 1000 < readAt;

  return (
    <Section
      title="A wallet from a link"
      about="Whoever made this link asked for a wallet that you own and can leave OutLayer with. They hold the wallet's API key and will operate the wallet in your name; you hold the exit."
    >
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        <p className="font-medium">Continue only if this link came from an agent you run or trust.</p>
        <p className="mt-1">
          Anyone can make such a link. Its maker keeps the key below: with it they spend whatever the wallet holds, within the policy you set —
          and the wallet has none until you set one. If you did not ask an agent for this, close the page.
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <Row name="Owner">
            <span className="font-mono">{accountId}</span>
          </Row>
          <Row name="Seed">{prepared.seed !== null ? <span className="font-mono">{prepared.seed}</span> : 'your next free number'}</Row>
          <Row name="The agent's key (sha256)">
            <span className="font-mono">{prepared.key_hash}</span>
          </Row>
          <Row name="Link expires">{new Date(prepared.expires_at * 1000).toLocaleString()}</Row>
        </tbody>
      </table>

      {!created && (
        <p className="text-sm text-muted-foreground">
          This is a new wallet at a new address. Nothing moves into it by itself: funds of a wallet the agent already uses are sent over by an
          ordinary transfer, and a Hyperliquid or Polymarket account belongs to the wallet it was opened from, so it is opened again under this
          one.
        </p>
      )}

      {created ? (
        <Done>
          <p>
            The wallet exists. The agent&apos;s key works now; tell the agent it can continue.
          </p>
          <p className="mt-2 break-all font-mono text-xs">
            wallet_id {created.wallet_id}
            <br />
            NEAR account {created.near_account_id}
            <br />
            owner {created.owner}, generation {created.generation}, seed {created.seed}
          </p>
        </Done>
      ) : expired ? (
        <Failure>This link has expired. Ask the agent for a new one.</Failure>
      ) : owner === null ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{accountId}</span> is not registered as an owner yet. Register it below; the button that creates the wallet
          appears here after.
        </p>
      ) : prepared.message ? (
        <>
          <p className="text-sm text-muted-foreground">
            Creating the wallet is a signature, not a transaction: it costs nothing and moves nothing. You sign this message, which names the
            network, your account, your generation, the seed, the agent&apos;s key and the link&apos;s expiry:
          </p>
          <p className="break-all rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">{prepared.message}</p>
          <p className="text-sm text-muted-foreground">
            After it, whoever holds the agent&apos;s key can use the wallet within its policy. The wallet has no policy until you set one on the
            Wallets page. To take the wallet away from the agent, leave with its keys — the exit below.
          </p>
          <Button disabled={busy} onClick={() => void create()}>
            {busy ? 'Waiting for the wallet…' : `Sign as ${accountId} to create the wallet`}
          </Button>
        </>
      ) : (
        // Registered on chain, and OutLayer has not read it yet: its read of the chain is a
        // few blocks behind. Nothing to pay again; ask again.
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{accountId}</span> is registered, and OutLayer does not see it yet — its read of the chain is a few
            seconds behind. Nothing more is to be paid.
          </p>
          <Button variant="outline" onClick={() => setAsked((n) => n + 1)}>
            Check again
          </Button>
        </>
      )}
      {error && <Failure>{error}</Failure>}
    </Section>
  );
}

function Status({ exit }: { exit: Exit }) {
  const { accountId, dao, config, owner, readAt: now, busy, send } = exit;
  if (!owner || !config) return null;
  const pendingExit = pendingExitOf(owner);
  const approverChange = owner.pending && 'SetApprovers' in owner.pending.kind ? owner.pending : null;
  const lowering = owner.pending_exit_window;
  return (
    <Section title="Your exit" about={<>The record of <span className="font-mono">{accountId}</span> in <span className="font-mono">{dao}</span>.</>}>
      <table className="w-full text-sm">
        <tbody>
          <Row name="Generation">{owner.generation}</Row>
          <Row name="Exit window">
            {formatWindow(owner.exit_window_secs)}
            {lowering && ` — lowering to ${formatWindow(lowering.secs)} on ${nsDate(lowering.effective_at).toLocaleString()}`}
          </Row>
          <Row name="Exit approvers">
            {owner.approvers.length === 0 ? 'none: the account alone decides' : `${owner.threshold} of ${owner.approvers.join(', ')}`}
          </Row>
          <Row name="Escrow">
            {owner.escrow_check
              ? 'stored: this generation has an exit'
              : 'not stored yet: it is written when the first wallet of this generation is used'}
          </Row>
        </tbody>
      </table>

      {owner.claim_in_flight && (
        <Failure>A claim of the key is in flight. The wallets of this generation are not served until its outcome is recorded.</Failure>
      )}

      {approverChange && 'SetApprovers' in approverChange.kind && (
        <p className="text-sm text-foreground">
          A change of the approvers waits for the current set: {approverChange.kind.SetApprovers.threshold} of{' '}
          {approverChange.kind.SetApprovers.approvers.join(', ') || 'nobody'} (nonce {approverChange.nonce}, approved by{' '}
          {approverChange.approvals.join(', ') || 'nobody yet'}).
        </p>
      )}

      {pendingExit ? (
        <>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <p className="font-medium">An exit is pending (nonce {pendingExit.nonce}).</p>
            <p className="mt-1">
              {now < pendingExit.finalizeAfter.getTime()
                ? `The key can be claimed from ${pendingExit.finalizeAfter.toLocaleString()}`
                : 'The key can be claimed now'}{' '}
              until {pendingExit.finalizeBefore.toLocaleString()}.
              {owner.approvers.length > 0 && ` Approved by ${pendingExit.approvals.length} of the ${owner.threshold} needed.`}
            </p>
            <p className="mt-1">If you did not start it, someone holds a key of this account: cancel it, then rotate the account&apos;s keys.</p>
          </div>
          <p className="text-sm text-muted-foreground">
            The claim is made with <span className="font-mono">customer-recovery owner-exit claim</span>, not here: MPC&apos;s answer is encrypted to
            a one-time key that must be written to a file before the transaction is sent, and the master it opens must never pass through a browser.
          </p>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void send('cancel', 'cancel_exit', {}, ONE_YOCTO, (record) => !record?.pending, 'The pending exit is cancelled.')}
          >
            {busy === 'cancel' ? 'Waiting for the wallet…' : 'Cancel the pending exit — 1 yoctoNEAR'}
          </Button>
        </>
      ) : approverChange ? (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => void send('cancel', 'cancel_exit', {}, ONE_YOCTO, (record) => !record?.pending, 'The pending approver change is cancelled.')}
        >
          {busy === 'cancel' ? 'Waiting for the wallet…' : 'Cancel the pending approver change — 1 yoctoNEAR'}
        </Button>
      ) : (
        <>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Before you start an exit</p>
            <p>Withdraw from Polymarket and Hyperliquid and reclaim open payment checks: their funds sit under keys the exit does not hand over.</p>
            <p>
              Starting it sends one transaction to <span className="font-mono">{dao}</span> with a fee of {formatNear(config.exitFeeYocto)} NEAR,
              not returned. The wallets keep working during the {formatWindow(owner.exit_window_secs)} window, and you can cancel until the key is
              claimed. After the claim the wallets of generation {owner.generation} stop working in OutLayer for good — every one of them, their
              policies with them — and their keys are yours. Secrets stay in OutLayer: an exit does not hand them over.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy !== null || !owner.escrow_check}
            onClick={() =>
              void send(
                'initiate',
                'initiate_exit',
                {},
                config.exitFeeYocto,
                (record) => !!record && pendingExitOf(record) !== null,
                `The exit is started. Its window is ${formatWindow(owner.exit_window_secs)}.`,
              )
            }
          >
            {busy === 'initiate'
              ? 'Waiting for the wallet…'
              : `Start the exit of generation ${owner.generation} — ${formatNear(config.exitFeeYocto)} NEAR`}
          </Button>
        </>
      )}
      <Outcome exit={exit} of={['register', 'initiate', 'cancel', 'approvers']} />
    </Section>
  );
}

/** Change the exit window: a longer one is in force at once, a shorter one after the window in force. */
function Window({ exit }: { exit: Exit }) {
  const { config, owner, busy, send } = exit;
  const [typed, setTyped] = useState<number | null>(null);
  if (!owner || !config) return null;
  const inHours = config.minWindowSecs >= 3600;
  const unit = inHours ? 3600 : 60;
  const chosen = typed === null ? null : typed * unit;
  const pendingLowering = owner.pending_exit_window;
  // The window in force, asked for again, is a change only while a lowering waits: it drops it.
  const drops = chosen === owner.exit_window_secs && pendingLowering !== null;
  const valid =
    chosen !== null &&
    Number.isInteger(chosen) &&
    chosen >= config.minWindowSecs &&
    chosen <= config.maxWindowSecs &&
    (chosen !== owner.exit_window_secs || drops) &&
    chosen !== pendingLowering?.secs;
  const longer = chosen !== null && chosen > owner.exit_window_secs;
  return (
    <Section
      title="Exit window"
      about={
        <>
          In force: {formatWindow(owner.exit_window_secs)}
          {pendingLowering && ` (lowering to ${formatWindow(pendingLowering.secs)} on ${nsDate(pendingLowering.effective_at).toLocaleString()}; asking for the window in force again drops it)`}
          . A longer window is in force with the transaction. A shorter one takes effect only
          after the window in force has passed, so a stolen key cannot shorten the wait it faces; an exit started before then keeps the longer
          window.
        </>
      }
    >
      <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        New window
        <input
          type="number"
          className={`${field} w-24`}
          min={config.minWindowSecs / unit}
          max={config.maxWindowSecs / unit}
          value={typed ?? ''}
          onChange={(event) => setTyped(event.target.value === '' ? null : Number(event.target.value))}
        />
        {inHours ? 'hours' : 'minutes'}
        <span className="text-muted-foreground">
          ({formatWindow(config.minWindowSecs)} – {formatWindow(config.maxWindowSecs)})
        </span>
      </label>
      <Button
        variant="outline"
        disabled={busy !== null || !valid}
        onClick={() =>
          void send(
            'window',
            'set_exit_window',
            { exit_window_sec: chosen },
            ONE_YOCTO,
            (record) =>
              !!record &&
              (longer || drops
                ? record.exit_window_secs === chosen && record.pending_exit_window === null
                : record.pending_exit_window?.secs === chosen),
            drops
              ? `The exit window stays ${formatWindow(chosen ?? 0)}; the lowering is dropped.`
              : longer
                ? `The exit window is ${formatWindow(chosen ?? 0)}.`
                : `The exit window lowers to ${formatWindow(chosen ?? 0)} after the window in force.`,
          )
        }
      >
        {busy === 'window'
          ? 'Waiting for the wallet…'
          : valid
            ? `${drops ? 'Keep' : longer ? 'Raise' : 'Lower'} the exit window ${drops ? 'at' : 'to'} ${formatWindow(chosen ?? 0)} — 1 yoctoNEAR`
            : 'Change the exit window — 1 yoctoNEAR'}
      </Button>
      <Outcome exit={exit} of={['window']} />
    </Section>
  );
}

function Approvers({ exit }: { exit: Exit }) {
  const { config, owner, busy, send } = exit;
  const [typed, setTyped] = useState('');
  const [threshold, setThreshold] = useState(1);
  const [refused, setRefused] = useState<string | null>(null);
  if (!owner || !config || owner.pending) return null;
  const first = owner.approvers.length === 0;
  const set = () => {
    const named = accountsOf(typed);
    if (!named.ok) return setRefused(named.why);
    if (first && named.accounts.length === 0) return setRefused('Name at least one account.');
    if (named.accounts.length > 0 && (threshold < 1 || threshold > named.accounts.length)) {
      return setRefused('The threshold is between 1 and the number of approvers.');
    }
    setRefused(null);
    void send(
      'approvers',
      'set_exit_approvers',
      { approvers: named.accounts, threshold: named.accounts.length === 0 ? 0 : threshold },
      ONE_YOCTO,
      (record) =>
        !!record &&
        (first
          ? record.approvers.length === named.accounts.length && named.accounts.every((a) => record.approvers.includes(a))
          : !!record.pending && 'SetApprovers' in record.pending.kind),
      first ? 'The approvers are set.' : 'The change waits for the approvers in force.',
    );
  };
  return (
    <Section
      title="Exit approvers"
      about={
        <>
          A wallet policy locked to approvers is signed for your wallets only when the same accounts and threshold are set here: an exit would
          otherwise be a way round the lock. The set is public. {first ? 'The first set is in force at once' : 'A change is in force once the current set has approved it'};
          approvers who are lost or refuse block the exit for good.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${field} min-w-0 flex-1 font-mono`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="alice.near, bob.near"
          autoComplete="off"
          spellCheck={false}
        />
        <label className="flex items-center gap-2 text-sm text-foreground">
          threshold
          <input type="number" min={1} className={`${field} w-20`} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
        </label>
      </div>
      <Button variant="outline" disabled={busy !== null || (first && !typed.trim())} onClick={set}>
        {busy === 'approvers' ? 'Waiting for the wallet…' : `${first ? 'Set' : 'Propose'} the exit approvers — 1 yoctoNEAR`}
      </Button>
      {refused && <Failure>{refused}</Failure>}
    </Section>
  );
}

/** An approver's vote on another account's exit or approver change. */
function Vote({ exit }: { exit: Exit }) {
  const { accountId, dao, busy, send } = exit;
  const { viewMethod } = useNearWallet();
  const [typed, setTyped] = useState('');
  const [found, setFound] = useState<{ account: string; owner: ExitOwner | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = async () => {
    const named = accountsOf(typed);
    if (!named.ok || named.accounts.length !== 1) return setError('Name one NEAR account.');
    setError(null);
    try {
      setFound({ account: named.accounts[0], owner: await getExitOwner(viewMethod, dao, named.accounts[0]) });
    } catch (e) {
      setError(said(e));
    }
  };

  const pending = found?.owner?.pending ?? null;
  const mine = !!accountId && !!found?.owner?.approvers.includes(accountId);
  const voted = !!accountId && !!pending?.approvals.includes(accountId);
  const what = pending
    ? 'Exit' in pending.kind
      ? `the exit of ${found?.account}: after it the keys of its wallets leave OutLayer`
      : `a new approver set for ${found?.account}: ${pending.kind.SetApprovers.threshold} of ${pending.kind.SetApprovers.approvers.join(', ') || 'nobody'}`
    : '';

  return (
    <Section title="Vote as an approver" about="If another owner named this account as an exit approver, their pending exit or approver change waits for your vote.">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${field} min-w-0 flex-1 font-mono`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="the owner's account"
          autoComplete="off"
          spellCheck={false}
        />
        <Button variant="outline" disabled={!typed.trim()} onClick={() => void look()}>
          Look up
        </Button>
      </div>
      {found && !found.owner && <p className="text-sm text-muted-foreground">{found.account} is not registered as an owner.</p>}
      {found?.owner && !pending && <p className="text-sm text-muted-foreground">Nothing of {found.account} is pending.</p>}
      {found?.owner && pending && !mine && (
        <p className="text-sm text-muted-foreground">
          Pending: {what}. <span className="font-mono">{accountId}</span> is not one of its approvers.
        </p>
      )}
      {found?.owner && pending && mine && (
        <>
          <p className="text-sm text-foreground">
            Pending (nonce {pending.nonce}): {what}. Approved by {pending.approvals.join(', ') || 'nobody yet'}; {found.owner.threshold} needed. One
            reject ends it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || voted}
              onClick={() =>
                void send(
                  'approve',
                  'approve_exit',
                  { owner: found.account, nonce: pending.nonce },
                  ONE_YOCTO,
                  // A vote that completes a change of the set ends the action, and so does
                  // another approver's reject: what is said covers both.
                  async () => {
                    const now = (await getExitOwner(viewMethod, dao, found.account))?.pending;
                    return now?.nonce !== pending.nonce || (!!accountId && now.approvals.includes(accountId));
                  },
                  'Your approval is recorded, or the action is no longer pending: the record above shows which.',
                ).then(look)
              }
            >
              {voted ? 'You approved it' : busy === 'approve' ? 'Waiting for the wallet…' : `Approve it as ${accountId} — 1 yoctoNEAR`}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || voted}
              onClick={() =>
                void send(
                  'reject',
                  'reject_exit',
                  { owner: found.account, nonce: pending.nonce },
                  ONE_YOCTO,
                  async () => (await getExitOwner(viewMethod, dao, found.account))?.pending?.nonce !== pending.nonce,
                  'The action is no longer pending.',
                ).then(look)
              }
            >
              {busy === 'reject' ? 'Waiting for the wallet…' : `Reject it as ${accountId} — 1 yoctoNEAR`}
            </Button>
          </div>
        </>
      )}
      {error && <Failure>{error}</Failure>}
      <Outcome exit={exit} of={['approve', 'reject']} />
    </Section>
  );
}

function ExitPage() {
  const token = useSearchParams().get('link');
  const exit = useExit();
  return (
    <div className="space-y-5">
      {/* Keyed by the account: what one account was shown and asked to sign is not another's. */}
      {token && <FromLink key={`${exit.accountId}:${token}`} token={token} exit={exit} />}
      {exit.owner === null && <Register exit={exit} />}
      <Status exit={exit} />
      <Window exit={exit} />
      <Approvers exit={exit} />
      <Vote exit={exit} />
      {exit.error && <Failure>{exit.error}</Failure>}
    </div>
  );
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner exit"
        description="Wallets owned by your NEAR account that you can take out of OutLayer with their keys, through the keystore DAO contract on NEAR."
      />
      <RequireWallet subject="your exit">
        <Suspense fallback={null}>
          <ExitPage />
        </Suspense>
      </RequireWallet>
    </div>
  );
}
