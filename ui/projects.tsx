// The Projects page: which bb project each Asana project's tasks open in.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, ProjectMapRow } from "../server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useProjectMap, EmptyState, CONTROL_CLASS } from "./shared";

/** Where Start thread opens each Asana project's tasks. */
export function ProjectMapView({ onBack }: { onBack: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const { data, reload } = useProjectMap();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void reload();
  }, [reload]);
  const run = (work: Promise<unknown>) =>
    work.then(
      () => setError(null),
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  const sourceLabel: Record<ProjectMapRow["source"], string | null> = {
    confirmed: null,
    learned: "Learned",
    suggested: "Suggested",
    none: null,
  };
  return (
    <section aria-labelledby="asana-project-map">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <Icon name="ChevronLeft" aria-hidden className="size-4" />
        My Tasks
      </Button>
      <h2 id="asana-project-map" className="mt-3 text-xl font-semibold text-foreground">
        Projects
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Start thread opens a task in the bb project mapped to its Asana project. Threads you start
        from a task teach this automatically; suggestions apply once you confirm them.
      </p>
      {error === null ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4">
        {data === null ? (
          <EmptyState>Loading projects…</EmptyState>
        ) : data.rows.length === 0 ? (
          <EmptyState>No Asana projects on your tasks yet.</EmptyState>
        ) : (
          <ProjectGroups
            rows={data.rows}
            renderRow={(row) => {
              const selectId = `asana-map-${row.asanaGid}`;
              const label = sourceLabel[row.source];
              return (
                <li key={row.asanaGid} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm">
                  <label htmlFor={selectId} className="min-w-40 flex-1 truncate text-foreground">
                    {row.asanaName}
                  </label>
                  {label === null ? null : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        row.source === "suggested" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-foreground",
                      )}
                    >
                      {label}
                    </span>
                  )}
                  <select
                    id={selectId}
                    value={row.bbProjectId ?? ""}
                    onChange={(event) =>
                      void run(
                        rpc.call("project_map_set", {
                          asanaGid: row.asanaGid,
                          asanaName: row.asanaName,
                          bbProjectId: event.target.value === "" ? null : event.target.value,
                        }),
                      )
                    }
                    className={cn(CONTROL_CLASS, "w-52")}
                  >
                    <option value="">No bb project</option>
                    {data.bbProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {row.source === "suggested" && row.bbProjectId !== null ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run(
                          rpc.call("project_map_set", {
                            asanaGid: row.asanaGid,
                            asanaName: row.asanaName,
                            bbProjectId: row.bbProjectId,
                          }),
                        )
                      }
                    >
                      Confirm
                    </Button>
                  ) : row.source === "confirmed" || row.source === "learned" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(rpc.call("project_map_forget", { asanaGid: row.asanaGid }))}
                      aria-label={`Reset the mapping for ${row.asanaName}`}
                    >
                      Reset
                    </Button>
                  ) : null}
                </li>
              );
            }}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Suggestions waiting for a confirm first, then mapped projects, then the
 * unmapped ones folded away; most people only need the first two.
 */
function ProjectGroups({ rows, renderRow }: { rows: ProjectMapRow[]; renderRow: (row: ProjectMapRow) => ReactNode }) {
  const waiting = rows.filter((row) => row.source === "suggested");
  const mapped = rows.filter((row) => row.source === "confirmed" || row.source === "learned");
  const unmapped = rows.filter((row) => row.source === "none");
  const list = (group: ProjectMapRow[]) => (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
      {group.map(renderRow)}
    </ul>
  );
  const heading = "mb-1.5 text-xs font-medium text-muted-foreground";
  return (
    <div className="flex flex-col gap-5">
      {waiting.length === 0 ? null : (
        <section aria-labelledby="asana-map-waiting">
          <h3 id="asana-map-waiting" className={heading}>
            Waiting for you ({waiting.length})
          </h3>
          {list(waiting)}
        </section>
      )}
      {mapped.length === 0 ? null : (
        <section aria-labelledby="asana-map-mapped">
          <h3 id="asana-map-mapped" className={heading}>
            Mapped ({mapped.length})
          </h3>
          {list(mapped)}
        </section>
      )}
      {unmapped.length === 0 ? null : (
        <details className="group/unmapped">
          <summary
            className={cn(
              heading,
              "inline-flex cursor-pointer list-none items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
            )}
          >
            <Icon name="ChevronRight" aria-hidden className="size-3 transition-transform group-open/unmapped:rotate-90" />
            Not mapped ({unmapped.length})
          </summary>
          {list(unmapped)}
        </details>
      )}
    </div>
  );
}
