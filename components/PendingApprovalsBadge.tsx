'use client';

import { useInbox } from '@/contexts/InboxContext';

/**
 * How many approvals wait on the wallets the signed-in owner holds. Inside a
 * session only: without one nothing is asked and nothing is shown.
 */
export default function PendingApprovalsBadge() {
  const { session, approvals } = useInbox();
  if (session !== 'active' || approvals.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-destructive rounded-full">
      {approvals.length}
    </span>
  );
}
