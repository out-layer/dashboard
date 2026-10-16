'use client';

import { useState } from 'react';
import { calculateWasmHashFromUrl } from '@/lib/wasm-hash';

export interface WasmSourceValue {
  wasmUrl: string;
  wasmHash: string;
  buildTarget: string;
}

interface WasmSourceFieldsProps {
  value: WasmSourceValue;
  onChange: (fields: Partial<WasmSourceValue>) => void;
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent';

// The code of a project version: a published .wasm and its sha256. The worker
// runs the file only when its bytes match the hash.
export function WasmSourceFields({ value, onChange }: WasmSourceFieldsProps) {
  const [hashLoading, setHashLoading] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);

  const handleCalculateHash = async () => {
    if (!value.wasmUrl) {
      setHashError('Please enter a WASM URL first');
      return;
    }
    setHashLoading(true);
    setHashError(null);
    try {
      onChange({ wasmHash: await calculateWasmHashFromUrl(value.wasmUrl) });
    } catch (err) {
      setHashError(err instanceof Error ? err.message : 'Failed to calculate hash');
    } finally {
      setHashLoading(false);
    }
  };

  return (
    <>
      <div>
        <label htmlFor="wasmUrl" className="block text-sm font-medium text-foreground">
          WASM URL <span className="text-destructive-text">*</span>
        </label>
        <input
          type="text"
          id="wasmUrl"
          value={value.wasmUrl}
          onChange={(e) => onChange({ wasmUrl: e.target.value })}
          placeholder="https://example.com/my-app.wasm"
          className={inputClass}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          A published <code>.wasm</code> file, e.g. from <code>outlayer upload &lt;file&gt;</code>.
        </p>
      </div>
      <div>
        <label htmlFor="wasmHash" className="block text-sm font-medium text-foreground">
          SHA256 Hash <span className="text-destructive-text">*</span>
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            id="wasmHash"
            value={value.wasmHash}
            onChange={(e) => onChange({ wasmHash: e.target.value })}
            placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            className="block w-full font-mono text-xs rounded-md border border-border-strong px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            required
          />
          <button
            type="button"
            onClick={handleCalculateHash}
            disabled={hashLoading || !value.wasmUrl}
            className="inline-flex items-center px-3 py-2 border border-border-strong shadow-sm text-sm font-medium rounded-md text-foreground bg-card hover:bg-card-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {hashLoading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
        {hashError && (
          <p className="mt-1 text-xs text-destructive-text">{hashError}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          The worker runs the file only when its bytes match this hash. &quot;Calculate&quot; fills it from the URL.
        </p>
      </div>
      <div>
        <label htmlFor="wasmBuildTarget" className="block text-sm font-medium text-foreground">
          Build Target
        </label>
        <select
          id="wasmBuildTarget"
          value={value.buildTarget}
          onChange={(e) => onChange({ buildTarget: e.target.value })}
          className={inputClass}
        >
          <option value="wasm32-wasip2">wasm32-wasip2</option>
        </select>
      </div>
    </>
  );
}
