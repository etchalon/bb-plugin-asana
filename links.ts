// Links between bb threads and Asana tasks.
//
// A link lives in this plugin's metadata namespace on the thread
// ({ taskGid, taskName, taskUrl, linkedAt }), with a reverse index in kv
// (`task-threads:<gid>` → thread ids) so a task can list its threads.
// Metadata is writable by any client or agent, so it is parsed as untrusted
// input and only ever used as data.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const threadLinkSchema = z.object({
  taskGid: z.string().regex(/^\d+$/),
  taskName: z.string().max(1000),
  // Rendered as a link in the thread header and Info tab, and metadata is
  // writable by any client: only Asana's own https links pass.
  taskUrl: z.string().max(2000).regex(/^https:\/\/app\.asana\.com\//),
  linkedAt: z.number(),
});
export type ThreadLink = z.infer<typeof threadLinkSchema>;

export const linkedThreadSchema = z.object({
  threadId: z.string(),
  title: z.string(),
  status: z.string(),
  archived: z.boolean(),
  /** The agent's final message when the thread last went idle, for a comment draft. */
  lastSummary: z.string().nullable(),
  lastIdleAt: z.number().nullable(),
});
export type LinkedThread = z.infer<typeof linkedThreadSchema>;

/** Realtime channel the frontend refetches link state on. */
export const LINKS_CHANGED = "links-changed";

const LINK_KEYS = ["taskGid", "taskName", "taskUrl", "linkedAt", "lastSummary", "lastIdleAt", "taskBrief", "briefAt"] as const;

/** Longest final message kept for a comment draft. */
const MAX_SUMMARY_CHARS = 4000;

const summarySchema = z.object({
  lastSummary: z.string().max(MAX_SUMMARY_CHARS * 2),
  lastIdleAt: z.number(),
});

/** The first message the "Start thread" button writes; see resolvePrompt in app.tsx. */
// Current format: the ticket name, its URL, then "Resolve this Asana task."
// Older threads began "Resolve this Asana task: <name>".
const RESOLVE_PROMPT = /(?:^Resolve this Asana task:|\nResolve this Asana task\.)[\s\S]*?`bb asana task (\d+)`/;

/** Longest thread title set from a ticket name. */
const MAX_TITLE_CHARS = 120;

/**
 * A thread's title from its bb project and ticket: "Harbor: Nightly export".
 * Slug-style project names ("crescent-harbor-films") are title-cased;
 * names with capitals are kept as written. No project: just the ticket.
 */
export function threadTitle(projectName: string | null, taskName: string): string {
  const ticket = taskName.trim();
  const raw = projectName?.trim() ?? "";
  const project =
    raw === "" || raw !== raw.toLowerCase()
      ? raw
      : raw
          .split(/[-_\s]+/)
          .filter((word) => word !== "")
          .map((word) => word[0]!.toUpperCase() + word.slice(1))
          .join(" ");
  const title = project === "" ? ticket : `${project}: ${ticket}`;
  return title.length <= MAX_TITLE_CHARS ? title : `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

const firstTurnSchema = z.object({
  type: z.literal("client/turn/requested"),
  data: z.object({
    initiator: z.string().optional(),
    input: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  }),
});

/**
 * The task GID in a thread's first event when that event is the user's
 * "Resolve this Asana task" prompt, else null.
 */
export function taskGidFromFirstTurn(event: unknown): string | null {
  const first = firstTurnSchema.safeParse(event);
  if (!first.success || first.data.data.initiator !== "user") return null;
  const text = first.data.data.input.map((part) => part.text ?? "").join("\n");
  return RESOLVE_PROMPT.exec(text)?.[1] ?? null;
}

function indexKey(taskGid: string): string {
  return `task-threads:${taskGid}`;
}

type LinkedTask = { gid: string; name: string; url: string; projects: { gid: string; name: string }[] };

export function createThreadLinks(
  bb: BbPluginApi,
  lookupTask: (gid: string) => Promise<LinkedTask | null>,
  /** Called after a link is made, with the thread's bb project, so callers can learn from it. */
  onLinked?: (link: { threadId: string; bbProjectId: string | null; task: LinkedTask }) => Promise<void>,
) {
  async function readIndex(taskGid: string): Promise<string[]> {
    const ids = await bb.storage.kv.get<unknown>(indexKey(taskGid));
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  }

  async function writeIndex(taskGid: string, ids: string[]): Promise<void> {
    if (ids.length === 0) await bb.storage.kv.delete(indexKey(taskGid));
    else await bb.storage.kv.set(indexKey(taskGid), ids);
  }

  async function get(threadId: string): Promise<ThreadLink | null> {
    const metadata = await bb.sdk.threads.getPluginMetadata({ threadId });
    const parsed = threadLinkSchema.safeParse(metadata);
    return parsed.success ? parsed.data : null;
  }

  async function unlink(threadId: string): Promise<ThreadLink | null> {
    const existing = await get(threadId);
    await bb.sdk.threads.updatePluginMetadata({ threadId, remove: [...LINK_KEYS] });
    if (existing !== null) {
      const ids = await readIndex(existing.taskGid);
      await writeIndex(existing.taskGid, ids.filter((id) => id !== threadId));
      bb.realtime.publish(LINKS_CHANGED, { threadId, taskGid: existing.taskGid });
    }
    return existing;
  }

  /** Links a thread to a task, replacing any earlier link. Names come from Asana. */
  async function link(threadId: string, taskGid: string): Promise<ThreadLink> {
    let bbProjectId: string | null;
    try {
      bbProjectId = (await bb.sdk.threads.get({ threadId })).projectId ?? null;
    } catch {
      throw new Error(`No bb thread ${threadId}.`);
    }
    const task = await lookupTask(taskGid);
    if (task === null) throw new Error("No Asana access token is set.");
    const existing = await get(threadId);
    if (existing !== null && existing.taskGid !== task.gid) await unlink(threadId);
    const next: ThreadLink = {
      taskGid: task.gid,
      taskName: task.name,
      taskUrl: task.url,
      linkedAt: existing?.taskGid === task.gid ? existing.linkedAt : Date.now(),
    };
    await bb.sdk.threads.updatePluginMetadata({ threadId, set: next });
    const ids = await readIndex(task.gid);
    if (!ids.includes(threadId)) await writeIndex(task.gid, [...ids, threadId]);
    bb.realtime.publish(LINKS_CHANGED, { threadId, taskGid: task.gid });
    // Learning is a bonus; a failure there must not fail the link.
    await onLinked?.({ threadId, bbProjectId, task }).catch((cause: unknown) =>
      bb.log.warn(`after linking ${threadId}: ${String(cause)}`),
    );
    return next;
  }

  /** Threads linked to a task, dropping deleted threads from the index. */
  async function threadsFor(taskGid: string): Promise<LinkedThread[]> {
    const ids = await readIndex(taskGid);
    const found: LinkedThread[] = [];
    const live: string[] = [];
    for (const threadId of ids) {
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (thread.deletedAt !== null) continue;
        // The link may have moved to another task without the index noticing.
        if ((await get(threadId))?.taskGid !== taskGid) continue;
        live.push(threadId);
        const summary = summarySchema.safeParse(
          await bb.sdk.threads.getPluginMetadata({ threadId }),
        );
        found.push({
          threadId,
          title: thread.title ?? thread.titleFallback ?? "Untitled thread",
          status: thread.status,
          archived: thread.archivedAt !== null,
          lastSummary: summary.success ? summary.data.lastSummary : null,
          lastIdleAt: summary.success ? summary.data.lastIdleAt : null,
        });
      } catch {
        // Gone (404) or unreadable: drop it from the index.
      }
    }
    if (live.length !== ids.length) await writeIndex(taskGid, live);
    return found;
  }

  /** Threads already checked for an auto-link this load, so each is read once. */
  const checked = new Set<string>();

  /**
   * Links a thread started from a task's "Start thread" button: its first
   * message is the prompt that button writes. Runs when the thread first goes
   * active; threads already linked, or started some other way, are left alone.
   */
  async function autoLink(threadId: string): Promise<void> {
    if (checked.has(threadId)) return;
    checked.add(threadId);
    if ((await get(threadId)) !== null) return;
    const [first] = await bb.sdk.threads.events.list({
      threadId,
      types: ["client/turn/requested"],
      order: "asc",
      limit: "1",
    });
    const taskGid = taskGidFromFirstTurn(first);
    if (taskGid === null) return;
    const linked = await link(threadId, taskGid);
    // Name the thread "<bb project>: <ticket>". Only here, for threads the
    // Start thread button began, so titles people chose are left alone.
    const projectId = (await bb.sdk.threads.get({ threadId })).projectId ?? null;
    const project =
      projectId === null
        ? undefined
        : (await bb.sdk.projects.list()).find((candidate) => candidate.id === projectId && candidate.kind === "standard");
    const title = threadTitle(project?.name ?? null, linked.taskName);
    if (title !== "") await bb.sdk.threads.update({ threadId, title });
    bb.log.info(`linked thread ${threadId} to task ${taskGid} from its first message`);
  }

  /** Threads linked to any of these tasks, keyed by task GID; tasks without threads are left out. */
  async function threadsForTasks(taskGids: string[]): Promise<Record<string, LinkedThread[]>> {
    const result: Record<string, LinkedThread[]> = {};
    for (const taskGid of taskGids) {
      // Most tasks have no threads; skip them without touching the thread API.
      if ((await readIndex(taskGid)).length === 0) continue;
      const threads = await threadsFor(taskGid);
      if (threads.length > 0) result[taskGid] = threads;
    }
    return result;
  }

  bb.events.on("thread.active", async ({ thread }) => {
    await autoLink(thread.id);
    // The list shows which linked threads are working.
    const link = await get(thread.id);
    if (link !== null) bb.realtime.publish(LINKS_CHANGED, { threadId: thread.id, taskGid: link.taskGid });
  });
  // Wrap-up: keep a linked thread's final message so the task view can offer
  // it as a comment draft. Nothing is posted to Asana from here.
  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    const link = await get(thread.id);
    if (link === null) return;
    const text = lastAssistantText?.trim() ?? "";
    if (text !== "") {
      await bb.sdk.threads.updatePluginMetadata({
        threadId: thread.id,
        set: { lastSummary: text.slice(0, MAX_SUMMARY_CHARS), lastIdleAt: Date.now() },
      });
    }
    bb.realtime.publish(LINKS_CHANGED, { threadId: thread.id, taskGid: link.taskGid });
  });
  bb.events.on("thread.deleted", async ({ thread }) => {
    if ((await get(thread.id).catch(() => null)) !== null) await unlink(thread.id);
  });

  return { get, link, unlink, threadsFor, threadsForTasks };
}
