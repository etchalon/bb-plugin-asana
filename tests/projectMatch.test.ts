import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestProject } from "../projectMatch.ts";

// The user's bb projects.
const projects = [
  "bluebird", "ios", "northwinds", "bluebird-pro-ios", "harbor", "riverside-beyond", "baker-ellis",
  "city-open-days", "copperleaf", "crescent-harbor-films", "delta-rho-delta",
].map((name) => ({ id: `proj_${name}`, name }));
const suggest = (asanaName: string) => suggestProject(asanaName, projects)?.name ?? null;

test("matches project names that appear in the Asana name", () => {
  assert.equal(suggest("Northwind/Harbor 2026"), "harbor");
  assert.equal(suggest("Copperleaf - Hosting and Support"), "copperleaf");
  assert.equal(suggest("Delta Rho Delta: Hosting & support"), "delta-rho-delta");
  assert.equal(suggest("Baker Ellis: Ongoing Support"), "baker-ellis");
  assert.equal(suggest("Riverside Beyond: Website Development"), "riverside-beyond");
});

test("matches initials", () => {
  assert.equal(suggest("CHF Support"), "crescent-harbor-films");
});

test("prefers the longer match", () => {
  assert.equal(suggest("Bluebird Pro iOS"), "bluebird-pro-ios");
  assert.equal(suggest("Bluebird Pro"), "bluebird");
});

test("suggests nothing without a match", () => {
  assert.equal(suggest("RDX"), null);
  assert.equal(suggest("Plain Facts: KLMN"), null);
  assert.equal(suggest("Alex Work"), null);
  assert.equal(suggest("Lark/Finch/WREN: Hosting & Support"), null);
});

test("a word inside another word does not match", () => {
  // "ios" must be its own word, not part of "Studios".
  assert.equal(suggest("Pixel Studios"), null);
});

test("ties suggest nothing", () => {
  const tied = [{ id: "a", name: "acme" }, { id: "b", name: "Acme" }];
  assert.equal(suggestProject("Acme Website", tied), null);
});
