/**
 * Writes frontend/src/themes.css from the theme data.
 *
 *   npm run themes:css
 *
 * The file is committed and the app reads it as a plain stylesheet; this is the
 * only thing that is allowed to change it, and test/themes.test.ts fails if the
 * file and the data disagree.
 */
import { writeFileSync } from 'node:fs'
import { generateThemesCss } from '../shared/themeCss'

const target = new URL('../frontend/src/themes.css', import.meta.url)
writeFileSync(target, generateThemesCss())
console.log('wrote frontend/src/themes.css')
