# GoWork.pl URL Reference

Verified live on 2026-10-08. robots.txt (`User-Agent: *`) has `Allow: /` and disallows
`/oferta/*/aplikuj`, `/kandydat/`, `/logowanie/`, `/click-out/*` and similar; listing and
offer pages are allowed.

## Search

```
GET https://www.gowork.pl/praca/<query-slug>;st/<city-slug>;l/<n>;pg
```

Each segment is optional: `/praca/kierowca;st`, `/praca/warszawa;l`,
`/praca/kierowca;st/warszawa;l/2;pg`. Slugs are lowercase with diacritics folded.
40 cards per page.

### Response

Server-rendered Nuxt HTML. One card per `<div class="g-job-item" ...>`:

| Field | Anchor |
|-------|--------|
| title + URL | `<h3><a href="/oferta/<slug>,<id>,<city>">` |
| company | first `a.g-button.gray-link` (links to `/opinie_czytaj,<n>`) |
| location | `.g-job-location` → the `<span>` after the icon's `<span><svg>…</svg></span>` |
| date | text `Opublikowano: DD.MM.YYYY` |

## Detail

```
GET https://www.gowork.pl/oferta/<any>,<id>,<any>
```

Slug and city are not validated. JSON-LD `JobPosting` (`datePosted`, `validThrough`,
`employmentType`, `hiringOrganization`, `jobLocation`; `description` comma-joins all list
items). Rendered sections `div.g-job-offer-details-template__section` (h2 heading + `<li>`
items, plus the facts box) are used for the readable `description`.
`<link rel="canonical">` has the real URL.
