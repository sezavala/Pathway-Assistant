// Pure scheduling logic: no database, no network, so it is easy to test.
// V1 rules are deliberately simple; AI-driven rescheduling can come later.

export interface Interval {
  start: Date;
  end: Date;
}

export interface Preferences {
  /** IANA time zone, e.g. "America/Los_Angeles". */
  timeZone: string;
  /** Local hour the study window opens (0-23). */
  dayStartHour: number;
  /** Local hour the study window closes (1-24). */
  dayEndHour: number;
  maxSessionsPerDay: number;
  /** Gap kept around calendar events and between sessions. */
  bufferMinutes: number;
}

export interface PlannedSession {
  id: string;
  start: Date;
  end: Date;
  status: "planned" | "done" | "skipped" | "missed";
}

const MINUTE = 60_000;

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function zoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `timeZone`. Handles DST changes. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** Calendar date ("2026-10-18") of an instant, as seen in `timeZone`. */
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** Daily study windows for `days` local days starting with the day containing `from`. */
export function studyWindows(from: Date, days: number, prefs: Preferences): Interval[] {
  const [y, m, d] = localDateKey(from, prefs.timeZone).split("-").map(Number);
  const windows: Interval[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const [yy, mm, dd] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    const start = zonedTimeToUtc(yy, mm, dd, prefs.dayStartHour, prefs.timeZone);
    const end = zonedTimeToUtc(yy, mm, dd, prefs.dayEndHour, prefs.timeZone);
    const clippedStart = start < from ? from : start;
    if (clippedStart < end) windows.push({ start: clippedStart, end });
  }
  return windows;
}

/** Removes `busy` from `windows`, padding each busy block by `bufferMinutes`. */
export function freeIntervals(windows: Interval[], busy: Interval[], bufferMinutes: number): Interval[] {
  const pad = bufferMinutes * MINUTE;
  const blocks = busy
    .map((b) => ({ start: b.start.getTime() - pad, end: b.end.getTime() + pad }))
    .sort((a, b) => a.start - b.start);

  const free: Interval[] = [];
  for (const w of windows) {
    let cursor = w.start.getTime();
    const end = w.end.getTime();
    for (const b of blocks) {
      if (b.end <= cursor || b.start >= end) continue;
      if (b.start > cursor) free.push({ start: new Date(cursor), end: new Date(b.start) });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < end) free.push({ start: new Date(cursor), end: new Date(end) });
  }
  return free;
}

export interface PlanInput {
  from: Date;
  days: number;
  count: number;
  sessionMinutes: number;
  /** Calendar busy blocks from Google. */
  busy: Interval[];
  /** Sessions already on the plan; they count toward the daily limit and are avoided. */
  existing: Interval[];
  prefs: Preferences;
}

/** Places up to `count` sessions into the earliest free time. May return fewer if the calendar is full. */
export function planSessions(input: PlanInput): Interval[] {
  const { prefs } = input;
  const length = input.sessionMinutes * MINUTE;
  const gap = prefs.bufferMinutes * MINUTE;

  const perDay = new Map<string, number>();
  for (const s of input.existing) {
    const key = localDateKey(s.start, prefs.timeZone);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const windows = studyWindows(input.from, input.days, prefs);
  const free = freeIntervals(windows, [...input.busy, ...input.existing], prefs.bufferMinutes);

  const planned: Interval[] = [];
  for (const slot of free) {
    let cursor = slot.start.getTime();
    while (planned.length < input.count && cursor + length <= slot.end.getTime()) {
      const start = new Date(cursor);
      const key = localDateKey(start, prefs.timeZone);
      if ((perDay.get(key) ?? 0) >= prefs.maxSessionsPerDay) break;
      planned.push({ start, end: new Date(cursor + length) });
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      cursor += length + gap;
    }
    if (planned.length === input.count) break;
  }
  return planned;
}

/** Planned sessions whose end time has passed without a check-in. */
export function findMissed(sessions: PlannedSession[], now: Date): PlannedSession[] {
  return sessions.filter((s) => s.status === "planned" && s.end <= now);
}

export interface Reschedule {
  missedId: string;
  replacement: Interval;
}

/**
 * Simple V1 rule: each missed session moves, in its original order, to the
 * earliest free slot from now on, around the calendar and the rest of the plan.
 */
export function rescheduleMissed(
  sessions: PlannedSession[],
  now: Date,
  busy: Interval[],
  prefs: Preferences,
  horizonDays = 14,
): Reschedule[] {
  const missed = findMissed(sessions, now).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (missed.length === 0) return [];

  const upcoming = sessions.filter((s) => s.status === "planned" && s.start >= now);
  const minutes = (s: PlannedSession) => (s.end.getTime() - s.start.getTime()) / MINUTE;

  const result: Reschedule[] = [];
  const taken: Interval[] = [...upcoming];
  for (const m of missed) {
    const [slot] = planSessions({
      from: now,
      days: horizonDays,
      count: 1,
      sessionMinutes: minutes(m),
      busy,
      existing: taken,
      prefs,
    });
    if (!slot) break;
    result.push({ missedId: m.id, replacement: slot });
    taken.push(slot);
  }
  return result;
}
