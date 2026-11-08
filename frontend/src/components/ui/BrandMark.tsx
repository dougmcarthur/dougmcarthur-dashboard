/**
 * The logo, drawn beside the product's name and never instead of it.
 *
 * Decorative by construction (`aria-hidden`): the name next to it is what a
 * screen reader and a search engine get, and the product is never named on a
 * word of it alone. The drawing is the `.brand-mark` class in `index.css`, so
 * the static privacy and terms pages draw the same tile without React.
 * Pass the size as a Tailwind class (`size-7`).
 */
export function BrandMark({ className = 'size-7' }: { className?: string }) {
  return <span aria-hidden="true" className={`brand-mark ${className}`} />
}
