import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { NearWalletProvider } from '@/contexts/NearWalletContext';
import AppShell from '@/components/shell/AppShell';
import { SITE_ORIGIN } from '@/lib/site';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: 'OutLayer Dashboard',
    template: '%s · OutLayer',
  },
  description:
    'Verifiable compute and custody for AI agents. Agents run in Intel TDX enclaves, hold policy-guarded wallets, and leave cryptographic receipts on-chain.',
  icons: {
    icon: [
      { url: '/brand/mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/mark-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/brand/mark-192.png',
  },
  openGraph: {
    siteName: 'OutLayer',
    title: 'OutLayer Dashboard',
    description:
      'Verifiable compute and custody for AI agents — attested TDX execution, policy-guarded wallets, on-chain receipts.',
    images: ['/brand/mark-512.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
 <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <NearWalletProvider>
 <AppShell>{children}</AppShell>
          </NearWalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
