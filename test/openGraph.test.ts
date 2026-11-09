import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The preview a shared link to the homepage unfolds into.
 *
 * A crawler reads `frontend/index.html` without running the app, so the tags
 * have to be in the file, and the image has to be an absolute address on the
 * deployment's own host: a relative one resolves against nothing. The image is
 * a committed PNG because a preview is fetched from the live site, and it is
 * 1200x630, the one size every network shows without a crop.
 */
const read = (path: string) => readFileSync(path, 'utf8')
const HTML = read('frontend/index.html')
const meta = (key: string) => HTML.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`))?.[1]

const ORIGIN = new URL(read('wrangler.toml').match(/^DASHBOARD_URL\s*=\s*"([^"]+)"/m)![1]).origin
const PNG = readFileSync('frontend/public/og-image.png')

describe('the homepage preview', () => {
  it('names the product whole, never "Scout" alone', () => {
    expect(meta('og:title')).toBe('Sun Dogs Music Scout')
    expect(meta('og:site_name')).toBe('Sun Dogs Music Scout')
    expect(meta('twitter:title')).toBe('Sun Dogs Music Scout')
  })

  it('points at the deployment itself, on an absolute address', () => {
    expect(meta('og:url')).toBe(`${ORIGIN}/`)
    expect(meta('og:image')).toBe(`${ORIGIN}/og-image.png`)
    expect(meta('twitter:image')).toBe(meta('og:image'))
    expect(HTML).toContain(`<link rel="canonical" href="${ORIGIN}/" />`)
  })

  it('says who it is for, as the description does', () => {
    expect(meta('og:description')).toMatch(/Canadian musicians/)
    expect(meta('twitter:description')).toBe(meta('og:description'))
  })

  it('describes the image for anyone who cannot see it', () => {
    expect(meta('og:image:alt')).toMatch(/Sun Dogs Music Scout/)
    expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'))
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  it('is a 1200x630 PNG that declares the size it is', () => {
    expect(PNG.subarray(1, 4).toString('latin1')).toBe('PNG')
    // IHDR: width and height are the first two big-endian words of the chunk.
    expect(PNG.readUInt32BE(16)).toBe(1200)
    expect(PNG.readUInt32BE(20)).toBe(630)
    expect(meta('og:image:type')).toBe('image/png')
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
  })

  it('is small enough for every network to fetch (Facebook and X cap at 5 MB, LinkedIn at 5 MB)', () => {
    expect(PNG.length).toBeLessThan(1_000_000)
  })

  it('is served from the Worker’s static assets, with no route of its own', () => {
    // Vite copies `frontend/public` into `dist`, which `[assets]` serves.
    expect(read('wrangler.toml')).toMatch(/\[assets\][\s\S]*directory = "\.\/dist"/)
    expect(read('vite.config.ts')).toContain("root: 'frontend'")
  })
})
