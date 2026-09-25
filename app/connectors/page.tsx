'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkillUrlBox } from '@/components/ui/skill-url-box';
import { ExampleIcon } from '@/components/ui/example-icon';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { CONNECTORS, CONNECTORS_LIBRARY_SKILL, skillUrl } from '@/lib/connectors';

/**
 * The connector library, for a person: what each connector lets an agent do,
 * where the owner connects an account (or stores a policy, for a venue with no
 * account to connect), and the skill to hand the agent. The agent's side of
 * the same list is `outlayer-connectors/SKILL.md`; this page is the owner's.
 */
export default function ConnectorsPage() {
  const { network } = useNearWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="w-full">
      <PageHeader
        title="Connectors"
        description="Outside services an agent can act on as you — a mailbox, a code host, a bank, two trading venues — under a policy you set, from inside the enclave that holds its wallet."
      />

      <div className="mb-6 max-w-3xl rounded-lg border border-border bg-card-muted p-4">
        <h2 className="text-sm font-semibold">How an agent calls any of them</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          One skill covers the call, the payment key, the free trial and the refusal codes for every connector. Point the agent at it
          first; each connector below adds its own operations and policy.
        </p>
        <div className="mt-3">
          <SkillUrlBox url={CONNECTORS_LIBRARY_SKILL} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CONNECTORS.map((c) => {
          // Decided after mount: `network` comes from localStorage on the client
          // and from the env on the server, and markup that depends on it would
          // not hydrate.
          const here = !mounted || c.networks.includes(network);
          return (
            <Card key={c.id} className="h-full">
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-card-muted text-accent-text">
                      <ExampleIcon name={c.icon} />
                    </span>
                    <a href={`/connectors/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </a>
                    <a
                      href={`/connectors/${c.id}`}
                      className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-accent hover:text-foreground"
                      title="Operations, parameters and the owner’s policy"
                    >
                      Specs
                    </a>
                  </h2>
                  <div className="flex gap-1">
                    {c.networks.map((n) => (
                      <Badge key={n} variant="outline">
                        {n}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-foreground">{c.tagline}</p>
                <p className="mt-2 text-sm text-muted-foreground">{c.how}</p>

                {!here && (
                  <p className="mt-3 text-xs text-amber-800">
                    Not published on {network} yet — switch the network at the top to use it.
                  </p>
                )}

                {c.owner === 'policy' && (
                  <p className="mt-2 text-xs text-muted-foreground">No account to connect — the agent brings its own wallet; the policy is what turns trading on.</p>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                  <a
                    href={c.connectHref}
                    className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    {c.owner === 'account' ? `Connect ${c.name}` : `Set the agent’s ${c.name} policy`}
                  </a>
                  <div className="w-full min-w-0 sm:w-1/2">
                    <SkillUrlBox url={skillUrl(c.id)} compact label="Skill" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 max-w-3xl rounded-lg border border-border bg-card-muted p-4">
        <h2 className="text-sm font-semibold">What every connector has in common</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It runs inside the same Intel TDX enclave as the agent&apos;s wallet. The credential you give it — or the venue key it
          derives — never leaves that enclave, your policy is checked before any request goes out, and the module can only reach the
          hosts its signed manifest names. Every operation has a price on chain; a call without an{' '}
          <code className="rounded bg-card px-1">operation</code> is refused before anything runs. The caller&apos;s side —
          payment keys, subscriptions, refusal codes — is in{' '}
          <a href="/docs/connectors" className="font-medium text-accent-text hover:underline">
            Connectors &amp; Subscriptions
          </a>
          .
        </p>
      </div>
    </div>
  );
}
