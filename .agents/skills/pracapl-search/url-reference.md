# Praca.pl URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) disallows `/api/`, `/apply/`,
`/applying/`, `/employee/`, `/employer/`, panels and alerts; listing and offer pages are allowed.

## Search

| Case | URL |
|------|-----|
| Query | `https://www.praca.pl/s-<query-slug>.html` |
| Query + city | `https://www.praca.pl/s-<query-slug>,<city-slug>.html` |
| City only | `https://www.praca.pl/<city-slug>.html` |
| Neither | `https://www.praca.pl/oferty-pracy.html` |
| Page N | insert `_N` before `.html` (e.g. `s-ksiegowa,warszawa_2.html`) |

Slugs: lowercase, Polish diacritics folded (`ł`→`l`), non-alphanumerics → `-`.
(`,m-<city>` is also accepted and returned fewer results in testing — 14 vs 50 for
`ksiegowa` + Warszawa; its exact semantics are unverified, so it is not used.)

### Response

Server-rendered HTML. One card per `<li class="listing-v2__item[ --week| --highlight]">`:

| Field | Anchor |
|-------|--------|
| title + URL | `a.listing-v2__title[href]` (strip `#hash`; id = digits in `_<id>.html`) |
| company | `a.listing-v2__employer` (or text inside `.listing-v2__company`) |
| location | `.listing-v2__location` text (`title` attr has `Polska, <woj>, <city>`) |
| published | `.listing-v2__published` — relative Polish label |
| tags | `.listing-v2__tag-text` |

## Detail

```
GET https://www.praca.pl/x_<id>.html
```

Any slug resolves (redirects to canonical). JSON-LD `JobPosting` with HTML `description`
(headed sections, lists), `datePosted`, `validThrough`, `employmentType`,
`hiringOrganization`, `jobLocation`; `<link rel="canonical">` has the real URL.
