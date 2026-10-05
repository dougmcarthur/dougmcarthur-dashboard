import { useState, type ReactNode } from 'react'
import type { ArtistAssetWithHealth } from '../../api'
import { ASSET_KIND_META, normaliseAssetKind, type AssetKind } from '../../../../shared/artistAssets'
import { kindByKey } from '../../../../shared/questionKinds'
import { Caption, Card, EmptyState } from '../../components/ui/Surface'
import { Button } from '../../components/ui/Button'

/**
 * The Library, three ways.
 *
 * **Profile** is the default because it is how the library reads to anybody
 * but its author: a page about an artist, with the name and the one-line
 * pitch at the top, the bio beside the facts, and the links, video and photos
 * where a person expects them. It is the question "what would a programmer
 * see" answered before they are sent anything.
 *
 * **Grid** is for browsing: every entry a card, any card opening in place to
 * the full entry and its actions. **Table** is for auditing: one line each,
 * sortable, with the review state in a column of its own.
 *
 * The views only change how entries are laid out. What an entry says, and the
 * actions on it, are the same `detail` in all three — the caller renders it —
 * so fixing a missing photo credit is the same two clicks from anywhere.
 */

export type LibraryView = 'profile' | 'grid' | 'table'
export const LIBRARY_VIEWS: Array<{ id: LibraryView; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'grid', label: 'Grid' },
  { id: 'table', label: 'Table' },
]

const VIEW_KEY = 'scout.artist.libraryView'

/** The last view chosen in this browser, or Profile. */
export function loadLibraryView(): LibraryView {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'grid' || v === 'table' || v === 'profile' ? v : 'profile'
  } catch {
    return 'profile'
  }
}

export function saveLibraryView(v: LibraryView) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // A preference that cannot be kept is still honoured for this visit.
  }
}

export function ViewSwitch({ view, onChange }: { view: LibraryView; onChange: (v: LibraryView) => void }) {
  return (
    <div role="group" aria-label="Library view" className="inline-flex gap-1 p-1 rounded-lg border border-line bg-surface">
      {LIBRARY_VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          aria-pressed={v.id === view}
          className={`h-8 px-3 rounded-md text-sm transition-colors ${
            v.id === view ? 'bg-raised text-ink font-semibold shadow-inset' : 'text-muted hover:text-ink'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ── Reading a value for display ────────────────────────────────────────────

/**
 * A library value as text to read, not markdown to parse: headings, emphasis
 * and list markers out, lines kept. The stored value is untouched.
 */
export function plain(value: string | null): string {
  return (value ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim()
}

function firstLine(value: string | null): string {
  return plain(value).split('\n').find((l) => l.trim()) ?? ''
}

function host(url: string | null): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function looksLikeImage(url: string | null): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url ?? '') || /googleusercontent|cloudinary|imgix|squarespace-cdn|wixstatic/i.test(url ?? '')
}

/**
 * A picture from a URL somebody pasted, which may not be a picture or may no
 * longer exist. On failure it becomes the fallback rather than a broken-image
 * icon wearing its alt text.
 */
export function Thumb({ src, alt, className, fallback }: { src: string; alt: string; className: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

type Attention = 'problem' | 'overdue' | 'unreviewed' | null

function attention(a: ArtistAssetWithHealth): Attention {
  if (a.health.problem) return 'problem'
  if (a.health.freshness === 'overdue') return 'overdue'
  if (a.health.freshness === 'unreviewed') return 'unreviewed'
  return null
}

const STATUS_TEXT: Record<Exclude<Attention, null> | 'due_soon' | 'ok', string> = {
  problem: 'Needs fixing',
  overdue: 'Overdue',
  unreviewed: 'Never reviewed',
  due_soon: 'Review soon',
  ok: 'Up to date',
}

function statusOf(a: ArtistAssetWithHealth): keyof typeof STATUS_TEXT {
  return attention(a) ?? (a.health.freshness === 'due_soon' ? 'due_soon' : 'ok')
}

/** A small mark on anything asking for attention, so a scan finds it. */
function Mark({ asset }: { asset: ArtistAssetWithHealth }) {
  const a = attention(asset)
  if (!a) return null
  return (
    <span
      title={STATUS_TEXT[a]}
      aria-label={STATUS_TEXT[a]}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${a === 'unreviewed' ? 'bg-faint' : 'bg-danger-solid'}`}
    />
  )
}

/** Any entry, as a clickable line. */
function Entry({ asset, onOpen, children }: { asset: ArtistAssetWithHealth; onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-sunken transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {children}
      <span className="sr-only">{` — open ${asset.label}`}</span>
    </button>
  )
}

// ── Profile ──────────────────────────────────────────────────────────────────

function by(items: ArtistAssetWithHealth[], kind: AssetKind) {
  return items.filter((a) => normaliseAssetKind(a.kind) === kind)
}

function withQuestion(items: ArtistAssetWithHealth[], ...keys: string[]) {
  return items.find((a) => a.questionKind && keys.includes(a.questionKind))
}

export function ProfileView({
  items,
  name,
  onOpen,
}: {
  items: ArtistAssetWithHealth[]
  name: string | null
  onOpen: (a: ArtistAssetWithHealth) => void
}) {
  const live = items.filter((a) => !a.archived)
  const photos = by(live, 'photo')
  const hero = photos.find((p) => looksLikeImage(p.value)) ?? null
  const bios = by(live, 'bio').sort((a, b) => (b.value?.length ?? 0) - (a.value?.length ?? 0))
  const tagline = withQuestion(live, 'one_liner') ?? null
  const hometown = withQuestion(live, 'hometown')
  const genre = withQuestion(live, 'genre')
  const lineup = withQuestion(live, 'lineup')
  const highlights = live.filter((a) => a.questionKind === 'career_highlights' || a.questionKind === 'press_quote')
  const shown = new Set([tagline, hometown, genre, lineup, ...highlights].filter(Boolean).map((a) => a!.id))
  const facts = by(live, 'fact').filter((a) => !shown.has(a.id))
  const links = by(live, 'link')
  const media = [...by(live, 'video'), ...by(live, 'audio')]
  const documents = by(live, 'document')
  const title = name || (withQuestion(live, 'artist_name') ? firstLine(withQuestion(live, 'artist_name')!.value) : '') || 'Your profile'

  return (
    <div className="space-y-6">
      {/* The header: who, what, where — the line a programmer reads first. */}
      <Card pad="md" className="flex flex-col sm:flex-row gap-5 sm:items-center">
        {hero?.value ? (
          <button type="button" onClick={() => onOpen(hero)} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-accent">
            <Thumb
              src={hero.value}
              alt={hero.label}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border border-line"
              fallback={<Initial title={title} />}
            />
          </button>
        ) : (
          <Initial title={title} />
        )}
        <div className="min-w-0 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">{title}</h2>
          {tagline ? (
            <Entry asset={tagline} onOpen={() => onOpen(tagline)}>
              <span className="text-base text-body">{firstLine(tagline.value)}</span>
            </Entry>
          ) : (
            <p className="text-sm text-faint">No one-line description yet.</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {[hometown, genre, lineup].map((a) =>
              a ? (
                <button key={a.id} type="button" onClick={() => onOpen(a)} className="hover:text-ink transition-colors text-left">
                  {firstLine(a.value).slice(0, 60)}
                </button>
              ) : null,
            )}
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {links.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onOpen(l)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs text-body hover:bg-sunken hover:text-ink transition-colors"
                >
                  <Mark asset={l} />
                  {l.label}
                  {host(l.value) && <span className="text-faint">{host(l.value)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          <ProfileSection title="About">
            {bios.length === 0 ? (
              <p className="text-sm text-faint">No bio yet.</p>
            ) : (
              <div className="space-y-3">
                <Entry asset={bios[0]} onOpen={() => onOpen(bios[0])}>
                  <span className="flex items-center gap-2 text-xs text-muted mb-1">
                    <Mark asset={bios[0]} /> {bios[0].label}
                  </span>
                  <span className="block text-sm text-body leading-relaxed whitespace-pre-line line-clamp-[10]">
                    {plain(bios[0].value)}
                  </span>
                </Entry>
                {bios.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {bios.slice(1).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onOpen(b)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:text-ink hover:bg-sunken transition-colors"
                      >
                        <Mark asset={b} />
                        {b.label}
                        <span className="text-faint tabular-nums">{(b.value ?? '').split(/\s+/).filter(Boolean).length}w</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ProfileSection>

          {highlights.length > 0 && (
            <ProfileSection title="Highlights">
              <ul className="space-y-1">
                {highlights.map((h) => (
                  <li key={h.id}>
                    <Entry asset={h} onOpen={() => onOpen(h)}>
                      <span className="flex items-start gap-2">
                        <Mark asset={h} />
                        <span className="text-sm text-body whitespace-pre-line line-clamp-4">{plain(h.value)}</span>
                      </span>
                    </Entry>
                  </li>
                ))}
              </ul>
            </ProfileSection>
          )}

          <ProfileSection title="Watch and listen">
            {media.length === 0 ? (
              <p className="text-sm text-faint">No live video or recordings yet. A live video is the first thing a programmer watches.</p>
            ) : (
              <ul className="space-y-1">
                {media.map((m) => (
                  <li key={m.id}>
                    <Entry asset={m} onOpen={() => onOpen(m)}>
                      <span className="flex items-center gap-3">
                        <span className="h-9 w-9 shrink-0 rounded-md bg-sunken flex items-center justify-center text-muted" aria-hidden>
                          <svg width="12" height="12" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm text-ink">
                            {m.label} <Mark asset={m} />
                          </span>
                          <span className="block text-xs text-muted truncate">
                            {ASSET_KIND_META[normaliseAssetKind(m.kind)].label} · {host(m.value) || 'no link'}
                          </span>
                        </span>
                      </span>
                    </Entry>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          <ProfileSection title="Photos">
            {photos.length === 0 ? (
              <p className="text-sm text-faint">No press photos yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    className="group text-left rounded-lg border border-line overflow-hidden bg-sunken hover:border-line-strong transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {looksLikeImage(p.value) ? (
                      <Thumb
                        src={p.value ?? ''}
                        alt={p.label}
                        className="aspect-[4/3] w-full object-cover"
                        fallback={<PhotoPlaceholder text={`Can’t show ${host(p.value) || 'this link'}`} />}
                      />
                    ) : (
                      <PhotoPlaceholder text={host(p.value) || 'Photo link'} />
                    )}
                    <span className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                      <Mark asset={p} />
                      <span className="truncate text-body">{p.credit ? `© ${p.credit}` : p.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ProfileSection>
        </div>

        <aside className="space-y-6 min-w-0" aria-label="Facts and documents">
          <ProfileSection title="Facts">
            {facts.length === 0 ? (
              <p className="text-sm text-faint">No facts yet — hometown, line-up, set length.</p>
            ) : (
              <dl className="space-y-1">
                {facts.map((f) => (
                  <Entry key={f.id} asset={f} onOpen={() => onOpen(f)}>
                    <dt className="flex items-center gap-2 text-xs text-muted">
                      {f.questionKind ? kindByKey(f.questionKind)?.label ?? f.label : f.label} <Mark asset={f} />
                    </dt>
                    <dd className="text-sm text-body line-clamp-2">{firstLine(f.value) || '—'}</dd>
                  </Entry>
                ))}
              </dl>
            )}
          </ProfileSection>

          <ProfileSection title="Documents">
            {documents.length === 0 ? (
              <p className="text-sm text-faint">No stage plot, rider or tax forms yet.</p>
            ) : (
              <ul className="space-y-1">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Entry asset={d} onOpen={() => onOpen(d)}>
                      <span className="flex items-center gap-2 text-sm text-ink">
                        {d.label} <Mark asset={d} />
                      </span>
                      <span className="block text-xs text-muted truncate">{host(d.value) || 'no link'}</span>
                    </Entry>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>
        </aside>
      </div>
    </div>
  )
}

function Initial({ title }: { title: string }) {
  return (
    <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-full bg-accent-soft text-accent flex items-center justify-center text-4xl font-semibold" aria-hidden>
      {title.slice(0, 1).toUpperCase()}
    </div>
  )
}

function PhotoPlaceholder({ text }: { text: string }) {
  return (
    <span className="aspect-[4/3] w-full flex items-center justify-center text-xs text-muted px-2 text-center">{text}</span>
  )
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" pad="md" className="space-y-3">
      <Caption as="h3">{title}</Caption>
      {children}
    </Card>
  )
}

// ── Grid ─────────────────────────────────────────────────────────────────────

export function GridView({
  items,
  detail,
}: {
  items: ArtistAssetWithHealth[]
  /** The full entry with its actions — the same one the other views open. */
  detail: (a: ArtistAssetWithHealth) => ReactNode
}) {
  const [open, setOpen] = useState<number | null>(null)
  if (items.length === 0) return <EmptyState>Nothing matches.</EmptyState>

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start">
      {items.map((a) => {
        const meta = ASSET_KIND_META[normaliseAssetKind(a.kind)]
        if (open === a.id) {
          return (
            <Card key={a.id} pad="none" clip className="sm:col-span-2 xl:col-span-3 ring-2 ring-accent">
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-sunken border-b border-line">
                <Caption>{meta.label}</Caption>
                <Button variant="quiet" size="sm" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </div>
              {detail(a)}
            </Card>
          )
        }
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(a.id)}
            aria-expanded={false}
            className={`text-left rounded-xl border border-line bg-surface shadow-card overflow-hidden hover:border-line-strong transition-colors
                        focus:outline-none focus:ring-2 focus:ring-accent ${a.archived ? 'opacity-50' : ''}`}
          >
            {normaliseAssetKind(a.kind) === 'photo' && looksLikeImage(a.value) && (
              <Thumb src={a.value ?? ''} alt="" className="aspect-[16/9] w-full object-cover" fallback={null} />
            )}
            <span className="block p-4 space-y-1.5">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{meta.label}</span>
                <Mark asset={a} />
              </span>
              <span className="block text-sm font-semibold text-ink">{a.label}</span>
              {meta.isLink ? (
                <span className="block text-xs text-info-fg truncate">{host(a.value) || a.value}</span>
              ) : (
                <span className="block text-sm text-body line-clamp-4 whitespace-pre-line">{plain(a.value)}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Table ────────────────────────────────────────────────────────────────────

type SortKey = 'label' | 'kind' | 'status' | 'reviewBy'

const STATUS_ORDER: Record<keyof typeof STATUS_TEXT, number> = {
  problem: 0,
  overdue: 1,
  unreviewed: 2,
  due_soon: 3,
  ok: 4,
}

export function TableView({
  items,
  onOpen,
}: {
  items: ArtistAssetWithHealth[]
  onOpen: (a: ArtistAssetWithHealth) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'kind', dir: 1 })
  if (items.length === 0) return <EmptyState>Nothing matches.</EmptyState>

  const value = (a: ArtistAssetWithHealth): string | number => {
    switch (sort.key) {
      case 'label':
        return a.label.toLowerCase()
      case 'kind':
        return `${ASSET_KIND_META[normaliseAssetKind(a.kind)].plural}|${a.label.toLowerCase()}`
      case 'status':
        return STATUS_ORDER[statusOf(a)]
      case 'reviewBy':
        return a.reviewBy ?? '9999'
    }
  }
  const rows = [...items].sort((x, y) => {
    const a = value(x)
    const b = value(y)
    return (a < b ? -1 : a > b ? 1 : 0) * sort.dir
  })

  const header = (key: SortKey, label: string) => (
    <th scope="col" className="px-3 py-2 font-medium" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}
        className="inline-flex items-center gap-1 hover:text-ink transition-colors"
      >
        {label}
        {sort.key === key && <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  )

  return (
    <Card pad="none" clip>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-line bg-sunken">
              {header('label', 'Entry')}
              {header('kind', 'Kind')}
              <th scope="col" className="px-3 py-2 font-medium">Value</th>
              <th scope="col" className="px-3 py-2 font-medium">Answers</th>
              {header('status', 'Status')}
              {header('reviewBy', 'Review by')}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const meta = ASSET_KIND_META[normaliseAssetKind(a.kind)]
              const status = statusOf(a)
              return (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a)}
                  className={`cursor-pointer hover:bg-sunken transition-colors ${a.archived ? 'opacity-50' : ''}`}
                >
                  <td className="px-3 py-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(a) }} className="text-left text-ink font-medium hover:text-accent">
                      {a.label}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{meta.label}</td>
                  <td className="px-3 py-2 text-body max-w-[22rem]">
                    <span className="block truncate">{meta.isLink ? host(a.value) || a.value : firstLine(a.value)}</span>
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">
                    {a.questionKind ? kindByKey(a.questionKind)?.label ?? '' : ''}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${status === 'problem' || status === 'overdue' ? 'text-danger-fg' : 'text-muted'}`}>
                    {a.archived ? 'Archived' : STATUS_TEXT[status]}
                  </td>
                  <td className="px-3 py-2 text-muted tabular-nums whitespace-nowrap">{a.reviewBy ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
