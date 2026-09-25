/**
 * The Drive calls the folder tool makes, and nothing else.
 *
 * Under `drive.file` these can only ever touch the folder Scout created, the
 * files inside it, and files the artist picked for Scout in Google's picker.
 * That limit is Google's, not this file's — but this file keeps to the spirit
 * of it anyway: it never searches the artist's Drive, never lists a folder it
 * did not make, and never deletes. Removing a file from the EPK folder is the
 * artist's job, in Drive.
 */

import { SUBFOLDERS, isFolder, type DriveFile, type Subfolder } from '../../shared/driveOrganise'

const API = 'https://www.googleapis.com/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  size: number | null
  createdTime: string
  webViewLink: string | null
  webContentLink: string | null
  width: number | null
  height: number | null
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    // Google's own sentence, trimmed: a sharing refusal from a school or work
    // account's admin policy reads very differently from a bad token.
    const message = body.match(/"message":\s*"([^"]{1,300})"/)?.[1] ?? body.slice(0, 300)
    throw new DriveError(res.status, message)
  }
  return res.status === 204 ? (undefined as T) : res.json<T>()
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function createFolder(token: string, name: string, parentId?: string): Promise<string> {
  const body = { name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }
  return (await call<{ id: string }>(token, '/files?fields=id', { method: 'POST', body: JSON.stringify(body) })).id
}

const FIELDS =
  'files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height))'

/** One folder's direct children. Only ever called on folders Scout made. */
export async function listChildren(token: string, folderId: string): Promise<DriveItem[]> {
  const q = encodeURIComponent(`'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`)
  const out: DriveItem[] = []
  let pageToken = ''
  do {
    const page = await call<{ files: any[]; nextPageToken?: string }>(
      token,
      `/files?q=${q}&pageSize=200&fields=nextPageToken,${encodeURIComponent(FIELDS)}${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )
    for (const f of page.files) {
      const media = f.imageMediaMetadata ?? f.videoMediaMetadata ?? {}
      out.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size != null ? Number(f.size) : null,
        createdTime: f.createdTime,
        webViewLink: f.webViewLink ?? null,
        webContentLink: f.webContentLink ?? null,
        width: media.width ?? null,
        height: media.height ?? null,
      })
    }
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return out
}

/**
 * The subfolders, made if missing, by name under the root.
 *
 * Found by listing rather than stored, because the artist can rename or trash
 * one in Drive and a stored id would then point at nothing — and a missing one
 * is simply made again.
 */
export async function ensureSubfolders(token: string, rootId: string): Promise<Record<Subfolder, string>> {
  const existing = (await listChildren(token, rootId)).filter(isFolder)
  const ids = {} as Record<Subfolder, string>
  for (const name of SUBFOLDERS) {
    const found = existing.find((f) => f.name === name)
    ids[name] = found ? found.id : await createFolder(token, name, rootId)
  }
  return ids
}

/** Everything in the EPK folder, each file tagged with the subfolder it sits in. */
export async function listFolderTree(
  token: string,
  rootId: string,
): Promise<{ files: Array<DriveItem & { folder: Subfolder | null }>; subfolders: Partial<Record<Subfolder, string>> }> {
  const top = await listChildren(token, rootId)
  const subfolders: Partial<Record<Subfolder, string>> = {}
  const files: Array<DriveItem & { folder: Subfolder | null }> = []
  for (const item of top) {
    if (isFolder(item)) {
      if ((SUBFOLDERS as readonly string[]).includes(item.name)) subfolders[item.name as Subfolder] = item.id
      continue
    }
    files.push({ ...item, folder: null })
  }
  const nested = await Promise.all(
    Object.entries(subfolders).map(async ([name, id]) =>
      (await listChildren(token, id!)).filter((f) => !isFolder(f)).map((f) => ({ ...f, folder: name as Subfolder })),
    ),
  )
  return { files: [...files, ...nested.flat()], subfolders }
}

/**
 * A copy of a picked file, in the EPK folder. A copy, not a move: the
 * artist's own folders are never rearranged, and the original is theirs to
 * keep organised however they like. It counts against their Drive storage.
 */
export async function copyInto(token: string, fileId: string, parentId: string): Promise<string> {
  return (
    await call<{ id: string }>(token, `/files/${encodeURIComponent(fileId)}/copy?fields=id`, {
      method: 'POST',
      body: JSON.stringify({ parents: [parentId] }),
    })
  ).id
}

/** Rename, and move between two folders Scout made. */
export async function renameAndMove(
  token: string,
  fileId: string,
  name: string,
  from: string,
  to: string,
): Promise<void> {
  const params = from === to ? '' : `?addParents=${encodeURIComponent(to)}&removeParents=${encodeURIComponent(from)}`
  await call(token, `/files/${encodeURIComponent(fileId)}${params}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

/**
 * Anyone with the link can view the folder. Files inside inherit it, so one
 * permission covers the folder link and every file's download link — and
 * withdrawing it withdraws them all.
 */
export async function shareWithLink(token: string, folderId: string): Promise<void> {
  await call(token, `/files/${encodeURIComponent(folderId)}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
}

export async function unshareLink(token: string, folderId: string): Promise<void> {
  // `anyoneWithLink` is the id Drive gives the anyone-with-the-link permission.
  await call(token, `/files/${encodeURIComponent(folderId)}/permissions/anyoneWithLink`, { method: 'DELETE' })
}

export async function isSharedWithLink(token: string, folderId: string): Promise<boolean> {
  const page = await call<{ permissions: Array<{ type: string }> }>(
    token,
    `/files/${encodeURIComponent(folderId)}/permissions?fields=permissions(type)`,
  )
  return page.permissions.some((p) => p.type === 'anyone')
}

/** For `planOrganise`: the shape it reads. */
export function asDriveFiles(files: Array<DriveItem & { folder: Subfolder | null }>): DriveFile[] {
  return files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, folder: f.folder, createdTime: f.createdTime }))
}
