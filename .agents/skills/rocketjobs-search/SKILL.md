---
name: rocketjobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for non-IT white-collar jobs in
  Poland on RocketJobs.pl (finance and accounting, sales, marketing, HR, logistics,
  customer service, administration, engineering), or fetch the full text of a
  RocketJobs posting. Trigger phrases: jobs in Poland, accounting job Warsaw,
  marketing job Kraków, RocketJobs, praca, oferty pracy, praca księgowa, praca
  marketing, praca HR, praca handlowiec, rocketjobs oferta.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/rocketjobs-search/cli/src/cli.ts *)
---

# RocketJobs.pl Search Skill

Search live job offers on [RocketJobs.pl](https://rocketjobs.pl), the non-IT sister board
of JustJoin.it. No authentication, **zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing (`/oferty-pracy/<location>`) and offer (`/oferta-pracy/<slug>`) pages
only. robots.txt disallows `/api/` and comma filter paths, so neither is used. Honest
User-Agent, backoff on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keyword: role, skill or company (e.g. `"księgowa"`, `"handlowiec"`).
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Poznań"`, `"Gdańsk"`, ...), slugified into the URL.
- `--remote <mode>` — workplace type: `remote` | `hybrid` | `onsite`.
- `--level <lvl>` — `intern` | `junior` | `mid` | `senior` | `manager` | `c-level`.
- `--sort newest` — newest first (implied by `--jobage`).
- `--jobage <days>` — published within N days (client-side on `publishedAt`).
- `--page <n>` — 1-indexed page (50 per page).
- `--limit <n>` / `-n` — cap results (client-side).
- `--format json|table|plain` — default `json`.

### Detail

```bash
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

The id is the offer slug from search or a full `rocketjobs.pl/oferta-pracy/<slug>` URL.

## Usage examples

```bash
# Accountants in Warsaw
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts search -q "księgowa" -l "Warszawa" --format table

# Remote marketing roles, last 14 days
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts search -q "marketing" --remote remote --jobage 14 --format table

# Senior sales roles in Poznań
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts search -q "sprzedaż" -l "Poznań" --level senior --format table

# HR roles in Kraków
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts search -q "HR" -l "Kraków" --format table

# Full detail
bun run .agents/skills/rocketjobs-search/cli/src/cli.ts detail heko-ksiegowa-ksiegowy-czermno-finanse-ksiegowosc --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Same platform and parser as `justjoin-search`; only base URL and paths differ
  (`/oferty-pracy/wszystkie-lokalizacje`, `/oferta-pracy/<slug>`, heading "Opis stanowiska").
- Extra JSON fields: `workplaceType`, `experienceLevel`, `salary`, `skills`, `expires`.
