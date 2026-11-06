// Picking a person: the people on the task first (who filed it, followers,
// the current assignee), then "Someone else…" to search the workspace.
import { useEffect, useId, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, TaskDetail } from "../server";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS, QUIET_CONTROL_CLASS } from "./shared";

export type Person = { gid: string; name: string; hint?: string };

/** The people on a task, who filed it first, without duplicates. */
export function peopleOn(detail: TaskDetail): Person[] {
  const people: Person[] = [];
  const add = (person: Person) => {
    if (!people.some((existing) => existing.gid === person.gid)) people.push(person);
  };
  if (detail.createdBy !== null) add({ ...detail.createdBy, hint: "filed it" });
  if (detail.assigneeGid !== null && detail.assignee !== null) {
    add({ gid: detail.assigneeGid, name: detail.assignee, hint: "assignee" });
  }
  for (const follower of detail.followers) add(follower);
  return people;
}

const SOMEONE_ELSE = "__someone-else__";

/**
 * A select of known people plus "Someone else…", which reveals a search.
 * `value` is a user GID, or null for nobody.
 */
export function PersonPicker({
  id,
  value,
  people,
  onChange,
  disabled = false,
  className,
  noneLabel = "Unassigned",
  quiet = false,
}: {
  id: string;
  value: string | null;
  people: Person[];
  onChange: (person: Person | null) => void;
  disabled?: boolean;
  className?: string;
  noneLabel?: string;
  /** Read as a plain value until hovered or focused (the Details block). */
  quiet?: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const searchId = useId();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ gid: string; name: string; email: string | null }[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const options = picked !== null && !people.some((person) => person.gid === picked.gid) ? [...people, picked] : people;

  useEffect(() => {
    if (!searching || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      rpc.call("users_search", { query: query.trim() }).then(
        (found) => {
          if (current) setResults(found.users);
        },
        () => {
          if (current) setResults([]);
        },
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [rpc, query, searching]);

  return (
    <div className={cn("min-w-0", className)}>
      <select
        id={id}
        value={searching ? SOMEONE_ELSE : (value ?? "")}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === SOMEONE_ELSE) {
            setSearching(true);
            return;
          }
          setSearching(false);
          onChange(next === "" ? null : (options.find((person) => person.gid === next) ?? null));
        }}
        className={quiet ? QUIET_CONTROL_CLASS : CONTROL_CLASS}
      >
        <option value="">{noneLabel}</option>
        {options.map((person) => (
          <option key={person.gid} value={person.gid}>
            {person.hint === undefined ? person.name : `${person.name} (${person.hint})`}
          </option>
        ))}
        <option value={SOMEONE_ELSE}>Someone else…</option>
      </select>
      {searching ? (
        <div className="mt-2">
          <label htmlFor={searchId} className="sr-only">
            Search people
          </label>
          <input
            id={searchId}
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setSearching(false);
              }
            }}
            placeholder="Name or email"
            className={CONTROL_CLASS}
          />
          {results.length === 0 ? null : (
            <ul aria-label="People" className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1">
              {results.map((user) => (
                <li key={user.gid}>
                  <button
                    type="button"
                    onClick={() => {
                      const person = { gid: user.gid, name: user.name };
                      setPicked(person);
                      setSearching(false);
                      setQuery("");
                      onChange(person);
                    }}
                    className="flex w-full flex-col items-start rounded-sm px-2 py-1 text-left text-sm hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none"
                  >
                    <span className="text-foreground">{user.name}</span>
                    {user.email ? <span className="text-xs text-muted-foreground">{user.email}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
