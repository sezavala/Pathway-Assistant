import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, handleError } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  outcome: z.enum(["done", "skipped"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    const { outcome, reason } = Body.parse(await request.json());

    const { data: session } = await supabase.from("sessions").select("id").eq("id", id).single();
    if (!session) throw new HttpError(404, "Session not found.");

    const { error } = await supabase.from("checkins").insert({ session_id: id, outcome, reason });
    if (error) throw new Error(error.message);
    await supabase.from("sessions").update({ status: outcome }).eq("id", id);

    return NextResponse.json({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
