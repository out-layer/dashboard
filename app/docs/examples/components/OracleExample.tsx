import Link from 'next/link';
import { SyntaxHighlighter, vscDarkPlus } from '@/components/ui/syntax';
import { ExampleCard, KeyFeaturesSection, TechnicalDetailsSection, CodeExampleSection, LearnMoreSection } from './';

export function OracleExample() {
  const badges = (
    <>
 <span className="ml-3 text-sm bg-card-muted text-foreground px-3 py-1 rounded">WASI P2</span>
 <span className="ml-2 text-sm bg-destructive/10 text-destructive-text px-3 py-1 rounded">Advanced</span>
    </>
  );

  return (
    <ExampleCard
      id="oracle-ark"
      title="oracle-example"
      badges={badges}
      githubUrl="https://github.com/out-layer/oracle-example"
      playgroundId="multi-source-data-oracle"
    >
 <p className="text-foreground mb-4">
        Multi-source price and data oracle with aggregation and validation. Each request names its sources; the
        oracle fetches them inside the TEE, drops outliers and aggregates. The same code runs the production
        price oracle <code>price-oracle.near</code>.
      </p>

      <KeyFeaturesSection items={[
        'Exchange sources: CoinGecko, Binance, Huobi, Crypto.com, KuCoin, Gate.io, Pyth and more',
        'Custom sources: any HTTPS JSON API, value picked by a JSON path',
        'Aggregation: average, median, weighted_average',
        'min_sources_num and max_price_deviation_percent guard every aggregate',
        'Several requests in one call, each answered on its own',
        'No secrets needed for public sources'
      ]} />

      <CodeExampleSection
        title="Input Example (as in the playground):"
        code={`{
  "requests": [
    {
      "id": "near_price",
      "sources": [
        {"name": "coingecko", "id": "near"},
        {"name": "binance", "id": "NEARUSDT"},
        {"name": "kucoin", "id": "NEAR-USDT"},
        {"name": "gate", "id": "near_usdt"}
      ],
      "aggregation_method": "median",
      "min_sources_num": 3
    },
    {
      "id": "eur_usd_rate",
      "sources": [
        {"name": "custom", "custom": {
          "url": "https://open.er-api.com/v6/latest/EUR",
          "json_path": "rates.USD",
          "value_type": "number",
          "method": "GET",
          "headers": []
        }}
      ]
    }
  ],
  "max_price_deviation_percent": 10.0
}`}
      />

      <CodeExampleSection
        title="Output Example:"
        code={`{
  "results": [
    {
      "id": "near_price",
      "data": {
        "value": 1.236,
        "sources": ["binance", "coingecko", "gate", "kucoin"],
        "timestamp": 1795087083
      },
      "message": null
    },
    {
      "id": "eur_usd_rate",
      "data": {"value": 1.097391, "sources": ["custom"], "timestamp": 1795087083},
      "message": null
    }
  ]
}`}
      />

 <h4 className="font-semibold mt-4 mb-2">Prices in your contract (mainnet):</h4>
      <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`# price-oracle.near fetches fresh prices and calls your contract back with them
near call price-oracle.near oracle_call '{
  "receiver_id": "your-contract.near",
  "asset_ids": ["wrap.near", "aurora"],
  "msg": ""
}' --accountId your.near --deposit 0.02 --gas 200000000000000

# your contract receives them in oracle_on_call`}
      </SyntaxHighlighter>

 <ul className="list-disc list-inside text-foreground space-y-1 mt-4">
 <li>A custom source&apos;s credential is the caller&apos;s own and goes in that source&apos;s <code className="bg-card-muted px-2 py-1 rounded">headers</code>; the code attaches its <code className="bg-card-muted px-2 py-1 rounded">API_KEY</code> secret only to the allowlisted provider hosts (<Link href="/docs/secrets#using-secrets" className="text-accent-text hover:underline">why</Link>)</li>
 <li>Contract integration, signed price feeds and the Pyth-compatible wrapper are documented in the repository README</li>
      </ul>

      <TechnicalDetailsSection items={[
 <><strong>WASI Version:</strong> Preview 2 (component model)</>,
 <><strong>Language:</strong> Rust</>,
 <><strong>HTTP Client:</strong> <code>wasi-http-client</code></>,
 <><strong>Secrets:</strong> None for public sources</>,
 <><strong>Network:</strong> Required (outbound HTTPS to the sources)</>,
 <><strong>Build:</strong> <code>cargo build --target wasm32-wasip2 --release</code></>
      ]} />

      <LearnMoreSection>
 <ul className="text-sm text-foreground space-y-1">
          <li>
 <Link href="/docs/wasi#wasi-preview-2" className="text-accent-text hover:underline">
              WASI Preview 2 Documentation
            </Link>
          </li>
          <li>
 <Link href="/docs/secrets" className="text-accent-text hover:underline">
              Secrets Management Guide
            </Link>
          </li>
          <li>
 <Link href="/playground#multi-source-data-oracle" className="text-accent-text hover:underline">
              Try in Playground
            </Link>
          </li>
          <li>
 <a href="https://github.com/out-layer/oracle-example" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
              View Source Code
            </a>
          </li>
        </ul>
      </LearnMoreSection>
    </ExampleCard>
  );
}
