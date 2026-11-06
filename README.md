# bb-plugin-asana

Loads the open Asana tasks assigned to you into bb.

- `server.ts` — settings (a secret access token and an optional workspace),
  the `tasks_list` RPC for the page, and the `bb asana` CLI.
- `asana.ts` — the Asana REST client (`/users/me`, the My Tasks
  `user_task_list`, its sections and tasks).
- `due.ts` — section grouping and due-date buckets shared by the CLI and the
  page.
- `app.tsx` — the frontend entry: registers the **Asana tasks** page, the
  **Asana** tab in every thread's right panel, the overdue badge, and the
  thread Info section. The views live in `ui/`: `list`, `task` (composed
  from `fields`, `time`, `attachments`, `comments`, `threads`), `projects`,
  and `shared` (hooks, Start thread, project map store).
- The workspace switcher saves the choice as the `workspace` setting
  (`workspace_select` RPC), so lists, the badge, and the CLI default follow.
- The list: an overdue badge (`experimental_useBadge` on the nav panel),
  search, an overdue filter and collapsible sections (both kept in
  localStorage), and arrow-key navigation. A background service refreshes
  the server cache every `refreshMinutes` and publishes `tasks-changed` only
  when the list changed; lists also reload when the window becomes visible.
- `projectMap.ts` / `projectMatch.ts` — Asana project → bb project mapping
  in kv (`project-map`): "learned" when a linked thread runs in a bb project,
  "confirmed" from the Projects page (`/plugins/asana/tasks/projects`), and
  name-match suggestions that apply only once confirmed. Start thread
  preselects the current thread's project, else the mapped one.
- `brief.ts` — the task brief kept on linked threads (`taskBrief` in thread
  metadata, refreshed on `thread.active` after 10 minutes) and quoted into
  agent instructions as data.
- New-assignment alerts: every fresh list load compares against all task
  GIDs seen in the workspace (kv `known-tasks:<workspace>`) and publishes
  `tasks-assigned`; the badge hook (always mounted) shows a toast.
- `richtext.ts` — converts Asana rich text to Markdown for bb's renderer.
- Clicking a task opens a detail view (`task_get` RPC): the page routes it at
  `/plugins/asana/tasks/<gid>`, the panel keeps it in state. Files stored in
  Asana stream through `GET /api/v1/plugins/asana/http/attachment?gid=…`
  (local auth), which fetches a fresh download URL each time.
- The task view edits custom fields through the `task_set_field` RPC.
  `setCustomField` in `asana.ts` re-reads the field before every write and
  rejects values that do not match its type or enabled options. People and
  formula fields are read-only.
- Time: most projects use Asana's built-in Actual time (beside Estimated
  time); bb reads it (`actual_time_minutes`, entries) but can't add to it,
  since that API needs the Timesheets and Budgets add-on. Older projects
  carry an "Actual Time" custom field (hours), which `time_log` / `bb asana
  log` add to. A task with the Estimated time field counts as time-tracked
  even at 0h. `duration.ts` converts between minutes and hours fields.
- `links.ts` — thread ↔ task links, stored in the plugin's thread metadata
  with a kv reverse index (`task-threads:<gid>`). `thread.active` links a
  thread whose first message is the Start thread prompt, and titles that
  thread "<bb project>: <ticket>" (`threadTitle` in `links.ts`). Linked threads get a
  short agent instruction naming the task, the task's name in the thread
  header (`ThreadHeaderAsana`: opens it in the Asana panel, or on
  asana.com), an Info tab section, and open to their task in the Asana panel.
  `tasks_threads` gives the list each task's threads in one call, and
  `thread.active`/`thread.idle` publish `links-changed` so its markers
  follow the agent.
- Task writes: `task_comment`, `task_complete` (also subtasks), and
  `task_move` (My Tasks sections; refuses tasks assigned to others). On
  `thread.idle`, a linked thread's final message is saved in its metadata
  (`lastSummary`) and offered as a comment draft; nothing posts on its own.
- Each task row has a button that opens the new-thread composer with a
  "Resolve this Asana task" prompt (`useBbNavigate().toCompose`).
- `skills/asana-tasks/SKILL.md` — tells agents how to use `bb asana`.
- `skills/asana-comment/SKILL.md` — the voice and checks for every Asana
  comment and hand-back note. Because the server registers
  `bb.agents.configure`, bb loads only the skills it selects; it selects
  both (`AGENT_SKILLS` in `server.ts`, kept in step with `skills/` by a test).

## Tests

```
npm test        # unit tests plus the server's write rules in bb's fake plugin host
npm run typecheck
```

`tests/server.test.ts` runs the real plugin against `tests/fakeAsana.ts`, a
fake Asana that records every write, so refused writes are proven never to
reach Asana.

## Settings

Settings → Installed plugins → Asana holds the token, workspace, refresh
interval, the name of the custom field your projects log time in (**Logged
time field**, default "Actual Time"), whether agents must ask before writing,
and screenshot mode, each with a short explanation, and a **Getting started** section
(`ui/settings.tsx`) with live status: whether the token works and as whom, a
workspace picker, and links to the tasks page and project mapping.

## Screenshot mode

**Screenshot mode** in the plugin settings swaps your Asana account for a
made-up one (`demo.ts`): Northwind Studio, with sample clients, tasks dated
relative to today, comments, subtasks, an image attachment, time fields, two
tasks that look like they have threads, and a Projects page with sample bb
projects. It plugs in where every Asana call is made (`setAsanaTransport` in
`asana.ts`), so every screen renders through the real code; nothing is read
from or written to Asana while it's on, and your saved workspace and project
mappings are left alone. Changes made in it are kept in memory and reset
when it's turned off. bb's own sidebar still shows your real threads, so
collapse it or crop to the plugin when taking marketplace screenshots.

```
bb plugin config asana set screenshotMode true
bb plugin config asana set screenshotMode false
```

## Security

What protects you, and what doesn't:

- **The token** is a secret setting, sent only to `app.asana.com`, never
  returned to the UI or logged. Asana tokens can't be scoped: anything that
  can use this plugin (any bb window, any agent on this machine, anyone you
  give bb remote access) acts as you in every workspace you can see. Revoke
  it at https://app.asana.com/0/my-apps if any of those is exposed.
- **Agent writes need your approval.** Ticket text is written by clients and
  teammates and can try to steer an agent. With **Ask before agents write to
  Asana** on (the default), every CLI write run from a thread
  (`approveAgentWrite` in `server.ts`) shows an approval card with the exact
  change (`ui/approval.tsx`) and writes nothing unless you approve. Commands
  you run in your own terminal don't ask.
- **What the card can't stop:** bb lets anything with CLI access answer a
  plugin form (`bb thread interactions respond`) and call the plugin's RPC
  methods directly (`bb plugin rpc call asana …`), and neither tells the
  plugin whether you or an agent made the call. A determined, misbehaving
  agent could still write; the card stops the ordinary case of an agent
  following instructions planted in a ticket. The skill tells agents never
  to answer the card themselves.
- **Ticket text is marked as data:** `bb asana task` opens with a notice that
  what follows is written by other people, and the brief in a linked
  thread's instructions is quoted the same way.
- **Comment drafts** taken from a thread's final message keep only its first
  paragraph as plain text (`drafts.ts`), and the composer warns when a
  comment mentions file paths, commit hashes, code, local addresses, or
  something like a secret.
- **Rendering:** ticket links pass only as `http(s)`, a thread's stored task
  link must be an `https://app.asana.com/` URL, and attachments are proxied
  without your token under a `sandbox` content policy with `nosniff`.

## Setup

```
npm install --include=dev
bb plugin install .
```

Then create a personal access token at https://app.asana.com/0/my-apps and
paste it into Settings → Installed plugins → Asana → Personal access token.

## CLI

```
bb asana tasks [--section <name>]... [--due overdue,today,week,later,none] [--workspace <name-or-gid>] [--limit <n>] [--json]
bb asana task <gid> [--json]
bb asana log <gid> <duration> [--json]
bb asana set <gid> [--field <name=value>]... [--clear <name>]... [--json]
bb asana comment <gid> --text <text>
bb asana complete <gid> [--undo]
bb asana move <gid> --section <name> [--workspace <name-or-gid>]
bb asana assign <gid> --to <me|creator|none|name|email>
bb asana due <gid> <YYYY-MM-DD|none>
bb asana handoff <gid> [--to <who>] [--comment <text>] [--complete]
bb asana link <gid> [--thread <id>]
bb asana unlink [--thread <id>]
bb asana workspaces [--json]
```

`tasks` lists the incomplete tasks in your My Tasks list, in My Tasks order
under its sections, capped at 1000 fetched from Asana.
