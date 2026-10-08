import { describe, it, expect } from 'vitest'
import { parseFeed } from '../shared/feedParse'
import { parseListing } from '../shared/listingParse'
import { classifyCall } from '../shared/callClassifier'

/**
 * What a hostile or merely enormous page may cost.
 *
 * The poller reads markup written by strangers, on a Worker with a CPU budget,
 * from a source it tries first when it has waited longest. A regex that is
 * quadratic on the wrong input is not a slow page: it is a page that stops the
 * hourly job for as long as the page is there, because the attempt dies before
 * anything is recorded and the next tick tries the same source.
 *
 * This was found, not imagined. CIMA's real home page, cut at the 1.5 MB cap,
 * ends inside a `<script>` holding a megabyte of JSON on one line, and the
 * first version of `parseListing` never came back from it. Each input below is
 * a shape of that failure, at 3 MB, and has to come back in well under a second
 * and a half. The limit is deliberately generous for a slow runner; the
 * unfixed code took minutes or never finished.
 */

const MB3 = 3_000_000
const BUDGET_MS = 1500

function within<T>(label: string, f: () => T): T {
  const started = performance.now()
  const result = f()
  const took = performance.now() - started
  expect(took, `${label} took ${Math.round(took)} ms`).toBeLessThan(BUDGET_MS)
  return result
}

const repeat = (unit: string, bytes = MB3) => unit.repeat(Math.ceil(bytes / unit.length))

describe('a feed that is built to be slow', () => {
  const inChannel = (body: string) => `<rss><channel>${body}`

  it.each([
    ['items that never close', '<item>'],
    ['items with titles that never close', '<item><title>x'],
    ['titles that are all open brackets', '<item><title>' + '<'.repeat(MB3) + '</title></item>'],
    ['CDATA that never closes', '<item><title><![CDATA[' + repeat('<![CDATA[')],
    ['categories that never close', '<item><title>t</title>' + repeat('<category>')],
    ['entities that never end', '<item><title>' + repeat('&amp') + '</title></item>'],
  ])('%s', (label, hostile) => {
    const body = hostile.startsWith('<item>') && hostile.length < MB3 ? inChannel(repeat(hostile)) : inChannel(hostile)
    within(label, () => parseFeed(body))
  })

  it('an Atom feed whose entries never close', () => {
    within('atom', () => parseFeed('<feed><entry>' + repeat('<entry><link href="x"><title>x')))
  })

  it('a calendar whose events never end', () => {
    within('ical', () => parseFeed('BEGIN:VCALENDAR\r\n' + repeat('BEGIN:VEVENT\r\nSUMMARY:x\r\n')))
  })

  it('still reads the items that came before the damage', () => {
    const body = `<rss><channel><item><title>Apply now: A Real Call</title></item>${repeat('<item>')}`
    expect(within('prefix', () => parseFeed(body))!.map((i) => i.title)).toEqual(['Apply now: A Real Call'])
  })
})

describe('a page that is built to be slow', () => {
  it.each([
    ['navigation that never closes', '<nav>'],
    ['scripts that never close', '<script>'],
    ['svgs that never close', '<svg>'],
    ['comments that never close', '<!--'],
    ['headings that never finish', '<h2><a href="/x">a headline long enough '],
    ['anchors with no end', '<a href="'],
    ['anchors that wrap nothing', '<a href="/x">'],
    ['list rows that never close', '<li><a href="/x">a headline long enough to count</a> June 3, 2026 '],
    ['quotes that never end', '<h3><a href="/x" title="'],
    ['open brackets', '<'],
  ])('%s', (label, unit) => {
    within(label, () => parseListing(repeat(unit), 'https://x.example/'))
  })

  // The real shape: a page cut off inside a script, leaving a megabyte of JSON
  // on a single line with anchors and headings inside it as text.
  it('a script cut off mid-JSON, with markup inside its strings', () => {
    const json = repeat('{\\"html\\":\\"<a href=\\\\\\"/x\\\\\\"><h3>Title here</h3></a><li><a href=\\\\\\"/y\\\\\\">row</a>\\"},')
    within('cut script', () => parseListing(`<html><body><h1>Home</h1><script id="__next">${json}`, 'https://x.example/'))
  })

  it('still reads the entries that came before the damage', () => {
    const page = `<h2><a href="/real">A real call to apply to</a></h2><p>Deadline: October 6, 2026</p>${repeat('<nav>')}`
    const items = within('prefix', () => parseListing(page, 'https://x.example/'))
    expect(items.map((i) => i.title)).toEqual(['A real call to apply to'])
  })

  it('never returns more than it was built to hold', () => {
    const many = Array.from({ length: 2000 }, (_, i) => `<h2><a href="/c/${i}">Call number ${i} for artists</a></h2>`).join('')
    expect(parseListing(many, 'https://x.example/').length).toBeLessThanOrEqual(200)
  })
})

describe('a title that is a megabyte', () => {
  it('is classified without being read in full', () => {
    within('classify', () => classifyCall({ title: 'Apply now '.repeat(300_000) }))
  })
})
