// Shared pieces of the Asana UI: small hooks, layout helpers, thread links, the project map, and Start thread.
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useBbContext, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Task, ThreadLink, LinkedThread, ProjectMapRow } from "../server";
import { formatDue } from "../due";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** useState that survives reloads, in this browser's localStorage. */
export function usePersistentState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  const storageKey = `bb-plugin-asana:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      return isValid(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage full or blocked: keep the in-memory value.
      }
    },
    [storageKey],
  );
  return [value, update] as const;
}

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** The current time, re-read every 30 seconds, for "Updated 2m ago". */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export type TaskRef = Pick<Task, "gid" | "name" | "url" | "projectGids">;

export type ProjectMapData = {
  rows: ProjectMapRow[];
  bbProjects: { id: string; name: string }[];
  effective: Record<string, string>;
};

/**
 * One shared copy of the Asana → bb project mapping for every component on
 * screen (each list row's Start thread reads it), refetched when it changes.
 */
export const projectMapStore = {
  data: null as ProjectMapData | null,
  inFlight: null as Promise<void> | null,
  listeners: new Set<() => void>(),
};

export function useProjectMap() {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState(projectMapStore.data);
  const load = useCallback(() => {
    projectMapStore.inFlight ??= rpc
      .call("project_map_get")
      .then(
        (next) => {
          projectMapStore.data = next;
          for (const listener of projectMapStore.listeners) listener();
        },
        () => {},
      )
      .finally(() => {
        projectMapStore.inFlight = null;
      });
    return projectMapStore.inFlight;
  }, [rpc]);
  useEffect(() => {
    const listener = () => setData(projectMapStore.data);
    projectMapStore.listeners.add(listener);
    if (projectMapStore.data === null) void load();
    return () => {
      projectMapStore.listeners.delete(listener);
    };
  }, [load]);
  useRealtime("project-map-changed", () => void load());
  return { data, reload: load };
}

/**
 * The first message of a thread started from a task. It leads with the
 * ticket's name, which bb shows until the thread is renamed to it on linking.
 */
export function resolvePrompt(task: TaskRef): string {
  return [
    task.name,
    task.url,
    "",
    `Resolve this Asana task. Start with \`bb asana task ${task.gid}\` to read its description, attachments, and comments, then work out the fix in this project. Don't post to Asana unless I ask.`,
  ].join("\n");
}

/**
 * Opens the new-thread composer with a prompt for this task. The project is
 * preselected: in a thread's panel, that thread's project; otherwise the bb
 * project mapped to the task's first mapped Asana project; otherwise the
 * composer's default.
 */
export function useStartThread(task: TaskRef): () => void {
  const navigate = useBbNavigate();
  const { projectId: contextProjectId } = useBbContext();
  const { data: projectMap } = useProjectMap();
  const mapped =
    task.projectGids.map((gid) => projectMap?.effective[gid]).find((id) => id !== undefined) ?? null;
  const projectId = contextProjectId ?? mapped;
  return () =>
    navigate.toCompose({
      ...(projectId === null ? {} : { projectId }),
      initialPrompt: resolvePrompt(task),
      focusPrompt: true,
    });
}

export function StartThreadButton({
  task,
  labeled = false,
  reveal = false,
}: {
  task: TaskRef;
  /** Show "Start thread" text instead of an icon-only button. */
  labeled?: boolean;
  /** In a list row: visible on hover, keyboard focus, or touch screens. */
  reveal?: boolean;
}) {
  const start = useStartThread(task);
  const icon = (
    <Icon name="MessageSquarePlus" fallback="Plus" aria-hidden className="size-4" />
  );
  if (labeled) {
    return (
      <Button size="sm" onClick={start}>
        {icon}
        Start thread
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-7 shrink-0 self-center text-muted-foreground hover:text-foreground",
        reveal &&
          "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
      )}
      aria-label={`Start a thread to resolve "${task.name}"`}
      onClick={start}
    >
      {icon}
    </Button>
  );
}

/** "Today", "Fri", "Oct 30", or an "N days overdue" pill. */
export function DueLabel({ dueOn }: { dueOn: string }) {
  const due = formatDue(dueOn, new Date());
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap text-xs",
        due.overdue
          ? "rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive"
          : due.text === "Today"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
      )}
    >
      {due.text}
    </span>
  );
}

/** The dashed box BB's own list pages use for loading and empty states. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

export const CONTROL_CLASS =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * Details-block controls: read as plain values (no border, aligned with the
 * read-only values) and show their frame on hover or focus.
 */
export const QUIET_CONTROL_CLASS =
  "-mx-2 h-8 w-[calc(100%+1rem)] min-w-0 cursor-pointer rounded-md border border-transparent bg-transparent px-2 text-sm text-foreground transition-colors hover:border-input hover:bg-background focus-visible:border-input focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** The task a thread is linked to; refetched whenever any link changes. */
export function useThreadLink(threadId: string | undefined) {
  const rpc = useRpc<typeof rpcContract>();
  const [link, setLink] = useState<ThreadLink | null | undefined>(undefined);
  const load = useCallback(() => {
    if (threadId === undefined) return;
    rpc.call("thread_link_get", { threadId }).then(setLink, () => setLink(null));
  }, [rpc, threadId]);
  useEffect(load, [load]);
  useRealtime("links-changed", load);
  return link;
}

export type ThreadState = "working" | "idle" | "error" | "archived";

/** How a linked thread reads in the list and task view. */
export function threadState(thread: LinkedThread): ThreadState {
  if (thread.archived) return "archived";
  if (thread.status === "error") return "error";
  return thread.status === "idle" ? "idle" : "working";
}

export const THREAD_STATE_LABEL: Record<ThreadState, string> = {
  working: "Working",
  idle: "Idle",
  error: "Stopped with an error",
  archived: "Archived",
};

/** The thread to jump to: one that's working, else the most recently finished. */
export function primaryThread(threads: LinkedThread[]): LinkedThread | null {
  const open = threads.filter((thread) => !thread.archived);
  return (
    open.find((thread) => threadState(thread) === "working") ??
    [...open].sort((a, b) => (b.lastIdleAt ?? 0) - (a.lastIdleAt ?? 0))[0] ??
    null
  );
}

/** A small status dot: pulsing while the agent works. */
export function ThreadStateDot({ state }: { state: ThreadState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "working" && "animate-pulse bg-primary",
        state === "idle" && "bg-muted-foreground",
        state === "error" && "bg-destructive",
        state === "archived" && "border border-muted-foreground/60",
      )}
    />
  );
}

/** Threads linked to a task. */
export function useTaskThreads(gid: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [threads, setThreads] = useState<LinkedThread[]>([]);
  const load = useCallback(() => {
    rpc.call("task_threads", { gid }).then((result) => setThreads(result.threads), () => {});
  }, [rpc, gid]);
  useEffect(load, [load]);
  useRealtime("links-changed", load);
  return threads;
}

/** Runs one write at a time and reports its error; `run` resolves after reload. */
export function useWrite(reload: () => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (work: () => Promise<unknown>): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await work();
        await reload();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setPending(false);
      }
    },
    [reload],
  );
  return { pending, error, run };
}

/** Tracks an element's width, for layouts that depend on the space they get. */
export function useElementWidth(ref: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
