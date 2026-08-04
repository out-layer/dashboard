'use client';

import { useNearWallet } from '@/contexts/NearWalletContext';
import ProductHome from '@/components/home/ProductHome';
import Overview from '@/components/home/Overview';

export default function Home() {
  const { isConnected } = useNearWallet();
  return isConnected ? <Overview /> : <ProductHome />;
}
