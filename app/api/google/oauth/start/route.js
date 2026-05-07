import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, getGoogleOAuthConfig } from "../../../../../lib/googleOAuth.js";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "ugc-google-calendar";
  const config = getGoogleOAuthConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        error: "UGC_GOOGLE_CLIENT_ID and UGC_GOOGLE_CLIENT_SECRET must be set before starting OAuth"
      },
      { status: 400 }
    );
  }

  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
