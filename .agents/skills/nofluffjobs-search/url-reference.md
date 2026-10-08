# No Fluff Jobs URL Reference

Verified live on 2026-10-08. robots.txt (`User-agent: *`) allows `/` but disallows
`/api/`, `/posting/` and `/<lang>/posting/`; the pages below are allowed.

## Search

```
GET https://nofluffjobs.com/pl/?criteria=<criteria>&page=<n>
```

`criteria` is a space-separated list of `key=value` terms (quote values with spaces):

| Term | Meaning | Example |
|------|---------|---------|
| `keyword=` | Free text | `keyword=python` |
| `city=` | City slug or `remote` | `city=warszawa`, `city=remote` |
| `seniority=` | Level | `trainee`, `junior`, `mid`, `senior`, `expert` |
| `category=` | Category slug | `backend`, `frontend`, `devops`, `data`, `testing` |

### Response

Angular SSR HTML with `<script id="serverApp-state" type="application/json">` (transfer
state; older builds escape quotes as `&q;`). Path:
`STORE_KEY.searchResponse` → `totalCount`, `totalPages`, `postings[]`.

Each posting: `id`, `title`, `name` (company), `location.places[]{city,url}`,
`location.fullyRemote`, `posted` / `renewed` (epoch ms), `salary{from,to,currency,type}`,
`technology`, `seniority[]`, `category`. **`places[].url` is the detail slug.**

Pagination quirk: the state is cumulative — `page=2` returns ~60 postings, `page=3` ~80
(pages 1..N). The CLI slices `[(N-1)*20, N*20)`.

## Detail

```
GET https://nofluffjobs.com/pl/job/<slug>
```

JSON-LD `JobPosting` with full HTML `description`, `datePosted`, `employmentType`,
`baseSalary`, `hiringOrganization`, `jobLocation`, `skills[]{value,type}`.
