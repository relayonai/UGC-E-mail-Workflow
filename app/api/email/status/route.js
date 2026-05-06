import { NextResponse } from "next/server";
import { getEmailStatus } from "../../../../lib/emailProvider.js";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ email: getEmailStatus() });
}
