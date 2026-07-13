#!/usr/bin/env node
// One-time backfill: parse existing fit_notes / notes blobs into the new
// structured columns using simple heuristics. Run this ONCE against the
// remote D1 database after applying migration 0001.
//
// Usage:
//   node scripts/backfill-structured-columns.js --remote
//   node scripts/backfill-structured-columns.js --local   (dry-run against local D1)
//
// This script uses the wrangler CLI to query/update D1, so you need to be
// logged in (`wrangler whoami`) and have the right account permissions.

import { execSync } from 'node:child_process'

const isRemote = process.argv.includes('--remote')
const flag = isRemote ? '--remote' : '--local'
const db = 'dougmcarthur-music-hq'

function query(sql) {
  const result = execSync(
    `wrangler d1 execute ${db} ${flag} --json --command "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  )
  return JSON.parse(result)
}

function exec(sql) {
  execSync(
    `wrangler d1 execute ${db} ${flag} --command "${sql.replace(/"/g, '\\"')}"`,
    { stdio: 'inherit' },
  )
}

// --- Heuristics for gig_opportunities.fit_notes ---
// Looks for patterns like "fee: $500", "audience: 2000", "submit via email"
function parseGigNotes(notes) {
  if (!notes) return {}
  const result = {}

  const feeMatch = notes.match(/\$\s*([\d,]+)/)
  if (feeMatch) {
    result.fee_amount = parseFloat(feeMatch[1].replace(/,/g, ''))
    result.fee_currency = 'USD'
  }

  const audienceMatch = notes.match(/audience[:\s]+~?([\d,]+)/i)
  if (audienceMatch) result.audience_size = parseInt(audienceMatch[1].replace(/,/g, ''), 10)

  const submitMatch = notes.match(/submit\s+via\s+(email|portal|form)/i)
  if (submitMatch) result.submission_method = submitMatch[1].toLowerCase()

  const fitScoreMatch = notes.match(/fit[:\s]+(\d)\/5/i)
  if (fitScoreMatch) result.genre_fit_score = parseInt(fitScoreMatch[1], 10)

  return result
}

// --- Heuristics for sync_targets.notes ---
function parseSyncNotes(notes) {
  if (!notes) return {}
  const result = {}

  const agencyTypes = ['label', 'publisher', 'library', 'supervisor', 'agency', 'placement']
  for (const t of agencyTypes) {
    if (notes.toLowerCase().includes(t)) {
      result.agency_type = t
      break
    }
  }

  const roleMatch = notes.match(/(?:contact is|role:)\s+([\w\s]+?)(?:\.|,|;|$)/i)
  if (roleMatch) result.contact_role = roleMatch[1].trim()

  const confirmMatch = notes.match(/confirm\s+via\s+(email|phone|portal)/i)
  if (confirmMatch) result.confirmation_method = confirmMatch[1].toLowerCase()

  return result
}

async function run() {
  console.log(`Running backfill against ${isRemote ? 'REMOTE' : 'LOCAL'} D1...\n`)

  // --- Gig opportunities ---
  const gigResult = query('SELECT id, fit_notes FROM gig_opportunities WHERE fit_notes IS NOT NULL')
  const gigs = gigResult[0]?.results ?? []
  console.log(`Found ${gigs.length} gigs with fit_notes to parse`)

  for (const gig of gigs) {
    const parsed = parseGigNotes(gig.fit_notes)
    if (Object.keys(parsed).length === 0) continue

    const sets = Object.entries(parsed)
      .map(([k, v]) => `${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
      .join(', ')

    // Only set fit_rationale if not already set
    exec(`UPDATE gig_opportunities SET ${sets}, fit_rationale = COALESCE(fit_rationale, fit_notes) WHERE id = ${gig.id} AND (${Object.keys(parsed).map((k) => `${k} IS NULL`).join(' OR ')})`)
    console.log(`  gig ${gig.id}: extracted ${Object.keys(parsed).join(', ')}`)
  }

  // Set fit_rationale = fit_notes for any remaining rows where fit_rationale is null
  exec(`UPDATE gig_opportunities SET fit_rationale = fit_notes WHERE fit_notes IS NOT NULL AND fit_rationale IS NULL`)
  console.log('  Set fit_rationale = fit_notes for remaining rows\n')

  // --- Sync targets ---
  const syncResult = query('SELECT id, notes FROM sync_targets WHERE notes IS NOT NULL')
  const syncs = syncResult[0]?.results ?? []
  console.log(`Found ${syncs.length} sync targets with notes to parse`)

  for (const s of syncs) {
    const parsed = parseSyncNotes(s.notes)
    if (Object.keys(parsed).length === 0) continue

    const sets = Object.entries(parsed)
      .map(([k, v]) => `${k} = '${v}'`)
      .join(', ')

    exec(`UPDATE sync_targets SET ${sets} WHERE id = ${s.id} AND (${Object.keys(parsed).map((k) => `${k} IS NULL`).join(' OR ')})`)
    console.log(`  sync ${s.id}: extracted ${Object.keys(parsed).join(', ')}`)
  }

  console.log('\nBackfill complete.')
}

run().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
