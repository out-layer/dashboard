'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { HashChip } from '@/components/ui/hash-chip';
import { SkillUrlBox } from '@/components/ui/skill-url-box';
import { ExampleIcon } from '@/components/ui/example-icon';
import { useNearWallet } from '@/contexts/NearWalletContext';
import {
  ConnectorDescribeError,
  fetchConnectorDescription,
  type ConnectorDescription,
  type ConnectorLimit,
} from '@/lib/api';
import { CONNECTORS, skillUrl } from '@/lib/connectors';
import type { PolicySchema } from '@/lib/policies/types';
import { gmailPolicy } from '@/lib/policies/gmail';
import { githubPolicy } from '@/lib/policies/github';
import { mercuryPolicy } from '@/lib/policies/mercury';
import { hyperliquidPolicy } from '@/lib/policies/hyperliquid';
import { polymarketPolicy } from '@/lib/policies/polymarket';

/**
 * One connector, for a developer: what it does, the owner's policy in brief,
 * and every operation with its parameters. No prices — those are on chain.
 *
 * Nothing on this page is written here. The operations come from the
 * `describe` block of the ACTIVE version's manifest, read by the coordinator
 * out of the wasm the workers run, so the list is the deployed code's own;
 * the policy section renders the same schema the `/connect/<id>` editor is
 * built from. Two sources, both already the truth for something else, and
 * no third copy to drift.
 */

/** The policy schema behind each connector's `/connect` page. */
const POLICIES: Record<string, PolicySchema> = {
  gmail: gmailPolicy,
  github: githubPolicy,
  mercury: mercuryPolicy,
  hyperliquid: hyperliquidPolicy,
  polymarket: polymarketPolicy,
};

/** Who a declared cap binds, in the coordinator's words (`operation_limits::Applies`). */
const APPLIES_WORDS: Record<NonNullable<ConnectorLimit['applies']>, string> = {
  everyone: '',
  unpaid: ' (callers without a purchased subscription: pay-as-you-go, trial and gifted keys)',
  covered: ' (callers paying from an allowance: trial, gifted and subscription keys)',
};

/**
 * A `describe` value as text. The block is a third party's manifest, served
 * as it was written: a value that is not a string or a number renders as
 * nothing rather than as a React child it cannot be.
 */
function shown(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** A `describe` list, or none when the manifest put something else there. */
function listed<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

const KIND_WORD: Record<string, string> = {
  list: 'a list',
  number: 'a number',
  text: 'text',
  choices: 'a set of choices',
  toggle: 'on or off',
};

export default function ConnectorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { network } = useNearWallet();
  // `network` comes from localStorage on the client and from the env on the
  // server: everything that depends on it is decided after mount, or the
  // markup would not hydrate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const entry = CONNECTORS.find((c) => c.id === id);
  // Own keys only: `/connectors/constructor` must not find Object's.
  const policy = entry && Object.hasOwn(POLICIES, entry.id) ? POLICIES[entry.id] : undefined;

  const [description, setDescription] = useState<ConnectorDescription | undefined>(undefined);
  /** The refused read: the coordinator's sentence and the HTTP status (absent when no answer came back). */
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  /** Bumped by Retry: a new value re-runs the read. */
  const [attempt, setAttempt] = useState(0);
  // A connector that does not run on this network has nothing to describe here,
  // so it is not asked for.
  const publishedHere = entry ? entry.networks.includes(network) : false;

  useEffect(() => {
    let cancelled = false;
    setDescription(undefined);
    setError(null);
    if (!mounted || !entry || !publishedHere) return;
    fetchConnectorDescription(entry.id, network)
      .then((d) => {
        if (!cancelled) setDescription(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ConnectorDescribeError
            ? { message: e.message, status: e.status }
            : { message: e instanceof Error ? e.message : String(e) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, entry, network, publishedHere, attempt]);

  if (!entry) {
    return (
      <div className="w-full">
        <PageHeader title="Connector" description="No connector by that name." />
        <a href="/connectors" className="text-sm text-accent-text hover:underline">
          ← All connectors
        </a>
      </div>
    );
  }

  // 503, 429 (the per-IP limit in front of the read), or no answer at all: the
  // read can be repeated as it is.
  const transient =
    error !== null && (error.status === 503 || error.status === 429 || error.status === undefined);

  const operations = listed(description?.operations);
  const reads = operations.filter((o) => o.class === 'read');
  const writes = operations.filter((o) => o.class === 'write');
  const limits = listed(description?.limits);

  return (
    <div className="w-full">
      <a href="/connectors" className="text-xs text-muted-foreground hover:text-foreground">
        ← All connectors
      </a>
      <div className="mt-2 flex items-start gap-3">
        <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card-muted text-accent-text">
          <ExampleIcon name={entry.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <PageHeader title={entry.name} description={entry.tagline} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {entry.networks.map((n) => (
          <Badge key={n} variant="outline">
            {n}
          </Badge>
        ))}
        {description && (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="text-xs">Project:</span>
            <span className="font-mono">{shown(description.project_id)}</span>
            <span aria-hidden="true">·</span>
            {/* The project's active version on the contract: the checksum of the
                build that answers calls right now. Explained in the tooltip, not
                on the page. */}
            <HashChip
              value={shown(description.version)}
              trim={8}
              title={`Active version — checksum of the build serving calls now\n${shown(description.version)}`}
            />
          </span>
        )}
      </div>

      <div className="max-w-md">
        <SkillUrlBox url={skillUrl(entry.id)} compact label="Skill" />
      </div>
      <div className="mt-4">
        <a
          href={entry.connectHref}
          className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {entry.owner === 'account' ? `Connect ${entry.name}` : `Set the agent’s ${entry.name} policy`}
        </a>
      </div>

      <p className="mt-6 max-w-3xl text-sm text-foreground">{shown(description?.summary) || entry.how}</p>

      {/* ---- The owner's policy, from the schema the connect page edits ---- */}
      {policy && (
        <section className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">The owner’s policy</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored as <code className="rounded bg-card-muted px-1">{policy.envKey}</code>, checked inside the enclave before any request
            leaves.
            {policy.emptySummary ? ` With nothing stored: ${policy.emptySummary}.` : ''}
          </p>
          <div className="mt-3 space-y-4">
            {policy.groups.map((g) => (
              <div key={g.question} className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium text-foreground">{g.question}</h3>
                <dl className="mt-2 space-y-2">
                  {g.fields.map((f) => (
                    <div key={f.key} className="text-sm">
                      <dt className="flex flex-wrap items-baseline gap-2">
                        <code className="rounded bg-card-muted px-1 text-xs">{f.key}</code>
                        <span className="text-foreground">{f.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {KIND_WORD[f.kind] ?? f.kind}
                          {f.unit ? `, ${f.unit}` : ''}
                        </span>
                      </dt>
                      <dd className="mt-0.5 text-xs text-muted-foreground">
                        {f.help} <span className="italic">{f.absentMeans}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Operations, from the deployed wasm's manifest ---- */}
      <section className="mt-8 max-w-3xl">
        <h2 className="text-sm font-semibold text-foreground">Operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every call names one in <code className="rounded bg-card-muted px-1">operation</code>; the other fields are the parameters
          listed under it.
        </p>
        {!mounted ? (
          <p className="mt-3 text-sm text-muted-foreground">Reading the deployed version…</p>
        ) : !publishedHere ? (
          <p className="mt-3 text-sm text-amber-800">
            Not published on {network}. The skill above is the reference; switch network to read the deployed version.
          </p>
        ) : (
          <>
            {description === undefined && !error && (
              <p className="mt-3 text-sm text-muted-foreground">Reading the deployed version…</p>
            )}
            {error && transient && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-amber-800">
                <span>The description is temporarily unavailable. The skill above is the reference meanwhile.</span>
                <button
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-md border border-border px-3 py-1 text-sm text-foreground"
                >
                  Retry
                </button>
              </div>
            )}
            {error && !transient && (
              <p className="mt-3 text-sm text-amber-800">
                {error.message}. Until the deployed version carries a description, the skill above is the reference.
              </p>
            )}
          </>
        )}
        {description && (
          <div className="mt-3 space-y-6">
            <OperationTable title="Reads" ops={reads} />
            <OperationTable title="Writes" ops={writes} />
          </div>
        )}
      </section>

      {description && limits.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">Call caps</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Per calling wallet; on top of the owner’s policy and the platform’s own rules.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {limits.map((l, i) => {
              const applies = l.applies ?? 'everyone';
              return (
                <li key={i}>
                  <code className="rounded bg-card-muted px-1 text-xs">{shown(l.operation)}</code> — at most {shown(l.max_count)} a{' '}
                  {shown(l.window)}
                  {Object.hasOwn(APPLIES_WORDS, applies) ? APPLIES_WORDS[applies] : ''}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function OperationTable({ title, ops }: { title: string; ops: ConnectorDescription['operations'] }) {
  if (ops.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-lg border border-border">
        {ops.map((op, i) => (
          <div key={i} className="p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <code className="rounded bg-card-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">{shown(op.name)}</code>
              <span className="text-sm text-foreground">{shown(op.doc)}</span>
            </div>
            {listed(op.params).length > 0 && (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {listed(op.params).map((p, j) => (
                    <tr key={j} className="align-top">
                      <td className="w-40 py-0.5 pr-2">
                        <code className="text-foreground">{shown(p.name)}</code>
                        {p.required && <span className="ml-1 text-amber-800">required</span>}
                      </td>
                      <td className="w-36 py-0.5 pr-2 font-mono text-muted-foreground">{shown(p.type)}</td>
                      <td className="py-0.5 text-muted-foreground">{shown(p.doc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
