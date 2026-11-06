// Comments: the timeline and the composer.
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Markdown, useRpc } from "@get-bb/plugin-sdk/app";
import type { Attachment, rpcContract, TaskDetail, LinkedThread } from "../server";
import { formatAgo } from "../due";
import { draftFromSummary, joinHints, oversharingHints } from "../drafts";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useNow, useWrite } from "./shared";
import { ImageStrip } from "./attachments";

/** Initials for a comment author's avatar: "Alex Rivera" → "AR", an email → its first letter. */
export function initials(name: string | null): string {
  if (name === null || name.trim() === "") return "?";
  const words = name.includes("@") ? [name] : name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** A stable muted hue per author, so the same person keeps the same avatar. */
export function avatarHue(name: string | null): number {
  let hash = 0;
  for (const char of name ?? "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/** Comments as a timeline: avatar, name, relative time, then the body. */
export function CommentTimeline({
  comments,
  imagesFor,
}: {
  comments: TaskDetail["comments"];
  imagesFor: (gids: string[]) => Attachment[];
}) {
  const now = useNow();
  return (
    <ol className="flex flex-col">
      {comments.map((comment, index) => (
        <li key={`${comment.createdAt}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
          {index === comments.length - 1 ? null : (
            <span aria-hidden className="absolute left-3.5 top-8 bottom-0 w-px bg-border" />
          )}
          <span
            aria-hidden
            className="relative grid size-7 shrink-0 place-content-center rounded-full text-[0.6875rem] font-semibold text-white"
            style={{ backgroundColor: `hsl(${avatarHue(comment.author)} 45% 42%)` }}
          >
            {initials(comment.author)}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.author ?? "Unknown"}</span>
              {" · "}
              <time dateTime={comment.createdAt}>{formatAgo(new Date(comment.createdAt), now)}</time>
            </p>
            {comment.markdown.trim() === "" ? null : (
              <Markdown content={comment.markdown} className="mt-1 text-sm" />
            )}
            <ImageStrip images={imagesFor(comment.imageGids)} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Before posting: names what in a comment looks internal (paths, hashes,
 * code, secrets), since the reporter reads everything posted.
 */
export function OversharingWarning({ text }: { text: string }) {
  const hints = oversharingHints(text);
  if (hints.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-foreground">
      <Icon name="AlertTriangle" fallback="Info" aria-hidden className="mt-px size-3.5 shrink-0 text-destructive" />
      <span>
        This mentions {joinHints(hints)}. The reporter sees everything you post; check it belongs there.
      </span>
    </p>
  );
}

/**
 * Posts a comment as you. Linked threads that finished offer the opening
 * paragraph of their final message as a starting draft; nothing posts until
 * you press Post.
 */
export function CommentComposer({
  detail,
  threads,
  reload,
}: {
  detail: TaskDetail;
  threads: LinkedThread[];
  reload: () => Promise<unknown>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const [text, setText] = useState("");
  const [empty, setEmpty] = useState(false);
  const { pending, error, run } = useWrite(reload);
  const drafts = threads.filter((thread) => thread.lastSummary !== null);
  const post = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (text.trim() === "") {
      setEmpty(true);
      document.getElementById(id)?.focus();
      return;
    }
    if (await run(() => rpc.call("task_comment", { gid: detail.gid, text }))) setText("");
  };
  return (
    <form onSubmit={post} className="mt-3 flex flex-col gap-2" aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={id} className="text-xs text-muted-foreground">
        Add a comment (posts to Asana as you)
      </label>
      {drafts.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Start from:</span>
          {drafts.map((thread) => (
            <Button
              key={thread.threadId}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-full"
              onClick={() => setText(draftFromSummary(thread.lastSummary ?? ""))}
              aria-label={`Use the final message of "${thread.title}" as the draft`}
            >
              <Icon name="MessageSquare" fallback="Zap" aria-hidden className="size-3.5" />
              <span className="truncate">{thread.title}</span>
            </Button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        value={text}
        rows={text.split("\n").length > 3 ? 8 : 3}
        maxLength={10000}
        disabled={pending}
        aria-invalid={empty || undefined}
        aria-describedby={empty ? `${id}-empty` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setEmpty(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <OversharingWarning text={text} />
      <div className="flex items-center gap-2">
        {empty ? (
          <p id={`${id}-empty`} className="min-w-0 flex-1 text-xs text-destructive">
            Write a comment first.
          </p>
        ) : null}
        {error === null ? null : (
          <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" className="ml-auto" disabled={pending}>
          Post comment
        </Button>
      </div>
    </form>
  );
}
