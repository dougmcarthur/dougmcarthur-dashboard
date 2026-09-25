import { useState } from 'react'
import type { EpkPage, MergedShow } from '../../api'
import { epkProfile, type EpkProfile, type ProfileLink } from '../../../../shared/epkProfile'

/**
 * The EPK as an artist page — what a festival programmer, a music supervisor
 * or a journalist sees when they open a share link.
 *
 * Built for a screen first, a phone included: the research found juries
 * reviewing on portals and screens, not paper. The order is the order a
 * programmer decides in — who is this and what do they sound like, then
 * proof (a quote, a video), then the detail. The print stylesheet is the
 * fallback for an application's "upload your EPK (PDF)" field: the browser's
 * Save as PDF turns this same page into that file.
 *
 * Nothing here reads a raw library value: `epkProfile` has already taken the
 * markdown out and split the genre, the quote and the highlights along their
 * seams, so what reaches JSX is text meant to be read.
 *
 * Every image is loaded with no referrer: Manitoba Music, where many of these
 * photos live, refuses an image request that names another site.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WRAP = 'max-w-5xl mx-auto px-5 sm:px-10'

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-5 break-inside-avoid scroll-mt-6">
      <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">{children}</h3>
}

function pill(primary: boolean) {
  return primary
    ? 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-accent-hover transition-colors print:hidden'
    : 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full border border-line-strong text-ink hover:bg-sunken transition-colors print:hidden'
}

function Play() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  )
}

function Bio({ profile }: { profile: EpkProfile }) {
  const [i, setI] = useState(profile.bioIndex)
  const [copied, setCopied] = useState(false)
  const bio = profile.bios[Math.min(i, profile.bios.length - 1)]
  return (
    <div className="space-y-4">
      {profile.bios.length > 1 && (
        <div role="group" aria-label="Bio length" className="inline-flex gap-1 p-1 rounded-full border border-line bg-surface print:hidden">
          {profile.bios.map((b, k) => (
            <button
              key={k}
              onClick={() => {
                setI(k)
                setCopied(false)
              }}
              aria-pressed={k === i}
              className={`h-8 px-3.5 rounded-full text-sm transition-colors ${k === i ? 'bg-raised text-ink font-semibold' : 'text-body hover:text-ink'}`}
            >
              {b.label}
              <span className={`ml-1.5 text-xs ${k === i ? 'text-muted' : 'text-faint'}`}>{b.words}w</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-base sm:text-[17px] leading-relaxed text-body whitespace-pre-line max-w-prose">{bio.value}</p>
      <button
        onClick={() =>
          navigator.clipboard.writeText(bio.value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className="text-sm text-muted hover:text-ink underline underline-offset-2 print:hidden"
      >
        {copied ? 'Copied' : `Copy this bio · ${bio.words} words`}
      </button>
    </div>
  )
}

function Names({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="space-y-2">
      <Eyebrow>{title}</Eyebrow>
      {/* Each name kept whole: "I Mother Earth" must not break after the I. */}
      <p className="text-sm text-body leading-relaxed">
        {names.map((n, i) => (
          <span key={n}>
            {i > 0 && <span className="text-faint"> · </span>}
            <span className="whitespace-nowrap">{n}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

function ShowRow({ show }: { show: MergedShow }) {
  const [, m, d] = show.date.split('-')
  return (
    <li className="flex items-center gap-4 py-3 border-b border-line last:border-b-0">
      <div className="w-12 shrink-0 text-center rounded-lg bg-sunken py-1.5">
        <div className="text-[11px] font-semibold text-accent uppercase">{MONTH[Number(m) - 1]}</div>
        <div className="text-lg font-semibold text-ink leading-tight">{Number(d)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate">{show.title || show.venue}</p>
        <p className="text-sm text-muted truncate">{[show.title ? show.venue : null, show.location].filter(Boolean).join(' · ')}</p>
      </div>
      {show.ticketUrl && (
        <a href={show.ticketUrl} target="_blank" rel="noreferrer" className="text-sm text-info-fg underline shrink-0 print:hidden">
          Tickets
        </a>
      )}
    </li>
  )
}

function LinkColumn({ title, links }: { title: string; links: ProfileLink[] }) {
  if (links.length === 0) return null
  return (
    <div className="space-y-2.5 min-w-0">
      <Eyebrow>{title}</Eyebrow>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.url} className="min-w-0">
            <a href={l.url} target="_blank" rel="noreferrer" className="text-sm text-ink hover:text-accent transition-colors">
              {l.label}
            </a>
            {/* The address, printed — a link is useless on paper. */}
            <span className="hidden print:block text-[10px] text-muted break-all">{l.url}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function EpkView({ page }: { page: EpkPage }) {
  const { epk, shows } = page
  const p = epkProfile(epk, page.name)
  const hero = epk.photos[0]
  const firstVideo = epk.videos.find((v) => v.youtubeId)
  const listen = epk.audio[0]?.value ?? p.links.listen[0]?.url
  const listenLabel = epk.audio[0] ? 'Listen' : p.links.listen[0] ? `Listen on ${p.links.listen[0].label}` : null
  const watch = firstVideo ? '#live' : p.links.watch[0]?.url
  const hasSidebar = p.glance.length > 0 || p.fansOf.length > 0 || p.influences.length > 0
  const hasLinks = Object.values(p.links).some((l) => l.length > 0)
  // With no photo the hero's second column carries the first quote instead:
  // proof beside the name, rather than an empty half of the screen.
  const heroQuote = hero ? null : p.quotes[0] ?? null
  const quotes = heroQuote ? p.quotes.slice(1) : p.quotes

  return (
    <article className="bg-canvas text-ink">
      {/* Who, and what they sound like */}
      <header className="border-b border-line bg-surface">
        <div className={`${WRAP} py-10 sm:py-16 grid grid-cols-1 gap-10 items-end ${hero || heroQuote ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]' : ''}`}>
          <div className="space-y-5 min-w-0">
            {p.genre && <p className="text-sm font-medium text-accent max-w-xl">{p.genre}</p>}
            <div className="space-y-2">
              <h1 className="font-serif text-5xl sm:text-7xl font-semibold leading-[0.95] tracking-tight text-balance">{p.name}</h1>
              {p.descriptor.length > 0 && (
                <p className="text-sm sm:text-base text-muted">{p.descriptor.join(' · ')}</p>
              )}
            </div>
            {p.tagline && <p className="text-lg sm:text-xl leading-snug text-body max-w-2xl text-pretty">{p.tagline}</p>}
            {(listen || watch) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {listen && listenLabel && (
                  <a href={listen} target="_blank" rel="noreferrer" className={pill(true)}>
                    <Play />
                    {listenLabel}
                  </a>
                )}
                {watch && (
                  <a href={watch} {...(firstVideo ? {} : { target: '_blank', rel: 'noreferrer' })} className={pill(!listen)}>
                    {firstVideo ? 'Watch live' : `Watch on ${p.links.watch[0].label}`}
                  </a>
                )}
              </div>
            )}
          </div>
          {hero && (
            <figure className="space-y-1.5">
              <img
                src={hero.value}
                alt={`${p.name}${hero.label ? ` — ${hero.label}` : ''}`}
                referrerPolicy="no-referrer"
                className="w-full aspect-[4/5] object-cover rounded-2xl bg-raised"
              />
              <figcaption className="text-xs text-muted">Photo: {hero.credit}</figcaption>
            </figure>
          )}
          {heroQuote && (
            <figure className="border-l-2 border-accent pl-5 break-inside-avoid">
              <blockquote className="font-serif text-lg leading-snug text-ink text-pretty">“{heroQuote.text}”</blockquote>
              {heroQuote.source && <figcaption className="mt-3 text-sm text-muted">— {heroQuote.source}</figcaption>}
            </figure>
          )}
        </div>
      </header>

      <div className={`${WRAP} py-12 sm:py-16 space-y-14 sm:space-y-20`}>
        {quotes.length > 0 && (
          <div className="space-y-10">
            {quotes.map((q, i) => (
              <figure key={i} className="max-w-3xl border-l-2 border-accent pl-5 sm:pl-8 break-inside-avoid">
                <blockquote className="font-serif text-xl sm:text-2xl leading-snug text-ink text-pretty">“{q.text}”</blockquote>
                {q.source && <figcaption className="mt-3 text-sm text-muted">— {q.source}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        {(epk.videos.length > 0 || epk.audio.length > 0) && (
          <div className={`grid grid-cols-1 gap-12 ${epk.videos.length > 0 && epk.audio.length > 0 ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>
            {epk.videos.length > 0 && (
              <Section id="live" title="Live">
                {firstVideo && (
                  <div className="aspect-video rounded-xl overflow-hidden bg-raised print:hidden">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube-nocookie.com/embed/${firstVideo.youtubeId}`}
                      title={firstVideo.label}
                      allow="encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
                <ul className="space-y-1.5">
                  {epk.videos.map((v) => (
                    <li key={v.value}>
                      <a href={v.value} target="_blank" rel="noreferrer" className="text-ink hover:text-accent transition-colors">
                        {v.label}
                      </a>
                      <span className="hidden print:inline text-xs text-muted"> — {v.value}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {epk.audio.length > 0 && (
              <Section title="Music">
                <ol className="divide-y divide-line border-y border-line">
                  {epk.audio.map((a, i) => (
                    <li key={a.value} className="flex items-center gap-3 py-3">
                      <span className="w-5 text-right text-faint text-sm tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <a href={a.value} target="_blank" rel="noreferrer" className="text-ink hover:text-accent transition-colors">
                          {a.label}
                        </a>
                        {a.variant && <p className="text-xs text-muted">{a.variant}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        )}

        {(p.bios.length > 0 || hasSidebar) && (
          <div className={`grid grid-cols-1 gap-12 ${p.bios.length > 0 && hasSidebar ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}`}>
            {p.bios.length > 0 && (
              <Section title="About">
                <Bio profile={p} />
              </Section>
            )}
            {hasSidebar && (
              <aside className="space-y-7 lg:pt-14 break-inside-avoid">
                {p.glance.length > 0 && (
                  <dl className="space-y-4">
                    {p.glance.map((f) => (
                      <div key={f.label} className="space-y-1">
                        <dt className="text-xs font-semibold uppercase tracking-widest text-muted">{f.label}</dt>
                        <dd className="text-sm text-ink whitespace-pre-line">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {p.fansOf.length > 0 && <Names title="For fans of" names={p.fansOf} />}
                {p.influences.length > 0 && <Names title="Influences" names={p.influences} />}
              </aside>
            )}
          </div>
        )}

        {p.highlights.length > 0 && (
          <Section title="Highlights">
            <dl className="grid grid-cols-1 sm:grid-cols-[9rem_minmax(0,1fr)] gap-x-8 border-t border-line">
              {p.highlights.map((h, i) => (
                <div key={i} className="contents">
                  <dt className="pt-4 sm:pb-4 sm:border-b border-line text-xs font-semibold uppercase tracking-widest text-muted">
                    {h.label ?? ''}
                  </dt>
                  <dd className="pt-1 pb-4 sm:pt-4 border-b border-line text-sm sm:text-base text-body leading-relaxed">{h.text}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {(shows.upcoming.length > 0 || shows.past.length > 0) && (
          <Section title="Shows">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {shows.upcoming.length > 0 && (
                <div className="space-y-1">
                  <Eyebrow>Upcoming</Eyebrow>
                  <ul>{shows.upcoming.map((s) => <ShowRow key={s.key} show={s} />)}</ul>
                </div>
              )}
              {shows.past.length > 0 && (
                <div className="space-y-1">
                  <Eyebrow>Recently played</Eyebrow>
                  <ul>{shows.past.map((s) => <ShowRow key={s.key} show={s} />)}</ul>
                </div>
              )}
            </div>
          </Section>
        )}

        {epk.photos.length > 0 && (
          <Section title="Press photos">
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {epk.photos.map((ph) => (
                <li key={ph.value} className="space-y-1.5 break-inside-avoid">
                  <a href={ph.value} target="_blank" rel="noreferrer" referrerPolicy="no-referrer" className="block">
                    <img src={ph.value} alt={ph.label} referrerPolicy="no-referrer" loading="lazy" className="w-full aspect-[4/5] object-cover rounded-lg bg-raised" />
                  </a>
                  <p className="text-xs text-muted">Photo: {ph.credit}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {epk.documents.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 space-y-4 break-inside-avoid">
            <h2 className="font-serif text-2xl font-semibold">For programmers</h2>
            <ul className="flex flex-wrap gap-3">
              {epk.documents.map((d) => (
                <li key={d.value}>
                  <a href={d.value} target="_blank" rel="noreferrer" className="inline-flex items-center h-11 px-4 rounded-lg border border-line-strong text-ink hover:bg-sunken transition-colors">
                    {d.label}
                  </a>
                  <span className="hidden print:block text-xs text-muted">{d.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="border-t border-line bg-surface">
        <div className={`${WRAP} py-10 space-y-8`}>
          {hasLinks && (
            <nav aria-label="Artist links" className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              <LinkColumn title="Listen" links={p.links.listen} />
              <LinkColumn title="Watch" links={p.links.watch} />
              <LinkColumn title="Follow" links={p.links.follow} />
              <LinkColumn title="More" links={p.links.more} />
            </nav>
          )}
          <p className="text-xs text-faint">Kept current with Sun Dogs Music Scout</p>
        </div>
      </footer>
    </article>
  )
}
