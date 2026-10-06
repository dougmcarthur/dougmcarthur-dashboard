import {
  alignedSentence,
  leadersSentence,
  moverSentence,
  reasonSentence,
  routeSentence,
  trailersSentence,
  valueSentence,
  type PublicQuestion,
  type PublicResults,
} from '../../../../../shared/surveyPublic'
import { Button } from '../../../components/ui/Button'
import { Banner, Card } from '../../../components/ui/Surface'
import { BarList } from './BarList'
import { ForestPlot, RatioTile } from './DollarCharts'
import { pct, publishedOn } from './format'
import { heroLines } from './hero'
import { Figure, Section, TableTwin } from './Marks'
import { RankingChart } from './RankingChart'
import { SayDoChart } from './SayDoChart'

/**
 * The artist survey's summary, as one page.
 *
 * It renders a stored snapshot and computes nothing from the responses: the
 * public page and the owner's preview are this same component over the same
 * object, so what was reviewed is what is shown. Every section is headed by what
 * it found, in a sentence that comes from `shared/surveyPublic.ts` and is the
 * same sentence as the one in the "In short" list. A heading therefore cannot be
 * firmer than the finding it summarises.
 *
 * Everything on it is written as whole sentences: no caption that is the tail of
 * a number, no lede that has no verb. The generated ones are tested; the rest is
 * here, and reads the way it is meant to be read aloud.
 *
 * It names the company and no product, and nobody and no group under ten.
 */

function QuestionCard({ q, lead }: { q: PublicQuestion; lead: number }) {
  return (
    <Card pad="md" className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-ink">{q.title}</h3>
        <p className="text-xs italic leading-snug text-muted">“{q.question}”</p>
        <p className="text-xs leading-snug text-muted">
          The bars show the share of the {q.base} artists who answered{q.multi ? ', and each could choose more than one answer' : ''}.
        </p>
      </div>
      <BarList bars={q.bars} lead={lead} label={q.title} />
      {q.hidden > 0 && (
        <p className="text-xs text-faint">
          {q.hidden === 1 ? 'One more answer was' : `${q.hidden} more answers were`} chosen by fewer than 10 artists, so {q.hidden === 1 ? 'it is' : 'they are'} not shown.
        </p>
      )}
      <TableTwin
        caption={q.title}
        head={['Answer', 'Share of artists']}
        align={[1]}
        rows={q.bars.map((b) => [b.label, b.share === null ? 'Fewer than 10 artists' : pct(b.share)])}
      />
    </Card>
  )
}

function leftOutNote(r: PublicResults): string | null {
  if (r.leftOut.count === 0) return null
  const why = [r.leftOut.failedCheck && 'missed the attention check', r.leftOut.speeders && 'finished in under a third of the usual time'].filter(Boolean)
  return `${r.leftOut.count} completed ${r.leftOut.count === 1 ? 'response was' : 'responses were'} left out because the artist ${why.join(' or ')}.`
}

export function ResultsView({ results: r, contact, open = false }: { results: PublicResults; contact?: string | null; open?: boolean }) {
  const leftOut = leftOutNote(r)
  const fee = r.choices?.ratios.find((x) => x.key === 'fee')
  const travel = r.choices?.ratios.find((x) => x.key === 'travel')
  const hero = heroLines(r)

  return (
    <article className="space-y-16 sm:space-y-20">
      <header className="space-y-5">
        <h1 className="max-w-3xl text-3xl sm:text-5xl font-semibold leading-tight tracking-tight text-ink text-balance">
          How artists decide what is worth applying for
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-body">
          This is what {r.n} artists said they weigh, what they would trade, and what actually stopped them from applying.
        </p>

        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          {hero.map((line, i) => (
            <Figure key={line.figure + i} hero={i === 0} figure={line.figure} rest={line.rest} />
          ))}
        </div>

        {r.early && (
          <Banner tone="info">
            <strong className="font-semibold">These are early results.</strong> {r.n} artists have answered so far, and the aim is {r.target}. Read the order as a first look. The
            shaded ranges on each chart show how far to trust each number, and they will narrow as more artists answer.
          </Banner>
        )}
      </header>

      {r.findings.length > 0 && (
        <Card as="section" pad="md" aria-labelledby="short-title">
          <h2 id="short-title" className="text-xl font-semibold tracking-tight text-ink">
            In short
          </h2>
          <ol className="mt-4 space-y-4">
            {r.findings.map((f, i) => (
              <li key={f} className="flex gap-3">
                <span className="w-5 shrink-0 pt-px text-base tabular-nums text-faint">{i + 1}.</span>
                <p className="text-base leading-relaxed text-ink">{f}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {r.ranking && (
        <Section
          id="matters"
          title={leadersSentence(r.ranking) ?? 'No single thing stands clear of the pack yet.'}
          lede={
            <>
              {trailersSentence(r.ranking) && <p className="mb-2 font-medium text-ink">{trailersSentence(r.ranking)}</p>}
              <p>
                Artists saw four things at a time and picked the one that matters most to them and the one that matters least. Each bar shows how often a thing was picked as
                most important, minus how often it was picked as least important, in percentage points.
              </p>
            </>
          }
        >
          <Card pad="md">
            <RankingChart rows={r.ranking} />
          </Card>
        </Section>
      )}

      <Section
        id="worth"
        title={valueSentence(r.choices) ?? 'There is not enough data yet to put dollars on anything.'}
        lede={
          r.choices
            ? 'Artists chose between pairs of made-up opportunities. Because the pay changed from one pair to the next, everything else can be priced in dollars of pay, meaning how much extra pay would make up for it.'
            : undefined
        }
      >
        {r.choices ? (
          <div className="space-y-4">
            {(fee || travel) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fee && <RatioTile ratio={fee} noun="entry fee" />}
                {travel && <RatioTile ratio={travel} noun="travel and lodging" />}
              </div>
            )}
            <Card pad="md">
              <ForestPlot values={r.choices.values} />
            </Card>
          </div>
        ) : (
          <Banner tone="info">
            There are not enough paired answers yet to put a dollar value on anything. A price in dollars of pay needs the effect of pay itself to be clearly measured first. A
            price built on a pay effect that cannot be told from zero would be the most confident-looking wrong number a survey can produce, so none is shown. Prices will appear when
            more artists have answered.
          </Banner>
        )}
      </Section>

      {(r.stop || r.apply) && (
        <Section
          id="did"
          title={reasonSentence(r.stop) ?? 'Here is why artists pass on opportunities, and why they go for them.'}
          lede="Opinions about what matters are one thing. These are the reasons artists gave for what they actually did, the last time they passed on an opportunity and the last time they went for one."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {r.stop && <QuestionCard q={r.stop} lead={3} />}
            {r.apply && <QuestionCard q={r.apply} lead={3} />}
          </div>
        </Section>
      )}

      {r.sayDo && (
        <Section
          id="saydo"
          title={moverSentence(r.sayDo) ?? alignedSentence(r.sayDo) ?? 'Here is what artists say matters, next to what actually stops them.'}
          lede="This sets what artists said matters beside the reasons they gave for passing. Where a line is flat, the things artists say matter are the things that stop them. Where a line is steep, a thing matters more, or less, in a real decision than artists say it does."
        >
          <Card pad="md">
            <SayDoChart data={r.sayDo} />
          </Card>
        </Section>
      )}

      {r.find && (
        <Section
          id="find"
          title={routeSentence(r.find) ?? 'Here is how artists find opportunities.'}
          lede="Where opportunities come from decides which ones an artist ever gets the chance to weigh."
        >
          <QuestionCard q={r.find} lead={3} />
        </Section>
      )}

      {r.sample.length > 0 && (
        <Section
          id="who"
          title="These are the artists the link reached."
          lede="Read the results as how these artists decide, not as what artists in general want. Here is who they are, in the few ways it is safe to say."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {r.sample.map((q) => (
              <QuestionCard key={q.id} q={q} lead={0} />
            ))}
          </div>
        </Section>
      )}

      <Section id="limits" title="Here is what this survey can and cannot tell you.">
        <Card pad="md">
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {[
              [
                'What a range means',
                'Every number comes with the range it probably sits in. A narrow range means the artists mostly agreed. A wide one means they did not, or that not enough have answered yet. Where two ranges overlap, this page does not say one is ahead of the other.',
              ],
              [
                'How the questions worked',
                'In the first kind, artists saw four things at a time and picked the one that matters most and the one that matters least, on nine screens. In the second, they chose between two made-up opportunities, or neither, eight times.',
              ],
              [
                'What it cannot say',
                'It does not say what artists in general want, only what these artists chose. It does not say why anybody chose anything. Made-up opportunities are not real ones, so the dollar figures are a guide to a trade-off and not a price list.',
              ],
              [
                'Whose answers these are',
                'Nobody was asked for a name or an email, and no address was kept. Nothing here is one person’s answers, and nothing is shown for any group of fewer than 10 artists, which is why some answers are combined or left out.',
              ],
            ].map(([term, text]) => (
              <div key={term}>
                <dt className="text-sm font-semibold text-ink">{term}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-body">{text}</dd>
              </div>
            ))}
          </dl>
          {leftOut && <p className="mt-6 border-t border-line pt-4 text-xs text-muted">{leftOut}</p>}
        </Card>
      </Section>

      <footer className="space-y-5 border-t border-line pt-8 text-sm text-muted">
        <p className="max-w-2xl text-base leading-relaxed text-body">
          Thank you to every artist who took part. This is what you told us, and it is the return for your ten minutes.
          {open && ' The survey is still open, if you know an artist who would like to take part.'}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {open && (
            <Button variant="primary" size="lg" onClick={() => (window.location.hash = 'survey')}>
              Take the survey
            </Button>
          )}
          {contact && (
            <p>
              Questions about this survey? Write to{' '}
              <a className="underline transition-colors hover:text-ink" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </p>
          )}
        </div>
        <p className="text-xs text-faint">
          Sun Dogs Music published this on {publishedOn(r.publishedAt)}, from {r.n} completed responses to version {r.instrument} of the survey.
        </p>
      </footer>
    </article>
  )
}
