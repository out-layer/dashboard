'use client';

import { useState } from 'react';
import { AddVersionFormData } from './types';
import { WasmSourceFields } from './WasmSourceFields';

interface AddVersionFormProps {
  projectName: string;
  onSubmit: (data: AddVersionFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function AddVersionForm({ projectName, onSubmit, onCancel, isSubmitting }: AddVersionFormProps) {
  const [formData, setFormData] = useState<AddVersionFormData>({
    projectName,
    wasmUrl: '',
    wasmHash: '',
    buildTarget: 'wasm32-wasip2',
    setActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-medium text-foreground mb-4">
        Add Version to <span className="text-accent-text">{projectName}</span>
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <WasmSourceFields
          value={formData}
          onChange={(fields) => setFormData((f) => ({ ...f, ...fields }))}
        />

        {/* Set Active Checkbox */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="setActive"
            checked={formData.setActive}
            onChange={(e) => setFormData({ ...formData, setActive: e.target.checked })}
            className="h-4 w-4 text-accent-text focus:ring-accent border-border-strong rounded"
          />
          <label htmlFor="setActive" className="ml-2 block text-sm text-foreground">
            Set as active version after adding
          </label>
        </div>

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
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-on-accent bg-accent hover:bg-accent-hover disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Version'}
          </button>
        </div>
      </form>
    </div>
  );
}
