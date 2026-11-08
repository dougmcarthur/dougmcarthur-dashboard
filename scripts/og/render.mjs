/**
 * Writes everything that is drawn from the logo, which lives in shared/brandMark.ts:
 *
 *   frontend/public/logo.svg             the full square, in the brand's orange and plum
 *   frontend/public/logo-mark.svg        the silhouette alone, the mask behind the in-page tile
 *   frontend/public/favicon.svg          the logo clipped to rounded corners, for the tab
 *   frontend/public/favicon.ico          16, 32 and 48px, for browsers that ask for /favicon.ico
 *   frontend/public/apple-touch-icon.png 180px, square and opaque (iOS rounds it itself,
 *                                        and fills a transparent corner with black)
 *   frontend/public/og-image.png         the 1200x630 link-preview card (og-image.html)
 *
 *   node scripts/og/render.mjs
 *
 * These are the brand's own colours. In the app the tile and the tab icon are drawn
 * again in whatever theme the person chose (`.brand-mark` in index.css and
 * `syncTabIcon` in appearance.ts), and these files are what shows before that runs
 * and wherever a theme cannot reach: an .ico, a home screen, a shared link.
 *
 * Playwright is not a dependency of this repository; any install that
 * `require('playwright')` can find will do. Run `npm ci` first: the card loads
 * its fonts from node_modules. brandMark.ts is imported as it is, through Node's
 * type stripping, so it has to stay plain erasable TypeScript.
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { logoSvg, maskSvg, tabIconSvg } from '../../shared/brandMark.ts'

// require, not import: it honours NODE_PATH, where a global Playwright lives.
const { chromium } = createRequire(import.meta.url)('playwright')
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const pub = (name) => here(`../../frontend/public/${name}`)

const logo = logoSvg()
const favicon = tabIconSvg()
writeFileSync(pub('logo.svg'), logo)
writeFileSync(pub('logo-mark.svg'), maskSvg())
writeFileSync(pub('favicon.svg'), favicon)

const browser = await chromium.launch()
try {
  const shot = async (svg, size, opaque) => {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`,
    )
    const png = await page.screenshot({ omitBackground: !opaque })
    await page.close()
    return png
  }

  // The card.
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(here('./og-image.html')).href)
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.card').screenshot({ path: pub('og-image.png') })
    await page.close()
  }

  // Tab icons.
  writeFileSync(pub('apple-touch-icon.png'), await shot(logo, 180, true))

  // An .ico is a directory of images; modern ones can hold PNGs as they are.
  const sizes = [16, 32, 48]
  const images = await Promise.all(sizes.map((s) => shot(favicon, s, false)))
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2) // type: icon
  head.writeUInt16LE(sizes.length, 4)
  let offset = 6 + 16 * sizes.length
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(s, 0)
    e.writeUInt8(s, 1)
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(images[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += images[i].length
    return e
  })
  writeFileSync(pub('favicon.ico'), Buffer.concat([head, ...entries, ...images]))
} finally {
  await browser.close()
}
console.log('wrote logo.svg, logo-mark.svg, favicon.svg, favicon.ico, apple-touch-icon.png, og-image.png')
