import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BRIEF_CHARS, taskBrief } from "../brief";
import type { TaskDetail } from "../asana";

const base: TaskDetail = {
  gid: "1", name: "Fix footer", notes: "The footer overlaps the cookie banner on mobile.", notesMarkdown: "", notesTruncated: false,
  notesImageGids: [], completed: false, assignee: "Alex Rivera", assigneeGid: "me1", createdBy: { gid: "2", name: "Christa" },
  followers: [], parent: null, subtasks: [], myTasks: null, dueOn: "2026-11-02", url: "https://app.asana.com/0/0/1",
  projects: ["Copperleaf - Hosting and Support"], projectColors: [null], projectGids: ["9"], customFields: [
    { gid: "f1", name: "Priority", type: "enum", displayValue: "High", editable: true, precision: null, format: null, durationUnit: null, value: "o1", options: [] },
    { gid: "f2", name: "Actual Time", type: "number", displayValue: "1.5", editable: true, precision: 2, format: "none", durationUnit: "hours", value: 1.5, options: [] },
    { gid: "f3", name: "Team", type: "enum", displayValue: null, editable: true, precision: null, format: null, durationUnit: null, value: null, options: [] },
  ],
  time: { source: "field", actualMinutes: 90, actualField: null, estimate: null, entries: [] },
  attachments: [{ gid: "a1", name: "footer.png", size: 1, host: "asana", createdAt: null, isImage: true, externalUrl: null, permanentUrl: null }],
  comments: [
    { author: "Christa", createdAt: "2026-10-01T10:00:00Z", text: "Old note", markdown: "", imageGids: [] },
    { author: "Christa", createdAt: "2026-10-02T10:00:00Z", text: "Second", markdown: "", imageGids: [] },
    { author: "Alex Rivera", createdAt: "2026-10-03T10:00:00Z", text: "Third", markdown: "", imageGids: [] },
    { author: "Christa", createdAt: "2026-10-04T10:00:00Z", text: "Still\n\nbroken on iOS", markdown: "", imageGids: [] },
  ],
};

test("the brief carries the essentials", () => {
  const brief = taskBrief(base);
  assert.match(brief, /^Task: Fix footer\nURL: https:\/\/app\.asana\.com\/0\/0\/1\n/);
  assert.match(brief, /Projects: Copperleaf - Hosting and Support; Due: 2026-11-02; Assignee: Alex Rivera; Filed by: Christa/);
  assert.match(brief, /Fields: Priority High; Actual Time 1h 30m\n/); // empty Team left out
  assert.match(brief, /The footer overlaps the cookie banner on mobile\./);
  assert.match(brief, /Attachments: footer\.png/);
});

test("only the latest three comments, each on one line", () => {
  const brief = taskBrief(base);
  assert.match(brief, /Latest comments \(3 of 4\):/);
  assert.doesNotMatch(brief, /Old note/);
  assert.match(brief, /- Christa, 2026-10-04: Still broken on iOS/);
});

test("the brief stays under bb's instruction limit however long the task is", () => {
  const long = { ...base, notes: "word ".repeat(5000), comments: base.comments.map((c) => ({ ...c, text: "x".repeat(5000) })) };
  const brief = taskBrief(long);
  assert.ok(brief.length <= MAX_BRIEF_CHARS, String(brief.length));
  assert.match(brief, /…/);
});
