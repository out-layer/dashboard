import { redirect } from 'next/navigation';

/** The connector docs live on one page now; this route keeps old links working. */
export default function SubscriptionsDocsRedirect() {
  redirect('/docs/connectors#subscriptions');
}
