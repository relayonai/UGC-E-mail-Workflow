import { NextResponse } from "next/server";
import { advanceStage } from "../../../../../lib/emailService.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const input = await request.json();
  const creator = advanceStage(id, input.workflow_stage);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json({ creator });
}
