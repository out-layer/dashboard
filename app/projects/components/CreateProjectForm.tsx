'use client';

import { useState } from 'react';
import { CreateProjectFormData } from './types';
import { WasmSourceFields } from './WasmSourceFields';

interface CreateProjectFormProps {
  onSubmit: (data: CreateProjectFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function CreateProjectForm({ onSubmit, onCancel, isSubmitting }: CreateProjectFormProps) {
  const [formData, setFormData] = useState<CreateProjectFormData>({
    name: '',
    wasmUrl: '',
    wasmHash: '',
    buildTarget: 'wasm32-wasip2',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
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
            className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            pattern="[a-zA-Z0-9_-]+"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Only alphanumeric, dash, and underscore allowed
          </p>
        </div>

        <WasmSourceFields
          value={formData}
          onChange={(fields) => setFormData((f) => ({ ...f, ...fields }))}
        />

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
            {isSubmitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
