import { useState } from 'react'
import type { EpkPage, MergedShow } from '../../api'
import type { PublicItem } from '../../../../shared/publicEpk'
import { wordCount } from '../../../../shared/publicEpk'

/**
 * The EPK as an artist page — what a festival programmer, a music supervisor
 * or a journalist sees when they open a share link.
 *
 * Built for a screen first, a phone included: the research found juries
 * reviewing on portals and screens, not paper. So live video leads, because
 * it is what a programmer watches before deciding; music is one click away;
 * the bio has the three lengths forms ask for, with Copy. The print
 * stylesheet is the fallback for the one case a file is still needed — an
 * application's "upload your EPK (PDF)" field — and costs nothing to keep:
 * the browser's Save as PDF turns this same page into that file.
 *
 * Every image is loaded with no referrer: Manitoba Music, where many of these
 * photos live, refuses an image request that names another site.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 break-inside-avoid">
      <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

function linkClass(primary = false) {
  return primary
    ? 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-accent-hover transition-colors print:hidden'
    : 'inline-flex items-center justify-center h-11 px-5 rounded-full border border-line-strong text-ink hover:bg-sunken transition-colors print:hidden'
}

function Bio({ bios }: { bios: PublicItem[] }) {
  const [i, setI] = useState(0)
  const [copied, setCopied] = useState(false)
  const bio = bios[Math.min(i, bios.length - 1)]
  return (
    <div className="space-y-3">
      {bios.length > 1 && (
        <div role="group" aria-label="Bio length" className="flex flex-wrap gap-1 p-1 rounded-lg border border-line bg-surface w-fit print:hidden">
          {bios.map((b, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-pressed={k === i}
              className={`h-9 px-3 rounded-md text-sm transition-colors ${k === i ? 'bg-raised text-ink font-semibold' : 'text-body hover:text-ink'}`}
            >
              {b.variant || `${wordCount(b.value)} words`}
            </button>
          ))}
        </div>
      )}
      <p className="text-base sm:text-lg leading-relaxed text-body whitespace-pre-line max-w-prose">{bio.value}</p>
      <button
        onClick={() =>
          navigator.clipboard.writeText(bio.value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className="text-sm text-info-fg underline print:hidden"
      >
        {copied ? 'Copied' : `Copy this bio (${wordCount(bio.value)} words)`}
      </button>
    </div>
  )
}

function ShowRow({ show }: { show: MergedShow }) {
  const [, m, d] = show.date.split('-')
  return (
    <li className="flex items-center gap-4 py-3 border-b border-line">
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

export function EpkView({ page }: { page: EpkPage }) {
  const { epk, shows } = page
  const name = page.name ?? 'Artist'
  const hero = epk.photos[0]
  const genre = epk.facts.find((f) => /genre/i.test(f.label))
  const home = epk.facts.find((f) => /home|based/i.test(f.label))
  const listeners = epk.facts.find((f) => /listener|stream|follower/i.test(f.label))
  const firstVideo = epk.videos.find((v) => v.youtubeId)
  const glance = epk.facts.filter((f) => f !== genre)

  return (
    <article className="bg-canvas text-ink">
      {/* Hero */}
      <header className="relative">
        {hero ? (
          <img
            src={hero.value}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-[46vh] sm:h-[60vh] max-h-[640px] object-cover bg-raised print:h-64"
          />
        ) : (
          <div className="h-40 sm:h-56 bg-raised" />
        )}
        <div className="px-4 sm:px-10 lg:px-20 py-6 sm:py-8 bg-surface/95 sm:absolute sm:inset-x-0 sm:bottom-0 print:static">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div className="space-y-2 min-w-0">
              {genre && <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-accent">{genre.value}</p>}
              <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-semibold leading-none tracking-tight">{name}</h1>
              <p className="text-sm sm:text-base text-body">
                {[home?.value, listeners ? `${listeners.value} ${listeners.label.toLowerCase()}` : null].filter(Boolean).join(' · ')}
                {listeners && <span className="text-faint"> · as of {listeners.asOf}</span>}
              </p>
            </div>
            <div className="flex gap-2">
              {firstVideo && (
                <a href="#live" className={linkClass(true)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                  Watch live
                </a>
              )}
              {epk.audio[0] && (
                <a href={epk.audio[0].value} target="_blank" rel="noreferrer" className={linkClass()}>
                  Listen
                </a>
              )}
            </div>
          </div>
        </div>
        {hero?.credit && (
          <span className="absolute top-3 right-3 text-xs text-body bg-canvas/80 px-2 py-1 rounded">Photo: {hero.credit}</span>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-10 lg:px-20 py-10 sm:py-14 space-y-12 sm:space-y-16">
        {(epk.videos.length > 0 || epk.audio.length > 0) && (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {epk.videos.length > 0 && (
              <div id="live">
                <Section title="Live">
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
                        <a href={v.value} target="_blank" rel="noreferrer" className="text-info-fg underline">
                          {v.label}
                        </a>
                        {/* The address, printed — a link is useless on paper. */}
                        <span className="hidden print:inline text-xs text-muted"> — {v.value}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
            {epk.audio.length > 0 && (
              <Section title="Music">
                <ol className="divide-y divide-line border-y border-line">
                  {epk.audio.map((a, i) => (
                    <li key={a.value} className="flex items-center gap-3 py-3">
                      <span className="w-5 text-right text-faint text-sm">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <a href={a.value} target="_blank" rel="noreferrer" className="text-ink hover:underline">
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

        {(epk.bios.length > 0 || glance.length > 0) && (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {epk.bios.length > 0 && (
              <Section title="About">
                <Bio bios={epk.bios} />
              </Section>
            )}
            {glance.length > 0 && (
              <aside className="rounded-xl border border-line bg-surface p-5 space-y-3 h-fit break-inside-avoid">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">At a glance</h3>
                <dl className="space-y-2.5">
                  {glance.map((f) => (
                    <div key={f.label} className="flex justify-between gap-4 text-sm border-b border-line pb-2.5">
                      <dt className="text-muted">{f.label}</dt>
                      <dd className="text-ink text-right">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            )}
          </div>
        )}

        {(shows.upcoming.length > 0 || shows.past.length > 0) && (
          <Section title="Shows">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {shows.upcoming.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">Upcoming</h3>
                  <ul>{shows.upcoming.map((s) => <ShowRow key={s.key} show={s} />)}</ul>
                </div>
              )}
              {shows.past.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">Recently played</h3>
                  <ul>{shows.past.map((s) => <ShowRow key={s.key} show={s} />)}</ul>
                </div>
              )}
            </div>
          </Section>
        )}

        {epk.photos.length > 0 && (
          <Section title="Press photos">
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {epk.photos.map((p) => (
                <li key={p.value} className="space-y-1.5 break-inside-avoid">
                  <a href={p.value} target="_blank" rel="noreferrer" referrerPolicy="no-referrer" className="block">
                    <img src={p.value} alt={p.label} referrerPolicy="no-referrer" loading="lazy" className="w-full aspect-[4/5] object-cover rounded-lg bg-raised" />
                  </a>
                  <p className="text-xs text-muted">Photo: {p.credit}</p>
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

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-10 lg:px-20 py-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <nav aria-label="Artist links" className="flex flex-wrap gap-x-5 gap-y-2">
            {epk.links.map((l) => (
              <a key={l.value} href={l.value} target="_blank" rel="noreferrer" className="text-info-fg hover:underline">
                {l.label}
                <span className="hidden print:inline text-xs text-muted"> ({l.value})</span>
              </a>
            ))}
          </nav>
          <p className="text-xs text-faint">Kept current with Sun Dogs Music Scout</p>
        </div>
      </footer>
    </article>
  )
}
