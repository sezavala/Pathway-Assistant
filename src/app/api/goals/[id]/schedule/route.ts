import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, PreferencesSchema, busyBlocksFor, handleError } from "@/lib/api";
import { planSessions } from "@/lib/scheduler";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  prefs: PreferencesSchema,
  days: z.number().int().min(1).max(28).default(14),
});

const DAY = 86_400_000;

// Places the next unscheduled roadmap sessions into free time. V1 shows them in
// the app only; nothing is written back to Google Calendar.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    const { prefs, days } = Body.parse(await request.json());

    const { data: goal } = await supabase.from("goals").select("title, session_minutes").eq("id", id).single();
    if (!goal) throw new HttpError(404, "Goal not found.");

    const now = new Date();
    const to = new Date(now.getTime() + days * DAY);

    const [{ data: modules }, { data: existing }, busy] = await Promise.all([
      supabase
        .from("roadmap_modules")
        .select("id, title, estimated_sessions")
        .eq("goal_id", id)
        .eq("skipped_as_known", false)
        .order("position"),
      supabase.from("sessions").select("goal_id, module_id, starts_at, ends_at, status").gte("ends_at", now.toISOString()),
      busyBlocksFor(user.id, now, to),
    ]);

    // Work out which module each still-needed session belongs to.
    const { data: counted } = await supabase
      .from("sessions")
      .select("module_id")
      .eq("goal_id", id)
      .in("status", ["planned", "done"]);
    const done = new Map<string, number>();
    for (const s of counted ?? []) if (s.module_id) done.set(s.module_id, (done.get(s.module_id) ?? 0) + 1);
    const needed = (modules ?? []).flatMap((m) =>
      Array.from({ length: Math.max(0, m.estimated_sessions - (done.get(m.id) ?? 0)) }, () => m),
    );

    if ((modules ?? []).length > 0 && needed.length === 0) {
      return NextResponse.json({ sessions: [], unplaced: 0 });
    }

    const slots = planSessions({
      from: now,
      days,
      count: needed.length || 1,
      sessionMinutes: goal.session_minutes,
      busy,
      existing: (existing ?? [])
        .filter((s) => s.status === "planned")
        .map((s) => ({ start: new Date(s.starts_at), end: new Date(s.ends_at) })),
      prefs,
    });

    const rows = slots.map((slot, i) => ({
      goal_id: id,
      module_id: needed[i]?.id ?? null,
      title: needed[i]?.title ?? goal.title,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
    }));
    const { data: inserted, error } = await supabase.from("sessions").insert(rows).select();
    if (error) throw new Error(error.message);

    return NextResponse.json({ sessions: inserted, unplaced: Math.max(0, needed.length - slots.length) });
  } catch (error) {
    return handleError(error);
  }
}
