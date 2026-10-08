# JustJoin.it URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) disallows `/api/` and
`/oferty-pracy/*,*`; the listing and offer pages below are allowed.

## Search

```
GET https://justjoin.it/job-offers/<location-slug>?<params>
```

`<location-slug>`: `all-locations`, `remote`, or a slugified city (`krakow`, `warszawa`, `wroclaw`, ...).
The CLI uses `workplace=remote` rather than the `remote` path (same param works on RocketJobs).

| Param | Meaning | Example |
|-------|---------|---------|
| `keyword` | Free-text keyword | `python` |
| `workplace` | Workplace type | `remote`, `hybrid`, `office` |
| `experience-level` | Seniority | `intern`, `junior`, `mid`, `senior`, `manager`, `c-level` |
| `orderBy` + `sortBy` | Sort | `orderBy=DESC&sortBy=published` |
| `page` | Page (1-based, 50/page) | `2` |

(`workplaceType=` and `experienceLevel=` are silently ignored; use the names above.)

### Response

Next.js App Router HTML. The result list is in the streamed React Server Component
payload: concatenate the JSON-string argument of every `self.__next_f.push([1,"..."])`
script, then find `"offers":[` and bracket-match the array. Each offer:
`slug`, `title`, `companyName`, `city`, `multilocation[]{slug,city}`, `publishedAt`,
`lastPublishedAt`, `expiredAt`, `workplaceType`, `experienceLevel`, `requiredSkills[]`,
`employmentTypes[]{from,to,currency,currencySource,type,unit}`.

## Detail

```
GET https://justjoin.it/job-offer/<slug>
```

- `<script type="application/ld+json">` `JobPosting`: `title`, `datePosted`, `validThrough`,
  `employmentType`, `hiringOrganization.name`, `jobLocation`; `description` has its
  paragraph tags stripped (sentences run together).
- Rendered description: the `<div>` following `<h3 ...>Job description</h3>` keeps
  `<p>`/`<li>` structure — used for the readable `description`.
