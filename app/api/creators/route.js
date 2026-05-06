import { NextResponse } from "next/server";
import { createCreator, listCreators } from "../../../lib/db.js";
import { exportCreatorsToSpreadsheet, syncCreatorsWithSpreadsheet } from "../../../lib/spreadsheetSync.js";

export const runtime = "nodejs";

export async function GET() {
  let spreadsheet = null;
  try {
    spreadsheet = await syncCreatorsWithSpreadsheet();
  } catch (error) {
    spreadsheet = { enabled: true, error: error.message };
  }
  return NextResponse.json({ creators: listCreators(), spreadsheet });
}

export async function POST(request) {
  const input = await request.json();
  if (!input.name || !input.email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  const creator = createCreator(input);
  let spreadsheet = null;
  try {
    spreadsheet = await exportCreatorsToSpreadsheet();
  } catch (error) {
    spreadsheet = { enabled: true, error: error.message };
  }
  return NextResponse.json({ creator, spreadsheet }, { status: 201 });
}
