/**
 * A public key for a message a person reads. An ed25519 key fits on a line; an
 * ml-dsa-65 key is 2.6 KB of base58, and an error that carries it whole cannot
 * be read at all. The scheme, the start and the length are what tell one key
 * from another at a glance.
 */
export function shortKey(key: string): string {
  if (typeof key !== 'string') return String(key);
  return key.length <= 80 ? key : `${key.slice(0, 28)}… (${key.length} characters)`;
}
