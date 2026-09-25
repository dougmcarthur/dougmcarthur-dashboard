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
import type { TenantId } from '../db/scope'
import type { Env } from '../types'
import { accessTokenForGrant, forgetGrant, readGrant } from '../lib/googleGrant'
import { beginConsent, consentAvailable } from '../lib/googleOAuth'
import {
  DriveError,
  asDriveFiles,
  copyInto,
  ensureSubfolders,
  isSharedWithLink,
  listFolderTree,
  renameAndMove,
  shareWithLink,
  unshareLink,
} from '../lib/googleDrive'
import { getDb } from '../db'
import { tenants } from '../db/schema'
import { eq } from 'drizzle-orm'
import { downloadUrl, folderUrl, planOrganise, subfolderFor } from '../../shared/driveOrganise'

const drive = new Hono<AppEnv>()

function pickerConfig(env: Env) {
  const apiKey = env.GOOGLE_PICKER_API_KEY?.trim() || null
  const appId = env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim() || null
  return { available: Boolean(apiKey && appId), apiKey, appId }
}

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
    picker: pickerConfig(c.env),
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
  if (!pickerConfig(c.env).available) {
    return c.json({ error: 'This deployment has no GOOGLE_PICKER_API_KEY or GOOGLE_CLOUD_PROJECT_NUMBER' }, 503)
  }
  return c.json({ accessToken: on.token, folderId: on.folderId, ...pickerConfig(c.env) })
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

export default drive
