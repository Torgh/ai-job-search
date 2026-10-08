// Data source: JustJoin.it public listing and offer pages (Polish IT job board).
// robots.txt (checked 2026-10-08) disallows /api/ and "/oferty-pracy/*,*" but allows
// /job-offers/... listings and /job-offer/<slug> detail pages, which are all this uses.

export const UA = "Mozilla/5.0 (compatible; justjoin-cli/1.0)"
const BASE = "https://justjoin.it"
const LIST_PATH = "/job-offers"
const OFFER_PATH = "/job-offer"
const ALL_LOCATIONS = "all-locations"
const HOST = /(^|\.)justjoin\.it$/i

export const PORTAL: PortalSpec = {
  name: "justjoin",
  site: "https://justjoin.it",
  blurb: "search IT job offers on JustJoin.it (Poland)",
  queryHelp: 'Keyword (technology, role, company), e.g. "python", "data engineer".',
  locationHelp: 'City, e.g. "Warszawa", "Kraków", "Wrocław" (slugified for the URL).',
  extraFlags: {
    remote: "Workplace type: remote | hybrid | onsite.",
    level: "Experience level: intern | junior | mid | senior | manager | c-level.",
    sort: "newest = sort by publication date (implied by --jobage).",
  },
  examples: [
    'bun run src/cli.ts search -q "python" -l "Kraków" --format table',
    'bun run src/cli.ts search -q "data engineer" --remote remote --jobage 14 --format table',
    "bun run src/cli.ts detail rnrs-solutions-python-engineer-warszawa-python --format plain",
  ],
}

// ---- Shared Just Join IT platform parsing (JustJoin.it and RocketJobs.pl run the
// same Next.js app). The listing page streams React Server Component payload via
// self.__next_f.push([1,"..."]) script tags; the decoded payload contains the
// result list as a plain JSON array under "offers":[...]. Detail pages carry a
// schema.org JobPosting. Both robots.txt files disallow /api/ (so the JSON API is
// NOT used) but allow the HTML listing and detail pages used here.

const WORKPLACE: Record<string, string> = { remote: "remote", hybrid: "hybrid", onsite: "office", office: "office" }

/** Concatenate every RSC chunk into one decoded string. */
export function rscPayload(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  let m: RegExpExecArray | null
  let out = ""
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse(m[1])
    } catch {
      // one malformed chunk must not break the rest
    }
  }
  return out
}

/** Extract every JSON array that follows `"offers":` in the payload (bracket-matched). */
export function extractOfferArrays(payload: string): any[][] {
  const arrays: any[][] = []
  let idx = 0
  while ((idx = payload.indexOf('"offers":[', idx)) !== -1) {
    const start = idx + '"offers":'.length
    let depth = 0
    let inStr = false
    let i = start
    for (; i < payload.length; i++) {
      const c = payload[i]
      if (inStr) {
        if (c === "\\") i++
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === "[" || c === "{") depth++
      else if (c === "]" || c === "}") {
        depth--
        if (depth === 0) break
      }
    }
    try {
      const arr = JSON.parse(payload.slice(start, i + 1))
      if (Array.isArray(arr)) arrays.push(arr)
    } catch {
      // not a JSON array (e.g. a "$ref" string) - skip
    }
    idx = i
  }
  return arrays
}

function salaryText(o: any): string | null {
  const types: any[] = Array.isArray(o.employmentTypes) ? o.employmentTypes : []
  const orig = types.filter((t) => t.currencySource === "original" || types.length === 1)
  const parts = orig
    .filter((t) => t.from != null || t.to != null)
    .map((t) => `${t.from ?? "?"}–${t.to ?? "?"}${String(t.currency ?? "").toUpperCase()} ${t.type ?? ""}`.trim())
  return parts.length ? parts.join(" | ") : null
}

export function parseListing(html: string): JobCard[] {
  const payload = rscPayload(html)
  if (!payload) throw new Error(`${PORTAL.name} listing has no RSC payload (markup change or block page?)`)
  const seen = new Set<string>()
  const cards: JobCard[] = []
  for (const arr of extractOfferArrays(payload)) {
    for (const o of arr) {
      if (!o || typeof o !== "object" || !o.slug || !o.title) continue
      if (seen.has(o.slug)) continue
      seen.add(o.slug)
      const cities = Array.isArray(o.multilocation)
        ? [...new Set(o.multilocation.map((l: any) => l.city).filter(Boolean))]
        : []
      cards.push({
        id: String(o.slug),
        title: clean(String(o.title)),
        company: o.companyName ? clean(String(o.companyName)) : null,
        location: cities.length > 1 ? (cities as string[]).join(" | ") : o.city ?? null,
        date: o.publishedAt ?? null,
        url: `${BASE}${OFFER_PATH}/${o.slug}`,
        workplaceType: o.workplaceType ?? null,
        experienceLevel: o.experienceLevel ?? null,
        salary: salaryText(o),
        skills: o.requiredSkills ?? [],
        expires: o.expiredAt ?? null,
      })
    }
  }
  return cards
}

export function buildSearchUrl(opts: SearchOpts): string {
  const place = opts.location ? slugify(opts.location) : ALL_LOCATIONS
  const remote = opts.extra.remote?.toLowerCase()
  if (remote && !WORKPLACE[remote]) throw new CliError("--remote must be remote, hybrid or onsite", "BAD_ARG")
  const params = new URLSearchParams()
  if (opts.query) params.set("keyword", opts.query)
  // The workplace param works on both boards; a "/remote" path only exists on JustJoin.it.
  if (remote) params.set("workplace", WORKPLACE[remote])
  if (opts.extra.level) {
    const lv = opts.extra.level.toLowerCase()
    if (!["intern", "junior", "mid", "senior", "manager", "c-level"].includes(lv)) {
      throw new CliError("--level must be intern, junior, mid, senior, manager or c-level", "BAD_ARG")
    }
    params.set("experience-level", lv)
  }
  // Newest first when a freshness window is requested, so the client-side
  // --jobage filter keeps a full page instead of a scattered handful.
  if (opts.jobage || opts.extra.sort === "newest") {
    params.set("orderBy", "DESC")
    params.set("sortBy", "published")
  }
  if (opts.page > 1) params.set("page", String(opts.page))
  const qs = params.toString()
  return `${BASE}${LIST_PATH}/${place}${qs ? "?" + qs : ""}`
}

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  if (opts.extra.sort && opts.extra.sort !== "newest") throw new CliError("--sort only accepts: newest", "BAD_ARG")
  const html = await httpFetch(buildSearchUrl(opts))
  if (!html) return { cards: [] }
  return { cards: parseListing(html) }
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (!looksLikeUrl(t)) return /^[a-z0-9][a-z0-9-]{4,}$/i.test(t) ? t.toLowerCase() : null
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(new RegExp(`^${OFFER_PATH}/([a-z0-9-]+)/?$`, "i"))
  return m ? m[1].toLowerCase() : null
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  const url = `${BASE}${OFFER_PATH}/${id}`
  const html = await httpFetch(url)
  if (!html) return null
  const jp = findJobPosting(html)
  if (!jp) throw new Error(`${PORTAL.name} detail page has no JobPosting JSON-LD (expired offer or markup change?)`)
  const detail = jobPostingToDetail(jp, { id, url })
  // The JSON-LD description has its <p> breaks stripped ("drones.The team...");
  // the rendered description block under the "Job description" heading keeps them.
  const rendered = renderedDescription(html)
  if (rendered && rendered.length > (detail.description?.length ?? 0) * 0.8) detail.description = rendered
  return detail
}

/** Inner HTML of the first <div> that opens at or after `from`, balancing nested divs. */
function divAfter(html: string, from: number): string | null {
  const open = html.indexOf("<div", from)
  if (open === -1) return null
  const bodyStart = html.indexOf(">", open) + 1
  let depth = 1
  let i = bodyStart
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(bodyStart, i - 6)
}

export function renderedDescription(html: string): string | null {
  const h = html.match(/<h3[^>]*>\s*(Job description|Opis (stanowiska|oferty|pracy))\s*<\/h3>/i)
  if (!h || h.index === undefined) return null
  return htmlToText(divAfter(html, h.index + h[0].length))
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
