// bb-plugin-asana — frontend entry: an "Asana tasks" sidebar page and an
// Asana tab pinned to every thread's right panel. Both render TasksView for
// the list and TaskDetailView when a task is opened: the page routes it at
// /plugins/asana/tasks/<gid>, the panel keeps it in local state. A thread
// linked to a task also shows the task in its header. The views
// live in ui/: list, task (with fields, time, attachments, comments, and
// threads), projects, and shared.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time.
import { useCallback, useEffect, useState } from "react";
import {
  definePluginApp,
  experimental_THREAD_INFO_SECTION_GROUPS as INFO_SECTION_GROUPS,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { useThreadLink } from "./ui/shared";
import { useOverdueBadge, TasksView } from "./ui/list";
import { ThreadHeaderAsana, ThreadInfoAsana, useOpenLinkedRequests } from "./ui/threads";
import { TaskDetailView } from "./ui/task";
import { ProjectMapView } from "./ui/projects";
import { GettingStarted } from "./ui/settings";
import { ApprovalCard } from "./ui/approval";
import { APPROVAL_RENDERER } from "./approval";

const TASK_GID = /^\d+$/;

function TasksPage({ subPath }: { subPath: string }) {
  const navigate = useBbNavigate();
  const gid = TASK_GID.test(subPath) ? subPath : null;
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          "mx-auto box-border w-full px-4 pb-4 pt-3 md:px-5 md:pt-4",
          gid === null ? "max-w-3xl" : "max-w-5xl",
        )}
      >
        {subPath === "projects" ? (
          <ProjectMapView onBack={() => navigate.toPluginPanel("tasks", { subPath: "" })} />
        ) : gid === null ? (
          <TasksView
            onOpenTask={(next) => navigate.toPluginPanel("tasks", { subPath: next })}
          />
        ) : (
          <TaskDetailView
            gid={gid}
            onBack={() => navigate.toPluginPanel("tasks", { subPath: "" })}
            onOpenTask={(next) => navigate.toPluginPanel("tasks", { subPath: next })}
          />
        )}
      </div>
    </div>
  );
}

/** The right-panel tab: same list and detail, sized for a narrow column. */
function TasksPanel({ threadId }: { threadId: string }) {
  const link = useThreadLink(threadId);
  const [gid, setGid] = useState<string | null>(null);
  // Open the linked task when the link first loads or changes.
  const linkedGid = link?.taskGid ?? null;
  useEffect(() => {
    if (linkedGid !== null) setGid(linkedGid);
  }, [linkedGid]);
  // The header's task chip brings the linked task back from anywhere in the tab.
  useOpenLinkedRequests(
    threadId,
    useCallback(() => {
      if (linkedGid !== null) setGid(linkedGid);
    }, [linkedGid]),
  );
  return (
    <div className="h-full min-h-0 overflow-y-auto px-3 pb-3 pt-3">
      {gid === null ? (
        <TasksView onOpenTask={setGid} />
      ) : (
        <TaskDetailView gid={gid} onBack={() => setGid(null)} onOpenTask={setGid} threadId={threadId} />
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "tasks",
    title: "Asana tasks",
    icon: "ListTodo",
    // Routed at /plugins/asana/tasks; /plugins/asana/tasks/<gid> opens a task.
    path: "tasks",
    component: TasksPage,
    experimental_useBadge: useOverdueBadge,
  });
  // Pinned (non-closable) in the right panel of every thread.
  // Below the settings form: live setup status and where to go next.
  app.slots.settingsSection({
    id: "getting-started",
    title: "Getting started",
    description: "Connect Asana, then find your tasks in bb.",
    component: GettingStarted,
  });
  // The card an agent's Asana write waits on (bb.ui.requestInput in server.ts).
  app.slots.pendingInteraction({ id: APPROVAL_RENDERER, component: ApprovalCard });
  // The linked task's name in the thread header, for getting back to it.
  app.slots.experimental_threadHeaderAction({
    id: "asana-task",
    title: "Asana task",
    component: ThreadHeaderAsana,
  });
  app.slots.experimental_threadInfoSection({
    id: "asana-task",
    group: INFO_SECTION_GROUPS.related,
    component: ThreadInfoAsana,
  });
  app.slots.experimental_tab({
    id: "tasks",
    title: "Asana",
    icon: "ListTodo",
    context: { kind: "thread" },
    availability: "fixed",
    layout: "flush",
    component: TasksPanel,
  });
});
