'use client';

import { UserSecret } from './types';
import { SecretCard } from './SecretCard';

interface SecretsListProps {
  secrets: UserSecret[];
  loading: boolean;
  isConnected: boolean;
  onEdit: (secret: UserSecret) => void;
  onUpdate?: (secret: UserSecret) => void;
  onDelete: (secret: UserSecret) => void;
  onRefresh: () => void;
}

export function SecretsList({ secrets, loading, isConnected, onEdit, onUpdate, onDelete, onRefresh }: SecretsListProps) {
  return (
 <div className="mt-8 bg-card border border-border sm:rounded-lg">
 <div className="px-4 py-5 sm:p-6">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-lg font-medium text-foreground">
            Your Secrets {secrets.length > 0 && `(${secrets.length})`}
          </h2>
          <button
            onClick={onRefresh}
            disabled={loading}
 className="text-sm text-accent-text disabled:text-faint-foreground transition-colors"
          >
            {loading ? ' Loading...' : '↻ Refresh'}
          </button>
        </div>

        {!isConnected ? (
 <div className="px-6 py-8 text-muted-foreground bg-card-muted rounded-lg">
 <svg className="h-10 w-10 text-faint-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
 <p className="text-lg font-medium">Connect wallet to view secrets</p>
          </div>
        ) : loading ? (
 <div className="px-6 py-8 text-muted-foreground">
 <svg className="animate-spin h-8 w-8 mx-auto mb-2 text-accent-text" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
 <p>Loading secrets...</p>
          </div>
        ) : secrets.length === 0 ? (
 <div className="px-6 py-8 text-muted-foreground bg-card-muted rounded-lg border-2 border-dashed border-border-strong">
 <svg className="h-10 w-10 text-faint-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
 <p className="text-lg font-medium mb-1">No secrets created yet</p>
 <p className="text-sm">Create your first secret above to get started</p>
          </div>
        ) : (
 <div className="space-y-3">
            {secrets.map((secret, idx) => (
              <SecretCard
                key={idx}
                secret={secret}
                onEdit={() => onEdit(secret)}
                onUpdate={onUpdate ? () => onUpdate(secret) : undefined}
                onDelete={() => onDelete(secret)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
