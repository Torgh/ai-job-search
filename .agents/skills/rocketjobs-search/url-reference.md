# RocketJobs.pl URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) disallows `/api/` and
`/oferty-pracy/*,*` (comma filter paths); the pages below are allowed.

## Search

```
GET https://rocketjobs.pl/oferty-pracy/<location-slug>?<params>
```

`<location-slug>`: `wszystkie-lokalizacje` or a slugified city (`warszawa`, `poznan`, ...).
(`/oferty-pracy/remote` does not work here — the connection was dropped in testing; the
site's own remote path is `praca-zdalna`. Use `workplace=remote` instead.)

| Param | Meaning | Example |
|-------|---------|---------|
| `keyword` | Free-text keyword | `ksiegowa` |
| `workplace` | Workplace type | `remote`, `hybrid`, `office` |
| `experience-level` | Seniority | `junior`, `mid`, `senior`, `manager`, `c-level` |
| `orderBy` + `sortBy` | Sort | `orderBy=DESC&sortBy=published` |
| `page` | Page (1-based, 50/page) | `2` |

### Response

Identical to JustJoin.it (same Next.js app): concatenate the `self.__next_f.push([1,"..."])`
strings, bracket-match `"offers":[...]`. Offer fields: `slug`, `title`, `companyName`,
`city`, `multilocation[]`, `publishedAt`, `expiredAt`, `workplaceType`, `experienceLevel`,
`requiredSkills[]`, `employmentTypes[]`.

## Detail

```
GET https://rocketjobs.pl/oferta-pracy/<slug>
```

- JSON-LD `JobPosting` (`datePosted`, `validThrough`, `hiringOrganization`, `jobLocation`;
  `description` without paragraph breaks).
- Rendered description: the `<div>` after `<h3 ...>Opis stanowiska</h3>`.
