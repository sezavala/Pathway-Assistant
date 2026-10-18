import { redirect } from "next/navigation";
import { getSecretLast4 } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createGoal, signOut } from "./actions";
import { ApiKeyForm, CatchUp, CheckIn, ScheduleButton } from "./client-parts";

// A deliberately plain V1 dashboard. Placement quiz and roadmap screens call
// /api/goals/[id]/quiz and /api/goals/[id]/roadmap and are the next UI to build.
export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const now = new Date().toISOString();
  const [{ data: goals }, { data: sessions }, keyLast4] = await Promise.all([
    supabase.from("goals").select("id, title").order("created_at"),
    supabase
      .from("sessions")
      .select("id, title, starts_at, ends_at, status")
      .gte("ends_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
      .order("starts_at")
      .limit(30),
    getSecretLast4(user.id, "anthropic_api_key"),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Smart Calendar</h1>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 underline">Sign out</button>
        </form>
      </header>

      <CatchUp />

      <section>
        <ApiKeyForm last4={keyLast4} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Goals</h2>
        {(goals ?? []).map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded border p-3">
            <span>{g.title}</span>
            <ScheduleButton goalId={g.id} />
          </div>
        ))}
        <form action={createGoal} className="flex flex-col gap-2 rounded border p-4">
          <input name="title" required placeholder="What do you want to learn? e.g. Robotics engineering" className="rounded border px-3 py-2" />
          <textarea
            name="priorKnowledge"
            rows={4}
            placeholder="What you already know: paste courses you've taken, projects, tools you've used"
            className="rounded border px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="wantsRoadmap" defaultChecked /> Build me a roadmap
          </label>
          <label className="flex items-center gap-2 text-sm">
            Session length (minutes)
            <input name="sessionMinutes" type="number" defaultValue={60} min={15} max={240} className="w-20 rounded border px-2 py-1" />
          </label>
          <button className="self-start rounded bg-indigo-600 px-4 py-2 text-white">Add goal</button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Upcoming sessions</h2>
        {(sessions ?? []).length === 0 && <p className="text-sm text-zinc-500">Nothing planned yet.</p>}
        {(sessions ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border p-3">
            <span>
              <span className="font-medium">{s.title}</span>{" "}
              <span className="text-sm text-zinc-500">{new Date(s.starts_at).toLocaleString()}</span>
            </span>
            {s.status === "planned" && s.starts_at <= now ? <CheckIn sessionId={s.id} /> : (
              <span className="text-sm text-zinc-500">{s.status}</span>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
