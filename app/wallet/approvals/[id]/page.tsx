'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { getCoordinatorApiUrl } from '@/lib/api';
import { useNearWallet } from '@/contexts/NearWalletContext';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface ApprovalDetail {
  id: string;
  wallet_id: string;
  request_type: string;
  /** Canonical op the keystore will sign — rendered as-is from the API (null for legacy rows). */
  op: Record<string, unknown> | null;
  request_data: Record<string, unknown>;
  request_hash: string;
  /** Wallet's on-chain pubkey, bound into the vote message to prevent cross-wallet replay. */
  wallet_pubkey: string;
  required_approvals: number;
  status: string;
  expires_at: string;
  created_at: string;
  approvers: { approver_id: string; approver_role: string; signature: string; created_at: string }[];
}

export default function ApprovalDetailPage() {
  return (
    <Suspense fallback={<div className="w-full py-8 text-faint-foreground">Loading...</div>}>
      <ApprovalDetailContent />
    </Suspense>
  );
}

function ApprovalDetailContent() {
  const params = useParams();
  const router = useRouter();
  const approvalId = params.id as string;

  const { network, contractId, signMessage, isConnected } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [approval, setApproval] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadApproval = useCallback(async () => {
    if (!approvalId) return;
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(
        `${coordinatorUrl}/wallet/v1/approval/${encodeURIComponent(approvalId)}`
      );
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load approval: ${resp.status}`);
      }
      const data = await resp.json();
      setApproval(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [approvalId, coordinatorUrl]);

  useEffect(() => {
    loadApproval();
  }, [loadApproval]);

  // Dumb voting: the API supplies `request_hash`; the dashboard only signs the fixed
  // `{vote}:{approval_id}:{request_hash}` string and posts it. No local policy/canonical/
  // hash logic — the keystore re-derives and verifies the hash itself.
  const handleVote = async (vote: 'approve' | 'reject') => {
    if (!approval) return;

    if (!isConnected) {
      setError(`Connect your NEAR wallet to ${vote}.`);
      return;
    }

    setVoting(vote);
    setError(null);

    try {
      // Generate 32-byte random nonce
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonceBase64 = Buffer.from(nonceBytes).toString('base64');

      // Build message: "{vote}:{approval_id}:{wallet_pubkey}:{request_hash}" (all from the API).
      // wallet_pubkey binds the vote to THIS wallet (no cross-wallet replay).
      const message = `${vote}:${approval.id}:${approval.wallet_pubkey}:${approval.request_hash}`;

      // Sign with NEAR wallet (NEP-413)
      const signed = await signMessage({
        message,
        recipient: contractId,
        nonce: nonceBase64,
      });

      if (!signed) {
        throw new Error('Signature cancelled');
      }

      const resp = await fetch(
        `${coordinatorUrl}/wallet/v1/${vote}/${approval.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature: signed.signature,
            public_key: signed.publicKey,
            account_id: signed.accountId,
            nonce: nonceBase64,
          }),
        }
      );

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `${vote} failed: ${resp.status}`);
      }

      const result = await resp.json();
      if (vote === 'reject') {
        setSuccess('Rejection vote submitted.');
        setTimeout(() => loadApproval(), 2000);
        return;
      }
      if (result.request_id) {
        // Threshold met — redirect to audit page
        router.push('/wallet/audit');
        return;
      } else {
        setSuccess(`Approved (${result.approved}/${result.required}). Waiting for more approvals.`);
      }

      setTimeout(() => loadApproval(), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVoting(null);
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
  const isExpired = approval ? new Date(approval.expires_at) < new Date() : false;
  const backUrl = '/wallet/approvals';

  return (
    <div className="w-full">
      <div className="flex items-center space-x-3 mb-6">
        <Link href={backUrl} className="text-accent-text hover:text-accent-text">
          &larr; Back to Approvals
        </Link>
      </div>

      <h1 className="text-xl font-bold tracking-tight mb-6">Approval Details</h1>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-md p-3">
          <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-success/10 border border-success/30 rounded-md p-3">
          <p className="text-sm text-success-text">{success}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-accent-text" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-muted-foreground">Loading...</span>
        </div>
      ) : !approval ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">Approval not found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status card */}
          <div className="bg-card border border-border rounded-lg p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  approval.status === 'pending' ? 'bg-warning/10 text-warning' :
                  approval.status === 'approved' ? 'bg-success/10 text-success-text' :
                  approval.status === 'expired' ? 'bg-card-muted text-foreground' :
                  'bg-destructive/10 text-destructive-text'
                }`}>
                  {approval.status.toUpperCase()}
                </span>
                <span className="text-sm text-muted-foreground">{approval.request_type}</span>
              </div>
              <span className="text-sm text-faint-foreground">
                {approval.approvers?.length || 0} / {approval.required_approvals} approved
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Wallet</p>
                <p className="font-mono text-foreground text-xs break-all">{approval.wallet_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Request Hash</p>
                <p className="font-mono text-foreground text-xs break-all">{approval.request_hash}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="text-foreground">{formatDate(approval.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expires</p>
                <p className={`${isExpired ? 'text-destructive-text' : 'text-foreground'}`}>
                  {formatDate(approval.expires_at)}
                  {isExpired && ' (EXPIRED)'}
                </p>
              </div>
            </div>
          </div>

          {/* Canonical op — what the keystore will actually sign. The signature you
              produce below covers request_hash = sha256(canonical_json(op)). */}
          <div className="bg-card border border-border rounded-lg p-6 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">Operation</h2>
            <pre className="bg-card-muted rounded p-4 text-sm text-foreground overflow-x-auto">
              {JSON.stringify(approval.op ?? approval.request_data, null, 2)}
            </pre>
            {!approval.op && (
              <p className="text-xs text-faint-foreground mt-2">
                Legacy request (no canonical op stored) — showing request data.
              </p>
            )}
          </div>

          {/* Existing approvers */}
          {approval.approvers && approval.approvers.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-3">Approvers</h2>
              <div className="space-y-2">
                {approval.approvers.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-success/10 rounded p-3">
                    <div>
                      <p className="text-sm font-mono text-foreground">{a.approver_id}</p>
                      <p className="text-xs text-muted-foreground">Role: {a.approver_role}</p>
                    </div>
                    <p className="text-xs text-faint-foreground">{formatDate(a.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approve / Reject buttons */}
          {approval.status === 'pending' && !isExpired && (
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => router.push(backUrl)}
                className="px-6 py-3 border border-border-strong text-foreground rounded-lg font-medium hover:bg-card-muted"
              >
                Back
              </button>
              <button
                onClick={() => handleVote('reject')}
                disabled={voting !== null || !isConnected}
                className="px-6 py-3 border border-destructive/40 text-destructive-text rounded-lg font-medium hover:bg-destructive/10 disabled:opacity-50"
              >
                {voting === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
              <button
                onClick={() => handleVote('approve')}
                disabled={voting !== null || !isConnected}
                className="px-6 py-3 bg-accent text-white rounded-lg font-medium disabled:opacity-50"
              >
                {voting === 'approve' ? 'Approving...' : 'Approve'}
              </button>
            </div>
          )}

          {!isConnected && approval.status === 'pending' && (
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
              <p className="text-sm text-warning">
                Connect your NEAR wallet to approve this request.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
