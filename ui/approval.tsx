// The card an agent's Asana write waits on, in its thread's composer. It shows
// exactly what will be written and to which task; Approve lets it through,
// Decline writes nothing. Everything here came from Asana or the agent, so it
// renders as plain text.
import { useState } from "react";
import type { PluginPendingInteractionProps } from "@get-bb/plugin-sdk/app";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { APPROVED, approvalPayloadSchema } from "../approval";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function ApprovalCard({ interaction, submit, cancel }: PluginPendingInteractionProps) {
  const [pending, setPending] = useState(false);
  const parsed = approvalPayloadSchema.safeParse(interaction.payload);
  const answer = (work: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    void work().finally(() => setPending(false));
  };
  if (!parsed.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="text-destructive">This approval request is malformed, so it can't be approved.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => answer(cancel)}>
          Dismiss
        </Button>
      </div>
    );
  }
  const { action, taskName, taskUrl, details } = parsed.data;
  const asanaLink = /^https:\/\/app\.asana\.com\//.test(taskUrl);
  return (
    <section aria-labelledby={`${interaction.id}-title`} className="rounded-lg border border-border bg-card p-4 text-sm">
      <p className="text-xs text-muted-foreground">An agent wants to write to Asana as you</p>
      <h3 id={`${interaction.id}-title`} className="mt-1 font-medium text-foreground">
        {action}
      </h3>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon name="ListTodo" aria-hidden className="size-3.5 shrink-0" />
        {asanaLink ? (
          <UrlLink href={taskUrl} className="min-w-0 truncate underline-offset-2 hover:underline">
            {taskName}
          </UrlLink>
        ) : (
          <span className="min-w-0 truncate">{taskName}</span>
        )}
      </p>
      {details.length === 0 ? null : (
        <dl className="mt-3 flex flex-col gap-2">
          {details.map((detail, index) => (
            <div key={index}>
              <dt className="text-xs text-muted-foreground">{detail.label}</dt>
              <dd className="mt-0.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-foreground">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => answer(() => submit(APPROVED))}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => answer(cancel)}>
          Decline
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is written until you approve.</span>
      </div>
    </section>
  );
}
