'use client';

import { useState } from 'react';
import AttestationView from '@/components/AttestationView';
import type { AttestationResponse, JobHistoryEntry } from '@/lib/api';
import type { NetworkType } from '@/contexts/NearWalletContext';

/**
 * The attestation of one run, in a popup: the screen `/attestation/<job>`
 * shows, over whatever page opened it. The Executions table opens it for a
 * job, the inbox for the run that made a task — with what the inbox checked of
 * the task against it, above the attestation.
 */
export default function AttestationModal({
  jobId,
  isHttpsCall,
  attestation,
  job = null,
  loading = false,
  error = null,
  network,
  knownInput,
  knownOutput,
  checks,
  onClose,
}: {
  jobId: number | null;
  isHttpsCall: boolean;
  attestation: AttestationResponse | null;
  job?: JobHistoryEntry | null;
  loading?: boolean;
  error?: string | null;
  network: NetworkType;
  /** What the run was asked, when the opener holds it: the view checks it against the attested `input_hash`. */
  knownInput?: string;
  /** What the run answered, when the opener holds it: the view checks it against the attested hash. */
  knownOutput?: string;
  /** What the opener checked against this attestation, step by step: shown above it. */
  checks?: Array<{ ok: boolean | null; said: string }>;
  onClose: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">
                TEE Attestation - {isHttpsCall ? 'HTTPS' : 'NEAR'} Job{jobId === null ? '' : ` #${jobId}`}
              </h2>
              <span
                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 border ${
                  isHttpsCall ? 'border-border-strong text-muted-foreground' : 'border-success/40 text-success-text'
                }`}
              >
                {isHttpsCall ? 'HTTPS' : 'NEAR'}
              </span>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-faint-foreground hover:text-foreground">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 mb-4">
              <p className="text-sm text-destructive-text">{error}</p>
            </div>
          )}

          {checks && checks.length > 0 && (
            <section className="mb-4 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">What the inbox checked of the task</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                {checks.map((check, at) => (
                  <li key={at}>
                    <span className={check.ok === true ? 'text-success-text' : check.ok === false ? 'text-destructive-text' : 'text-foreground'}>
                      {check.ok === true ? 'Holds. ' : check.ok === false ? 'Does not hold. ' : 'Not checked. '}
                    </span>
                    {check.said}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {attestation && (
            <AttestationView
              attestation={attestation}
              initialJob={job}
              network={network}
              showHelp={showHelp}
              onToggleHelp={() => setShowHelp(!showHelp)}
              isModal={true}
              knownInput={knownInput}
              knownOutput={knownOutput}
            />
          )}
        </div>
      </div>
    </div>
  );
}
