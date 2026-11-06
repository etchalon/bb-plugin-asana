// One task: data, toolbar actions, subtasks, and the full task view.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Markdown,
  experimental_copyToClipboard as copyToClipboard,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { CustomField, rpcContract, TaskDetail, TaskTime } from "../server";
import { toast } from "sonner";
import { formatAgo } from "../due";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  useNow,
  StartThreadButton,
  EmptyState,
  useWrite,
  useElementWidth,
  useThreadLink,
  useTaskThreads,
  useStartThread,
  primaryThread,
} from "./shared";
import { DetailsPanel } from "./fields";
import { ImageStrip, AttachmentList } from "./attachments";
import { CommentTimeline, CommentComposer } from "./comments";
import { TaskThreadsSection } from "./threads";
import { HandoffButton } from "./handoff";

export function useTaskDetail(gid: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setDetail(null);
    setError(null);
    rpc.call("task_get", { gid }).then(
      (next) => {
        if (current) setDetail(next);
      },
      (cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      current = false;
    };
  }, [rpc, gid]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  useEffect(() => {
    if (detail !== null) setLoadedAt((at) => at ?? Date.now());
  }, [detail]);
  /** Refetches, keeping the current view on screen meanwhile. */
  const reload = useCallback(() => {
    setRefreshing(true);
    return rpc
      .call("task_get", { gid })
      .then(
        (next) => {
          setDetail(next);
          setError(null);
          setLoadedAt(Date.now());
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setRefreshing(false));
  }, [rpc, gid]);
  // Stay current while the task is on screen: on returning to the window,
  // when a write anywhere in bb changes tasks, and every 2 minutes.
  useRealtime("tasks-changed", () => void reload());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [reload]);
  // Estimated time and Actual Time appear both as fields (Details) and in the
  // Time section; a change in either place refetches so both stay in step.
  const setCustomFields = useCallback(
    (customFields: CustomField[]) => {
      setDetail((current) => (current === null ? current : { ...current, customFields }));
      void reload();
    },
    [reload],
  );
  const setTime = useCallback(
    (time: TaskTime) => {
      setDetail((current) => (current === null ? current : { ...current, time }));
      void reload();
    },
    [reload],
  );
  return { detail, error, setCustomFields, setTime, reload, refreshing, loadedAt };
}

/** Complete / reopen, in the title row. */
export function CompleteButton({ detail, reload }: { detail: TaskDetail; reload: () => Promise<unknown> }) {
  const rpc = useRpc<typeof rpcContract>();
  const { pending, error, run } = useWrite(reload);
  return (
    <div className="flex shrink-0 flex-col items-start">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => rpc.call("task_complete", { gid: detail.gid, completed: !detail.completed }))}
      >
        <Icon name={detail.completed ? "RotateCcw" : "Check"} fallback="Check" aria-hidden className="size-4" />
        {detail.completed ? "Reopen" : "Mark complete"}
      </Button>
      {error === null ? null : (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Subtasks as a checklist; names open the subtask. */
export function SubtasksSection({
  detail,
  reload,
  onOpenTask,
}: {
  detail: TaskDetail;
  reload: () => Promise<unknown>;
  onOpenTask: (gid: string) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const { pending, error, run } = useWrite(reload);
  if (detail.subtasks.length === 0) return null;
  const done = detail.subtasks.filter((subtask) => subtask.completed).length;
  return (
    <section aria-labelledby="asana-subtasks" className="mt-5">
      <h3 id="asana-subtasks" className="mb-1.5 text-xs font-medium text-muted-foreground">
        Subtasks ({done}/{detail.subtasks.length})
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
        {detail.subtasks.map((subtask) => (
          <li key={subtask.gid} className="flex items-center gap-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={subtask.completed}
              disabled={pending}
              onChange={(event) =>
                run(() => rpc.call("task_complete", { gid: subtask.gid, completed: event.target.checked }))
              }
              aria-label={`${subtask.completed ? "Reopen" : "Complete"} "${subtask.name}"`}
              className="size-4 shrink-0 accent-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => onOpenTask(subtask.gid)}
              className={cn(
                "min-w-0 flex-1 truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                subtask.completed && "text-muted-foreground line-through",
              )}
            >
              {subtask.name}
            </button>
            {subtask.assignee === null ? null : (
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {subtask.assignee}
              </span>
            )}
            {subtask.dueOn === null ? null : (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{subtask.dueOn}</span>
            )}
          </li>
        ))}
      </ul>
      {error === null ? null : (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "…" menu: Open in Asana, Copy link, Start a new thread when that isn't the
 * main button, and (in a thread) link or unlink it.
 */
export function TaskMoreMenu({
  detail,
  threadId,
  offerStartThread,
}: {
  detail: TaskDetail;
  threadId?: string;
  offerStartThread: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const link = useThreadLink(threadId);
  const startThread = useStartThread(detail);
  const linkedHere = threadId !== undefined && link?.taskGid === detail.gid;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
          <Icon name="MoreHorizontal" fallback="Ellipsis" aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {offerStartThread ? (
          <>
            <DropdownMenuItem onSelect={startThread}>
              <Icon name="MessageSquarePlus" fallback="Plus" aria-hidden />
              Start a new thread
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => navigate.openUrl(detail.url)}>
          <Icon name="ExternalLink" aria-hidden />
          Open in Asana
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void copyToClipboard({ text: detail.url }).then((copied) => {
              if (copied) toast("Link copied");
            });
          }}
        >
          <Icon name="Copy" aria-hidden />
          Copy link
        </DropdownMenuItem>
        {threadId === undefined || link === undefined ? null : (
          <>
            <DropdownMenuSeparator />
            {linkedHere ? (
              <DropdownMenuItem onSelect={() => void rpc.call("thread_unlink", { threadId })}>
                <Icon name="CircleX" aria-hidden />
                Unlink from this thread
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => void rpc.call("thread_link_set", { threadId, gid: detail.gid })}>
                <Icon name="Link" aria-hidden />
                {link === null ? "Link to this thread" : "Link to this thread instead"}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskDetailView({
  gid,
  onBack,
  onOpenTask,
  threadId,
}: {
  gid: string;
  onBack: () => void;
  /** Opens another task here, such as a subtask or the parent. */
  onOpenTask: (gid: string) => void;
  /** Set in a thread's panel, to offer linking the task to that thread. */
  threadId?: string;
}) {
  const { detail, error, setCustomFields, setTime, reload, refreshing, loadedAt } = useTaskDetail(gid);
  const now = useNow();
  const threads = useTaskThreads(gid);
  const link = useThreadLink(threadId);
  const navigate = useBbNavigate();
  const articleRef = useRef<HTMLElement>(null);
  // Two columns once the view is wide enough for a details rail.
  const wide = useElementWidth(articleRef) >= 820;
  const byGid = new Map(detail?.attachments.map((attachment) => [attachment.gid, attachment]));
  const imagesFor = (gids: string[]) =>
    gids.flatMap((id) => {
      const attachment = byGid.get(id);
      return attachment === undefined ? [] : [attachment];
    });
  // Images already shown inline in the description or a comment aren't listed again.
  const shownInline = new Set([
    ...(detail?.notesImageGids ?? []),
    ...(detail?.comments.flatMap((comment) => comment.imageGids) ?? []),
  ]);
  const attachments = detail?.attachments.filter((attachment) => !shownInline.has(attachment.gid)) ?? [];
  // The main button depends on where you are: in the task's own thread,
  // Hand back; elsewhere with a thread already on it, Open thread; else Start thread.
  const linkedHere = threadId !== undefined && link?.taskGid === gid;
  const otherThread = primaryThread(threads.filter((thread) => thread.threadId !== threadId));
  const main: "handback" | "open" | "start" =
    linkedHere && detail?.completed === false ? "handback" : !linkedHere && otherThread !== null ? "open" : "start";
  return (
    <article ref={articleRef} aria-labelledby="asana-task-title">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <Icon name="ChevronLeft" aria-hidden className="size-4" />
          My Tasks
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {detail === null ? null : (
            <>
              {loadedAt === null ? null : (
                <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
                  {refreshing ? "Updating…" : `Updated ${formatAgo(new Date(loadedAt), now)}`}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => void reload()}
                disabled={refreshing}
                aria-label="Refresh task"
              >
                <Icon name="ArrowReloadHorizontal" aria-hidden className={cn("size-4", refreshing && "animate-spin")} />
              </Button>
              {main === "handback" ? (
                <HandoffButton detail={detail} threads={threads} reload={reload} primary />
              ) : main === "open" && otherThread !== null ? (
                <Button size="sm" onClick={() => navigate.toThread(otherThread.threadId)}>
                  <Icon name="MessageSquare" fallback="Zap" aria-hidden className="size-4" />
                  Open thread
                </Button>
              ) : (
                <StartThreadButton task={detail} labeled />
              )}
              <TaskMoreMenu detail={detail} threadId={threadId} offerStartThread={main !== "start"} />
            </>
          )}
        </div>
      </div>
      {error === null ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {detail === null ? (
        error === null ? (
          <div className="mt-3">
            <EmptyState>Loading task…</EmptyState>
          </div>
        ) : null
      ) : (
        <>
          {detail.parent === null ? null : (
            <button
              type="button"
              onClick={() => onOpenTask(detail.parent!.gid)}
              className="mt-3 block max-w-full truncate rounded-sm text-left text-xs text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Subtask of {detail.parent.name}
            </button>
          )}
          <h2
            id="asana-task-title"
            className={cn(
              "mt-3 text-xl font-semibold leading-snug",
              detail.completed ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {detail.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            {detail.completed ? (
              <span className="inline-flex h-8 items-center gap-1.5 pr-1 text-sm text-muted-foreground">
                <Icon name="Check" aria-hidden className="size-3.5" />
                Completed
              </span>
            ) : null}
            <CompleteButton detail={detail} reload={reload} />
            {main === "handback" || detail.completed ? null : (
              <HandoffButton detail={detail} threads={threads} reload={reload} />
            )}
          </div>
          <TaskThreadsSection threads={threads} currentThreadId={threadId} />

          <div
            className={cn(
              wide ? "mt-5 grid grid-cols-[minmax(0,1fr)_19rem] items-start gap-8" : "",
            )}
          >
            <div className="min-w-0 [&>*:first-child]:mt-0">
              {wide ? null : (
                <DetailsPanel
                  detail={detail}
                  reload={reload}
                  onFieldsSaved={setCustomFields}
                  onTimeLogged={setTime}
                  collapsible
                />
              )}

              <section aria-labelledby="asana-description" className="mt-5">
                <h3 id="asana-description" className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Description
                </h3>
                {detail.notesMarkdown.trim() === "" ? (
                  <p className="text-sm text-muted-foreground">No description.</p>
                ) : (
                  <Markdown content={detail.notesMarkdown} className="text-sm" />
                )}
                {detail.notesTruncated ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Description cut short; open in Asana for the rest.
                  </p>
                ) : null}
                <ImageStrip images={imagesFor(detail.notesImageGids)} />
              </section>

              <SubtasksSection detail={detail} reload={reload} onOpenTask={onOpenTask} />

              {attachments.length === 0 ? null : (
                <section aria-labelledby="asana-attachments" className="mt-5">
                  <h3 id="asana-attachments" className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {attachments.length === detail.attachments.length
                      ? `Attachments (${attachments.length})`
                      : `Other attachments (${attachments.length})`}
                  </h3>
                  <AttachmentList attachments={attachments} />
                </section>
              )}

              <section aria-labelledby="asana-comments" className="mt-5">
                <h3 id="asana-comments" className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Comments ({detail.comments.length})
                </h3>
                {detail.comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments.</p>
                ) : (
                  <CommentTimeline comments={detail.comments} imagesFor={imagesFor} />
                )}
                <CommentComposer detail={detail} threads={threads} reload={reload} />
              </section>

            </div>

            {wide ? (
              <div className="min-w-0 [&>*:first-child]:mt-0">
                <DetailsPanel
                  detail={detail}
                  reload={reload}
                  onFieldsSaved={setCustomFields}
                  onTimeLogged={setTime}
                  collapsible={false}
                />
              </div>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}
