import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold">Smart Calendar</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Pick a goal, get a roadmap from Claude, and let it find study time around your Google
        Calendar. Miss a day and it reschedules for you.
      </p>
      <p className="text-sm text-zinc-500">
        We only read when you are busy, never your event details.
      </p>
      <div>
        <SignInButton />
      </div>
    </main>
  );
}
