import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_SPECS, termsNote } from '../scripts/agents/tools'

/**
 * Mistakes that typecheck, render and look fine: a surface that offers a pitch
 * without asking whether the company takes any.
 *
 * Behavioural tests prove the gate works where it is wired. These read the
 * source and fail when a new place that sends or copies a pitch skips it, which
 * is how the first one was missed in the first place: the agent filed a target,
 * and three screens would have let it out.
 */

const root = (rel: string) => join(process.cwd(), rel)
const read = (rel: string) => readFileSync(root(rel), 'utf8')

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(root(dir))) {
    const rel = `${dir}/${name}`
    if (statSync(root(rel)).isDirectory()) filesUnder(rel, ext, out)
    else if (ext.test(name)) out.push(rel)
  }
  return out
}

describe('every surface that offers a sync pitch asks the gate first', () => {
  const frontend = filesUnder('frontend/src', /\.tsx$/)

  it('names mayPitch wherever a pitch draft sits beside Copy, a mail link or a send', () => {
    const offenders = frontend.filter((file) => {
      const src = read(file)
      if (file.endsWith('SyncTerms.tsx')) return false
      return /pitchDraft/.test(src) && /(DraftActions|CopyButton|mailLinks)/.test(src) && !/mayPitch/.test(src)
    })
    expect(offenders).toEqual([])
  })

  it('does not offer "Mark Pitched" on a target the gate has refused', () => {
    expect(read('frontend/src/pages/SyncPage.tsx')).toMatch(/draft_ready' && mayPitch\(target\)/)
    expect(read('frontend/src/pages/review/DecisionBar.tsx')).toMatch(/status !== 'pitched' && mayPitch\(/)
  })

  it('offers the refused target Archive in its place', () => {
    expect(read('frontend/src/pages/SyncPage.tsx')).toMatch(/!mayPitch\(target\)/)
  })

  it('shows the terms on the Sync row and in its detail, and in the Review pane', () => {
    const sync = read('frontend/src/pages/SyncPage.tsx')
    expect(sync).toContain('<TermsChip')
    expect(sync).toContain('<TermsPanel')
    expect(read('frontend/src/pages/review/Detail.tsx')).toContain('<TermsPanel')
  })
})

describe('reading every unread site from the Sync page', () => {
  const sync = read('frontend/src/pages/SyncPage.tsx')
  const terms = read('frontend/src/components/SyncTerms.tsx')
  const component = terms.slice(terms.indexOf('export function CheckAllTerms'))

  it('is on the Sync page, ahead of the drafts panel that leaves unread targets out', () => {
    expect(sync).toContain('<CheckAllTerms />')
    expect(sync.indexOf('<CheckAllTerms />')).toBeLessThan(sync.indexOf('<GmailDraftsPanel />'))
  })

  it("picks its targets with the nightly pass's rule rather than a filter of its own", () => {
    expect(component).toContain('targetsToRead(')
    expect(component).not.toMatch(/policyCheckedAt|submissionPolicy|\.filter\(/)
  })

  it('asks for the whole list, so a status filter on the page cannot hide an unread target', () => {
    expect(component).toContain("queryKey: ['sync', '']")
    expect(component).toContain('api.sync.list()')
  })

  it("reads one site at a time through the row's own route, and gives up when every request fails", () => {
    expect(component).toContain('api.sync.checkTerms(target.id)')
    expect(component).not.toMatch(/Promise\.(all|allSettled)/)
    expect(component).toContain('GIVE_UP_AFTER')
  })

  it('can be stopped, and stops by itself when the page goes', () => {
    expect(component).toContain('stop.current = true')
    expect(component).toMatch(/return \(\) => \{\s*stop\.current = true/)
  })

  it('changes no status and sends nothing: it only reads', () => {
    expect(component).not.toMatch(/api\.sync\.patch|api\.gmail|status:/)
  })
})

describe('the Worker holds the line a screen cannot', () => {
  it('hands the terms to the bulk draft plan, so seven pitches cannot go out at once to a refusal', () => {
    const route = read('src/routes/gmailDrafts.ts')
    for (const column of ['submissionPolicy', 'policyCheckedAt', 'policyOverriddenAt']) {
      expect(route, column).toContain(`${column}: r.${column}`)
    }
  })

  it('reads sites only through the scanner, which refuses addresses that are not public websites', () => {
    const lib = read('src/lib/syncTerms.ts')
    expect(lib).toContain('isFetchable')
    // The one place the module asks for a page, and it checks first.
    expect(lib.match(/fetchImpl\(/g)?.length).toBe(1)
    expect(lib).toMatch(/isFetchable\(url\.href\)/)
  })

  it('keeps the policy columns out of the PATCH schema', () => {
    const route = read('src/routes/sync.ts')
    const patch = route.slice(route.indexOf('const SyncPatchSchema'), route.indexOf('/**', route.indexOf('const SyncPatchSchema')))
    for (const column of ['submissionPolicy', 'policyEvidence', 'policyUrl', 'policyCheckedAt', 'policyOverriddenAt']) {
      expect(patch, column).not.toContain(column)
    }
  })

  it('does not scan the artist\'s own pitch for a policy, only notes and pages', () => {
    const route = read('src/routes/sync.ts')
    expect(route).not.toMatch(/readSubmissionPolicy\([^)]*pitchDraft/)
  })
})

describe('what the research agent is told', () => {
  it('has to report the policy, and the tool says what each answer needs', () => {
    const spec = TOOL_SPECS.create_sync_target
    expect(spec.inputSchema.required).toContain('submissionPolicy')
    expect(Object.keys(spec.inputSchema.properties)).toEqual(
      expect.arrayContaining(['website', 'submissionPolicy', 'policyQuote', 'policyUrl']),
    )
    expect(spec.inputSchema.properties.policyQuote.description).toMatch(/Required when submissionPolicy is open/)
  })

  it('has a prompt that treats a listed email as a route and not permission, and tells it to look for old pages', () => {
    const prompt = read('scripts/agents/prompts/sync-pitch-research.md')
    expect(prompt).toMatch(/not permission|Permission is a\s+separate fact/)
    expect(prompt).toMatch(/unsolicited/)
    expect(prompt).toMatch(/old pages stay up/)
    expect(prompt).toMatch(/leave\s+`pitchDraft`\s+out/)
  })

  it('tells it when it drafted for a target that refuses, and when it filed one it never read', () => {
    expect(termsNote({ submissionPolicy: 'closed', pitchDraft: 'Hi' }).termsNote).toMatch(/takes no unsolicited material/)
    expect(termsNote({ submissionPolicy: 'unknown' }).termsNote).toMatch(/old pages outlive redesigns/)
    expect(termsNote({ submissionPolicy: 'open', pitchDraft: 'Hi' })).toEqual({})
    expect(termsNote({ submissionPolicy: 'closed' })).toEqual({})
  })
})

describe('how the terms read', () => {
  const sources = ['frontend/src/components/SyncTerms.tsx', 'shared/syncTerms.ts']

  it('has no em dash in anything a person reads', () => {
    for (const file of sources) {
      // Comments are written for a developer and may keep the habit; strings may not.
      const strings = read(file).match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
      const offenders = strings.filter((s) => s.includes('—') && !/^\/|import /.test(s))
      expect(offenders, file).toEqual([])
    }
  })

  it('has no eyebrow caption, and no accent bar down the edge of a card', () => {
    const src = read('frontend/src/components/SyncTerms.tsx')
    expect(src).not.toMatch(/uppercase|<Caption|border-l-/)
  })

  it('has no send button, only the withheld ones and the way past them', () => {
    const src = read('frontend/src/components/SyncTerms.tsx')
    expect(src).not.toMatch(/>\s*Send\b/)
  })
})
