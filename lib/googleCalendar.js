const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";

function trimOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function getGoogleCalendarConfig() {
  const calendarId = trimOrNull(process.env.UGC_GOOGLE_CALENDAR_ID) || "primary";
  const clientId = trimOrNull(process.env.UGC_GOOGLE_CLIENT_ID);
  const clientSecret = trimOrNull(process.env.UGC_GOOGLE_CLIENT_SECRET);
  const refreshToken = trimOrNull(process.env.UGC_GOOGLE_REFRESH_TOKEN);
  const accessToken = trimOrNull(process.env.UGC_GOOGLE_ACCESS_TOKEN);

  return {
    calendarId,
    clientId,
    clientSecret,
    refreshToken,
    accessToken,
    configured: Boolean(accessToken || (clientId && clientSecret && refreshToken))
  };
}

async function exchangeRefreshToken(config) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google access token could not be refreshed");
  }

  return data.access_token;
}

export async function getGoogleAccessToken() {
  const config = getGoogleCalendarConfig();
  if (config.accessToken) return config.accessToken;
  if (config.clientId && config.clientSecret && config.refreshToken) {
    return exchangeRefreshToken(config);
  }
  throw new Error("Google Calendar is not configured");
}

function normalizeEvent(event) {
  const start = event.start?.dateTime || event.start?.date || null;
  const end = event.end?.dateTime || event.end?.date || null;
  return {
    id: event.id,
    summary: event.summary || "Untitled booking",
    description: event.description || "",
    location: event.location || "",
    htmlLink: event.htmlLink || "",
    status: event.status || "",
    start,
    end,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    attendees: event.attendees || [],
    organizer: event.organizer || null,
    creator: event.creator || null,
    updated: event.updated || null
  };
}

export async function listGoogleCalendarEvents({
  calendarId,
  timeMin,
  timeMax,
  maxResults = 24
} = {}) {
  const config = getGoogleCalendarConfig();
  if (!config.configured) {
    return {
      status: {
        configured: false,
        calendarId: config.calendarId,
        message: "Set Google Calendar credentials to load bookings."
      },
      events: []
    };
  }

  const token = await getGoogleAccessToken();
  const resolvedCalendarId = trimOrNull(calendarId) || config.calendarId;
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(Math.max(Number(maxResults) || 24, 1), 50)),
    showDeleted: "false"
  });

  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const response = await fetch(
    `${GOOGLE_EVENTS_URL}/${encodeURIComponent(resolvedCalendarId)}/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error_description || data.error || "Google Calendar events could not be loaded");
  }

  return {
    status: {
      configured: true,
      calendarId: resolvedCalendarId,
      authMode: config.accessToken ? "access_token" : "refresh_token"
    },
    events: Array.isArray(data.items) ? data.items.map(normalizeEvent) : []
  };
}
