// Data source: GoWork.pl public job listings (Polish board, also known for employer
// reviews). Listings are server-rendered Nuxt HTML cards (<div class="g-job-item">);
// detail pages /oferta/<slug>,<id>,<city> carry a schema.org JobPosting.
// robots.txt (checked 2026-10-08) allows /praca/ and /oferta/ for all agents
// (only /oferta/*/aplikuj, account and click-out paths are disallowed).

export const UA = "Mozilla/5.0 (compatible; gowork-cli/1.0)"
const BASE = "https://www.gowork.pl"
const HOST = /(^|\.)gowork\.pl$/i

export const PORTAL: PortalSpec = {
  name: "gowork",
  site: "https://www.gowork.pl/praca",
  blurb: "search job offers on GoWork.pl (Poland)",
  queryHelp: 'Job title / keyword, e.g. "kierowca", "magazynier", "księgowa".',
  locationHelp: 'City, e.g. "Warszawa", "Gdańsk" (slugified into the URL).',
  extraFlags: {},
  examples: [
    'bun run src/cli.ts search -q "kierowca" -l "Warszawa" --format table',
    'bun run src/cli.ts search -q "magazynier" --jobage 7 --format table',
    "bun run src/cli.ts detail 4gvnb6TKbI1HI4eIzWz3Kh --format plain",
  ],
}

export function buildSearchUrl(opts: SearchOpts): string {
  const segs: string[] = []
  if (opts.query) segs.push(`${slugify(opts.query)};st`)
  if (opts.location) segs.push(`${slugify(opts.location)};l`)
  if (opts.page > 1) segs.push(`${opts.page};pg`)
  return `${BASE}/praca${segs.length ? "/" + segs.join("/") : ""}`
}

export function parseListing(html: string): JobCard[] {
  const cards: JobCard[] = []
  const seen = new Set<string>()
  for (const chunk of html.split(/<div class="g-job-item"/).slice(1)) {
    const link = chunk.match(/<h3[^>]*>\s*<a href="(\/oferta\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) continue
    const href = decodeHtmlEntities(link[1])
    const parts = href.replace(/^\/oferta\//, "").split(",")
    const id = parts[1]
    if (!id || seen.has(id)) continue
    seen.add(id)
    const title = clean(link[2])
    if (!title) continue
    const company = clean(chunk.match(/class="g-button gray-link[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1]) || null
    // Location text is the <span> right after the location icon's <span><svg>…</svg></span>.
    const loc = chunk.match(/class="g-job-location"[\s\S]*?<\/svg><\/span><span[^>]*>([^<]+)<\/span>/)?.[1]
    const pub = chunk.match(/(Opublikowano|Zaktualizowano|Dodano):\s*(\d{1,2}\.\d{1,2}\.\d{4})/)
    cards.push({
      id,
      title,
      company,
      location: loc ? clean(loc) : null,
      date: pub ? plDateToIso(pub[2]) : null,
      url: `${BASE}${href}`,
      dateLabel: pub ? pub[1] : null,
    })
  }
  return cards
}

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  const html = await httpFetch(buildSearchUrl(opts))
  if (!html) return { cards: [] }
  if (!/class="g-job-item"/.test(html)) {
    // Zero hits render "… - 0 ofert pracy"; a page past the last one is a normal
    // listing titled "… - strona N | GoWork.pl" with no cards (both verified 2026-10-08).
    if (/\b0 ofert pracy/.test(html)) return { cards: [], total: 0 }
    if (opts.page > 1 && /<title>[^<]*strona \d+[^<]*GoWork\.pl<\/title>/i.test(html)) return { cards: [] }
    throw new Error("GoWork page has no g-job-item cards (markup change or block page?)")
  }
  return { cards: parseListing(html) }
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (!looksLikeUrl(t)) return /^[A-Za-z0-9]{16,26}$/.test(t) ? t : null
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(/^\/oferta\/[^,/]+,([A-Za-z0-9]{16,26}),[^/]+\/?$/)
  return m ? m[1] : null
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  // The slug and city segments are not validated; any value resolves the id.
  const url = `${BASE}/oferta/oferta,${id},polska`
  const html = await httpFetch(url)
  if (!html) return null
  const jp = findJobPosting(html)
  if (!jp) throw new Error("GoWork detail page has no JobPosting JSON-LD (expired offer or markup change?)")
  const canon = html.match(/<link rel="canonical" href="([^"]+\/oferta\/[^"]+)"/)
  const detail = jobPostingToDetail(jp, { id, url: canon ? canon[1] : url })
  // JSON-LD joins every list with ", "; the rendered sections keep headings and items.
  const sections = renderedSections(html)
  if (sections && sections.length > (detail.description?.length ?? 0) * 0.8) detail.description = sections
  return detail
}

/** Headed sections ("Twój zakres obowiązków", "Nasze wymagania", ...) of a detail page. */
export function renderedSections(html: string): string | null {
  const marker = "g-job-offer-details-template__section"
  const out: string[] = []
  let idx = 0
  while ((idx = html.indexOf(`${marker}"`, idx)) !== -1) {
    const start = html.lastIndexOf("<div", idx)
    const inner = extractDivContent(html.slice(start), marker)
    idx += marker.length
    const text = htmlToText(inner)
    if (text) out.push(text)
  }
  return out.length ? out.join("\n\n") : null
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
