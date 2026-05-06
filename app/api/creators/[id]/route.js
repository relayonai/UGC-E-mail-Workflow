import { NextResponse } from "next/server";
import { deleteCreator, getCreator, updateCreator } from "../../../../lib/db.js";
import { exportCreatorsToSpreadsheet } from "../../../../lib/spreadsheetSync.js";

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
  let spreadsheet = null;
  try {
    spreadsheet = await exportCreatorsToSpreadsheet();
  } catch (error) {
    spreadsheet = { enabled: true, error: error.message };
  }
  return NextResponse.json({ creator, spreadsheet });
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const deleted = deleteCreator(id);
  if (!deleted) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  let spreadsheet = null;
  try {
    spreadsheet = await exportCreatorsToSpreadsheet();
  } catch (error) {
    spreadsheet = { enabled: true, error: error.message };
  }
  return NextResponse.json({ deleted: true, spreadsheet });
}
