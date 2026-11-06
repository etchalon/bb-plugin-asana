// Threads linked to a task, and the linked task in a thread's header and
// Info tab.
import { useEffect } from "react";
import {
  experimental_InfoList as InfoList,
  experimental_InfoListRow as InfoListRow,
  experimental_InfoSection as InfoSection,
  experimental_useAppPanel as useAppPanel,
  UrlLink,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import type { LinkedThread } from "../server";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { threadState, THREAD_STATE_LABEL, ThreadStateDot, useThreadLink } from "./shared";

/**
 * Threads working on this task, near the top of the task view: open ones
 * first, then archived. The thread you're in is marked rather than linked.
 */
export function TaskThreadsSection({ threads, currentThreadId }: { threads: LinkedThread[]; currentThreadId?: string }) {
  const navigate = useBbNavigate();
  if (threads.length === 0) return null;
  const ordered = [...threads.filter((thread) => !thread.archived), ...threads.filter((thread) => thread.archived)];
  return (
    <section aria-labelledby="asana-threads" className="mt-4">
      <h3 id="asana-threads" className="sr-only">
        Threads
      </h3>
      <ul className="flex flex-col gap-0.5">
        {ordered.map((thread) => {
          const state = threadState(thread);
          const here = thread.threadId === currentThreadId;
          return (
            <li key={thread.threadId} className="flex min-w-0 items-center gap-2 text-sm">
              <ThreadStateDot state={state} />
              {here ? (
                <span className="min-w-0 truncate text-foreground">{thread.title}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate.toThread(thread.threadId)}
                  className={cn(
                    "min-w-0 truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    state === "archived" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {thread.title}
                </button>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {here ? "This thread · " : ""}
                {THREAD_STATE_LABEL[state]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The linked task in a thread's Info tab. */
export function ThreadInfoAsana({ threadId }: { threadId: string }) {
  const link = useThreadLink(threadId);
  const navigate = useBbNavigate();
  if (link === undefined || link === null) return null;
  return (
    <InfoSection label="Asana task">
      <InfoList
        items={[link]}
        getKey={(item) => item.taskGid}
        renderItem={(item) => (
          <InfoListRow
            leading={<Icon name="ListTodo" aria-hidden className="size-3" />}
            name={item.taskName}
            title={item.taskName}
            onSelect={() => navigate.toPluginPanel("tasks", { subPath: item.taskGid })}
          />
        )}
      />
    </InfoSection>
  );
}

/** Asks a thread's Asana tab to show its linked task (see useOpenLinkedRequests). */
const OPEN_LINKED = "bb-asana:open-linked";

/** Calls `open` whenever the header asks this thread's Asana tab to show its task. */
export function useOpenLinkedRequests(threadId: string, open: () => void) {
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<string>).detail === threadId) open();
    };
    window.addEventListener(OPEN_LINKED, listener);
    return () => window.removeEventListener(OPEN_LINKED, listener);
  }, [threadId, open]);
}

const HEADER_CONTROL =
  "inline-flex h-7 items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The linked task in the thread header: its name opens it in the thread's
 * Asana tab, the arrow opens it on asana.com.
 */
export function ThreadHeaderAsana({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const link = useThreadLink(threadId);
  const panel = useAppPanel();
  if (link === undefined || link === null) return null;
  const openHere = () => {
    panel.experimental_openTab({
      surface: { kind: "current" },
      tab: { id: "tasks", context: { kind: "thread" }, availability: "fixed" },
    });
    // The tab may already be open on another task or the list.
    window.dispatchEvent(new CustomEvent(OPEN_LINKED, { detail: threadId }));
  };
  return (
    <div className="flex min-w-0 items-center">
      <button
        type="button"
        onClick={openHere}
        title={`Asana task: ${link.taskName}`}
        aria-label={isCompactViewport ? `Asana task: ${link.taskName}` : undefined}
        className={`${HEADER_CONTROL} min-w-0 px-2`}
      >
        <Icon name="ListTodo" aria-hidden className="size-3.5 shrink-0" />
        {isCompactViewport ? null : <span className="max-w-44 truncate">{link.taskName}</span>}
      </button>
      {isCompactViewport ? null : (
        <UrlLink
          href={link.taskUrl}
          title="Open in Asana"
          aria-label="Open in Asana"
          className={`${HEADER_CONTROL} w-7 shrink-0 justify-center`}
        >
          <Icon name="ExternalLink" aria-hidden className="size-3.5" />
        </UrlLink>
      )}
    </div>
  );
}
