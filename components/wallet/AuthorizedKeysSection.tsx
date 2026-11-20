'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import { CopyText } from '@/components/ui/copy-text';
import { computeKeyHash, validateWalletKeyFormat, generateWalletKey } from '@/lib/wallet-keys';

interface AuthorizedKeysSectionProps {
  /** Newline-separated hex SHA256 hashes from PolicyForm.additional_key_hashes */
  additionalKeyHashes: string;
  /** Callback when hashes change */
  onChangeHashes: (hashes: string) => void;
  /** Hash of the key this browser uses for the wallet: always named by the policy. */
  apiKeyHash?: string;
  /** Hash → what the key is, for the keys this browser can tell apart. */
  knownKeyHashes?: Map<string, string>;
  /**
   * The owner wants this browser to use a new key for the wallet. The page
   * decides when: a key works only once the policy naming it is stored.
   */
  onSaveKey?: (apiKey: string) => void;
}

const FIELD =
  'w-full max-w-xl rounded-md border border-border-strong px-3 py-2 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent';
const QUIET = 'text-xs text-muted-foreground hover:text-accent-text';
const SECONDARY =
  'rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent-text disabled:opacity-50';

/** A key as the list shows it: the ends of its fingerprint. */
function fingerprint(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/**
 * The API keys that run the wallet. A policy names keys by SHA-256 hash, so
 * the key itself is never stored with it; this section speaks of keys and
 * keeps the hashes as fingerprints.
 */
export function AuthorizedKeysSection({
  additionalKeyHashes,
  onChangeHashes,
  apiKeyHash,
  knownKeyHashes,
  onSaveKey,
}: AuthorizedKeysSectionProps) {
  const [adding, setAdding] = useState(false);
  /** Which of the two quiet ways in is open, beside generating. */
  const [own, setOwn] = useState<'key' | 'fingerprint' | null>(null);
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  /** A key made here: shown until the owner closes the panel. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [keptInBrowser, setKeptInBrowser] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const hashes = additionalKeyHashes.split('\n').map((h) => h.trim()).filter(Boolean);
  const add = (hash: string): boolean => {
    if (hash === apiKeyHash || hashes.includes(hash)) {
      setProblem('This key is already on the list.');
      return false;
    }
    onChangeHashes([...hashes, hash].join('\n'));
    return true;
  };

  const generate = async () => {
    const key = generateWalletKey();
    if (add(await computeKeyHash(key))) {
      setFresh(key);
      setKeptInBrowser(false);
      setProblem(null);
    }
  };

  const addOwn = async () => {
    setProblem(null);
    const value = input.trim();
    if (own === 'key') {
      const invalid = validateWalletKeyFormat(value);
      if (invalid) {
        setProblem(invalid);
        return;
      }
      if (add(await computeKeyHash(value))) {
        setInput('');
        setOwn(null);
      }
      return;
    }
    const cleaned = value.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      setProblem('A fingerprint is the key’s SHA-256: exactly 64 hex characters.');
      return;
    }
    if (add(cleaned)) {
      setInput('');
      setOwn(null);
    }
  };

  const close = () => {
    setAdding(false);
    setOwn(null);
    setInput('');
    setProblem(null);
    setFresh(null);
  };

  return (
    <div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {apiKeyHash && (
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 text-sm text-foreground">
              This browser&apos;s key
              <span className="ml-2 font-mono text-xs text-faint-foreground">{fingerprint(apiKeyHash)}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">always on the list</span>
          </li>
        )}
        {hashes.map((hash) => (
          <li key={hash} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 text-sm text-foreground">
              {knownKeyHashes?.get(hash) ?? 'Another key'}
              <span className="ml-2 font-mono text-xs text-faint-foreground">{fingerprint(hash)}</span>
            </span>
            {removing === hash ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <span className="text-muted-foreground">It stops working once the policy is stored.</span>
                <button
                  type="button"
                  onClick={() => {
                    onChangeHashes(hashes.filter((h) => h !== hash).join('\n'));
                    setRemoving(null);
                  }}
                  className="font-medium text-destructive-text hover:underline"
                >
                  Remove
                </button>
                <button type="button" onClick={() => setRemoving(null)} className={QUIET}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setRemoving(hash)} className={`shrink-0 ${QUIET}`}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className={`mt-2 ${QUIET}`}>
          Add or replace a key
        </button>
      ) : (
        <div className="mt-3 rounded-md border border-border p-3">
          {fresh ? (
            <>
              <p className="text-sm font-medium text-foreground">The new key</p>
              <div className="mt-1 rounded-md border border-border px-3 py-2 font-mono text-xs break-all">
                <CopyText value={fresh} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy it now: it is shown only here. It starts working when you store the policy.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {onSaveKey && (
                  keptInBrowser ? (
                    <span className="text-xs text-muted-foreground">This browser will use it once the policy is stored.</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSaveKey(fresh);
                          setKeptInBrowser(true);
                        }}
                        className={SECONDARY}
                      >
                        Use it in this browser too
                      </button>
                      <InfoHint text="Do this when the new key replaces the one this browser holds: once the policy is stored, this page and the approvals use the new key. To retire the old key, remove it from the list after that and store the policy again." />
                    </span>
                  )
                )}
                <button type="button" onClick={close} className={QUIET}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={generate} className={SECONDARY}>
                  Generate a new key
                </button>
                <InfoHint text="The key is made in this browser and goes nowhere: the policy stores only its SHA-256 fingerprint. Give each agent its own key so you can remove one without touching the others. The limits are the wallet's, shared by all of its keys." />
                <button type="button" onClick={close} className={`ml-auto ${QUIET}`}>
                  Cancel
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" onClick={() => { setOwn(own === 'key' ? null : 'key'); setInput(''); setProblem(null); }} className={QUIET}>
                  I already have a key
                </button>
                <button type="button" onClick={() => { setOwn(own === 'fingerprint' ? null : 'fingerprint'); setInput(''); setProblem(null); }} className={QUIET}>
                  I have only its fingerprint
                </button>
              </div>
              {own && (
                <div className="mt-2">
                  <div className="flex max-w-xl gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setProblem(null); }}
                      aria-label={own === 'key' ? 'API key' : 'Key fingerprint'}
                      placeholder={own === 'key' ? 'wk_…' : '64 hex characters'}
                      spellCheck={false}
                      autoComplete="off"
                      className={FIELD}
                    />
                    <button type="button" onClick={addOwn} disabled={!input.trim()} className={`shrink-0 ${SECONDARY}`}>
                      Add
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-faint-foreground">
                    {own === 'key'
                      ? 'The key stays in this page: only its fingerprint goes into the policy.'
                      : 'The SHA-256 of a key made elsewhere, so the key itself never reaches this browser.'}
                  </p>
                </div>
              )}
            </>
          )}
          {problem && <p className="mt-2 text-xs text-destructive-text">{problem}</p>}
        </div>
      )}
    </div>
  );
}
