import Link from 'next/link';
import { SyntaxHighlighter, vscDarkPlus } from '@/components/ui/syntax';
import { ExampleCard, UseCasesSection, KeyFeaturesSection, TechnicalDetailsSection, CodeExampleSection, LearnMoreSection } from './';

export function EthereumExample() {
  const badges = (
    <>
 <span className="ml-3 text-sm bg-card-muted text-foreground px-3 py-1 rounded">WASI P2</span>
 <span className="ml-2 text-sm bg-destructive/10 text-destructive-text px-3 py-1 rounded">Advanced</span>
    </>
  );

  return (
    <ExampleCard
      id="ethereum-api"
      title="Ethereum API Oracle"
      badges={badges}
      githubUrl="https://github.com/out-layer/oracle-example"
      playgroundId="ethereum-api"
    >
 <p className="text-foreground mb-4">
        Query Ethereum blockchain data via JSON-RPC (balances, smart contracts, transactions) through Alchemy. The
        same oracle-example binary as the price oracle, called with its <code>fetch_custom_data</code> command and an
        Alchemy key in the secrets. Bridge NEAR with Ethereum data for cross-chain applications.
      </p>

      <KeyFeaturesSection items={[
        'Ethereum JSON-RPC API integration (eth_getBalance, eth_call, etc.)',
        'Custom request structure with JSON path extraction',
        'Cross-chain data oracle for NEAR ↔ Ethereum bridges',
 <>Alchemy key from encrypted secrets (<code>API_KEY</code>), sent only to Alchemy</>,
        'Production-ready on testnet and mainnet'
      ]} />

      <CodeExampleSection
        title="Input Example (Check ETH Balance):"
        code={`{
  "command": "fetch_custom_data",
  "requests": [
    {
      "id": "alchemy",
      "source": {
        "custom": {
          "url": "https://eth-mainnet.g.alchemy.com/v2",
          "method": "POST",
          "body": {
            "method": "eth_getBalance",
            "params": ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"],
            "id": 1,
            "jsonrpc": "2.0"
          },
          "json_path": "result",
          "value_type": "string"
        }
      }
    }
  ]
}`}
      />

      <CodeExampleSection
        title="Output Example:"
        code={`{
  "success": true,
  "results": [
    {
      "id": "alchemy",
      "value": "0x1bc16d674ec80000",
      "timestamp": 1763550000
    }
  ]
}`}
      />

 <h4 className="font-semibold mt-4 mb-2">Quick Start (Testnet):</h4>
      <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`# The pre-configured project and Alchemy secrets on testnet
near contract call-function as-transaction outlayer.testnet request_execution \\
  json-args '{
    "source": {
      "Project": {
        "project_id": "zavodil2.testnet/ethereum-api",
        "version_key": null
      }
    },
    "secrets_ref": {
      "profile": "alchemy",
      "account_id": "zavodil2.testnet"
    },
    "resource_limits": {
      "max_instructions": 100000000,
      "max_memory_mb": 128,
      "max_execution_seconds": 60
    },
    "input_data": "{\\"command\\":\\"fetch_custom_data\\",\\"requests\\":[{\\"id\\":\\"alchemy\\",\\"source\\":{\\"custom\\":{\\"url\\":\\"https://eth-mainnet.g.alchemy.com/v2\\",\\"method\\":\\"POST\\",\\"body\\":{\\"method\\":\\"eth_getBalance\\",\\"params\\":[\\"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\\",\\"latest\\"],\\"id\\":1,\\"jsonrpc\\":\\"2.0\\"},\\"json_path\\":\\"result\\",\\"value_type\\":\\"string\\"}}}]}"
  }' \\
  prepaid-gas '300.0 Tgas' \\
  attached-deposit '0.1 NEAR' \\
  sign-as your-account.testnet \\
  network-config testnet \\
  sign-with-keychain send`}
      </SyntaxHighlighter>

      <UseCasesSection items={[
 <><strong>Cross-Chain Bridges:</strong> Verify Ethereum transactions on NEAR</>,
 <><strong>DeFi Integration:</strong> Monitor Ethereum token balances from NEAR contracts</>,
 <><strong>Multi-Chain Wallets:</strong> Display ETH balances in NEAR apps</>,
 <><strong>Smart Contract State:</strong> Read Ethereum contract data (ERC20, NFTs)</>,
 <><strong>Block Explorer:</strong> Query Ethereum transaction history</>
      ]} />

 <h4 className="font-semibold mt-4 mb-2">Notes:</h4>
 <ul className="list-disc list-inside text-foreground space-y-1">
 <li>Same codebase as <code className="bg-card-muted px-2 py-1 rounded">oracle-example</code>, different secrets configuration</li>
 <li>
 Runs as a project: the binary uses project storage (<code className="bg-card-muted px-2 py-1 rounded">near:storage</code>), so a raw WasmUrl run is refused.
 Your own copy: <code className="bg-card-muted px-2 py-1 rounded">outlayer deploy ethereum-api &lt;FastFS URL&gt;</code>, then{' '}
 <code className="bg-card-muted px-2 py-1 rounded">{`outlayer secrets set '{"API_KEY":"…"}' --project you.near/ethereum-api --profile alchemy`}</code>
        </li>
 <li>Requires an Alchemy API key (free tier available)</li>
 <li>Supports any Ethereum JSON-RPC method (eth_call, eth_getTransactionReceipt, etc.)</li>
 <li>
 The <code className="bg-card-muted px-2 py-1 rounded">API_KEY</code> secret is attached as a bearer token only to
 HTTPS hosts under <code className="bg-card-muted px-2 py-1 rounded">g.alchemy.com</code> (and{' '}
 <code className="bg-card-muted px-2 py-1 rounded">pro-api.coingecko.com</code>); a custom URL anywhere else gets
 no key, so another provider&apos;s credential goes in that source&apos;s own <code className="bg-card-muted px-2 py-1 rounded">headers</code>{' '}
 (<Link href="/docs/secrets#using-secrets" className="text-accent-text hover:underline">why</Link>)
        </li>
 <li>Pre-configured on testnet: project <code className="bg-card-muted px-2 py-1 rounded">zavodil2.testnet/ethereum-api</code>, secrets of <code className="bg-card-muted px-2 py-1 rounded">zavodil2.testnet</code></li>
 <li>Mainnet: project <code className="bg-card-muted px-2 py-1 rounded">zavodil.near/ethereum-api</code>, secrets of <code className="bg-card-muted px-2 py-1 rounded">zavodil.near</code></li>
      </ul>

      <TechnicalDetailsSection items={[
 <><strong>WASI Version:</strong> Preview 2 (component model)</>,
 <><strong>Language:</strong> Rust</>,
 <><strong>HTTP Client:</strong> <code>wasi-http-client</code></>,
 <><strong>Secrets:</strong> Required (<code>API_KEY</code>, the Alchemy key)</>,
 <><strong>Network:</strong> Required (outbound HTTPS to Alchemy)</>,
 <><strong>Build:</strong> <code>cargo build --target wasm32-wasip2 --release</code></>,
 <><strong>Size:</strong> ~1 MB compiled WASM</>
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
 <Link href="/playground#ethereum-api" className="text-accent-text hover:underline">
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
