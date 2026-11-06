import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { taskGidFromFirstTurn, threadTitle } from "../links.ts";

// A real first event from a thread started with the "Start thread" button.
const real = JSON.parse(
  readFileSync(new URL("./fixtures/first-turn.json", import.meta.url), "utf8"),
);

const withText = (text: string, initiator = "user") => ({
  ...real,
  data: { initiator, input: [{ type: "text", text, mentions: [] }] },
});

test("finds the task in the button's prompt", () => {
  assert.equal(taskGidFromFirstTurn(real), "1100000000001234");
});

test("still links when the user edited the prompt's middle", () => {
  assert.equal(
    taskGidFromFirstTurn(
      withText("Resolve this Asana task: Banner\nsee link\n\nPlease look at `bb asana task 42` first."),
    ),
    "42",
  );
});

test("finds the task in the current prompt, which leads with the ticket name", () => {
  assert.equal(
    taskGidFromFirstTurn(
      withText("Fix footer overlap\nhttps://app.asana.com/0/0/77\n\nResolve this Asana task. Start with `bb asana task 77` to read it."),
    ),
    "77",
  );
});

test("ignores other first messages", () => {
  assert.equal(taskGidFromFirstTurn(withText("Fix the banner. Run `bb asana task 42`.")), null);
  assert.equal(taskGidFromFirstTurn(withText("Resolve this Asana task: no command here")), null);
});

test("ignores turns not sent by the user", () => {
  const text = real.data.input[0].text as string;
  assert.equal(taskGidFromFirstTurn(withText(text, "agent")), null);
});

test("ignores malformed or missing events", () => {
  assert.equal(taskGidFromFirstTurn(undefined), null);
  assert.equal(taskGidFromFirstTurn({ type: "client/thread/start", data: {} }), null);
});

test("thread titles lead with the bb project, title-cased", () => {
  assert.equal(threadTitle("harbor", "Nightly export file is blank"), "Harbor: Nightly export file is blank");
  assert.equal(threadTitle("crescent-harbor-films", "New font file"), "Crescent Harbor Films: New font file");
  assert.equal(threadTitle("Bluebird", "PostHog setup"), "Bluebird: PostHog setup");
  assert.equal(threadTitle("ACME_web", "Fix nav"), "ACME_web: Fix nav"); // capitals kept as written
  assert.equal(threadTitle(null, "Fix nav"), "Fix nav");
  assert.ok(threadTitle("harbor", "x".repeat(300)).length <= 120);
});

test("a stored task link must be an Asana https link", async () => {
  const { threadLinkSchema } = await import("../links.ts");
  const base = { taskGid: "1", taskName: "x", linkedAt: 1 };
  assert.ok(threadLinkSchema.safeParse({ ...base, taskUrl: "https://app.asana.com/0/0/1" }).success);
  for (const taskUrl of ["javascript:alert(1)", "https://evil.example/app.asana.com/", "http://app.asana.com/0/0/1"]) {
    assert.equal(threadLinkSchema.safeParse({ ...base, taskUrl }).success, false, taskUrl);
  }
});
