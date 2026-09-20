import { NextRequest, NextResponse } from 'next/server';

/**
 * The one step of connecting GitHub that cannot happen in the browser.
 *
 * GitHub issues a user token only in exchange for the authorisation code AND
 * the app's client secret, and that secret cannot ship in a bundle — anyone
 * could then act as this app. So the exchange runs here, server-side, and the
 * token is handed straight back to the browser that just authorised. It is not
 * written anywhere, not logged, and not kept: the browser seals it to the
 * keystore's key and stores it on chain, as it does every other secret.
 *
 * Needs `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` in the server's
 * environment. `NEXT_PUBLIC_GITHUB_APP_CLIENT_ID` and
 * `NEXT_PUBLIC_GITHUB_APP_SLUG` carry the public half to the browser, which
 * builds the links to GitHub from them.
 *
 * The app's registration is part of the flow: Callback URL and Setup URL are
 * both `<origin>/connect/github`, "Redirect on update" is ON, and "Request user
 * authorization (OAuth) during installation" is OFF — see the page's header.
 *
 * The app has "Expire user authorization tokens" OFF, so what comes back is one
 * token with no expiry and no refresh token. A token that DOES carry an expiry
 * means that setting was turned on, and the connection would die within hours:
 * that is refused here, where an operator can see why, rather than stored.
 *
 * Statuses are 4xx or 503, never 502/504: those are replaced by the CDN's own
 * page and the explanation is lost.
 */
export async function POST(request: NextRequest) {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'This deployment has no GitHub App configured, so it cannot complete a connection. Set GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET.' },
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
    return NextResponse.json({ error: 'Send `code` and `redirect_uri`, both as GitHub returned them.' }, { status: 400 });
  }

  let answer: Response;
  try {
    answer = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    });
  } catch {
    return NextResponse.json({ error: 'GitHub could not be reached to complete the connection. Try again in a moment.' }, { status: 503 });
  }

  // GitHub answers 200 for a refusal too, with `error` in the body.
  const result = await answer.json().catch(() => ({}));
  const kind = typeof result?.error === 'string' ? result.error : '';
  if (!answer.ok || kind) {
    const detail = typeof result?.error_description === 'string' ? result.error_description : '';
    if (kind === 'bad_verification_code' || kind === 'redirect_uri_mismatch') {
      return NextResponse.json(
        { error: `GitHub refused this authorisation code (${kind}${detail ? `: ${detail}` : ''}). A code is single-use and lives ten minutes, and it only works with the exact address it was issued for. Start the connection again.` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `GitHub refused the exchange (${kind || `HTTP ${answer.status}`}${detail ? `: ${detail}` : ''}).` },
      { status: answer.status >= 500 ? 503 : 400 },
    );
  }

  const token = typeof result?.access_token === 'string' ? result.access_token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'GitHub answered without a token. Start the connection again.' }, { status: 400 });
  }
  if (result?.expires_in || result?.refresh_token) {
    return NextResponse.json(
      { error: 'GitHub issued a token that expires. The OutLayer GitHub App must have "Expire user authorization tokens" turned off; with it on, a stored connection stops working within hours. Nothing was connected.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ token });
}
