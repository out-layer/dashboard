/**
 * The key a secrets row is sealed to, asked of the keystore.
 *
 * The request is not sealed — it is what the key is asked with — so it carries
 * the NAMES the row will hold and no value: the keystore refuses a reserved
 * name or a `PROTECTED_` one and reads nothing else.
 */

/** The accessor as the coordinator takes it (internally tagged). */
export type PubkeyAccessor =
  | { type: 'Project'; project_id: string }
  | { type: 'WasmHash'; hash: string }
  | { type: 'System'; PaymentKey: Record<string, never> };

export interface PubkeyRequest {
  accessor: PubkeyAccessor;
  owner: string;
  /** A payment key's nonce; a secrets row's profile is not part of its key. */
  profile?: string;
  /** Derives the key from this vault's master instead of the default one. */
  vaultId?: string | null;
}

export interface PubkeyAnswer {
  /** X25519 public key, hex. */
  pubkey: string;
}

export async function fetchKeystorePubkey(
  coordinatorUrl: string,
  request: PubkeyRequest,
  secretNames: string[],
): Promise<PubkeyAnswer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (request.vaultId) headers['X-Customer-Vault'] = request.vaultId;
  const response = await fetch(`${coordinatorUrl}/secrets/pubkey`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      accessor: request.accessor,
      owner: request.owner,
      ...(request.profile ? { profile: request.profile } : {}),
      secrets_json: JSON.stringify(Object.fromEntries(secretNames.map((name) => [name, '']))),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // The keystore's own refusals are plain text.
    }
    throw new Error(message);
  }
  return (await response.json()) as PubkeyAnswer;
}
