import { describe, expect, it } from 'vitest'
import {
  artistSlug,
  cleanTitle,
  downloadUrl,
  planOrganise,
  subfolderFor,
  type DriveFile,
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
