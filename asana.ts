// A small client for the Asana REST API, scoped to what this plugin reads:
// the signed-in user's workspaces and the open tasks in their My Tasks list,
// in the order and sections the user arranged there.
import { z } from "zod";
import { richTextToMarkdown } from "./richtext";
import { fieldValueToMinutes, minutesToFieldValue, type DurationUnit } from "./duration";

const API_BASE = "https://app.asana.com/api/1.0";
/** Asana's maximum page size. */
const PAGE_SIZE = 100;
/** Hard ceiling on tasks fetched per call, so one request stays bounded. */
export const MAX_TASKS = 1000;

const workspaceSchema = z.object({ gid: z.string(), name: z.string() });
export type Workspace = z.infer<typeof workspaceSchema>;

const meSchema = z.object({
  data: z.object({
    gid: z.string(),
    name: z.string(),
    workspaces: z.array(workspaceSchema),
  }),
});

const rawTaskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  due_on: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  permalink_url: z.string().optional(),
  projects: z
    .array(z.object({ gid: z.string(), name: z.string(), color: z.string().nullable().optional() }))
    .optional(),
  assignee_section: z.object({ gid: z.string() }).nullable().optional(),
  actual_time_minutes: z.number().nullable().optional(),
  custom_fields: z
    .array(
      z.object({
        gid: z.string(),
        name: z.string().optional(),
        resource_subtype: z.string().optional(),
        format: z.string().nullable().optional(),
        precision: z.number().optional(),
        number_value: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

/**
 * The team's own logged-time custom field, which replaces Asana's built-in
 * time tracking: a number in hours (or minutes when formatted as a duration).
 * Only tasks in projects that carry it have time to log. Its name is the
 * plugin's "Logged time field" setting; see setActualTimeFieldName.
 */
export const DEFAULT_ACTUAL_TIME_NAME = "Actual Time";
let actualTimeName = DEFAULT_ACTUAL_TIME_NAME;

/** Which custom field holds logged time, by name (case-insensitive). Blank restores the default. */
export function setActualTimeFieldName(name: string): void {
  actualTimeName = name.trim() === "" ? DEFAULT_ACTUAL_TIME_NAME : name.trim();
}

function isActualTimeName(name: string): boolean {
  return name.trim().toLowerCase() === actualTimeName.toLowerCase();
}

function isActualTimeField(field: { name?: string; resource_subtype?: string }): boolean {
  return (
    field.name !== undefined &&
    isActualTimeName(field.name) &&
    (field.resource_subtype === undefined || field.resource_subtype === "number")
  );
}

/** The task's Actual Time field, with its value in minutes. */
function actualFieldOf(raw: Pick<z.infer<typeof rawTaskSchema>, "custom_fields">) {
  const field = (raw.custom_fields ?? []).find(isActualTimeField);
  if (field === undefined) return null;
  const unit: DurationUnit = field.format === "duration" ? "minutes" : "hours";
  return {
    gid: field.gid,
    unit,
    precision: field.precision ?? null,
    minutes: field.number_value == null ? null : fieldValueToMinutes(field.number_value, unit),
  };
}

/**
 * The task's time estimate: the first number custom field Asana formats as a
 * duration ("Estimated time"), in minutes.
 */
function estimateOf(raw: Pick<z.infer<typeof rawTaskSchema>, "custom_fields">) {
  const field = (raw.custom_fields ?? []).find(
    (candidate) => candidate.format === "duration" && !isActualTimeField(candidate),
  );
  return field === undefined ? null : { gid: field.gid, minutes: field.number_value ?? null };
}

const tasksPageSchema = z.object({
  data: z.array(rawTaskSchema),
  next_page: z.object({ offset: z.string() }).nullable().optional(),
});

const userTaskListSchema = z.object({ data: z.object({ gid: z.string() }) });

const sectionsSchema = z.object({
  data: z.array(z.object({ gid: z.string(), name: z.string() })),
});

const errorSchema = z.object({
  errors: z.array(z.object({ message: z.string() })),
});

export const taskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  /** Local due date as YYYY-MM-DD, or null when the task has none. */
  dueOn: z.string().nullable(),
  /** Due timestamp (ISO 8601) when the task has a due time. */
  dueAt: z.string().nullable(),
  url: z.string(),
  projects: z.array(z.string()),
  /** Asana project GIDs, parallel to `projects`. */
  projectGids: z.array(z.string()),
  /** The My Tasks section GID, or null when Asana reports none. */
  sectionGid: z.string().nullable(),
  /** Logged time in minutes (Actual Time field, else Asana's built-in total), or null. */
  actualMinutes: z.number().nullable(),
  /** The duration-formatted estimate field's value in minutes, or null. */
  estimatedMinutes: z.number().nullable(),
  /** The first project's Asana color name ("blue", "none", …), or null. */
  projectColor: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const sectionSchema = z.object({ gid: z.string(), name: z.string() });
export type Section = z.infer<typeof sectionSchema>;

export class AsanaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Answers Asana API calls in place of the network; see setAsanaTransport. */
export type AsanaTransport = (call: {
  method: "GET" | "PUT" | "POST" | "DELETE";
  path: string;
  params: Record<string, string>;
  body: unknown;
}) => Promise<{ status: number; body: unknown }>;

let transport: AsanaTransport | null = null;

/**
 * Sends every Asana call to `next` instead of app.asana.com (screenshot
 * mode's sample workspace), or back to the network with null.
 */
export function setAsanaTransport(next: AsanaTransport | null): void {
  transport = next;
}

async function request(
  token: string,
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
  write?: { method: "PUT" | "POST" | "DELETE"; body?: unknown },
): Promise<unknown> {
  let status: number;
  let statusText = "";
  let body: unknown;
  if (transport !== null) {
    ({ status, body } = await transport({ method: write?.method ?? "GET", path, params, body: write?.body }));
  } else {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    };
    if (write?.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(url, {
      method: write?.method ?? "GET",
      headers,
      body: write?.body === undefined ? undefined : JSON.stringify(write.body),
      signal,
    });
    status = response.status;
    statusText = response.statusText;
    body = await response.json().catch(() => null);
  }
  if (status < 200 || status >= 300) {
    const parsed = errorSchema.safeParse(body);
    const detail = parsed.success ? parsed.data.errors.map((error) => error.message).join("; ") : statusText;
    throw new AsanaError(
      status === 401
        ? "Asana rejected the access token. Update it in the Asana plugin settings."
        : `Asana request failed (${status}): ${detail}`,
      status,
    );
  }
  return body;
}

export async function getMe(token: string, signal?: AbortSignal) {
  const body = await request(
    token,
    "/users/me",
    { opt_fields: "name,workspaces.name" },
    signal,
  );
  return meSchema.parse(body).data;
}

/**
 * Open (incomplete) tasks in the user's My Tasks list for one workspace, in
 * My Tasks order, with that list's sections in their order.
 */
export async function getMyTasks(
  token: string,
  workspaceGid: string,
  signal?: AbortSignal,
): Promise<{ sections: Section[]; tasks: Task[]; truncated: boolean }> {
  const list = userTaskListSchema.parse(
    await request(
      token,
      "/users/me/user_task_list",
      { workspace: workspaceGid },
      signal,
    ),
  ).data;
  const sections = sectionsSchema.parse(
    await request(
      token,
      `/projects/${list.gid}/sections`,
      { opt_fields: "name", limit: String(PAGE_SIZE) },
      signal,
    ),
  ).data;
  const tasks: Task[] = [];
  let offset: string | undefined;
  do {
    const params: Record<string, string> = {
      completed_since: "now",
      limit: String(PAGE_SIZE),
      opt_fields:
        "name,due_on,due_at,permalink_url,projects.name,projects.color,assignee_section,actual_time_minutes,custom_fields.name,custom_fields.resource_subtype,custom_fields.format,custom_fields.precision,custom_fields.number_value",
    };
    if (offset !== undefined) params.offset = offset;
    const page = tasksPageSchema.parse(
      await request(token, `/user_task_lists/${list.gid}/tasks`, params, signal),
    );
    for (const raw of page.data) {
      tasks.push({
        gid: raw.gid,
        name: raw.name.trim(),
        dueOn: raw.due_on ?? null,
        dueAt: raw.due_at ?? null,
        url: raw.permalink_url ?? `https://app.asana.com/0/0/${raw.gid}/f`,
        projects: (raw.projects ?? []).map((project) => project.name),
        projectGids: (raw.projects ?? []).map((project) => project.gid),
        sectionGid: raw.assignee_section?.gid ?? null,
        actualMinutes: actualFieldOf(raw)?.minutes ?? raw.actual_time_minutes ?? null,
        estimatedMinutes: estimateOf(raw)?.minutes ?? null,
        projectColor: raw.projects?.[0]?.color ?? null,
      });
    }
    offset = page.next_page?.offset;
  } while (offset !== undefined && tasks.length < MAX_TASKS);
  return {
    sections,
    tasks: tasks.slice(0, MAX_TASKS),
    truncated: offset !== undefined,
  };
}


const storiesSchema = z.object({
  data: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      html_text: z.string().optional(),
      created_at: z.string(),
      created_by: z.object({ name: z.string() }).nullable().optional(),
    }),
  ),
});

const rawAttachmentSchema = z.object({
  gid: z.string(),
  name: z.string(),
  host: z.string().optional(),
  size: z.number().nullable().optional(),
  created_at: z.string().optional(),
  download_url: z.string().nullable().optional(),
  view_url: z.string().nullable().optional(),
  permanent_url: z.string().nullable().optional(),
});

const attachmentsSchema = z.object({ data: z.array(rawAttachmentSchema) });
const attachmentSchemaResponse = z.object({ data: rawAttachmentSchema });

/** Description longer than this is cut, so one task stays bounded. */
const MAX_NOTES_CHARS = 20_000;
/** Most recent comments returned with a task. */
const MAX_COMMENTS = 50;
const MAX_COMMENT_CHARS = 8_000;
const ATTACHMENT_FIELDS =
  "name,host,size,created_at,download_url,view_url,permanent_url";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

export const attachmentSchema = z.object({
  gid: z.string(),
  name: z.string(),
  /** Bytes, when Asana stores the file. */
  size: z.number().nullable(),
  /** "asana" for files stored in Asana; otherwise the external host. */
  host: z.string(),
  createdAt: z.string().nullable(),
  isImage: z.boolean(),
  /** Where to open a file stored outside Asana (Drive, Dropbox, …). */
  externalUrl: z.string().nullable(),
  /** The attachment in Asana's web app. */
  permanentUrl: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

const rawCustomFieldSchema = z.object({
  gid: z.string(),
  name: z.string(),
  resource_subtype: z.string(),
  display_value: z.string().nullable().optional(),
  is_formula_field: z.boolean().optional(),
  precision: z.number().optional(),
  format: z.string().nullable().optional(),
  enum_value: z.object({ gid: z.string() }).nullable().optional(),
  multi_enum_values: z.array(z.object({ gid: z.string() })).nullable().optional(),
  number_value: z.number().nullable().optional(),
  text_value: z.string().nullable().optional(),
  date_value: z.object({ date: z.string().nullable().optional() }).nullable().optional(),
  enum_options: z
    .array(
      z.object({
        gid: z.string(),
        name: z.string(),
        enabled: z.boolean().optional(),
        color: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const CUSTOM_FIELD_FIELDS = [
  "name",
  "resource_subtype",
  "display_value",
  "is_formula_field",
  "precision",
  "format",
  "enum_value.gid",
  "multi_enum_values.gid",
  "number_value",
  "text_value",
  "date_value.date",
  "enum_options.name",
  "enum_options.enabled",
  "enum_options.color",
]
  .map((field) => `custom_fields.${field}`)
  .join(",");

/** Field types this plugin can edit; anything else is shown read-only. */
export const EDITABLE_FIELD_TYPES = ["enum", "multi_enum", "number", "text", "date"] as const;
export type EditableFieldType = (typeof EDITABLE_FIELD_TYPES)[number];

export const customFieldSchema = z.object({
  gid: z.string(),
  name: z.string(),
  /** Asana's resource_subtype: enum, multi_enum, number, text, date, people, … */
  type: z.string(),
  /** Asana's formatted value, or null when empty. */
  displayValue: z.string().nullable(),
  editable: z.boolean(),
  precision: z.number().nullable(),
  /** Asana's number format; "duration" means the value is minutes. */
  format: z.string().nullable(),
  /**
   * Set for fields that hold a duration: "minutes" for Asana duration fields
   * (Estimated time), "hours" for the team's Actual Time number field.
   */
  durationUnit: z.enum(["minutes", "hours"]).nullable(),
  /** The current value in the shape `setCustomField` accepts. */
  value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
  options: z.array(
    z.object({ gid: z.string(), name: z.string(), enabled: z.boolean(), color: z.string().nullable() }),
  ),
});
export type CustomField = z.infer<typeof customFieldSchema>;

/**
 * A new field value: an option GID (enum), option GIDs (multi_enum), a number,
 * text, a YYYY-MM-DD date, or null to clear.
 */
export const customFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.null(),
]);
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

function toCustomField(raw: z.infer<typeof rawCustomFieldSchema>): CustomField {
  const type = raw.resource_subtype;
  const value: CustomFieldValue =
    type === "enum"
      ? (raw.enum_value?.gid ?? null)
      : type === "multi_enum"
        ? (raw.multi_enum_values ?? []).map((option) => option.gid)
        : type === "number"
          ? (raw.number_value ?? null)
          : type === "text"
            ? (raw.text_value ?? null)
            : type === "date"
              ? (raw.date_value?.date ?? null)
              : null;
  return {
    gid: raw.gid,
    name: raw.name,
    type,
    displayValue: raw.display_value ?? null,
    editable:
      !(raw.is_formula_field ?? false) &&
      (EDITABLE_FIELD_TYPES as readonly string[]).includes(type),
    precision: raw.precision ?? null,
    format: raw.format ?? null,
    durationUnit:
      type !== "number"
        ? null
        : raw.format === "duration"
          ? "minutes"
          : isActualTimeName(raw.name)
            ? "hours"
            : null,
    value,
    options: (raw.enum_options ?? []).map((option) => ({
      gid: option.gid,
      name: option.name,
      enabled: option.enabled ?? true,
      color: option.color ?? null,
    })),
  };
}

const customFieldsResponseSchema = z.object({
  data: z.object({ custom_fields: z.array(rawCustomFieldSchema).optional() }),
});

export async function getCustomFields(
  token: string,
  taskGid: string,
  signal?: AbortSignal,
): Promise<CustomField[]> {
  const body = await request(token, `/tasks/${taskGid}`, { opt_fields: CUSTOM_FIELD_FIELDS }, signal);
  return (customFieldsResponseSchema.parse(body).data.custom_fields ?? []).map(toCustomField);
}

export class FieldValueError extends Error {}


const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sets one custom field on a task and returns the task's fields afterwards.
 * Re-reads the field first, so the value is checked against its current type
 * and options; throws FieldValueError for a value that does not fit.
 */
export async function setCustomField(
  token: string,
  taskGid: string,
  fieldGid: string,
  value: CustomFieldValue,
  signal?: AbortSignal,
): Promise<CustomField[]> {
  const fields = await getCustomFields(token, taskGid, signal);
  const field = fields.find((candidate) => candidate.gid === fieldGid);
  if (field === undefined) {
    throw new FieldValueError("That field is not on this task.");
  }
  if (!field.editable) {
    throw new FieldValueError(`"${field.name}" can't be edited here.`);
  }
  const enabled = new Set(field.options.filter((option) => option.enabled).map((option) => option.gid));
  let payload: unknown;
  if (value === null) {
    payload = field.type === "multi_enum" ? [] : null;
  } else if (field.type === "enum") {
    if (typeof value !== "string" || !enabled.has(value)) {
      throw new FieldValueError(`Not an option of "${field.name}".`);
    }
    payload = value;
  } else if (field.type === "multi_enum") {
    if (!Array.isArray(value) || value.some((gid) => !enabled.has(gid))) {
      throw new FieldValueError(`Not options of "${field.name}".`);
    }
    payload = [...new Set(value)];
  } else if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new FieldValueError(`"${field.name}" needs a number.`);
    }
    payload = value;
  } else if (field.type === "text") {
    if (typeof value !== "string") throw new FieldValueError(`"${field.name}" needs text.`);
    payload = value;
  } else {
    if (typeof value !== "string" || !DATE.test(value)) {
      throw new FieldValueError(`"${field.name}" needs a date as YYYY-MM-DD.`);
    }
    payload = { date: value };
  }
  const body = await request(
    token,
    `/tasks/${taskGid}`,
    { opt_fields: CUSTOM_FIELD_FIELDS },
    signal,
    { method: "PUT", body: { data: { custom_fields: { [fieldGid]: payload } } } },
  );
  return (customFieldsResponseSchema.parse(body).data.custom_fields ?? []).map(toCustomField);
}

const taskDetailResponseSchema = z.object({
  data: rawTaskSchema.extend({
    custom_fields: z.array(rawCustomFieldSchema).optional(),
    notes: z.string().optional(),
    html_notes: z.string().optional(),
    completed: z.boolean().optional(),
    assignee: z.object({ gid: z.string(), name: z.string() }).nullable().optional(),
    created_by: z.object({ gid: z.string(), name: z.string() }).nullable().optional(),
    followers: z.array(z.object({ gid: z.string(), name: z.string() })).optional(),
    parent: z.object({ gid: z.string(), name: z.string() }).nullable().optional(),
    workspace: z.object({ gid: z.string() }).optional(),
  }),
});

const subtasksResponseSchema = z.object({
  data: z.array(
    z.object({
      gid: z.string(),
      name: z.string(),
      completed: z.boolean().optional(),
      due_on: z.string().nullable().optional(),
      assignee: z.object({ name: z.string() }).nullable().optional(),
    }),
  ),
});

export const subtaskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  completed: z.boolean(),
  dueOn: z.string().nullable(),
  assignee: z.string().nullable(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const taskDetailSchema = z.object({
  gid: z.string(),
  name: z.string(),
  /** Plain-text description, cut at 20,000 characters. */
  notes: z.string(),
  /** The description as Markdown, for display. */
  notesMarkdown: z.string(),
  notesTruncated: z.boolean(),
  /** Image attachments the description embeds or links. */
  notesImageGids: z.array(z.string()),
  completed: z.boolean(),
  assignee: z.string().nullable(),
  assigneeGid: z.string().nullable(),
  /** Who filed the task: the usual person to hand it back to. */
  createdBy: z.object({ gid: z.string(), name: z.string() }).nullable(),
  followers: z.array(z.object({ gid: z.string(), name: z.string() })),
  /** The parent task when this is a subtask. */
  parent: z.object({ gid: z.string(), name: z.string() }).nullable(),
  subtasks: z.array(subtaskSchema),
  /**
   * The task's place in the token user's My Tasks, when they are the
   * assignee: its section and the list's sections, for moving it.
   */
  myTasks: z
    .object({ sectionGid: z.string().nullable(), sections: z.array(sectionSchema) })
    .nullable(),
  dueOn: z.string().nullable(),
  url: z.string(),
  projects: z.array(z.string()),
  /** Asana color names, parallel to `projects`. */
  projectColors: z.array(z.string().nullable()),
  /** Asana project GIDs, parallel to `projects`. */
  projectGids: z.array(z.string()),
  customFields: z.array(customFieldSchema),
  time: z.lazy(() => taskTimeSchema),
  attachments: z.array(attachmentSchema),
  comments: z.array(
    z.object({
      author: z.string().nullable(),
      createdAt: z.string(),
      text: z.string(),
      markdown: z.string(),
      /** Image attachments this comment links, shown under it. */
      imageGids: z.array(z.string()),
    }),
  ),
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

function toAttachment(raw: z.infer<typeof rawAttachmentSchema>): Attachment {
  const host = raw.host ?? "asana";
  return {
    gid: raw.gid,
    name: raw.name,
    size: raw.size ?? null,
    host,
    createdAt: raw.created_at ?? null,
    isImage: host === "asana" && IMAGE_EXTENSION.test(raw.name),
    externalUrl: host === "asana" ? null : (raw.view_url ?? null),
    permanentUrl: raw.permanent_url ?? null,
  };
}

/**
 * One task with its description, attachments, and most recent comments.
 * `attachmentHref` builds the link the Markdown uses for a stored file.
 */
export async function getTask(
  token: string,
  gid: string,
  attachmentHref: (attachment: Attachment) => string,
  signal?: AbortSignal,
): Promise<TaskDetail> {
  const [taskBody, storiesBody, attachmentsBody, time, subtasksBody, me] = await Promise.all([
    request(
      token,
      `/tasks/${gid}`,
      {
        opt_fields:
          `name,notes,html_notes,completed,assignee.name,created_by.name,followers.name,parent.name,workspace,assignee_section,due_on,permalink_url,projects.name,projects.color,${CUSTOM_FIELD_FIELDS}`,
      },
      signal,
    ),
    request(
      token,
      `/tasks/${gid}/stories`,
      {
        opt_fields: "type,text,html_text,created_at,created_by.name",
        limit: String(PAGE_SIZE),
      },
      signal,
    ),
    request(
      token,
      "/attachments",
      { parent: gid, opt_fields: ATTACHMENT_FIELDS, limit: String(PAGE_SIZE) },
      signal,
    ),
    getTaskTime(token, gid, signal),
    request(
      token,
      `/tasks/${gid}/subtasks`,
      { opt_fields: "name,completed,due_on,assignee.name", limit: String(PAGE_SIZE) },
      signal,
    ),
    getMe(token, signal),
  ]);
  const task = taskDetailResponseSchema.parse(taskBody).data;
  const stories = storiesSchema.parse(storiesBody).data;
  const attachments = attachmentsSchema.parse(attachmentsBody).data.map(toAttachment);
  const byGid = new Map(attachments.map((attachment) => [attachment.gid, attachment]));

  /** Markdown plus the image attachments it referenced (shown as thumbnails). */
  function convert(html: string | undefined, fallback: string) {
    const imageGids: string[] = [];
    if (html === undefined || html === "") {
      return { markdown: fallback, imageGids };
    }
    const markdown = richTextToMarkdown(html, {
      assetLink(assetGid, label) {
        const attachment = byGid.get(assetGid);
        if (attachment === undefined) return null;
        if (attachment.isImage) {
          if (!imageGids.includes(assetGid)) imageGids.push(assetGid);
          return "";
        }
        const text = label === "" || /^https?:/.test(label) ? attachment.name : label;
        return `[${text.replace(/[[\]\\]/g, "\\$&")}](<${attachmentHref(attachment)}>)`;
      },
    });
    return { markdown, imageGids };
  }

  const notes = task.notes ?? "";
  const description = convert(task.html_notes, notes);
  const assignedToMe = task.assignee?.gid === me.gid && task.workspace !== undefined;
  const myTasks = assignedToMe
    ? {
        sectionGid: task.assignee_section?.gid ?? null,
        sections: (await getMyTaskList(token, task.workspace!.gid, signal)).sections,
      }
    : null;
  return {
    gid: task.gid,
    name: task.name.trim(),
    notes: notes.slice(0, MAX_NOTES_CHARS),
    notesMarkdown: description.markdown.slice(0, MAX_NOTES_CHARS),
    notesTruncated: notes.length > MAX_NOTES_CHARS,
    notesImageGids: description.imageGids,
    completed: task.completed ?? false,
    assignee: task.assignee?.name ?? null,
    assigneeGid: task.assignee?.gid ?? null,
    createdBy: task.created_by ?? null,
    followers: task.followers ?? [],
    parent: task.parent ?? null,
    subtasks: subtasksResponseSchema.parse(subtasksBody).data.map((subtask) => ({
      gid: subtask.gid,
      name: subtask.name.trim(),
      completed: subtask.completed ?? false,
      dueOn: subtask.due_on ?? null,
      assignee: subtask.assignee?.name ?? null,
    })),
    myTasks,
    dueOn: task.due_on ?? null,
    url: task.permalink_url ?? `https://app.asana.com/0/0/${task.gid}/f`,
    projects: (task.projects ?? []).map((project) => project.name),
    projectColors: (task.projects ?? []).map((project) => project.color ?? null),
    projectGids: (task.projects ?? []).map((project) => project.gid),
    customFields: (task.custom_fields ?? []).map(toCustomField),
    time,
    attachments,
    comments: stories
      .filter((story) => story.type === "comment")
      .slice(-MAX_COMMENTS)
      .map((story) => {
        const text = (story.text ?? "").slice(0, MAX_COMMENT_CHARS);
        const body = convert(story.html_text, text);
        return {
          author: story.created_by?.name ?? null,
          createdAt: story.created_at,
          text,
          markdown: body.markdown.slice(0, MAX_COMMENT_CHARS),
          imageGids: body.imageGids,
        };
      }),
  };
}

/** A stored attachment's name and a short-lived download URL. */
export async function getAttachmentDownload(
  token: string,
  gid: string,
  signal?: AbortSignal,
): Promise<{ name: string; downloadUrl: string | null }> {
  const raw = attachmentSchemaResponse.parse(
    await request(token, `/attachments/${gid}`, { opt_fields: ATTACHMENT_FIELDS }, signal),
  ).data;
  return { name: raw.name, downloadUrl: raw.download_url ?? null };
}

const timeEntriesSchema = z.object({
  data: z.array(
    z.object({
      gid: z.string(),
      duration_minutes: z.number(),
      entered_on: z.string(),
      description: z.string().nullable().optional(),
      created_by: z.object({ gid: z.string(), name: z.string() }).nullable().optional(),
      attributable_to: z.object({ name: z.string() }).nullable().optional(),
    }),
  ),
});

const taskTimeResponseSchema = z.object({
  data: rawTaskSchema.pick({ gid: true, name: true, actual_time_minutes: true, custom_fields: true }),
});

export const timeEntrySchema = z.object({
  gid: z.string(),
  minutes: z.number(),
  /** YYYY-MM-DD the time was worked. */
  enteredOn: z.string(),
  note: z.string(),
  author: z.string().nullable(),
  /** The project the time is billed to. */
  project: z.string().nullable(),
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const taskTimeSchema = z.object({
  /**
   * Where logged time lives: an "Actual Time" custom field (older projects;
   * bb can add to it), Asana's built-in Actual time (shown beside Estimated
   * time in Asana; read-only here, as its write API needs the Timesheets and
   * Budgets add-on), or nowhere (the project doesn't track time).
   */
  source: z.enum(["field", "builtin", "none"]),
  /** Logged time in minutes from that source. */
  actualMinutes: z.number(),
  /** The Actual Time field, when the task has one; logging adds to it. */
  actualField: z
    .object({ gid: z.string(), unit: z.enum(["minutes", "hours"]), precision: z.number().nullable() })
    .nullable(),
  /** The duration-formatted estimate field, when the task has one. */
  estimate: z.object({ fieldGid: z.string(), minutes: z.number().nullable() }).nullable(),
  /** Asana's built-in entries, newest first (read-only; shown when present). */
  entries: z.array(timeEntrySchema),
});
export type TaskTime = z.infer<typeof taskTimeSchema>;

/** Logged time and the estimate for one task. */
export async function getTaskTime(
  token: string,
  gid: string,
  signal?: AbortSignal,
): Promise<TaskTime> {
  const [taskBody, entriesBody] = await Promise.all([
    request(
      token,
      `/tasks/${gid}`,
      {
        opt_fields:
          "name,actual_time_minutes,custom_fields.name,custom_fields.resource_subtype,custom_fields.format,custom_fields.precision,custom_fields.number_value",
      },
      signal,
    ),
    request(
      token,
      `/tasks/${gid}/time_tracking_entries`,
      {
        opt_fields: "duration_minutes,entered_on,description,created_by.name,attributable_to.name",
        limit: String(PAGE_SIZE),
      },
      signal,
    ),
  ]);
  const task = taskTimeResponseSchema.parse(taskBody).data;
  const entries = timeEntriesSchema.parse(entriesBody).data;
  const estimate = estimateOf(task);
  const field = actualFieldOf(task);
  const builtin =
    task.actual_time_minutes ?? entries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  return {
    // Asana pairs its Estimated time field with built-in Actual time, so a
    // task with the estimate field tracks time even before any is logged.
    source: field !== null ? "field" : builtin > 0 || estimate !== null ? "builtin" : "none",
    actualMinutes: field !== null ? (field.minutes ?? 0) : builtin,
    actualField:
      field === null ? null : { gid: field.gid, unit: field.unit, precision: field.precision },
    estimate: estimate === null ? null : { fieldGid: estimate.gid, minutes: estimate.minutes },
    entries: entries
      .map((entry) => ({
        gid: entry.gid,
        minutes: entry.duration_minutes,
        enteredOn: entry.entered_on,
        note: entry.description ?? "",
        author: entry.created_by?.name ?? null,
        project: entry.attributable_to?.name ?? null,
      }))
      .sort((a, b) => (a.enteredOn < b.enteredOn ? 1 : a.enteredOn > b.enteredOn ? -1 : 0)),
  };
}

/**
 * Logs time by adding it to the task's Actual Time field, and returns the
 * task's time afterwards. Tasks without the field have no time to log.
 * Read-modify-write: two people logging the same task at the same moment
 * can overwrite each other.
 */
export async function logTime(
  token: string,
  gid: string,
  minutes: number,
  signal?: AbortSignal,
): Promise<TaskTime> {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new FieldValueError("Log at least one minute.");
  }
  const before = await getTaskTime(token, gid, signal);
  if (before.actualField === null) {
    throw new FieldValueError(
      before.source === "builtin"
        ? "This task uses Asana's built-in Actual time, which bb can't add to. Log the time in Asana."
        : `This task has no "${actualTimeName}" field, so its project doesn't track time.`,
    );
  }
  const { gid: fieldGid, unit, precision } = before.actualField;
  const total = before.actualMinutes + minutes;
  await setCustomField(token, gid, fieldGid, minutesToFieldValue(total, unit, precision), signal);
  return getTaskTime(token, gid, signal);
}

const taskSummaryResponseSchema = z.object({
  data: z.object({
    gid: z.string(),
    name: z.string(),
    permalink_url: z.string().optional(),
    projects: z.array(z.object({ gid: z.string(), name: z.string() })).optional(),
  }),
});

/** Just a task's name and link, for labelling a thread linked to it. */
export async function getTaskSummary(
  token: string,
  gid: string,
  signal?: AbortSignal,
): Promise<{ gid: string; name: string; url: string; projects: { gid: string; name: string }[] }> {
  const task = taskSummaryResponseSchema.parse(
    await request(token, `/tasks/${gid}`, { opt_fields: "name,permalink_url,projects.name" }, signal),
  ).data;
  return {
    gid: task.gid,
    name: task.name.trim(),
    url: task.permalink_url ?? `https://app.asana.com/0/0/${task.gid}/f`,
    projects: task.projects ?? [],
  };
}

/** The token user's My Tasks list in a workspace, with its sections in order. */
export async function getMyTaskList(
  token: string,
  workspaceGid: string,
  signal?: AbortSignal,
): Promise<{ gid: string; sections: Section[] }> {
  const list = userTaskListSchema.parse(
    await request(token, "/users/me/user_task_list", { workspace: workspaceGid }, signal),
  ).data;
  const sections = sectionsSchema.parse(
    await request(
      token,
      `/projects/${list.gid}/sections`,
      { opt_fields: "name", limit: String(PAGE_SIZE) },
      signal,
    ),
  ).data;
  return { gid: list.gid, sections };
}

/** Longest comment the plugin posts. */
export const MAX_COMMENT_POST_CHARS = 10_000;

/** Posts a plain-text comment on a task as the token's user. */
export async function postComment(
  token: string,
  gid: string,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  const body = text.trim();
  if (body === "") throw new FieldValueError("The comment is empty.");
  if (body.length > MAX_COMMENT_POST_CHARS) {
    throw new FieldValueError(`Comments are limited to ${MAX_COMMENT_POST_CHARS} characters.`);
  }
  await request(token, `/tasks/${gid}/stories`, {}, signal, {
    method: "POST",
    body: { data: { text: body } },
  });
}

/** Marks a task (or subtask) complete or incomplete. */
export async function setCompleted(
  token: string,
  gid: string,
  completed: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await request(token, `/tasks/${gid}`, { opt_fields: "completed" }, signal, {
    method: "PUT",
    body: { data: { completed } },
  });
}

/**
 * Moves a task to a section of the token user's My Tasks. Refuses tasks
 * assigned to someone else and sections outside that user's list.
 */
export async function moveToMySection(
  token: string,
  taskGid: string,
  sectionGid: string,
  signal?: AbortSignal,
): Promise<void> {
  const [taskBody, me] = await Promise.all([
    request(token, `/tasks/${taskGid}`, { opt_fields: "assignee,workspace" }, signal),
    getMe(token, signal),
  ]);
  const task = z
    .object({
      data: z.object({
        assignee: z.object({ gid: z.string() }).nullable().optional(),
        workspace: z.object({ gid: z.string() }),
      }),
    })
    .parse(taskBody).data;
  if (task.assignee?.gid !== me.gid) {
    throw new FieldValueError("Only tasks assigned to you can be moved in My Tasks.");
  }
  const { sections } = await getMyTaskList(token, task.workspace.gid, signal);
  if (!sections.some((section) => section.gid === sectionGid)) {
    throw new FieldValueError("That section is not in your My Tasks.");
  }
  await request(token, `/sections/${sectionGid}/addTask`, {}, signal, {
    method: "POST",
    body: { data: { task: taskGid } },
  });
}

/** Assigns a task to a user, or unassigns it with null. */
export async function setAssignee(
  token: string,
  gid: string,
  userGid: string | null,
  signal?: AbortSignal,
): Promise<void> {
  await request(token, `/tasks/${gid}`, { opt_fields: "assignee" }, signal, {
    method: "PUT",
    body: { data: { assignee: userGid } },
  });
}

/** Sets a task's due date (YYYY-MM-DD), or clears it with null. */
export async function setDueOn(
  token: string,
  gid: string,
  dueOn: string | null,
  signal?: AbortSignal,
): Promise<void> {
  if (dueOn !== null && !DATE.test(dueOn)) throw new FieldValueError("The date must be YYYY-MM-DD.");
  await request(token, `/tasks/${gid}`, { opt_fields: "due_on" }, signal, {
    method: "PUT",
    body: { data: { due_on: dueOn } },
  });
}

const usersResponseSchema = z.object({
  data: z.array(z.object({ gid: z.string(), name: z.string(), email: z.string().nullable().optional() })),
});

export const userSchema = z.object({ gid: z.string(), name: z.string(), email: z.string().nullable() });
export type AsanaUser = z.infer<typeof userSchema>;

/** People in a workspace whose name or email starts with the query. */
export async function searchUsers(
  token: string,
  workspaceGid: string,
  query: string,
  signal?: AbortSignal,
): Promise<AsanaUser[]> {
  const body = await request(
    token,
    `/workspaces/${workspaceGid}/typeahead`,
    { resource_type: "user", query, count: "10", opt_fields: "name,email" },
    signal,
  );
  return usersResponseSchema
    .parse(body)
    .data.map((user) => ({ gid: user.gid, name: user.name, email: user.email ?? null }));
}
