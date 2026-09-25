'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { SkillUrlBox } from '@/components/ui/skill-url-box';
import { ExampleIcon } from '@/components/ui/example-icon';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { fetchConnectorDescription, type ConnectorDescription } from '@/lib/api';
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
  const entry = CONNECTORS.find((c) => c.id === id);
  const policy = POLICIES[id];

  const [description, setDescription] = useState<ConnectorDescription | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDescription(undefined);
    setError(null);
    fetchConnectorDescription(id, network as 'mainnet' | 'testnet')
      .then((d) => {
        if (!cancelled) setDescription(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, network]);

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

  const reads = description?.operations.filter((o) => o.class === 'read') ?? [];
  const writes = description?.operations.filter((o) => o.class === 'write') ?? [];

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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <a
          href={entry.connectHref}
          className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {entry.owner === 'account' ? `Connect ${entry.name}` : `Set the agent’s ${entry.name} policy`}
        </a>
        {entry.networks.map((n) => (
          <Badge key={n} variant="outline">
            {n}
          </Badge>
        ))}
        {description && (
          <span className="font-mono text-[11px] text-muted-foreground" title={`active version ${description.version}`}>
            {description.project_id} · {description.version.slice(0, 8)}…
          </span>
        )}
      </div>

      <div className="max-w-3xl">
        <SkillUrlBox url={skillUrl(entry.id)} compact label="Skill" />
      </div>

      <p className="mt-6 max-w-3xl text-sm text-foreground">{description?.summary ?? entry.how}</p>

      {/* ---- The owner's policy, from the schema the connect page edits ---- */}
      {policy && (
        <section className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">The owner’s policy</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored as <code className="rounded bg-card-muted px-1">{policy.envKey}</code>, checked inside the enclave before any request
            leaves.
            {policy.emptySummary ? ` ${policy.emptySummary}` : ''}
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
                        {f.help} <span className="italic">Empty: {f.absentMeans}</span>
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
          listed under it. Read from the active version’s own manifest.
        </p>
        {description === undefined && !error && <p className="mt-3 text-sm text-muted-foreground">Reading the deployed version…</p>}
        {error && <p className="mt-3 text-sm text-amber-800">The description could not be read: {error}</p>}
        {description === null && (
          <p className="mt-3 text-sm text-amber-800">
            Not published on {network} — switch the network at the top, or read the skill above.
          </p>
        )}
        {description && (
          <div className="mt-3 space-y-6">
            <OperationTable title="Reads" ops={reads} />
            <OperationTable title="Writes" ops={writes} />
          </div>
        )}
      </section>

      {description && description.limits.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">Caps the connector declares about itself</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Per calling wallet; on top of the owner’s policy and the platform’s own rules.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {description.limits.map((l, i) => (
              <li key={i}>
                <code className="rounded bg-card-muted px-1 text-xs">{l.operation}</code> — at most {l.max_count} a {l.window}
                {l.applies && l.applies !== 'everyone' ? ` (${l.applies === 'covered' ? 'trial and subscription callers' : 'callers without a subscription'})` : ''}
              </li>
            ))}
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
        {ops.map((op) => (
          <div key={op.name} className="p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <code className="rounded bg-card-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">{op.name}</code>
              <span className="text-sm text-foreground">{op.doc}</span>
            </div>
            {op.params.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {op.params.map((p) => (
                    <tr key={p.name} className="align-top">
                      <td className="w-40 py-0.5 pr-2">
                        <code className="text-foreground">{p.name}</code>
                        {p.required && <span className="ml-1 text-amber-800">required</span>}
                      </td>
                      <td className="w-36 py-0.5 pr-2 font-mono text-muted-foreground">{p.type}</td>
                      <td className="py-0.5 text-muted-foreground">{p.doc ?? ''}</td>
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
