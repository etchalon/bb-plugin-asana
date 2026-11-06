// The approval card an agent's Asana write waits on. The server sends this
// payload with bb.ui.requestInput; app.tsx renders it in the thread. Task
// names and comment text come from Asana and the agent, so the card shows
// them as plain text only.
import { z } from "zod";

/** The pendingInteraction renderer id, shared by server and app. */
export const APPROVAL_RENDERER = "approve-write";

export const approvalPayloadSchema = z.object({
  /** What will happen, e.g. "Post a comment". */
  action: z.string().max(200),
  taskName: z.string().max(1000),
  taskUrl: z.string().max(2000),
  /** Each change in full: the comment text, who it's reassigned to, the date. */
  details: z.array(z.object({ label: z.string().max(100), value: z.string().max(20_000) })).max(20),
});
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

/** What the card submits when the user approves; declining cancels instead. */
export const APPROVED = { approved: true } as const;

export function isApproved(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { approved?: unknown }).approved === true;
}
