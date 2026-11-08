/**
 * Renders scripts/og/og-image.html to frontend/public/og-image.png (1200x630).
 *
 *   node scripts/og/render.mjs
 *
 * Playwright is not a dependency of this repository; any install that
 * `require('playwright')` can find will do. Run `npm ci` first: the page loads
 * its fonts from node_modules.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// require, not import: it honours NODE_PATH, where a global Playwright lives.
const { chromium } = createRequire(import.meta.url)('playwright')
const source = fileURLToPath(new URL('./og-image.html', import.meta.url))
const target = fileURLToPath(new URL('../../frontend/public/og-image.png', import.meta.url))

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(source).href)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.card').screenshot({ path: target })
} finally {
  await browser.close()
}
console.log(`wrote ${target}`)
