"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const GoalForm = z.object({
  title: z.string().trim().min(1).max(200),
  priorKnowledge: z.string().trim().max(8000),
  wantsRoadmap: z.boolean(),
  sessionMinutes: z.coerce.number().int().min(15).max(240),
});

export async function createGoal(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) throw new Error("Sign in first.");
  const form = GoalForm.parse({
    title: formData.get("title"),
    priorKnowledge: formData.get("priorKnowledge") ?? "",
    wantsRoadmap: formData.get("wantsRoadmap") === "on",
    sessionMinutes: formData.get("sessionMinutes"),
  });

  // V1 has a single Skills track; it is created on first use.
  let { data: track } = await supabase.from("tracks").select("id").eq("name", "Skills").maybeSingle();
  if (!track) {
    const created = await supabase.from("tracks").insert({ name: "Skills" }).select("id").single();
    if (created.error) throw new Error(created.error.message);
    track = created.data;
  }

  const { error } = await supabase.from("goals").insert({
    track_id: track.id,
    title: form.title,
    prior_knowledge: form.priorKnowledge || null,
    wants_roadmap: form.wantsRoadmap,
    session_minutes: form.sessionMinutes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/");
}
