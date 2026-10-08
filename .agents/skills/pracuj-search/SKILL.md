---
name: pracuj-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Poland on Pracuj.pl,
  Poland's largest general job board (all sectors: office, finance, IT, sales,
  logistics, engineering, healthcare, ...), or fetch the full text of a Pracuj.pl
  posting. Trigger phrases: find a job in Poland, jobs in Warsaw/Kraków/Wrocław,
  Pracuj.pl, search Pracuj, praca, oferty pracy, szukam pracy, praca w Warszawie,
  ogłoszenia o pracę, pracuj.pl oferta.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/pracuj-search/cli/src/cli.ts *)
---

# Pracuj.pl Search Skill

Search live job offers on [Pracuj.pl](https://www.pracuj.pl), the largest general job
board in Poland. No authentication, no API key, **zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing and offer pages only (robots.txt allows `/praca/`), with an honest
User-Agent and backoff on 429/5xx. Keep volume low and don't use it for bulk collection.

## Commands

### Search

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keywords (title, skill, company). Recommended.
- `--location <city>` / `-l` — city, e.g. `"Warszawa"`, `"Kraków"`, `"Gdańsk"`.
- `--radius <km>` — distance around `--location`: `0`, `10`, `20`, `30`, `50`, `100`.
- `--remote <mode>` — `remote` | `hybrid` | `onsite` | `mobile`.
- `--jobage <days>` — published within N days. Sent to Pracuj.pl as its nearest window
  (1/3/7/14/30 days) and re-checked client-side against each offer's date.
- `--page <n>` — 1-indexed page (50 groups per page).
- `--limit <n>` / `-n` — cap results (client-side).
- `--format json|table|plain` — default `json`.

### Detail

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer id from search (e.g. `1005113512`), or pass a full
`pracuj.pl/praca/...,oferta,<id>` URL. Returns the full text (responsibilities,
requirements, benefits), contract type, salary when published, and validity date.

## Usage examples

```bash
# Accountant roles in Warsaw, last 7 days
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "księgowa" -l "Warszawa" --jobage 7 --format table

# Python developers, fully remote
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "python developer" --remote remote --format table

# Warehouse jobs within 30 km of Poznań
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "magazynier" -l "Poznań" --radius 30 --format table

# Specialist roles in Kraków, page 2
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "specjalista" -l "Kraków" --page 2 --format table

# Full detail of one offer
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail 1005113512 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- One posting published for several cities is a "group" on Pracuj.pl; the CLI emits one
  result per city offer so every `id` resolves to its own detail page.
- `date` is `lastPublicated` (Pracuj.pl re-publishes offers); `firstPublished` and
  `expires` are included in JSON output.
- Extra JSON fields: `salary`, `workModes`, `contracts`, `positionLevels`.
- Parsing anchors (Next.js `__NEXT_DATA__`, React Query key `jobOffers`) are in `url-reference.md`.
