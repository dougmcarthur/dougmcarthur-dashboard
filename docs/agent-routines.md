# Research agents as Claude Code routines

The three research agents — `gig-festival-scan`, `sync-pitch-research` and
`monthly-promo-checkin` — run as scheduled **Claude Code routines**: cloud
sessions on Anthropic's infrastructure, billed to the artist's Claude plan.

## Why they moved again

They were scheduled Claude sessions on one laptop until August 2026, when all
three stopped and nothing noticed for a month. They moved to GitHub Actions,
where `scripts/agents/run.ts` drives them through the Claude API — and pays per
token from API credit. The first two runs spent $20 and filed nothing.

The expensive part is structural, not a bad week. Server-side web search puts
every result into the same request, and the model re-reads the whole growing
context before each next search; with dozens of searches in a sweep and no
prompt caching, that compounds. The second run also hit the SDK's HTTP timeout,
and a timed-out request is retried whole. A pet project with no paying users
does not carry that three times a week.

A routine does the same work on the plan the artist already pays for, with
Claude Code's own web tools, and needs no machine to stay awake. The GitHub
workflow stays as a hand-triggered fallback (`.github/workflows/agents.yml`).

## How a run works

- The routine's saved prompt names an agent and points at
  `scripts/agents/routine.md`. Everything else is in the repository, so a
  change to how an agent behaves is a diff, not an edit in a web form.
- `routine.md` tells the session to read `scripts/agents/prompts/<agent>.md` —
  the same prompts `run.ts` uses — and to reach Scout only through
  `scripts/agents/cli.ts`, which offers the same named tools from the same
  definitions (`scripts/agents/tools.ts`).
- The session finishes with `log_run`, which files the heartbeat
  `shared/taskCadence.ts` measures.

## Three layers, because a routine has a shell

In CI the model only ever held named tools and the script made every request.
A routine is a full Claude Code session: it can run shell commands, and it
reads festival pages written by strangers.

1. **The token never enters the session.** It is stored on the cloud
   environment as an *API credential*; Anthropic's proxy adds the
   `Authorization` header after a request leaves the VM. It is not in the
   environment variables, not in a file, and not something a page can talk the
   session into printing.
2. **The Worker limits what the token can do.** The proxy attaches the
   credential to *any* request for `scout.sundogsmusic.ca`, so hiding it does
   not stop `curl -X DELETE`. An issued token (`agent_tokens`) reaches seven
   routes and nothing else — see `shared/agentRoutes.ts`. The legacy
   `API_TOKEN` is not limited, and is never given to anything that reads
   untrusted pages.
3. **`cli.ts` is named operations, not a general client.** It is the easy path,
   so the session takes it; the Worker is what holds if it does not.

## What is weaker than in CI, said plainly

- **The heartbeat is the agent's job.** `run.ts` posts it in a `finally` that a
  crash cannot skip. A routine that crashes or forgets leaves no row for that
  run. A schedule that *stops* is still caught — `taskCadence` raises a
  critical once it has been quiet longer than its own habit — but a single
  missed run is invisible.
- **What a routine can read, an injected routine could send elsewhere.** The
  environment needs full network access to read festival pages, so the gig
  list and reference documents it reads could be passed to another host by a
  page that hijacked it. Nothing it can read is a credential. It cannot edit or
  delete anything.

## Setting it up

This needs `scripts/agents/cli.ts` on `main`, because a routine clones the
default branch, and migration 0022 applied, because that is where
`agent_tokens` lives.

1. **Issue a token** for the routines, separate from `API_TOKEN` so either can
   be revoked without touching the other:

   ```bash
   npx tsx scripts/issue-agent-token.ts "Research routines" --apply
   ```

   It prints the token once, on its own line. Put it in 1Password; nothing can
   show it again.

2. **Create a cloud environment** at [claude.ai/code](https://claude.ai/code)
   called *Scout agents*, with **Full** network access, no environment
   variables and no setup script. Save it, then open it again for editing —
   credentials can only be added to an environment that exists — and under
   **API credentials** add one:
   - **Name:** Scout
   - **Allowed websites:** `scout.sundogsmusic.ca`
   - **Custom headers:** `Authorization`, prefix `Bearer`, value the token

   Use this environment for nothing else: its credential rides along in every
   session that runs in it.

3. **Create three routines** at
   [claude.ai/code/routines](https://claude.ai/code/routines), each with this
   repository, the *Scout agents* environment, **no connectors**, and a saved
   prompt of the form:

   > Run the Sun Dogs Music Scout research agent `gig-festival-scan`. Follow
   > `scripts/agents/routine.md` exactly.

   | Agent | When |
   | --- | --- |
   | `gig-festival-scan` | Mondays, 7am Winnipeg |
   | `sync-pitch-research` | Wednesdays, 7am Winnipeg |
   | `monthly-promo-checkin` | The 1st, 7am Winnipeg |

   **Model: Sonnet 5**, to spend less of the plan's allowance. If a run shows
   it struggling to parse things — `cli.ts` refusing its input again and
   again, fields filed in the wrong place, a deadline or fee misread from a
   page, a report that contradicts what it filed — move that routine to
   Opus 5. The cost of a wrong row is a missed date, which is worth more than
   the allowance.

4. **Check one.** *Run now* on the routine, then read the run's transcript:
   a green status only means the session started and exited. A new row on
   History is the proof.

## Revoking

```bash
npx tsx scripts/issue-agent-token.ts --revoke <id> --apply
```

Then delete the credential from the environment. The id is printed when the
token is issued and listed by `--list`.
