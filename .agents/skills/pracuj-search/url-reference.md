# Pracuj.pl URL Reference

Verified live on 2026-10-08. robots.txt allows `/praca/` for `*` (disallows only
`/konto/`, `/L/`, static asset folders).

## Search

```
GET https://www.pracuj.pl/praca/<query>;kw/<city>;wp?<params>
```

Path segments (each optional, URL-encoded):

| Segment | Meaning | Example |
|---------|---------|---------|
| `<text>;kw` | Keywords | `python%20developer;kw` |
| `<city>;wp` | Workplace city | `Krak%C3%B3w;wp` |

Query params:

| Param | Meaning | Values |
|-------|---------|--------|
| `p` | Published within (days) | `1`, `3`, `7`, `14`, `30` (from the `periods` dictionary) |
| `rd` | Radius around city, km | `0`, `10`, `20`, `30`, `50`, `100` |
| `wm` | Work mode | `full-office`, `hybrid`, `home-office`, `mobile` |
| `pn` | Page number (1-based) | `2` |

Other params the site understands (not exposed): `cc` category, `et` position level,
`tc` contract type, `ws` work schedule, `salMin`.

### Response

HTML (Next.js). `<script id="__NEXT_DATA__">` JSON →
`props.pageProps.dehydratedState.queries[]` → the entry whose `queryKey[0] === "jobOffers"` →
`state.data`:

- `offersTotalCount` — total hits
- `groupedOffers[]` — 50 per page: `jobTitle`, `companyName`, `lastPublicated`,
  `initialPublicated`, `expirationDate`, `salaryDisplayText`, `workModes[]`,
  `typesOfContract[]`, `positionLevels[]`, `offers[]`
- `groupedOffers[].offers[]` — one per city: `partitionId` (the offer id),
  `offerAbsoluteUri`, `displayWorkplace`

## Detail

```
GET https://www.pracuj.pl/praca/x,oferta,<partitionId>
```

The slug before `,oferta,` is not validated. Page carries:

- `<script type="application/ld+json">` with a schema.org `JobPosting` (`datePosted`,
  `validThrough`, `employmentType`, `hiringOrganization`, `jobLocation`, `baseSalary`;
  `description` is often `null`, and list fields are comma-joined strings).
- `__NEXT_DATA__` → `dehydratedState.queries[0].state.data.textSections[]` —
  `{ sectionType, plainText, textElements[] }`; `textElements` keeps list items separate.
  Used to build the readable description.
- `<link rel="canonical">` with the real slug.
