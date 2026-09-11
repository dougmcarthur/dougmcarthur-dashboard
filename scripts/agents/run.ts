#!/usr/bin/env -S npx tsx
/**
 * The research agents, run through the Claude API — the paid fallback.
 *
 *   npx tsx scripts/agents/run.ts gig-festival-scan            # dry run
 *   npx tsx scripts/agents/run.ts gig-festival-scan --apply    # writes
 *
 * These three ran as scheduled Claude sessions on one machine until August,
 * when all three stopped and nothing noticed for a month. They moved here, to
 * GitHub's schedule, and then moved again: their schedules are Claude Code
 * routines now (docs/agent-routines.md), which run on the artist's Claude plan.
 * This script pays per token from API credit, and its first two runs cost more
 * than a month of the plan. It stays as a way to run a sweep by hand when a
 * routine is down, from `.github/workflows/agents.yml`.
 *
 * The tools come from tools.ts, shared with the routines' cli.ts, so both
 * runners mean the same thing by the names the prompts use.
 *
 * Dry run is the default, matching scripts/backfill-deadlines.ts: nothing is
 * written without `--apply`.
 *
 * Required environment:
 *   ANTHROPIC_API_KEY   the model
 *   SCOUT_API_TOKEN     the bearer the Worker's middleware checks
 *   SCOUT_API_URL       optional; empty or unset means production
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
// JSON Schema rather than the Zod helper: that helper is built against Zod 4
// and this repo is on Zod 3, which every route validator uses. Upgrading Zod
// to get nicer tool definitions would put the Worker's entire request
// validation in the blast radius of a script.
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import {
  createGig,
  createPromoDraft,
  createSyncTarget,
  listGigs,
  listReferenceDocs,
  listSyncTargets,
  logRun,
  resolveBaseUrl,
  type ApiConfig,
} from './api'
import {
  AGENTS,
  AGENTS_WITH_WEB_SEARCH,
  TOOL_SPECS,
  TOOLS_BY_AGENT,
  isAgentId,
  pitchLengthNote,
  type AgentId,
  type ToolName,
} from './tools'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * A ceiling on the loop, because an agent that keeps searching is an agent
 * that keeps spending. Generous enough for a real sweep — the August runs
 * touched a dozen or more sources — and finite.
 */
const MAX_ITERATIONS = 60

/** Server-side, so nothing here has to crawl or host a browser. */
const WEB_SEARCH = { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 40 }

/** The tools each agent may use, from tools.ts, wired to the API. */
function toolsFor(agent: AgentId, cfg: ApiConfig, counter: { added: number }) {
  const handlers: Record<ToolName, (input: Record<string, unknown>) => Promise<string>> = {
    read_reference_docs: async () => JSON.stringify(await listReferenceDocs(cfg)),
    list_existing_gigs: async () => JSON.stringify(await listGigs(cfg)),
    list_existing_sync_targets: async () => JSON.stringify(await listSyncTargets(cfg)),
    create_gig_opportunity: async (input) => {
      const result = await createGig(cfg, { ...input, status: 'discovered' })
      if (result.created) counter.added++
      return JSON.stringify(result)
    },
    create_sync_target: async (input) => {
      const result = await createSyncTarget(cfg, { ...input })
      if (result.created) counter.added++
      // The length goes back to the agent rather than only into a prompt it
      // read once at the start. A note it can act on for the *next* target in
      // the same run beats a rule it has already drifted from — and the
      // number is concrete where "keep it short" is not.
      return JSON.stringify({ ...result, ...pitchLengthNote(input.pitchDraft as string | undefined) })
    },
    create_promo_draft: async (input) => {
      const result = await createPromoDraft(cfg, { ...input })
      if (result.created) counter.added++
      return JSON.stringify(result)
    },
  }

  const tools = TOOLS_BY_AGENT[agent].map((name) => {
    const spec = TOOL_SPECS[name]
    return betaTool({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      run: (input) => handlers[name](input as Record<string, unknown>),
    })
  })
  return AGENTS_WITH_WEB_SEARCH.includes(agent) ? [WEB_SEARCH, ...tools] : tools
}

/**
 * The readable head of an error, for the notification body.
 *
 * Server errors arrive with a JSON payload glued to the end — `401 {"type":
 * "error","error":{...}}` — and none of that belongs in a bell somebody
 * checks over coffee. The full text is already in the run log.
 */
function firstSentence(detail: string): string {
  const cut = detail.split(/[{[\n]/)[0].trim().replace(/[:\-–—,]\s*$/, '')
  const text = cut.length > 8 ? cut : detail.slice(0, 120).trim()
  return /[.!?]$/.test(text) ? text : `${text}.`
}

async function main(): Promise<void> {
  const [agentArg, ...flags] = process.argv.slice(2)
  if (!agentArg || !isAgentId(agentArg)) {
    console.error(`Usage: run.ts <${AGENTS.join('|')}> [--apply]`)
    process.exit(2)
  }
  const agent: AgentId = agentArg
  const apply = flags.includes('--apply')

  const token = process.env.SCOUT_API_TOKEN
  if (!token) throw new Error('SCOUT_API_TOKEN is not set')
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')

  const cfg: ApiConfig = { baseUrl: resolveBaseUrl(process.env.SCOUT_API_URL), token, apply }

  const prompt = readFileSync(join(HERE, 'prompts', `${agent}.md`), 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const counter = { added: 0 }

  console.log(`${agent} — ${apply ? 'APPLY' : 'dry run'} — ${cfg.baseUrl} — ${today}`)

  const client = new Anthropic()
  let status = 'ok'
  let summary = ''

  try {
    // Streamed, so no single request has to finish inside the SDK's HTTP
    // timeout. A turn that runs many server-side searches can take longer
    // than that, and the first scheduled-style run from CI died on
    // `Request timed out.` fifteen minutes in, having filed nothing.
    const runner = client.beta.messages.toolRunner({
      model: 'claude-opus-5',
      max_tokens: 16000,
      // Server-side fallback, so a policy decline on one turn re-runs on
      // another model inside the same call rather than ending the sweep.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      max_iterations: MAX_ITERATIONS,
      tools: toolsFor(agent, cfg, counter),
      messages: [{ role: 'user', content: `${prompt}\n\nToday is ${today}.` }],
      stream: true,
    })

    // The runner does NOT auto-resume `pause_turn`, and web search is exactly
    // what triggers one. Left alone, a long sweep stops mid-way and returns as
    // if it had finished — no error, no warning, a silently truncated answer.
    // Pushing the paused turn back is the documented fix. Each iteration is a
    // stream, so the message has to be resolved before its stop reason exists.
    for await (const stream of runner) {
      const message = await stream.finalMessage()
      if (message.stop_reason === 'pause_turn') {
        runner.pushMessages({ role: 'assistant', content: message.content })
      }
    }

    const final = await runner.done()
    summary = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    // A run that ends paused has not finished, whatever it returned. Recording
    // it as ok would be the truncation bug wearing a green tick.
    if (final.stop_reason === 'pause_turn') {
      status = 'incomplete'
      summary = `Stopped at the ${MAX_ITERATIONS}-iteration ceiling before finishing.\n\n${summary}`
    }
    if (final.stop_reason === 'refusal') {
      status = 'refused'
      summary = `The model declined this run.\n\n${summary}`
    }
  } catch (err) {
    status = 'failed'
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    // The full text goes to the run log, where a person debugging wants it.
    // What reaches the notification body is a sentence — an exception with a
    // JSON blob inside it is developer-speak in the bell, and the bell is
    // read by somebody who wants to know whether to worry, not what threw.
    console.error(detail)
    summary = `This run could not finish. ${firstSentence(detail)}`
  } finally {
    // Always, including after a throw. The heartbeat is what
    // `shared/taskCadence.ts` measures, so a run that fails silently is the
    // one thing this must never produce.
    await logRun(cfg, { taskId: agent, status, summary: summary || '(no output)', itemsAdded: counter.added })
    console.log(`${agent} — ${status} — ${counter.added} added`)
  }

  if (status === 'failed') process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
