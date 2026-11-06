// Durations in whole minutes, as Asana stores time estimates and logged time.
// Shared by the CLI (server.ts) and the task view (app.tsx); dependency-free.

/** Longest single entry or estimate accepted: 1,000 hours. */
export const MAX_DURATION_MINUTES = 60_000;

/** 1260 → "21h", 90 → "1h 30m", 45 → "45m", 0 → "0m". */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Parses "1h 30m", "1h30m", "90m", "1.5h", "1:30", or a bare number of
 * hours ("2" is two hours). Returns whole minutes, or null when the text is
 * not a duration or falls outside 0–MAX_DURATION_MINUTES.
 */
export function parseDuration(text: string): number | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, "");
  if (input === "") return null;
  let minutes: number;
  const clock = /^(\d+):([0-5]\d)$/.exec(input);
  if (clock !== null) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d+(\.\d+)?$/.test(input)) {
    minutes = Number(input) * 60;
  } else {
    const parts = /^(?:(\d+(?:\.\d+)?)h(?:ours?|rs?)?)?(?:(\d+(?:\.\d+)?)m(?:in(?:utes?|s)?)?)?$/.exec(input);
    if (parts === null || (parts[1] === undefined && parts[2] === undefined)) return null;
    minutes = Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  }
  const rounded = Math.round(minutes);
  return rounded >= 0 && rounded <= MAX_DURATION_MINUTES ? rounded : null;
}

/** How a duration-like custom field stores its number. */
export type DurationUnit = "minutes" | "hours";

/** A field's stored number as minutes: hours fields hold e.g. 1.5 for 90 minutes. */
export function fieldValueToMinutes(value: number, unit: DurationUnit): number {
  return unit === "hours" ? Math.round(value * 60) : value;
}

/**
 * Minutes as the number a field stores, rounded to the field's decimal
 * precision (an hours field with precision 2 stores 90 minutes as 1.5).
 */
export function minutesToFieldValue(minutes: number, unit: DurationUnit, precision: number | null): number {
  if (unit === "minutes") return Math.round(minutes);
  const factor = 10 ** (precision ?? 2);
  return Math.round((minutes / 60) * factor) / factor;
}
