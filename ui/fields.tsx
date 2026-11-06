// The Details block: assignee, due date, projects, section, time, and editable custom fields.
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { CustomField, CustomFieldValue, rpcContract, TaskDetail, TaskTime } from "../server";
import { projectColor } from "../colors";
import { formatDue } from "../due";
import {
  fieldValueToMinutes,
  formatDuration,
  minutesToFieldValue,
  parseDuration,
} from "../duration";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { DueLabel, QUIET_CONTROL_CLASS, useWrite } from "./shared";
import { PersonPicker, peopleOn } from "./people";
import { TimeExtras } from "./time";

/** Text and number fields: saved on Enter or when focus leaves; Escape reverts. */
export function DraftInput({
  id,
  field,
  disabled,
  onSave,
}: {
  id: string;
  field: CustomField;
  disabled: boolean;
  onSave: (value: CustomFieldValue) => void;
}) {
  const unit = field.durationUnit;
  const duration = unit !== null;
  const saved =
    field.value === null
      ? ""
      : unit !== null && typeof field.value === "number"
        ? formatDuration(fieldValueToMinutes(field.value, unit))
        : String(field.value);
  const [draft, setDraft] = useState(saved);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(saved);
    setInvalid(false);
  }, [saved]);
  const commit = () => {
    if (draft === saved) return;
    if (draft.trim() === "") return onSave(null);
    if (unit !== null) {
      const minutes = parseDuration(draft);
      if (minutes === null) return setInvalid(true);
      setInvalid(false);
      const value = minutesToFieldValue(minutes, unit, field.precision);
      if (value === field.value) return setDraft(saved);
      return onSave(value);
    }
    if (field.type === "number") {
      const number = Number(draft);
      if (!Number.isFinite(number)) return setDraft(saved);
      return onSave(number);
    }
    onSave(draft);
  };
  return (
    <>
    <input
      id={id}
      type={field.type === "number" && !duration ? "number" : "text"}
      inputMode={field.type === "number" && !duration ? "decimal" : undefined}
      step={field.type === "number" && !duration && field.precision !== null ? 10 ** -field.precision : undefined}
      placeholder={duration ? "e.g. 1h 30m" : undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-invalid` : undefined}
      value={draft}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(saved);
          setInvalid(false);
        }
      }}
      className={QUIET_CONTROL_CLASS}
    />
    {invalid ? (
      <p id={`${id}-invalid`} className="mt-1 text-xs text-destructive">
        Use a duration like 1h 30m, 90m, or 1.5h.
      </p>
    ) : null}
    </>
  );
}

export function FieldControl({
  id,
  labelId,
  field,
  disabled,
  onSave,
}: {
  id: string;
  labelId: string;
  field: CustomField;
  disabled: boolean;
  onSave: (value: CustomFieldValue) => void;
}) {
  if (!field.editable) {
    return (
      <span id={id} className="text-sm text-foreground">
        {field.durationUnit !== null && typeof field.value === "number"
          ? formatDuration(fieldValueToMinutes(field.value, field.durationUnit))
          : (field.displayValue ?? <span className="text-muted-foreground">—</span>)}
      </span>
    );
  }
  const options = field.options.filter(
    (option) =>
      option.enabled ||
      option.gid === field.value ||
      (Array.isArray(field.value) && field.value.includes(option.gid)),
  );
  switch (field.type) {
    case "enum":
      return (
        <select
          id={id}
          value={typeof field.value === "string" ? field.value : ""}
          disabled={disabled}
          onChange={(event) => onSave(event.target.value === "" ? null : event.target.value)}
          className={QUIET_CONTROL_CLASS}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.gid} value={option.gid} disabled={!option.enabled}>
              {option.name}
            </option>
          ))}
        </select>
      );
    case "multi_enum": {
      const selected = Array.isArray(field.value) ? field.value : [];
      return (
        <div id={id} role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const on = selected.includes(option.gid);
            return (
              <button
                key={option.gid}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() =>
                  onSave(on ? selected.filter((gid) => gid !== option.gid) : [...selected, option.gid])
                }
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.name}
              </button>
            );
          })}
        </div>
      );
    }
    case "date":
      return (
        <input
          id={id}
          type="date"
          value={typeof field.value === "string" ? field.value : ""}
          disabled={disabled}
          onChange={(event) => onSave(event.target.value === "" ? null : event.target.value)}
          className={QUIET_CONTROL_CLASS}
        />
      );
    default:
      return <DraftInput id={id} field={field} disabled={disabled} onSave={onSave} />;
  }
}

export function FieldRow({
  taskGid,
  field,
  onSaved,
}: {
  taskGid: string;
  field: CustomField;
  onSaved: (fields: CustomField[]) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = (value: CustomFieldValue) => {
    setSaving(true);
    setError(null);
    rpc
      .call("task_set_field", { gid: taskGid, fieldGid: field.gid, value })
      .then(
        (result) => onSaved(result.customFields),
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setSaving(false));
  };
  const multi = field.editable && field.type === "multi_enum";
  return (
    <>
      {multi ? (
        <span id={`${id}-label`} className="pt-1 text-xs text-muted-foreground">
          {field.name}
        </span>
      ) : (
        <label id={`${id}-label`} htmlFor={`${id}-control`} className="text-xs text-muted-foreground">
          {field.name}
        </label>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FieldControl
              id={`${id}-control`}
              labelId={`${id}-label`}
              field={field}
              disabled={saving}
              onSave={save}
            />
          </div>
          {saving ? (
            <Icon name="Loading" aria-label="Saving" className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** One label/value pair in the Details grid. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm text-foreground">{children}</div>
    </>
  );
}

/** The My Tasks section picker row, for tasks assigned to you. */
export function SectionRow({ detail, reload }: { detail: TaskDetail; reload: () => Promise<unknown> }) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const { pending, error, run } = useWrite(reload);
  if (detail.myTasks === null || detail.myTasks.sections.length === 0) return null;
  return (
    <>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Section
      </label>
      <div className="min-w-0">
        <select
          id={id}
          value={detail.myTasks.sectionGid ?? ""}
          disabled={pending}
          onChange={(event) =>
            run(() => rpc.call("task_move", { gid: detail.gid, sectionGid: event.target.value }))
          }
          className={QUIET_CONTROL_CLASS}
        >
          {detail.myTasks.sectionGid === null ? <option value="">—</option> : null}
          {detail.myTasks.sections.map((section) => (
            <option key={section.gid} value={section.gid}>
              {section.name}
            </option>
          ))}
        </select>
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** Who the task is assigned to; changing it writes to Asana. */
export function AssigneeRow({ detail, reload }: { detail: TaskDetail; reload: () => Promise<unknown> }) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const { pending, error, run } = useWrite(reload);
  return (
    <>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Assignee
      </label>
      <div className="min-w-0">
        <PersonPicker
          id={id}
          quiet
          value={detail.assigneeGid}
          people={peopleOn(detail)}
          disabled={pending}
          onChange={(person) => void run(() => rpc.call("task_assign", { gid: detail.gid, userGid: person?.gid ?? null }))}
        />
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** "Oct 23", or "Oct 23, 2025" outside this year, as the list shows dates. */
export function formatDueDate(dueOn: string, now: Date): string {
  const date = new Date(`${dueOn}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * The due date, written like the list writes it, with how it reads
 * ("3 days overdue"). Clicking it swaps in a date input.
 */
export function DueRow({ detail, reload }: { detail: TaskDetail; reload: () => Promise<unknown> }) {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const { pending, error, run } = useWrite(reload);
  const [editing, setEditing] = useState(false);
  const save = (dueOn: string | null) => void run(() => rpc.call("task_due", { gid: detail.gid, dueOn }));
  return (
    <>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Due
      </label>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              id={id}
              type="date"
              autoFocus
              value={detail.dueOn ?? ""}
              disabled={pending}
              onChange={(event) => save(event.target.value === "" ? null : event.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Enter") {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
              className={cn(QUIET_CONTROL_CLASS, "w-auto flex-1")}
            />
          ) : (
            <button
              id={id}
              type="button"
              disabled={pending}
              onClick={() => setEditing(true)}
              aria-label={`Due date: ${detail.dueOn === null ? "none" : formatDueDate(detail.dueOn, new Date())}. Change`}
              className={cn(QUIET_CONTROL_CLASS, "w-auto flex-1 text-left")}
            >
              {detail.dueOn === null ? (
                <span className="text-muted-foreground">No due date</span>
              ) : (
                formatDueDate(detail.dueOn, new Date())
              )}
            </button>
          )}
          {/* Only when it adds to the date shown: "3 days overdue", "Tomorrow", "Fri".
              A finished task isn't overdue, so it gets no label. */}
          {detail.dueOn === null || detail.completed || /^[A-Z][a-z]{2} \d/.test(formatDue(detail.dueOn, new Date()).text) ? null : (
            <DueLabel dueOn={detail.dueOn} />
          )}
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** A field's value as short text, for the collapsed Details summary. */
export function fieldSummary(field: CustomField): string | null {
  if (field.durationUnit !== null && typeof field.value === "number") {
    return `${field.name} ${formatDuration(fieldValueToMinutes(field.value, field.durationUnit))}`;
  }
  return field.displayValue === null || field.displayValue === "" ? null : `${field.name} ${field.displayValue}`;
}

/**
 * Assignee, due date, projects, section, and custom fields in one block.
 * Narrow (the thread panel): a one-line summary that expands. Wide: a card.
 */
export function DetailsPanel({
  detail,
  reload,
  onFieldsSaved,
  onTimeLogged,
  collapsible,
}: {
  detail: TaskDetail;
  reload: () => Promise<unknown>;
  onFieldsSaved: (fields: CustomField[]) => void;
  onTimeLogged: (time: TaskTime) => void;
  collapsible: boolean;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const emptiesId = useId();
  const isEmpty = (field: CustomField) =>
    field.editable
      ? field.value === null || (Array.isArray(field.value) && field.value.length === 0)
      : field.displayValue === null || field.displayValue === "";
  // Estimated and Actual time are a pair: shown together, never hidden as empty.
  const timeFieldGids = new Set(
    [detail.time.estimate?.fieldGid, detail.time.actualField?.gid].filter((gid) => gid !== undefined),
  );
  const estimateField = detail.customFields.find((field) => field.gid === detail.time.estimate?.fieldGid);
  const actualField = detail.customFields.find((field) => field.gid === detail.time.actualField?.gid);
  const others = detail.customFields.filter((field) => !timeFieldGids.has(field.gid));
  const filled = others.filter((field) => !isEmpty(field));
  const empty = others.filter(isEmpty);
  const rows = (
    <div className="grid grid-cols-[minmax(5rem,max-content)_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5">
      <AssigneeRow detail={detail} reload={reload} />
      <DueRow detail={detail} reload={reload} />
      {detail.projects.length === 0 ? null : (
        <DetailRow label={detail.projects.length === 1 ? "Project" : "Projects"}>
          <span className="flex flex-col gap-0.5">
            {detail.projects.map((project, index) => {
              const color = projectColor(detail.projectColors[index]);
              return (
              <span key={project} className="flex items-baseline gap-1.5">
                <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-muted-foreground/40" style={color === null ? undefined : { backgroundColor: color }} />
                <span className="min-w-0 break-words">{project}</span>
              </span>
              );
            })}
          </span>
        </DetailRow>
      )}
      <SectionRow detail={detail} reload={reload} />
      {estimateField === undefined ? null : (
        <FieldRow taskGid={detail.gid} field={estimateField} onSaved={onFieldsSaved} />
      )}
      {actualField !== undefined ? (
        <FieldRow taskGid={detail.gid} field={actualField} onSaved={onFieldsSaved} />
      ) : detail.time.source === "builtin" ? (
        <DetailRow label="Actual time">{formatDuration(detail.time.actualMinutes)}</DetailRow>
      ) : null}
      <TimeExtras taskGid={detail.gid} taskUrl={detail.url} time={detail.time} onChange={onTimeLogged} />
      {filled.map((field) => (
        <FieldRow key={field.gid} taskGid={detail.gid} field={field} onSaved={onFieldsSaved} />
      ))}
      {empty.length === 0 ? null : (
        <>
          <button
            type="button"
            aria-expanded={showEmpty}
            aria-controls={emptiesId}
            onClick={() => setShowEmpty(!showEmpty)}
            className="col-span-2 -mx-1 inline-flex w-fit items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="ChevronRight" aria-hidden className={cn("size-3 transition-transform", showEmpty && "rotate-90")} />
            {empty.length} empty field{empty.length === 1 ? "" : "s"}
          </button>
          <div id={emptiesId} hidden={!showEmpty} className="col-span-2 grid grid-cols-subgrid items-center gap-y-2.5">
            {showEmpty
              ? empty.map((field) => (
                  <FieldRow key={field.gid} taskGid={detail.gid} field={field} onSaved={onFieldsSaved} />
                ))
              : null}
          </div>
        </>
      )}
    </div>
  );
  if (collapsible) {
    const section = detail.myTasks?.sections.find((candidate) => candidate.gid === detail.myTasks?.sectionGid);
    const summary = [
      section?.name ?? null,
      ...detail.customFields.map(fieldSummary).filter((part): part is string => part !== null).slice(0, 3),
    ]
      .filter((part) => part !== null)
      .join(" · ");
    return (
      <details className="group/details mt-4 rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Icon name="ChevronRight" aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/details:rotate-90" />
          <span className="font-medium">Details</span>
          {summary === "" ? null : <span className="min-w-0 truncate text-xs text-muted-foreground">{summary}</span>}
        </summary>
        <div className="border-t border-border px-4 py-3">{rows}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby="asana-details">
      <h3 id="asana-details" className="mb-1.5 text-xs font-medium text-muted-foreground">
        Details
      </h3>
      <div className="rounded-lg border border-border bg-card px-4 py-3">{rows}</div>
    </section>
  );
}
