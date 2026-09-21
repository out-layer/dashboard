/**
 * What an approver is shown, checked against what an approver signs.
 *
 * An approval vote signs `request_hash`. The coordinator sends the hash, and the
 * operation it says the hash is of — and the keystore, inside the TEE, will
 * execute whatever operation that hash really belongs to. So before anyone
 * signs, the browser hashes the operation itself and compares.
 *
 * It hashes the EXACT canonical string the coordinator sent (`op_canonical`)
 * rather than re-canonicalising a parsed object: the page displays the parse of
 * that same string, so what is displayed and what is hashed are one thing by
 * construction, and no second implementation of the canonical form exists here
 * to drift from the keystore's.
 */

export type OpCheck =
  /** sha256(op_canonical) is `request_hash`: the operation shown is the one signed. */
  | { status: 'match'; op: Record<string, unknown> }
  /** It is not. Nothing may be signed. */
  | { status: 'mismatch' }
  /** A row from before the canonical op was stored: there is nothing to check. */
  | { status: 'absent' };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkOpAgainstHash(
  opCanonical: string | null | undefined,
  requestHash: string,
): Promise<OpCheck> {
  if (opCanonical === null || opCanonical === undefined) return { status: 'absent' };
  if ((await sha256Hex(opCanonical)) !== requestHash.toLowerCase()) return { status: 'mismatch' };
  let op: unknown;
  try {
    op = JSON.parse(opCanonical);
  } catch {
    return { status: 'mismatch' };
  }
  if (typeof op !== 'object' || op === null || Array.isArray(op)) return { status: 'mismatch' };
  return { status: 'match', op: op as Record<string, unknown> };
}
