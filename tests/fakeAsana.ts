// A scripted stand-in for Asana's REST API, installed as globalThis.fetch.
// It serves the data the plugin reads and records every write, so tests can
// assert both what was written and that refused writes never reached Asana.

export interface FakeField {
  gid: string;
  name: string;
  resource_subtype: "enum" | "multi_enum" | "number" | "text" | "date" | "people";
  format?: string | null;
  precision?: number;
  is_formula_field?: boolean;
  number_value?: number | null;
  text_value?: string | null;
  enum_value?: { gid: string } | null;
  enum_options?: { gid: string; name: string; enabled: boolean }[];
}

export interface FakeTask {
  gid: string;
  name: string;
  assignee: { gid: string; name: string } | null;
  workspace: { gid: string };
  projects: { gid: string; name: string }[];
  custom_fields: FakeField[];
  completed?: boolean;
  created_by?: { gid: string; name: string };
  due_on?: string | null;
  /** Make posting a comment on this task fail, to test that later steps don't run. */
  failComments?: boolean;
}

export interface Recorded {
  method: string;
  path: string;
  body: unknown;
}

export const ME = { gid: "me1", name: "Alex Rivera" };
export const WORKSPACE = { gid: "w1", name: "Acme Co" };
export const MY_LIST = "utl1";
/** People the workspace typeahead knows. */
export const PEOPLE = [
  { gid: "902", name: "Christa", email: "christa@example.com" },
  { gid: "903", name: "Chris Lane", email: "lane@example.com" },
  { gid: "904", name: "Chris Lowe", email: "lowe@example.com" },
];

export const MY_SECTIONS = [
  { gid: "801", name: "Client work" },
  { gid: "802", name: "Alex Stuff" },
];

export function installFakeAsana(tasks: FakeTask[]) {
  const byGid = new Map(tasks.map((task) => [task.gid, structuredClone(task)]));
  const writes: Recorded[] = [];
  const original = globalThis.fetch;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const notFound = () => json(404, { errors: [{ message: "Not found" }] });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api\/1\.0/, "");
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    if (method !== "GET") writes.push({ method, path, body });

    const auth = new Headers(init?.headers).get("authorization");
    if (auth === "Bearer revoked") return json(401, { errors: [{ message: "Not Authorized" }] });
    if (path === "/users/me") return json(200, { data: { ...ME, workspaces: [WORKSPACE] } });
    if (path === "/users/me/user_task_list") return json(200, { data: { gid: MY_LIST } });
    if (path === `/projects/${MY_LIST}/sections`) return json(200, { data: MY_SECTIONS });
    if (path === `/user_task_lists/${MY_LIST}/tasks`) {
      const mine = [...byGid.values()].filter((task) => task.assignee?.gid === ME.gid && task.completed !== true);
      return json(200, {
        data: mine.map((task) => ({ ...task, assignee_section: { gid: MY_SECTIONS[0]!.gid }, actual_time_minutes: null })),
      });
    }

    if (path === "/attachments") return json(200, { data: [] });
    if (path === "/workspaces/w1/typeahead") {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      return json(200, { data: PEOPLE.filter((person) => person.name.toLowerCase().startsWith(query) || person.email.startsWith(query)) });
    }

    const section = /^\/sections\/(\w+)\/addTask$/.exec(path);
    if (section !== null && method === "POST") return json(200, { data: {} });

    const task = /^\/tasks\/(\w+)(\/\w+)?$/.exec(path);
    if (task !== null) {
      const record = byGid.get(task[1]!);
      if (record === undefined) return notFound();
      const sub = task[2];
      if (sub === "/time_tracking_entries") return json(200, { data: [] });
      if (sub === "/stories" && method === "POST") {
        if (record.failComments) return json(500, { errors: [{ message: "Server error" }] });
        return json(201, { data: { gid: "story1" } });
      }
      if (sub !== undefined) return json(200, { data: [] });
      if (method === "PUT") {
        const data = (body as { data: Record<string, unknown> }).data;
        if (typeof data.completed === "boolean") record.completed = data.completed;
        if ("assignee" in data) {
          const gid = data.assignee as string | null;
          record.assignee = gid === null ? null : (PEOPLE.find((person) => person.gid === gid) ?? { gid, name: gid });
        }
        if ("due_on" in data) record.due_on = data.due_on as string | null;
        const updates = (data.custom_fields ?? {}) as Record<string, unknown>;
        for (const [fieldGid, value] of Object.entries(updates)) {
          const field = record.custom_fields.find((candidate) => candidate.gid === fieldGid);
          if (field === undefined) return json(400, { errors: [{ message: "unknown field" }] });
          if (field.resource_subtype === "number") field.number_value = value as number | null;
          if (field.resource_subtype === "text") field.text_value = value as string | null;
          if (field.resource_subtype === "enum") field.enum_value = value === null ? null : { gid: value as string };
        }
      }
      return json(200, { data: { ...record, actual_time_minutes: null, permalink_url: `https://app.asana.com/0/0/${record.gid}` } });
    }
    return notFound();
  }) as typeof fetch;

  return {
    writes,
    task: (gid: string) => byGid.get(gid)!,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
