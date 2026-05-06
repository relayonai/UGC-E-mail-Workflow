import { NextResponse } from "next/server";
import { receiveReply } from "../../../../../lib/emailService.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const input = await request.json();
  if (!input.body) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const creator = receiveReply(id, input);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const lastMessage = creator.message_history[creator.message_history.length - 1];
  return NextResponse.json({ creator, intent: lastMessage.intent });
}
