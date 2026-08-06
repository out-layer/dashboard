/**
 * Where a worker's TEE attestation can be independently verified.
 * Routing convention: Phala-hosted workers carry "phala" in their name/id and
 * verify on that host's explorer; self-hosted TDX workers verify on our own
 * attestation portal (workers.outlayer.ai/app/<app_id>).
 */
export function attestationUrlFor(workerId: string, workerName = ''): string | null {
  const parts = workerId.split('-');
  const network = parts[0];
  const workerType = parts[1];
  const appId = parts.length >= 3 ? parts.slice(2).join('-') : null;
  const hasAppId = appId && /^[a-f0-9]{40}$/i.test(appId);
  const isPhala = /phala/i.test(workerId) || /phala/i.test(workerName);

  if (hasAppId) {
    return isPhala
      ? `https://trust.phala.com/app/${appId}?selected=app-code`
      : `https://workers.outlayer.ai/app/${appId}`;
  }
  if (workerType === 'keystore' && (network === 'testnet' || network === 'mainnet')) {
    // Keystore rows are synthesized by the coordinator without an app_id suffix
    // (one keystore per network). The portal resolves the current keystore for
    // the network and redirects to its attestation page.
    return `https://workers.outlayer.ai/${network}-keystore`;
  }
  return null;
}
