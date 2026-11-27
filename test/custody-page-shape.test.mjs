// The shape of the /wallet/custody page, read as text: the owner's wallet is asked for a
// signature or a transaction only from a click, and the library that builds the actions
// opens no wallet.
//
// These hold the source to a shape. They do not render it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
/** The source without its comments. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w\\/])\/\/.*$/gm, '');
const PAGE = code('app/wallet/custody/page.tsx');
const LIB = code('lib/wallet-contract.ts');

/** The steps that reach a wallet or send a transaction, each a function of the page. */
const STEPS = ['deriveKey', 'createWallet'];

/** The page's own work after the owner's transaction: no wallet, called from createWallet alone. */
const FOLLOWERS = ['install', 'handOver'];

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

test('nothing is signed or sent from an effect', () => {
  const all = effects(PAGE);
  assert.ok(all.length >= 1, 'the page reads the setup in an effect');
  for (const effect of all) {
    for (const opens of ['signAndSendTransaction', 'signMessage', 'sendAsAccount', ...STEPS.map((s) => `${s}(`)]) {
      assert.ok(!effect.includes(opens), `an effect calls ${opens}`);
    }
  }
});

test('the library opens no wallet', () => {
  for (const opens of ['signAndSendTransaction', 'signMessage', 'useNearWallet']) {
    assert.ok(!LIB.includes(opens), `lib/wallet-contract.ts names ${opens}`);
  }
});

test('the wallet is asked once for a signature and once for a transaction', () => {
  assert.equal(PAGE.match(/await signMessage\(/g)?.length, 1);
  assert.equal(PAGE.match(/await signAndSendTransaction\(/g)?.length, 1);
  assert.equal(PAGE.match(/await sendAsAccount\(/g)?.length, 1, 'the installing transaction is sent in one place');
});

test('each step is the handler of one button and is called from nowhere else', () => {
  for (const step of STEPS) {
    assert.equal(PAGE.match(new RegExp(`onClick=\\{${step}\\}`, 'g'))?.length, 1, `${step} is not one button's handler`);
    // Its declaration and its button: no call from a promise chain, a timer or another step.
    assert.equal(PAGE.match(new RegExp(`\\b${step}\\(`, 'g')), null, `${step} is called outside its button`);
  }
});

test("the page's own work follows the owner's transaction inside one step, and opens no wallet", () => {
  const body = (name) => {
    const at = PAGE.indexOf(`const ${name} = `);
    assert.ok(at >= 0, `${name} is declared`);
    const next = PAGE.indexOf('\n  const ', at + 1);
    return PAGE.slice(at, next === -1 ? undefined : next);
  };
  for (const follower of FOLLOWERS) {
    for (const opens of ['signAndSendTransaction', 'signMessage']) {
      assert.ok(!body(follower).includes(opens), `${follower} opens a wallet`);
    }
    const calls = PAGE.match(new RegExp(`\\b${follower}\\(`, 'g'))?.length ?? 0;
    const inCreate = body('createWallet').match(new RegExp(`\\b${follower}\\(`, 'g'))?.length ?? 0;
    assert.equal(calls, inCreate, `${follower} is called outside createWallet`);
    assert.ok(inCreate >= 1, `${follower} is not called from createWallet`);
  }
  assert.ok(body('createWallet').indexOf('signAndSendTransaction') < body('createWallet').indexOf('install('), 'the wallet first');
});

test("step 2 opens the wallet before it waits on anything", () => {
  const at = PAGE.indexOf('const createWallet = ');
  const body = PAGE.slice(at, PAGE.indexOf('signAndSendTransaction', at)).replace(/await\s*$/, '');
  assert.ok(!/\bawait\b/.test(body), 'an await precedes the wallet in createWallet: the click would lose its activation');
});

