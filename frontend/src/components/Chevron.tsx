export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-ink-subtle transition-transform duration-150 shrink-0 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
