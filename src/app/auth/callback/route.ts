import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setUserSecret } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?error=missing_code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/?error=sign_in_failed`);

  // Google only returns a refresh token when the user grants consent, so store
  // it (encrypted) the moment we get it. Supabase does not keep it for us.
  const refreshToken = data.session.provider_refresh_token;
  if (refreshToken) {
    await setUserSecret(data.session.user.id, "google_refresh_token", refreshToken);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
