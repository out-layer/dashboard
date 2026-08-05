'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PRODUCTS } from '@/lib/products';

export default function ProductsPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="Products"
        description="Live products built on OutLayer compute and custody."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {PRODUCTS.map((p) => (
          <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="group">
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground group-hover:text-accent-text">
                    {p.name}
                  </h2>
                  <span className="text-xs text-faint-foreground">
                    {p.url.replace('https://', '')} ↗
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.tagline}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.uses.map((u) => (
                    <Badge key={u} variant="outline">
                      {u}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="mt-6 max-w-3xl rounded-lg border border-border bg-card-muted p-4">
        <h2 className="text-sm font-semibold">Building on OutLayer?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every product here runs its critical path inside Intel TDX enclaves — attested compute,
          policy-guarded custody, or both. If you are shipping on OutLayer, tell us on{' '}
          <a
            href="https://x.com/out_layer"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text hover:underline"
          >
            X
          </a>{' '}
          and we will list you.
        </p>
      </div>
    </div>
  );
}
