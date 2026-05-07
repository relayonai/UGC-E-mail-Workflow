import { NextResponse } from "next/server";
import { exchangeGoogleAuthCode, getGoogleOAuthConfig } from "../../../../../lib/googleOAuth.js";

export const runtime = "nodejs";

function successHtml(payload) {
  const refresh = payload.refreshToken ? "Refresh token received." : "No refresh token was returned. Google may have already granted access before; try again with consent if you need a new refresh token.";
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Google OAuth Complete</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 32px; background: #f6f7f9; color: #20242a; }
        .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #d9dee7; border-radius: 10px; padding: 24px; }
        h1 { margin: 0 0 12px; font-size: 22px; }
        p, pre { margin: 0 0 12px; line-height: 1.5; }
        code, pre { background: #f1f5f9; border-radius: 6px; padding: 12px; display: block; overflow: auto; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Google OAuth complete</h1>
        <p>Authorization code exchanged successfully.</p>
        <p>${refresh}</p>
        <pre>${JSON.stringify(payload, null, 2)}</pre>
        <p>Copy the refresh token into <code>.env.local</code> as <code>UGC_GOOGLE_REFRESH_TOKEN</code>.</p>
      </div>
    </body>
  </html>`;
}

function errorHtml(message) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Google OAuth Error</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 32px; background: #f6f7f9; color: #20242a; }
        .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #d9dee7; border-radius: 10px; padding: 24px; }
        h1 { margin: 0 0 12px; font-size: 22px; }
        p { margin: 0 0 12px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Google OAuth error</h1>
        <p>${message}</p>
      </div>
    </body>
  </html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new NextResponse(errorHtml(error), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 400
    });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const config = getGoogleOAuthConfig();
    return NextResponse.json(
      {
        error: "Missing authorization code",
        redirectUri: config.redirectUri,
        hint: "Register this exact URI in the Google OAuth client."
      },
      { status: 400 }
    );
  }

  try {
    const payload = await exchangeGoogleAuthCode(code);
    return new NextResponse(successHtml(payload), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (exchangeError) {
    return new NextResponse(errorHtml(exchangeError?.message || "Google OAuth code exchange failed"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 500
    });
  }
}
