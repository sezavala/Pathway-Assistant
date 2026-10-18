import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, PreferencesSchema, busyBlocksFor, handleError } from "@/lib/api";
import { rescheduleMissed, type PlannedSession } from "@/lib/scheduler";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({ prefs: PreferencesSchema });
const HORIZON_DAYS = 14;

// Called when the dashboard opens: any planned session that ended without a
// check-in is marked missed and moved to the next free slot. No background job.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    const { prefs } = Body.parse(await request.json());

    const now = new Date();
    const { data: rows } = await supabase
      .from("sessions")
      .select("id, goal_id, module_id, title, starts_at, ends_at, status")
      .eq("status", "planned");
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    const sessions: PlannedSession[] = (rows ?? []).map((r) => ({
      id: r.id,
      start: new Date(r.starts_at),
      end: new Date(r.ends_at),
      status: r.status,
    }));
    if (!sessions.some((s) => s.end <= now)) return NextResponse.json({ moved: [] });

    const busy = await busyBlocksFor(user.id, now, new Date(now.getTime() + HORIZON_DAYS * 86_400_000));
    const moves = rescheduleMissed(sessions, now, busy, prefs, HORIZON_DAYS);

    const missedIds = sessions.filter((s) => s.end <= now).map((s) => s.id);
    await supabase.from("sessions").update({ status: "missed" }).in("id", missedIds);

    const replacements = moves.map((m) => {
      const original = byId.get(m.missedId)!;
      return {
        goal_id: original.goal_id,
        module_id: original.module_id,
        title: original.title,
        starts_at: m.replacement.start.toISOString(),
        ends_at: m.replacement.end.toISOString(),
        rescheduled_from: m.missedId,
      };
    });
    if (replacements.length) {
      const { error } = await supabase.from("sessions").insert(replacements);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ moved: replacements, unplaced: missedIds.length - replacements.length });
  } catch (error) {
    return handleError(error);
  }
}
