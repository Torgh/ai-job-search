// Data source: infoPraca.pl public search pages (general Polish job board). Each
// results page embeds a schema.org ItemList of JobPosting objects (10 per page), so
// no HTML scraping is needed; detail pages carry a JobPosting too.
// robots.txt (checked 2026-10-08) disallows only /admin/, /candidate/, /employer/.

export const UA = "Mozilla/5.0 (compatible; infopraca-cli/1.0)"
const BASE = "https://www.infopraca.pl"
const HOST = /(^|\.)infopraca\.pl$/i

export const PORTAL: PortalSpec = {
  name: "infopraca",
  site: "https://www.infopraca.pl",
  blurb: "search job offers on infoPraca.pl (general Polish job board)",
  queryHelp: 'Keywords, e.g. "kierowca", "specjalista ds. kadr".',
  locationHelp: 'City, e.g. "Warszawa", "Wrocław".',
  extraFlags: {},
  examples: [
    'bun run src/cli.ts search -q "kierowca" -l "Wrocław" --format table',
    'bun run src/cli.ts search -q "kadry i płace" --jobage 7 --format table',
    "bun run src/cli.ts detail 18307912 --format plain",
  ],
}

export function buildSearchUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.page > 1) params.set("pg", String(opts.page))
  if (opts.location) params.set("lc", opts.location)
  if (opts.query) params.set("q", opts.query)
  const qs = params.toString()
  return `${BASE}/praca${qs ? "?" + qs : ""}`
}

function itemList(html: string): any | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const j = JSON.parse(m[1].trim())
      if (j?.["@type"] === "ItemList") return j
    } catch {
      // skip malformed block
    }
  }
  return null
}

/** Marker of the explicit empty-results page (verified 2026-10-08). */
const NO_RESULTS = /search-page__empty-state/

/**
 * HTML card fallback. Only page 1 embeds the ItemList; later pages render the
 * same offers as <article class="job-card"> elements.
 */
export function parseCards(html: string): JobCard[] {
  const cards: JobCard[] = []
  for (const chunk of html.split(/<article class="job-card"/).slice(1)) {
    const id = chunk.match(/data-job-card-job-offer-id-value="(\d{5,})"/)?.[1]
    const link = chunk.match(/class="job-card__title-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!id || !link) continue
    const title = clean(link[2])
    if (!title) continue
    const meta = [...chunk.matchAll(/class="job-card__meta-item"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1]))
    const href = decodeHtmlEntities(link[1])
    cards.push({
      id,
      title,
      company: clean(chunk.match(/class="job-card__company"[^>]*>([\s\S]*?)<\/p>/)?.[1]) || null,
      location: meta[0] || null,
      date: chunk.match(/class="job-card__date"[^>]*datetime="([^"]+)"/)?.[1] ?? null,
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      employmentType: meta[1] || null,
      snippet: clean(chunk.match(/class="job-card__description"[^>]*>([\s\S]*?)<\/p>/)?.[1]).slice(0, 240) || null,
    })
  }
  return cards
}

export function parseListing(html: string): SearchResult {
  const list = itemList(html)
  if (!list) {
    const cards = parseCards(html)
    if (cards.length) return { cards }
    // A zero-result page has neither; anything else is a markup change.
    if (NO_RESULTS.test(html)) return { cards: [], total: 0 }
    throw new Error("infoPraca page has no ItemList JSON-LD or job cards (markup change or block page?)")
  }
  const cards: JobCard[] = []
  for (const el of list.itemListElement ?? []) {
    const jp = el?.item
    const url: string | undefined = jp?.url
    const id = url?.match(/\/(\d{5,})\/?$/)?.[1]
    if (!jp || !url || !id || !jp.title) continue
    const addr = jp.jobLocation?.address
    cards.push({
      id,
      title: clean(String(jp.title)),
      company: jp.hiringOrganization?.name ? clean(String(jp.hiringOrganization.name)) : null,
      location: addr ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") || null : null,
      date: jp.datePosted ?? null,
      url,
      validThrough: jp.validThrough ?? null,
      employmentType: jp.employmentType ?? null,
      category: jp.occupationalCategory ?? null,
      snippet: jp.description ? clean(String(jp.description)).slice(0, 240) : null,
    })
  }
  return { cards, total: typeof list.numberOfItems === "number" ? list.numberOfItems : null }
}

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  const html = await httpFetch(buildSearchUrl(opts))
  if (!html) return { cards: [] }
  return parseListing(html)
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (/^\d{5,}$/.test(t)) return t
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(/^\/praca\/[^/]+\/[^/]+\/(\d{5,})\/?$/)
  return m ? m[1] : null
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  // The slug segments are not checked by the site; any value resolves the id.
  const url = `${BASE}/praca/oferta/pl/${id}`
  const html = await httpFetch(url)
  if (!html) return null
  const jp = findJobPosting(html)
  if (!jp) throw new Error("infoPraca detail page has no JobPosting JSON-LD (expired offer or markup change?)")
  const canon = html.match(/<link rel="canonical" href="([^"]+\/\d{5,})"/)
  const detail = jobPostingToDetail(jp, { id, url: canon ? canon[1] : url })
  // JSON-LD description has all markup (and line breaks) removed; the rendered
  // body keeps the employer's paragraphs and lists.
  const body = htmlToText(extractDivContent(html, "job-detail__body", "article"))
  if (body && body.length > (detail.description?.length ?? 0) * 0.8) detail.description = body
  return detail
}

// ---------------------------------------------------------------------------
// Shared core (identical across the Polish portal skills; each skill keeps its
// own copy so it stays self-contained and runs with nothing but `bun`).
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  [extra: string]: unknown
}

export interface JobDetail extends JobCard {
  description: string | null
  validThrough: string | null
  employmentType: string | null
  salary: string | null
}

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
  extra: Record<string, string>
}

export interface SearchResult {
  cards: JobCard[]
  total?: number | null
  /** true when the portal applied --jobage server-side (the CLI still re-checks dates). */
  serverJobage?: boolean
}

export interface PortalSpec {
  /** Short name used in the User-Agent and help text. */
  name: string
  site: string
  /** One-line description for --help. */
  blurb: string
  /** Portal-specific search flags: flag name -> help text. */
  extraFlags: Record<string, string>
  /** Help text for --location (null = unsupported, flag rejected). */
  locationHelp: string | null
  /** Help text for --query. */
  queryHelp: string
  requireQuery?: boolean
  examples: string[]
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export class CliError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

interface FetchInit {
  method?: "GET" | "POST"
  body?: string
  headers?: Record<string, string>
}

/**
 * Fetch text with an honest User-Agent and exponential backoff (with jitter) on
 * 429/5xx. Returns "" on a 404 so callers can report NOT_FOUND instead of crashing.
 */
export async function httpFetch(url: string, init: FetchInit = {}): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      body: init.body,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
        ...(init.headers ?? {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export async function jsonFetch<T = any>(url: string, init: FetchInit = {}): Promise<T | null> {
  const text = await httpFetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  })
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Expected JSON from ${new URL(url).host}, got something else (markup change or block page?)`)
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&oacute;/g, "ó")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Strip tags and decode entities into a single line of text. */
export function clean(html: string | null | undefined): string {
  if (!html) return ""
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Convert an HTML fragment to readable plain text, keeping paragraph/list breaks. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|section)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n(?=• )/g, "\n")
    .trim()
  return text || null
}

/**
 * Inner HTML of the first <tag> (default div) whose class list contains
 * `className`, balancing nested elements of the same tag. Scripts and styles
 * inside are removed.
 */
export function extractDivContent(html: string, className: string, tag = "div"): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const open = new RegExp(`<${tag}[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, "i").exec(html)
  if (!open) return null
  const start = open.index + open[0].length
  const openTag = `<${tag}`
  const closeTag = `</${tag}>`
  let depth = 1
  let i = start
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf(openTag, i)
    const nextClose = html.indexOf(closeTag, i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + openTag.length
    } else {
      depth--
      i = nextClose + closeTag.length
    }
  }
  return html
    .slice(start, i - closeTag.length)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<link[^>]*>/gi, "")
}

/** Find the first schema.org JobPosting object in a page's JSON-LD blocks. */
export function findJobPosting(html: string): any | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const visit = (o: any): any => {
    if (!o || typeof o !== "object") return null
    if (Array.isArray(o)) {
      for (const x of o) {
        const r = visit(x)
        if (r) return r
      }
      return null
    }
    const t = o["@type"]
    if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return o
    for (const k of Object.keys(o)) {
      const r = visit(o[k])
      if (r) return r
    }
    return null
  }
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: any
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const jp = visit(parsed)
    if (jp) return jp
  }
  return null
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) {
    const parts = v.map(asText).filter(Boolean)
    return parts.length ? parts.join(", ") : null
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    return asText(o.name ?? o.value ?? o.description ?? null)
  }
  const s = String(v).trim()
  return s ? s : null
}

function jpLocation(loc: any): string | null {
  const one = (l: any): string | null => {
    if (!l) return null
    const a = l.address ?? l
    if (typeof a === "string") return a
    const parts = [a.addressLocality, a.addressRegion].map((x: any) => (x ? String(x).trim() : "")).filter(Boolean)
    return parts.length ? parts.join(", ") : asText(l.name)
  }
  if (Array.isArray(loc)) {
    const all = loc.map(one).filter(Boolean) as string[]
    return all.length ? [...new Set(all)].join(" | ") : null
  }
  return one(loc)
}

function jpSalary(s: any): string | null {
  if (!s) return null
  if (typeof s === "string") return s
  const cur = s.currency ?? ""
  const v = s.value ?? {}
  if (typeof v !== "object") return `${v} ${cur}`.trim()
  const unit = v.unitText ? `/${String(v.unitText).toLowerCase()}` : ""
  if (v.minValue != null || v.maxValue != null) {
    return `${v.minValue ?? "?"}–${v.maxValue ?? "?"} ${cur}${unit}`.trim()
  }
  if (v.value != null) return `${v.value} ${cur}${unit}`.trim()
  return null
}

/**
 * Map a JobPosting JSON-LD object onto the JobDetail shape. `extraSections`
 * lets a portal append fields it puts outside `description` (Pracuj.pl ships
 * responsibilities/requirements separately and leaves description null).
 */
export function jobPostingToDetail(jp: any, base: { id: string; url: string }): JobDetail {
  const sections: string[] = []
  const desc = htmlToText(typeof jp.description === "string" ? jp.description : null)
  if (desc) sections.push(desc)
  const labelled: [string, unknown][] = [
    ["Zakres obowiązków / Responsibilities", jp.responsibilities],
    ["Wymagania / Requirements", typeof jp.experienceRequirements === "string" ? jp.experienceRequirements : null],
    ["Kwalifikacje / Qualifications", jp.qualifications],
    ["Benefity / Benefits", jp.jobBenefits],
  ]
  for (const [label, value] of labelled) {
    const t =
      typeof value === "string"
        ? htmlToText(value)
        : Array.isArray(value)
          ? value.map((v) => htmlToText(String(v ?? ""))).filter(Boolean).join("\n") || null
          : asText(value)
    if (t && !(desc && desc.includes(t.slice(0, 60)))) sections.push(`${label}:\n${t}`)
  }
  return {
    id: base.id,
    title: clean(asText(jp.title)) || "(untitled)",
    company: asText(jp.hiringOrganization),
    location: jpLocation(jp.jobLocation) ?? (jp.jobLocationType === "TELECOMMUTE" ? "Remote" : null),
    date: asText(jp.datePosted),
    url: asText(jp.url) && /^https?:/.test(String(jp.url)) ? String(jp.url) : base.url,
    description: sections.length ? sections.join("\n\n") : null,
    validThrough: asText(jp.validThrough),
    employmentType: asText(jp.employmentType),
    salary: jpSalary(jp.baseSalary),
  }
}

/** Parse "DD.MM.YYYY" (Polish date style) to "YYYY-MM-DD". */
export function plDateToIso(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

/** Days between a date string and now (null when unparseable). */
export function ageInDays(date: string | null, now = Date.now()): number | null {
  if (!date) return null
  const t = Date.parse(date)
  if (Number.isNaN(t)) return null
  return (now - t) / 86400000
}

/**
 * Client-side --jobage filter. Results whose date is known and older than
 * `days` are dropped; results without a date are kept (cannot be judged) and
 * the caller reports how many were undated.
 */
export function filterByJobage(cards: JobCard[], days: number | undefined): JobCard[] {
  if (!days) return cards
  return cards.filter((c) => {
    const age = ageInDays(c.date)
    return age === null || age <= days + 0.5
  })
}

/** Case/diacritic-insensitive "all words present" text match. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
}

export function matchesAllWords(haystack: string, query: string | undefined): boolean {
  if (!query) return true
  const h = fold(haystack)
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w))
}

/** Polish-aware slug: "Kraków" -> "krakow", "Data Engineer" -> "data-engineer". */
export function slugify(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Accept input only when it is a URL on one of `hosts` (real URL parsing, no look-alikes). */
export function parsePortalUrl(input: string, hostRe: RegExp): URL | null {
  const trimmed = input.trim()
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  return hostRe.test(parsed.hostname) ? parsed : null
}

export function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim()) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(input.trim())
}
