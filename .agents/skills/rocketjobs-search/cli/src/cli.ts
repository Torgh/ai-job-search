#!/usr/bin/env bun
// Self-contained portal-search CLI (search + detail). No external CLI framework
// and zero runtime dependencies, so it runs anywhere `bun` is available.
// Portal-specific behaviour lives in helpers.ts (PORTAL spec + parsers); this
// file only parses and validates flags and dispatches.

import { PORTAL, writeError } from "./helpers.js"
import { runSearch } from "./commands/search.js"
import { runDetail } from "./commands/detail.js"
import type { SearchOpts } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

function help(): string {
  const extra = Object.entries(PORTAL.extraFlags)
    .map(([k, v]) => `  --${k.padEnd(20)} ${v}`)
    .join("\n")
  return `${PORTAL.name}-cli — ${PORTAL.blurb}

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      ${PORTAL.queryHelp}
${PORTAL.locationHelp ? `  --location, -l <text>   ${PORTAL.locationHelp}\n` : ""}  --jobage <days>         Only postings published within N days.
  --page <n>              1-indexed results page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.
${extra ? extra + "\n" : ""}
EXAMPLES
${PORTAL.examples.map((e) => "  " + e).join("\n")}

Source: ${PORTAL.site} — public pages only, honest User-Agent, keep volume low.
`
}

const BASE_SEARCH = ["query", "jobage", "page", "limit", "format", "help", "h"]

function knownFlags(cmd: string): Set<string> | null {
  if (cmd === "search") {
    return new Set([
      ...BASE_SEARCH,
      ...(PORTAL.locationHelp ? ["location"] : []),
      ...Object.keys(PORTAL.extraFlags),
    ])
  }
  if (cmd === "detail") return new Set(["format", "help", "h"])
  return null
}

function parsePositiveInt(name: string, raw: string | boolean | string[]): number | null {
  // Number(), not parseInt(): parseInt truncates "0.5" to 0 and silently drops a filter.
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1) {
    writeError(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
    return null
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(help())
    return cmd ? 0 : 1
  }

  // Unknown flags are rejected, never silently discarded: a dropped filter
  // changes what the search returns with no error (add-portal.md contract).
  const known = knownFlags(cmd)
  if (known) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || known.has(key)) continue
      writeError(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      writeError(`--format must be json, table or plain, got "${flags.format}"`, "BAD_ARG")
      return 1
    }
    const ints: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] === undefined) continue
      const v = parsePositiveInt(name, flags[name])
      if (v === null) return 1
      ints[name] = v
    }
    for (const name of ["query", "location", ...Object.keys(PORTAL.extraFlags)]) {
      if (flags[name] !== undefined && typeof flags[name] !== "string") {
        writeError(`--${name} requires a value`, "BAD_ARG")
        return 1
      }
    }
    const query = typeof flags.query === "string" ? flags.query.trim() : undefined
    if (PORTAL.requireQuery && !query) {
      writeError("the --query/-q flag is required for this portal", "NO_QUERY")
      return 1
    }
    const extra: Record<string, string> = {}
    for (const k of Object.keys(PORTAL.extraFlags)) {
      if (typeof flags[k] === "string") extra[k] = (flags[k] as string).trim()
    }
    const opts: SearchOpts = {
      query: query || undefined,
      location: typeof flags.location === "string" ? flags.location.trim() || undefined : undefined,
      jobage: ints.jobage,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
      extra,
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires an <id|url>", "NO_ID")
      return 1
    }
    const fmt = typeof flags.format === "string" ? flags.format : "json"
    return runDetail({ id, format: fmt === "plain" ? "plain" : "json" })
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
