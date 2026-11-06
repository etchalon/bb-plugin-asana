See your Asana My Tasks list without leaving bb.

## What you get

- An **Asana tasks** page in the left sidebar showing your open tasks under
  your My Tasks sections, in the order you set in Asana. Each task links to
  Asana, and overdue dates show in red.
- Click a task to read it in bb: the formatted description, attachments
  (images open in a viewer, other files download), and comments with their
  screenshots. **Open in Asana** is still one click away.
- Edit a task's custom fields (dropdowns, multi-selects, numbers, text,
  dates) right in the task view; changes save to Asana immediately.
- See time against the estimate (red when over): Estimated time and Actual
  time sit together in Details, and list rows show "logged / estimated".
  Asana's built-in Actual time is read-only in bb (log it in Asana); older
  projects with an "Actual Time" custom field can log time from bb.
- Start thread opens in the right bb project: each Asana project maps to a
  bb project, learned from the threads you start and confirmed on the
  Projects page (suggestions come from matching names).
- Agents in a linked thread start with a brief of the task (description,
  latest comments, attachments), so they don't have to look it up first.
- A toast tells you when a task lands in My Tasks, with a button to open it.
- Threads stay tied to their task: a thread started from a task links to it,
  shows it in the thread header and Info tab, and opens it in the Asana
  panel. Click the task's name in the header to get back to it, or the arrow
  beside it to open it on asana.com. The task view lists every thread
  working on it.
- **Hand back** a finished task in one step: a comment drafted from the
  thread's final message and its pull request link, reassigned to whoever
  filed it, optionally completed. Reassign and change due dates from the
  task view too.
- Work the task from bb: post comments, mark it complete, move it between
  your My Tasks sections, and check off subtasks. When a linked thread
  finishes, its final message is one click from becoming a comment draft
  you edit before posting.
- A button on each task that opens a new thread with a prompt to resolve
  it. Pick the project and send; the agent reads the task's description and
  comments with `bb asana task`.
- Tasks that already have a thread say so in the list: the row's thread
  button stays visible as a filled chat bubble (pulsing while its agent
  runs) and opens that thread instead of starting another. In
  the task view the main button follows suit: Open thread when a thread
  exists, and Hand back inside the task's own thread.
- Switch Asana workspaces from the list header; the page, thread panels,
  badge, and `bb asana` commands all follow.
- The sidebar icon shows how many tasks are overdue. Search by task or
  project, filter to overdue, collapse sections (remembered), and move
  through tasks with the keyboard: `/` to search, arrows to move, Enter to
  open.
- The list stays current: bb checks Asana every 5 minutes (adjustable in
  settings; 0 turns it off) and when you return to the window.
- An **Asana** tab pinned to the right panel of every thread, so the same
  list stays beside your chat.
- A `bb asana tasks` command, so agents can answer "what's due today?" and
  link the tasks they mention.
- Agents write Asana comments in your voice: short, first person, the state
  of the bug rather than the story of the fix. The plugin ships an
  `asana-comment` skill they follow.
- Agents ask before they write. When an agent wants to comment, reassign,
  complete, or change a task, its thread shows a card with the exact change
  and the task it lands on; nothing reaches Asana until you approve. You can
  turn this off in settings, but ticket text is written by other people and
  can try to steer an agent, so it's on by default.

## Setup

Create a personal access token at
[app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) and paste it into
the plugin's **Personal access token** setting. The token is stored on the bb
server as a secret and is only sent to Asana's API. Set **Workspace** if you
use more than one Asana workspace.

The plugin changes Asana only when you act in the task view (fields, time,
comments, completion, section) or ask an agent to run one of the
`bb asana` write commands.
