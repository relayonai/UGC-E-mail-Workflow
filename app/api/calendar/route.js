import { NextResponse } from "next/server";
import { listCalendarNotes, saveCalendarNote } from "../../../lib/db.js";
import { getGoogleCalendarConfig, listGoogleCalendarEvents } from "../../../lib/googleCalendar.js";

export const runtime = "nodejs";

function resolveWindow(searchParams) {
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");
  const maxResults = Number(searchParams.get("maxResults") || 24);
  return { timeMin, timeMax, maxResults };
}

export async function GET(request) {
  const url = new URL(request.url);
  const calendarId = url.searchParams.get("calendarId") || getGoogleCalendarConfig().calendarId;
  const window = resolveWindow(url.searchParams);
  const { status, events } = await listGoogleCalendarEvents({
    calendarId,
    ...window
  });
  const notes = listCalendarNotes(calendarId);
  const notesByEvent = new Map(notes.map((note) => [note.event_id, note]));

  return NextResponse.json({
    calendar: status,
    events: events.map((event) => ({
      ...event,
      notes: notesByEvent.get(event.id)?.notes || "",
      script: notesByEvent.get(event.id)?.script || "",
      local: notesByEvent.get(event.id) || null
    }))
  });
}

export async function PATCH(request) {
  const input = await request.json();
  if (!input?.eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const saved = saveCalendarNote(input.calendarId || "primary", input.eventId, {
    notes: input.notes || "",
    script: input.script || "",
    event_data: input.eventData || {}
  });

  return NextResponse.json({ note: saved });
}
