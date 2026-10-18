import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRoadmap } from "@/lib/ai/claude";
import { HttpError, claudeKeyFor, handleError } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  quizAnswers: z.array(z.object({ question: z.string().max(1000), answer: z.string().max(2000) })).max(30).default([]),
  sessionsPerWeek: z.number().int().min(1).max(21).default(5),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    const body = Body.parse(await request.json());

    const { data: goal } = await supabase
      .from("goals")
      .select("title, prior_knowledge, session_minutes, wants_roadmap")
      .eq("id", id)
      .single();
    if (!goal) throw new HttpError(404, "Goal not found.");
    if (!goal.wants_roadmap) throw new HttpError(400, "This goal is set to not use a roadmap.");

    const roadmap = await generateRoadmap(await claudeKeyFor(user.id), {
      goal: goal.title,
      priorKnowledge: goal.prior_knowledge ?? "",
      quizAnswers: body.quizAnswers,
      sessionMinutes: goal.session_minutes,
      sessionsPerWeek: body.sessionsPerWeek,
    });

    // Replace any earlier roadmap for this goal.
    await supabase.from("roadmap_modules").delete().eq("goal_id", id);
    const { error } = await supabase.from("roadmap_modules").insert(
      roadmap.modules.map((m, position) => ({
        goal_id: id,
        position,
        title: m.title,
        summary: m.summary,
        objectives: m.objectives,
        resources: m.resources,
        estimated_sessions: Math.max(1, m.estimated_sessions),
        skipped_as_known: m.skipped_as_known,
      })),
    );
    if (error) throw new Error(error.message);
    await supabase.from("goals").update({ placement_answers: body.quizAnswers }).eq("id", id);

    return NextResponse.json(roadmap);
  } catch (error) {
    return handleError(error);
  }
}
