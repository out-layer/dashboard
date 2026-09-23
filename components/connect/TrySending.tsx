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
 * The payment key is a credential and is treated as one: a password field, held
 * in state for the length of the visit, sent in a header, never in the URL,
 * never stored, never logged.
 */

/** `owner:nonce:secret` — the shape `create-payment-key` returns. */
const KEY_SHAPE = /^[^:\s]+:\d+:[0-9a-fA-F]{64}$/;

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
}: {
  coordinatorUrl: string;
  projectId: string;
  profile: string;
  /** The account the row is stored under — what `secrets_ref` names. */
  accountId: string;
}) {
  const [paymentKey, setPaymentKey] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('A test from OutLayer');
  const [body, setBody] = useState('This message was sent by an agent through the OutLayer Gmail connector.');
  const [busy, setBusy] = useState<'status' | 'send' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const keyGiven = paymentKey.trim().length > 0;
  const keyLooksRight = KEY_SHAPE.test(paymentKey.trim());

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
        // `<word>: <sentence>` — the word is the contract, and for a policy
        // refusal the sentence names the rule that stopped it.
        const message = String(envelope.error ?? 'refused');
        const colon = message.indexOf(': ');
        setOutcome(
          colon > 0
            ? { kind: 'refused', word: message.slice(0, colon), sentence: message.slice(colon + 2) }
            : { kind: 'refused', word: message, sentence: '' },
        );
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

      <label className="block">
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
          disabled={busy !== null || !keyLooksRight || to.trim().length === 0}
          onClick={() => call('send')}
          className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy === 'send' ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          disabled={busy !== null || !keyLooksRight}
          onClick={() => call('status')}
          className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
          title="A free call that fetches an access token and reads back your policy"
        >
          {busy === 'status' ? 'Checking…' : 'Check the connection (free)'}
        </button>
      </div>

      {outcome?.kind === 'sent' && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900">
          <p className="font-medium text-green-800">Sent.</p>
          <p className="mt-1">
            {outcome.detail} It is in the connected account&rsquo;s Sent folder, from that address.
          </p>
        </div>
      )}
      {outcome?.kind === 'checked' && (
        <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-900 break-words">
          {outcome.detail}
        </div>
      )}
      {outcome?.kind === 'refused' && (
        <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="font-medium">
            Refused: <code>{outcome.word}</code>
          </p>
          {outcome.sentence && <p className="mt-1">{outcome.sentence}</p>}
          <p className="mt-1 text-xs">
            Nothing was sent. A refused send is not charged and does not count towards your daily limit.
          </p>
        </div>
      )}
      {outcome?.kind === 'error' && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive-text break-words">
          {outcome.detail}
        </div>
      )}
    </div>
  );
}
