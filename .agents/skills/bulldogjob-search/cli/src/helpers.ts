// Data source: Bulldogjob.pl public listing pages (Polish IT board). Listings are a
// Next.js page whose __NEXT_DATA__ carries pageProps.jobs (50 per page). Filters are
// path segments: /companies/jobs/s/skills,Python/city,Kraków/experienceLevel,senior.
// There is NO free-text search; see portalSearch for how --query is handled.
// Detail pages /companies/jobs/<id> carry a schema.org JobPosting.
// robots.txt (checked 2026-10-08) allows /companies/jobs/ for all agents.

export const UA = "Mozilla/5.0 (compatible; bulldogjob-cli/1.0)"
const BASE = "https://bulldogjob.pl"
const HOST = /(^|\.)bulldogjob\.(pl|com)$/i
const PER_PAGE = 50
/** Pages scanned for a client-side --query match when no skill matches it. */
const FALLBACK_PAGES = 3

export const PORTAL: PortalSpec = {
  name: "bulldogjob",
  site: "https://bulldogjob.pl",
  blurb: "search IT job offers on Bulldogjob.pl (Poland)",
  queryHelp:
    "Technology or words to match. Tried first as a skill filter; if no skill matches, the newest offers are scanned for the words in title/tags/company.",
  locationHelp: 'City, e.g. "Warszawa", "Kraków", "Wrocław".',
  extraFlags: {
    skill: 'Server-side technology filter, e.g. "Python", "Java" (exact skill name).',
    role: 'Role filter, e.g. "backend", "frontend", "devops", "data", "tester", "pm".',
    level: "Experience level: junior | mid | senior.",
    remote: "remote = only offers that allow fully remote work (client-side).",
  },
  examples: [
    'bun run src/cli.ts search -q "python" -l "Kraków" --format table',
    'bun run src/cli.ts search --role devops --level senior --remote remote --format table',
    "bun run src/cli.ts detail 257280-murex-tech-migration-senior-sme-luxoft-dxc --format plain",
  ],
}

const LEVELS: Record<string, string> = { junior: "junior", mid: "medium", medium: "medium", senior: "senior" }

function seg(name: string, value: string): string {
  return `${name},${encodeURIComponent(value)}`
}

export function buildSearchUrl(opts: SearchOpts, skill: string | undefined, page: number): string {
  const segs: string[] = []
  if (skill) segs.push(seg("skills", skill))
  if (opts.location) segs.push(seg("city", opts.location))
  if (opts.extra.role) segs.push(seg("role", opts.extra.role.toLowerCase()))
  if (opts.extra.level) {
    const lv = LEVELS[opts.extra.level.toLowerCase()]
    if (!lv) throw new CliError("--level must be junior, mid or senior", "BAD_ARG")
    segs.push(seg("experienceLevel", lv))
  }
  segs.push("order,published,desc")
  if (page > 1) segs.push(`page,${page}`)
  return `${BASE}/companies/jobs/s/${segs.join("/")}`
}

function parseListing(html: string): { jobs: any[]; total: number | null } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error("Bulldogjob page has no __NEXT_DATA__ (markup change or block page?)")
  const pp = JSON.parse(m[1])?.props?.pageProps
  if (!pp || !Array.isArray(pp.jobs)) throw new Error("Bulldogjob payload missing pageProps.jobs (markup change?)")
  return { jobs: pp.jobs, total: typeof pp.totalCount === "number" ? pp.totalCount : null }
}

function toCard(j: any): JobCard | null {
  if (!j?.id || !j.position) return null
  const sal = j.denominatedSalaryLong
  return {
    id: String(j.id),
    title: clean(String(j.position)),
    company: j.company?.name ? clean(String(j.company.name)) : null,
    location: [j.remote ? "Remote" : null, j.city || null].filter(Boolean).join(" | ") || null,
    // The listing carries no publication date; `detail` returns datePosted.
    date: null,
    url: `${BASE}/companies/jobs/${j.id}`,
    remote: Boolean(j.remote),
    experienceLevel: j.experienceLevel ?? null,
    skills: j.technologyTags ?? [],
    salary: sal?.money && !sal.hidden ? `${sal.money} ${sal.currency ?? ""}`.trim() : null,
  }
}

async function fetchPage(opts: SearchOpts, skill: string | undefined, page: number) {
  const html = await httpFetch(buildSearchUrl(opts, skill, page))
  if (!html) return { jobs: [], total: 0 }
  return parseListing(html)
}

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  if (opts.extra.remote && opts.extra.remote.toLowerCase() !== "remote") {
    throw new CliError("--remote only accepts: remote", "BAD_ARG")
  }
  const finish = (jobs: any[], total: number | null, textFilter?: string): SearchResult => {
    let cards = jobs.map(toCard).filter((c): c is JobCard => c !== null)
    if (textFilter) {
      cards = cards.filter((c) =>
        matchesAllWords(`${c.title} ${c.company ?? ""} ${(c.skills as string[]).join(" ")}`, textFilter),
      )
    }
    if (opts.extra.remote) cards = cards.filter((c) => c.remote)
    return { cards, total }
  }

  // 1) An explicit --skill, or --query used as a skill (most IT queries are technologies).
  const skill = opts.extra.skill ?? opts.query
  if (skill) {
    const first = await fetchPage(opts, skill, opts.page)
    if (first.jobs.length || opts.extra.skill) {
      return finish(first.jobs, first.total, opts.extra.skill && opts.query ? opts.query : undefined)
    }
  }
  if (!opts.query) {
    const r = await fetchPage(opts, undefined, opts.page)
    return finish(r.jobs, r.total)
  }
  // 2) No skill named like the query: scan the newest offers (bounded) for the words.
  const all: any[] = []
  const startPage = (opts.page - 1) * FALLBACK_PAGES + 1
  for (let p = startPage; p < startPage + FALLBACK_PAGES; p++) {
    const r = await fetchPage(opts, undefined, p)
    all.push(...r.jobs)
    if (r.jobs.length < PER_PAGE) break
  }
  return finish(all, null, opts.query)
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (!looksLikeUrl(t)) return /^\d{4,}(-[a-z0-9-]+)?$/i.test(t) ? t.toLowerCase() : null
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(/^\/companies\/jobs\/(\d{4,}(?:-[a-z0-9-]+)?)\/?$/i)
  return m ? m[1].toLowerCase() : null
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  const url = `${BASE}/companies/jobs/${id}`
  const html = await httpFetch(url)
  if (!html) return null
  const jp = findJobPosting(html)
  if (!jp) throw new Error("Bulldogjob detail page has no JobPosting JSON-LD (expired offer or markup change?)")
  return jobPostingToDetail(jp, { id, url })
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
