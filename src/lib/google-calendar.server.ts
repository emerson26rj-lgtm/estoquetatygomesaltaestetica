// Server-only helpers for Google Calendar per-professional OAuth + event sync.
// Never import this at module scope from a `.functions.ts` file (loaded via
// dynamic import inside the handler instead).

import { createClient } from "@supabase/supabase-js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function getRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/google-oauth-callback`;
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  origin: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
  scope?: string;
}

export async function exchangeCode(params: {
  code: string;
  origin: string;
}): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth não configurado");
  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(params.origin),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth não configurado");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email?: string; sub?: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return res.json();
}

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns a valid access token for the professional, refreshing if needed. */
export async function getValidAccessToken(professionalId: string): Promise<string | null> {
  const db = adminClient();
  const { data: p } = await db
    .from("professionals")
    .select("google_access_token, google_refresh_token, google_token_expires_at")
    .eq("id", professionalId)
    .maybeSingle();
  if (!p?.google_refresh_token) return null;

  const expiresAt = p.google_token_expires_at ? new Date(p.google_token_expires_at).getTime() : 0;
  if (p.google_access_token && expiresAt - Date.now() > 60_000) return p.google_access_token;

  const tok = await refreshAccessToken(p.google_refresh_token);
  const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  await db
    .from("professionals")
    .update({ google_access_token: tok.access_token, google_token_expires_at: newExpires })
    .eq("id", professionalId);
  return tok.access_token;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  starts_at: string;
  ends_at: string;
}

export async function upsertCalendarEvent(params: {
  professionalId: string;
  calendarId?: string | null;
  eventId?: string | null;
  event: CalendarEventInput;
}): Promise<{ eventId: string; calendarId: string }> {
  const token = await getValidAccessToken(params.professionalId);
  if (!token) throw new Error("Profissional sem conta Google conectada");
  const calendarId = params.calendarId || "primary";
  const body = {
    summary: params.event.summary,
    description: params.event.description ?? "",
    start: { dateTime: new Date(params.event.starts_at).toISOString() },
    end: { dateTime: new Date(params.event.ends_at).toISOString() },
  };
  const url = params.eventId
    ? `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`
    : `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: params.eventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar erro: ${await res.text()}`);
  const data = await res.json();
  return { eventId: data.id, calendarId };
}

export async function deleteCalendarEvent(params: {
  professionalId: string;
  calendarId?: string | null;
  eventId: string;
}): Promise<void> {
  const token = await getValidAccessToken(params.professionalId);
  if (!token) return;
  const calendarId = params.calendarId || "primary";
  await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => undefined);
}
