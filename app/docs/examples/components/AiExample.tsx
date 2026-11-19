import Link from 'next/link';
import { ExampleCard, UseCasesSection, KeyFeaturesSection, TechnicalDetailsSection, CodeExampleSection, HowItWorksSection, LearnMoreSection, SecurityNotesSection } from './';

export function AiExample() {
  const badges = (
    <>
 <span className="ml-3 text-sm bg-card-muted text-foreground px-3 py-1 rounded">WASI P2</span>
 <span className="ml-2 text-sm bg-card-muted text-foreground px-3 py-1 rounded">Secrets</span>
 <span className="ml-2 text-sm bg-card-muted text-foreground px-3 py-1 rounded">Intermediate</span>
    </>
  );

  return (
    <ExampleCard
      id="ai-ark"
      title="ai-example"
      badges={badges}
      githubUrl="https://github.com/out-layer/ai-example"
      playgroundId="ai-completions"
    >
 <p className="text-foreground mb-4">
        Call an OpenAI-compatible chat API from a NEAR contract or over HTTPS. The API key, the endpoint and an optional
        system prompt come from the owner&apos;s encrypted secrets; the call names only the prompt.
      </p>

      <UseCasesSection items={[
        'AI-powered smart contract decision making',
        'Natural language processing for on-chain data',
        'Content generation triggered by blockchain events',
        'Intelligent chatbots with verifiable responses'
      ]} />

      <KeyFeaturesSection items={[
 <>HTTPS through WASI P2 (<code>wasi-http-client</code>)</>,
 <>API key and endpoint from encrypted secrets (<code>OPENAI_API_KEY</code>, <code>OPENAI_ENDPOINT</code>)</>,
 <>Optional system prompt from secrets (<code>SYSTEM_PROMPT</code>)</>,
        'Conversation history, model and max tokens chosen per call'
      ]} />

      <CodeExampleSection
        title="Input Format:"
        code={`{
  "prompt": "Explain NEAR Protocol in one sentence",
  "history": [
    {"role": "user", "content": "Tell me about NEAR"},
    {"role": "assistant", "content": "NEAR is a Layer 1 blockchain."}
  ],
  "model_name": "gpt-4o-mini",
  "max_tokens": 100
}`}
      />

      <CodeExampleSection
        title="Output Format (plain text):"
        code={`NEAR Protocol is a scalable, developer-friendly blockchain platform...`}
      />

      <HowItWorksSection items={[
 <>WASM reads <code>OPENAI_API_KEY</code>, <code>OPENAI_ENDPOINT</code> and <code>SYSTEM_PROMPT</code> from the decrypted secrets (env vars)</>,
 <>Refuses an input that carries <code>openai_endpoint</code>: the key goes only to the endpoint its owner stored</>,
        'Builds the chat request: system prompt, history, then the prompt',
        'POSTs it over WASI HTTP with the key as a bearer token',
        'Returns the first answer as plain text'
      ]} />

      <TechnicalDetailsSection items={[
 <><strong>WASI Version:</strong> Preview 2 (component model)</>,
 <><strong>Language:</strong> Rust</>,
 <><strong>HTTP Client:</strong> <code>wasi-http-client</code></>,
 <><strong>Secrets:</strong> <code>OPENAI_API_KEY</code> (required); <code>OPENAI_ENDPOINT</code> (https only, default <code>https://api.openai.com/v1/chat/completions</code>) and <code>SYSTEM_PROMPT</code> (optional)</>,
 <><strong>Network:</strong> outbound HTTPS to the endpoint the secrets name</>,
 <><strong>Build:</strong> <code>cargo build --target wasm32-wasip2 --release</code></>,
 <><strong>Size:</strong> ~450 KB compiled WASM</>
      ]} />

 <div className="mt-4 p-4 bg-card-muted border-l-4 border-border">
 <h4 className="font-semibold text-foreground mb-2">Setting Up Secrets</h4>
 <ol className="list-decimal list-inside text-sm text-foreground space-y-1">
          <li>
 Navigate to <Link href="/secrets" className="text-accent-text hover:underline">Secrets Management</Link>
          </li>
 <li>
 Store <code>{`{"OPENAI_API_KEY": "…", "OPENAI_ENDPOINT": "https://api.fireworks.ai/inference/v1/chat/completions", "SYSTEM_PROMPT": "…"}`}</code>;
 leave <code>OPENAI_ENDPOINT</code> out for OpenAI itself
          </li>
          <li>
 Bind it to your project (e.g., <code>alice.near/ai-example</code>) or to the WASM hash you run
          </li>
 <li>Choose access condition (e.g., AllowAll for testing, Whitelist for production)</li>
 <li>Worker will automatically decrypt and inject into WASM environment</li>
        </ol>
      </div>

      <SecurityNotesSection items={[
 <> API keys stored encrypted on-chain, decrypted only in TEE</>,
 <>
 The endpoint is set by the secrets&apos; owner, never by the caller: a key sent to a caller-chosen URL is a key
 given away (<Link href="/docs/secrets#using-secrets" className="text-accent-text hover:underline">the rule</Link>)
        </>,
 <> AllowAll lets anyone run the example on your key: the caller picks the model and <code>max_tokens</code>, so watch the API budget or whitelist callers</>,
 <> A caller can ask the model to repeat its system prompt: keep credentials out of it</>
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
 <Link href="/playground#ai-completions" className="text-accent-text hover:underline">
              Try in Playground
            </Link>
          </li>
          <li>
 <a href="https://github.com/out-layer/ai-example" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
              View Source Code
            </a>
          </li>
        </ul>
      </LearnMoreSection>
    </ExampleCard>
  );
}
