import { NextResponse } from "next/server";
import { getCreator } from "../../../../../lib/db.js";
import { sendEmail } from "../../../../../lib/emailService.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const creator = getCreator(id);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const input = await request.json();
  if (!input.body) return NextResponse.json({ error: "body is required" }, { status: 400 });

  try {
    const updated = await sendEmail(creator, {
      subject: input.subject || `Meet Warren UGC - ${input.stage || creator.workflow_stage}`,
      body: input.body,
      stage: input.stage || creator.workflow_stage
    });

    return NextResponse.json({ creator: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
