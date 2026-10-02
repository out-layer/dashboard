// The session's token as this browser keeps it, with `localStorage` replaced
// by a store in memory.

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSession, loadSession, saveSession } from '../lib/inbox/store.ts';

const NOW = 1790000000;
const session = (over = {}) => ({
  token: 'session-token-of-the-test',
  deviceId: 'device-1',
  accountId: 'owner.near',
  validUntil: NOW + 3600,
  ...over,
});

function memory() {
  const kept = new Map();
  return {
    kept,
    getItem: (key) => (kept.has(key) ? kept.get(key) : null),
    setItem: (key, value) => void kept.set(key, String(value)),
    removeItem: (key) => void kept.delete(key),
  };
}

/** Run `work` with `localStorage` replaced by `storage`. */
function within(storage, work) {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try {
    return work(storage);
  } finally {
    if (real) Object.defineProperty(globalThis, 'localStorage', real);
    else delete globalThis.localStorage;
  }
}

/** The key the session of `account` on `network` is kept under. */
function keyOf(network, account) {
  return within(memory(), (storage) => {
    saveSession(network, session({ accountId: account }));
    assert.equal(storage.kept.size, 1);
    return [...storage.kept.keys()][0];
  });
}

test('a session saved is the session loaded', () => {
  within(memory(), (storage) => {
    saveSession('testnet', session());
    assert.equal(storage.kept.size, 1);
    assert.deepEqual(loadSession('testnet', 'owner.near', NOW), session());
    assert.deepEqual(loadSession('testnet', 'owner.near', NOW), session(), 'reading it does not remove it');
    assert.equal(storage.kept.size, 1);
  });
});

test('a session is kept per network and per account', () => {
  within(memory(), (storage) => {
    saveSession('testnet', session({ token: 'a' }));
    saveSession('mainnet', session({ token: 'b' }));
    saveSession('testnet', session({ token: 'c', accountId: 'other.near' }));
    assert.equal(storage.kept.size, 3);
    assert.equal(loadSession('testnet', 'owner.near', NOW).token, 'a');
    assert.equal(loadSession('mainnet', 'owner.near', NOW).token, 'b');
    assert.equal(loadSession('testnet', 'other.near', NOW).token, 'c');
    assert.equal(loadSession('mainnet', 'other.near', NOW), null);
    saveSession('testnet', session({ token: 'd' }));
    assert.equal(storage.kept.size, 3, 'a later session of the account takes the place of the earlier one');
    assert.equal(loadSession('testnet', 'owner.near', NOW).token, 'd');
  });
});

test('a session past its deadline is removed and not returned', () => {
  for (const validUntil of [NOW - 1, NOW, 0, -1]) {
    within(memory(), (storage) => {
      saveSession('testnet', session({ validUntil }));
      assert.equal(loadSession('testnet', 'owner.near', NOW), null, String(validUntil));
      assert.equal(storage.kept.size, 0, String(validUntil));
    });
  }
  within(memory(), (storage) => {
    saveSession('testnet', session({ validUntil: NOW + 1 }));
    assert.deepEqual(loadSession('testnet', 'owner.near', NOW), session({ validUntil: NOW + 1 }));
    assert.equal(storage.kept.size, 1);
  });
});

test('the deadline is held to the clock when no moment is given', () => {
  within(memory(), (storage) => {
    saveSession('testnet', session({ validUntil: Math.floor(Date.now() / 1000) - 60 }));
    assert.equal(loadSession('testnet', 'owner.near'), null);
    assert.equal(storage.kept.size, 0);
    saveSession('testnet', session({ validUntil: Math.floor(Date.now() / 1000) + 60 }));
    assert.equal(loadSession('testnet', 'owner.near').token, session().token);
  });
});

test('a session of another account is not returned', () => {
  within(memory(), () => {
    saveSession('testnet', session({ accountId: 'other.near' }));
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    assert.equal(loadSession('testnet', 'other.near', NOW).accountId, 'other.near');
  });
  // One that names another account, under this account's key.
  const key = keyOf('testnet', 'owner.near');
  within(memory(), (storage) => {
    storage.setItem(key, JSON.stringify(session({ accountId: 'other.near' })));
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    assert.equal(storage.kept.size, 0, 'and it is removed');
  });
});

test('a session that is not whole is removed and not returned', () => {
  const key = keyOf('testnet', 'owner.near');
  const { token: _t, ...noToken } = session();
  const { deviceId: _d, ...noDevice } = session();
  const { validUntil: _v, ...noDeadline } = session();
  const { accountId: _a, ...noAccount } = session();
  for (const broken of [
    noToken, noDevice, noDeadline, noAccount, {}, [],
    session({ token: 7 }), session({ token: null }), session({ deviceId: 7 }),
    session({ validUntil: String(NOW + 3600) }), session({ validUntil: null }), session({ validUntil: NaN }),
  ]) {
    within(memory(), (storage) => {
      storage.setItem(key, JSON.stringify(broken));
      assert.equal(loadSession('testnet', 'owner.near', NOW), null, JSON.stringify(broken));
      assert.equal(storage.kept.size, 0, JSON.stringify(broken));
    });
  }
});

test('what is kept and is not JSON is no session, and reading it does not throw', () => {
  const key = keyOf('testnet', 'owner.near');
  for (const raw of ['not json', '{', '{"token":', 'undefined', 'null', '7', '"text"', ' ']) {
    within(memory(), (storage) => {
      storage.setItem(key, raw);
      assert.doesNotThrow(() => loadSession('testnet', 'owner.near', NOW), raw);
      assert.equal(loadSession('testnet', 'owner.near', NOW), null, raw);
    });
  }
});

test('nothing kept is no session', () => {
  within(memory(), (storage) => {
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    storage.setItem(keyOf('testnet', 'owner.near'), '');
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
  });
});

test('a session cleared is gone, and the others stay', () => {
  within(memory(), (storage) => {
    saveSession('testnet', session());
    saveSession('mainnet', session());
    saveSession('testnet', session({ accountId: 'other.near' }));
    clearSession('testnet', 'owner.near');
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    assert.equal(storage.kept.size, 2);
    assert.notEqual(loadSession('mainnet', 'owner.near', NOW), null);
    assert.notEqual(loadSession('testnet', 'other.near', NOW), null);
    assert.doesNotThrow(() => clearSession('testnet', 'owner.near'), 'clearing what is not there');
  });
});

test('a session cleared by its token goes only while it is the one kept', () => {
  within(memory(), () => {
    saveSession('testnet', session({ token: 'new' }));
    clearSession('testnet', 'owner.near', 'old');
    assert.equal(loadSession('testnet', 'owner.near', NOW)?.token, 'new', 'another tab signed in since: its session stays');
    clearSession('testnet', 'owner.near', 'new');
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    assert.doesNotThrow(() => clearSession('testnet', 'owner.near', 'new'), 'clearing what is not there');
  });
});

test('a browser that gives no storage has no session, and says so without throwing', () => {
  const refuses = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  within({ getItem: refuses, setItem: refuses, removeItem: refuses }, () => {
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
    assert.doesNotThrow(() => clearSession('testnet', 'owner.near'));
  });
  // A session that cannot be removed is still not returned.
  const key = keyOf('testnet', 'owner.near');
  const stuck = memory();
  stuck.setItem(key, JSON.stringify(session({ validUntil: NOW - 1 })));
  within({ ...stuck, removeItem: refuses }, () => {
    assert.equal(loadSession('testnet', 'owner.near', NOW), null);
  });
});

test('what is kept of a session is its token, its device, its account and its deadline', () => {
  within(memory(), (storage) => {
    saveSession('testnet', session());
    const [[key, raw]] = [...storage.kept.entries()];
    assert.deepEqual(JSON.parse(raw), session());
    assert.ok(key.includes('testnet') && key.includes('owner.near'));
    assert.ok(!key.includes(session().token), 'the key it is kept under holds nothing of the token');
  });
});
