import { NextResponse } from "next/server";
import { deleteCreator, getCreator, updateCreator } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { id } = await params;
  const creator = getCreator(id);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json({ creator });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const input = await request.json();
  const creator = updateCreator(id, input);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json({ creator });
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const deleted = deleteCreator(id);
  if (!deleted) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
