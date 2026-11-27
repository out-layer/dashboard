'use client';

/**
 * The screens of the owner's setup page, one action each. They draw what the
 * page decided and call back on a click; none of them reads the chain or opens
 * a wallet by itself.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type Where = 'deterministic' | 'sub-account' | 'own-account';

const field =
  'h-8 w-32 rounded-lg border border-border bg-background px-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent';
const more = 'text-sm text-muted-foreground [&>summary]:cursor-pointer [&>summary]:select-none';

export function Failure({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{children}</p>;
}

/** Where the owner is: "Step 1 of 2", then the screen's one action. */
function Screen({ step, title, children }: { step?: string; title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      {step && <p className="text-xs font-medium uppercase tracking-wider text-faint-foreground">{step}</p>}
      <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </Card>
  );
}

export function ConnectScreen({ owner, onConnect }: { owner: string; onConnect: () => void }) {
  return (
    <Screen title={`Connect ${owner}`}>
      <p className="text-sm text-muted-foreground">Your agent asked you, {owner}, to set up its wallet.</p>
      <Button onClick={onConnect}>Connect your wallet</Button>
    </Screen>
  );
}

export function WrongAccountScreen({ connected, owner }: { connected: string; owner: string }) {
  return (
    <Screen title="Switch wallets">
      <p className="text-sm text-muted-foreground">
        You are connected as <span className="font-mono text-foreground">{connected}</span>; this agent&apos;s owner is{' '}
        <span className="font-mono text-foreground">{owner}</span>.
      </p>
    </Screen>
  );
}

export function AccountOptions(props: {
  where: Where;
  choose: (where: Where) => void;
  name: string;
  setName: (name: string) => void;
  nameOk: boolean;
  owner: string;
  depositNear: string;
  disabled: boolean;
}) {
  const { where, choose, name, setName, nameOk, owner, depositNear, disabled } = props;
  const option = (value: Where, children: ReactNode) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-accent">
      <input type="radio" name="where" className="mt-1 accent-accent" checked={where === value} onChange={() => choose(value)} />
      <span className="text-sm text-muted-foreground">{children}</span>
    </label>
  );
  return (
    <details className={more}>
      <summary>Other options: the account the wallet is on</summary>
      <fieldset disabled={disabled} className="mt-3 grid gap-2">
        {option(
          'deterministic',
          <>
            <span className="font-medium text-foreground">A new account with no key</span> (recommended). Its address,{' '}
            <span className="font-mono">0s…</span>, is made from your agent&apos;s keys.
          </>,
        )}
        {option(
          'sub-account',
          <>
            <span className="font-medium text-foreground">A named sub-account</span>, for {depositNear} NEAR of storage. Some
            wallets do not allow it yet.
            <span className="mt-2 flex flex-wrap items-center gap-1">
              <input
                value={name}
                aria-label="Sub-account name"
                onFocus={() => choose('sub-account')}
                onChange={(e) => setName(e.target.value.trim().toLowerCase())}
                className={field}
              />
              <span className="font-mono">.{owner}</span>
            </span>
            {!nameOk && (
              <span className="mt-1 block text-destructive-text">Lowercase letters and digits, with single - or _ between them.</span>
            )}
          </>,
        )}
        {option(
          'own-account',
          <>
            <span className="font-medium text-foreground">Your own account</span>, <span className="font-mono">{owner}</span>. The
            wallet contract replaces any contract on it; your keys stay.
          </>,
        )}
      </fieldset>
    </details>
  );
}

export function SignScreen(props: {
  busy: boolean;
  waiting: boolean;
  signDisabled: boolean;
  onSign: () => void;
  /** Why the last signature was held back, and the account the wallet has now. */
  mismatch: { why: string; account: string } | null;
  onReplace: () => void;
  options: ReactNode;
}) {
  const { busy, waiting, signDisabled, onSign, mismatch, onReplace, options } = props;
  return (
    <Screen step="Step 1 of 2" title="Sign to make your agent's key">
      <p className="text-sm text-muted-foreground">
        A signature, not a transaction: it costs nothing. The signature is your agent&apos;s key, and you can make it again any
        time by signing again.
      </p>
      {mismatch && (
        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive-text">{mismatch.why}</p>
          <p className="text-muted-foreground">
            Or set up a new wallet contract for this signature instead: for instance when you did not set up {mismatch.account}{' '}
            yourself, or can no longer sign with the key that did. Funds in {mismatch.account} do not move to it.
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={onReplace}>
            Set up a new wallet contract instead
          </Button>
        </div>
      )}
      <Button disabled={busy || signDisabled} onClick={onSign}>
        {waiting ? 'Waiting for your wallet…' : 'Sign'}
      </Button>
      {options}
    </Screen>
  );
}

export function CreateScreen(props: {
  title: string;
  cost: string;
  label: string;
  busy: boolean;
  onCreate: () => void;
  /** Back to step 1, while nothing has been sent. */
  onBack: (() => void) | null;
  options: ReactNode;
}) {
  const { title, cost, label, busy, onCreate, onBack, options } = props;
  return (
    <Screen step="Step 2 of 2" title={title}>
      <p className="text-sm text-muted-foreground">{cost}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={onCreate}>
          {label}
        </Button>
        {onBack && (
          <Button variant="ghost" disabled={busy} onClick={onBack}>
            Sign with another key
          </Button>
        )}
      </div>
      {options}
    </Screen>
  );
}

export function ReadyScreen(props: { account: string; copied: boolean; onCopy: () => void; howItWorks: ReactNode }) {
  const { account, copied, onCopy, howItWorks } = props;
  return (
    <Screen title="Your agent's wallet is ready">
      <p className="break-all rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground">{account}</p>
      <p className="text-sm text-muted-foreground">
        Your agent already has its key and uses this wallet. Next, set what it may do: until then it can do nothing.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/wallet/manage" className={buttonVariants()}>
          Set what the agent may do
        </Link>
        <Button variant="outline" onClick={onCopy}>
          {copied ? 'Address copied' : 'Copy the address, to send funds'}
        </Button>
      </div>
      <details className={more}>
        <summary>How this works</summary>
        <div className="mt-3">{howItWorks}</div>
      </details>
    </Screen>
  );
}

/** The ids behind the screen, for whoever wants to check them. */
export function Details({ rows, note }: { rows: Array<[string, string]>; note: ReactNode }) {
  return (
    <details className={more}>
      <summary>Details</summary>
      <dl className="mt-3 grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt>{name}</dt>
            <dd className="break-all font-mono text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {note && <div className="mt-3 text-xs">{note}</div>}
    </details>
  );
}
