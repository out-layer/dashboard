import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Live products built on OutLayer: Voulai, near.email, TEE-secured price oracle, near.fm — verifiable compute and agent custody in production.',
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
