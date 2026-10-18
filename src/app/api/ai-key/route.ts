import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyApiKey } from "@/lib/ai/claude";
import { HttpError, handleError } from "@/lib/api";
import { deleteUserSecret, setUserSecret } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({ apiKey: z.string().trim().startsWith("sk-ant-").max(300) });

export async function POST(request: Request) {
  try {
    const { user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    const { apiKey } = Body.parse(await request.json());
    if (!(await verifyApiKey(apiKey))) throw new HttpError(400, "That Claude API key did not work.");
    await setUserSecret(user.id, "anthropic_api_key", apiKey);
    return NextResponse.json({ saved: true, last4: apiKey.slice(-4) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const { user } = await requireUser();
    if (!user) throw new HttpError(401, "Sign in first.");
    await deleteUserSecret(user.id, "anthropic_api_key");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
