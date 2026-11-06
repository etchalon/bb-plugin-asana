// Section and due-date grouping shared by the CLI (server.ts) and the
// page and panel (app.tsx).
// Dependency-free so the frontend bundle can import it.

export const DUE_BUCKETS = ["overdue", "today", "week", "later", "none"] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  none: "No due date",
};

/** A date as YYYY-MM-DD in the local time zone. */
export function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dueBucket(dueOn: string | null, now: Date): DueBucket {
  if (dueOn === null) return "none";
  const today = localDate(now);
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + 7);
  return dueOn <= localDate(weekOut) ? "week" : "later";
}

/**
 * Tasks grouped under their My Tasks sections, in section order, skipping
 * empty sections. Tasks whose section is unknown go in a trailing group.
 */
export function groupBySection<T extends { sectionGid: string | null }>(
  sections: { gid: string; name: string }[],
  tasks: T[],
): { section: { gid: string; name: string }; tasks: T[] }[] {
  const known = new Set(sections.map((section) => section.gid));
  const groups = sections.map((section) => ({
    section,
    tasks: tasks.filter((task) => task.sectionGid === section.gid),
  }));
  const loose = tasks.filter(
    (task) => task.sectionGid === null || !known.has(task.sectionGid),
  );
  groups.push({ section: { gid: "", name: "Other" }, tasks: loose });
  return groups.filter((group) => group.tasks.length > 0);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole calendar days from `now` to the YYYY-MM-DD `dueOn` (negative when past). */
function daysUntil(dueOn: string, now: Date): number {
  const [year, month, day] = dueOn.split("-").map(Number);
  const due = Date.UTC(year!, month! - 1, day!);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86_400_000);
}

/**
 * A due date as people say it: "Today", "Tomorrow", "1 day overdue", "3 days
 * overdue", a weekday within the week ahead ("Fri"), else "Oct 30" (with the
 * year when it differs from now's).
 */
export function formatDue(dueOn: string, now: Date): { text: string; overdue: boolean } {
  const days = daysUntil(dueOn, now);
  const [year, month, day] = dueOn.split("-").map(Number);
  // Overdue always says so in words, not only in color.
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days < 7) {
    const weekday = new Date(year!, month! - 1, day!).getDay();
    return { text: WEEKDAYS[weekday]!, overdue: false };
  }
  const label = `${MONTHS[month! - 1]} ${day}`;
  return { text: year === now.getFullYear() ? label : `${label}, ${year}`, overdue: false };
}

/**
 * How long ago a timestamp was: "just now", "5m ago", "3h ago", "Yesterday",
 * "3 days ago" within a week, else a date ("Oct 21", with the year when it
 * differs from now's).
 */
export function formatAgo(at: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  const days = -daysUntil(localDate(at), now);
  if (days === 0) return `${Math.floor(seconds / 3600)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const label = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  return at.getFullYear() === now.getFullYear() ? label : `${label}, ${at.getFullYear()}`;
}
