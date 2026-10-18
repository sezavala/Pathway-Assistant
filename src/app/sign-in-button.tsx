"use client";

import { createClient } from "@/lib/supabase/client";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

export function SignInButton() {
  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: CALENDAR_SCOPE,
        redirectTo: `${window.location.origin}/auth/callback`,
        // offline + consent makes Google issue a refresh token.
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  return (
    <button
      onClick={signIn}
      className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500"
    >
      Sign in with Google
    </button>
  );
}
