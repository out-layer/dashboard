/**
 * An account as a person reads it in a tight place. A named account is its own
 * short form. An implicit account — 64 hex characters, which is what an agent's
 * custody wallet is — says nothing past its first and last few, so that is what
 * is shown, marked as an agent; the whole of it belongs in a tooltip.
 */
export function isImplicitAccount(account: string): boolean {
  return /^[0-9a-f]{64}$/.test(account);
}

export function shortAccount(account: string): string {
  return isImplicitAccount(account) ? `${account.slice(0, 7)}…${account.slice(-7)}` : account;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * The implicit account of an ed25519 key — the 64 lowercase hex of its 32
 * bytes, the account an agent's custody wallet is. The contract and the
 * coordinator write a wallet's key `ed25519:<64 hex>`, which is the account
 * itself; a key written `ed25519:<base58>` is decoded. `null` for any other key.
 */
export function implicitAccountOf(publicKey: string): string | null {
  if (!publicKey.startsWith('ed25519:')) return null;
  const text = publicKey.slice('ed25519:'.length);
  if (/^[0-9a-fA-F]{64}$/.test(text)) return text.toLowerCase();
  const bytes: number[] = [];
  for (const char of text) {
    let carry = BASE58.indexOf(char);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== '1') break;
    bytes.push(0);
  }
  if (bytes.length !== 32) return null;
  return bytes
    .reverse()
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
