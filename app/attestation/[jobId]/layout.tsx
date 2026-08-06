import type { Metadata } from 'next';

// Per-job metadata so a shared attestation link unfurls properly (X, Telegram,
// Slack). The page itself is a client component; only this layout runs on the
// server and can read the route params.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const title = `TEE Attestation — Job #${jobId}`;
  const description =
    'Hardware-attested OutLayer execution: Intel TDX quote, on-chain approved measurement and input/output commitments — verifiable by anyone, no trust required.';
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ['/brand/mark-512.png'],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function AttestationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
