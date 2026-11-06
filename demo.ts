// Screenshot mode: a made-up Asana workspace served in Asana's own response
// shapes, so every screen renders through the real code with nothing from a
// real account. Dates are relative to when the mode was turned on. Writes
// change this in-memory copy only, so the UI can be clicked through.
import type { AsanaTransport } from "./asana";
import type { LinkedThread } from "./links";
import type { ProjectMapRow } from "./projectMap";

const ME = { gid: "1100000000000001", name: "Alex Rivera" };
const WORKSPACE = { gid: "1100000000000100", name: "Northwind Studio" };
const LIST = "1100000000000200";
const SECTIONS = [
  { gid: "1100000000000301", name: "Client work" },
  { gid: "1100000000000302", name: "This week" },
  { gid: "1100000000000303", name: "Someday" },
];
const PEOPLE = [
  { ...ME, email: "alex@northwind.example" },
  { gid: "1100000000000002", name: "Priya Shah", email: "priya@acme.example" },
  { gid: "1100000000000003", name: "Marcus Lee", email: "marcus@bluebird.example" },
  { gid: "1100000000000004", name: "Dana Okafor", email: "dana@copperleaf.example" },
  { gid: "1100000000000005", name: "Sam Ortiz", email: "sam@northwind.example" },
];
const person = (index: number) => ({ gid: PEOPLE[index]!.gid, name: PEOPLE[index]!.name });
const PROJECTS = {
  acme: { gid: "1100000000000401", name: "Acme Website", color: "aqua" },
  bluebird: { gid: "1100000000000402", name: "Bluebird Mobile App", color: "purple" },
  copperleaf: { gid: "1100000000000403", name: "Copperleaf Support", color: "green" },
  internal: { gid: "1100000000000404", name: "Internal", color: "yellow-orange" },
};

/**
 * The attached screenshot: a cart page with the Checkout button sitting on
 * the footer, circled. Landscape, so the thumbnail's crop keeps the bug in view.
 */
const MOCK_SCREENSHOT = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f4f1ec"/><rect width="800" height="56" fill="#0f766e"/><text x="32" y="36" font-family="Helvetica" font-size="20" font-weight="bold" fill="#fff">acme</text><text x="640" y="36" font-family="Helvetica" font-size="15" fill="#d1fae5">Cart (2)</text><rect x="32" y="88" width="120" height="120" rx="10" fill="#d9d4cc"/><rect x="172" y="104" width="260" height="16" rx="4" fill="#9a948b"/><rect x="172" y="132" width="180" height="12" rx="4" fill="#c4beb5"/><text x="700" y="118" font-family="Helvetica" font-size="17" fill="#3b3833">$52</text><rect x="32" y="228" width="120" height="120" rx="10" fill="#d9d4cc"/><rect x="172" y="244" width="220" height="16" rx="4" fill="#9a948b"/><rect x="172" y="272" width="150" height="12" rx="4" fill="#c4beb5"/><text x="700" y="258" font-family="Helvetica" font-size="17" fill="#3b3833">$32</text><text x="32" y="392" font-family="Helvetica" font-size="18" fill="#3b3833">Subtotal</text><text x="690" y="392" font-family="Helvetica" font-size="18" font-weight="bold" fill="#3b3833">$84.00</text><rect y="420" width="800" height="80" fill="#2b2926"/><text x="32" y="468" font-family="Helvetica" font-size="15" fill="#bdb7ae">About   Shipping   Returns   Contact</text><rect x="470" y="404" width="300" height="56" rx="10" fill="#ea580c"/><text x="620" y="440" font-family="Helvetica" font-size="19" font-weight="bold" fill="#fff" text-anchor="middle">Checkout</text><ellipse cx="560" cy="440" rx="250" ry="58" fill="none" stroke="#dc2626" stroke-width="5"/></svg>`,
)}`;

type Field = {
  gid: string;
  name: string;
  resource_subtype: "enum" | "number" | "text";
  format?: string;
  precision?: number;
  number_value?: number | null;
  text_value?: string | null;
  enum_value?: { gid: string } | null;
  enum_options?: { gid: string; name: string; enabled: boolean; color: string }[];
};

const PRIORITY_OPTIONS = [
  { gid: "1100000000000601", name: "High", enabled: true, color: "red" },
  { gid: "1100000000000602", name: "Medium", enabled: true, color: "yellow-orange" },
  { gid: "1100000000000603", name: "Low", enabled: true, color: "blue" },
];
const TYPE_OPTIONS = [
  { gid: "1100000000000611", name: "Bug", enabled: true, color: "red" },
  { gid: "1100000000000612", name: "Change request", enabled: true, color: "blue" },
  { gid: "1100000000000613", name: "Maintenance", enabled: true, color: "cool-gray" },
];

/** Priority, Ticket type, Estimated time (minutes), and Actual Time (hours), as a client project carries them. */
function clientFields(priority: number | null, type: number | null, estimateMinutes: number | null, actualHours: number | null): Field[] {
  return [
    { gid: "1100000000000501", name: "Priority", resource_subtype: "enum", enum_options: PRIORITY_OPTIONS, enum_value: priority === null ? null : { gid: PRIORITY_OPTIONS[priority]!.gid } },
    { gid: "1100000000000502", name: "Ticket type", resource_subtype: "enum", enum_options: TYPE_OPTIONS, enum_value: type === null ? null : { gid: TYPE_OPTIONS[type]!.gid } },
    { gid: "1100000000000503", name: "Estimated time", resource_subtype: "number", format: "duration", precision: 0, number_value: estimateMinutes },
    { gid: "1100000000000504", name: "Actual Time", resource_subtype: "number", format: "none", precision: 2, number_value: actualHours },
  ];
}

type Story = { created_at: string; author: number; text: string; html?: string };
type DemoTask = {
  gid: string;
  name: string;
  section: number;
  project: keyof typeof PROJECTS;
  due: number | null;
  createdBy: number;
  followers: number[];
  fields: Field[];
  html: string;
  stories: Story[];
  subtasks?: { gid: string; name: string; completed: boolean; due: number | null; assignee: number | null }[];
  attachments?: { gid: string; name: string; size: number }[];
  completed?: boolean;
  assignee?: number | null;
};

function localDate(base: Date, offsetDays: number): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function tasks(): DemoTask[] {
  return [
    {
      gid: "1100000000001001", name: "Checkout button overlaps the footer on iPhone SE", section: 0, project: "acme", due: 0, createdBy: 1, followers: [1, 4],
      fields: clientFields(0, 0, 120, 1.5),
      html: `<body>On small iPhones the <strong>Checkout</strong> button sits on top of the footer links, so customers tap "Shipping" instead of checking out.\n<ul><li>iPhone SE and iPhone 13 mini, Safari</li><li>Only on the cart page</li><li>Started after last week's footer update</li></ul><img data-asana-gid="1100000000009001" alt="Cart on iPhone SE">\nCould this go out before the weekend sale?</body>`,
      stories: [
        { created_at: "-2d", author: 1, text: "Added a screenshot from my phone. It's the same on my colleague's 13 mini." },
        { created_at: "-1d", author: 0, text: "Thanks. I can reproduce it; the sticky footer is taller than the space the cart leaves for it. Fix is on the way today." },
        { created_at: "-3h", author: 1, text: "Great, thank you!" },
      ],
      subtasks: [
        { gid: "1100000000001101", name: "Reproduce on iPhone SE simulator", completed: true, due: -1, assignee: 0 },
        { gid: "1100000000001102", name: "Check the other checkout steps", completed: false, due: 0, assignee: 0 },
      ],
      attachments: [{ gid: "1100000000009001", name: "cart-iphone-se.png", size: 48_213 }],
    },
    {
      gid: "1100000000001002", name: "Push notifications arrive twice on Android", section: 0, project: "bluebird", due: -2, createdBy: 2, followers: [2],
      fields: clientFields(0, 0, 240, 2.25),
      html: `<body>Since 3.1.0, every reminder notification shows up twice on Android 14. iOS is fine.\nSteps: turn on daily reminders, wait for 9:00, two identical notifications appear.</body>`,
      stories: [
        { created_at: "-4d", author: 2, text: "A few reviews on the Play Store mention this now." },
        { created_at: "-2d", author: 0, text: "Found it: the app registers for push both at launch and after login. Testing a fix." },
      ],
    },
    {
      gid: "1100000000001003", name: "Contact form emails go to spam", section: 0, project: "copperleaf", due: 1, createdBy: 3, followers: [3],
      fields: clientFields(1, 0, 90, null),
      html: `<body>Messages from the website's contact form land in our spam folder in Gmail and Outlook. Can you look at how they're sent?</body>`,
      stories: [{ created_at: "-1d", author: 3, text: "It's happened with the last five or six messages." }],
    },
    {
      gid: "1100000000001004", name: "Add Spanish translations to the pricing page", section: 0, project: "acme", due: 3, createdBy: 1, followers: [1],
      fields: clientFields(2, 1, 180, null),
      html: `<body>The translations are in the attached doc. The pricing table and the FAQ both need them; the plan names stay in English.</body>`,
      stories: [],
      attachments: [{ gid: "1100000000009002", name: "pricing-es.docx", size: 23_904 }],
    },
    {
      gid: "1100000000001005", name: "Renew the SSL certificate for staging", section: 0, project: "copperleaf", due: 9, createdBy: 0, followers: [],
      fields: clientFields(2, 2, 30, null),
      html: `<body>Staging's certificate expires at the end of the month.</body>`,
      stories: [],
    },
    {
      gid: "1100000000001006", name: "Update the App Store screenshots for 3.2", section: 1, project: "bluebird", due: 5, createdBy: 2, followers: [2, 4],
      fields: clientFields(2, 1, 120, null),
      html: `<body>New screenshots for the redesigned home screen, in all five required sizes.</body>`,
      stories: [{ created_at: "-1d", author: 4, text: "Design files are in the shared folder." }],
    },
    {
      gid: "1100000000001007", name: "Accessibility audit of the account pages", section: 1, project: "acme", due: 6, createdBy: 1, followers: [1],
      fields: clientFields(1, 1, 600, 7.5),
      html: `<body>Run the account, orders, and settings pages through an accessibility check and fix what comes up.</body>`,
      stories: [],
    },
    {
      gid: "1100000000001008", name: "Write up the Q4 hosting cost comparison", section: 1, project: "internal", due: 12, createdBy: 4, followers: [4],
      fields: [],
      html: `<body>Compare what we pay now with the two alternatives we discussed, per client.</body>`,
      stories: [],
    },
    {
      gid: "1100000000001009", name: "Monthly analytics report for October", section: 2, project: "internal", due: null, createdBy: 0, followers: [],
      fields: [],
      html: `<body></body>`,
      stories: [],
    },
    {
      gid: "1100000000001010", name: "Try the new image CDN on a test site", section: 2, project: "internal", due: null, createdBy: 0, followers: [],
      fields: [],
      html: `<body>See whether it's worth moving the client sites over.</body>`,
      stories: [],
    },
  ];
}

const json = (status: number, body: unknown) => ({ status, body });
const notFound = () => json(404, { errors: [{ message: "Not found" }] });

function displayValue(field: Field): string | null {
  if (field.resource_subtype === "enum") {
    return field.enum_options?.find((option) => option.gid === field.enum_value?.gid)?.name ?? null;
  }
  if (field.resource_subtype === "text") return field.text_value ?? null;
  return field.number_value == null ? null : String(field.number_value);
}

export function createDemoAsana(now = new Date()) {
  const all = tasks();
  const byGid = new Map(all.map((task) => [task.gid, task]));
  const subtaskParent = new Map(all.flatMap((task) => (task.subtasks ?? []).map((subtask) => [subtask.gid, task] as const)));
  const attachmentsByGid = new Map(all.flatMap((task) => (task.attachments ?? []).map((attachment) => [attachment.gid, attachment] as const)));
  const sectionOf = new Map(all.map((task) => [task.gid, SECTIONS[task.section]!.gid]));
  const at = (relative: string) => {
    const match = /^-(\d+)([dh])$/.exec(relative);
    const ms = match === null ? 0 : Number(match[1]) * (match[2] === "d" ? 86_400_000 : 3_600_000);
    return new Date(now.getTime() - ms).toISOString();
  };
  const url = (gid: string) => `https://app.asana.com/0/0/${gid}/f`;
  const project = (task: DemoTask) => PROJECTS[task.project];
  const assignee = (task: DemoTask) => (task.assignee === undefined ? person(0) : task.assignee === null ? null : person(task.assignee));

  function raw(task: DemoTask) {
    return {
      gid: task.gid,
      name: task.name,
      due_on: task.due === null ? null : localDate(now, task.due),
      permalink_url: url(task.gid),
      projects: [project(task)],
      assignee_section: { gid: sectionOf.get(task.gid)! },
      actual_time_minutes: null,
      custom_fields: task.fields.map((field) => ({ ...field, display_value: displayValue(field) })),
    };
  }

  function detail(task: DemoTask) {
    return {
      ...raw(task),
      notes: task.html.replace(/<[^>]+>/g, ""),
      html_notes: task.html,
      completed: task.completed ?? false,
      assignee: assignee(task),
      created_by: person(task.createdBy),
      followers: task.followers.map(person),
      parent: null,
      workspace: { gid: WORKSPACE.gid },
    };
  }

  function subtaskDetail(gid: string) {
    const parent = subtaskParent.get(gid)!;
    const subtask = parent.subtasks!.find((candidate) => candidate.gid === gid)!;
    return {
      gid,
      name: subtask.name,
      completed: subtask.completed,
      due_on: subtask.due === null ? null : localDate(now, subtask.due),
      permalink_url: url(gid),
      projects: [],
      notes: "",
      html_notes: "<body></body>",
      assignee: subtask.assignee === null ? null : person(subtask.assignee),
      created_by: person(0),
      followers: [],
      parent: { gid: parent.gid, name: parent.name },
      workspace: { gid: WORKSPACE.gid },
      custom_fields: [],
    };
  }

  function attachment(gid: string) {
    const file = attachmentsByGid.get(gid)!;
    return {
      gid,
      name: file.name,
      host: "asana",
      size: file.size,
      created_at: at("-2d"),
      download_url: file.name.endsWith(".png") ? MOCK_SCREENSHOT : null,
      view_url: null,
      permanent_url: url(gid),
    };
  }

  const transport: AsanaTransport = async ({ method, path, params, body }) => {
    if (path === "/users/me") return json(200, { data: { ...ME, workspaces: [WORKSPACE] } });
    if (path === "/users/me/user_task_list") return json(200, { data: { gid: LIST } });
    if (path === `/projects/${LIST}/sections`) return json(200, { data: SECTIONS });
    if (path === `/user_task_lists/${LIST}/tasks`) {
      const open = all.filter((task) => !task.completed && (task.assignee === undefined || task.assignee === 0));
      return json(200, { data: open.map(raw) });
    }
    if (path === `/workspaces/${WORKSPACE.gid}/typeahead`) {
      const query = (params.query ?? "").toLowerCase();
      return json(200, { data: PEOPLE.filter((candidate) => candidate.name.toLowerCase().includes(query) || candidate.email.includes(query)) });
    }
    if (path === "/attachments") {
      const task = byGid.get(params.parent ?? "");
      return json(200, { data: (task?.attachments ?? []).map((file) => attachment(file.gid)) });
    }
    const attachmentPath = /^\/attachments\/(\d+)$/.exec(path);
    if (attachmentPath !== null) {
      return attachmentsByGid.has(attachmentPath[1]!) ? json(200, { data: attachment(attachmentPath[1]!) }) : notFound();
    }
    const move = /^\/sections\/(\d+)\/addTask$/.exec(path);
    if (move !== null && method === "POST") {
      const gid = (body as { data?: { task?: string } } | undefined)?.data?.task;
      if (gid !== undefined && byGid.has(gid)) sectionOf.set(gid, move[1]!);
      return json(200, { data: {} });
    }

    const taskPath = /^\/tasks\/(\d+)(\/\w+)?$/.exec(path);
    if (taskPath === null) return notFound();
    const [, gid, sub] = taskPath as unknown as [string, string, string | undefined];
    const parent = subtaskParent.get(gid);
    if (parent !== undefined) {
      const subtask = parent.subtasks!.find((candidate) => candidate.gid === gid)!;
      if (method === "PUT") {
        const data = (body as { data: { completed?: boolean } }).data;
        if (typeof data.completed === "boolean") subtask.completed = data.completed;
      }
      return sub === undefined ? json(200, { data: subtaskDetail(gid) }) : json(200, { data: [] });
    }
    const task = byGid.get(gid);
    if (task === undefined) return notFound();
    if (sub === "/stories") {
      if (method === "POST") {
        const text = (body as { data: { text: string } }).data.text;
        task.stories.push({ created_at: now.toISOString(), author: 0, text });
        return json(201, { data: { gid: `${gid}9` } });
      }
      return json(200, {
        data: task.stories.map((story) => ({
          type: "comment",
          text: story.text,
          created_at: story.created_at.startsWith("-") ? at(story.created_at) : story.created_at,
          created_by: { name: PEOPLE[story.author]!.name },
        })),
      });
    }
    if (sub === "/subtasks") {
      return json(200, {
        data: (task.subtasks ?? []).map((subtask) => ({
          gid: subtask.gid,
          name: subtask.name,
          completed: subtask.completed,
          due_on: subtask.due === null ? null : localDate(now, subtask.due),
          assignee: subtask.assignee === null ? null : { name: PEOPLE[subtask.assignee]!.name },
        })),
      });
    }
    if (sub !== undefined) return json(200, { data: [] });
    if (method === "PUT") {
      const data = (body as { data: Record<string, unknown> }).data;
      if (typeof data.completed === "boolean") task.completed = data.completed;
      if ("assignee" in data) {
        const index = PEOPLE.findIndex((candidate) => candidate.gid === data.assignee);
        task.assignee = index === -1 ? null : index;
      }
      if ("due_on" in data) {
        const due = data.due_on as string | null;
        task.due = due === null ? null : Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(localDate(now, 0) + "T00:00:00").getTime()) / 86_400_000);
      }
      for (const [fieldGid, value] of Object.entries((data.custom_fields ?? {}) as Record<string, unknown>)) {
        const field = task.fields.find((candidate) => candidate.gid === fieldGid);
        if (field === undefined) return json(400, { errors: [{ message: "Unknown custom field" }] });
        if (field.resource_subtype === "number") field.number_value = value as number | null;
        if (field.resource_subtype === "text") field.text_value = value as string | null;
        if (field.resource_subtype === "enum") field.enum_value = value === null ? null : { gid: value as string };
      }
    }
    return json(200, { data: detail(task) });
  };

  /** Threads that look like they're working on two of the tasks, for the list and task view. */
  const threads: Record<string, LinkedThread[]> = {
    "1100000000001001": [
      { threadId: "thr_demo00001", title: "Acme Website: Checkout button overlaps the footer on iPhone SE", status: "active", archived: false, lastSummary: null, lastIdleAt: null },
    ],
    "1100000000001002": [
      { threadId: "thr_demo00002", title: "Bluebird: Push notifications arrive twice on Android", status: "idle", archived: false, lastSummary: "Fixed. Reminders now register for push once, after login, so each one arrives a single time.", lastIdleAt: now.getTime() - 1_800_000 },
    ],
  };

  /** The Projects page: one waiting suggestion, two mapped, one unmapped. */
  const bbProjects = [
    { id: "proj_demo_acme", name: "acme-website" },
    { id: "proj_demo_bluebird", name: "bluebird-app" },
    { id: "proj_demo_copperleaf", name: "copperleaf" },
    { id: "proj_demo_ops", name: "northwind-ops" },
  ];
  const mapRows: ProjectMapRow[] = [
    { asanaGid: PROJECTS.acme.gid, asanaName: PROJECTS.acme.name, bbProjectId: "proj_demo_acme", source: "learned" },
    { asanaGid: PROJECTS.bluebird.gid, asanaName: PROJECTS.bluebird.name, bbProjectId: "proj_demo_bluebird", source: "confirmed" },
    { asanaGid: PROJECTS.copperleaf.gid, asanaName: PROJECTS.copperleaf.name, bbProjectId: "proj_demo_copperleaf", source: "suggested" },
    { asanaGid: PROJECTS.internal.gid, asanaName: PROJECTS.internal.name, bbProjectId: null, source: "none" },
  ];
  const projectMap = {
    get: () => ({ rows: mapRows.map((row) => ({ ...row })), bbProjects, effective: {} as Record<string, string> }),
    set: (asanaGid: string, bbProjectId: string | null) => {
      const row = mapRows.find((candidate) => candidate.asanaGid === asanaGid);
      if (row !== undefined) Object.assign(row, { bbProjectId, source: bbProjectId === null ? "none" : "confirmed" });
    },
    forget: (asanaGid: string) => {
      const row = mapRows.find((candidate) => candidate.asanaGid === asanaGid);
      if (row !== undefined) Object.assign(row, { bbProjectId: null, source: "none" });
    },
  };

  return { transport, threads, projectMap };
}

export type DemoAsana = ReturnType<typeof createDemoAsana>;

/** The token screenshot mode reads with; it never leaves the plugin. */
export const DEMO_TOKEN = "screenshot-mode";
