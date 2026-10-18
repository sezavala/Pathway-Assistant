import "server-only";
import type { Interval } from "@/lib/scheduler";

// The narrowest Calendar scope that works: free/busy only. The app never sees
// event titles, descriptions or attendees, which keeps private details out of
// the database and out of anything sent to Claude.
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

export class GoogleAuthExpiredError extends Error {}

export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (res.status === 400 || res.status === 401) {
    // Revoked, or expired (Google expires refresh tokens after 7 days while the
    // OAuth app is in "Testing" mode). The user needs to sign in again.
    throw new GoogleAuthExpiredError("Google access expired; sign in again.");
  }
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function getBusyBlocks(accessToken: string, from: Date, to: Date): Promise<Interval[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  if (!res.ok) throw new Error(`Google free/busy request failed: ${res.status}`);
  const json = (await res.json()) as {
    calendars: Record<string, { busy: { start: string; end: string }[] }>;
  };
  return (json.calendars.primary?.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}
