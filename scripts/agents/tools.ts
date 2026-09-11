/**
 * The research agents' tools, as data.
 *
 * Two runners use them. `run.ts` hands them to the model through the SDK's tool
 * runner and pays per token from API credit; `cli.ts` exposes the same names as
 * subcommands for a Claude Code routine, which runs on the artist's Claude
 * plan. One definition, so the two cannot drift into offering different tools
 * under the same name — the prompts in `prompts/` name these, and both runners
 * have to mean the same thing by them.
 *
 * Different per agent rather than one shared set: the promo check-in has no
 * business creating gigs, and a tool that exists is a tool that eventually
 * gets called. The smallest surface that can do the job.
 */

export type AgentId = 'gig-festival-scan' | 'sync-pitch-research' | 'monthly-promo-checkin'

export const AGENTS: AgentId[] = ['gig-festival-scan', 'sync-pitch-research', 'monthly-promo-checkin']

export function isAgentId(value: string): value is AgentId {
  return (AGENTS as string[]).includes(value)
}

export type ToolName =
  | 'read_reference_docs'
  | 'list_existing_gigs'
  | 'list_existing_sync_targets'
  | 'create_gig_opportunity'
  | 'create_sync_target'
  | 'create_promo_draft'

interface FieldSchema {
  readonly type: 'string' | 'number' | 'boolean'
  readonly description?: string
}

export interface ToolSchema {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, FieldSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties: false
}

export interface ToolSpec {
  readonly name: ToolName
  readonly description: string
  readonly inputSchema: ToolSchema
}

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const

export const TOOL_SPECS = {
  read_reference_docs: {
    name: 'read_reference_docs',
    description:
      "Read the artist's own reference documents — bio, press kit, goals, style guide. " +
      'Call this first: it is what tells you who you are researching for.',
    inputSchema: NO_INPUT,
  },
  list_existing_gigs: {
    name: 'list_existing_gigs',
    description:
      'Every gig opportunity already on file, as id, name, url, status and deadline. ' +
      'Call this before adding anything so you do not create a duplicate.',
    inputSchema: NO_INPUT,
  },
  list_existing_sync_targets: {
    name: 'list_existing_sync_targets',
    description: 'Every sync-licensing target already on file. Check before adding.',
    inputSchema: NO_INPUT,
  },
  create_gig_opportunity: {
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
        deadlineNote: { type: 'string', description: 'The deadline exactly as the page words it' },
        opensAt: { type: 'string', description: 'ISO date a submission window opens' },
        location: { type: 'string' },
        country: { type: 'string', description: 'CA, US or other — the codes the rows on file use' },
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
  },
  create_sync_target: {
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
  },
  create_promo_draft: {
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
  },
} as const satisfies Record<ToolName, ToolSpec>

export const TOOLS_BY_AGENT: Record<AgentId, readonly ToolName[]> = {
  'gig-festival-scan': ['read_reference_docs', 'list_existing_gigs', 'create_gig_opportunity'],
  'sync-pitch-research': ['read_reference_docs', 'list_existing_sync_targets', 'create_sync_target'],
  'monthly-promo-checkin': [
    'read_reference_docs',
    'list_existing_gigs',
    'list_existing_sync_targets',
    'create_promo_draft',
  ],
}

/** The two that research the open web. The promo check-in drafts from what is on file. */
export const AGENTS_WITH_WEB_SEARCH: readonly AgentId[] = ['gig-festival-scan', 'sync-pitch-research']

/**
 * Why an input does not fit a tool, or null when it does.
 *
 * `run.ts` never needed this — the Messages API checks tool input against the
 * schema before `run` sees it. A command line gets whatever the session typed,
 * so the same schema is checked here, and the answer is a sentence the session
 * can act on rather than a 400 from the Worker.
 */
export function inputProblem(spec: ToolSpec, input: unknown): string | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return `${spec.name} takes one JSON object.`
  }
  const record = input as Record<string, unknown>
  const fields = spec.inputSchema.properties
  const known = Object.keys(fields)

  const unknownKeys = Object.keys(record).filter((key) => !known.includes(key))
  if (unknownKeys.length) {
    const list = unknownKeys.map((key) => `"${key}"`).join(', ')
    return `${spec.name} has no field ${list}. Its fields are: ${known.join(', ') || 'none'}.`
  }

  const missing = (spec.inputSchema.required ?? []).filter((key) => record[key] === undefined || record[key] === '')
  if (missing.length) return `${spec.name} needs ${missing.join(', ')}.`

  for (const [key, value] of Object.entries(record)) {
    const want = fields[key].type
    if (typeof value !== want) return `${key} should be a ${want}, not ${value === null ? 'null' : `a ${typeof value}`}.`
  }
  return null
}

/**
 * What to tell the agent about a pitch it just filed.
 *
 * Past roughly 190 words a pitch no longer fits in a `mailto:` link, so the
 * artist loses the one-click route into whatever mail client they use. That
 * is the lesser reason. The greater one is that a cold pitch competing with a
 * hundred others gets read when it is short — see shared/mailto.ts for where
 * the number comes from, and the prompt for why 150 rather than 190.
 */
export function pitchLengthNote(pitch: string | undefined): { note?: string } {
  if (!pitch) return {}
  const words = pitch.trim().split(/\s+/).length
  if (words <= 190) return {}
  return {
    note:
      `This pitch is ${words} words. Past about 190 it no longer fits a mailto: link, ` +
      `so the artist loses the one-click route into their mail client. Aim for 150 on the next one.`,
  }
}
