---
name: gowork-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Poland on GoWork.pl
  (general job board, strong in logistics, production, retail, drivers, office and
  jobs abroad), or fetch the full text of a GoWork posting. Trigger phrases: jobs in
  Poland, GoWork, go work, praca, oferty pracy, praca kierowca, praca magazyn,
  praca za granicą, ogłoszenia o pracę.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/gowork-search/cli/src/cli.ts *)
---

# GoWork.pl Search Skill

Search live job offers on [GoWork.pl](https://www.gowork.pl/praca). No authentication,
**zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing (`/praca/...`) and offer (`/oferta/...`) pages; robots.txt allows
both (it disallows only apply, account and click-out paths). Honest User-Agent, backoff
on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/gowork-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — job title / keyword, slugified (`"data analyst"` → `data-analyst;st`).
- `--location <city>` / `-l` — city, slugified (`"Gdańsk"` → `gdansk;l`).
- `--jobage <days>` — published within N days (client-side on the card's "Opublikowano" date).
- `--page <n>` — 1-indexed page (40 per page).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/gowork-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the 22-character offer code from search (e.g. `4gvnb6TKbI1HI4eIzWz3Kh`) or a
`gowork.pl/oferta/<slug>,<id>,<city>` URL.

## Usage examples

```bash
# Drivers in Warsaw
bun run .agents/skills/gowork-search/cli/src/cli.ts search -q "kierowca" -l "Warszawa" --format table

# Warehouse jobs, last 7 days
bun run .agents/skills/gowork-search/cli/src/cli.ts search -q "magazynier" --jobage 7 --format table

# Accountants in Gdańsk
bun run .agents/skills/gowork-search/cli/src/cli.ts search -q "księgowa" -l "Gdańsk" --format table

# Drivers, page 2
bun run .agents/skills/gowork-search/cli/src/cli.ts search -q "kierowca" --page 2 --format table

# Full detail
bun run .agents/skills/gowork-search/cli/src/cli.ts detail 4gvnb6TKbI1HI4eIzWz3Kh --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Search `date` is the card's "Opublikowano" date (day precision), which can be a
  re-publication; `detail` returns the JSON-LD `datePosted`, which may be older.
- Many offers are listed for several cities ("Warszawa + 18 lokalizacji"); the card shows the first.
- Listings include jobs abroad (e.g. Germany) when they match the query.
