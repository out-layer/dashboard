'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * The link a sponsor hands out: `/redeem?code=spn_…`. It only carries the code
 * to the page that creates an agent, where the owner clicks.
 */
export default function RedeemPage() {
  return (
    <Suspense fallback={null}>
      <RedeemRedirect />
    </Suspense>
  );
}

function RedeemRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const code = searchParams.get('code');
    router.replace(code ? `/wallet/new?code=${encodeURIComponent(code)}` : '/wallet/new');
  }, [router, searchParams]);
  return null;
}
