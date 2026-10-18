import { NextResponse } from "next/server";
import { generatePlacementQuiz } from "@/lib/ai/claude";
import { HttpError, claudeKeyFor, handleError } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");

    const { data: goal } = await supabase.from("goals").select("title, prior_knowledge").eq("id", id).single();
    if (!goal) throw new HttpError(404, "Goal not found.");

    const quiz = await generatePlacementQuiz(await claudeKeyFor(user.id), goal.title, goal.prior_knowledge ?? "");
    await supabase.from("goals").update({ placement_quiz: quiz }).eq("id", id);
    return NextResponse.json(quiz);
  } catch (error) {
    return handleError(error);
  }
}
