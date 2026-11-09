import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NEAR Hackathon',
  description:
    'OutLayer credits for NEAR Hackathon teams, and ten builds that ship fast on OutLayer: TEE wallets, sealed secrets, VRF, HTTPS from the enclave, connectors, pay-per-call.',
};

export default function HackathonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
