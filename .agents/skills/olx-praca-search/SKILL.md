---
name: olx-praca-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search job ads in Poland on OLX.pl
  (category "Praca"): drivers, warehouse, production, construction, retail,
  hospitality, cleaning, care, seasonal and local jobs, or fetch the full text of an
  OLX job ad. Trigger phrases: jobs on OLX, OLX praca, ogłoszenia praca, praca
  fizyczna, praca od zaraz, praca kierowca, praca magazynier, praca sezonowa,
  dorywcza praca, olx.pl oferta pracy.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/olx-praca-search/cli/src/cli.ts *)
---

# OLX Praca Search Skill

Search live job ads in the [OLX.pl Praca](https://www.olx.pl/praca/) category — the
largest source of blue-collar, local and seasonal job ads in Poland. No authentication,
**zero runtime dependencies** (just `bun`).

## Personal use

Uses OLX's public offers API (`/api/v1/offers/`), which robots.txt explicitly allows
(the rest of `/api/` is disallowed and not used). Honest User-Agent, backoff on 429/5xx;
keep volume low.

## Commands

### Search

```bash
bun run .agents/skills/olx-praca-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — keywords (e.g. `"kierowca"`, `"magazynier"`, `"kelnerka"`).
- `--location <text>` / `-l` — city or voivodeship. Matched client-side against each ad's
  city/region; the CLI scans up to 4 API pages (160 ads) per `--page` to find matches.
- `--sort newest|relevance` — default `newest`.
- `--jobage <days>` — refreshed within N days (client-side; see Notes on dates).
- `--page <n>` — 1-indexed page (40 ads per API page).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/olx-praca-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the numeric ad id (e.g. `1053177609`), or pass the ad's
`olx.pl/oferta/praca/...-ID<code>.html` URL (resolved to the numeric id first).

## Usage examples

```bash
# Drivers in Poznań
bun run .agents/skills/olx-praca-search/cli/src/cli.ts search -q "kierowca" -l "Poznań" --format table

# Warehouse jobs refreshed in the last 7 days
bun run .agents/skills/olx-praca-search/cli/src/cli.ts search -q "magazynier" --jobage 7 --format table

# Waiting staff in Gdańsk
bun run .agents/skills/olx-praca-search/cli/src/cli.ts search -q "kelner" -l "Gdańsk" --format table

# Jobs anywhere in Małopolska
bun run .agents/skills/olx-praca-search/cli/src/cli.ts search -q "produkcja" -l "Małopolskie" --format table

# Full detail
bun run .agents/skills/olx-praca-search/cli/src/cli.ts detail 1053177609 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `date` is the ad's last refresh (`last_refresh_time`), which is what OLX's own JSON-LD
  publishes as `datePosted`; the original `created` time is a separate field.
- `company` is filled only for business accounts; ads by private persons have `null`
  (their names are deliberately not exposed).
- Ads frequently put contact phone numbers in the description; treat them as personal data.
- Extra JSON fields: `created`, `validTo`, `salary`, `workTime`, `contract`, `business`.
