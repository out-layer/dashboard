// The wallets page opens the wallet for freeze, unfreeze and the removal of a
// policy only from the button of the dialog that said what follows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/wallet/manage/page.tsx', import.meta.url), 'utf8');

test('freeze, unfreeze and removal run from the dialog\'s confirmation alone', () => {
  for (const handler of ['handleFreeze', 'handleUnfreeze', 'handleRemovePolicy']) {
    const calls = [...page.matchAll(new RegExp(`await ${handler}\\(`, 'g'))].length;
    const anywhere = [...page.matchAll(new RegExp(`(?<!const )${handler}\\(`, 'g'))].length;
    assert.equal(calls, 1, `${handler} is awaited once`);
    assert.equal(anywhere, 1, `${handler} is called nowhere but confirmAction`);
  }
  const confirm = page.slice(page.indexOf('const confirmAction = async () => {'), page.indexOf('/** Get the API key for a wallet'));
  assert.match(confirm, /await handleRemovePolicy\(walletPubkey\)/);
  assert.match(page, /onConfirm=\{\(\) => void confirmAction\(\)\}/);
  // The removal says that the registration key works again, before anything is signed.
  assert.match(page, /the key the wallet was registered with works again/);
  assert.match(page, /'delete_wallet_policy'/);
});
