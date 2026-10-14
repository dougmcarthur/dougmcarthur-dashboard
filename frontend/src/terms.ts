/**
 * The entry for /terms-of-service/, which is its own document rather than a
 * route of the app, for the same reasons the privacy policy is (see
 * `vite.config.ts` and `privacy.ts`).
 *
 * It needs exactly what that page needs, the stylesheet, the self-hosted fonts
 * and the reader's saved appearance, so it takes them from there rather than
 * carrying a second copy that could drift.
 */
import './privacy'
