'use client';

import { useMemo, useState } from 'react';
import {
  LIMIT_WINDOWS,
  NATIVE_TOKEN_KEY,
  decimalFromUnits,
  unitsFromDecimal,
  type LimitWindow,
  type TokenLimitRow,
} from '@/lib/wallet-policy';

/** A token of the wallet's catalog, under the key the policy limits it by. */
export interface PolicyToken {
  /** `nep141:<contract>` / `nep245:<contract>:<id>` — the asset's id on intents.near. */
  key: string;
  symbol: string;
  /** The chain the asset comes from; the same symbol from two chains is two tokens. */
  chain: string;
  decimals: number;
}

const WINDOW_LABELS: Record<LimitWindow, string> = {
  per_transaction: 'Per transaction',
  hourly: 'Hourly',
  daily: 'Daily',
  monthly: 'Monthly',
};

const WILDCARD = '*';

/**
 * A limit typed as a decimal amount and stored in minimal units.
 */
function AmountInput({
  units,
  decimals,
  onChange,
  label,
}: {
  units: string;
  decimals: number;
  onChange: (units: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // The typed text stands while it still says `units`, or says nothing readable
  // yet; a value that arrived from outside is shown in its own spelling.
  const draftUnits = draft === null ? undefined : unitsFromDecimal(draft, decimals);
  const text = draft !== null && (draftUnits === units || draftUnits === null) ? draft : decimalFromUnits(units, decimals);
  const invalid = draftUnits === null && text === draft;
  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid}
        value={text}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = unitsFromDecimal(e.target.value, decimals);
          if (next !== null) onChange(next);
        }}
        placeholder="no limit"
        className={`w-full border rounded px-3 py-2 text-sm ${invalid ? 'border-destructive' : 'border-border-strong'}`}
      />
      {invalid && (
        <p className="text-xs text-destructive-text mt-1">
          A number with at most {decimals} decimal place{decimals === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}

/**
 * Limits of the tokens other than native NEAR: one row per token, each with
 * its own four windows. `tokens` is the wallet's catalog, `null` while it is
 * unread — a row whose token the catalog does not name is edited in minimal
 * units and says so.
 */
export function TokenLimitsSection({
  rows,
  onChange,
  tokens,
}: {
  rows: TokenLimitRow[];
  onChange: (rows: TokenLimitRow[]) => void;
  tokens: PolicyToken[] | null;
}) {
  const [query, setQuery] = useState('');
  const byKey = useMemo(() => new Map((tokens ?? []).map((t) => [t.key, t])), [tokens]);
  const taken = new Set(rows.map((r) => r.token));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (tokens ?? [])
      .filter((t) => !taken.has(t.key))
      .filter((t) => `${t.symbol} ${t.chain} ${t.key}`.toLowerCase().includes(q))
      .slice(0, 8);
    // `taken` is derived from `rows`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tokens, rows]);

  const add = (token: string) => {
    onChange([...rows, { token, per_transaction: '', hourly: '', daily: '', monthly: '' }]);
    setQuery('');
  };
  const setRow = (index: number, patch: Partial<TokenLimitRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const typedKey = query.trim();
  const typedIsKey =
    (typedKey.startsWith('nep141:') || typedKey.startsWith('nep245:')) && !taken.has(typedKey) && !byKey.has(typedKey);

  return (
    <div>
      <div className="space-y-3">
        {rows.map((row, index) => {
          const known = byKey.get(row.token);
          const wildcard = row.token === WILDCARD;
          const decimals = known ? known.decimals : 0;
          return (
            <div key={row.token || index} className="border border-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {wildcard ? 'Every other token' : known ? `${known.symbol} · ${known.chain}` : 'Token'}
                  </p>
                  {!wildcard && <p className="text-xs font-mono text-faint-foreground break-all">{row.token}</p>}
                  {!known && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {wildcard
                        ? 'Applies to any token without a row, native NEAR included when its fields are empty. In each token’s own minimal units.'
                        : tokens === null
                          ? 'In minimal units until the token list is read.'
                          : 'Not in the token list: in the token’s minimal units.'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="text-xs text-muted-foreground hover:text-destructive-text shrink-0"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {LIMIT_WINDOWS.map((w) => (
                  <div key={w}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{WINDOW_LABELS[w]}</label>
                    <AmountInput
                      label={`${WINDOW_LABELS[w]} limit of ${known ? known.symbol : row.token}`}
                      units={row[w]}
                      decimals={decimals}
                      onChange={(units) => setRow(index, { [w]: units })}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Add a token</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tokens === null ? 'nep141:… (the token list is not read yet)' : 'Search: USDC, solana, nep141:…'}
          className="w-full border border-border-strong rounded px-3 py-2 text-sm"
        />
        {(matches.length > 0 || typedIsKey) && (
          <div className="mt-1 border border-border rounded divide-y divide-border">
            {matches.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => add(t.key)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-card-muted"
              >
                <span className="font-medium text-foreground">{t.symbol}</span>
                <span className="text-muted-foreground"> · {t.chain}</span>
                <span className="block text-xs font-mono text-faint-foreground break-all">{t.key}</span>
              </button>
            ))}
            {typedIsKey && (
              <button
                type="button"
                onClick={() => add(typedKey)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-card-muted"
              >
                Add <span className="font-mono">{typedKey}</span>
              </button>
            )}
          </div>
        )}
        {!taken.has(WILDCARD) && (
          <button
            type="button"
            onClick={() => add(WILDCARD)}
            className="mt-2 text-xs text-accent-text hover:underline"
          >
            Add a limit for every other token
          </button>
        )}
      </div>
    </div>
  );
}

/** The rows of a `GET /wallet/v1/tokens` answer the policy can limit: assets held on intents.near. */
export function policyTokensFromCatalog(data: unknown): PolicyToken[] {
  const list = (data as { tokens?: unknown })?.tokens;
  if (!Array.isArray(list)) return [];
  const out: PolicyToken[] = [];
  const seen = new Set<string>([NATIVE_TOKEN_KEY]);
  for (const t of list as Array<Record<string, unknown>>) {
    const key = [t.defuse_asset_id, t.id].find(
      (v): v is string => typeof v === 'string' && (v.startsWith('nep141:') || v.startsWith('nep245:')),
    );
    const decimals = Number(t.decimals);
    if (!key || seen.has(key) || !Number.isInteger(decimals) || decimals < 0) continue;
    seen.add(key);
    const chains = Array.isArray(t.chains) ? (t.chains as unknown[]).filter((c) => typeof c === 'string') : [];
    out.push({
      key,
      symbol: typeof t.symbol === 'string' ? t.symbol : key,
      chain: chains.length > 0 ? (chains as string[]).join(', ') : 'near',
      decimals,
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain));
}
