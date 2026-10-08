# OLX.pl Praca URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) has `Disallow: /api/` but
`Allow: /api/v1/offers/` (plus `/api/v1/targeting/`, `/api/v1/friendly-links/`). Only
`/api/v1/offers/` is used. Geo endpoints (city name → `city_id`) are not allowed, which
is why location filtering is client-side.

## Search

```
GET https://www.olx.pl/api/v1/offers/?category_id=4&query=<text>&offset=<n>&limit=40&sort_by=created_at:desc
```

| Param | Meaning |
|-------|---------|
| `category_id=4` | Top-level "Praca" category |
| `query` | Free text |
| `offset`, `limit` | Paging (promoted ads may add a few extra rows) |
| `sort_by` | `created_at:desc`; omit for relevance |

Response: `{ data: [...], metadata: { total_elements, visible_total_count }, links: { next } }`.
Each ad: `id`, `url`, `title`, `description` (HTML), `created_time`, `last_refresh_time`,
`valid_to_time`, `status`, `business`, `user{company_name}`,
`location{city{name}, region{name}}`, `params[]{key, name, value{label}}` — keys include
`salary` (`value{from,to,currency,type,gross}`), `type` (work time), `agreement`,
`experience`, `driving_license`, ...

## Detail

```
GET https://www.olx.pl/api/v1/offers/<id>/
```

`{ data: <same ad object> }`. Ad page URLs (`/oferta/praca/<slug>-CID4-ID<code>.html`)
encode the id; the page embeds it as `"jobAd":{"job":{"id":<n>` (escaped) and
`ID: <!-- --><n>` — used to resolve URL input. The page also has a JSON-LD `JobPosting`
whose `datePosted` equals `last_refresh_time`.
