// Hand back: the usual way to finish a client ticket in one step: post a
// comment, reassign to whoever filed it, and optionally mark it complete.
// The comment starts from the linked thread's final message plus any pull
// request links; nothing reaches Asana until you press Hand back.
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { LinkedThread, rpcContract, TaskDetail } from "../server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { PersonPicker, peopleOn, type Person } from "./people";
import { OversharingWarning } from "./comments";
import { draftFromSummary } from "../drafts";

/**
 * The starting comment: the opening paragraph of the newest finished
 * thread's message (the rest is written for you, not the reporter), then PR links.
 */
function draftComment(threads: LinkedThread[], pullRequests: { title: string; url: string }[]): string {
  const latest = threads
    .filter((thread) => thread.lastSummary !== null)
    .sort((a, b) => (b.lastIdleAt ?? 0) - (a.lastIdleAt ?? 0))[0];
  const parts = [draftFromSummary(latest?.lastSummary ?? "")];
  if (pullRequests.length === 1) parts.push(`Pull request: ${pullRequests[0]!.url}`);
  if (pullRequests.length > 1) parts.push(`Pull requests:\n${pullRequests.map((pr) => `- ${pr.url}`).join("\n")}`);
  return parts.filter((part) => part !== "").join("\n\n");
}

export function HandoffButton({
  detail,
  threads,
  reload,
  primary = false,
}: {
  detail: TaskDetail;
  threads: LinkedThread[];
  reload: () => Promise<unknown>;
  /** The view's main action: in the task's own thread. */
  primary?: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const people = peopleOn(detail);
  const [to, setTo] = useState<Person | null>(null);
  const [text, setText] = useState("");
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form each time it opens: who filed it, and the drafted comment.
  useEffect(() => {
    if (!open) return;
    setTo(detail.createdBy);
    setComplete(false);
    setError(null);
    setText(draftComment(threads, []));
    let current = true;
    rpc.call("task_pull_requests", { gid: detail.gid }).then(
      (result) => {
        if (current && result.pullRequests.length > 0) setText(draftComment(threads, result.pullRequests));
      },
      () => {},
    );
    return () => {
      current = false;
    };
    // Only on opening; later edits to the draft are the user's.
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    rpc
      .call("task_handoff", { gid: detail.gid, text, assigneeGid: to?.gid ?? null, complete })
      .then(
        () => {
          setOpen(false);
          toast(to === null ? "Handed back and unassigned" : `Handed back to ${to.name}`);
          void reload();
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setPending(false));
  };

  return (
    <>
      <Button variant={primary ? "default" : "outline"} size="sm" onClick={() => setOpen(true)}>
        <Icon name="UserRoundPlus" fallback="Check" aria-hidden className="size-4" />
        Hand back
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand back “{detail.name}”</DialogTitle>
            <DialogDescription>
              Posts the comment, then reassigns. Nothing changes in Asana until you press Hand back.
            </DialogDescription>
          </DialogHeader>
          <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-to`} className="text-xs text-muted-foreground">
                Reassign to
              </label>
              <PersonPicker id={`${formId}-to`} value={to?.gid ?? null} people={people} onChange={setTo} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-comment`} className="text-xs text-muted-foreground">
                Comment (optional, posts as you)
              </label>
              <textarea
                id={`${formId}-comment`}
                value={text}
                rows={6}
                maxLength={10000}
                disabled={pending}
                onChange={(event) => setText(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <OversharingWarning text={text} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={complete}
                disabled={pending}
                onChange={(event) => setComplete(event.target.checked)}
                className="size-4"
              />
              Also mark it complete
            </label>
            {error === null ? null : (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} size="sm" disabled={pending}>
              Hand back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
