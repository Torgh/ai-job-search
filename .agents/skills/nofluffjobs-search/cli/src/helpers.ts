// Data source: No Fluff Jobs public listing pages (Polish IT board, also CZ/SK/HU).
// The Angular app server-renders its transfer state into <script id="serverApp-state">,
// which carries the result list (STORE_KEY.searchResponse.postings). Detail pages
// /pl/job/<slug> carry a schema.org JobPosting. robots.txt (checked 2026-10-08)
// disallows /api/ and /pl/posting/ but allows the listing and /pl/job/ pages used here.

export const UA = "Mozilla/5.0 (compatible; nofluffjobs-cli/1.0)"
const BASE = "https://nofluffjobs.com"
const HOST = /(^|\.)nofluffjobs\.com$/i

export const PORTAL: PortalSpec = {
  name: "nofluffjobs",
  site: "https://nofluffjobs.com/pl",
  blurb: "search IT job offers on No Fluff Jobs (Poland; salary ranges always shown)",
  queryHelp: 'Keyword (technology, role, company), e.g. "python", "devops".',
  locationHelp: 'City, e.g. "Warszawa", "Kraków", "Wrocław", or "remote".',
  extraFlags: {
    remote: "remote = fully remote offers only (same as --location remote).",
    level: "Seniority: trainee | junior | mid | senior | expert.",
    category: 'NFJ category slug, e.g. "backend", "frontend", "devops", "data", "testing".',
  },
  examples: [
    'bun run src/cli.ts search -q "python" -l "Warszawa" --format table',
    'bun run src/cli.ts search -q "devops" --remote remote --level senior --format table',
    "bun run src/cli.ts detail lead-python-developer-mindbox-krakow --format plain",
  ],
}

const LEVELS = ["trainee", "junior", "mid", "senior", "expert"]

export function buildSearchUrl(opts: SearchOpts): string {
  const crit: string[] = []
  const term = (k: string, v: string) => `${k}=${/\s/.test(v) ? `"${v}"` : v}`
  if (opts.query) crit.push(term("keyword", opts.query))
  const remote = opts.extra.remote?.toLowerCase()
  if (remote && remote !== "remote") throw new CliError("--remote only accepts: remote", "BAD_ARG")
  if (opts.location) crit.push(term("city", slugify(opts.location)))
  if (remote && !opts.location) crit.push("city=remote")
  if (opts.extra.level) {
    const lv = opts.extra.level.toLowerCase()
    if (!LEVELS.includes(lv)) throw new CliError(`--level must be one of ${LEVELS.join(", ")}`, "BAD_ARG")
    crit.push(`seniority=${lv}`)
  }
  if (opts.extra.category) crit.push(`category=${slugify(opts.extra.category)}`)
  const params = new URLSearchParams()
  if (crit.length) params.set("criteria", crit.join(" "))
  if (opts.page > 1) params.set("page", String(opts.page))
  const qs = params.toString().replace(/\+/g, "%20")
  return `${BASE}/pl/${qs ? "?" + qs : ""}`
}

function state(html: string): any {
  const m = html.match(/<script id="serverApp-state" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error("No Fluff Jobs page has no serverApp-state (markup change or block page?)")
  // Older Angular versions escape the transfer state (&q; for quotes etc.).
  const raw = m[1].replace(/&q;/g, '"').replace(/&a;/g, "&").replace(/&s;/g, "'").replace(/&l;/g, "<").replace(/&g;/g, ">")
  return JSON.parse(raw)
}

export function parseListing(html: string): SearchResult {
  const st = state(html)
  const resp = st?.STORE_KEY?.searchResponse
  if (!resp || !Array.isArray(resp.postings)) throw new Error("No Fluff Jobs state has no searchResponse.postings (markup change?)")
  const cards: JobCard[] = []
  for (const p of resp.postings) {
    const places: any[] = p?.location?.places ?? []
    const slug = places.find((pl) => pl.url)?.url
    if (!slug || !p.title) continue
    const cities = [...new Set(places.map((pl) => pl.city).filter((c) => c && c !== "Remote"))]
    const loc = [p.location?.fullyRemote ? "Remote" : null, ...cities].filter(Boolean).join(" | ")
    const sal = p.salary
    cards.push({
      id: String(slug),
      title: clean(String(p.title)),
      company: p.name ? clean(String(p.name)) : null,
      location: loc || null,
      date: typeof p.posted === "number" ? new Date(p.posted).toISOString() : null,
      url: `${BASE}/pl/job/${slug}`,
      renewed: typeof p.renewed === "number" ? new Date(p.renewed).toISOString() : null,
      salary: sal && (sal.from || sal.to) ? `${sal.from ?? "?"}–${sal.to ?? "?"} ${sal.currency ?? ""} ${sal.type ?? ""}`.trim() : null,
      technology: p.technology ?? null,
      seniority: p.seniority ?? [],
      category: p.category ?? null,
    })
  }
  return { cards, total: resp.totalCount ?? null }
}

const PAGE_SIZE = 20

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  const html = await httpFetch(buildSearchUrl(opts))
  if (!html) return { cards: [] }
  const res = parseListing(html)
  // The server-rendered state is cumulative ("load more"): ?page=N returns
  // postings from page 1 through N. Slice out page N alone, 20 per page.
  if (opts.page > 1) {
    res.cards = res.cards.slice((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE)
  }
  return res
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (!looksLikeUrl(t)) return /^[a-z0-9][a-z0-9-]{4,}$/i.test(t) ? t.toLowerCase() : null
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(/^\/(?:[a-z]{2}\/)?job\/([a-z0-9-]+)\/?$/i)
  return m ? m[1].toLowerCase() : null
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  const url = `${BASE}/pl/job/${id}`
  const html = await httpFetch(url)
  if (!html) return null
  const jp = findJobPosting(html)
  if (!jp) throw new Error("No Fluff Jobs detail page has no JobPosting JSON-LD (expired offer or markup change?)")
  const d = jobPostingToDetail(jp, { id, url })
  if (Array.isArray(jp.skills)) {
    const skills = jp.skills.map((s: any) => s?.value).filter(Boolean)
    if (skills.length) d.description = `${d.description ?? ""}\n\nSkills: ${skills.join(", ")}`.trim()
  }
  return d
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
