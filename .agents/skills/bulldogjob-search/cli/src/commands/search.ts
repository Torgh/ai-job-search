import {
  CliError,
  filterByJobage,
  portalSearch,
  writeError,
  type JobCard,
  type SearchOpts,
} from "../helpers.js"

function pad(s: string | null | undefined, n: number): string {
  return (s || "—").replace(/\s+/g, " ").slice(0, n).padEnd(n)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  // The ID column is never truncated: it is what gets copied into `detail`.
  const idW = Math.max(4, ...cards.map((c) => c.id.length))
  const header = `${"ID".padEnd(idW)} ${"TITLE".padEnd(44)} ${"COMPANY".padEnd(28)} ${"LOCATION".padEnd(22)} DATE`
  const rows = cards.map(
    (c) => `${c.id.padEnd(idW)} ${pad(c.title, 44)} ${pad(c.company, 28)} ${pad(c.location, 22)} ${(c.date || "—").slice(0, 10)}`,
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const res = await portalSearch(opts)
    // Contract: every result carries id/title/company/location/date/url, missing = null.
    let cards = res.cards.map((c) => ({
      ...c,
      company: c.company ?? null,
      location: c.location ?? null,
      date: c.date ?? null,
    }))
    const before = cards.length
    cards = filterByJobage(cards, opts.jobage)
    const droppedByAge = before - cards.length
    const undated = opts.jobage ? cards.filter((c) => !c.date).length : 0
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length
          ? cards
              .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`)
              .join("\n\n")
          : "No results.") + "\n",
      )
    } else {
      const meta: Record<string, unknown> = { count: cards.length, page: opts.page }
      if (res.total !== undefined && res.total !== null) meta.total = res.total
      if (opts.jobage) {
        meta.jobage = opts.jobage
        meta.jobageFilter = res.serverJobage ? "server+client" : "client"
        if (droppedByAge) meta.droppedOlder = droppedByAge
        if (undated) meta.undated = undated
      }
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    if (e instanceof CliError) {
      writeError(e.message, e.code)
      return 1
    }
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
