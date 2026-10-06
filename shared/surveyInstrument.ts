/**
 * The artist survey, as data: every word a respondent reads, and the shape of
 * every answer. The reasoning behind each choice is in
 * `docs/artist-survey-questionnaire.md`; this file is that document made
 * executable, and `test/surveyInstrument.test.ts` holds it to the rules the
 * document sets itself.
 *
 * **Anything a respondent reads says Sun Dogs Music, never "Scout" on its own.**
 * The bare word is the mark this product avoids (see CLAUDE.md). A test fails if
 * it appears in any string below.
 *
 * Text is stored per language (`Text`), with English the only one filled in. French is
 * meant to be a drop-in once the English wording has settled after the
 * read-through, so ids are stable and nothing is built from a string.
 */

export const INSTRUMENT_VERSION = '2026-10-a'

export type Lang = 'en'
export interface Text {
  en: string
  fr?: string
}

export function tx(text: Text, lang: Lang = 'en'): string {
  return text[lang] ?? text.en
}

// ── Questions ─────────────────────────────────────────────────────────────────

export interface ChoiceOption {
  id: string
  text: Text
  /** Choosing it clears the others: "None of these", "Prefer not to say". */
  exclusive?: boolean
  /** Reveals an optional text box ("Other, please specify"). */
  other?: boolean
  /** Stays where it is when the list is shuffled: Other, None, Prefer not to say. */
  anchor?: boolean
}

export type SectionId = 'screen' | 'music' | 'recent' | 'about'

interface QuestionBase {
  id: string
  section: SectionId
  prompt: Text
  help?: Text
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'single' | 'multi' | 'select'
  options: ChoiceOption[]
  /** Shuffle the options per respondent. Ordinal and alphabetical lists never do. */
  shuffle?: boolean
  /** The analysis needs it, so everybody is asked. It is never forced. */
  core?: boolean
}

export interface TextQuestion extends QuestionBase {
  kind: 'text'
  maxLength: number
}

export type Question = ChoiceQuestion | TextQuestion

/** [id, English text, flags]: x exclusive, o other (text box), a anchored. */
type OptionSpec = [string, string, string?]

function options(questionId: string, specs: OptionSpec[]): ChoiceOption[] {
  return specs.map(([id, en, flags = '']) => ({
    id: `${questionId}.${id}`,
    text: { en },
    ...(flags.includes('x') ? { exclusive: true } : {}),
    ...(flags.includes('o') ? { other: true } : {}),
    ...(flags.includes('a') ? { anchor: true } : {}),
  }))
}

const PREFER_NOT: OptionSpec = ['pnts', 'Prefer not to say', 'xa']

/** The id of the one option on S1 that continues. Everything else is thanked and stopped. */
export const SCREEN_IN = 'S1.artist'

export const QUESTIONS: Question[] = [
  {
    id: 'S1',
    section: 'screen',
    kind: 'single',
    prompt: { en: 'Which of these describes you?' },
    options: options('S1', [
      ['artist', 'I perform or release music in Canada, solo or in a band, and I decide or help decide which opportunities to go for.'],
      ['rep', 'I manage, book or represent artists, but I am not the artist.'],
      ['neither', 'Neither of these.'],
    ]),
  },

  // ── A. About your music ─────────────────────────────────────────────────────
  {
    id: 'A1',
    section: 'music',
    kind: 'select',
    core: true,
    prompt: { en: 'Where do you live?' },
    options: options('A1', [
      ['ab', 'Alberta'],
      ['bc', 'British Columbia'],
      ['mb', 'Manitoba'],
      ['nb', 'New Brunswick'],
      ['nl', 'Newfoundland and Labrador'],
      ['nt', 'Northwest Territories'],
      ['ns', 'Nova Scotia'],
      ['nu', 'Nunavut'],
      ['on', 'Ontario'],
      ['pe', 'Prince Edward Island'],
      ['qc', 'Quebec'],
      ['sk', 'Saskatchewan'],
      ['yt', 'Yukon'],
      ['abroad', 'I live outside Canada'],
    ]),
  },
  {
    id: 'A2',
    section: 'music',
    kind: 'single',
    core: true,
    prompt: { en: 'How long have you been performing or releasing music publicly?' },
    options: options('A2', [
      ['lt2', 'Less than 2 years'],
      ['2to5', '2 to 5 years'],
      ['6to10', '6 to 10 years'],
      ['11to20', '11 to 20 years'],
      ['gt20', 'More than 20 years'],
    ]),
  },
  {
    id: 'A3',
    section: 'music',
    kind: 'single',
    core: true,
    prompt: { en: 'How do you usually perform?' },
    options: options('A3', [
      ['solo', 'Solo'],
      ['duo', 'As a duo'],
      ['group', 'In a group of 3 or more'],
      ['varies', 'It depends on the show'],
      ['other', 'Other (please specify)', 'o'],
    ]),
  },
  {
    id: 'A4',
    section: 'music',
    kind: 'select',
    core: true,
    prompt: { en: 'Which genre best describes most of your music?' },
    options: options('A4', [
      ['indie', 'Alternative or indie'],
      ['blues', 'Blues'],
      ['kids', "Children's"],
      ['classical', 'Classical or contemporary classical'],
      ['country', 'Country'],
      ['electronic', 'Electronic or dance'],
      ['folk', 'Folk, roots or singer-songwriter'],
      ['hiphop', 'Hip-hop or rap'],
      ['jazz', 'Jazz'],
      ['metal', 'Metal, punk or hardcore'],
      ['pop', 'Pop'],
      ['rnb', 'R&B or soul'],
      ['rock', 'Rock'],
      ['world', 'World or global'],
      ['other', 'Another genre (please specify)', 'o'],
    ]),
  },
  {
    id: 'A5',
    section: 'music',
    kind: 'single',
    core: true,
    prompt: { en: 'How would you describe your work in music?' },
    options: options('A5', [
      ['main', 'It is my main job'],
      ['major', 'A major part of my work, alongside other work'],
      ['side', 'A side activity alongside other work or study'],
      ['hobby', 'A hobby or occasional'],
    ]),
  },
  {
    id: 'A6',
    section: 'music',
    kind: 'single',
    core: true,
    prompt: { en: 'In the last 12 months, about how many live shows did you play?' },
    options: options('A6', [
      ['none', 'None'],
      ['1to5', '1 to 5'],
      ['6to15', '6 to 15'],
      ['16to40', '16 to 40'],
      ['gt40', 'More than 40'],
    ]),
  },
  {
    id: 'A7',
    section: 'music',
    kind: 'multi',
    shuffle: true,
    prompt: { en: 'Who helps you find or apply for opportunities?' },
    options: options('A7', [
      ['manager', 'A manager'],
      ['agent', 'A booking agent'],
      ['label', 'A label or publisher'],
      ['publicist', 'A publicist'],
      ['friend', 'A bandmate or friend'],
      ['self', 'No one, I do it myself', 'xa'],
      ['other', 'Other (please specify)', 'oa'],
    ]),
  },
  {
    id: 'A8',
    section: 'music',
    kind: 'single',
    prompt: { en: 'What language are most of your songs or lyrics in?' },
    options: options('A8', [
      ['en', 'English'],
      ['fr', 'French'],
      ['indigenous', 'An Indigenous language'],
      ['other', 'Another language (please specify)', 'o'],
      ['several', 'About equally in more than one'],
      ['instrumental', 'Mostly instrumental'],
    ]),
  },

  // ── B. What you did recently ────────────────────────────────────────────────
  {
    id: 'B1',
    section: 'recent',
    kind: 'single',
    core: true,
    prompt: { en: 'In the last 12 months, about how many opportunities did you apply or submit for?' },
    help: {
      en: 'Count festivals, showcases, conferences, grants, venue bookings and similar. Do not count things you were simply invited to.',
    },
    options: options('B1', [
      ['none', 'None'],
      ['1to2', '1 or 2'],
      ['3to5', '3 to 5'],
      ['6to10', '6 to 10'],
      ['11to20', '11 to 20'],
      ['gt20', 'More than 20'],
    ]),
  },
  {
    id: 'B2',
    section: 'recent',
    kind: 'multi',
    shuffle: true,
    prompt: { en: 'Which kinds of opportunity were those?' },
    help: { en: 'Select all that apply.' },
    options: options('B2', [
      ['festival', 'Festivals'],
      ['showcase', 'Showcases (events where industry people come to watch artists play)'],
      ['conference', 'Conferences or industry events'],
      ['venue', 'Venue bookings or residencies'],
      ['grant', 'Grants or funding'],
      ['award', 'Competitions or awards'],
      ['media', 'Radio, playlist or media pitches'],
      ['sync', 'Sync (placing music in film, TV, games or ads)'],
      ['other', 'Other (please specify)', 'oa'],
      ['none', 'None of these', 'xa'],
    ]),
  },
  {
    id: 'B3',
    section: 'recent',
    kind: 'multi',
    shuffle: true,
    prompt: { en: 'How do you usually find opportunities?' },
    help: { en: 'Select all that apply.' },
    options: options('B3', [
      ['peers', 'Other artists or friends'],
      ['assoc', 'Newsletters or websites from a music association'],
      ['social', 'Social media'],
      ['search', 'Search or listing websites'],
      ['invited', 'Invitations sent to me directly'],
      ['helper', 'A manager, agent or other helper'],
      ['app', 'An app or service that finds them for me'],
      ['other', 'Other (please specify)', 'oa'],
      ['nolook', 'I do not actively look', 'xa'],
    ]),
  },
  {
    id: 'B4',
    section: 'recent',
    kind: 'single',
    shuffle: true,
    core: true,
    prompt: {
      en: 'Think of the most recent opportunity you could have applied for but chose not to. What was the main reason?',
    },
    options: options('B4', [
      ['pay', 'The pay or fee was too low'],
      ['fee', 'The cost to apply was too high'],
      ['effort', 'The application would have taken too long'],
      ['travel', 'Travel and lodging would have cost too much'],
      ['time', 'It would have kept me away from home or other work for too long'],
      ['audience', 'The audience would have been too small'],
      ['industry', 'None of the people who could hire me again would have been there'],
      ['fit', 'It was not a good fit for my music'],
      ['odds', 'My chances of being selected seemed too low'],
      ['repute', 'I was not convinced the event was well known or respected enough'],
      ['treat', 'I had doubts about how the organisers treat artists'],
      ['goals', 'It would not have helped me toward my goals'],
      ['dates', 'The dates did not work'],
      ['late', 'I missed the deadline, or heard about it too late'],
      ['other', 'Other (please specify)', 'oa'],
      ['none', 'I cannot think of one', 'a'],
    ]),
  },
  {
    id: 'B5',
    section: 'recent',
    kind: 'single',
    shuffle: true,
    core: true,
    prompt: {
      en: 'Now think of the most recent opportunity you did apply for. What was the main reason you went for it?',
    },
    options: options('B5', [
      ['pay', 'The pay or fee was good'],
      ['cheap', 'It was free or cheap to apply, and quick'],
      ['travel', 'Travel and lodging would cost me little, or were covered'],
      ['time', 'It would take little time away from home or other work'],
      ['audience', 'The audience was a good size'],
      ['industry', 'People who could hire me again were going to be there'],
      ['fit', 'It suited my kind of music'],
      ['odds', 'I thought I had a good chance of being selected'],
      ['repute', 'It is well known or respected'],
      ['treat', 'The organisers have a good record with artists'],
      ['goals', 'It would help me toward my goals'],
      ['recommended', 'Someone I know recommended it, or was involved'],
      ['other', 'Other (please specify)', 'oa'],
      ['none', 'I cannot think of one', 'a'],
    ]),
  },

  // ── E. About you (all optional) ─────────────────────────────────────────────
  {
    id: 'E1',
    section: 'about',
    kind: 'single',
    core: true,
    prompt: { en: 'What is your age?' },
    options: options('E1', [
      ['lt25', 'Under 25'],
      ['25to34', '25 to 34'],
      ['35to44', '35 to 44'],
      ['45to54', '45 to 54'],
      ['55to64', '55 to 64'],
      ['65p', '65 or older'],
      PREFER_NOT,
    ]),
  },
  {
    id: 'E2',
    section: 'about',
    kind: 'single',
    prompt: { en: 'What is your gender?' },
    options: options('E2', [
      ['woman', 'Woman'],
      ['man', 'Man'],
      ['nonbinary', 'Non-binary'],
      ['self', 'Prefer to self-describe', 'o'],
      PREFER_NOT,
    ]),
  },
  {
    id: 'E3',
    section: 'about',
    kind: 'multi',
    prompt: { en: 'Do any of these describe you?' },
    help: { en: 'Select all that apply.' },
    options: options('E3', [
      ['indigenous', 'Indigenous (First Nations, Métis or Inuit)'],
      ['francophone', 'Francophone'],
      ['black_poc', 'Black and/or a person of colour'],
      ['deaf', 'D/deaf, deafened or hard of hearing'],
      ['disability', 'Living with a disability (physical, mental or intellectual)'],
      ['2slgbtq', 'Two-Spirit, lesbian, gay, bisexual, transgender, queer, or part of the 2SLGBTQ+ community in another way'],
      ['newcomer', 'New to Canada (landed within the last 5 years)'],
      ['other_community', 'Part of another community that faces barriers in the music industry'],
      ['none', 'None of these', 'x'],
      ['pnts', 'Prefer not to say', 'x'],
    ]),
  },
  {
    id: 'E4',
    section: 'about',
    kind: 'single',
    core: true,
    prompt: { en: 'About how much did you earn from all your music work in the last 12 months, before expenses?' },
    help: {
      en: 'Include performing, teaching music, royalties, grants and merchandise. If you are in a group, count your own share.',
    },
    options: options('E4', [
      ['lt2500', 'Under $2,500'],
      ['2500to9999', '$2,500 to $9,999'],
      ['10kto24999', '$10,000 to $24,999'],
      ['25kto49999', '$25,000 to $49,999'],
      ['50kp', '$50,000 or more'],
      PREFER_NOT,
    ]),
  },
  {
    id: 'E5',
    section: 'about',
    kind: 'text',
    maxLength: 500,
    prompt: {
      en: 'Is there anything that matters to you when you decide which opportunities to go for that we did not mention?',
    },
    help: { en: 'Optional. Please do not include your name or anything that identifies you.' },
  },
]

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))

export function questionOf(id: string): Question | undefined {
  return BY_ID.get(id)
}

export function optionOf(question: ChoiceQuestion, optionId: string): ChoiceOption | undefined {
  return question.options.find((o) => o.id === optionId)
}

// ── Ranking: thirteen things that might matter ────────────────────────────────

export interface Factor {
  id: string
  text: Text
}

/** Short, parallel and one idea each. Their order here is the reference order, never the displayed one. */
export const FACTORS: Factor[] = [
  { id: 'f01', text: { en: 'How much it pays if I am selected' } },
  { id: 'f02', text: { en: 'What it costs to apply (entry or submission fee)' } },
  { id: 'f03', text: { en: 'How much time and effort the application takes' } },
  { id: 'f04', text: { en: 'What it would cost me to get there and stay (travel, lodging, meals)' } },
  { id: 'f05', text: { en: 'How long it would keep me away from home or other work' } },
  { id: 'f06', text: { en: 'How many people I would play to' } },
  { id: 'f07', text: { en: 'Whether people who could hire me again would be there (bookers, agents, programmers)' } },
  { id: 'f08', text: { en: 'How well it fits my kind of music' } },
  { id: 'f09', text: { en: 'How good my chances of being selected seem' } },
  { id: 'f10', text: { en: 'How well known or respected the event is' } },
  { id: 'f11', text: { en: 'How the organisers treat artists (clear terms, replies, fair treatment)' } },
  { id: 'f12', text: { en: 'Whether it helps me reach new audiences' } },
  { id: 'f13', text: { en: 'Whether I would get a proper set (length, sound, a good slot)' } },
]

// ── Paired choices: two made-up opportunities ─────────────────────────────────

export interface AttributeLevel {
  /** The index stored in a design, 0 to levels - 1. */
  text: Text
  /** Dollars, for the three attributes measured in them. */
  dollars?: number
}

export interface Attribute {
  id: string
  label: Text
  /** Which end is better for the respondent, used to find a dominated pair. */
  better: 'higher' | 'lower'
  levels: AttributeLevel[]
}

/** Six things, in the reference order. A respondent sees them in a shuffled order that never changes within their survey. */
export const ATTRIBUTES: Attribute[] = [
  {
    id: 'pay',
    label: { en: 'Pay if selected' },
    better: 'higher',
    levels: [
      { text: { en: '$0 (exposure only)' }, dollars: 0 },
      { text: { en: '$300' }, dollars: 300 },
      { text: { en: '$750' }, dollars: 750 },
      { text: { en: '$1,500' }, dollars: 1500 },
    ],
  },
  {
    id: 'fee',
    label: { en: 'Cost to apply' },
    better: 'lower',
    levels: [
      { text: { en: 'Free' }, dollars: 0 },
      { text: { en: '$20' }, dollars: 20 },
      { text: { en: '$40' }, dollars: 40 },
      { text: { en: '$75' }, dollars: 75 },
    ],
  },
  {
    id: 'travel',
    label: { en: 'Your out-of-pocket cost to get there and stay' },
    better: 'lower',
    levels: [
      { text: { en: '$0' }, dollars: 0 },
      { text: { en: '$150' }, dollars: 150 },
      { text: { en: '$500' }, dollars: 500 },
      { text: { en: '$1,200' }, dollars: 1200 },
    ],
  },
  {
    id: 'audience',
    label: { en: 'People in the audience' },
    better: 'higher',
    levels: [
      { text: { en: 'About 100' } },
      { text: { en: 'About 500' } },
      { text: { en: 'About 2,000' } },
      { text: { en: 'About 10,000' } },
    ],
  },
  {
    id: 'industry',
    label: { en: 'People there who could hire you again' },
    better: 'higher',
    levels: [{ text: { en: 'Few or none' } }, { text: { en: 'Some' } }, { text: { en: 'Many' } }],
  },
  {
    id: 'effort',
    label: { en: 'Time the application takes' },
    better: 'lower',
    levels: [
      { text: { en: 'About 15 minutes' } },
      { text: { en: 'About 1 hour' } },
      { text: { en: 'About 3 hours' } },
    ],
  },
]

// ── Screens with no answer: the welcome, the part introductions, the close ────

export const INTROS: Record<'B' | 'C' | 'D' | 'E', { title: Text; body: Text[] }> = {
  B: {
    title: { en: 'What you did recently' },
    body: [
      { en: 'These questions are about what you actually did, not what you would ideally do. If a question does not apply, there is an answer for that.' },
    ],
  },
  C: {
    title: { en: 'Deciding what is worth it' },
    body: [
      { en: 'Imagine you have found an opportunity you are eligible for, and you are deciding whether it is worth your time to apply.' },
      { en: 'On each of the next screens you will see four things that might matter. Choose the one that matters most to you in that decision, and the one that matters least. There are no right answers, and some choices will be hard. That is expected.' },
    ],
  },
  D: {
    title: { en: 'Choosing between two opportunities' },
    body: [
      { en: 'Now we will show you two made-up opportunities side by side. Which would you rather apply to?' },
      { en: 'If neither appeals to you, choose Neither. Assume everything that is not shown is the same: your music suits both, and the dates work.' },
    ],
  },
  E: {
    title: { en: 'About you' },
    body: [
      { en: 'The last few questions are optional. They help us see whether artists in different situations weigh things differently, and who this survey did and did not reach.' },
      { en: 'We never show one person’s answers, and we do not report on any group of fewer than 10 people. Skip any you would rather not answer.' },
    ],
  },
}

/**
 * The welcome, shown one paragraph to a screen (`shared/surveyConsent.ts`): the
 * title, lede and intro first, then each point under its own heading, then the
 * agreement. `{contact}` and `{results}` are filled in from the deployment's
 * configuration at the last moment, and the survey does not open until a contact
 * address exists: the notice promises one.
 *
 * A point's `lead` is its screen's heading, so it is a whole sentence.
 */
export const CONSENT = {
  title: { en: 'Which opportunities are worth an artist’s time?' } as Text,
  lede: { en: 'A survey for musicians and bands working in Canada. About 10 minutes.' } as Text,
  intro: {
    en: 'Sun Dogs Music, a small company in Winnipeg, is building tools to help artists find and keep track of opportunities: festivals, showcases, grants, venue bookings. Before we decide what a tool should pay attention to, we want to learn how artists actually decide what is worth applying for.',
  } as Text,
  points: [
    { lead: 'There are no right answers.', body: 'We want how you really decide, not how you think you should.' },
    {
      lead: 'It is anonymous.',
      body: 'We do not ask for your name or email, and we do not store your IP address. To keep out spam, the page runs a Cloudflare check that does see your IP address while it runs; we do not receive or keep it. The questions at the end about age, identity and income are optional, and each has “Prefer not to say”.',
    },
    {
      lead: 'Your answers are saved as you go.',
      body:'If you stop, what you have answered stays, anonymously. Your browser keeps a random code, and nothing else, so you can pick up where you left off. You can choose Close without saving at any time to delete it. Once you finish, we cannot find your answers again, because nothing connects them to you, so they cannot be taken back after that.',
    },
    {
      lead: 'Here is what happens to your answers.',
      body:'We combine answers across artists and publish a summary of the results{results}. We never publish one person’s answers, or the answers of any small group.',
    },
    { lead: 'It is voluntary.', body: 'There is no payment and no prize draw.' },
  ].map(({ lead, body }) => ({ lead: { en: lead } as Text, body: { en: body } as Text })),
  questions: { en: 'Questions: {contact}' } as Text,
  /** The heading of the last screen, the one with the checkbox. */
  confirm: { en: 'One last thing before you start.' } as Text,
  agree: { en: 'I am 18 or older and happy to take part.' } as Text,
}

export const THANKS = {
  done: {
    title: { en: 'Thank you' } as Text,
    body: [
      { en: 'Your answers are in, and they are anonymous.' },
      { en: 'Know another artist who might want to take part? Passing this link on helps.' },
    ] as Text[],
  },
  /** For S1's "I manage or represent artists" and "Neither". */
  screenedOut: {
    title: { en: 'Thank you for your time' } as Text,
    body: [
      { en: 'This survey is about how artists themselves decide which opportunities to go for, so it is not the right fit for you this time.' },
      { en: 'A version for managers, agents and bookers may follow.' },
    ] as Text[],
  },
  closed: {
    title: { en: 'This survey is not open right now' } as Text,
    body: [{ en: 'Thank you for your interest. Please check back later.' }] as Text[],
  },
}

/** How a part is named at the top of its screens. */
export const PART_NAMES = {
  music: { en: 'About your music' } as Text,
  recent: { en: 'What you did recently' } as Text,
  rank: { en: 'What matters most and least' } as Text,
  choice: { en: 'Choosing between two opportunities' } as Text,
  about: { en: 'About you' } as Text,
}
export type PartId = keyof typeof PART_NAMES
