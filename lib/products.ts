// Products built on OutLayer — shown on /products and the anonymous home.
// Copy mirrors the outlayer.ai landing's products page; keep the two in sync.

export interface EcosystemProduct {
  name: string;
  tagline: string;
  url: string;
  /** Product favicon under public/products/. */
  icon: string;
  /** Which OutLayer pieces the product runs on. */
  uses: string[];
}

export const PRODUCTS: EcosystemProduct[] = [
  {
    name: 'Voulai',
    icon: '/products/voulai.svg',
    tagline:
      'A private AI agent trades your strategy. No one sees it — everyone sees the results.',
    url: 'https://voulai.xyz',
    uses: ['Agent custody', 'Confidential intents'],
  },
  {
    name: 'NEAR Email',
    icon: '/products/near-email.png',
    tagline: 'Secure, wallet-based encrypted email for the NEAR ecosystem.',
    url: 'https://near.email',
    uses: ['Verifiable compute', 'Encrypted secrets'],
  },
  {
    name: 'TEE-Secured Price Oracle',
    icon: '/products/price-oracle.png',
    tagline: 'On-demand oracle with sustainable economics for NEAR Protocol.',
    url: 'https://price-oracle.outlayer.ai',
    uses: ['Verifiable compute', 'Scheduler'],
  },
  {
    name: 'NEAR FM',
    icon: '/products/near-fm.png',
    tagline: 'AI music generation & social marketplace powered by OutLayer agents.',
    url: 'https://near.fm',
    uses: ['Verifiable compute', 'Agent custody'],
  },
];
