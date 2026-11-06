// A short plain-text brief of a task, kept on a linked thread so its agent
// starts with the ticket's essentials instead of fetching them first.
// Task content is written by clients and teammates, so the brief is handed
// to agents as quoted data, never as instructions.
import type { TaskDetail } from "./asana";
import { fieldValueToMinutes, formatDuration } from "./duration";

/** bb truncates a plugin's instruction contribution at 4096 characters. */
export const MAX_BRIEF_CHARS = 3200;

const DESCRIPTION_CHARS = 1400;
const COMMENT_CHARS = 280;
const COMMENTS = 3;

function excerpt(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function fieldValue(field: TaskDetail["customFields"][number]): string | null {
  if (field.durationUnit !== null && typeof field.value === "number") {
    return formatDuration(fieldValueToMinutes(field.value, field.durationUnit));
  }
  return field.displayValue === null || field.displayValue === "" ? null : field.displayValue;
}

export function taskBrief(task: TaskDetail): string {
  const facts = [
    task.projects.length === 0 ? null : `Projects: ${task.projects.join(", ")}`,
    task.dueOn === null ? null : `Due: ${task.dueOn}`,
    `Assignee: ${task.assignee ?? "unassigned"}`,
    task.createdBy === null ? null : `Filed by: ${task.createdBy.name}`,
    task.completed ? "Status: completed" : null,
  ].filter((part) => part !== null);
  const fields = task.customFields
    .map((field) => {
      const value = fieldValue(field);
      return value === null ? null : `${field.name} ${value}`;
    })
    .filter((part) => part !== null);
  const lines = [`Task: ${task.name}`, `URL: ${task.url}`, facts.join("; ")];
  if (fields.length > 0) lines.push(`Fields: ${fields.join("; ")}`);
  lines.push("", "Description:", task.notes.trim() === "" ? "(none)" : excerpt(task.notes, DESCRIPTION_CHARS));
  const comments = task.comments.slice(-COMMENTS);
  if (comments.length > 0) {
    lines.push("", `Latest comments (${comments.length} of ${task.comments.length}):`);
    for (const comment of comments) {
      lines.push(`- ${comment.author ?? "Unknown"}, ${comment.createdAt.slice(0, 10)}: ${excerpt(comment.text, COMMENT_CHARS)}`);
    }
  }
  if (task.attachments.length > 0) {
    lines.push("", `Attachments: ${task.attachments.map((attachment) => attachment.name).join(", ")}`);
  }
  const brief = lines.join("\n");
  return brief.length <= MAX_BRIEF_CHARS ? brief : `${brief.slice(0, MAX_BRIEF_CHARS - 1)}…`;
}
