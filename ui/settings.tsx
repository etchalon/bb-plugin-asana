// Getting started: shown under the plugin's settings form. Live status for
// each step of setup, from connecting Asana to trying it from an agent.
import { useCallback, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { UrlLink, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS, useProjectMap } from "./shared";

type Status =
  | { state: "loading" }
  | { state: "needs_token" }
  | { state: "rejected" }
  | { state: "error"; message: string }
  | { state: "ok"; userName: string; workspaces: { gid: string; name: string }[]; workspaceGid: string | null };

/** Connection status, rechecked whenever the plugin's settings are saved. */
function useConnection() {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const check = useCallback(() => {
    rpc.call("connection_status").then(setStatus, (cause: unknown) =>
      setStatus({ state: "error", message: cause instanceof Error ? cause.message : String(cause) }),
    );
  }, [rpc]);
  useEffect(check, [check]);
  useRealtime("settings-changed", check);
  return { status, check };
}

/** One numbered step: a done/to-do marker, a title, and its body. */
function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-content-center rounded-full text-[0.6875rem] font-semibold",
          done ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
        )}
      >
        {done ? <Icon name="Check" aria-hidden className="size-3" /> : <span aria-hidden>{n}</span>}
        <span className="sr-only">{done ? "Done:" : `Step ${n}:`}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function GettingStarted() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const workspaceId = useId();
  const { status, check } = useConnection();
  const { data: projectMap } = useProjectMap();
  const [switching, setSwitching] = useState(false);
  const connected = status.state === "ok";

  const rows = projectMap?.rows ?? [];
  const mapped = rows.filter((row) => row.bbProjectId !== null && row.source !== "suggested").length;
  const suggested = rows.filter((row) => row.source === "suggested").length;

  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-card px-4">
      <Step n={1} done={connected} title="Connect your Asana account">
        {status.state === "loading" ? (
          <p>Checking…</p>
        ) : status.state === "ok" ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>
              Connected as <span className="font-medium text-foreground">{status.userName}</span>.
            </span>
            <Button variant="ghost" size="sm" className="h-7" onClick={check}>
              Check again
            </Button>
          </p>
        ) : (
          <>
            {status.state === "rejected" ? (
              <p role="alert" className="mb-1.5 text-destructive">
                Asana rejected this token. It may have expired or been revoked; create a new one.
              </p>
            ) : status.state === "error" ? (
              <p role="alert" className="mb-1.5 text-destructive">
                Couldn't reach Asana: {status.message}
              </p>
            ) : null}
            <p>
              In Asana, create a personal access token (name it “bb” so you can find it later), then paste it into{" "}
              <span className="font-medium text-foreground">Personal access token</span> above.
            </p>
            <p className="mt-2">
              <UrlLink
                href="https://app.asana.com/0/my-apps"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open Asana developer apps
                <Icon name="ExternalLink" aria-hidden className="size-3.5" />
              </UrlLink>
            </p>
          </>
        )}
      </Step>

      <Step n={2} done={connected && status.workspaceGid !== null} title="Choose your workspace">
        {status.state !== "ok" ? (
          <p>Available once you're connected.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={workspaceId} className="sr-only">
              Asana workspace
            </label>
            <select
              id={workspaceId}
              value={status.workspaceGid ?? ""}
              disabled={switching}
              onChange={(event) => {
                setSwitching(true);
                rpc
                  .call("workspace_select", { gid: event.target.value })
                  .catch(() => {})
                  .finally(() => setSwitching(false));
              }}
              className={cn(CONTROL_CLASS, "w-auto min-w-48")}
            >
              {status.workspaceGid === null ? <option value="">Choose a workspace</option> : null}
              {status.workspaces.map((workspace) => (
                <option key={workspace.gid} value={workspace.gid}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <span>Your My Tasks list comes from this workspace.</span>
          </div>
        )}
      </Step>

      <Step n={3} done={false} title="Open your tasks">
        <p>
          Your My Tasks list, grouped by your sections. Every thread also has an Asana tab in its right panel, and the
          sidebar icon counts overdue tasks.
        </p>
        <Button
          size="sm"
          className="mt-2"
          disabled={!connected}
          onClick={() => navigate.toPluginPanel("tasks", { subPath: "" })}
        >
          Open Asana tasks
        </Button>
      </Step>

      <Step n={4} done={connected && rows.length > 0 && suggested === 0 && mapped > 0} title="Map Asana projects to bb projects">
        <p>
          Start thread opens a ticket in the matching bb project.{" "}
          {rows.length === 0
            ? "Projects appear here once your tasks load."
            : `${mapped} of ${rows.length} mapped${suggested > 0 ? `, ${suggested} suggested and waiting for you to confirm` : ""}.`}{" "}
          Threads you start from a ticket also teach this as you go.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={!connected}
          onClick={() => navigate.toPluginPanel("tasks", { subPath: "projects" })}
        >
          Map projects
        </Button>
      </Step>

      <Step n={5} done={false} title="Ask an agent">
        <p>
          Agents in bb can read and update your tasks with <code className="text-foreground">bb asana</code>, and a
          thread started from a ticket begins with the ticket's details. Try asking “What's overdue in Asana?”
        </p>
        <p className="mt-2">
          Before an agent comments, reassigns, or changes a task, its thread shows you the exact change to approve
          (see <span className="font-medium text-foreground">Ask before agents write to Asana</span> above).
        </p>
      </Step>
    </ol>
  );
}
