/**
 * The artist's EPK folder in their own Google Drive.
 *
 * Organisers and juries ask for "a folder, anyone with the link can view".
 * This builds one the artist owns: Scout makes the folder when Drive is
 * connected, the artist adds files through Google's picker (uploading from
 * the device straight into it, or picking files they already have, which
 * Scout copies in), Scout proposes tidy names and subfolders, and the artist
 * shares it with one switch and copies links out.
 *
 * The grant is `drive.file` — see `DRIVE_FILE_SCOPE` for what that does and
 * does not reach. Four rules the routes keep:
 *
 * - **Organising previews first.** `GET /organise` plans, `POST /organise`
 *   re-plans server-side and applies, the Gmail drafts shape: a stale screen
 *   cannot rename a file the artist moved in the meantime.
 * - **Picked files are copied, never moved.** The artist's own folders are
 *   not Scout's to rearrange.
 * - **Sharing is one permission on the folder**, which every file inherits,
 *   so turning it off turns off every link at once. The screen says plainly
 *   that anyone holding the link can view and download.
 * - **Nothing is deleted.** Taking a file out of the folder is done in Drive.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { scoped, withTenant, type TenantId } from '../db/scope'
import type { Env } from '../types'
import { accessTokenForGrant, forgetGrant, readGrant } from '../lib/googleGrant'
import { beginConsent, consentAvailable } from '../lib/googleOAuth'
import { readPickerConfig } from '../lib/pickerSettings'
import {
  DriveError,
  asDriveFiles,
  copyInto,
  ensureSubfolders,
  isReadableTextFile,
  isSharedWithLink,
  listFolderTree,
  readFileText,
  renameAndMove,
  shareWithLink,
  unshareLink,
} from '../lib/googleDrive'
import { getDb } from '../db'
import { artistAssets, tenants } from '../db/schema'
import { eq } from 'drizzle-orm'
import { normaliseAssetKind, type ArtistAsset } from '../../shared/artistAssets'
import {
  downloadUrl,
  folderUrl,
  planOrganise,
  proposalsFromDrive,
  subfolderFor,
  type DriveLibraryFile,
} from '../../shared/driveOrganise'

const drive = new Hono<AppEnv>()

async function artistName(env: Env, tenant: TenantId): Promise<string> {
  const row = await getDb(env.DB).select().from(tenants).where(eq(tenants.id, tenant)).get()
  return row?.displayName?.trim() || 'Artist'
}

/** The grant and its folder, or a refusal the screen can show. */
async function connected(env: Env, tenant: TenantId) {
  const grant = await readGrant(env, tenant, 'drive')
  if (!grant.connected || !grant.driveFolderId) return null
  return { grant, folderId: grant.driveFolderId, token: await accessTokenForGrant(env, tenant, 'drive') }
}

function failure(err: unknown) {
  if (err instanceof DriveError) return { error: `Google Drive said: ${err.message}`, status: err.status }
  return { error: err instanceof Error ? err.message : 'Drive did not answer.', status: 502 }
}

drive.get('/status', async (c) => {
  const grant = await readGrant(c.env, tenantOf(c), 'drive')
  return c.json({
    ...grant,
    folderUrl: grant.driveFolderId ? folderUrl(grant.driveFolderId) : null,
    picker: await readPickerConfig(c.env),
  })
})

drive.get('/connect', async (c) => {
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  return beginConsent(c, 'drive')
})

/**
 * Forget the grant. The folder stays in the artist's Drive — it is theirs,
 * and a juror may be halfway through downloading it.
 */
drive.post('/disconnect', async (c) => {
  await forgetGrant(c.env, tenantOf(c), 'drive')
  return c.json({ ok: true })
})

/**
 * A short-lived access token for Google's picker, which runs in the page.
 *
 * It is the same `drive.file` grant, so the page can reach no more than the
 * Worker can; it expires within the hour and is never stored. The picker has
 * no other way to act as the artist.
 */
drive.get('/picker-token', async (c) => {
  const on = await connected(c.env, tenantOf(c))
  if (!on) return c.json({ error: 'Google Drive is not connected' }, 409)
  const picker = await readPickerConfig(c.env)
  if (!picker.available) {
    return c.json({ error: 'Adding files is not set up on this deployment yet' }, 503)
  }
  return c.json({ accessToken: on.token, folderId: on.folderId, ...picker })
})

/** Everything in the folder, where it sits, and the links to hand out. */
drive.get('/files', async (c) => {
  const on = await connected(c.env, tenantOf(c))
  if (!on) return c.json({ connected: false })
  try {
    const [{ files }, shared] = await Promise.all([
      listFolderTree(on.token, on.folderId),
      isSharedWithLink(on.token, on.folderId),
    ])
    return c.json({
      connected: true,
      folderUrl: folderUrl(on.folderId),
      shared,
      files: files
        .sort((a, b) => (a.folder ?? '').localeCompare(b.folder ?? '') || a.name.localeCompare(b.name))
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          folder: f.folder,
          belongsIn: subfolderFor(f),
          width: f.width,
          height: f.height,
          viewUrl: f.webViewLink,
          // Google Docs, Sheets and Slides have no binary to download; their
          // link opens them, and Drive offers export from there.
          downloadUrl: f.mimeType.startsWith('application/vnd.google-apps.') ? null : downloadUrl(f.id),
        })),
    })
  } catch (err) {
    const f = failure(err)
    return c.json({ error: f.error }, 502)
  }
})

const AdoptSchema = z.object({ fileIds: z.array(z.string().min(1).max(200)).min(1).max(100) })

/** Copy files the artist picked from elsewhere in their Drive into the folder's root. */
drive.post('/adopt', zValidator('json', AdoptSchema), async (c) => {
  const on = await connected(c.env, tenantOf(c))
  if (!on) return c.json({ error: 'Google Drive is not connected' }, 409)
  const copied: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  // One at a time: Drive rate-limits per user, and a burst that half-lands is
  // harder to explain than a slower run that stops where it stopped.
  for (const id of c.req.valid('json').fileIds) {
    try {
      copied.push(await copyInto(on.token, id, on.folderId))
    } catch (err) {
      failed.push({ id, error: failure(err).error })
    }
  }
  return c.json({ copied: copied.length, failed })
})

async function plan(env: Env, tenant: TenantId) {
  const on = await connected(env, tenant)
  if (!on) return null
  const { files, subfolders } = await listFolderTree(on.token, on.folderId)
  const changes = planOrganise(asDriveFiles(files), await artistName(env, tenant))
  return { on, changes, subfolders }
}

drive.get('/organise', async (c) => {
  try {
    const p = await plan(c.env, tenantOf(c))
    if (!p) return c.json({ error: 'Google Drive is not connected' }, 409)
    return c.json({ changes: p.changes })
  } catch (err) {
    return c.json({ error: failure(err).error }, 502)
  }
})

drive.post('/organise', async (c) => {
  try {
    const p = await plan(c.env, tenantOf(c))
    if (!p) return c.json({ error: 'Google Drive is not connected' }, 409)
    const ids = await ensureSubfolders(p.on.token, p.on.folderId)
    const done: string[] = []
    const failed: Array<{ name: string; error: string }> = []
    for (const change of p.changes) {
      const from = change.from.folder ? ids[change.from.folder] : p.on.folderId
      try {
        await renameAndMove(p.on.token, change.id, change.to.name, from, ids[change.to.folder])
        done.push(change.to.name)
      } catch (err) {
        failed.push({ name: change.from.name, error: failure(err).error })
      }
    }
    return c.json({ applied: done.length, failed })
  } catch (err) {
    return c.json({ error: failure(err).error }, 502)
  }
})

const ShareSchema = z.object({ shared: z.boolean() })

/**
 * Turn "anyone with the link can view" on or off for the whole folder. A
 * school or work Google account may refuse by admin policy; Google's own
 * sentence is passed back so the artist knows it is the policy, not Scout.
 */
drive.post('/share', zValidator('json', ShareSchema), async (c) => {
  const on = await connected(c.env, tenantOf(c))
  if (!on) return c.json({ error: 'Google Drive is not connected' }, 409)
  try {
    if (c.req.valid('json').shared) await shareWithLink(on.token, on.folderId)
    else await unshareLink(on.token, on.folderId)
    return c.json({ shared: await isSharedWithLink(on.token, on.folderId) })
  } catch (err) {
    const f = failure(err)
    return c.json({ error: f.error }, 502)
  }
})

function sameValue(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
}

async function proposeDriveImport(env: Env, tenant: TenantId) {
  const on = await connected(env, tenant)
  if (!on) return null
  const [{ files }, shared, artist] = await Promise.all([
    listFolderTree(on.token, on.folderId),
    isSharedWithLink(on.token, on.folderId),
    artistName(env, tenant),
  ])
  const textIds = new Set(files.filter(isReadableTextFile).slice(0, 10).map((f) => f.id))
  const filesWithText: DriveLibraryFile[] = await Promise.all(
    files.map(async (f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      folder: f.folder,
      createdTime: f.createdTime,
      webViewLink: f.webViewLink,
      width: f.width,
      height: f.height,
      text: textIds.has(f.id) ? await readFileText(on.token, f) : null,
    })),
  )
  const { proposals, skipped } = proposalsFromDrive(filesWithText, artist)
  const rows = (await getDb(env.DB)
    .select()
    .from(artistAssets)
    .where(scoped(artistAssets, tenant))) as ArtistAsset[]
  const sources = new Set(rows.map((r) => r.source).filter((s): s is string => !!s))
  const values = new Set(rows.map((r) => (r.value ? sameValue(r.value) : '')).filter(Boolean))
  const fresh = proposals.filter((p) => !sources.has(p.source) && !values.has(sameValue(p.value)))
  const needsOrganise = planOrganise(asDriveFiles(files), artist).length
  return {
    proposals: fresh,
    skipped,
    existing: proposals.length - fresh.length,
    wouldAdd: fresh.length,
    totalFiles: files.length,
    needsOrganise,
    shared,
    folderUrl: folderUrl(on.folderId),
  }
}

/**
 * Preview building the artist library from the files in the Drive folder.
 *
 * Reads photos, audio samples, videos, stage plots, press kits, and up to ten
 * Google Docs or text files (bios, links), proposes library entries without
 * writing anything, and reports whether the folder itself still has files to
 * tidy into subfolders or turn on link-sharing.
 */
drive.get('/import', async (c) => {
  try {
    const plan = await proposeDriveImport(c.env, tenantOf(c))
    if (!plan) return c.json({ error: 'Google Drive is not connected' }, 409)
    return c.json(plan)
  } catch (err) {
    return c.json({ error: failure(err).error }, 502)
  }
})

/**
 * Write the proposed Drive entries to `artist_assets`. Everything lands with
 * `review_by = null` (`unreviewed`) so nothing is claimed as verified before
 * the artist reads it over.
 */
drive.post('/import', async (c) => {
  try {
    const tenant = tenantOf(c)
    const plan = await proposeDriveImport(c.env, tenant)
    if (!plan) return c.json({ error: 'Google Drive is not connected' }, 409)
    const db = getDb(c.env.DB)
    const ts = new Date().toISOString()
    for (const p of plan.proposals) {
      await db.insert(artistAssets).values(
        withTenant(tenant, {
          kind: normaliseAssetKind(p.kind),
          label: p.label,
          value: p.value,
          questionKind: p.questionKind,
          variant: p.variant,
          charCount: p.value.length,
          credit: null,
          usageRights: null,
          reviewBy: null,
          source: p.source,
          notes: p.notes,
          sortOrder: 0,
          archived: 0,
          createdAt: ts,
          updatedAt: ts,
        }),
      )
    }
    return c.json({
      added: plan.proposals.length,
      existing: plan.existing,
      skipped: plan.skipped,
      needsOrganise: plan.needsOrganise,
      shared: plan.shared,
      folderUrl: plan.folderUrl,
    })
  } catch (err) {
    return c.json({ error: failure(err).error }, 502)
  }
})

export default drive

