import { describe, expect, it } from 'vitest'
import {
  artistSlug,
  cleanTitle,
  downloadUrl,
  planOrganise,
  proposalsFromDrive,
  subfolderFor,
  type DriveFile,
  type DriveLibraryFile,
} from '../shared/driveOrganise'

const ARTIST = 'Doug McArthur'
let t = 0
function file(name: string, mimeType: string, folder: DriveFile['folder'] = null): DriveFile {
  t++
  return { id: `f${t}`, name, mimeType, folder, createdTime: `2026-09-25T00:00:${String(t).padStart(2, '0')}Z` }
}

describe('where a file belongs', () => {
  it('sorts by type, and documents by name', () => {
    expect(subfolderFor({ name: 'IMG_4471.JPG', mimeType: 'image/jpeg' })).toBe('Photos')
    expect(subfolderFor({ name: 'magic.wav', mimeType: 'audio/wav' })).toBe('Audio')
    expect(subfolderFor({ name: 'live.mp4', mimeType: 'video/mp4' })).toBe('Video')
    expect(subfolderFor({ name: 'Stage Plot solo.pdf', mimeType: 'application/pdf' })).toBe('Tech')
    expect(subfolderFor({ name: 'Tech rider 2026', mimeType: 'application/vnd.google-apps.document' })).toBe('Tech')
    expect(subfolderFor({ name: 'Electronic Press Kit PDF - 2024.pdf', mimeType: 'application/pdf' })).toBe('Press')
    expect(subfolderFor({ name: 'Short bio.docx', mimeType: 'application/msword' })).toBe('Press')
    expect(subfolderFor({ name: 'receipt.pdf', mimeType: 'application/pdf' })).toBe('Other')
  })
})

describe('names', () => {
  it('slugs the artist without accents or punctuation', () => {
    expect(artistSlug('Doug McArthur')).toBe('DougMcArthur')
    expect(artistSlug('Sigur Rós')).toBe('SigurRos')
    expect(artistSlug("the band's name & co")).toBe('TheBandSNameAndCo')
    expect(artistSlug('!!!')).toBe('Artist')
  })

  it('cleans a title of the artist’s name, track numbers and version marks', () => {
    expect(cleanTitle('01 - Doug McArthur - Magic (final master)', ARTIST)).toBe('Magic')
    expect(cleanTitle('DougMcArthur_Lost Weekends v3', ARTIST)).toBe('Lost-Weekends')
    expect(cleanTitle('IMG_20240512', ARTIST)).toBe('')
  })
})

describe('the plan', () => {
  it('names photos in the order they were added, and moves everything into its subfolder', () => {
    const plan = planOrganise(
      [
        file('IMG_4471.JPG', 'image/jpeg'),
        file('DSC0002.jpeg', 'image/jpeg'),
        file('01 - Magic (final).wav', 'audio/wav'),
        file('Stage Plot for Solo Performances - Doug McArthur.pdf', 'application/pdf'),
        file('Electronic Press Kit PDF - 2024.pdf', 'application/pdf'),
      ],
      ARTIST,
    )
    expect(plan.map((p) => `${p.to.folder}/${p.to.name}`)).toEqual([
      'Photos/DougMcArthur_Photo_01.jpg',
      'Photos/DougMcArthur_Photo_02.jpeg',
      'Audio/DougMcArthur_Magic.wav',
      'Tech/DougMcArthur_StagePlot.pdf',
      'Press/DougMcArthur_EPK.pdf',
    ])
  })

  it('leaves out a file already where it belongs under its name', () => {
    const plan = planOrganise([file('DougMcArthur_Photo_01.jpg', 'image/jpeg', 'Photos')], ARTIST)
    expect(plan).toEqual([])
  })

  it('keeps names unique within a folder', () => {
    const plan = planOrganise([file('Magic.wav', 'audio/wav'), file('magic (final).mp3', 'audio/mpeg')], ARTIST)
    expect(plan.map((p) => p.to.name)).toEqual(['DougMcArthur_Magic.wav', 'DougMcArthur_Magic.mp3'])
    const same = planOrganise([file('Magic.wav', 'audio/wav'), file('Magic final.wav', 'audio/wav')], ARTIST)
    expect(same.map((p) => p.to.name)).toEqual(['DougMcArthur_Magic.wav', 'DougMcArthur_Magic-2.wav'])
  })

  it('numbers what has no title left, and gives a Google Doc no extension', () => {
    const plan = planOrganise([file('Untitled document', 'application/vnd.google-apps.document')], ARTIST)
    expect(plan[0].to).toEqual({ name: 'DougMcArthur_Other_01', folder: 'Other' })
  })

  it('never plans anything for a folder', () => {
    expect(planOrganise([file('Photos', 'application/vnd.google-apps.folder')], ARTIST)).toEqual([])
  })
})

it('builds a direct-download link', () => {
  expect(downloadUrl('1AbC_d-9')).toBe('https://drive.google.com/uc?export=download&id=1AbC_d-9')
})

describe('building the artist library from Drive files', () => {
  function libFile(
    name: string,
    mimeType: string,
    extra: Partial<DriveLibraryFile> = {},
  ): DriveLibraryFile {
    t++
    return {
      id: `df${t}`,
      name,
      mimeType,
      folder: null,
      createdTime: `2026-09-25T00:00:${String(t % 60).padStart(2, '0')}Z`,
      webViewLink: `https://drive.google.com/file/d/df${t}/view`,
      ...extra,
    }
  }

  it('proposes photos, audio samples, videos, stage plots, and press kits from binary files', () => {
    const { proposals, skipped } = proposalsFromDrive(
      [
        libFile('IMG_4471.JPG', 'image/jpeg', { width: 3000, height: 2000 }),
        libFile('01 - Magic (final).wav', 'audio/wav'),
        libFile('Live at the Hall.mp4', 'video/mp4'),
        libFile('Stage Plot solo.pdf', 'application/pdf'),
        libFile('Electronic Press Kit 2026.pdf', 'application/pdf'),
        libFile('receipt.pdf', 'application/pdf'),
      ],
      ARTIST,
    )

    expect(proposals.map((p) => ({ kind: p.kind, label: p.label, questionKind: p.questionKind }))).toEqual([
      { kind: 'photo', label: 'Press photo', questionKind: null },
      { kind: 'audio', label: 'Magic', questionKind: null },
      { kind: 'video', label: 'Live At The Hall', questionKind: 'youtube' },
      { kind: 'document', label: 'Stage plot', questionKind: 'tech_requirements' },
      { kind: 'document', label: 'EPK', questionKind: 'epk' },
    ])
    expect(proposals[0].notes).toContain('3000×2000 px')
    expect(skipped).toEqual([
      {
        heading: 'receipt.pdf',
        reason: 'Could not tell whether this is a bio, photo, audio sample, video or stage plot from its name or file type.',
      },
    ])
  })

  it('extracts bios and social/music links from a Google Doc while stripping contact details', () => {
    const docText = [
      'A folk-rock songwriter from Winnipeg whose third record was cut live off the floor in two days.',
      'Reached #4 on the earshot! national folk chart and toured western Canada in the autumn.',
      'Booking: artist@example.com or 204-555-0199',
      'https://open.spotify.com/artist/12345',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://instagram.com/exampleartist',
    ].join('\n\n')

    const { proposals, skipped } = proposalsFromDrive(
      [libFile('Artist Bio & Links', 'application/vnd.google-apps.document', { text: docText })],
      ARTIST,
    )

    const bio = proposals.find((p) => p.kind === 'bio')
    expect(bio).toBeDefined()
    expect(bio?.value).toContain('folk-rock songwriter from Winnipeg')
    expect(bio?.value).not.toContain('artist@example.com')
    expect(bio?.value).not.toContain('204-555-0199')

    expect(proposals.find((p) => p.label === 'Spotify')?.value).toBe('https://open.spotify.com/artist/12345')
    expect(proposals.find((p) => p.kind === 'video')?.value).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(proposals.find((p) => p.label === 'Instagram')?.value).toBe('https://instagram.com/exampleartist')
    expect(skipped.some((s) => s.reason.includes('Phone and email are left in your Google Drive document'))).toBe(true)
  })
})


