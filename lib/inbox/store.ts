/**
 * What an owner's session leaves in this browser, per network and account.
 *
 * Two things, kept apart on purpose:
 *
 * - the device's key pair, in IndexedDB as the `CryptoKey` itself. It was
 *   made non-extractable, so what is stored is a handle the browser will use
 *   for this origin and will not give out — not key bytes. This is what
 *   reads a task.
 * - the session's token, in localStorage. It lists tasks and rejects or
 *   deletes them; it reads nothing and acts on nothing. It is removed on
 *   sign-out, when the API says the session ended, and past its deadline.
 *
 * Neither is a credential of a service or a wallet key: those never reach
 * storage here.
 */

import type { Device } from './crypto';

export type StoredSession = {
  token: string;
  deviceId: string;
  accountId: string;
  /** Unix seconds. */
  validUntil: number;
};

const DB = 'outlayer-inbox';
const DEVICES = 'devices';

const sessionKey = (network: string, account: string) => `outlayer:inbox-session:${network}:${account}`;
const deviceKey = (network: string, account: string, deviceId: string) => `${network}:${account}:${deviceId}`;

export function loadSession(network: string, account: string, now: number = Date.now() / 1000): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(network, account));
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<StoredSession>;
    const whole =
      typeof session.token === 'string' &&
      typeof session.deviceId === 'string' &&
      session.accountId === account &&
      typeof session.validUntil === 'number';
    if (!whole || (session.validUntil as number) <= now) {
      localStorage.removeItem(sessionKey(network, account));
      return null;
    }
    return session as StoredSession;
  } catch {
    // What is kept and cannot be read is no session, and is not kept.
    clearSession(network, account);
    return null;
  }
}

export function saveSession(network: string, session: StoredSession): void {
  localStorage.setItem(sessionKey(network, session.accountId), JSON.stringify(session));
}

export function clearSession(network: string, account: string): void {
  try {
    localStorage.removeItem(sessionKey(network, account));
  } catch {
    /* storage unavailable */
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DEVICES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('this browser gave no storage for the device key'));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(DEVICES, mode);
        const request = work(tx.objectStore(DEVICES));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('the device key could not be stored'));
        };
      }),
  );
}

export function saveDevice(network: string, account: string, deviceId: string, device: Device): Promise<unknown> {
  return run('readwrite', (store) =>
    store.put({ privateKey: device.privateKey, point: device.point, pubkey: device.pubkey }, deviceKey(network, account, deviceId)),
  );
}

export async function loadDevice(network: string, account: string, deviceId: string): Promise<Device | null> {
  const found = await run<Partial<Device> | undefined>('readonly', (store) => store.get(deviceKey(network, account, deviceId)));
  if (!found || !(found.privateKey instanceof CryptoKey) || !(found.point instanceof Uint8Array) || typeof found.pubkey !== 'string') {
    return null;
  }
  return { privateKey: found.privateKey, point: found.point, pubkey: found.pubkey };
}

export function deleteDevice(network: string, account: string, deviceId: string): Promise<unknown> {
  return run('readwrite', (store) => store.delete(deviceKey(network, account, deviceId)));
}
