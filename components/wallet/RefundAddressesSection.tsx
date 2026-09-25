'use client';

import { REFUND_CHAINS, RefundAddressRow, refundAddressProblem } from '@/lib/wallet-policy';

interface RefundAddressesSectionProps {
  rows: RefundAddressRow[];
  onChange: (rows: RefundAddressRow[]) => void;
}

/** What is wrong with one row, or `null`. A row nobody has started is not an error. */
function rowProblem(row: RefundAddressRow): string | null {
  if (!row.chain && !row.address.trim()) return null;
  if (!row.chain) return 'Choose the chain this address is on.';
  if (!row.address.trim()) return 'Enter an address, or remove the row.';
  return refundAddressProblem(row.chain, row.address);
}

/** Chains the wallet derives no address of its own on: a deposit from one is
 *  refused under a policy that does not list it. */
const NO_OWN_ADDRESS = REFUND_CHAINS.filter((c) => c.family === 'bitcoin' || c.family === 'other')
  .map((c) => c.label)
  .join(', ');

export function RefundAddressesSection({ rows, onChange }: RefundAddressesSectionProps) {
  const setRow = (i: number, patch: Partial<RefundAddressRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const addRow = () => onChange([...rows, { chain: '', address: '' }]);

  return (
 <div className="border border-border rounded-lg p-4">
 <h3 className="text-sm font-semibold text-foreground mb-1">Refund Addresses (cross-chain deposits)</h3>
 <p className="text-xs text-muted-foreground mb-2">
        A failed cross-chain deposit is refunded to the address listed here for its source chain; a
        chain not listed refunds to this wallet&apos;s own address on it. While the wallet has a
        policy, the agent cannot pick a refund address of its own.
      </p>
 <p className="text-xs text-faint-foreground mb-2">
        The wallet has no address of its own on {NO_OWN_ADDRESS}: a deposit from one of these is
        refused until the chain is listed here.
      </p>
 <p className="text-xs text-destructive-text mb-3">
         Each address must be yours ON THE CHAIN NEXT TO IT. The format check cannot tell networks
        apart — every EVM chain shares one address format — and a refund sent to an address on the
        wrong network cannot be recovered.
      </p>

      {rows.length > 0 && (
 <div className="space-y-2 mb-2">
          {rows.map((row, i) => {
            const usedElsewhere = new Set(rows.filter((_, j) => j !== i).map((r) => r.chain));
            // A stored chain this build does not list stays selectable, so the
            // row is shown (and saved) as written instead of being blanked.
            const unknown = row.chain && !REFUND_CHAINS.some((c) => c.id === row.chain);
            const problem = rowProblem(row);
            return (
              <div key={i}>
 <div className="flex gap-2">
                  <select
                    value={row.chain}
                    onChange={(e) => setRow(i, { chain: e.target.value })}
                    aria-label="Chain"
 className="w-44 shrink-0 rounded border border-border-strong bg-card px-2 py-2 text-sm"
                  >
                    <option value="">Chain…</option>
                    {unknown && <option value={row.chain}>{row.chain}</option>}
                    {REFUND_CHAINS.map((c) => (
                      <option key={c.id} value={c.id} disabled={usedElsewhere.has(c.id)}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.address}
                    onChange={(e) => setRow(i, { address: e.target.value })}
                    placeholder="Address on that chain"
                    aria-label="Refund address"
                    spellCheck={false}
 className="min-w-0 flex-1 border border-border-strong rounded px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
 className="shrink-0 px-3 py-1.5 text-xs rounded border border-border-strong bg-card text-foreground hover:bg-card-muted"
                  >
                    Remove
                  </button>
                </div>
                {problem && (
 <p className="text-xs text-destructive-text mt-1">{problem}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= REFUND_CHAINS.length}
 className="px-3 py-1.5 text-xs rounded border border-border-strong bg-card text-foreground hover:bg-card-muted disabled:opacity-50"
      >
        + Add refund address
      </button>
    </div>
  );
}
