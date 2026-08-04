'use client';

import { useState } from 'react';
import { computeKeyHash, validateWalletKeyFormat, generateWalletKey } from '@/lib/wallet-keys';

interface AuthorizedKeysSectionProps {
  /** Newline-separated hex SHA256 hashes from PolicyForm.additional_key_hashes */
  additionalKeyHashes: string;
  /** Callback when hashes change */
  onChangeHashes: (hashes: string) => void;
  /** Current API key hash (auto-included, not editable) */
  apiKeyHash?: string;
  /** Map of hash → label for hashes we can identify (from localStorage etc.) */
  knownKeyHashes?: Map<string, string>;
  /** Callback to save a generated/entered key to localStorage */
  onSaveKey?: (apiKey: string) => void;
}

export function AuthorizedKeysSection({
  additionalKeyHashes,
  onChangeHashes,
  apiKeyHash,
  knownKeyHashes,
  onSaveKey,
}: AuthorizedKeysSectionProps) {
  const [keyInput, setKeyInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastGeneratedKey, setLastGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPasteHash, setShowPasteHash] = useState(false);
  const [pasteHashInput, setPasteHashInput] = useState('');
  const [pasteHashError, setPasteHashError] = useState<string | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<string | null>(null);

  // Parse hashes from the newline-separated string
  const hashList = additionalKeyHashes
    .split('\n')
    .map((h) => h.trim())
    .filter(Boolean);

  // All hashes in the policy (auto-included + additional)
  const allPolicyHashes = new Set(hashList);
  if (apiKeyHash) allPolicyHashes.add(apiKeyHash);

  // Check if any known key is orphaned (hash not in policy)
  const orphanedEntries: Array<{ hash: string; label: string }> = [];
  if (knownKeyHashes) {
    for (const [hash, label] of knownKeyHashes) {
      if (!allPolicyHashes.has(hash)) {
        orphanedEntries.push({ hash, label });
      }
    }
  }

  const handleGenerate = () => {
    const key = generateWalletKey();
    setKeyInput(key);
    setValidationError(null);
    setLastGeneratedKey(null);
  };

  const handleHashAndAdd = async () => {
    setValidationError(null);

    const err = validateWalletKeyFormat(keyInput);
    if (err) {
      setValidationError(err);
      return;
    }

    const hash = await computeKeyHash(keyInput);

    if (hash === apiKeyHash || hashList.includes(hash)) {
      setValidationError('This key is already authorized');
      return;
    }

    // Add hash to list
    const updated = [...hashList, hash].join('\n');
    onChangeHashes(updated);
    setLastGeneratedKey(keyInput);
    setKeyInput('');
    setCopied(false);
  };

  const handleCopy = () => {
    if (lastGeneratedKey) {
      navigator.clipboard.writeText(lastGeneratedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToStorage = () => {
    if (lastGeneratedKey && onSaveKey) {
      onSaveKey(lastGeneratedKey);
      setLastGeneratedKey(null);
    }
  };

  const handleRemoveHash = (hash: string) => {
    // If this hash matches a known key, require confirmation
    if (knownKeyHashes?.has(hash) && removalConfirm !== hash) {
      setRemovalConfirm(hash);
      return;
    }
    setRemovalConfirm(null);
    const updated = hashList.filter((h) => h !== hash).join('\n');
    onChangeHashes(updated);
  };

  const handleAddOrphanHash = (hash: string) => {
    const updated = [...hashList, hash].join('\n');
    onChangeHashes(updated);
  };

  const handlePasteHash = () => {
    setPasteHashError(null);
    const cleaned = pasteHashInput.trim().toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      setPasteHashError('Must be exactly 64 hex characters');
      return;
    }
    if (cleaned === apiKeyHash || hashList.includes(cleaned)) {
      setPasteHashError('This hash is already in the policy');
      return;
    }
    const updated = [...hashList, cleaned].join('\n');
    onChangeHashes(updated);
    setPasteHashInput('');
    setShowPasteHash(false);
  };

  return (
    <div>
 <h3 className="text-sm font-semibold text-foreground mb-2">Authorized API Keys</h3>
 <p className="text-xs text-faint-foreground mb-2">
        SHA256 hashes of API keys that can operate this wallet.
      </p>

      {/* Current key (auto-included) */}
      {apiKeyHash && (
 <div className="flex items-center gap-2 mb-3">
 <span className="text-xs text-muted-foreground">Current key:</span>
 <code className="text-xs font-mono bg-card-muted px-2 py-0.5 rounded text-muted-foreground select-all">
            {apiKeyHash.substring(0, 16)}...{apiKeyHash.slice(-8)}
          </code>
 <span className="text-xs text-success-text font-medium">auto-included</span>
        </div>
      )}

      {/* Generate / Enter key */}
 <div className="border border-border rounded p-3 mb-3 bg-card-muted">
 <div className="text-xs font-medium text-muted-foreground mb-2">Add a new key</div>
 <div className="flex gap-2 mb-1">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setValidationError(null); }}
            placeholder="wk_... or click Generate"
 className="flex-1 border border-border-strong rounded px-2 py-1.5 text-xs font-mono"
          />
          <button
            type="button"
            onClick={handleGenerate}
 className="px-3 py-1.5 text-xs bg-card-muted text-foreground rounded hover:bg-card-muted"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={handleHashAndAdd}
            disabled={!keyInput.trim()}
 className="px-3 py-1.5 text-xs bg-accent text-on-accent rounded-lg hover:bg-accent-hover disabled:opacity-40"
          >
            Hash &amp; Add
          </button>
        </div>
        {validationError && (
 <p className="text-xs text-destructive-text mt-1">{validationError}</p>
        )}

        {/* After generating: show copy/save prompt */}
        {lastGeneratedKey && (
 <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded">
 <p className="text-xs text-warning font-medium mb-1">
              Copy this key now — it won&apos;t be shown again.
            </p>
 <div className="flex items-center gap-2">
 <code className="text-xs font-mono bg-card px-2 py-0.5 rounded border border-warning/40 select-all break-all">
                {lastGeneratedKey}
              </code>
              <button
                type="button"
                onClick={handleCopy}
 className="px-2 py-1 text-xs bg-warning/10 text-warning rounded hover:bg-yellow-200 whitespace-nowrap"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {onSaveKey && (
                <button
                  type="button"
                  onClick={handleSaveToStorage}
 className="px-2 py-1 text-xs bg-accent text-on-accent rounded-lg hover:bg-accent-hover whitespace-nowrap"
                >
                  Save to Browser
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hash list */}
      {hashList.length > 0 && (
 <div className="mb-3">
 <div className="text-xs font-medium text-muted-foreground mb-1">Hashes in policy:</div>
 <div className="space-y-1">
            {hashList.map((hash) => {
              const label = knownKeyHashes?.get(hash);
              const isConfirming = removalConfirm === hash;

              return (
 <div key={hash} className="flex items-center gap-2 group">
 <code className="text-xs font-mono bg-card-muted px-2 py-0.5 rounded text-muted-foreground">
                    {hash.substring(0, 16)}...{hash.slice(-8)}
                  </code>
                  {label && (
 <span className="text-xs text-accent-text font-medium">({label})</span>
                  )}
                  {isConfirming ? (
 <span className="flex items-center gap-1">
 <span className="text-xs text-destructive-text">Revoke saved key?</span>
                      <button
                        type="button"
                        onClick={() => { setRemovalConfirm(null); handleRemoveHash(hash); }}
 className="text-xs text-destructive-text font-medium hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovalConfirm(null)}
 className="text-xs text-muted-foreground hover:underline"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveHash(hash)}
 className="text-xs text-red-400 hover:text-destructive-text opacity-0 group-hover:opacity-100"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orphaned key warnings */}
      {orphanedEntries.map(({ hash, label }) => (
 <div key={hash} className="mb-2 p-2 bg-warning/10 border border-warning/30 rounded flex items-center gap-2">
 <span className="text-xs text-warning">
            Your key ({label}) is not in the policy — it won&apos;t work.
          </span>
          <button
            type="button"
            onClick={() => handleAddOrphanHash(hash)}
 className="text-xs text-accent-text font-medium hover:underline whitespace-nowrap"
          >
            Add it
          </button>
        </div>
      ))}

      {/* Advanced: paste hash directly */}
 <div className="mt-2">
        {showPasteHash ? (
 <div className="flex gap-2 items-start">
            <input
              type="text"
              value={pasteHashInput}
              onChange={(e) => { setPasteHashInput(e.target.value); setPasteHashError(null); }}
              placeholder="64 hex characters"
 className="flex-1 border border-border-strong rounded px-2 py-1.5 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handlePasteHash}
              disabled={!pasteHashInput.trim()}
 className="px-2 py-1.5 text-xs bg-card-muted text-foreground rounded hover:bg-card-muted disabled:opacity-40"
            >
              Add hash
            </button>
            <button
              type="button"
              onClick={() => { setShowPasteHash(false); setPasteHashInput(''); setPasteHashError(null); }}
 className="text-xs text-faint-foreground hover:text-foreground py-1.5"
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPasteHash(true)}
 className="text-xs text-faint-foreground hover:text-foreground"
          >
            Paste hash directly...
          </button>
        )}
        {pasteHashError && (
 <p className="text-xs text-destructive-text mt-1">{pasteHashError}</p>
        )}
      </div>
    </div>
  );
}
