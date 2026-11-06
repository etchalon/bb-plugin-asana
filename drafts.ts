// Comment drafts from a thread's final message. That message is written for
// you, not the reporter: it can hold file paths, commit hashes, code, and
// values the agent printed. A draft keeps only its opening paragraph, as plain
// text, and the composer flags anything that looks internal before it posts.

/** Longest draft taken from a final message. */
const MAX_DRAFT_CHARS = 1000;

/** Markdown an agent writes, reduced to the text a reader sees. */
function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => (label === url ? url : `${label} (${url})`))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/** The first paragraph of an agent's final message, as plain text. */
export function draftFromSummary(text: string): string {
  const paragraphs = text
    .replace(/```[\s\S]*?```/g, "")
    .split(/\n\s*\n/)
    .map((paragraph) => plain(paragraph))
    .filter((paragraph) => paragraph !== "");
  const first = paragraphs[0] ?? "";
  return first.length <= MAX_DRAFT_CHARS ? first : `${first.slice(0, MAX_DRAFT_CHARS - 1).trimEnd()}…`;
}

const CHECKS: { label: string; test: RegExp }[] = [
  { label: "file paths", test: /(?:^|[\s(])(?:~\/|\/Users\/|\/home\/|\.{1,2}\/|[\w.-]+\/[\w./-]*\.[a-z]{1,5}\b)/im },
  { label: "a commit hash", test: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/ },
  { label: "code", test: /```|`[^`\n]+`/ },
  { label: "a local address", test: /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i },
  {
    label: "something that looks like a secret",
    test: /\b(?:api[_-]?key|secret|password|passwd|token)\b\s*[:=]|\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}/i,
  },
];

/** What in a draft might not belong on a ticket the reporter reads. */
export function oversharingHints(text: string): string[] {
  return CHECKS.filter((check) => check.test.test(text)).map((check) => check.label);
}

/** "file paths and a commit hash" / "file paths, code, and a local address". */
export function joinHints(hints: string[]): string {
  if (hints.length <= 1) return hints[0] ?? "";
  if (hints.length === 2) return `${hints[0]} and ${hints[1]}`;
  return `${hints.slice(0, -1).join(", ")}, and ${hints.at(-1)}`;
}
