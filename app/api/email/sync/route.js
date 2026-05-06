import { NextResponse } from "next/server";
import { syncInboxReplies } from "../../../../lib/emailService.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncInboxReplies();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
