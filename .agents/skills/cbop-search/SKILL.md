---
name: cbop-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search job offers registered at Polish
  public labour offices (urzędy pracy) in the Central Job Offer Database (Centralna
  Baza Ofert Pracy, CBOP, oferty.praca.gov.pl), including EURES offers abroad, or
  fetch the full text of a CBOP offer. Trigger phrases: labour office jobs Poland,
  CBOP, praca.gov.pl, urząd pracy oferty, oferty pracy z urzędu pracy, Centralna Baza
  Ofert Pracy, oferty PUP, staż z urzędu pracy, EURES.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/cbop-search/cli/src/cli.ts *)
---

# CBOP (praca.gov.pl) Search Skill

Search the [Centralna Baza Ofert Pracy](https://oferty.praca.gov.pl) — every job offer
registered at Polish county/voivodeship labour offices, plus EURES offers abroad. Uses the
public REST API behind the official portal. No authentication, **zero runtime dependencies**.

## Personal use

oferty.praca.gov.pl publishes no robots.txt (404, i.e. no restriction). Honest User-Agent,
backoff on 429/5xx; keep volume low — it is a public-sector service.

## Commands

### Search

```bash
bun run .agents/skills/cbop-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q` — position name (substring match, e.g. `"kierowca"` also finds
  "operator kierowca samochodu specjalistycznego").
- `--location <place>` / `-l` — city, county or voivodeship (`"Kraków"`, `"mazowieckie"`),
  resolved with the portal's place lookup; an unknown place exits 1 with `UNKNOWN_LOCATION`.
- `--radius <km>` — distance around a city `--location` (e.g. `10`, `25`, `50`).
- `--abroad yes|no` — only offers abroad (EURES) / only in Poland.
- `--jobage <days>` — added to CBOP within N days (client-side on `dataDodaniaCbop`; results are newest first).
- `--page <n>` — 1-indexed page (50 per page).
- `--limit <n>` / `-n`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/cbop-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

The id is the 32-character hex offer id from search, or a portal URL ending in it.
Returns duties, required/desired qualifications, conditions (contract, hours, shifts,
salary), and how to apply (employer contact or the labour office handling the offer).

## Usage examples

```bash
# Drivers within 25 km of Kraków
bun run .agents/skills/cbop-search/cli/src/cli.ts search -q "kierowca" -l "Kraków" --radius 25 --format table

# Accountant offers in Mazowieckie, last 7 days
bun run .agents/skills/cbop-search/cli/src/cli.ts search -q "księgowa" -l "mazowieckie" --jobage 7 --format table

# EURES offers abroad for welders
bun run .agents/skills/cbop-search/cli/src/cli.ts search -q "spawacz" --abroad yes --format table

# Internships (staż) in Łódź
bun run .agents/skills/cbop-search/cli/src/cli.ts search -q "staż" -l "Łódź" --format table

# Full detail
bun run .agents/skills/cbop-search/cli/src/cli.ts detail c29105e561c5040c25effc5cd6e77515 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Searches by city also return offers whose workplace is "Cała Polska" (nationwide) —
  that is how the portal itself behaves.
- Some offers say "kontakt przez PUP": you apply through the labour office, not the employer.
- Offer `url` points to the portal SPA route `/portal/lista-ofert/szczegoly-oferty/<id>`
  (built the way the portal's own links are; the SPA renders it client-side).
- Extra JSON fields: `validTo`, `salary`, `contract`, `office`, `offerType`.
