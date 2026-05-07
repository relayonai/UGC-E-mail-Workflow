"use client";

import { useEffect, useMemo, useState } from "react";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfGrid(date) {
  const monthStart = startOfMonth(date);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - monthStart.getDay());
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function shortDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function timeRange(event) {
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : null;
  if (!start) return "Time not set";
  if (event.allDay) return "All day";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${formatter.format(start)} - ${end ? formatter.format(end) : ""}`.trim();
}

function eventColor(event) {
  if (event.script?.trim()) return "script";
  if (event.notes?.trim()) return "notes";
  return "plain";
}

export default function CalendarPage() {
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const windowRange = useMemo(() => {
    const start = startOfGrid(monthAnchor);
    const end = addDays(start, 41);
    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString()
    };
  }, [monthAnchor]);

  async function loadCalendar() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams(windowRange);
      const response = await fetch(`/api/calendar?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Calendar could not be loaded.");
        return;
      }

      setCalendar(data.calendar || null);
      setEvents(data.events || []);
      const match = data.events.find((event) => event.id === selectedEventId);
      const fallback = data.events[0] || null;
      const nextSelected = match || fallback;
      if (nextSelected) {
        setSelectedEventId(nextSelected.id);
        setNotesDraft(nextSelected.notes || "");
        setScriptDraft(nextSelected.script || "");
      } else {
        setSelectedEventId("");
        setNotesDraft("");
        setScriptDraft("");
      }
    } catch (loadError) {
      setError(loadError?.message || "Calendar could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadCalendar();
  }, [windowRange.timeMin, windowRange.timeMax]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  useEffect(() => {
    if (!selectedEvent) return;
    setNotesDraft(selectedEvent.notes || "");
    setScriptDraft(selectedEvent.script || "");
  }, [selectedEventId, selectedEvent?.notes, selectedEvent?.script]);

  const gridDays = useMemo(() => {
    const cells = [];
    const start = startOfGrid(monthAnchor);
    for (let index = 0; index < 42; index += 1) {
      const date = addDays(start, index);
      const key = toDateKey(date);
      cells.push({
        date,
        key,
        inMonth: date.getMonth() === monthAnchor.getMonth(),
        events: events.filter((event) => {
          const eventDate = event.start ? new Date(event.start) : null;
          return eventDate && toDateKey(eventDate) === key;
        })
      });
    }
    return cells;
  }, [events, monthAnchor]);

  const dayEvents = useMemo(() => {
    if (!selectedEvent) return [];
    const selectedDate = selectedEvent.start ? toDateKey(new Date(selectedEvent.start)) : null;
    return events.filter((event) => event.start && toDateKey(new Date(event.start)) === selectedDate);
  }, [events, selectedEvent]);

  async function saveNotes() {
    if (!selectedEvent) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          calendarId: calendar?.calendarId || "primary",
          notes: notesDraft,
          script: scriptDraft,
          eventData: selectedEvent
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Notes could not be saved.");
        return;
      }
      setEvents((items) =>
        items.map((item) =>
          item.id === selectedEvent.id
            ? { ...item, notes: notesDraft, script: scriptDraft, local: data.note }
            : item
        )
      );
      setNotice("Booking notes saved.");
    } catch (saveError) {
      setError(saveError?.message || "Notes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setNotice("Copied to clipboard.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Calendar</h1>
        <span>
          {calendar?.configured
            ? `Google Calendar connected · ${calendar.calendarId || "primary"}`
            : "Google Calendar not connected"}
        </span>
      </header>

      <div className="calendar-page">
        <section className="section calendar-section">
          <div className="section-header">
            <h2>{monthLabel(monthAnchor)}</h2>
            <div className="header-actions">
              <button onClick={() => setMonthAnchor(startOfMonth(new Date()))}>Today</button>
              <button onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>Prev</button>
              <button onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>Next</button>
              <button className="primary" disabled={busy} onClick={loadCalendar}>Refresh</button>
            </div>
          </div>

          <div className="panel-body">
            {error && <div className="notice danger">{error}</div>}
            {notice && <div className="notice ok">{notice}</div>}
            {!calendar?.configured && (
              <div className="notice warn">
                Add Google Calendar credentials in `.env.local` to load live bookings.
              </div>
            )}
            <div className="calendar-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="calendar-weekday">{day}</div>
              ))}
              {gridDays.map((cell) => (
                <button
                  key={cell.key}
                  type="button"
                  className={cell.inMonth ? "calendar-day" : "calendar-day muted"}
                  onClick={() => {
                    const first = cell.events[0];
                    if (first) setSelectedEventId(first.id);
                  }}
                >
                  <span className="calendar-day-number">{cell.date.getDate()}</span>
                  <div className="calendar-day-events">
                    {cell.events.slice(0, 3).map((event) => (
                      <span key={event.id} className={`calendar-event-pill ${eventColor(event)}`}>
                        {event.summary}
                      </span>
                    ))}
                    {cell.events.length > 3 && (
                      <span className="calendar-event-pill more">+{cell.events.length - 3} more</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="side-stack">
          <section className="section">
            <div className="section-header">
              <h3>Booking</h3>
              <div className="header-actions">
                <button disabled={!selectedEvent} onClick={() => selectedEvent && copyText(selectedEvent.htmlLink || selectedEvent.summary)}>Copy link</button>
                <button disabled={!selectedEvent?.htmlLink} onClick={() => selectedEvent && window.open(selectedEvent.htmlLink, "_blank", "noopener,noreferrer")}>Open in Calendar</button>
              </div>
            </div>
            <div className="panel-body booking-panel">
              {selectedEvent ? (
                <>
                  <div className="booking-title">
                    <strong>{selectedEvent.summary}</strong>
                    <span>{shortDateTime(selectedEvent.start)} · {timeRange(selectedEvent)}</span>
                  </div>
                  <div className="booking-meta">
                    <div>
                      <span className="label">location</span>
                      <strong>{selectedEvent.location || "No location set"}</strong>
                    </div>
                    <div>
                      <span className="label">attendees</span>
                      <strong>{selectedEvent.attendees?.length || 0}</strong>
                    </div>
                    <div>
                      <span className="label">status</span>
                      <strong>{selectedEvent.status || "confirmed"}</strong>
                    </div>
                  </div>
                  <div className="booking-description">
                    <span className="label">description</span>
                    <p>{selectedEvent.description || "No booking description provided."}</p>
                  </div>
                </>
              ) : (
                <div className="empty">Select a booking to view details.</div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h3>Meeting Script</h3>
              <div className="header-actions">
                <button disabled={!selectedEvent} onClick={() => selectedEvent && copyText(`${notesDraft}\n\n${scriptDraft}`.trim())}>Copy notes</button>
                <button className="primary" disabled={!selectedEvent || saving} onClick={saveNotes}>Save Notes</button>
              </div>
            </div>
            <div className="panel-body calendar-notes-panel">
              <label>
                <span className="label">booking notes</span>
                <textarea
                  className="template-editor calendar-textarea"
                  value={notesDraft}
                  disabled={!selectedEvent}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Add booking context, client details, reminders, or follow-up items."
                />
              </label>
              <label>
                <span className="label">meeting script</span>
                <textarea
                  className="template-editor calendar-textarea"
                  value={scriptDraft}
                  disabled={!selectedEvent}
                  onChange={(event) => setScriptDraft(event.target.value)}
                  placeholder="Write the call flow, prompts, objections, or talking points here."
                />
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h3>Agenda</h3>
            </div>
            <div className="panel-body agenda-list">
              {dayEvents.length ? (
                dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={event.id === selectedEventId ? "agenda-item selected" : "agenda-item"}
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    <strong>{event.summary}</strong>
                    <span>{timeRange(event)}</span>
                  </button>
                ))
              ) : (
                <div className="empty">No booking selected.</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
