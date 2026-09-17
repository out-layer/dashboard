import { NextRequest, NextResponse } from 'next/server';

/**
 * The one step of connecting Gmail that cannot happen in the browser.
 *
 * Google issues a refresh token only in exchange for the authorisation code
 * AND the client secret, and the secret of a Web-application client cannot ship
 * in a bundle — anyone could then act as this app. So the exchange runs here,
 * server-side, and the token is handed straight back to the browser that just
 * consented. It is not written anywhere, not logged, and not kept: the browser
 * seals it to the keystore's key and stores it on chain, exactly as it does for
 * every other secret.
 *
 * Needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the server's
 * environment. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` carries the id to the browser,
 * which needs it to build the consent URL; the secret never leaves this file's
 * process.
 */
export async function POST(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          'This deployment has no Google OAuth client configured, so it cannot complete a connection. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      },
      { status: 503 },
    );
  }

  let code: unknown;
  let redirectUri: unknown;
  try {
    const body = await request.json();
    code = body?.code;
    redirectUri = body?.redirect_uri;
  } catch {
    return NextResponse.json({ error: 'Body is not JSON.' }, { status: 400 });
  }
  if (typeof code !== 'string' || !code.trim() || typeof redirectUri !== 'string' || !redirectUri.trim()) {
    return NextResponse.json(
      { error: 'Send `code` and `redirect_uri`, both as Google returned them.' },
      { status: 400 },
    );
  }

  const answer = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const result = await answer.json().catch(() => ({}));

  if (!answer.ok) {
    const kind = typeof result?.error === 'string' ? result.error : '';
    const detail = typeof result?.error_description === 'string' ? result.error_description : '';
    // Both of these mean "start again", and saying so beats a caller retrying a
    // code that can never work twice.
    if (kind === 'invalid_grant' || kind === 'redirect_uri_mismatch') {
      return NextResponse.json(
        {
          error: `Google refused this authorisation code (${kind}${detail ? `: ${detail}` : ''}). A code is single-use and lives minutes, and it only works with the exact address it was issued for. Start the connection again.`,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `Google refused the exchange (HTTP ${answer.status}${kind ? ` ${kind}` : ''}${detail ? `: ${detail}` : ''}).` },
      { status: 502 },
    );
  }

  const refreshToken = typeof result?.refresh_token === 'string' ? result.refresh_token.trim() : '';
  if (!refreshToken) {
    // Google returns one only when the consent asked for offline access and was
    // forced. Without it there is nothing durable to store and the agent would
    // stop working within the hour.
    return NextResponse.json(
      {
        error:
          'Google returned no refresh token for this consent. It is given only when the consent is asked for with offline access and forced — an account that granted this app before is otherwise sent back without one. Remove the app at myaccount.google.com/permissions and connect again.',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ refresh_token: refreshToken });
}
