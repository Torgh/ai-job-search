---
name: solidjobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Poland on SOLID.Jobs,
  where every offer has a published salary range: IT, engineering and production,
  marketing, sales, HR, logistics, finance and other specialists; or fetch the full
  text of a SOLID.Jobs posting. Trigger phrases: jobs with salary Poland, SOLID.Jobs,
  solid jobs, praca z widełkami, oferty pracy IT, praca inżynier, praca finanse,
  praca logistyka, jawne wynagrodzenie.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/solidjobs-search/cli/src/cli.ts *)
---

# SOLID.Jobs Search Skill

Search live job offers on [SOLID.Jobs](https://solid.jobs). Every offer carries a salary
range. No authentication, **zero runtime dependencies** (just `bun`).

## Personal use

Uses the same `/api/offers` endpoint the site loads (robots.txt allows everything except
`/management/` and `/admin/`) and the public offer pages. Honest User-Agent, backoff on
429/5xx. One search = one request for the whole division; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/solidjobs-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — words matched (all must appear, diacritics ignored) in title,
  company, category and required skills.
- `--division <d>` — `it` (default) | `engineering` | `marketing` | `sales` | `hr` |
  `logistics` | `finances` | `other`.
- `--location <city>` / `-l` — matched against the office city/address.
- `--remote remote` — only offers that can be done fully remotely.
- `--level <lvl>` — e.g. `Junior`, `Regular`, `Senior` (case-insensitive).
- `--jobage <days>` — published within N days (client-side on `validFrom`).
- `--page <n>` — 1-indexed page (50 per page, newest first).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/solidjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the numeric offer id (e.g. `38992`) or a `solid.jobs/offer/<id>/<slug>` URL.

## Usage examples

```bash
# Python roles in Warsaw
bun run .agents/skills/solidjobs-search/cli/src/cli.ts search -q "python" -l "Warszawa" --format table

# Accounting roles (finance division)
bun run .agents/skills/solidjobs-search/cli/src/cli.ts search -q "księgowa" --division finances --format table

# Remote testers, last 7 days
bun run .agents/skills/solidjobs-search/cli/src/cli.ts search -q "tester" --remote remote --jobage 7 --format table

# Engineering & production roles in Gdańsk
bun run .agents/skills/solidjobs-search/cli/src/cli.ts search -q "mechanik" --division engineering -l "Gdańsk" --format table

# Full detail
bun run .agents/skills/solidjobs-search/cli/src/cli.ts detail 38992 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- All filtering is client-side over the full division list (the API has no text search).
- Extra JSON fields: `division`, `category`, `experienceLevel`, `remotePossible`, `salary`,
  `skills`, `languages`, `validTo`.
