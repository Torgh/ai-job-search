---
name: pracapl-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Poland on Praca.pl,
  a large general Polish job board (office, finance, sales, logistics, production,
  engineering, IT, healthcare, jobs abroad), or fetch the full text of a Praca.pl
  posting. Trigger phrases: jobs in Poland, Praca.pl, praca pl, praca, oferty
  pracy, szukam pracy, praca w Warszawie, ogłoszenia o pracę, praca za granicą.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/pracapl-search/cli/src/cli.ts *)
---

# Praca.pl Search Skill

Search live job offers on [Praca.pl](https://www.praca.pl). No authentication,
**zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing (`/s-<query>.html`) and offer pages only; robots.txt disallows
`/api/`, `/apply/` and account paths, none of which are used. Honest User-Agent, backoff
on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/pracapl-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keywords, slugified into the URL (`"kierowca kat c"` → `s-kierowca-kat-c.html`).
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Kraków"`), slugified.
- `--jobage <days>` — published within N days. Praca.pl shows relative labels
  ("3 godziny temu", "wczoraj", "2 dni temu"); the CLI converts them to timestamps and
  filters client-side.
- `--page <n>` — 1-indexed page (~50 per page).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/pracapl-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the numeric offer id from search (e.g. `11539387`) or any `praca.pl/..._<id>.html` URL.

## Usage examples

```bash
# Accountants in Warsaw
bun run .agents/skills/pracapl-search/cli/src/cli.ts search -q "księgowa" -l "Warszawa" --format table

# C-category drivers posted in the last 3 days
bun run .agents/skills/pracapl-search/cli/src/cli.ts search -q "kierowca kat c" --jobage 3 --format table

# Data analysts in Kraków
bun run .agents/skills/pracapl-search/cli/src/cli.ts search -q "data analyst" -l "Kraków" --format table

# Production workers, page 2
bun run .agents/skills/pracapl-search/cli/src/cli.ts search -q "pracownik produkcji" --page 2 --format table

# Full detail
bun run .agents/skills/pracapl-search/cli/src/cli.ts detail 11539387 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `date` is derived from the relative label, so it is approximate (hour or day
  precision); the original label is kept in `published`.
- Multi-word queries are matched as a phrase slug; if results are thin, try fewer words.
- Extra JSON fields: `published`, `tags` (work mode, contract, level, salary when shown).
