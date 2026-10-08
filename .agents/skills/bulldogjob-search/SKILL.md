---
name: bulldogjob-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for IT / tech jobs in Poland on
  Bulldogjob.pl, by technology, role, seniority, city or remote, or fetch the full
  text of a Bulldogjob posting. Trigger phrases: IT jobs Poland, Bulldogjob,
  bulldog job, developer jobs Warsaw/Kraków, remote IT job Poland, praca IT,
  oferty pracy IT, praca programista, praca zdalna IT.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/bulldogjob-search/cli/src/cli.ts *)
---

# Bulldogjob.pl Search Skill

Search live IT job offers on [Bulldogjob.pl](https://bulldogjob.pl). No authentication,
**zero runtime dependencies** (just `bun`).

## Personal use

Reads public listing (`/companies/jobs/s/...`) and offer (`/companies/jobs/<id>`) pages
only (allowed by robots.txt). Honest User-Agent, backoff on 429/5xx; keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — Bulldogjob has **no free-text search**. The query is first
  tried as a skill filter (works for technologies: `"python"`, `"java"`); if no skill by
  that name exists, the newest offers (3 pages, ~150) are scanned for the words in title,
  tags and company.
- `--skill <name>` — explicit technology filter; combine with `-q` to narrow further.
- `--role <slug>` — role filter: `backend`, `frontend`, `fullstack`, `devops`, `data`, `tester`, `pm`, ...
- `--level <lvl>` — `junior` | `mid` | `senior`.
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Kraków"`, `"Wrocław"`).
- `--remote remote` — only offers allowing fully remote work (client-side).
- `--jobage <days>` — listings carry **no date**, so this filter cannot drop anything at
  search time (JSON `meta.undated` reports it); use `detail` for `datePosted`.
- `--page <n>` — 1-indexed page (50 per page, newest first).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is from search (e.g. `257280-murex-tech-migration-senior-sme-luxoft-dxc`; the
leading number alone also works) or a `bulldogjob.pl/companies/jobs/<id>` URL.

## Usage examples

```bash
# Python in Kraków
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts search -q "python" -l "Kraków" --format table

# Senior DevOps, fully remote
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts search --role devops --level senior --remote remote --format table

# Words that are not a skill name: scanned in newest offers
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts search -q "data engineer" --format table

# Java backend in Warsaw
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts search --skill Java --role backend -l "Warszawa" --format table

# Full detail
bun run .agents/skills/bulldogjob-search/cli/src/cli.ts detail 257280-murex-tech-migration-senior-sme-luxoft-dxc --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `date` is always `null` in search results (not in the listing payload). For `/scrape`
  freshness, check `datePosted` via `detail` on promising hits.
- Bulldogjob is a small board (~400 offers in Poland at the time of writing).
- Extra JSON fields: `remote`, `experienceLevel`, `skills`, `salary` (when shown).
