---
name: infopraca-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Poland on
  infoPraca.pl, a general Polish job board (it also republishes many labour-office
  offers), or fetch the full text of an infoPraca posting. Trigger phrases: jobs in
  Poland, infoPraca, info praca, praca, oferty pracy, szukam pracy, praca w
  Wrocławiu, ogłoszenia o pracę.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/infopraca-search/cli/src/cli.ts *)
---

# infoPraca.pl Search Skill

Search live job offers on [infoPraca.pl](https://www.infopraca.pl). No authentication,
**zero runtime dependencies** (just `bun`).

## Personal use

Reads public search (`/praca?q=...`) and offer pages only; robots.txt disallows only
`/admin/`, `/candidate/`, `/employer/`. Honest User-Agent, backoff on 429/5xx; keep volume
low (the site occasionally drops connections under rapid requests).

## Commands

### Search

```bash
bun run .agents/skills/infopraca-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keywords (e.g. `"kierowca"`, `"specjalista ds. kadr"`).
- `--location <city>` / `-l` — city (`"Warszawa"`, `"Wrocław"`).
- `--jobage <days>` — published within N days (client-side on `datePosted`).
- `--page <n>` — 1-indexed page (10 on page 1; later HTML pages can carry a few more cards).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/infopraca-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the numeric offer id (e.g. `18307912`) or a `infopraca.pl/praca/<slug>/<city>/<id>` URL.

## Usage examples

```bash
# Drivers in Wrocław
bun run .agents/skills/infopraca-search/cli/src/cli.ts search -q "kierowca" -l "Wrocław" --format table

# Payroll roles in the last 7 days
bun run .agents/skills/infopraca-search/cli/src/cli.ts search -q "kadry i płace" --jobage 7 --format table

# Sales roles, page 2
bun run .agents/skills/infopraca-search/cli/src/cli.ts search -q "handlowiec" --page 2 --format table

# Full detail
bun run .agents/skills/infopraca-search/cli/src/cli.ts detail 18307912 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Page size is small (~10); raise `--page` rather than expecting big pages.
- Page 1 is parsed from the embedded schema.org ItemList, later pages from HTML cards
  (the site only embeds the ItemList on page 1).
- Some offers are republished from the labour-office database (company logo "Centralna
  Baza Ofert Pracy"); `cbop-search` has those at the source.
- Extra JSON fields: `validThrough`, `employmentType`, `category`, `snippet`.
