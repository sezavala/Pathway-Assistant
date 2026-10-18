"use client";

import { useEffect, useState } from "react";

function browserPrefs() {
  return { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

/** Moves missed sessions forward each time the dashboard opens. */
export function CatchUp() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/sessions/catch-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: browserPrefs() }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setMessage(json.error);
        else if (json.moved?.length) {
          setMessage(`Moved ${json.moved.length} missed session(s) to your next free time.`);
        }
      });
  }, []);
  return message ? <p className="rounded bg-amber-100 p-3 text-sm text-amber-900">{message}</p> : null;
}

export function ApiKeyForm({ last4 }: { last4: string | null }) {
  const [status, setStatus] = useState(last4 ? `Saved key ending in ${last4}` : "No key saved");

  async function save(formData: FormData) {
    const res = await fetch("/api/ai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: formData.get("apiKey") }),
    });
    const json = await res.json();
    setStatus(json.error ?? `Saved key ending in ${json.last4}`);
  }

  return (
    <form action={save} className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="apiKey">
        Claude API key
      </label>
      <div className="flex gap-2">
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button className="rounded bg-indigo-600 px-4 py-2 text-white">Save</button>
      </div>
      <p className="text-sm text-zinc-500">{status}. Stored encrypted; only used on our server.</p>
    </form>
  );
}

export function ScheduleButton({ goalId }: { goalId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  async function schedule() {
    setStatus("Finding free time...");
    const res = await fetch(`/api/goals/${goalId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: browserPrefs() }),
    });
    const json = await res.json();
    setStatus(json.error ?? `Planned ${json.sessions.length} session(s).`);
    if (!json.error) location.reload();
  }
  return (
    <span className="flex items-center gap-2">
      <button onClick={schedule} className="rounded border px-3 py-1 text-sm">
        Schedule sessions
      </button>
      {status && <span className="text-sm text-zinc-500">{status}</span>}
    </span>
  );
}

export function CheckIn({ sessionId }: { sessionId: string }) {
  const [done, setDone] = useState(false);
  async function send(outcome: "done" | "skipped") {
    const reason = outcome === "skipped" ? prompt("What got in the way? (optional)") ?? undefined : undefined;
    await fetch(`/api/sessions/${sessionId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, reason }),
    });
    setDone(true);
  }
  if (done) return <span className="text-sm text-zinc-500">Checked in</span>;
  return (
    <span className="flex gap-2">
      <button onClick={() => send("done")} className="rounded border px-2 py-1 text-sm">
        Done
      </button>
      <button onClick={() => send("skipped")} className="rounded border px-2 py-1 text-sm">
        Skipped
      </button>
    </span>
  );
}
