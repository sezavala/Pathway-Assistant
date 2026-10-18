import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeRefusalError } from "@/lib/ai/claude";
import { getUserSecret } from "@/lib/supabase/admin";
import { GoogleAuthExpiredError, getBusyBlocks, getGoogleAccessToken } from "@/lib/google/calendar";
import type { Preferences } from "@/lib/scheduler";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const PreferencesSchema = z.object({
  timeZone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown time zone"),
  dayStartHour: z.number().int().min(0).max(23).default(18),
  dayEndHour: z.number().int().min(1).max(24).default(22),
  maxSessionsPerDay: z.number().int().min(1).max(6).default(2),
  bufferMinutes: z.number().int().min(0).max(60).default(15),
}) satisfies z.ZodType<Preferences>;

export async function claudeKeyFor(userId: string) {
  const key = await getUserSecret(userId, "anthropic_api_key");
  if (!key) throw new HttpError(400, "Add your Claude API key in settings first.");
  return key;
}

export async function busyBlocksFor(userId: string, from: Date, to: Date) {
  const refreshToken = await getUserSecret(userId, "google_refresh_token");
  if (!refreshToken) throw new HttpError(409, "Connect Google Calendar by signing in again.");
  const accessToken = await getGoogleAccessToken(refreshToken);
  return getBusyBlocks(accessToken, from, to);
}

/** Turns known failures into clean JSON errors without leaking internals or secrets. */
export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }
  if (error instanceof GoogleAuthExpiredError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ClaudeRefusalError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: "Your Claude API key was rejected. Update it in settings." }, { status: 400 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "Claude rate limit reached. Try again shortly." }, { status: 429 });
  }
  console.error(error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
