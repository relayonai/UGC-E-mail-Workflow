import { NextResponse } from "next/server";
import { syncInboxReplies } from "../../../../lib/emailService.js";
import { exportCreatorsToSpreadsheet } from "../../../../lib/spreadsheetSync.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncInboxReplies();
    let spreadsheet = null;
    try {
      spreadsheet = await exportCreatorsToSpreadsheet();
    } catch (error) {
      spreadsheet = { enabled: true, error: error.message };
    }
    return NextResponse.json({ ...result, spreadsheet });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
