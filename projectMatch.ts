// Suggests which bb project an Asana project belongs to, by name.
// Dependency-free so the server and tests share it. Suggestions are only
// used once the user confirms them; learned and confirmed mappings win.

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

/** Whether `needle` appears in `haystack` as consecutive words. */
function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, index) => haystack[start + index] === word)) return true;
  }
  return false;
}

/**
 * The bb project whose name best matches an Asana project name, or null when
 * none matches or the best match is a tie. A bb project matches when its
 * words appear in order in the Asana name ("riverside-beyond" in "Riverside
 * Beyond: Website Development"), or when its initials are a word of the
 * Asana name ("crescent-harbor-films" for "CHF Support").
 */
export function suggestProject<P extends { id: string; name: string }>(
  asanaName: string,
  projects: readonly P[],
): P | null {
  const asanaWords = words(asanaName);
  let best: P | null = null;
  let bestScore = 0;
  let tie = false;
  for (const project of projects) {
    const projectWords = words(project.name);
    if (projectWords.length === 0) continue;
    let score = 0;
    if (containsRun(asanaWords, projectWords)) {
      score = projectWords.length * 2;
    } else if (projectWords.length >= 2) {
      const initials = projectWords.map((word) => word[0]).join("");
      if (asanaWords.includes(initials)) score = projectWords.length;
    }
    if (score === 0) continue;
    if (score > bestScore) {
      best = project;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}
