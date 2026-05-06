import { NextResponse } from "next/server";
import { advanceStage } from "../../../../../lib/emailService.js";
import { exportCreatorsToSpreadsheet } from "../../../../../lib/spreadsheetSync.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const input = await request.json();
  const creator = advanceStage(id, input.workflow_stage);
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  let spreadsheet = null;
  try {
    spreadsheet = await exportCreatorsToSpreadsheet();
  } catch (error) {
    spreadsheet = { enabled: true, error: error.message };
  }
  return NextResponse.json({ creator, spreadsheet });
}
