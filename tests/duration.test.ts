import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, MAX_DURATION_MINUTES, parseDuration } from "../duration.ts";

test("parseDuration reads every supported form as minutes", () => {
  const cases: [string, number][] = [
    ["1h 30m", 90],
    ["1h30m", 90],
    ["90m", 90],
    ["90 min", 90],
    ["1.5h", 90],
    ["2 hours", 120],
    ["1:30", 90],
    ["2", 120],
    ["0.25", 15],
    ["21h", 1260],
    ["0", 0],
    [" 45M ", 45],
  ];
  for (const [text, minutes] of cases) assert.equal(parseDuration(text), minutes, text);
});

test("parseDuration rejects non-durations and out-of-range values", () => {
  for (const text of ["", "h", "m", "abc", "-1", "1:75", "1h 30", "soon"]) {
    assert.equal(parseDuration(text), null, text);
  }
  assert.equal(parseDuration(`${MAX_DURATION_MINUTES + 1}m`), null);
  assert.equal(parseDuration(`${MAX_DURATION_MINUTES}m`), MAX_DURATION_MINUTES);
});

test("formatDuration drops empty units", () => {
  assert.equal(formatDuration(1260), "21h");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(61), "1h 1m");
});

test("formatDuration output parses back to the same minutes", () => {
  for (const minutes of [0, 1, 59, 60, 61, 90, 1260, 6001]) {
    assert.equal(parseDuration(formatDuration(minutes)), minutes);
  }
});

test("hours fields convert to and from minutes", async () => {
  const { fieldValueToMinutes, minutesToFieldValue } = await import("../duration.ts");
  assert.equal(fieldValueToMinutes(5.25, "hours"), 315);
  assert.equal(fieldValueToMinutes(0.75, "hours"), 45);
  assert.equal(fieldValueToMinutes(1260, "minutes"), 1260);
  assert.equal(minutesToFieldValue(90, "hours", 2), 1.5);
  assert.equal(minutesToFieldValue(20, "hours", 2), 0.33);
  assert.equal(minutesToFieldValue(90, "hours", 0), 2);
  assert.equal(minutesToFieldValue(90, "minutes", 0), 90);
  // Adding 1h 30m to a 2.5h total stores 4.
  assert.equal(minutesToFieldValue(fieldValueToMinutes(2.5, "hours") + 90, "hours", 2), 4);
});
