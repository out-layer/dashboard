'use client';

import { useRequestInboxNudge } from '@/components/inbox/inboxNudge';

/**
 * Beside a policy that asks the owner before an operation. It draws nothing:
 * it asks the bell in the header to show its hint ("turn on notifications from
 * your agents") while this browser has no inbox session. A task an agent leaves
 * is encrypted for the browsers signed in when it is made, so signing in before
 * the first one arrives is what the hint is for; the wallet opens only from the
 * click inside the bell's prompt.
 */
export function ConfirmNeedsInbox() {
  useRequestInboxNudge();
  return null;
}
