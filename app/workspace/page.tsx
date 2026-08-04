import { redirect } from 'next/navigation';

// The workspace hub was absorbed by the Overview at `/` (USDC deposit included).
// The URL keeps working for old links and bookmarks.
export default function WorkspacePage() {
  redirect('/');
}
