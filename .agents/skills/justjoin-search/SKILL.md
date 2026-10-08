---
name: justjoin-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for IT / tech jobs in Poland on
  JustJoin.it (software development, data, DevOps, QA, security, PM, UX, AI/ML), by
  technology, city or remote, or fetch the full text of a JustJoin.it posting.
  Trigger phrases: IT jobs in Poland, developer jobs Warsaw/Kraków/Wrocław, JustJoin,
  Just Join IT, remote IT job Poland, praca IT, oferty pracy IT, praca programista,
  praca zdalna IT, justjoin.it oferta.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/justjoin-search/cli/src/cli.ts *)
---

# JustJoin.it Search Skill

Search live IT job offers on [JustJoin.it](https://justjoin.it), one of the largest
Polish tech job boards. No authentication, **zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing (`/job-offers/...`) and offer (`/job-offer/<slug>`) pages only.
robots.txt disallows `/api/`, so the JSON API is deliberately not used. Honest
User-Agent, backoff on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/justjoin-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keyword: technology, role or company (e.g. `"python"`, `"data engineer"`).
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Kraków"`, `"Wrocław"`, ...), slugified into the URL.
- `--remote <mode>` — workplace type: `remote` | `hybrid` | `onsite`.
- `--level <lvl>` — `intern` | `junior` | `mid` | `senior` | `manager` | `c-level`.
- `--sort newest` — newest first (implied by `--jobage`).
- `--jobage <days>` — published within N days (client-side on `publishedAt`; results are sorted newest first).
- `--page <n>` — 1-indexed page (50 per page).
- `--limit <n>` / `-n` — cap results (client-side).
- `--format json|table|plain` — default `json`.

### Detail

```bash
bun run .agents/skills/justjoin-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

The id is the offer slug from search (e.g. `rnrs-solutions-python-engineer-warszawa-python`)
or a full `justjoin.it/job-offer/<slug>` URL.

## Usage examples

```bash
# Python roles in Kraków
bun run .agents/skills/justjoin-search/cli/src/cli.ts search -q "python" -l "Kraków" --format table

# Data engineering, fully remote, last 14 days
bun run .agents/skills/justjoin-search/cli/src/cli.ts search -q "data engineer" --remote remote --jobage 14 --format table

# Senior Java developers in Wrocław, hybrid
bun run .agents/skills/justjoin-search/cli/src/cli.ts search -q "java" -l "Wrocław" --remote hybrid --level senior --format table

# Junior frontend roles in Gdańsk
bun run .agents/skills/justjoin-search/cli/src/cli.ts search -q "react" -l "Gdańsk" --level junior --format table

# Full detail
bun run .agents/skills/justjoin-search/cli/src/cli.ts detail rnrs-solutions-python-engineer-warszawa-python --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Extra JSON fields: `workplaceType`, `experienceLevel`, `salary` (original currency,
  per contract type), `skills`, `expires`. Multi-city offers list all cities in `location`.
- `--jobage` has no server-side equivalent; the CLI sorts by publication date and filters client-side.
- Same platform as `rocketjobs-search` (non-IT sister board); parsing anchors are in `url-reference.md`.
