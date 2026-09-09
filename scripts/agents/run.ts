#!/usr/bin/env -S npx tsx
/**
 * The research agents, off a laptop and into CI.
 *
 *   npx tsx scripts/agents/run.ts gig-festival-scan            # dry run
 *   npx tsx scripts/agents/run.ts gig-festival-scan --apply    # writes
 *
 * These three ran as scheduled Claude sessions on one machine until August,
 * when all three stopped and nothing noticed for a month. Two things changed
 * to stop that happening again: they run on GitHub's schedule rather than a
 * machine somebody has to leave open, and their instructions are files in this
 * repository rather than text in a UI, so their absence is visible in a diff.
 *
 * Dry run is the default, matching scripts/backfill-deadlines.ts: nothing is
 * written without `--apply`. The workflow passes it; a human testing does not.
 *
 * Required environment:
 *   ANTHROPIC_API_KEY   the model
 *   SCOUT_API_TOKEN     the bearer the Worker's middleware checks
 *   SCOUT_API_URL       defaults to the production host
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
  type ApiConfig,
} from './api'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * A ceiling on the loop, because an agent that keeps searching is an agent
 * that keeps spending. Generous enough for a real sweep — the August runs
 * touched a dozen or more sources — and finite.
 */
const MAX_ITERATIONS = 60

/** Server-side, so nothing here has to crawl or host a browser. */
const WEB_SEARCH = { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 40 }

type AgentId = 'gig-festival-scan' | 'sync-pitch-research' | 'monthly-promo-checkin'

const AGENTS: AgentId[] = ['gig-festival-scan', 'sync-pitch-research', 'monthly-promo-checkin']

function isAgentId(value: string): value is AgentId {
  return (AGENTS as string[]).includes(value)
}

/**
 * The tools each agent may use.
 *
 * Different per agent rather than one shared set: the promo check-in has no
 * business creating gigs, and a tool that exists is a tool that eventually
 * gets called. `shared/agent-design.md`'s rule — the smallest surface that can
 * do the job.
 */
function toolsFor(agent: AgentId, cfg: ApiConfig, counter: { added: number }) {
  const referenceDocs = betaTool({
    name: 'read_reference_docs',
    description:
      "Read the artist's own reference documents — bio, press kit, goals, style guide. " +
      'Call this first: it is what tells you who you are researching for.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await listReferenceDocs(cfg)),
  })

  const existingGigs = betaTool({
    name: 'list_existing_gigs',
    description:
      'Every gig opportunity already on file, as id, name, url, status and deadline. ' +
      'Call this before adding anything so you do not create a duplicate.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await listGigs(cfg)),
  })

  const existingSync = betaTool({
    name: 'list_existing_sync_targets',
    description: 'Every sync-licensing target already on file. Check before adding.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await listSyncTargets(cfg)),
  })

  const addGig = betaTool({
    name: 'create_gig_opportunity',
    description:
      'Record one new gig opportunity. Only for opportunities that are genuinely new, ' +
      'still open, and a plausible fit. Never submit an application — this only files a row.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The festival, venue or programme name' },
        type: { type: 'string', description: 'festival, showcase, conference, venue, residency, grant, other' },
        url: { type: 'string', description: 'The listing page' },
        applicationUrl: { type: 'string', description: 'The form itself, when it differs from the listing' },
        organizer: { type: 'string' },
        deadline: { type: 'string', description: 'ISO date when one is stated; omit if the page gives prose' },
        deadlineNote: { type: 'string', description: "The deadline exactly as the page words it" },
        opensAt: { type: 'string', description: 'ISO date a submission window opens' },
        location: { type: 'string' },
        country: { type: 'string' },
        paid: { type: 'boolean', description: 'True when entry costs money' },
        feeAmount: { type: 'number' },
        feeCurrency: { type: 'string' },
        fitRationale: {
          type: 'string',
          description:
            'Why this fits, what it requires, and anything unresolved. Prose. Say what you could ' +
            'not confirm rather than leaving it out.',
        },
      },
      required: ['name', 'type', 'fitRationale'],
      additionalProperties: false,
    },
    run: async (input) => {
      const result = await createGig(cfg, { ...input, status: 'discovered' })
      if (result.created) counter.added++
      return JSON.stringify(result)
    },
  })

  const addSync = betaTool({
    name: 'create_sync_target',
    description:
      'Record one new sync-licensing target with a drafted pitch. The draft is text for the ' +
      'artist to review and send; nothing here sends email.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        agencyType: { type: 'string', description: 'publisher, library, supervisor, platform' },
        contactEmail: { type: 'string' },
        contactRole: { type: 'string' },
        notes: { type: 'string', description: 'What they place, terms, why this is a fit, and what is unconfirmed' },
        pitchDraft: { type: 'string', description: 'A drafted pitch for the artist to review' },
      },
      required: ['name', 'notes'],
      additionalProperties: false,
    },
    run: async (input) => {
      const result = await createSyncTarget(cfg, { ...input })
      if (result.created) counter.added++
      return JSON.stringify(result)
    },
  })

  const addPromo = betaTool({
    name: 'create_promo_draft',
    description: 'File one promo draft for the artist to review, edit and post themselves.',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM the draft is for' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['month', 'title', 'content'],
      additionalProperties: false,
    },
    run: async (input) => {
      const result = await createPromoDraft(cfg, { ...input })
      if (result.created) counter.added++
      return JSON.stringify(result)
    },
  })

  switch (agent) {
    case 'gig-festival-scan':
      return [WEB_SEARCH, referenceDocs, existingGigs, addGig]
    case 'sync-pitch-research':
      return [WEB_SEARCH, referenceDocs, existingSync, addSync]
    case 'monthly-promo-checkin':
      return [referenceDocs, existingGigs, existingSync, addPromo]
  }
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

  const cfg: ApiConfig = {
    baseUrl: (process.env.SCOUT_API_URL ?? 'https://dashboard.dougmcarthur.net').replace(/\/$/, ''),
    token,
    apply,
  }

  const prompt = readFileSync(join(HERE, 'prompts', `${agent}.md`), 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const counter = { added: 0 }

  console.log(`${agent} — ${apply ? 'APPLY' : 'dry run'} — ${cfg.baseUrl} — ${today}`)

  const client = new Anthropic()
  let status = 'ok'
  let summary = ''

  try {
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
    })

    // The runner does NOT auto-resume `pause_turn`, and web search is exactly
    // what triggers one. Left alone, a long sweep stops mid-way and returns as
    // if it had finished — no error, no warning, a silently truncated answer.
    // Pushing the paused turn back is the documented fix.
    for await (const message of runner) {
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
    summary = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error(summary)
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
