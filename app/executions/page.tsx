'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { fetchJobs, JobHistoryEntry, AttestationResponse, fetchAttestation, isTestnetWorkersEnabled } from '@/lib/api';
import { getTransactionUrl } from '@/lib/explorer';
import { useNearWallet } from '@/contexts/NearWalletContext';
import AttestationView from '@/components/AttestationView';
import TestnetDisabledNotice from '@/components/TestnetDisabledNotice';
import { HashChip } from '@/components/ui/hash-chip';
import { FilterCombo, FilterSuggestion } from '@/components/ui/filter-combo';

const STORAGE_KEY = 'executions-table-settings';

interface TableSettings {
  showNear: boolean;
  showHttps: boolean;
  visibleColumns: {
    id: boolean;
    type: boolean;
    status: boolean;
    worker: boolean;
    source: boolean;
    user: boolean;
    time: boolean;
    fuel: boolean;
    payment: boolean;
    tx: boolean;
    created: boolean;
  };
}

const DEFAULT_SETTINGS: TableSettings = {
  showNear: true,
  showHttps: false,
  visibleColumns: {
    id: true,
    type: true,
    status: true,
    worker: true,
    source: true,
    user: true,
    time: true,
    fuel: false,
    payment: true,
    tx: true,
    created: true,
  },
};

const COLUMN_LABELS: Record<keyof TableSettings['visibleColumns'], string> = {
  id: 'ID',
  type: 'Type',
  status: 'Status',
  worker: 'Worker',
  source: 'Source',
  user: 'User',
  time: 'Time',
  fuel: 'Fuel',
  payment: 'Payment',
  tx: 'TX',
  created: 'Created',
};

// What a row "ran": its project, or the repo it was built from. The same string
// is shown in the Source filter, put in the URL and sent to the API.
const sourceOf = (job: JobHistoryEntry): string | null =>
  job.project_id || (job.github_repo ? job.github_repo.replace(/^https?:\/\/(www\.)?github\.com\//, '') : null);

// Filters live in the URL (`?user=…&source=…`) so a filtered view can be shared
// and survives a reload. Read once, after mount: the page is prerendered
// without them, and the attestation modal rewrites the address bar while it is
// open, so the filters must not follow the URL afterwards.
// `key` is a payment key nonce and only means something next to `user` (its
// owner) — `?user=<owner>&key=<nonce>` is the link an agent can hand out for
// "everything this key paid for", with no secret in it.
interface Filters {
  user: string;
  source: string;
  key: string;
}
const NO_FILTERS: Filters = { user: '', source: '', key: '' };

const readUrlFilters = (): Filters => {
  const q = new URLSearchParams(window.location.search);
  const user = q.get('user')?.trim() || '';
  const key = q.get('key')?.trim() || '';
  return {
    user,
    source: q.get('source')?.trim() || '',
    key: user && /^\d+$/.test(key) ? key : '',
  };
};

const executionsUrl = (f: Filters) => {
  const q = new URLSearchParams();
  if (f.user) q.set('user', f.user);
  if (f.user && f.key) q.set('key', f.key);
  if (f.source) q.set('source', f.source);
  const qs = q.toString();
  return qs ? `/executions?${qs}` : '/executions';
};

// A payment key as people see it elsewhere in the app: `owner#nonce`.
const keyLabel = (owner: string, nonce: string | number) => `${owner}#${nonce}`;

// A cell whose content does not count toward the column's width: the column
// takes its share of whatever room the table has left (the `<td>`'s percentage),
// and the content truncates to that. Without it a long account id either pushes
// the table past the viewport or gets cut at a fixed width while space sits idle.
const FitCell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative h-6 min-w-[6rem]">
    <div className="absolute inset-0 flex items-center">{children}</div>
  </div>
);

// Most recent first, each value once, capped so the list stays a shortlist.
const mergeRecent = (fresh: (string | null)[], prev: string[]) =>
  Array.from(new Set([...fresh.filter((v): v is string => !!v), ...prev])).slice(0, 50);

export default function JobsPage() {
  const { network, accountId } = useNearWallet();
  const [jobs, setJobs] = useState<JobHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [attestationModal, setAttestationModal] = useState<{
    jobId: number;
    isHttpsCall: boolean;
    job: JobHistoryEntry | null;
    attestation: AttestationResponse | null;
    loading: boolean;
    error: string | null
  } | null>(null);
  const [showAttestationHelp, setShowAttestationHelp] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  // null until mounted: the server has no URL to read, and rendering the
  // filters first as empty and then as set would be a hydration mismatch.
  const [filters, setFilters] = useState<Filters | null>(null);
  useEffect(() => setFilters(readUrlFilters()), []);
  // Everything seen on this page so far, so narrowing to one user does not
  // shrink the suggestions down to that user.
  const [seenUsers, setSeenUsers] = useState<string[]>([]);
  const [seenSources, setSeenSources] = useState<string[]>([]);
  const [seenKeys, setSeenKeys] = useState<string[]>([]);

  const applyFilters = (change: (prev: Filters) => Filters) => {
    setFilters((current) => {
      const prev = current ?? NO_FILTERS;
      const next = change(prev);
      if (next.user === prev.user && next.source === prev.source && next.key === prev.key) {
        return prev; // same filter, no reload
      }
      window.history.replaceState(null, '', executionsUrl(next));
      return next;
    });
  };
  // A key belongs to its owner, so changing the user drops the key filter.
  const setUserFilter = (user: string) => applyFilters((prev) => ({ ...prev, user, key: user === prev.user ? prev.key : '' }));
  const setSourceFilter = (source: string) => applyFilters((prev) => ({ ...prev, source }));
  // Accepts `owner#nonce` (from a suggestion, sets the user too) or a bare
  // nonce for the user already chosen. A bare nonce without a user is ignored.
  const setKeyFilter = (value: string) =>
    applyFilters((prev) => {
      if (!value) return { ...prev, key: '' };
      const m = value.match(/^(?:(.+)#)?(\d+)$/);
      if (!m) return prev;
      const user = m[1] || prev.user;
      if (!user) return prev;
      return { ...prev, user, key: m[2] };
    });

  // Responses can arrive out of order when the filter changes quickly; only
  // the newest request may fill the table.
  const requestSeq = useRef(0);

  // Load settings from localStorage
  const [settings, setSettings] = useState<TableSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new columns
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          visibleColumns: {
            ...DEFAULT_SETTINGS.visibleColumns,
            ...parsed.visibleColumns,
          },
        };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SETTINGS;
  });

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  // Compute source filter for API
  const getSourceFilter = useCallback((): 'near' | 'https' | undefined => {
    if (settings.showNear && settings.showHttps) return undefined; // Both = no filter
    if (settings.showNear) return 'near';
    if (settings.showHttps) return 'https';
    return 'near'; // Fallback - should not happen
  }, [settings.showNear, settings.showHttps]);

  const testnetDisabled = network === 'testnet' && !isTestnetWorkersEnabled();

  const loadJobs = useCallback(async () => {
    if (!filters) return; // URL not read yet
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const source = getSourceFilter();
      const data = await fetchJobs(
        50,
        0,
        filters.user || undefined,
        source,
        filters.source || undefined,
        filters.user && filters.key ? Number(filters.key) : undefined,
      );
      if (seq !== requestSeq.current) return;
      setSeenUsers((prev) => mergeRecent(data.map((j) => j.user_account_id), prev));
      setSeenSources((prev) => mergeRecent(data.map(sourceOf), prev));
      setSeenKeys((prev) =>
        mergeRecent(
          data.map((j) => (j.user_account_id && j.payment_key_nonce != null ? keyLabel(j.user_account_id, j.payment_key_nonce) : null)),
          prev,
        ),
      );
      setJobs(data);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError('Failed to load jobs');
      console.error(err);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [getSourceFilter, filters]);

  // Load jobs when filter changes (skip when testnet workers are offline)
  useEffect(() => {
    if (testnetDisabled) {
      setJobs([]);
      setLoading(false);
      return;
    }
    loadJobs();
  }, [loadJobs, testnetDisabled]);

  // Toggle handlers that prevent both from being unchecked
  const toggleNear = () => {
    setSettings((prev) => {
      // If trying to uncheck NEAR and HTTPS is already unchecked, don't allow
      if (prev.showNear && !prev.showHttps) return prev;
      return { ...prev, showNear: !prev.showNear };
    });
  };

  const toggleHttps = () => {
    setSettings((prev) => {
      // If trying to uncheck HTTPS and NEAR is already unchecked, don't allow
      if (prev.showHttps && !prev.showNear) return prev;
      return { ...prev, showHttps: !prev.showHttps };
    });
  };

  // While the attestation modal is open the address bar shows the standalone
  // page's URL — same content, so a copy/paste or F5 lands on the full page.
  const closeAttestationModal = () => {
    setAttestationModal(null);
    window.history.replaceState(null, '', executionsUrl(filters ?? NO_FILTERS));
  };

  const loadAttestation = async (job: JobHistoryEntry) => {
    if (!job.job_id || job.job_type === 'compile') {
      return; // No job_id, or a compile job — compilation runs outside the TEE
    }

    window.history.replaceState(null, '', `/attestation/${job.job_id}?network=${network}`);
    setAttestationModal({
      jobId: job.job_id,
      isHttpsCall: job.is_https_call,
      job,
      attestation: null,
      loading: true,
      error: null
    });

    try {
      // Always use job_id to fetch attestation (works for both NEAR and HTTPS calls)
      const data = await fetchAttestation(job.job_id, network);

      if (!data) {
        setAttestationModal({
          jobId: job.job_id,
          isHttpsCall: job.is_https_call,
          job,
          attestation: null,
          loading: false,
          error: 'No attestation found for this job'
        });
        return;
      }

      setAttestationModal({
        jobId: job.job_id,
        isHttpsCall: job.is_https_call,
        job,
        attestation: data,
        loading: false,
        error: null
      });
    } catch (err: unknown) {
      console.error('Failed to load attestation:', err);
      const errorMessage = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'response' in err && typeof err.response === 'object' && err.response !== null && 'data' in err.response && typeof err.response.data === 'object' && err.response.data !== null && 'error' in err.response.data)
          ? String(err.response.data.error)
          : 'Failed to load attestation';
      setAttestationModal({
        jobId: job.job_id,
        isHttpsCall: job.is_https_call,
        job,
        attestation: null,
        loading: false,
        error: errorMessage
      });
    }
  };

  const formatYoctoNEAR = (yocto: string | null) => {
    if (!yocto) return 'N/A';
    const near = parseFloat(yocto) / 1e24;
    return near.toFixed(6) + ' Ⓝ';
  };

  // Format USD from stablecoin minimal units (6 decimals)
  const formatUsd = (amount: string | null) => {
    if (!amount) return 'N/A';
    const usd = parseFloat(amount) / 1e6;
    return '$' + usd.toFixed(4);
  };

  // Calculate payment for display: for execute jobs, subtract compile_cost if exists
  const getDisplayPayment = (job: JobHistoryEntry) => {
    if (job.job_type === 'execute' && job.actual_cost_yocto && job.compile_cost_yocto) {
      // Execute cost already includes compile cost, so subtract it
      const totalCost = parseFloat(job.actual_cost_yocto);
      const compileCost = parseFloat(job.compile_cost_yocto);
      const executeCost = totalCost - compileCost;
      return executeCost.toString();
    }
    // For compile jobs or execute without compile_cost, use as-is
    return job.compile_cost_yocto || job.actual_cost_yocto || job.near_payment_yocto;
  };

  const formatInstructions = (instructions: number | null) => {
    if (!instructions) return 'N/A';
    if (instructions > 1e9) return (instructions / 1e9).toFixed(2) + 'B';
    if (instructions > 1e6) return (instructions / 1e6).toFixed(2) + 'M';
    if (instructions > 1e3) return (instructions / 1e3).toFixed(2) + 'K';
    return instructions.toString();
  };

  // Get status badge color and text based on job status
  const getStatusDisplay = (status: string | null, success: boolean) => {
    const actualStatus = status || (success ? 'completed' : 'failed');

    switch (actualStatus) {
      case 'completed':
        return { color: 'bg-success/10 text-success-text', text: 'Done' };
      case 'access_denied':
        return { color: 'bg-warning/10 text-warning', text: 'Access Denied' };
      case 'compilation_failed':
        return { color: 'bg-warning/10 text-warning', text: 'Compilation Failed' };
      case 'execution_failed':
        return { color: 'bg-destructive/10 text-destructive-text', text: 'Execution Failed' };
      case 'insufficient_payment':
        return { color: 'bg-warning/10 text-warning', text: 'Insufficient Payment' };
      case 'custom':
        return { color: 'bg-info/10 text-info', text: 'Invalid Request' };
      case 'failed':
        return { color: 'bg-destructive/10 text-destructive-text', text: 'Infrastructure Error' };
      default:
        return { color: 'bg-card-muted text-muted-foreground', text: actualStatus.replace('_', ' ') };
    }
  };

  // Format timestamp: show only time if today, otherwise full date
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      // Show only time for today
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } else {
      // Show full date for other days
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  };

  const toggleColumn = (column: keyof TableSettings['visibleColumns']) => {
    setSettings((prev) => ({
      ...prev,
      visibleColumns: {
        ...prev.visibleColumns,
        [column]: !prev.visibleColumns[column],
      },
    }));
  };

  // Effective column visibility: hide TX when only HTTPS is shown (no transactions)
  const httpsOnly = settings.showHttps && !settings.showNear;
  const effectiveColumns = {
    ...settings.visibleColumns,
    tx: settings.visibleColumns.tx && !httpsOnly,
  };

  const userSuggestions = useMemo<FilterSuggestion[]>(() => {
    const list: FilterSuggestion[] = seenUsers.map((value) => ({ value }));
    if (accountId) {
      return [{ value: accountId, hint: 'you' }, ...list.filter((s) => s.value !== accountId)];
    }
    return list;
  }, [seenUsers, accountId]);
  const sourceSuggestions = useMemo<FilterSuggestion[]>(
    () => seenSources.map((value) => ({ value })),
    [seenSources],
  );
  const activeFilters = filters ?? NO_FILTERS;
  // With a user chosen, only that user's keys are offered.
  const keySuggestions = useMemo<FilterSuggestion[]>(
    () => seenKeys.filter((k) => !activeFilters.user || k.startsWith(`${activeFilters.user}#`)).map((value) => ({ value })),
    [seenKeys, activeFilters.user],
  );
  const hasFilters = !!(activeFilters.user || activeFilters.source || activeFilters.key);

  // Count visible columns for colspan
  const visibleColumnCount = Object.values(effectiveColumns).filter(Boolean).length;

  if (error && !loading) {
    return (
      <div className="w-full">
        <PageHeader
          title="Executions"
          description="Compilation and execution jobs. Click an id to open its TEE attestation."
        />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive-text">{error}</p>
        </div>
      </div>
    );
  }

  return (
 <div className="w-full">
      <PageHeader
        title="Executions"
        description="Compilation and execution jobs. Click an id to open its TEE attestation."
        action={
          !testnetDisabled ? (
            <div className="flex flex-wrap items-center gap-4">
          {/* Source filter checkboxes */}
 <div className="flex items-center gap-4">
 <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showNear}
                onChange={toggleNear}
                disabled={settings.showNear && !settings.showHttps}
 className="w-4 h-4 rounded accent-accent disabled:opacity-50"
              />
 <span className={`text-sm font-medium ${settings.showNear ? 'text-foreground' : 'text-faint-foreground'}`}>
                NEAR
              </span>
            </label>
 <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showHttps}
                onChange={toggleHttps}
                disabled={settings.showHttps && !settings.showNear}
 className="w-4 h-4 rounded accent-accent disabled:opacity-50"
              />
 <span className={`text-sm font-medium ${settings.showHttps ? 'text-foreground' : 'text-faint-foreground'}`}>
                HTTPS
              </span>
            </label>
          </div>

          {/* Column settings dropdown */}
 <div className="relative">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
 className="px-3 py-1.5 text-sm font-medium text-muted-foreground bg-card-muted hover:text-foreground border border-border rounded-lg flex items-center gap-1 cursor-pointer"
              title="Column settings"
            >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Columns
            </button>

            {showColumnSettings && (
              <>
                <div
 className="fixed inset-0 z-10"
                  onClick={() => setShowColumnSettings(false)}
                />
 <div className="absolute right-0 mt-2 w-48 bg-card rounded-lg border border-border-lg border border-border z-20 py-2">
                  {(Object.keys(COLUMN_LABELS) as Array<keyof TableSettings['visibleColumns']>).map((col) => (
                    <label
                      key={col}
 className="flex items-center px-4 py-2 hover:bg-card-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={settings.visibleColumns[col]}
                        onChange={() => toggleColumn(col)}
 className="w-4 h-4 rounded accent-accent"
                      />
 <span className="ml-2 text-sm">{COLUMN_LABELS[col]}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
            </div>
          ) : undefined
        }
      />

      {testnetDisabled && (
 <div className="mt-8">
          <TestnetDisabledNotice variant="block" />
        </div>
      )}

      {!testnetDisabled && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">Filter by</span>
          <FilterCombo
            label="User"
            value={activeFilters.user}
            onChange={setUserFilter}
            suggestions={userSuggestions}
            placeholder="account.near"
          />
          <FilterCombo
            label="Key"
            value={activeFilters.key ? keyLabel(activeFilters.user, activeFilters.key) : ''}
            onChange={setKeyFilter}
            suggestions={keySuggestions}
            placeholder={activeFilters.user ? 'nonce' : 'owner.near#nonce'}
          />
          <FilterCombo
            label="Source"
            value={activeFilters.source}
            onChange={setSourceFilter}
            suggestions={sourceSuggestions}
            placeholder="owner/project or owner/repo"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilters(NO_FILTERS);
                window.history.replaceState(null, '', '/executions');
              }}
              className="px-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {!testnetDisabled && (
 <div className="mt-3 flex flex-col">
 <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
 <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
 <div className="overflow-hidden rounded-md border border-border bg-card">
 <table className="w-full">
 <thead className="border-b border-border">
                  <tr>
                    {effectiveColumns.id && (
                      <th
 className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground"
                        title="Click an id to view its TEE attestation quote"
                      >
                        ID
                      </th>
                    )}
                    {effectiveColumns.type && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Type</th>
                    )}
                    {effectiveColumns.status && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Status</th>
                    )}
                    {effectiveColumns.worker && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Worker</th>
                    )}
                    {effectiveColumns.source && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Source</th>
                    )}
                    {effectiveColumns.user && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">User</th>
                    )}
                    {effectiveColumns.time && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Time (ms)</th>
                    )}
                    {effectiveColumns.fuel && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground" title="Instructions">Fuel</th>
                    )}
                    {effectiveColumns.payment && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground" title="In NEAR tokens">Payment</th>
                    )}
                    {effectiveColumns.tx && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">TX</th>
                    )}
                    {effectiveColumns.created && (
 <th className="whitespace-nowrap px-2.5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Created</th>
                    )}
                  </tr>
                </thead>
 <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
 <td colSpan={visibleColumnCount} className="px-3 py-8 text-center">
 <div className="flex justify-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                        </div>
                      </td>
                    </tr>
                  ) : jobs.length === 0 ? (
                    <tr>
 <td colSpan={visibleColumnCount} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {hasFilters ? 'No jobs match the filters' : 'No jobs found'}
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => {
                      const isExpanded = expandedJobId === job.id;
                      const hasErrorDetails = job.error_details && job.error_details.trim().length > 0;

                      return (
                        <Fragment key={job.id}>
                          <tr>
                            {effectiveColumns.id && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm font-mono">
                                {/* The id itself opens the attestation report. Discovery was the
                                    problem with a separate icon column: people never connected the
                                    shield to "this execution can be proven". Attached to the row's
                                    identifier, with the shield right after it, it is where the eye
                                    already goes. Compilations happen outside the TEE, so they have
                                    no attestation and render as plain text — no link affordance for
                                    something that does not open. */}
                                {job.job_id && job.job_type !== 'compile' ? (
                                  <button
                                    onClick={() => loadAttestation(job)}
 className="inline-flex items-center gap-1 text-accent-text cursor-pointer group"
                                    title="Click to view the TEE attestation quote for this execution"
                                  >
 <span className="underline decoration-dotted underline-offset-2">{job.id}</span>
                                    {/* Sized in `em` so it tracks the digits next to it instead of
                                        towering over them at a fixed pixel size. */}
                                    <svg
 className="w-[0.9em] h-[0.9em] shrink-0 text-accent-text"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-label="TEE attestation available"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                  </button>
                                ) : (
 <span>{job.id}</span>
                                )}
                              </td>
                            )}
                            {effectiveColumns.type && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
 <div className="flex items-center gap-1">
                                  <span
 className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                      job.job_type === 'compile'
                                        ? 'bg-info/10 text-info'
                                        : 'bg-accent/10 text-accent-text'
                                    }`}
                                  >
                                    {job.job_type || 'N/A'}
                                  </span>
                                  <span
 className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 border ${
                                      job.is_https_call
                                        ? 'border-border-strong text-muted-foreground'
                                        : 'border-success/40 text-success-text'
                                    }`}
                                    title={job.is_https_call
                                      ? `HTTPS API call (call_id: ${job.call_id})`
                                      : `NEAR blockchain call (tx: ${job.transaction_hash || 'N/A'})`}
                                  >
                                    {job.is_https_call ? 'HTTPS' : 'NEAR'}
                                  </span>
                                </div>
                              </td>
                            )}
                            {effectiveColumns.status && (
                              // One line, always: a wrapped badge doubles the row height. The
                              // User column shrinks to make room instead.
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
                                <span
 className={`inline-flex rounded-2xl px-2 py-0.5 text-xs font-semibold leading-4 ${
                                    getStatusDisplay(job.status, job.success).color
                                  } ${hasErrorDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
                                  onClick={() => hasErrorDetails && setExpandedJobId(isExpanded ? null : job.id)}
                                  title={hasErrorDetails ? 'Click to show error details' : undefined}
                                >
                                  {getStatusDisplay(job.status, job.success).text}
 {hasErrorDetails && <span className="ml-1">{isExpanded ? '▼' : '▶'}</span>}
                                </span>
                              </td>
                            )}
                            {effectiveColumns.worker && (
 <td className="px-2.5 py-4 text-sm text-muted-foreground font-mono">
 <div className="max-w-[76px] truncate" title={job.worker_id || 'N/A'}>
                                  {job.worker_id ? job.worker_id.split('-').pop() : 'N/A'}
                                </div>
                              </td>
                            )}
                            {effectiveColumns.source && (
 <td className="w-[40%] px-2.5 py-4 text-sm text-muted-foreground">
                                <FitCell>
                                {job.project_id ? (
                                  <span
 className="truncate"
                                    title={job.project_id}
                                  >
                                    {job.project_id.split('/').pop() || job.project_id}
                                  </span>
                                ) : job.github_repo ? (
                                  <a
                                    href={`${job.github_repo}/tree/${job.github_commit}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
 className="text-accent-text hover:underline truncate"
                                    title={`${job.github_repo} @ ${job.github_commit}`}
                                  >
                                    {job.github_repo.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                                  </a>
                                ) : (
                                  '-'
                                )}
                                </FitCell>
                              </td>
                            )}
                            {effectiveColumns.user && (
 <td className="w-[60%] px-2.5 py-4 text-sm text-muted-foreground">
                                <FitCell>
                                  {job.user_account_id ? <HashChip value={job.user_account_id} fit /> : 'N/A'}
                                </FitCell>
                              </td>
                            )}
                            {effectiveColumns.time && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
                                {job.compile_time_ms && job.execution_time_ms
                                  ? `${job.compile_time_ms}ms + ${job.execution_time_ms}ms`
                                  : job.compile_time_ms
                                  ? `${job.compile_time_ms}ms`
                                  : job.execution_time_ms
                                  ? `${job.execution_time_ms}ms`
                                  : 'N/A'}
                              </td>
                            )}
                            {effectiveColumns.fuel && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
                                {job.job_type === 'compile' ? '-' : formatInstructions(job.instructions_used)}
                              </td>
                            )}
                            {effectiveColumns.payment && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
                                {job.is_https_call
                                  ? formatUsd(job.compute_cost_usd)
                                  : formatYoctoNEAR(getDisplayPayment(job))}
                              </td>
                            )}
                            {effectiveColumns.tx && (
 <td className="whitespace-nowrap px-2.5 py-4 text-sm">
                                {job.transaction_hash ? (
                                  <a
                                    href={getTransactionUrl(job.transaction_hash, network)}
                                    target="_blank"
                                    rel="noopener noreferrer"
 className="text-accent-text hover:underline"
                                    title={job.transaction_hash}
                                  >
                                    {job.transaction_hash.substring(0, 8)}...
                                  </a>
                                ) : (
                                  '-'
                                )}
                              </td>
                            )}
                            {effectiveColumns.created && (
                              <td
 className="whitespace-nowrap px-2.5 py-4 text-sm text-muted-foreground"
                                title={new Date(job.created_at).toLocaleString()}
                              >
                                {formatTimestamp(job.created_at)}
                              </td>
                            )}
                          </tr>
                          {/* Error details row - only shown when expanded */}
                          {isExpanded && hasErrorDetails && (
                            <tr key={`${job.id}-details`}>
 <td colSpan={visibleColumnCount} className="px-2.5 py-4 bg-card-muted">
 <div className="text-sm">
 <span className="font-semibold">Error Details:</span>
 <pre className="mt-2 p-3 bg-background border border-border rounded text-xs overflow-x-auto text-destructive-text">
                                    {job.error_details}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Attestation Modal */}
      {attestationModal && (
        <div
 className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            closeAttestationModal();
            setShowAttestationHelp(false);
          }}
        >
          <div
 className="bg-card border border-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
 <div className="p-6">
 <div className="flex justify-between items-center mb-4">
 <div className="flex items-center gap-3">
 <h2 className="text-xl font-bold">
                    TEE Attestation - {attestationModal.isHttpsCall ? 'HTTPS' : 'NEAR'} Job #{attestationModal.jobId}
                  </h2>
                  <span
 className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 border ${
                      attestationModal.isHttpsCall
                        ? 'border-border-strong text-muted-foreground'
                        : 'border-success/40 text-success-text'
                    }`}
                  >
                    {attestationModal.isHttpsCall ? 'HTTPS' : 'NEAR'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    closeAttestationModal();
                    setShowAttestationHelp(false);
                  }}
 className="text-faint-foreground hover:text-foreground"
                >
 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {attestationModal.loading && (
 <div className="flex justify-center items-center py-12">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                </div>
              )}

              {attestationModal.error && (
 <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 mb-4">
 <p className="text-sm text-destructive-text">{attestationModal.error}</p>
                </div>
              )}

              {attestationModal.attestation && (
                <AttestationView
                  attestation={attestationModal.attestation}
                  initialJob={attestationModal.job}
                  network={network}
                  showHelp={showAttestationHelp}
                  onToggleHelp={() => setShowAttestationHelp(!showAttestationHelp)}
                  isModal={true}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
