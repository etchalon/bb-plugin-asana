import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFromSummary, joinHints, oversharingHints } from "../drafts.ts";

test("a draft keeps only the opening paragraph, as plain text", () => {
  const summary = [
    "**Fixed.** The `footer` now shows the [2027 dates](https://example.org/).",
    "",
    "I changed `src/footer.vue` in commit 0637e25 and ran the tests.",
    "",
    "```ts\nconst x = 1;\n```",
  ].join("\n");
  assert.equal(draftFromSummary(summary), "Fixed. The footer now shows the 2027 dates (https://example.org/).");
});

test("a code block before any prose is skipped", () => {
  assert.equal(draftFromSummary("```\nlog output\n```\n\nDone. It works."), "Done. It works.");
});

test("internal details are flagged; ordinary replies are not", () => {
  assert.deepEqual(oversharingHints("Fixed. The pill clears at the signoff. https://example.org/events"), []);
  assert.deepEqual(
    oversharingHints("Changed src/footer.vue in 0637e25a; see http://localhost:3000. API_KEY=abc"),
    ["file paths", "a commit hash", "a local address", "something that looks like a secret"],
  );
  assert.deepEqual(oversharingHints("Run `npm test`"), ["code"]);
});

test("hints read as a list", () => {
  assert.equal(joinHints(["code"]), "code");
  assert.equal(joinHints(["file paths", "code"]), "file paths and code");
  assert.equal(joinHints(["file paths", "code", "a commit hash"]), "file paths, code, and a commit hash");
});
