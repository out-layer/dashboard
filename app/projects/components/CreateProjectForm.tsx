'use client';

import { useState } from 'react';
import { CreateProjectFormData } from './types';

interface CreateProjectFormProps {
  onSubmit: (data: CreateProjectFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

// Calculate SHA256 hash from URL
async function calculateHashFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function CreateProjectForm({ onSubmit, onCancel, isSubmitting }: CreateProjectFormProps) {
  const [formData, setFormData] = useState<CreateProjectFormData>({
    name: '',
    sourceType: 'github',
    repo: '',
    commit: 'main',
    buildTarget: 'wasm32-wasip2',
    wasmUrl: '',
    wasmHash: '',
  });
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleCalculateHash = async () => {
    if (!formData.wasmUrl) {
      setHashError('Enter WASM URL first');
      return;
    }
    setCalculatingHash(true);
    setHashError(null);
    try {
      const hash = await calculateHashFromUrl(formData.wasmUrl);
      setFormData({ ...formData, wasmHash: hash });
    } catch (err) {
      setHashError((err as Error).message);
    } finally {
      setCalculatingHash(false);
    }
  };

  return (
    <div className="bg-card shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-foreground mb-4">Create New Project</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            Project Name <span className="text-destructive-text">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="my-awesome-app"
            className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
            pattern="[a-zA-Z0-9_-]+"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Only alphanumeric, dash, and underscore allowed
          </p>
        </div>

        {/* Source Type Toggle */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Code Source
          </label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="sourceType"
                value="github"
                checked={formData.sourceType === 'github'}
                onChange={() => setFormData({ ...formData, sourceType: 'github' })}
                className="form-radio text-accent-text focus:ring-accent"
              />
              <span className="ml-2 text-sm text-foreground">GitHub Repository</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="sourceType"
                value="wasm_url"
                checked={formData.sourceType === 'wasm_url'}
                onChange={() => setFormData({ ...formData, sourceType: 'wasm_url' })}
                className="form-radio text-accent-text focus:ring-accent"
              />
              <span className="ml-2 text-sm text-foreground">WASM URL</span>
            </label>
          </div>
        </div>

        {/* GitHub Source Fields */}
        {formData.sourceType === 'github' && (
          <>
            <div>
              <label htmlFor="repo" className="block text-sm font-medium text-foreground">
                Repository <span className="text-destructive-text">*</span>
              </label>
              <input
                type="text"
                id="repo"
                value={formData.repo}
                onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                placeholder="https://github.com/owner/repo"
                className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
                required={formData.sourceType === 'github'}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="commit" className="block text-sm font-medium text-foreground">
                  Commit/Branch <span className="text-destructive-text">*</span>
                </label>
                <input
                  type="text"
                  id="commit"
                  value={formData.commit}
                  onChange={(e) => setFormData({ ...formData, commit: e.target.value })}
                  placeholder="main"
                  className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
                  required={formData.sourceType === 'github'}
                />
              </div>
              <div>
                <label htmlFor="buildTarget" className="block text-sm font-medium text-foreground">
                  Build Target
                </label>
                <select
                  id="buildTarget"
                  value={formData.buildTarget}
                  onChange={(e) => setFormData({ ...formData, buildTarget: e.target.value })}
                  className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
                >
                  <option value="wasm32-wasip2">wasm32-wasip2</option>
                  {/* <option value="wasm32-wasip1">wasm32-wasip1 (not supported for projects)</option> */}
                </select>
              </div>
            </div>
          </>
        )}

        {/* WASM URL Source Fields */}
        {formData.sourceType === 'wasm_url' && (
          <>
            <div>
              <label htmlFor="wasmUrl" className="block text-sm font-medium text-foreground">
                WASM URL <span className="text-destructive-text">*</span>
              </label>
              <input
                type="text"
                id="wasmUrl"
                value={formData.wasmUrl}
                onChange={(e) => setFormData({ ...formData, wasmUrl: e.target.value })}
                placeholder="https://example.com/my-app.wasm"
                className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
                required={formData.sourceType === 'wasm_url'}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="wasmHash" className="block text-sm font-medium text-foreground">
                  SHA256 Hash <span className="text-destructive-text">*</span>
                </label>
                <div className="mt-1 flex">
                  <input
                    type="text"
                    id="wasmHash"
                    value={formData.wasmHash}
                    onChange={(e) => setFormData({ ...formData, wasmHash: e.target.value })}
                    placeholder="abc123..."
                    className="block w-full font-mono text-xs border-border-strong rounded-l-md shadow-sm focus:ring-accent focus:border-accent"
                    required={formData.sourceType === 'wasm_url'}
                  />
                  <button
                    type="button"
                    onClick={handleCalculateHash}
                    disabled={calculatingHash || !formData.wasmUrl}
                    className="px-3 py-2 border border-l-0 border-border-strong rounded-r-md bg-card-muted text-sm font-medium text-foreground hover:bg-card-muted disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    title="Calculate SHA256 from WASM URL"
                  >
                    {calculatingHash ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Calculate'}
                  </button>
                </div>
                {hashError && (
                  <p className="mt-1 text-xs text-destructive-text">{hashError}</p>
                )}
              </div>
              <div>
                <label htmlFor="wasmBuildTarget" className="block text-sm font-medium text-foreground">
                  Build Target
                </label>
                <select
                  id="wasmBuildTarget"
                  value={formData.buildTarget}
                  onChange={(e) => setFormData({ ...formData, buildTarget: e.target.value })}
                  className="mt-1 block w-full border-border-strong rounded-md shadow-sm focus:ring-accent focus:border-accent sm:text-sm"
                >
                  <option value="wasm32-wasip2">wasm32-wasip2</option>
                  {/* <option value="wasm32-wasip1">wasm32-wasip1 (not supported for projects)</option> */}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-border-strong rounded-md text-sm font-medium text-foreground bg-card hover:bg-card-muted"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
