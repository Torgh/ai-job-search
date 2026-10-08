---
name: nofluffjobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for IT / tech jobs in Poland on
  No Fluff Jobs (every offer shows a salary range): backend, frontend, DevOps, data,
  testing, PM, UX, support; by technology, city, seniority or remote; or fetch the
  full text of a No Fluff Jobs posting. Trigger phrases: IT jobs Poland, No Fluff
  Jobs, nofluffjobs, developer job with salary, praca IT, oferty pracy IT, praca
  programista, praca zdalna IT, widełki wynagrodzeń.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts *)
---

# No Fluff Jobs Search Skill

Search live IT job offers on [No Fluff Jobs](https://nofluffjobs.com/pl). No
authentication, **zero runtime dependencies** (just `bun`).

## Personal use

Reads the public listing (`/pl/?criteria=...`) and offer (`/pl/job/<slug>`) pages only.
robots.txt disallows `/api/` and `/pl/posting/`, so neither is used. Honest User-Agent,
backoff on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keyword: technology, role or company.
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Kraków"`, ...) or `"remote"`.
- `--remote remote` — fully remote offers only (same as `--location remote`).
- `--level <lvl>` — `trainee` | `junior` | `mid` | `senior` | `expert`.
- `--category <slug>` — NFJ category, e.g. `backend`, `frontend`, `devops`, `data`, `testing`.
- `--jobage <days>` — posted within N days (client-side on `posted`).
- `--page <n>` — 1-indexed page (20 per page).
- `--limit <n>` / `-n` — cap results (client-side).
- `--format json|table|plain` — default `json`.

### Detail

```bash
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

The id is the offer slug from search (e.g. `lead-python-developer-mindbox-krakow`) or a
full `nofluffjobs.com/pl/job/<slug>` URL. Returns the description, salary, contract and skills.

## Usage examples

```bash
# Python roles in Warsaw
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "python" -l "Warszawa" --format table

# Senior DevOps, fully remote
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "devops" --remote remote --level senior --format table

# Junior testers in Wrocław
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search --category testing -l "Wrocław" --level junior --format table

# Data roles posted in the last 7 days
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "data engineer" --jobage 7 --format table

# Full detail
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts detail lead-python-developer-mindbox-krakow --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `date` is the original `posted` time; `renewed` (bump date) is a separate JSON field.
- The server-rendered state is cumulative ("load more"): `?page=N` returns pages 1..N, so
  the CLI slices out page N (20 per page).
- Keyword search is broad (NFJ also matches related offers); totals can be large.
- Extra JSON fields: `salary`, `technology`, `seniority`, `category`, `renewed`.
