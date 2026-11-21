// The shape of the /exit page, read as text: the wallet is asked for a transaction or a
// signature only from a click, the claim of the key is not on the site, and what an
// action came to is read from the chain.
//
// These hold the source to a shape. They do not render it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
/** The source without its comments. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w\\/])\/\/.*$/gm, '');
const PAGE = code('app/exit/page.tsx');
const LIB = code('lib/owner-exit.ts');

/** The body of every `useEffect(() => { … }, [deps])` in the page. */
function effects(text) {
  const found = [];
  for (let at = text.indexOf('useEffect('); at !== -1; at = text.indexOf('useEffect(', at + 1)) {
    let depth = 0;
    let end = at + 'useEffect'.length;
    do {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')') depth -= 1;
      end += 1;
    } while (depth > 0 && end < text.length);
    found.push(text.slice(at, end));
  }
  return found;
}

test('the wallet is never opened from an effect', () => {
  const all = effects(PAGE);
  assert.ok(all.length >= 2, 'the page reads the chain and the link in effects');
  for (const effect of all) {
    for (const opens of ['signAndSendTransaction', 'signMessage', 'send(', 'create(', 'set(', 'switchNetwork(']) {
      assert.ok(!effect.includes(opens), `an effect calls ${opens}`);
    }
  }
});

test('the library opens no wallet', () => {
  for (const opens of ['signAndSendTransaction', 'signMessage', 'useNearWallet']) {
    assert.ok(!LIB.includes(opens), `lib/owner-exit.ts names ${opens}`);
  }
});

test('the wallet is asked in two places, each reached from a click', () => {
  // One transaction sender and one signature, and nothing else of the page reaches the wallet.
  assert.equal(PAGE.match(/await signAndSendTransaction\(/g)?.length, 1);
  assert.equal(PAGE.match(/await signMessage\(/g)?.length, 1);
  // Every use of the sender and of the signature is the body of an onClick, or a function
  // one is.
  const sends = [...PAGE.matchAll(/void send\(/g)].length;
  const clicks = [...PAGE.matchAll(/onClick=\{\(\) =>\s*void send\(/g)].length;
  assert.equal(sends - clicks, 1, 'a send outside an onClick, beyond the approvers form');
  assert.match(PAGE, /onClick=\{set\}/, 'the approvers form is not sent from its button');
  assert.match(PAGE, /onClick=\{\(\) => void create\(\)\}/, 'the wallet is not created from its button');
  assert.equal(PAGE.match(/\bcreate\(\)/g)?.length, 1, 'the signature is asked for somewhere else too');
  // No other spelling reaches the wallet: every mention of the two is the hook's
  // destructuring, the one awaited call, or the callback's dependency list.
  assert.equal(PAGE.match(/signAndSendTransaction/g)?.length, 3);
  assert.equal(PAGE.match(/signMessage/g)?.length, 2);
  // `send` is called from a click and from nowhere else: not from a `.then`, not bare.
  assert.equal(PAGE.match(/[^a-zA-Z_]send\(/g)?.length, sends, 'a send that is not `void send(` from a handler');
});

test('every button that sends says what it sends and what it costs', () => {
  for (const label of [
    /Register \$\{accountId\} in \$\{dao\} — \$\{formatNear\(config\.registrationFeeYocto\)\} NEAR/,
    /Start the exit of generation \$\{owner\.generation\} — \$\{formatNear\(config\.exitFeeYocto\)\} NEAR/,
    /Cancel the pending exit — 1 yoctoNEAR/,
    /the exit window \$\{drops \? 'at' : 'to'\} \$\{formatWindow\(chosen \?\? 0\)\} — 1 yoctoNEAR/,
    /Cancel the pending approver change — 1 yoctoNEAR/,
    /the exit approvers — 1 yoctoNEAR/,
    /Approve it as \$\{accountId\} — 1 yoctoNEAR/,
    /Reject it as \$\{accountId\} — 1 yoctoNEAR/,
    /Sign as \$\{accountId\} to create the wallet/,
  ]) {
    assert.match(PAGE, label);
  }
});

test('the key is not claimed on the site', () => {
  assert.ok(!PAGE.includes("'claim_escrow_key'") && !LIB.includes('claim_escrow_key'), 'the page calls claim_escrow_key');
  assert.ok(!/master_hex|open_escrow|one_time_key/.test(PAGE + LIB), 'the page handles the master');
  assert.match(PAGE, /customer-recovery owner-exit claim/);
});

test('an action is done when the chain shows it, not when the wallet returns', () => {
  const send = PAGE.slice(PAGE.indexOf('const send = useCallback('), PAGE.indexOf('return { accountId, network, dao'));
  const sent = send.indexOf('await signAndSendTransaction(');
  const failed = send.indexOf('sent?.status?.Failure');
  const reread = send.indexOf('await read(accountId)');
  const judged = send.indexOf('await landed(found.record)');
  assert.ok(sent !== -1 && sent < failed && failed < reread && reread < judged, 'the outcome is not read from the chain after the send');
  assert.ok(!/setOutcome\(\{ name, done: saidAfter \}\)/.test(send), 'a done that no read of the chain stands behind');
  // No action is judged done by a predicate that looks at nothing.
  assert.ok(!/\(\) => true|\(_?record\) => true/.test(PAGE), 'an action that is done whatever the chain shows');
  assert.equal(PAGE.match(/void send\(/g)?.length, 8, 'a new action: give it a predicate over the record and a row here');
});

test('the link flow says what the wallet is before its first button', () => {
  const flow = PAGE.slice(PAGE.indexOf('function FromLink('), PAGE.indexOf('function Status('));
  const notice = flow.indexOf('This is a new wallet at a new address');
  assert.ok(notice !== -1 && notice < flow.indexOf('<Button disabled={busy}'), 'the notice is missing or below the button');
  assert.match(flow, /Hyperliquid or Polymarket account belongs to the wallet it was opened from/);
  // Nothing a link says is drawn before OutLayer took the link: the table reads the answer.
  assert.ok(flow.indexOf('if (!prepared) {') < flow.indexOf('<table'), 'the link is shown before it is checked');
  assert.ok(!/\{link\.(seed|key_hash|expires_at)/.test(flow), "the link's own text is drawn");
  // A refused link says not to register for it; a registration OutLayer has not read yet
  // offers a read again, never a second payment.
  assert.match(PAGE, /Do not register for its sake: the registration fee is not returned/);
  assert.equal(flow.match(/<NoWalletFromThisLink \/>/g)?.length, 3, 'a refused link that does not warn against registering');
  // The person is told who holds the key before anything is offered, and the section
  // starts over when the account changes.
  assert.ok(flow.indexOf('Continue only if this link came from an agent you run or trust') < flow.indexOf('<table'));
  assert.match(PAGE, /<FromLink key=\{`\$\{exit\.accountId\}:\$\{token\}`\}/);
  assert.match(flow, /Nothing more is to be paid/);
  assert.equal(flow.match(/setAsked\(\(n\) => n \+ 1\)/g)?.length, 2, 'the link is read again from a click, in two places');
  // A link of another DAO is refused before anything is asked of the coordinator or the wallet.
  assert.ok(flow.indexOf('if (!linkNetwork)') < flow.indexOf('const create = async'));
});
