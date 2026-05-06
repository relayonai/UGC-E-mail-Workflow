import { NextResponse } from "next/server";
import { createCreator, listCreators } from "../../../lib/db.js";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ creators: listCreators() });
}

export async function POST(request) {
  const input = await request.json();
  if (!input.name || !input.email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  return NextResponse.json({ creator: createCreator(input) }, { status: 201 });
}
