/**
 * The logo, once, and every shape it is drawn in.
 *
 * The dog is a closed outline in a 1024 square that runs off the left and bottom
 * edges, so a tile clipped to rounded corners is what gives it a shape. It is the
 * traced original with the staircase smoothed into curves. Change the drawing
 * here and run `node scripts/og/render.mjs`: that writes `frontend/public/logo.svg`,
 * `logo-mark.svg`, `favicon.svg`, the .ico, the iOS icon and the link-preview card
 * from this file, and `test/brandMark.test.ts` fails if any of them disagrees.
 *
 * Colour is the other half. The brand's own pair is orange and plum, and the Sun
 * Dogs theme (the default) keeps it. Every other theme draws the mark in its own
 * accent, through the `mark` and `mark-fg` tokens (shared/themes.ts), so the tile
 * follows whatever theme a person chose. The tab icon follows it too
 * (`syncTabIcon` in frontend/src/appearance.ts), which is why it is built here as
 * a function of two colours and not only saved as a file. Keep this file free of
 * anything but erasable TypeScript: render.mjs imports it with Node's type stripping.
 */

/** The silhouette and its body, in the 1024 box. */
export const BRAND_MARK_PATH =
  'M 0,793 C 32.1,789.4 64.9,773.2 91.4,755.1 C 190.2,688.1 209,600.8 230.9,491 C 233.7,476.9 253.6,397.3 253.5,392.9 C 252.9,359 201.9,336.1 217,271.1 C 230.2,214.1 274.4,209.8 318.3,185.4 C 356.5,164.3 382,122.2 424.9,110 C 458.5,100.5 495.1,127 525.8,136.9 C 542.4,142.2 559.8,144.6 576.3,150.1 C 569.8,179.3 512.2,175.4 515.9,198.7 C 518.1,213 534.6,215.2 546,218.1 C 575.4,225.4 601.4,232.7 624.1,254.5 C 675.9,304.2 643.7,356.9 717.7,387.7 C 744.5,398.8 800.4,405.9 829.7,406.2 C 842,406.3 869.1,401.4 877.4,412.9 C 889.2,429.2 880.5,488.4 876.9,508.1 C 860.8,597 787,668 697.1,679.5 C 675.9,682.2 649.4,682.8 628.3,679.6 C 615,677.6 603.5,672.3 589.9,672.9 C 581.7,711.6 608.6,777 621.5,814.7 C 646.2,887.4 661.1,945.8 661,1023 L 661,1024 L 0,1024 Z'

/** The brand's own colours, as the Sun Dogs theme's `mark` and `mark-fg` tokens. */
export const BRAND_GROUND = '#FE9F19'
export const BRAND_INK = '#3F141E'

/** Corner radius of the tile, as a share of its side (the CSS and the SVG agree). */
export const TILE_RADIUS = 0.185

/** The full-bleed square: for the iOS icon, which rounds its own corners. */
export function logoSvg(ground = BRAND_GROUND, ink = BRAND_INK): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="${ground}"/>
<path d="${BRAND_MARK_PATH}" fill="${ink}"/>
</svg>
`
}

/** The silhouette alone, as a mask: what the page's tile paints in `mark-fg`. */
export function maskSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<path d="${BRAND_MARK_PATH}" fill="#000"/>
</svg>
`
}

/** The tab icon: the logo clipped to a rounded tile, in any two colours. */
export function tabIconSvg(ground = BRAND_GROUND, ink = BRAND_INK): string {
  const radius = Math.round(1024 * TILE_RADIUS)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<clipPath id="tile"><rect width="1024" height="1024" rx="${radius}"/></clipPath>
<g clip-path="url(#tile)">
<rect width="1024" height="1024" fill="${ground}"/>
<path d="${BRAND_MARK_PATH}" fill="${ink}"/>
</g>
</svg>
`
}
