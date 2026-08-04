'use client';

import { useEffect, useState } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { RequireWallet } from '@/components/ui/require-wallet';
import { fetchUserEarnings, UserEarnings, createApiKey } from '@/lib/api';
import NetworkSwitcher from '@/components/NetworkSwitcher';

export default function SettingsPage() {
  const { accountId, isConnected, disconnect, shouldReopenModal, clearReopenModal } = useNearWallet();
  const [earnings, setEarnings] = useState<UserEarnings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // API Key state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Auto-open modal if we switched networks
  useEffect(() => {
    if (shouldReopenModal && !isConnected) {
      setShowWalletModal(true);
      clearReopenModal();
    }
  }, [shouldReopenModal, isConnected, clearReopenModal]);

  const loadApiKey = () => {
    if (!accountId) return;
    const stored = localStorage.getItem(`outlayer-api-key-${accountId}`);
    if (stored) {
      setApiKey(stored);
    }
  };

  useEffect(() => {
    if (isConnected && accountId) {
      loadEarnings();
      loadApiKey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, accountId]);

  const handleGenerateApiKey = async () => {
    if (!accountId) return;

    setGeneratingKey(true);
    setKeyError(null);

    try {
      const response = await createApiKey({
        near_account_id: accountId,
        key_name: 'dashboard-key',
      });

      setApiKey(response.api_key);
      localStorage.setItem(`outlayer-api-key-${accountId}`, response.api_key);
      setShowApiKey(true);
    } catch (err) {
      setKeyError('Failed to generate API key');
      console.error(err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const loadEarnings = async () => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchUserEarnings(accountId);
      setEarnings(data);
    } catch (err) {
      setError('Failed to load earnings data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatYoctoNEAR = (yocto: string) => {
    const near = parseFloat(yocto) / 1e24;
    return near.toFixed(6);
  };

  const formatInstructions = (instructions: number) => {
    if (instructions > 1e9) return (instructions / 1e9).toFixed(2) + 'B';
    if (instructions > 1e6) return (instructions / 1e6).toFixed(2) + 'M';
    if (instructions > 1e3) return (instructions / 1e3).toFixed(2) + 'K';
    return instructions.toString();
  };

  if (!isConnected) {
    return (
 <div className="w-full">
        <RequireWallet subject="your settings and earnings" />
      </div>
    );
  }

  return (
 <div className="w-full">
 <div className="sm:flex sm:items-center sm:justify-between">
 <div className="sm:flex-auto">
 <h1 className="text-xl font-bold tracking-tight">Settings</h1>
 <p className="mt-1 text-sm text-muted-foreground">Manage your account and view usage statistics</p>
        </div>
 <div className="mt-4 sm:mt-0">
          <button
            onClick={disconnect}
 className="inline-flex items-center px-4 py-2 border border-border-strong shadow-sm text-sm font-medium rounded-md text-foreground bg-card hover:bg-card-muted"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Account Information */}
 <div className="mt-8 bg-card border border-border overflow-hidden rounded-md">
 <div className="px-4 py-5 sm:px-6">
 <h3 className="text-lg leading-6 font-medium text-foreground">Account Information</h3>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Your NEAR wallet details</p>
        </div>
 <div className="border-t border-border px-4 py-5 sm:p-0">
 <dl className="sm:divide-y sm:divide-border">
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Account ID</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2 font-mono">
                {accountId}
              </dd>
            </div>
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Network</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                <NetworkSwitcher />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* API Key Section - only show if required */}
      {process.env.NEXT_PUBLIC_REQUIRE_ATTESTATION_API_KEY === 'true' && (
 <div className="mt-8 bg-card border border-border overflow-hidden rounded-md">
 <div className="px-4 py-5 sm:px-6">
 <h3 className="text-lg leading-6 font-medium text-foreground">API Key</h3>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Generate an API key to access attestation data
            </p>
          </div>
 <div className="border-t border-border px-4 py-5 sm:px-6">
          {!apiKey ? (
            <div>
 <p className="text-sm text-muted-foreground mb-4">
                You need an API key to view TEE attestations for your executions.
              </p>
              <button
                onClick={handleGenerateApiKey}
                disabled={generatingKey}
 className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-on-accent bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingKey ? (
                  <>
 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate API Key'
                )}
              </button>
              {keyError && (
 <p className="mt-2 text-sm text-destructive-text">{keyError}</p>
              )}
            </div>
          ) : (
            <div>
 <div className="flex items-center justify-between mb-2">
 <label className="text-sm font-medium text-muted-foreground">Your API Key</label>
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
 className="text-sm text-accent-text"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
 <div className="flex items-center gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
 className="flex-1 px-3 py-2 border border-border-strong rounded-md font-mono text-sm bg-card-muted"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(apiKey);
                    alert('API key copied to clipboard!');
                  }}
 className="px-3 py-2 bg-card-muted hover:bg-card-muted rounded-md text-sm font-medium"
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
 <p className="mt-2 text-xs text-muted-foreground">
                Keep your API key secure. It&apos;s stored locally in your browser.
              </p>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Usage Statistics */}
      {loading ? (
 <div className="mt-8 flex justify-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
 <div className="mt-8 bg-destructive/10 border border-destructive/30 rounded-md p-4">
 <p className="text-destructive-text">{error}</p>
        </div>
      ) : earnings ? (
        <>
 <div className="mt-8 bg-card border border-border overflow-hidden rounded-md">
 <div className="px-4 py-5 sm:px-6">
 <h3 className="text-lg leading-6 font-medium text-foreground">Usage Statistics</h3>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Your off-chain execution history and spending
              </p>
            </div>
 <div className="border-t border-border px-4 py-5 sm:p-0">
 <dl className="sm:divide-y sm:divide-border">
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Total Executions</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                    {earnings.total_executions}
                  </dd>
                </div>
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Successful Executions</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                    {earnings.successful_executions}                    {earnings.total_executions > 0 && (
 <span className="text-muted-foreground">
                        ({((earnings.successful_executions / earnings.total_executions) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </dd>
                </div>
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Total NEAR Spent</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
 <span className="text-lg font-semibold">
                      {formatYoctoNEAR(earnings.total_near_spent_yocto)} NEAR
                    </span>
                  </dd>
                </div>
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Total Instructions Used</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                    {formatInstructions(earnings.total_instructions_used)}
                  </dd>
                </div>
 <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
 <dt className="text-sm font-medium text-muted-foreground">Average Execution Time</dt>
 <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                    {earnings.average_execution_time_ms} ms
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Cost Breakdown */}
          {earnings.total_executions > 0 && (
 <div className="mt-8 bg-info/10 border border-info/30 rounded-lg p-4">
 <div className="flex">
 <div className="flex-shrink-0">
                  <svg
 className="h-5 w-5 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
 <div className="ml-3">
 <h3 className="text-sm font-medium text-info">Average Cost Per Execution</h3>
 <div className="mt-2 text-sm text-info">
                    <p>
                      ~{(parseFloat(earnings.total_near_spent_yocto) / 1e24 / earnings.total_executions).toFixed(6)} NEAR per execution
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
