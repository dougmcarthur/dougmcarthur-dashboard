#!/usr/bin/env -S npx tsx
/**
 * The research agents' tools, as a command line, for Claude Code routines.
 *
 *   npx --yes tsx scripts/agents/cli.ts <agent> help
 *   npx --yes tsx scripts/agents/cli.ts <agent> <tool> ['<json>'] [--apply]
 *   npx --yes tsx scripts/agents/cli.ts <agent> <tool> --stdin [--apply] <<'EOF'
 *   { ...json... }
 *   EOF
 *
 * `run.ts` is the other way to run these agents: a script that calls the Claude
 * API and pays per token from API credit. A routine is a scheduled Claude Code
 * cloud session instead, which runs on the artist's Claude plan — see
 * docs/agent-routines.md. The session does the thinking and the web work
 * itself; this file is how it touches Scout.
 *
 * Same tool names as run.ts, from the same definitions (tools.ts), so the
 * prompts in `prompts/` mean the same thing under both runners. Plus one tool
 * run.ts does not offer, `log_run`, because there the script posts the
 * heartbeat itself and here nothing else can.
 *
 * What it deliberately is not: a general way to call the API. A session reads
 * festival pages written by strangers, and the named operations here are the
 * whole of what it should ask for. The Worker enforces the same list for issued
 * tokens (shared/agentRoutes.ts), because a session with a shell could skip this
 * file entirely.
 *
 * The token. In a routine the session never holds it: the cloud environment
 * stores it as an API credential and Anthropic's proxy adds the header after the
 * request leaves the VM. Run by hand, set SCOUT_API_TOKEN.
 *
 * Writes need `--apply`, as everywhere in scripts/: without it a create prints
 * what it would have filed and sends nothing. `--stdin` exists because a pitch
 * or a rationale with an apostrophe in it cannot survive single-quoted JSON on
 * a command line, and a quoted heredoc passes it through untouched.
 *
 * Output is JSON on stdout. A refused or failed request exits non-zero with the
 * Worker's answer on stderr — the session has to see a failure as a failure,
 * and say so in `log_run`.
 */

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
  TOOL_SPECS,
  TOOLS_BY_AGENT,
  inputProblem,
  isAgentId,
  pitchLengthNote,
  type AgentId,
  type ToolName,
} from './tools'

const LOG_RUN = 'log_run'

/**
 * The statuses a routine reports. `refused` is run.ts's alone — it reads a
 * stop reason the API returns, which a Claude Code session never sees.
 */
const RUN_STATUSES = ['ok', 'incomplete', 'failed']

function fail(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function help(agent: AgentId): void {
  const tools: Array<{ tool: string; description: string; fields: string[] }> = TOOLS_BY_AGENT[agent].map((name) => {
    const spec = TOOL_SPECS[name]
    const schema = spec.inputSchema
    const required: readonly string[] = 'required' in schema ? schema.required : []
    const fields = Object.entries(schema.properties).map(
      ([field, def]) => `${field}${required.includes(field) ? '' : '?'}: ${def.type}`,
    )
    return { tool: name, description: spec.description, fields }
  })
  tools.push({
    tool: LOG_RUN,
    description:
      'Record that this run happened. Call it once, last, whatever happened — it is how the app ' +
      'knows the schedule is alive.',
    fields: [`status: ${RUN_STATUSES.join(' | ')}`, 'summary: string', 'itemsAdded: number'],
  })
  print({ agent, tools })
}

async function call(tool: ToolName, cfg: ApiConfig, body: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'read_reference_docs':
      return listReferenceDocs(cfg)
    case 'list_existing_gigs':
      return listGigs(cfg)
    case 'list_existing_sync_targets':
      return listSyncTargets(cfg)
    case 'create_gig_opportunity':
      return createGig(cfg, { ...body, status: 'discovered' })
    case 'create_sync_target': {
      const result = await createSyncTarget(cfg, body)
      return { ...result, ...pitchLengthNote(body.pitchDraft as string | undefined) }
    }
    case 'create_promo_draft':
      return createPromoDraft(cfg, body)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const fromStdin = args.includes('--stdin')
  const [agentArg, toolArg, json] = args.filter((arg) => arg !== '--apply' && arg !== '--stdin')

  if (!agentArg || !isAgentId(agentArg) || !toolArg) {
    fail(`Usage: cli.ts <${AGENTS.join('|')}> <tool|help> ['<json>' | --stdin] [--apply]`, 2)
  }
  const agent: AgentId = agentArg
  if (toolArg === 'help') return help(agent)

  const cfg: ApiConfig = {
    baseUrl: resolveBaseUrl(process.env.SCOUT_API_URL),
    token: process.env.SCOUT_API_TOKEN ?? '',
    apply,
  }

  const raw = fromStdin ? await readStdin() : json
  let input: unknown = {}
  if (raw !== undefined && raw.trim() !== '') {
    try {
      input = JSON.parse(raw)
    } catch {
      fail(`The input is not valid JSON. It began: ${raw.trim().slice(0, 80)}`)
    }
  }

  if (toolArg === LOG_RUN) {
    const run = input as Record<string, unknown>
    if (typeof run.status !== 'string' || !RUN_STATUSES.includes(run.status)) {
      fail(`log_run needs a status of ${RUN_STATUSES.join(', ')}.`)
    }
    if (typeof run.summary !== 'string' || !run.summary.trim()) fail('log_run needs a summary.')
    const itemsAdded = run.itemsAdded ?? 0
    if (typeof itemsAdded !== 'number' || !Number.isInteger(itemsAdded) || itemsAdded < 0) {
      fail('log_run needs itemsAdded as a whole number.')
    }
    await logRun(cfg, { taskId: agent, status: run.status, summary: run.summary, itemsAdded })
    return print({ logged: apply })
  }

  const offered = TOOLS_BY_AGENT[agent]
  if (!(offered as readonly string[]).includes(toolArg)) {
    fail(`${agent} has no tool called ${toolArg}. It has: ${[...offered, LOG_RUN].join(', ')}.`)
  }
  const tool = toolArg as ToolName
  const problem = inputProblem(TOOL_SPECS[tool], input)
  if (problem) fail(problem)

  print(await call(tool, cfg, input as Record<string, unknown>))
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
