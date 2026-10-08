# Bulldogjob.pl URL Reference

Verified live on 2026-10-08. robots.txt (`User-Agent: *`) disallows `/auth`, `/account`,
`/feeds`, `/page`, ... but not `/companies/jobs/`.

## Search

```
GET https://bulldogjob.pl/companies/jobs/s/<seg>/<seg>/...
```

Each filter is a `name,value[,value]` path segment (values URL-encoded):

| Segment | Meaning | Example |
|---------|---------|---------|
| `skills,` | Technology (case-insensitive) | `skills,Python` |
| `city,` | City | `city,Kraków` |
| `role,` | Role | `role,backend`, `role,devops`, `role,data` |
| `experienceLevel,` | Level | `junior`, `medium`, `senior` |
| `order,published,desc` | Newest first | |
| `page,` | Page (1-based, 50/page) | `page,2` |

Not recognised (silently dropped by the site): `keyword,`, `query,`, `q,`, `experience_level,`,
`remote,`. There is no free-text search; see SKILL.md for the CLI's fallback.

### Response

Next.js HTML; `<script id="__NEXT_DATA__">` → `props.pageProps`:
`totalCount`, `jobs[]` with `id` (`<number>-<slug>`), `position`, `company.name`, `city`,
`remote`, `experienceLevel`, `technologyTags[]`, `denominatedSalaryLong{money,currency,hidden}`.
No publication date. The Apollo cache key `searchJobs({...})` shows the parsed filters —
useful to check that a segment was understood.

## Detail

```
GET https://bulldogjob.pl/companies/jobs/<id>
```

(`<number>` alone 308-redirects to the slugged URL.) JSON-LD `JobPosting` with HTML
`description`, `datePosted`, `validThrough`, `employmentType`, `hiringOrganization`, `jobLocation`.
