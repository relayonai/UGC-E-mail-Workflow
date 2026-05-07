const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function trimOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function getGoogleOAuthConfig() {
  const clientId = trimOrNull(process.env.UGC_GOOGLE_CLIENT_ID);
  const clientSecret = trimOrNull(process.env.UGC_GOOGLE_CLIENT_SECRET);
  const redirectUri = trimOrNull(process.env.UGC_GOOGLE_REDIRECT_URI) || "http://localhost:3000/api/google/oauth/callback";
  const scope = trimOrNull(process.env.UGC_GOOGLE_OAUTH_SCOPE) || "https://www.googleapis.com/auth/calendar.readonly";

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope,
    configured: Boolean(clientId && clientSecret)
  };
}

export function buildGoogleAuthUrl(state = "ugc-google-calendar") {
  const config = getGoogleOAuthConfig();
  if (!config.clientId) {
    throw new Error("UGC_GOOGLE_CLIENT_ID is required");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(code) {
  const config = getGoogleOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google OAuth client credentials are not configured");
  }

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google OAuth code exchange failed");
  }

  return {
    accessToken: data.access_token || "",
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || null,
    scope: data.scope || config.scope,
    tokenType: data.token_type || "Bearer"
  };
}
