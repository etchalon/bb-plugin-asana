// Which bb project each Asana project's tasks belong in, so "Start thread"
// opens the composer in the right project.
//
// Stored in this plugin's kv as one map keyed by Asana project GID. An entry
// is "confirmed" (the user picked it, possibly "none") or "learned" (a thread
// started from a task in that Asana project ran in that bb project). Name
// suggestions are computed on the fly and only used once confirmed.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { suggestProject } from "./projectMatch";

const MAP_KEY = "project-map";

/** Realtime channel the frontend refetches the mapping on. */
export const PROJECT_MAP_CHANGED = "project-map-changed";

const entrySchema = z.object({
  /** null: the user said this Asana project has no bb project. */
  bbProjectId: z.string().nullable(),
  source: z.enum(["confirmed", "learned"]),
  asanaName: z.string(),
  at: z.number(),
});
type Entry = z.infer<typeof entrySchema>;
const mapSchema = z.record(z.string(), entrySchema);

export const projectMapRowSchema = z.object({
  asanaGid: z.string(),
  asanaName: z.string(),
  /** The bb project tasks open in, or null. */
  bbProjectId: z.string().nullable(),
  /** How bbProjectId was chosen; "suggested" is a name match not yet confirmed. */
  source: z.enum(["confirmed", "learned", "suggested", "none"]),
});
export type ProjectMapRow = z.infer<typeof projectMapRowSchema>;

export const bbProjectSchema = z.object({ id: z.string(), name: z.string() });

export function createProjectMap(bb: BbPluginApi) {
  async function read(): Promise<Record<string, Entry>> {
    const parsed = mapSchema.safeParse(await bb.storage.kv.get<unknown>(MAP_KEY));
    return parsed.success ? parsed.data : {};
  }

  async function write(map: Record<string, Entry>): Promise<void> {
    await bb.storage.kv.set(MAP_KEY, map);
    bb.realtime.publish(PROJECT_MAP_CHANGED, null);
  }

  async function bbProjects(): Promise<{ id: string; name: string }[]> {
    const projects = await bb.sdk.projects.list();
    return projects
      .filter((project) => project.kind === "standard")
      .map((project) => ({ id: project.id, name: project.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Confirms a mapping, or with null says the Asana project has no bb project. */
  async function confirm(asanaGid: string, asanaName: string, bbProjectId: string | null) {
    if (bbProjectId !== null && !(await bbProjects()).some((project) => project.id === bbProjectId)) {
      throw new Error("That bb project doesn't exist.");
    }
    const map = await read();
    map[asanaGid] = { bbProjectId, source: "confirmed", asanaName, at: Date.now() };
    await write(map);
  }

  /** Forgets a mapping, so suggestions and learning apply again. */
  async function forget(asanaGid: string) {
    const map = await read();
    if (!(asanaGid in map)) return;
    delete map[asanaGid];
    await write(map);
  }

  /**
   * Learns from a thread linked to a task: its first Asana project maps to
   * the thread's bb project. Confirmed choices are never overwritten.
   */
  async function learn(asanaProjects: { gid: string; name: string }[], bbProjectId: string) {
    const first = asanaProjects[0];
    if (first === undefined) return;
    if (!(await bbProjects()).some((project) => project.id === bbProjectId)) return;
    const map = await read();
    const existing = map[first.gid];
    if (existing?.source === "confirmed") return;
    if (existing?.bbProjectId === bbProjectId) return;
    map[first.gid] = { bbProjectId, source: "learned", asanaName: first.name, at: Date.now() };
    await write(map);
    bb.log.info(`learned Asana project ${first.gid} → ${bbProjectId}`);
  }

  /**
   * The mapping table: every Asana project seen on your tasks or already
   * mapped, with the bb project tasks open in and how it was chosen.
   */
  async function rows(seen: { gid: string; name: string }[]): Promise<ProjectMapRow[]> {
    const [map, projects] = await Promise.all([read(), bbProjects()]);
    const names = new Map<string, string>();
    for (const [gid, entry] of Object.entries(map)) names.set(gid, entry.asanaName);
    for (const project of seen) names.set(project.gid, project.name);
    const known = new Set(projects.map((project) => project.id));
    return [...names.entries()]
      .map(([asanaGid, asanaName]): ProjectMapRow => {
        const entry = map[asanaGid];
        if (entry !== undefined && (entry.bbProjectId === null || known.has(entry.bbProjectId))) {
          return { asanaGid, asanaName, bbProjectId: entry.bbProjectId, source: entry.source };
        }
        const suggestion = suggestProject(asanaName, projects);
        return suggestion === null
          ? { asanaGid, asanaName, bbProjectId: null, source: "none" }
          : { asanaGid, asanaName, bbProjectId: suggestion.id, source: "suggested" };
      })
      .sort((a, b) => a.asanaName.localeCompare(b.asanaName));
  }

  /** Asana project GID → bb project ID, for confirmed and learned mappings only. */
  async function effective(): Promise<Record<string, string>> {
    const map = await read();
    const result: Record<string, string> = {};
    for (const [gid, entry] of Object.entries(map)) {
      if (entry.bbProjectId !== null) result[gid] = entry.bbProjectId;
    }
    return result;
  }

  return { bbProjects, confirm, forget, learn, rows, effective };
}
