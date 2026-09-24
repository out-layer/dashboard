'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';

/**
 * Send one message through the connector, from the page that stored the
 * credential.
 *
 * Why it exists: an owner who has just connected an account has no other way to
 * learn whether the credential works. Everything else on this page is about
 * storing it; nothing until now used it. A person who cannot see it work has to
 * take our word, and takes it as far as their first agent — which fails for
 * reasons they cannot separate from their own code.
 *
 * It also has to exist for anyone reviewing the integration from outside, who
 * will not write an HTTP request to see the feature.
 *
 * Two ways to pay for the call, because the owner has one or the other and
 * should not have to go and get the missing one:
 *
 * * **A payment key.** An HTTPS call. Nothing is published, the answer is
 *   immediate, and checking the connection costs nothing.
 * * **A wallet transaction.** Needs nothing but the wallet already connected —
 *   but the arguments of a transaction are public on the blockchain for ever,
 *   and that includes the recipient and the text of the message. The page says
 *   so before the button, because nobody expects a test message to be
 *   published.
 *
 * The payment key is a credential and is treated as one: a password field, held
 * in state for the length of the visit, sent in a header, never in the URL,
 * never stored, never logged.
 *
 * Nothing here opens a wallet by itself: `walletSend` runs from the button's
 * own click, under a label that says what the transaction does.
 */

/** `owner:nonce:secret` — the shape `create-payment-key` returns. */
const KEY_SHAPE = /^[^:\s]+:\d+:[0-9a-fA-F]{64}$/;

/** `<word>: <sentence>` — the word is the contract, and for a policy refusal the
 *  sentence names the rule that stopped it. */
function refusalOf(message: string): Outcome {
  const colon = message.indexOf(': ');
  return colon > 0
    ? { kind: 'refused', word: message.slice(0, colon), sentence: message.slice(colon + 2) }
    : { kind: 'refused', word: message, sentence: '' };
}

type Outcome =
  | { kind: 'sent'; detail: string }
  | { kind: 'refused'; word: string; sentence: string }
  | { kind: 'checked'; detail: string }
  | { kind: 'error'; detail: string };

export function TrySending({
  coordinatorUrl,
  projectId,
  profile,
  accountId,
  walletSend,
  walletOutcome,
  walletCost,
  walletCostUnreadable,
  stablecoin,
}: {
  coordinatorUrl: string;
  projectId: string;
  profile: string;
  /** The account the row is stored under — what `secrets_ref` names. */
  accountId: string;
  /** Runs the send as one transaction from this page's wallet. It resolves with
   *  what the connector answered — or never resolves, because a wallet that
   *  signs on its own page navigates away and the answer arrives as
   *  `walletOutcome` after the return. */
  walletSend?: (input: Record<string, unknown>) => Promise<{ messageId?: string; refusal?: string }>;
  /** What a wallet that signed on its own page answered, once the page is back. */
  walletOutcome?: { messageId?: string; refusal?: string; error?: string } | null;
  /** The operation's price and the caller's deposited balance, both in the
   *  stablecoin's minimal units, read from the chain by the page. */
  walletCost?: { price: string; balance: string } | null;
  /** The chain could not be asked for the price, so a transaction would carry
   *  no payment and be refused. */
  walletCostUnreadable?: boolean;
  stablecoin?: { symbol: string; decimals: number };
}) {
  const [how, setHow] = useState<'wallet' | 'key'>(walletSend ? 'wallet' : 'key');
  const [paymentKey, setPaymentKey] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('A test from OutLayer');
  const [body, setBody] = useState('This message was sent by an agent through the OutLayer Gmail connector.');
  const [busy, setBusy] = useState<'status' | 'send' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const keyGiven = paymentKey.trim().length > 0;
  const keyLooksRight = KEY_SHAPE.test(paymentKey.trim());
  // On chain the price is taken from a balance deposited with the contract, and
  // the contract refuses the call outright without it. Saying so before the
  // button is the difference between a sentence and a wallet error.
  const money = (units: string) =>
    `${(Number(units) / 10 ** (stablecoin?.decimals ?? 6)).toFixed(3)} ${stablecoin?.symbol ?? 'USDC'}`;
  const tooPoor = Boolean(walletCost && BigInt(walletCost.balance) < BigInt(walletCost.price));
  // A wallet that signed on its own page: the page has reloaded and this is the
  // only trace of what happened, so it wins over whatever state is left here.
  const shown: Outcome | null = walletOutcome
    ? walletOutcome.error
      ? { kind: 'error', detail: walletOutcome.error }
      : walletOutcome.refusal
        ? refusalOf(walletOutcome.refusal)
        : { kind: 'sent', detail: walletOutcome.messageId ? `Gmail accepted it as message ${walletOutcome.messageId}.` : 'Gmail accepted it.' }
    : outcome;

  const sendWithWallet = async () => {
    setBusy('send');
    setOutcome(null);
    try {
      const answer = await walletSend!({ operation: 'send', to: [to.trim()], subject, body });
      setOutcome(
        answer.refusal
          ? refusalOf(answer.refusal)
          : { kind: 'sent', detail: answer.messageId ? `Gmail accepted it as message ${answer.messageId}.` : 'Gmail accepted it.' },
      );
    } catch (e) {
      setOutcome({ kind: 'error', detail: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const call = async (what: 'status' | 'send') => {
    setBusy(what);
    setOutcome(null);
    try {
      const input =
        what === 'status'
          ? { operation: 'status' }
          : { operation: 'send', to: [to.trim()], subject, body };
      const response = await fetch(`${coordinatorUrl}/call/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Key': paymentKey.trim(),
        },
        body: JSON.stringify({
          input,
          secrets_ref: { account_id: accountId, profile },
        }),
      });
      const text = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // a body that is not JSON: shown as it came
      }
      if (!response.ok) {
        // The platform refused before the connector ran — no money was spent,
        // and the reason is about the key or the project, not about Gmail.
        const reason =
          (parsed?.error as string | undefined) ??
          (parsed?.reason as string | undefined) ??
          text.slice(0, 300);
        setOutcome({ kind: 'error', detail: `${response.status} — ${reason || 'no reason given'}` });
        return;
      }
      // Two envelopes. The platform's is `{call_id, status, output, error}`,
      // where `output` is whatever the module printed; the module's own is
      // `{success, operation, output, error}`. So the payload is one level
      // deeper than it looks, and a refusal by the connector arrives with
      // HTTP 200 around it.
      const envelope = (parsed?.output as Record<string, unknown> | undefined) ?? {};
      const payload = (envelope.output as Record<string, unknown> | undefined) ?? {};
      if (parsed?.error && envelope.success === undefined) {
        setOutcome({ kind: 'error', detail: String(parsed.error) });
        return;
      }
      if (envelope.success === false) {
        setOutcome(refusalOf(String(envelope.error ?? 'refused')));
        return;
      }
      if (what === 'status') {
        setOutcome({
          kind: 'checked',
          detail:
            `Google accepted the credential. Sends today: ${String(payload.sent_today ?? 0)}.` +
            ` The connector reads your policy as ${JSON.stringify(payload.policy ?? {})}.`,
        });
      } else {
        setOutcome({
          kind: 'sent',
          detail: payload.message_id
            ? `Gmail accepted it as message ${String(payload.message_id)}.`
            : 'Gmail accepted it.',
        });
      }
    } catch (e) {
      // A browser fetch that never reached the coordinator.
      setOutcome({ kind: 'error', detail: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded border border-border p-4 text-sm space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="font-medium text-foreground">Send a test message</h3>
        <InfoHint
          text={
            <>
              <p>
                The message is sent by the connector, from the account you connected, exactly as your
                agent&rsquo;s messages will be — through the same enclave, under the same policy. It appears in
                that account&rsquo;s Sent folder.
              </p>
              <p className="mt-2">
                It is charged to the payment key you paste, at the connector&rsquo;s own price for one send, and
                it counts towards the daily limit in your policy. Checking the connection is free.
              </p>
            </>
          }
        />
      </div>
      <p className="text-muted-foreground">
        Optional, and the only way to see the credential work before an agent uses it.
      </p>

      {walletSend && (
        <div className="flex flex-wrap gap-4">
          {(['wallet', 'key'] as const).map((choice) => (
            <label key={choice} className="flex items-center gap-2">
              <input
                type="radio"
                name="try-sending-how"
                checked={how === choice}
                onChange={() => {
                  setHow(choice);
                  setOutcome(null);
                }}
              />
              <span>{choice === 'wallet' ? 'Pay with a wallet transaction' : 'Pay with a payment key'}</span>
            </label>
          ))}
        </div>
      )}

      {how === 'wallet' && walletCostUnreadable && (
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
          The price of a send could not be read from the chain just now, so a transaction would carry no
          payment and the contract would refuse it. Reload the page, or pay with a payment key.
        </p>
      )}

      {how === 'wallet' && tooPoor && walletCost && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive-text">
          This send costs {money(walletCost.price)} and comes out of the balance you have deposited with the
          contract, which holds {money(walletCost.balance)}. Top it up from the{' '}
          <a className="underline" href="/">
            &ldquo;USDC balance&rdquo; card on the main page
          </a>
          , signed in as this same account — one transaction, and it is there for every call after this one
          — or pay with a payment key instead.
        </p>
      )}

      {how === 'wallet' && (
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
          A transaction&rsquo;s arguments are public on the blockchain and stay readable for ever — and the
          message is one of them. Send yourself something you would not mind publishing. A payment key
          keeps the message between you and Gmail, and costs a fraction of this.
        </p>
      )}

      <label className={how === 'key' ? 'block' : 'hidden'}>
        <span className="text-xs font-medium text-foreground">Payment key</span>
        <input
          type="password"
          // Not "off": browsers ignore that on a password field and offer to
          // SAVE it. This value is what they leave alone.
          autoComplete="one-time-code"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          placeholder="owner:nonce:secret"
          value={paymentKey}
          onChange={(e) => setPaymentKey(e.target.value)}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          {keyGiven && !keyLooksRight
            ? 'That is not the shape of a payment key — owner:nonce:secret.'
            : 'The key pays for the call. It is sent in a header and is not stored by this page.'}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-foreground">To</span>
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="your own address"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          {/* A test message with a stranger in the To field is a stranger
              receiving unasked-for mail from a real person's address. Say where
              it should go before the field is filled in, not after. */}
          <span className="mt-1 block text-xs text-muted-foreground">
            Your own address, so the test stays inside your account.
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-foreground">Subject</span>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-foreground">Message</span>
        <textarea
          rows={3}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={
            busy !== null ||
            to.trim().length === 0 ||
            (how === 'key' && !keyLooksRight) ||
            (how === 'wallet' && (tooPoor || Boolean(walletCostUnreadable)))
          }
          onClick={() => (how === 'wallet' ? void sendWithWallet() : void call('send'))}
          className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy === 'send'
            ? how === 'wallet'
              ? 'Waiting for your wallet…'
              : 'Sending…'
            : how === 'wallet'
              ? 'Sign one transaction and send'
              : 'Send'}
        </button>
        {how === 'key' && (
          <button
            type="button"
            disabled={busy !== null || !keyLooksRight}
            onClick={() => void call('status')}
            className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
            title="A free call that fetches an access token and reads back your policy"
          >
            {busy === 'status' ? 'Checking…' : 'Check the connection (free)'}
          </button>
        )}
        {how === 'wallet' && (
          <span className="text-xs text-muted-foreground">
            {walletCost ? `Costs ${money(walletCost.price)}, taken from your deposited balance. ` : ''}
            Attaches 0.1 NEAR for the run, keeps about 0.0013 NEAR of it, and returns the rest.
          </span>
        )}
      </div>

      {shown?.kind === 'sent' && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900">
          <p className="font-medium text-green-800">Sent.</p>
          <p className="mt-1">
            {shown.detail} It is in the connected account&rsquo;s Sent folder, from that address.
          </p>
        </div>
      )}
      {shown?.kind === 'checked' && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900 break-words">
          {shown.detail}
        </div>
      )}
      {shown?.kind === 'refused' && (
        <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="font-medium">
            Refused: <code>{shown.word}</code>
          </p>
          {shown.sentence && <p className="mt-1">{shown.sentence}</p>}
          <p className="mt-1 text-xs">
            Nothing was sent. A refused send is not charged and does not count towards your daily limit.
          </p>
        </div>
      )}
      {shown?.kind === 'error' && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive-text break-words">
          {shown.detail}
        </div>
      )}
    </div>
  );
}
