// Every application form asks the same two dozen questions in different words.
// This maps a parsed field onto a canonical "kind" so an answer approved on one
// application can be reused on the next.
//
// Pure and ordered: the first matching kind wins, so specific patterns
// ("why this festival") must sit above general ones ("tell us about you").

export type QuestionCategory = 'identity' | 'links' | 'story' | 'pitch' | 'logistics'

export interface QuestionKind {
  key: string
  /** Canonical label used when this kind becomes a library entry. */
  label: string
  category: QuestionCategory
  /** True when the right answer depends on the space available (bios, pitches). */
  lengthSensitive: boolean
  /**
   * How a stored answer may be reused. 'verbatim' is safe to drop straight in;
   * 'adapt' answers name the event they were written for, so they're a starting
   * point to retarget rather than text to paste into the next application.
   */
  reuse: 'verbatim' | 'adapt'
  match: RegExp
  exclude?: RegExp
}

export const QUESTION_KINDS: QuestionKind[] = [
  // ── Links (most specific — these words also appear in generic link fields) ──
  { key: 'spotify', label: 'Spotify link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /spotify/i },
  { key: 'apple_music', label: 'Apple Music link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /apple ?music|itunes/i },
  { key: 'bandcamp', label: 'Bandcamp link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /bandcamp/i },
  { key: 'soundcloud', label: 'SoundCloud link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /sound ?cloud/i },
  { key: 'youtube', label: 'YouTube / video link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /you ?tube|youtu\.be|video (link|url)|live (video|performance) (link|url)|link to.*video/i },
  { key: 'instagram', label: 'Instagram', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /instagram|\big\b/i },
  { key: 'facebook', label: 'Facebook', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /facebook|\bfb\b/i },
  { key: 'tiktok', label: 'TikTok', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /tik ?tok/i },
  { key: 'epk', label: 'EPK / press kit link', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /epk|press ?kit|electronic press/i },
  { key: 'website', label: 'Website', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /web ?site|homepage|artist (url|link)|^url$|your (site|url)/i },
  { key: 'socials', label: 'Social media handles', category: 'links', lengthSensitive: false, reuse: 'verbatim', match: /social (media|links|handles)|socials/i },

  // ── Identity ──
  { key: 'artist_name', label: 'Artist / band name', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /\b(artist|band|act|performer|project|stage|group)('s)? name|^(artist|band|act)$|name of (the )?(artist|band|act)/i },
  { key: 'contact_name', label: 'Contact name', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /contact (name|person)|your (full )?name|first name|last name|legal name|^name$/i },
  { key: 'email', label: 'Email address', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /e-?mail/i },
  { key: 'phone', label: 'Phone number', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /phone|mobile|cell|telephone/i },
  // The loose words are bounded, and every one of them had a victim: `town`
  // matched "Bandsintown", and `state` matched "Artist Statement" — which,
  // because identity is tested before story, meant a form asking for an
  // artist statement was answered with a hometown. Found by the artist
  // database sourcing, which classifies a document's headings through here.
  { key: 'hometown', label: 'Hometown / based in', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /home ?town|\bcity\b|\btown\b|based (in|out of)|\blocation\b|\bprovince\b|\bstate\b|\bcountry\b|\bregion\b|where are you from/i },
  { key: 'genre', label: 'Genre', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /genre|style of music|music (type|category)|sounds like|category/i },
  { key: 'lineup', label: 'Line-up / band members', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /line ?up|band members|number of (performers|musicians|people)|how many (people|performers|musicians)|personnel/i },
  { key: 'management', label: 'Management / booking contact', category: 'identity', lengthSensitive: false, reuse: 'verbatim', match: /manager|management|booking (agent|contact)|agent|representation/i },

  // ── Pitch (must precede the generic bio patterns) ──
  { key: 'why_this_event', label: 'Why this event', category: 'pitch', lengthSensitive: true, reuse: 'adapt', match: /why (do you|would you|are you|should we|this)|what (draws|attracts) you|why apply|reason for applying|what interests you/i },
  { key: 'what_sets_you_apart', label: 'What sets you apart', category: 'pitch', lengthSensitive: true, reuse: 'adapt', match: /set(s)? you apart|stand ?out|unique|different from|why should we (choose|book|select)|what makes (you|your)/i },
  { key: 'career_highlights', label: 'Career highlights', category: 'pitch', lengthSensitive: true, reuse: 'verbatim', match: /highlight|achievement|accomplish|notable|awards|press coverage|recent success/i },
  { key: 'previous_performances', label: 'Previous performances', category: 'pitch', lengthSensitive: true, reuse: 'verbatim', match: /previous (performance|show|gig)|past (performance|show|gig|festival)|where have you (played|performed)|performance history|venues played/i },
  { key: 'press_quote', label: 'Press quote', category: 'story', lengthSensitive: false, reuse: 'verbatim', match: /press quote|review quote|quote from|testimonial|what (the )?press/i },
  { key: 'influences', label: 'Influences / comparisons', category: 'story', lengthSensitive: false, reuse: 'verbatim', match: /influence|similar (to|artists)|comparable|sounds like|for fans of|riyl/i },

  // ── Story ──
  { key: 'one_liner', label: 'One-line description', category: 'story', lengthSensitive: true, reuse: 'verbatim', match: /one[ -]?(line|liner|sentence)|short description|elevator pitch|in a (sentence|few words)|tagline|brief description/i },
  { key: 'bio', label: 'Artist bio', category: 'story', lengthSensitive: true, reuse: 'verbatim', match: /bio(graphy)?|about (you|your|the artist|the band)|artist statement|background|tell us about|describe (your|yourself|the act)|your story|blurb/i },

  // ── Logistics ──
  { key: 'set_length', label: 'Set length', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /set (length|duration|time)|how long (is|do)|length of (set|performance)|performance (length|duration)|minutes/i },
  { key: 'tech_requirements', label: 'Technical requirements', category: 'logistics', lengthSensitive: true, reuse: 'verbatim', match: /tech(nical)? (requirement|rider|need|spec)|backline|input list|sound (requirement|needs)|equipment (you|needed)|stage plot/i },
  { key: 'availability', label: 'Availability', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /availab|preferred date|which (date|day)|when (can|are) you|scheduling/i },
  { key: 'fee', label: 'Fee / rate', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /\bfee\b|rate|guarantee|how much do you|price|compensation|budget/i },
  { key: 'travel', label: 'Travel & accommodation', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /travel|accommodation|lodging|hotel|transport|willing to travel|distance/i },
  { key: 'accessibility', label: 'Accessibility needs', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /accessib|accommodation needs|special needs|dietary/i },
  { key: 'streaming_stats', label: 'Streaming & audience numbers', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /monthly listeners|stream(s|ing)|followers|audience (size|numbers?)|draw|how many (fans|followers)|social (reach|following)/i },
  { key: 'how_did_you_hear', label: 'How you heard about it', category: 'logistics', lengthSensitive: false, reuse: 'verbatim', match: /how (did |do )?you (hear|heard|find|learn)|referral|referred by|where did you hear/i },
]

const BY_KEY = new Map(QUESTION_KINDS.map((k) => [k.key, k]))

export function kindByKey(key: string): QuestionKind | undefined {
  return BY_KEY.get(key)
}

/**
 * Classifies a form field into a reusable question kind.
 * File uploads are never classified — the answer is a file, not text.
 */
export function classifyQuestion(input: {
  label: string
  helpText?: string | null
  fieldKey?: string
  fieldType?: string
}): QuestionKind | undefined {
  if (input.fieldType === 'file') return undefined

  const haystack = `${input.label} ${input.fieldKey ?? ''} ${input.helpText ?? ''}`
  for (const kind of QUESTION_KINDS) {
    if (kind.exclude?.test(haystack)) continue
    if (kind.match.test(haystack)) return kind
  }
  return undefined
}

/**
 * The length a stored answer should target for this field — used to pick
 * between library variants (a 150-character bio vs a 500-character one).
 */
export function targetLength(field: { maxLength?: number | null; fieldType?: string }): number | null {
  if (field.maxLength) return field.maxLength
  if (field.fieldType === 'textarea') return null // no stated limit: use the fullest version
  return 300 // a single-line input, whatever it claims
}
