// The owner pages ask for the inbox through the bell, not with a block of their own.
//
// A policy that asks the owner first wants this browser signed in to the inbox.
// The page says so by mounting ConfirmNeedsInbox, which draws nothing and asks
// the bell for its hint; the bell's click is the only thing that opens the
// prompt (and the wallet only from the prompt's button), and that click puts
// the hint away for ten minutes.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('ConfirmNeedsInbox draws nothing and asks the bell for its hint', () => {
  const nudge = code('components/inbox/ConfirmNeedsInbox.tsx');
  assert.match(nudge, /useRequestInboxNudge\(\);\s*return null;/);
  assert.doesNotMatch(nudge, /signIn|<Button/);
});

test('the bell shows the hint only without a session, and its click quiets it for ten minutes', () => {
  const bell = code('components/inbox/InboxBell.tsx');
  assert.match(bell, /!open && nudgeWanted && !quiet/);
  assert.match(bell, /quietHint\(\)/);
  const store = code('components/inbox/inboxNudge.ts');
  assert.match(store, /QUIET_MS = 10 \* 60 \* 1000/);
  // Storage can refuse: the hint must never throw.
  assert.equal([...store.matchAll(/try \{/g)].length, 2);
});

test('the prompt is short, and the wallet opens only from its button', () => {
  const prompt = code('components/inbox/SignInPrompt.tsx');
  assert.match(prompt, /Turn on notifications from your agents/);
  assert.match(prompt, /One signature in your wallet — free, no transaction/);
  assert.match(prompt, /onClick=\{\(\) => void signIn\(\)\}/);
});
