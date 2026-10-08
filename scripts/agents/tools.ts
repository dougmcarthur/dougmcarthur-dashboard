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

export type AgentId = 'gig-festival-scan' | 'sync-pitch-research' | 'monthly-promo-checkin' | 'document-reader'

export const AGENTS: AgentId[] = ['gig-festival-scan', 'sync-pitch-research', 'monthly-promo-checkin', 'document-reader']

/**
 * Agents only a Claude Code routine can run. The document reader opens a PDF
 * with the session's own file reader, which looks at the page; `run.ts` has
 * no way to hand the model a file, and a reader that cannot see would file
 * nothing and log `ok`.
 */
export const ROUTINE_ONLY: readonly AgentId[] = ['document-reader']

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
  | 'list_documents_to_read'
  | 'file_document_reading'

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
        type: {
          type: 'string',
          description:
            'Exactly one word: festival, showcase, conference, venue, residency, grant or other. ' +
            'Anything more descriptive — "intimate acoustic listening room" — belongs in fitRationale, ' +
            'because this is shown as a short label.',
        },
        url: {
          type: 'string',
          description: 'The page the Apply link is on or will appear on — the artist page, not the home page',
        },
        applicationUrl: {
          type: 'string',
          description:
            'The form itself, only one you have opened and seen ask for an application. Omit when ' +
            'the window has not opened',
        },
        organizer: { type: 'string' },
        deadline: { type: 'string', description: 'ISO date when one is stated; omit if the page gives prose' },
        deadlineNote: { type: 'string', description: 'The deadline exactly as the page words it' },
        opensAt: {
          type: 'string',
          description:
            'ISO date a submission window opens — only a stated day, since this is the date Scout goes ' +
            'back and reads the form. Omit when the page gives only a month',
        },
        location: {
          type: 'string',
          description:
            'Where it happens, as "Town, Province" or "Town, State" with the two-letter code — ' +
            '"Lac du Bonnet, MB", "Austin, TX". "Online" for a virtual event; "National" for a programme ' +
            'with no single place. Always fill it, even when the town is also in the name: Scout measures ' +
            'the trip from this field and cannot read it out of a title.',
        },
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
      'Record one new sync-licensing target, with a drafted pitch when they take pitches. The draft is ' +
      'text for the artist to review and send; nothing here sends email. A target whose own site says ' +
      'it takes no unsolicited material is still filed, with submissionPolicy closed and no pitchDraft, ' +
      'so it is on record and nobody pitches it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        agencyType: { type: 'string', description: 'publisher, library, supervisor, platform' },
        contactEmail: { type: 'string' },
        contactRole: { type: 'string' },
        website: {
          type: 'string',
          description:
            'Their own website, the home page address. Scout reads it for their submission rules, ' +
            'so give the real one even when you found them somewhere else',
        },
        submissionPolicy: {
          type: 'string',
          description:
            'Whether they take pitches from people they do not know, from their OWN pages: open, ' +
            'closed or unknown. closed is "no unsolicited material", referral or invitation only, ' +
            'agent or attorney only, or not accepting submissions. open needs policyQuote. unknown ' +
            'is an honest answer. A listed email address is how to reach them, not permission',
        },
        policyQuote: {
          type: 'string',
          description:
            'The sentence on their site that says so, copied exactly. Required when submissionPolicy is open; ' +
            'give it for closed too',
        },
        policyUrl: { type: 'string', description: 'The page the sentence is on' },
        notes: { type: 'string', description: 'What they place, terms, why this is a fit, and what is unconfirmed' },
        pitchDraft: {
          type: 'string',
          description: 'A drafted pitch for the artist to review. Leave it out when submissionPolicy is closed',
        },
      },
      required: ['name', 'notes', 'submissionPolicy'],
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
  list_documents_to_read: {
    name: 'list_documents_to_read',
    description:
      "Stage plots and tech riders in the artist's library that have not been read yet, as " +
      'assetId, label and the file address. An empty list means there is nothing to do.',
    inputSchema: NO_INPUT,
  },
  file_document_reading: {
    name: 'file_document_reading',
    description:
      'File what one document says, as plain text, against the library entry it came from. ' +
      'Scout offers it to the artist as suggestions for their stage plot; nothing is changed without them.',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'number', description: 'The assetId list_documents_to_read gave' },
        url: { type: 'string', description: 'The file address list_documents_to_read gave, unchanged' },
        text: {
          type: 'string',
          description:
            'Everything the document says and shows, as plain sentences: every written word, the input ' +
            'list line by line, and each thing drawn on the stage named in words. Up to 6,000 characters.',
        },
      },
      required: ['assetId', 'url', 'text'],
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
  'document-reader': ['list_documents_to_read', 'file_document_reading'],
}

/** The two that research the open web. The promo check-in drafts from what is on file. */
export const AGENTS_WITH_WEB_SEARCH: readonly AgentId[] = ['gig-festival-scan', 'sync-pitch-research']

/**
 * A tool's fields as `cli.ts help` prints them: `name?: type — description`.
 *
 * The description is the part that matters. `run.ts` hands the model the whole
 * schema, so it always saw them; the command line printed name and type only,
 * and every hint written into a field — which country codes the rows use, that
 * `deadline` stays empty when the page gives prose — never reached a routine.
 * The first scheduled scan after the country hint landed still wrote "Canada".
 */
export function fieldLines(spec: ToolSpec): string[] {
  const schema = spec.inputSchema
  const required: readonly string[] = schema.required ?? []
  return Object.entries(schema.properties).map(([field, def]) => {
    const head = `${field}${required.includes(field) ? '' : '?'}: ${def.type}`
    return def.description ? `${head} — ${def.description}` : head
  })
}

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
 * What to tell the agent about the rules it reported for a target.
 *
 * The same move `pitchLengthNote` makes: a correction it can act on for the
 * *next* target in the same run beats a rule it read once at the start. Two
 * cases are worth saying out loud. A pitch written for a target that says it
 * takes none is work nobody will use, and a target filed `unknown` has not had
 * its rules found, which the artist will be told on the screen.
 */
export function termsNote(input: Record<string, unknown>): { termsNote?: string } {
  const policy = input.submissionPolicy
  const pitch = typeof input.pitchDraft === 'string' && input.pitchDraft.trim() !== ''
  if (policy === 'closed' && pitch) {
    return {
      termsNote:
        'You drafted a pitch for a target that takes no unsolicited material. Scout will not offer it to ' +
        'the artist to send. File closed targets with no pitchDraft and move on to the next one.',
    }
  }
  if (policy === 'unknown') {
    return {
      termsNote:
        'Filed with unknown rules, so the artist will see "no policy found" on it. Before the next one, read its ' +
        'submissions, contact, about and FAQ pages, and search the site for "unsolicited": old pages outlive redesigns.',
    }
  }
  return {}
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
