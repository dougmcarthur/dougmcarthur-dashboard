import { describe, it, expect } from 'vitest'
import {
  READINGS_MAX,
  parseReadings,
  pendingDocuments,
  wantsReading,
  withReading,
  type DocumentReading,
} from '../shared/documentReadings'
import { readClues } from '../shared/stagePlotClues'
import { TOOLS_BY_AGENT, ROUTINE_ONLY } from '../scripts/agents/tools'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const plotPdf = {
  id: 7,
  kind: 'document',
  label: 'Stage Plot for Solo Performances - Doug McArthur',
  value: 'https://www.manitobamusic.com/file/download,download/4170',
  archived: 0,
}

const reading = (over: Partial<DocumentReading> = {}): DocumentReading => ({
  assetId: 7,
  label: plotPdf.label,
  url: plotPdf.value,
  text: 'Solo performer - vocals and acoustic guitar. Need a DI for acoustic and power for pedals.',
  readAt: '2026-10-05T12:00:00Z',
  ...over,
})

describe('which documents the reader is sent', () => {
  it('reads stage plots and riders, and nothing else in the library', () => {
    expect(wantsReading(plotPdf)).toBe(true)
    expect(wantsReading({ ...plotPdf, label: 'Technical Rider 2025' })).toBe(true)
    expect(wantsReading({ ...plotPdf, label: 'Electronic Press Kit PDF - 2024' })).toBe(false)
    expect(wantsReading({ ...plotPdf, kind: 'link' })).toBe(false)
    expect(wantsReading({ ...plotPdf, archived: 1 })).toBe(false)
    expect(wantsReading({ ...plotPdf, value: 'http://insecure.example/plot.pdf' })).toBe(false)
  })

  // A new file at the same entry is a new thing to read; the same file is not.
  it('waits until the file is read, and again when the file changes', () => {
    expect(pendingDocuments([plotPdf], [])).toHaveLength(1)
    expect(pendingDocuments([plotPdf], [reading()])).toHaveLength(0)
    expect(pendingDocuments([{ ...plotPdf, value: `${plotPdf.value}?v=2` }], [reading()])).toHaveLength(1)
  })

  it('keeps one reading per document, newest first, within the cap', () => {
    let all: DocumentReading[] = []
    for (let i = 0; i < READINGS_MAX + 5; i++) all = withReading(all, reading({ assetId: i }))
    all = withReading(all, reading({ assetId: 3, text: 'again' }))
    expect(all).toHaveLength(READINGS_MAX)
    expect(all[0]).toMatchObject({ assetId: 3, text: 'again' })
    expect(all.filter((r) => r.assetId === 3)).toHaveLength(1)
    expect(parseReadings(JSON.stringify(all))).toEqual(all)
    expect(parseReadings('{broken')).toEqual([])
  })
})

describe('a reading feeds the stage plot survey', () => {
  it('suggests the act and what it plays, quoting the document', () => {
    const clues = readClues([{ source: plotPdf.label, text: reading().text }])
    expect(clues.act?.act).toBe('solo')
    expect(clues.instruments.map((i) => i.instrument)).toContain('acoustic_guitar')
    expect(clues.instruments[0].source).toBe(plotPdf.label)
  })
})

describe('the document reader agent', () => {
  it('has a prompt, two tools, and runs only as a routine', () => {
    expect(existsSync(join(__dirname, '..', 'scripts', 'agents', 'prompts', 'document-reader.md'))).toBe(true)
    expect(TOOLS_BY_AGENT['document-reader']).toEqual(['list_documents_to_read', 'file_document_reading'])
    expect(ROUTINE_ONLY).toContain('document-reader')
  })
})
