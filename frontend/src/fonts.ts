/**
 * The two typefaces, served from this site.
 *
 * They used to come from Google Fonts, which meant every page load told Google
 * the visitor's address and which page they opened, on the sign-in screen and
 * the privacy policy included. The privacy policy says no company other than
 * Cloudflare sees a visitor's address, and that sentence is only true while
 * nothing in the page reaches for a font CDN; `test/privacyPolicy.test.ts`
 * fails if one comes back.
 *
 * Both are SIL Open Font License, so shipping the files is allowed. The
 * packages name their families "Bricolage Grotesque Variable" and "Public Sans
 * Variable", which is what `index.css` and `appearance.ts` ask for. The
 * Bricolage file is the one with all three axes (weight, width, optical size),
 * because the headings set `font-stretch`.
 */
import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource-variable/public-sans/index.css'
