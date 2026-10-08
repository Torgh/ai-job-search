# SOLID.Jobs URL Reference

Verified live on 2026-10-08. robots.txt allows `/` for `*` (and explicitly for AI
crawlers); only `/management/` and `/admin/` are disallowed.

## Search (offer list)

```
GET https://solid.jobs/api/offers?division=<division>&sortOrder=default
Accept: application/vnd.solidjobs.jobofferlist+json, application/json
Content-Type: application/vnd.solidjobs.jobofferlist+json; charset=UTF-8
```

Without the vendor `Accept` header the endpoint answers 404. Divisions: `it`,
`engineering`, `marketing`, `sales`, `hr`, `logistics`, `finances`, `other`
(`finance` → 400).

Returns one JSON array with **every** active offer in the division (IT ≈ 2.7 MB). Fields:
`id`, `jobOfferUrl` (slug), `jobTitle`, `companyName`, `companyCity`, `companyAddress`,
`division`, `mainCategory`, `subCategory`, `experienceLevel`, `remotePossible`
(`"W całości"` = fully remote), `salaryRange{lowerBound,upperBound,currency,employmentType,salaryPeriod}`,
`requiredSkills[]{name,skillLevel}`, `requiredLanguages[]`, `validFrom`, `validTo`.

## Detail

```
GET https://solid.jobs/offer/<id>[/<slug>]
```

The slug is optional. JSON-LD `JobPosting` with HTML `description`, `datePosted`,
`validThrough`, `baseSalary`, `employmentType`, `jobLocation`, `jobLocationType`.
