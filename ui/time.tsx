// Time, under the Actual time row in Details: progress against the estimate,
// and logging time.
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { UrlLink, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, TaskTime } from "../server";
import { toast } from "sonner";
import { formatDuration, parseDuration } from "../duration";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./shared";

/**
 * Fills the value column under Actual time (the row above shows the total).
 * Tasks with an Actual Time field log by adding to it; Asana's built-in time
 * links to Asana, which is the only place it can be logged; tasks with
 * neither (projects that don't track time) show nothing.
 */
export function TimeExtras({
  taskGid,
  taskUrl,
  time,
  onChange,
}: {
  taskGid: string;
  /** Where to log built-in Actual time, which bb can't add to. */
  taskUrl: string;
  time: TaskTime;
  onChange: (time: TaskTime) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const formId = useId();
  const [duration, setDuration] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (time.source === "none") return null;
  const estimate = time.estimate?.minutes ?? null;
  const over = estimate !== null && time.actualMinutes > estimate;
  const percent =
    estimate === null || estimate === 0 ? null : Math.min(100, (time.actualMinutes / estimate) * 100);
  const log = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const minutes = parseDuration(duration);
    if (minutes === null || minutes === 0) {
      setError("Enter how long you worked, like 1h 30m, 90m, or 1.5h.");
      document.getElementById(`${formId}-duration`)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    rpc
      .call("time_log", { gid: taskGid, minutes })
      .then(
        (next) => {
          onChange(next);
          setDuration("");
          toast(`Logged ${formatDuration(minutes)}`);
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setPending(false));
  };
  return (
    <>
      <span aria-hidden />
      <div className="-mt-1 min-w-0">
        {percent === null || estimate === null ? null : (
          <>
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className={cn("mt-1 text-xs", over ? "text-destructive" : "text-muted-foreground")}>
              {over
                ? `${formatDuration(time.actualMinutes - estimate)} over the estimate`
                : `${formatDuration(estimate - time.actualMinutes)} left of the estimate`}
            </p>
          </>
        )}

        {time.source === "field" ? (
          <form onSubmit={log} className="mt-2 flex items-center gap-2" aria-label="Log time">
            <label htmlFor={`${formId}-duration`} className="sr-only">
              Add time worked
            </label>
            <input
              id={`${formId}-duration`}
              value={duration}
              onChange={(event) => {
                setDuration(event.target.value);
                setError(null);
              }}
              placeholder="Add time, e.g. 1h 30m"
              disabled={pending}
              aria-invalid={error !== null || undefined}
              aria-describedby={error === null ? undefined : `${formId}-error`}
              className={cn(CONTROL_CLASS, "h-7 text-xs")}
            />
            <Button type="submit" size="sm" variant="outline" className="h-7" disabled={pending}>
              Log
            </Button>
          </form>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            <UrlLink
              href={taskUrl}
              title="bb can't add to Asana's built-in time"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
            >
              Log time in Asana
              <Icon name="ExternalLink" aria-hidden className="size-3" />
            </UrlLink>
          </p>
        )}
        {error === null ? null : (
          <p id={`${formId}-error`} role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}

        {time.source !== "builtin" || time.entries.length === 0 ? null : (
          <details className="group/entries mt-1.5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Icon name="ChevronRight" aria-hidden className="size-3 transition-transform group-open/entries:rotate-90" />
              {time.entries.length} time entr{time.entries.length === 1 ? "y" : "ies"}
            </summary>
            <ul aria-label="Time entries" className="mt-1 divide-y divide-border">
              {time.entries.map((entry) => (
                <li key={entry.gid} className="flex items-center gap-2 py-1 text-xs">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{entry.enteredOn}</span>
                  <span className="shrink-0 font-medium">{formatDuration(entry.minutes)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {[entry.author, entry.note || null].filter((part) => part !== null).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
