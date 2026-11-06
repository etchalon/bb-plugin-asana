// The My Tasks list: data, rows, sections, search and filters, and the sidebar badge.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { UrlLink, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { LinkedThread, rpcContract, Task } from "../server";
import { toast } from "sonner";
import { projectColor } from "../colors";
import { dueBucket, formatAgo, groupBySection } from "../due";
import { formatDuration } from "../duration";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  usePersistentState,
  isStringArray,
  isBoolean,
  useNow,
  StartThreadButton,
  DueLabel,
  EmptyState,
  CONTROL_CLASS,
  primaryThread,
  threadState,
  THREAD_STATE_LABEL,
} from "./shared";

export type TasksResult =
  | { state: "needs_token" }
  | {
      state: "ok";
      userName: string;
      workspace: { gid: string; name: string };
      workspaces: { gid: string; name: string }[];
      sections: { gid: string; name: string }[];
      fetchedAt: number;
      tasks: Task[];
      truncated: boolean;
    };

/**
 * Loads tasks on mount, on demand, and after the plugin settings change.
 * Mount loads may get the server's cached copy; Refresh always re-fetches.
 */
export function useTasks() {
  const rpc = useRpc<typeof rpcContract>();
  const [result, setResult] = useState<TasksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    (refresh: boolean) => {
      setLoading(true);
      rpc
        .call("tasks_list", { refresh })
        .then(
          (next) => {
            setResult(next);
            setError(null);
          },
          (cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
          },
        )
        .finally(() => setLoading(false));
    },
    [rpc],
  );
  const refetch = useCallback(() => load(true), [load]);
  useEffect(() => {
    load(false);
  }, [load]);
  useRealtime("settings-changed", refetch);
  // A write or the server's background refresh changed the list.
  useRealtime("tasks-changed", () => load(false));
  // Coming back to the window: the server serves its cache if it is fresh.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
  return { result, error, loading, refetch };
}

/** Toasts tasks newly in your list, each with a button to open it. */
function useNewTaskToasts() {
  const navigate = useBbNavigate();
  useRealtime("tasks-assigned", (payload) => {
    const tasks = (payload as { tasks?: unknown } | null)?.tasks;
    if (!Array.isArray(tasks)) return;
    const count = (payload as { count?: unknown }).count;
    for (const task of tasks.slice(0, 3)) {
      if (typeof task?.gid !== "string" || typeof task?.name !== "string") continue;
      toast(`New in My Tasks: ${task.name}`, {
        action: {
          label: "Open",
          onClick: () => navigate.toPluginPanel("tasks", { subPath: task.gid }),
        },
      });
    }
    if (typeof count === "number" && count > 3) {
      toast(`${count - 3} more new tasks in My Tasks`, {
        action: { label: "Show", onClick: () => navigate.toPluginPanel("tasks", { subPath: "" }) },
      });
    }
  });
}

/**
 * The sidebar badge: how many open tasks are overdue. bb runs this hook once
 * while the plugin is loaded, so it also hosts the new-task toasts.
 */
export function useOverdueBadge() {
  const { result } = useTasks();
  useNewTaskToasts();
  if (result?.state !== "ok") return null;
  const now = new Date();
  const count = result.tasks.filter((task) => dueBucket(task.dueOn, now) === "overdue").length;
  if (count === 0) return null;
  return {
    count,
    tone: "critical" as const,
    label: `${count} overdue task${count === 1 ? "" : "s"}`,
  };
}

/**
 * "15h of 21h" on a list row, shown once time is logged; red once it passes
 * the estimate. The tooltip and screen readers get the full sentence.
 */
export function TimeBadge({ actual, estimate }: { actual: number | null; estimate: number | null }) {
  if (actual === null || actual === 0) return null;
  const over = estimate !== null && actual > estimate;
  const label =
    estimate === null
      ? `${formatDuration(actual)} logged`
      : `${formatDuration(actual)} logged of ${formatDuration(estimate)} estimated${over ? ", over estimate" : ""}`;
  return (
    <span
      title={label}
      className={cn(
        "hidden shrink-0 text-xs tabular-nums sm:inline",
        over ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <span aria-hidden>
        {estimate === null ? `${formatDuration(actual)} logged` : `${formatDuration(actual)} of ${formatDuration(estimate)}`}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Threads linked to each listed task, refetched when any link or thread status changes. */
function useListThreads(gids: string[]) {
  const rpc = useRpc<typeof rpcContract>();
  const [threads, setThreads] = useState<Record<string, LinkedThread[]>>({});
  const key = gids.join(",");
  const load = useCallback(() => {
    if (key === "") return;
    rpc.call("tasks_threads", { gids: key.split(",") }).then((result) => setThreads(result.threads), () => {});
  }, [rpc, key]);
  useEffect(load, [load]);
  useRealtime("links-changed", load);
  return threads;
}

/**
 * The row's thread button once a task has a thread: always visible, a filled
 * chat bubble (pulsing while the agent works), and it opens that thread
 * instead of starting another.
 */
export function OpenThreadButton({ thread }: { thread: LinkedThread }) {
  const navigate = useBbNavigate();
  const state = threadState(thread);
  const label = `Open thread "${thread.title}", ${THREAD_STATE_LABEL[state].toLowerCase()}`;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-7 shrink-0 self-center text-foreground [&_svg]:fill-current",
        state === "working" && "animate-pulse",
        state === "error" && "text-destructive",
      )}
      aria-label={label}
      onClick={() => navigate.toThread(thread.threadId)}
    >
      <Icon name="MessageSquare" fallback="Zap" aria-hidden className="size-4" />
    </Button>
  );
}

/**
 * The round complete toggle at the start of a row. Completing shows a toast
 * with Undo; the list drops the task on its next refresh.
 */
export function CompleteToggle({ task }: { task: Task }) {
  const rpc = useRpc<typeof rpcContract>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (completed: boolean) => {
    setPending(true);
    setDone(completed);
    rpc
      .call("task_complete", { gid: task.gid, completed })
      .then(
        () => {
          if (!completed) return;
          toast(`Completed "${task.name}"`, {
            action: { label: "Undo", onClick: () => set(false) },
          });
        },
        (cause: unknown) => {
          setDone(!completed);
          toast.error(cause instanceof Error ? cause.message : String(cause));
        },
      )
      .finally(() => setPending(false));
  };
  return (
    <input
      type="checkbox"
      checked={done}
      onChange={(event) => {
        if (!pending) set(event.target.checked);
      }}
      aria-label={`Complete "${task.name}"`}
      className="peer grid size-4 shrink-0 cursor-pointer appearance-none place-content-center rounded-full border border-muted-foreground/60 transition-colors before:hidden before:size-2 before:rounded-full before:bg-background before:content-[''] checked:border-primary checked:bg-primary checked:before:block hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function TaskRow({
  task,
  threads,
  onOpen,
}: {
  task: Task;
  threads: LinkedThread[];
  onOpen: (gid: string) => void;
}) {
  const color = projectColor(task.projectColor);
  const thread = primaryThread(threads);
  return (
    <li className="group -mx-4 flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-state-hover has-[:checked]:opacity-60">
      <CompleteToggle task={task} />
      <button
        type="button"
        data-task-open=""
        onClick={() => onOpen(task.gid)}
        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring peer-checked:line-through"
      >
        <span className="block truncate text-foreground">{task.name}</span>
        {task.projects.length === 0 ? null : (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
              style={color === null ? undefined : { backgroundColor: color }}
            />
            <span className="truncate">{task.projects.join(", ")}</span>
          </span>
        )}
      </button>
      <TimeBadge actual={task.actualMinutes} estimate={task.estimatedMinutes} />
      {task.dueOn === null ? null : <DueLabel dueOn={task.dueOn} />}
      {thread === null ? <StartThreadButton task={task} reveal /> : <OpenThreadButton thread={thread} />}
    </li>
  );
}

/** Tasks under their My Tasks sections, in the order set in Asana. */
export function TaskGroups({
  sections,
  tasks,
  threads,
  onOpenTask,
  collapsed,
  onToggleSection,
  filtered,
}: {
  sections: { gid: string; name: string }[];
  tasks: Task[];
  /** Linked threads by task GID. */
  threads: Record<string, LinkedThread[]>;
  onOpenTask: (gid: string) => void;
  /** Section GIDs ("" for Other) the user collapsed. */
  collapsed: string[];
  onToggleSection: (sectionGid: string) => void;
  /** A search or filter is narrowing the list; collapsed sections open. */
  filtered: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState>{filtered ? "No tasks match." : "No open tasks in My Tasks."}</EmptyState>
    );
  }
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      {groupBySection(sections, tasks).map(({ section, tasks: group }) => {
        const headingId = `asana-section-${section.gid || "other"}`;
        const listId = `${headingId}-tasks`;
        const open = filtered || !collapsed.includes(section.gid);
        return (
          <section key={headingId} aria-labelledby={headingId}>
            <h2 id={headingId} className="mb-1.5 text-xs font-medium text-muted-foreground">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                aria-disabled={filtered || undefined}
                onClick={() => {
                  if (!filtered) onToggleSection(section.gid);
                }}
                className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:hover:text-muted-foreground"
              >
                <Icon
                  name="ChevronRight"
                  aria-hidden
                  className={cn("size-3 transition-transform", open && "rotate-90")}
                />
                {section.name}
                <span className="rounded-full bg-muted px-1.5 py-px text-[0.6875rem] font-normal tabular-nums text-muted-foreground">
                  {group.length}
                </span>
              </button>
            </h2>
            <ul
              id={listId}
              hidden={!open}
              className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4"
            >
              {group.map((task) => (
                <TaskRow key={task.gid} task={task} threads={threads[task.gid] ?? []} onOpen={onOpenTask} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Picks the workspace the plugin shows. The choice is saved as the plugin's
 * Workspace setting, so every list, the badge, and the CLI switch together.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
  disabled,
}: {
  current: { gid: string; name: string };
  workspaces: { gid: string; name: string }[];
  disabled: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (workspaces.length < 2) {
    return <span className="truncate text-sm font-medium text-foreground">{current.name}</span>;
  }
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Asana workspace
      </label>
      <select
        id={id}
        value={current.gid}
        disabled={disabled || pending}
        onChange={(event) => {
          setPending(true);
          setError(null);
          rpc
            .call("workspace_select", { gid: event.target.value })
            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
            .finally(() => setPending(false));
        }}
        className="h-8 w-auto min-w-0 max-w-[60%] cursor-pointer truncate [field-sizing:content] rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-foreground transition-colors -ml-2 hover:border-input hover:bg-background focus-visible:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.gid} value={workspace.gid}>
            {workspace.name}
          </option>
        ))}
      </select>
      {error === null ? null : (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

/** The task list body, shared by the sidebar page and the thread panel tab. */
export function TasksView({ onOpenTask }: { onOpenTask: (gid: string) => void }) {
  const { result, error, loading, refetch } = useTasks();
  const now = useNow();
  const navigate = useBbNavigate();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [overdueOnly, setOverdueOnly] = usePersistentState("overdue-only", false, isBoolean);
  const [collapsed, setCollapsed] = usePersistentState<string[]>("collapsed", [], isStringArray);
  const needle = query.trim().toLowerCase();
  const filtered = needle !== "" || overdueOnly;
  const visible =
    result?.state === "ok"
      ? result.tasks.filter(
          (task) =>
            (!overdueOnly || dueBucket(task.dueOn, now) === "overdue") &&
            (needle === "" ||
              task.name.toLowerCase().includes(needle) ||
              task.projects.some((project) => project.toLowerCase().includes(needle))),
        )
      : [];
  const threads = useListThreads(result?.state === "ok" ? result.tasks.map((task) => task.gid) : []);
  /** Arrow keys move between tasks; "/" jumps to search. Enter opens (native button). */
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-task-open]") ?? [],
    ).filter(
      (row) => row.offsetParent !== null,
    );
    if (rows.length === 0) return;
    const index = rows.indexOf(target as HTMLButtonElement);
    if (index === -1 && target !== searchRef.current) return;
    event.preventDefault();
    const next =
      index === -1
        ? event.key === "ArrowDown" ? 0 : -1
        : event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1) : index - 1;
    if (next < 0) searchRef.current?.focus();
    else rows[next]?.focus();
  };
  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {result?.state === "ok" ? (
            <>
              <WorkspaceSwitcher
                current={result.workspace}
                workspaces={result.workspaces}
                disabled={loading}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                {result.tasks.length} open
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">My Tasks</span>
          )}
        </div>
        {result?.state === "ok" ? (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {loading ? "Updating…" : `Updated ${formatAgo(new Date(result.fetchedAt), now)}`}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2"
          onClick={() => navigate.toPluginPanel("tasks", { subPath: "projects" })}
        >
          <Icon name="FolderSync" fallback="Folder" aria-hidden className="size-4" />
          Projects
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={refetch}
          disabled={loading}
          aria-label="Refresh"
        >
          <Icon name="ArrowReloadHorizontal" aria-hidden className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>
      {result?.state === "ok" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={searchId} className="sr-only">
            Search tasks
          </label>
          <div className="relative min-w-40 flex-1">
            <Icon
              name="Search"
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query !== "") {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Search tasks or projects"
              aria-keyshortcuts="/"
              className={cn(CONTROL_CLASS, "pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden")}
            />
            {query === "" ? (
              <kbd
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-sans text-[0.6875rem] leading-4 text-muted-foreground"
              >
                /
              </kbd>
            ) : null}
          </div>
          <Button
            variant={overdueOnly ? "secondary" : "outline"}
            size="sm"
            aria-pressed={overdueOnly}
            onClick={() => setOverdueOnly(!overdueOnly)}
          >
            Overdue only
          </Button>
        </div>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4">
        {result === null ? (
          error === null ? (
            <EmptyState>Loading tasks…</EmptyState>
          ) : null
        ) : result.state === "needs_token" ? (
          <EmptyState>
            <p className="font-medium text-foreground">Connect Asana to see your tasks</p>
            <p className="mt-1">Add a personal access token in the plugin's settings; it takes about a minute.</p>
            <Button asChild size="sm" className="mt-3">
              <UrlLink href="/settings/plugins/asana">Open Asana settings</UrlLink>
            </Button>
          </EmptyState>
        ) : (
          <div ref={listRef}>
            <TaskGroups
              sections={result.sections}
              tasks={visible}
              threads={threads}
              onOpenTask={onOpenTask}
              collapsed={collapsed}
              filtered={filtered}
              onToggleSection={(sectionGid) =>
                setCollapsed(
                  collapsed.includes(sectionGid)
                    ? collapsed.filter((gid) => gid !== sectionGid)
                    : [...collapsed, sectionGid],
                )
              }
            />
            {result.truncated ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the first 1000 tasks.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
