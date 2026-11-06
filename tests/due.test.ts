import { test } from "node:test";
import assert from "node:assert/strict";
import { dueBucket, groupBySection, localDate } from "../due.ts";

// 11pm local time, so a UTC-based date would already be tomorrow in the Americas.
const now = new Date(2026, 9, 25, 23, 0);

test("localDate uses the local calendar day", () => {
  assert.equal(localDate(now), "2026-10-25");
});

test("dueBucket groups by local due date", () => {
  assert.equal(dueBucket(null, now), "none");
  assert.equal(dueBucket("2026-10-24", now), "overdue");
  assert.equal(dueBucket("2026-10-25", now), "today");
  assert.equal(dueBucket("2026-10-26", now), "week");
  assert.equal(dueBucket("2026-11-01", now), "week");
  assert.equal(dueBucket("2026-11-02", now), "later");
});

test("groupBySection keeps section and task order and skips empty sections", () => {
  const sections = [
    { gid: "s1", name: "First" },
    { gid: "s2", name: "Empty" },
    { gid: "s3", name: "Third" },
  ];
  const tasks = [
    { gid: "a", sectionGid: "s3" },
    { gid: "b", sectionGid: "s1" },
    { gid: "c", sectionGid: "s3" },
    { gid: "d", sectionGid: null },
    { gid: "e", sectionGid: "gone" },
  ];
  const groups = groupBySection(sections, tasks);
  assert.deepEqual(
    groups.map((group) => [group.section.name, group.tasks.map((task) => task.gid)]),
    [
      ["First", ["b"]],
      ["Third", ["a", "c"]],
      ["Other", ["d", "e"]],
    ],
  );
});

test("groupBySection with no loose tasks has no Other group", () => {
  const groups = groupBySection([{ gid: "s1", name: "Only" }], [{ gid: "a", sectionGid: "s1" }]);
  assert.deepEqual(groups.map((group) => group.section.name), ["Only"]);
});

test("formatDue says dates the way people do", async () => {
  const { formatDue } = await import("../due.ts");
  const at = new Date(2026, 9, 26, 9, 0); // Monday Oct 26, 2026
  assert.deepEqual(formatDue("2026-10-26", at), { text: "Today", overdue: false });
  assert.deepEqual(formatDue("2026-10-27", at), { text: "Tomorrow", overdue: false });
  assert.deepEqual(formatDue("2026-10-25", at), { text: "1 day overdue", overdue: true });
  assert.deepEqual(formatDue("2026-10-21", at), { text: "5 days overdue", overdue: true });
  assert.deepEqual(formatDue("2026-10-30", at), { text: "Fri", overdue: false });
  assert.deepEqual(formatDue("2026-11-02", at), { text: "Nov 2", overdue: false });
  assert.deepEqual(formatDue("2027-01-15", at), { text: "Jan 15, 2027", overdue: false });
});

test("formatDue counts calendar days across a DST change", async () => {
  const { formatDue } = await import("../due.ts");
  // US DST ends Nov 1, 2026; a 23:30 clock must still call Nov 2 "Tomorrow".
  assert.equal(formatDue("2026-11-02", new Date(2026, 10, 1, 23, 30)).text, "Tomorrow");
});

test("formatAgo reads like a person would say it", async () => {
  const { formatAgo } = await import("../due.ts");
  const now = new Date(2026, 9, 26, 15, 0);
  const ago = (ms: number) => formatAgo(new Date(now.getTime() - ms), now);
  assert.equal(ago(20_000), "just now");
  assert.equal(ago(5 * 60_000), "5m ago");
  assert.equal(ago(3 * 3_600_000), "3h ago");
  assert.equal(formatAgo(new Date(2026, 9, 25, 23, 0), now), "Yesterday");
  assert.equal(formatAgo(new Date(2026, 9, 22, 9, 0), now), "4 days ago");
  assert.equal(formatAgo(new Date(2026, 8, 7, 18, 22), now), "Sep 7");
  assert.equal(formatAgo(new Date(2025, 11, 31, 12, 0), now), "Dec 31, 2025");
});
