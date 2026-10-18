import { describe, expect, it } from "vitest";
import {
  findMissed,
  freeIntervals,
  planSessions,
  rescheduleMissed,
  studyWindows,
  zonedTimeToUtc,
  type PlannedSession,
  type Preferences,
} from "./scheduler";

const prefs: Preferences = {
  timeZone: "America/Los_Angeles",
  dayStartHour: 18,
  dayEndHour: 22,
  maxSessionsPerDay: 2,
  bufferMinutes: 15,
};

const at = (iso: string) => new Date(iso);

describe("zonedTimeToUtc", () => {
  it("converts Pacific daylight time", () => {
    expect(zonedTimeToUtc(2026, 10, 19, 18, "America/Los_Angeles").toISOString()).toBe(
      "2026-10-20T01:00:00.000Z",
    );
  });

  it("converts Pacific standard time after the DST change", () => {
    expect(zonedTimeToUtc(2026, 11, 2, 18, "America/Los_Angeles").toISOString()).toBe(
      "2026-11-03T02:00:00.000Z",
    );
  });
});

describe("studyWindows", () => {
  it("clips today's window to the current time", () => {
    // 19:30 Pacific on Oct 19
    const windows = studyWindows(at("2026-10-20T02:30:00Z"), 2, prefs);
    expect(windows[0].start.toISOString()).toBe("2026-10-20T02:30:00.000Z");
    expect(windows[1].start.toISOString()).toBe("2026-10-21T01:00:00.000Z");
  });
});

describe("freeIntervals", () => {
  it("removes busy blocks with a buffer on both sides", () => {
    const free = freeIntervals(
      [{ start: at("2026-10-20T01:00:00Z"), end: at("2026-10-20T05:00:00Z") }],
      [{ start: at("2026-10-20T02:00:00Z"), end: at("2026-10-20T03:00:00Z") }],
      15,
    );
    expect(free.map((f) => [f.start.toISOString(), f.end.toISOString()])).toEqual([
      ["2026-10-20T01:00:00.000Z", "2026-10-20T01:45:00.000Z"],
      ["2026-10-20T03:15:00.000Z", "2026-10-20T05:00:00.000Z"],
    ]);
  });
});

describe("planSessions", () => {
  const from = at("2026-10-19T15:00:00Z"); // 08:00 Pacific, Oct 19

  it("fills the earliest free evening time, two sessions a day at most", () => {
    const planned = planSessions({
      from,
      days: 3,
      count: 3,
      sessionMinutes: 60,
      busy: [],
      existing: [],
      prefs,
    });
    expect(planned.map((p) => p.start.toISOString())).toEqual([
      "2026-10-20T01:00:00.000Z", // Oct 19, 18:00
      "2026-10-20T02:15:00.000Z", // Oct 19, 19:15 (after the 15 min gap)
      "2026-10-21T01:00:00.000Z", // Oct 20, 18:00
    ]);
  });

  it("works around calendar events", () => {
    const planned = planSessions({
      from,
      days: 1,
      count: 1,
      sessionMinutes: 60,
      busy: [{ start: at("2026-10-20T01:00:00Z"), end: at("2026-10-20T02:30:00Z") }], // 18:00-19:30
      existing: [],
      prefs,
    });
    expect(planned[0].start.toISOString()).toBe("2026-10-20T02:45:00.000Z"); // 19:45
  });

  it("returns fewer sessions when the calendar is full", () => {
    const planned = planSessions({
      from,
      days: 1,
      count: 2,
      sessionMinutes: 60,
      busy: [{ start: at("2026-10-20T01:00:00Z"), end: at("2026-10-20T04:30:00Z") }],
      existing: [],
      prefs,
    });
    expect(planned).toEqual([]);
  });
});

describe("missed sessions", () => {
  const sessions: PlannedSession[] = [
    { id: "a", start: at("2026-10-20T01:00:00Z"), end: at("2026-10-20T02:00:00Z"), status: "planned" },
    { id: "b", start: at("2026-10-20T02:15:00Z"), end: at("2026-10-20T03:15:00Z"), status: "done" },
    { id: "c", start: at("2026-10-21T01:00:00Z"), end: at("2026-10-21T02:00:00Z"), status: "planned" },
  ];
  const now = at("2026-10-20T16:00:00Z"); // 09:00 Pacific, Oct 20

  it("finds planned sessions that ended without a check-in", () => {
    expect(findMissed(sessions, now).map((s) => s.id)).toEqual(["a"]);
  });

  it("moves a missed session to the next free slot without colliding with the plan", () => {
    const moves = rescheduleMissed(sessions, now, [], prefs);
    expect(moves).toHaveLength(1);
    expect(moves[0].missedId).toBe("a");
    // Session c already sits at 18:00 on Oct 20, so the replacement goes after it.
    expect(moves[0].replacement.start.toISOString()).toBe("2026-10-21T02:15:00.000Z");
  });
});
