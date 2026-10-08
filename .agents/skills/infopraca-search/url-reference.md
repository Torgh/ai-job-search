# infoPraca.pl URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) disallows `/admin/*`,
`/candidate/*`, `/employer/*` only.

## Search

```
GET https://www.infopraca.pl/praca?q=<text>&lc=<city>&pg=<n>
```

| Param | Meaning |
|-------|---------|
| `q` | Keywords |
| `lc` | Location (city name) |
| `pg` | Page (1-based, 10 per page) |

The search form also has `rg`, `ct`, `st`, `ws`, `dy`, `d` filters (not exposed; `dy`
looked like a period filter but returned no ItemList in testing).

### Response

- **Page 1:** `<script type="application/ld+json">` with `@type: ItemList`
  (`numberOfItems` = total) whose `itemListElement[].item` are `JobPosting`s with `title`,
  `url` (id = trailing digits), `datePosted`, `validThrough`, `employmentType`,
  `hiringOrganization.name`, `jobLocation.address`, short `description`.
- **Pages 2+:** no ItemList. Cards are `<article class="job-card" data-job-card-job-offer-id-value="<id>">`
  with `.job-card__title-link`, `.job-card__company`, `.job-card__meta-item` (location, work time),
  `time.job-card__date[datetime]`, `.job-card__description`.
- **Empty result:** `.search-page__empty-state` ("0 ofert pracy dla: …").

## Detail

```
GET https://www.infopraca.pl/praca/<any>/<any>/<id>
```

Slug segments are not validated. JSON-LD `JobPosting` (description with all markup and
line breaks stripped). The rendered body `<article class="job-detail__body">` keeps the
employer's template (headings, lists) and is used for the readable `description`.
