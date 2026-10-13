/**
 * The entry for /privacy/, which is its own document rather than a route of
 * the app (see `vite.config.ts`).
 *
 * It carries the stylesheet and the saved appearance and nothing else: the
 * policy's text is plain HTML in `frontend/privacy/index.html`, so it reads
 * with JavaScript off, and a person's text size, theme and contrast follow them
 * here the way they do everywhere else.
 */
import './fonts'
import './themes.css'
import './index.css'
import { applyAppearance, loadAppearance } from './appearance'

applyAppearance(loadAppearance())
