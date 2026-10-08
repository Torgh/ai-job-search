// Data source: Centralna Baza Ofert Pracy (CBOP, oferty.praca.gov.pl), the public
// job-offer database of Polish labour offices (urzędy pracy), via the same
// /portal-api/v3 REST endpoints the official portal uses. No authentication.
// oferty.praca.gov.pl publishes no robots.txt (404 on 2026-10-08), i.e. no restriction.

export const UA = "Mozilla/5.0 (compatible; cbop-cli/1.0)"
const API = "https://oferty.praca.gov.pl/portal-api/v3"
// The portal is a single-page app; offer links are relative to /portal/lista-ofert.
const WEB_OFFER = "https://oferty.praca.gov.pl/portal/lista-ofert/szczegoly-oferty"
const HOST = /^oferty\.praca\.gov\.pl$/i
const PAGE_SIZE = 50

export const PORTAL: PortalSpec = {
  name: "cbop",
  site: "https://oferty.praca.gov.pl",
  blurb: "search the Central Job Offer Database of Polish labour offices (CBOP / praca.gov.pl)",
  queryHelp: 'Job title (substring match on the position name), e.g. "kierowca", "księgowa".',
  locationHelp: 'City, county or voivodeship, e.g. "Kraków", "mazowieckie" (resolved via the portal\'s place lookup).',
  extraFlags: {
    radius: "Distance around a city --location in km (e.g. 10, 25, 50). Default 0.",
    abroad: "yes = only offers abroad (EURES), no = only offers in Poland.",
  },
  examples: [
    'bun run src/cli.ts search -q "kierowca" -l "Kraków" --radius 25 --format table',
    'bun run src/cli.ts search -q "księgowa" -l "mazowieckie" --jobage 7 --format table',
    "bun run src/cli.ts detail c29105e561c5040c25effc5cd6e77515 --format plain",
  ],
}

interface Envelope<T> {
  status: number
  msg: string
  payload: T
}

/** Resolve a place name to the filter fields the search body expects. */
async function placeFilter(name: string, radius: number): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ name, limit: "10", returnMiejscowosc: "true", onlyPoland: "true" })
  const res = await jsonFetch<Envelope<{ kod: string; opis: string }[]>>(`${API}/autocomplete/miejsce?${qs}`)
  const hits = res?.payload ?? []
  if (!hits.length) throw new CliError(`CBOP does not know a place called "${name}"`, "UNKNOWN_LOCATION")
  const want = fold(name)
  // Prefer an exact name match ("Kraków, m. Kraków, ..." over "Krakowiany, ...").
  const best = hits.find((h) => fold(h.opis.split(",")[0]) === want) ?? hits[0]
  const [kind, id] = best.kod.split(":")
  switch (kind) {
    case "MIEJSCOWOSC":
      return { miejscowosci: [{ miejscowoscId: id, zasieg: radius }] }
    case "POWIAT":
      return { powiatyId: [id] }
    case "WOJEWODZTWO":
      return { wojewodztwaId: [id] }
    default:
      throw new CliError(`Unsupported CBOP place type ${kind} for "${name}"`, "UNKNOWN_LOCATION")
  }
}

function toCard(o: any): JobCard | null {
  if (!o?.id || !o.stanowisko) return null
  return {
    id: String(o.id),
    title: clean(String(o.stanowisko)),
    company: o.pracodawca ? clean(String(o.pracodawca)) : null,
    location: o.miejscePracy ? clean(String(o.miejscePracy)) : null,
    date: plDateToIso(o.dataDodaniaCbop) ?? plDateToIso(o.dataWaznOd),
    url: `${WEB_OFFER}/${o.id}`,
    validTo: plDateToIso(o.dataWaznDo),
    salary: o.wynagrodzenie ?? null,
    contract: o.rodzajUmowy ?? null,
    office: o.placowkaOpis ?? null,
    offerType: o.typOferty ?? null,
  }
}

export async function portalSearch(opts: SearchOpts): Promise<SearchResult> {
  const body: Record<string, unknown> = { kodJezyka: "PL" }
  if (opts.query) body.stanowiska = [opts.query]
  if (opts.extra.abroad) {
    const a = opts.extra.abroad.toLowerCase()
    if (a !== "yes" && a !== "no") throw new CliError("--abroad must be yes or no", "BAD_ARG")
    body.czyZagranica = a === "yes"
  }
  let radius = 0
  if (opts.extra.radius) {
    radius = Number(opts.extra.radius)
    if (!Number.isInteger(radius) || radius < 0) throw new CliError("--radius must be a whole number of km", "BAD_ARG")
    if (!opts.location) throw new CliError("--radius needs --location", "BAD_ARG")
  }
  if (opts.location) Object.assign(body, await placeFilter(opts.location, radius))

  const params = new URLSearchParams({
    page: String(opts.page - 1),
    size: String(PAGE_SIZE),
    sort: "dataDodaniaCbop,desc",
  })
  const res = await jsonFetch<Envelope<any>>(`${API}/oferta/wyszukiwanie?${params}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
  const page = res?.payload?.ofertyPracyPage
  if (!page || !Array.isArray(page.content)) throw new Error("CBOP search returned no ofertyPracyPage (API change?)")
  return {
    cards: page.content.map(toCard).filter((c: JobCard | null): c is JobCard => c !== null),
    total: page.totalElements ?? null,
  }
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  if (/^[0-9a-f]{32}$/i.test(t)) return t.toLowerCase()
  const u = parsePortalUrl(t, HOST)
  if (!u) return null
  const m = u.pathname.match(/\/([0-9a-f]{32})\/?$/i)
  return m ? m[1].toLowerCase() : null
}

function requirementLines(w: any): string[] {
  const out: string[] = []
  const labels: Record<string, string> = { konieczne: "wymagane", pozadane: "pożądane", dodatkowe: "dodatkowe" }
  for (const [grp, label] of Object.entries(labels)) {
    const g = w?.[grp]
    if (!g || typeof g !== "object") continue
    for (const [kind, items] of Object.entries(g)) {
      if (!Array.isArray(items)) {
        if (typeof items === "string" && items.trim()) out.push(`• ${kind} (${label}): ${items.trim()}`)
        continue
      }
      for (const it of items) {
        const text =
          typeof it === "string"
            ? it
            : Object.values(it ?? {})
                .filter((v) => typeof v === "string" && v.trim() && !/^[A-Z_]+$/.test(v))
                .join(" – ")
        if (text) out.push(`• ${kind} (${label}): ${text}`)
      }
    }
  }
  return [...new Set(out)]
}

export async function portalDetail(id: string): Promise<JobDetail | null> {
  const res = await jsonFetch<Envelope<any>>(`${API}/oferta/szczegoly/${id}`)
  const p = res?.payload
  if (!p?.danePodstawowe) return null
  const w = p.warunki ?? {}
  const emp = p.pracodawca ?? {}
  const sections: string[] = []
  if (w.zakresObowiazkow) sections.push(`Zakres obowiązków:\n${String(w.zakresObowiazkow).trim()}`)
  const req = requirementLines(p.wymagania)
  if (req.length) sections.push(`Wymagania:\n${req.join("\n")}`)
  const cond = [
    ["Rodzaj umowy", w.rodzajUmowy],
    ["Wymiar etatu", w.wymiarEtatu],
    ["Zmianowość", w.zmianowosc],
    ["System wynagradzania", w.systemWynagradzania],
    ["Data rozpoczęcia", w.dataRozpoczecia],
    ["Zawód", w.zawod],
    ["Liczba wolnych miejsc", p.danePozostale?.liczbaWolnychMiejsc],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "")
  if (cond.length) sections.push(`Warunki:\n${cond.map(([k, v]) => `• ${k}: ${v}`).join("\n")}`)
  const apply = [
    ["Sposób aplikowania", emp.sposobAplikowania],
    ["Wymagane dokumenty", emp.wymaganeDokumetny],
    ["Kontakt", emp.sposobPrzekazaniaDok],
    ["E-mail", emp.email],
    ["Telefon", emp.nrTelefonu],
    ["Urząd pracy", emp.nazwaUrzeduPracy ?? p.urzad?.nazwa],
    ["Numer oferty", p.danePodstawowe.numer],
  ].filter(([, v]) => v)
  if (apply.length) sections.push(`Aplikowanie:\n${apply.map(([k, v]) => `• ${k}: ${v}`).join("\n")}`)
  return {
    id,
    title: clean(String(p.danePodstawowe.stanowisko ?? "(untitled)")),
    company: emp.nazwa ? clean(String(emp.nazwa)) : null,
    location: w.miejscePracySkrot ?? w.miejscePracy ?? null,
    date: plDateToIso(p.danePozostale?.dataDodania),
    url: `${WEB_OFFER}/${id}`,
    description: sections.length ? sections.join("\n\n") : null,
    validThrough: plDateToIso(p.danePozostale?.dataWaznosci),
    employmentType: w.rodzajUmowy ?? null,
    salary: w.wynagrodzenieBruttoOdCzas ?? w.wynagrodzenieBrutto ?? null,
    status: p.danePodstawowe.status ?? null,
  }
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
