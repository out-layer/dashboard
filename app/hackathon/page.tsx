import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SkillUrlBox } from '@/components/ui/skill-url-box';

const GRANT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfoPbLoa0ly1PlN570nJvgHxBHvuRI7gzTtZg49AY3HVBe6DQ/viewform';
const SKILL_URL = 'https://skills.outlayer.ai/outlayer/SKILL.md';

interface Idea {
  title: string;
  track: string;
  body: string;
  start: { label: string; href: string };
}

const IDEAS: Idea[] = [
  {
    title: 'An investment thesis you can re-run',
    track: 'Investment Thesis',
    body: 'Run your NEAR analytics model in OutLayer, and every chart comes with an attestation: this code, this data, this output. Judges don’t have to trust your dashboard. They can verify it.',
    start: { label: 'TEE attestation', href: '/docs/tee-attestation' },
  },
  {
    title: 'Escrow that pays when the PR merges',
    track: 'Real-World Money',
    body: 'A NEAR contract holds the bounty. OutLayer checks GitHub inside the enclave: is the PR merged, and did the right account author it? If yes, the payout goes out. No arbiter and no trusted backend, just a verifiable check of a Web2 fact.',
    start: { label: 'Connectors', href: '/docs/connectors' },
  },
  {
    title: 'An AI CFO with a real bank account',
    track: 'Autonomous Business',
    body: 'Your agent pays invoices from a real Mercury business account. The owner sets the spending cap, the 30-day budget and the allowed recipients, and the enclave enforces them. The agent can’t rewrite the rules or see the credentials. Treasury ops for a company of one.',
    start: { label: 'Connectors', href: '/docs/connectors' },
  },
  {
    title: 'An NFT that holds an API key',
    track: 'NFTs That Do Something',
    body: 'Whoever holds the NFT can call a paid API. The key is sealed in the enclave. OutLayer checks ownership on-chain, then makes the call. Sell the NFT and the access goes with it. Nobody ever sees the key.',
    start: { label: 'Secrets', href: '/docs/secrets' },
  },
  {
    title: 'A memecoin that mints when it rains on Thursday',
    track: 'Memecoins With Mechanics',
    body: 'The supply follows a real-world signal: weather, GitHub stars, a sports score. OutLayer fetches it over plain HTTPS inside a TEE and signs the result. The joke has rules, and the rules are verifiable.',
    start: { label: 'Weather example', href: '/docs/examples#weather-ark' },
  },
  {
    title: 'A bot-proof token launch',
    track: 'Memecoins / Open Innovation',
    body: 'CAPTCHA checked off-chain in a TEE, purchase settled on-chain. Real humans get the allocation and snipers get nothing. The contract never has to trust a server, because the server is attested.',
    start: { label: 'CAPTCHA example', href: '/docs/examples#captcha-ark' },
  },
  {
    title: 'An oracle that doesn’t trust its RPC',
    track: 'Unstoppable DeFi',
    body: 'eth_call lies if the node lies. OutLayer verifies Ethereum state proofs inside the enclave, so a NEAR lending market can read EVM collateral without trusting whoever served the data.',
    start: { label: 'Ethereum proof example', href: '/docs/examples#eth-proof' },
  },
  {
    title: 'Get paid every time an agent calls your code',
    track: 'Agent Economy',
    body: 'Publish a WASM function. Agents call it over HTTPS with a payment key, and you earn on every call, per request, with no billing stack. An API business in an afternoon.',
    start: { label: 'Earnings', href: '/docs/earnings' },
  },
  {
    title: 'Reputation agents can actually trust',
    track: 'AI Security & Defense',
    body: 'Read a fact from Web2 or any chain, such as an account’s age, contribution history or on-chain volume, and publish it as an EAS attestation signed in the enclave. Trust moves from “who signed this” to “this exact code fetched this exact data.”',
    start: { label: 'EAS attestor example', href: '/docs/examples#eas-attestor' },
  },
  {
    title: 'An invoice chaser that writes from your Gmail',
    track: 'Real-World Money',
    body: 'The agent sends payment reminders from your real address and settles in stablecoins. It has the send scope only, so it can’t read your mailbox. The OAuth token never leaves the TEE.',
    start: { label: 'Connectors', href: '/docs/connectors' },
  },
];

const STEPS: React.ReactNode[] = [
  <>
    Open{' '}
    <Link href="/payment-keys" className="font-medium text-accent-text hover:underline">
      Payment Keys
    </Link>{' '}
    and create a <strong className="text-foreground">new</strong> key on mainnet.
  </>,
  <>
    Set the initial deposit to <strong className="text-foreground">0.01</strong>, the minimum, and nothing more. A key
    you have topped up yourself cannot receive a grant.
  </>,
  <>
    Note the key number, shown as “key #N”. The trial key (#0) cannot receive a grant.
  </>,
  <>Fill in the form: your NEAR account, the key number, your project and what you need from OutLayer.</>,
  <>We top the key up with $10–100, depending on what you are building.</>,
];

export default function HackathonPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="NEAR Hackathon"
        description={
          <>
            Credits for your team, and ten builds that ship fast on OutLayer.{' '}
            <a
              href="https://nearhackathon.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-text hover:underline"
            >
              nearhackathon.com ↗
            </a>{' '}
            · Submissions close Nov 14.
          </>
        }
        action={
          <a href={GRANT_FORM_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
            Request credits ↗
          </a>
        }
      />

      <div className="max-w-3xl space-y-4 text-sm text-muted-foreground">
        <p>
          OutLayer gives you out of the box: a TEE wallet under an owner policy, sealed secrets, private storage, VRF,
          HTTPS from the enclave, connectors, pay-per-call. You write normal code with HTTP calls and API keys, call it
          from a NEAR contract or over HTTPS, and every execution is attested by an Intel TDX quote that chains to
          Intel’s root certificate. You don’t trust us. You check Intel’s signature on the exact code that ran.
        </p>
        <div className="rounded-lg border border-border bg-card-muted p-4">
          <p className="mb-2 font-medium text-foreground">Point your coding agent at our skill and ship in one pass</p>
          <SkillUrlBox url={SKILL_URL} />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-foreground">$10–100 in credits on your payment key</h2>
      <div className="grid max-w-5xl gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {STEPS.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <a
              href={GRANT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonVariants()} mt-4`}
            >
              Request credits ↗
            </a>
            <p className="mt-3 text-xs text-faint-foreground">
              Credits pay for OutLayer calls: compute, wallet operations, connectors. They cannot be withdrawn or
              forwarded to other projects.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">Testnet is free</h3>
            <p className="mt-1.5">Build and debug there. Some features exist only on mainnet:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>NEAR Intents: swaps and cross-chain transfers from the agent wallet</li>
              <li>the Hyperliquid connector</li>
              <li>the Polymarket connector</li>
            </ul>
            <p className="mt-2">If your project uses any of these, that is what the credits are for.</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-foreground">Ten builds nobody expects</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {IDEAS.map((idea, i) => (
          <Card key={idea.title} className="h-full">
            <CardContent className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {i + 1}. {idea.title}
                </h3>
                <Badge variant="outline" className="shrink-0">
                  {idea.track}
                </Badge>
              </div>
              <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{idea.body}</p>
              <Link
                href={idea.start.href}
                className="mt-3 text-xs font-medium text-accent-text hover:underline"
              >
                Start from: {idea.start.label} →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 max-w-3xl rounded-lg border border-border bg-card-muted p-4 text-sm text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">Shipping something else?</h2>
        <p className="mt-2">
          The credits are not limited to these ten. Tell us what you are building in the{' '}
          <a
            href={GRANT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text hover:underline"
          >
            form
          </a>
          , or reach us on{' '}
          <a
            href="https://x.com/out_layer"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text hover:underline"
          >
            X
          </a>
          .
        </p>
      </div>
    </div>
  );
}
