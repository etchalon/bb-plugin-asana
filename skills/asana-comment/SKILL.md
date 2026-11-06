---
name: asana-comment
description: Use when writing any Asana comment, ticket reply, hand-back note, or status note on a task — enforces voice, brevity, and the no-narrator rule before the comment is posted with `bb asana comment` or `bb asana handoff`.
---

# Asana comments

The comment is **the user writing to the reporter**. Not an assistant
reporting to the user. Not a changelog. Not a conversation with yourself.

Write it, then run the checks below BEFORE `bb asana comment` or
`bb asana handoff --comment`. Most drafts fail at least one.

## The three rules

### 1. One voice, and it is the user's

There is no "I did X for you", no "we", no assistant, no user-as-third-party.
The user and the writer are the same person. If a sentence only makes sense
when two of you exist, delete it.

| Never | Write instead |
|---|---|
| "I fixed the padding" | "Fixed the padding." |
| "Correcting my last comment" | *(just state the correct thing)* |
| "<user> asked me to look at this" | *(nothing — this is the user)* |
| "Let me know if you want me to..." | *(nothing — no offers)* |
| "We slowed it down" | "Slowed it down." |

The reporter is "you" — that part is fine, because the user is genuinely
addressing them. Everything else is first person or no person.

### 2. Say what changed, not how you worked

The reporter wants the state of their bug. They do not want the investigation.

Cut every one of these:
- how the cause was found, what was measured, what was ruled out
- references to your own earlier comments, mistakes, or reassignments
- "I read the thread", "I missed", "checked the file itself"
- test results, commit hashes, file paths, tool names
- restating the ticket back to them

Keep: **what it does now**, and the specific number or behaviour that proves
it. Concrete facts are welcome; the story of obtaining them is not. A pull
request link is fine on its own line at the end.

### 3. Short

Default is **one to three sentences**. Four short paragraphs is almost always
three too many. If a change has several parts, one line each, no preamble.

A correction to an earlier comment is just the corrected statement. No
apology, no accounting of what went wrong.

## Shape

Open with the state: `Fixed.` / `Done.` / `Not a bug —` / `Already fixed on
9/18 —`. Then the substance. Then stop. No sign-off, no next-steps, no
"let me know". Plain text only: Asana doesn't render Markdown in comments.

## Examples

**Good**

> Fixed. The cookie banner now clears out at the footer so it stops covering
> Subscribe and Contact.

> Already fixed on 9/18, after this capture. #pricing lands with the whole
> section visible — headline, all three plans, the FAQ link.

> Not a bug. The font size is pinned; what you're seeing is macOS subpixel
> antialiasing, which makes the strokes look heavier on that display.

**Bad** — every line below violates a rule

> I looked into this and I think I found the root cause. It turns out the
> share image was pointing at the downloadable PDF, which I discovered by
> reading the thread more carefully — sorry, my earlier comment was wrong.
> I've now pulled the designer's asset from Figma and wired it up. Let me
> know if you'd like me to check anything else!

## Before posting

1. Search the draft for `I `, `I'm`, `my`, `we`, `us`, `let me`, and the
   user's name. Each hit is a rewrite, not a tweak.
2. Count sentences. Over four, cut.
3. Read the first line alone — does it say the state of the bug? If it sets
   up a story instead, delete it and start at the second line.
4. Show the user the exact text and who it goes to, and get a yes. Nothing
   is posted to Asana before that.

## Handing back

"Hand it back" means comment, then reassign to the **reporter**: whoever
filed the task (`Filed by` in `bb asana task`), not the current assignee.
`bb asana handoff <gid> --comment "..."` does both in that order. If the
work went out as a pull request, push the branch and open the PR first, and
put its link at the end of the comment. If the fix needs a new app build to
reach the reporter, say so in the comment.
