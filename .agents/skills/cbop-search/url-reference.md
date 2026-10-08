# CBOP (oferty.praca.gov.pl) API Reference

Verified live on 2026-10-08. `https://oferty.praca.gov.pl/robots.txt` → 404 (no policy).
Endpoints come from the portal's Angular bundle (`basePath` = `/portal-api`).

## Search

```
POST https://oferty.praca.gov.pl/portal-api/v3/oferta/wyszukiwanie?page=<0-based>&size=50&sort=dataDodaniaCbop,desc
Content-Type: application/json

{ "kodJezyka": "PL", "stanowiska": ["kierowca"],
  "miejscowosci": [{ "miejscowoscId": "0950463", "zasieg": 25 }] }
```

Body fields used: `stanowiska[]` (position text), `miejscowosci[]{miejscowoscId,zasieg}`,
`powiatyId[]`, `wojewodztwaId[]`, `czyZagranica` (bool). The bundle's `mapFilterParams`
also knows `rodzajeUmowy`, `trybyPracy`, `wymiarEtatu`, `wynagrodzenieOd`, `zawody`,
`wyksztalcenieList`, `jezykObcyList`, `zatrudnienieOdZaraz`, ... (not exposed).

Response: `{ status, msg, payload: { iloscMiejscPracy, ofertyPracyPage: { content[], totalElements, totalPages, number, size } } }`.
Each offer: `id` (32 hex), `stanowisko`, `pracodawca`, `miejscePracy`, `dataDodaniaCbop`,
`dataWaznOd`, `dataWaznDo` (all `DD.MM.YYYY`), `wynagrodzenie`, `rodzajUmowy`,
`placowkaOpis` (labour office), `typOferty`, `zakresObowiazkow`, `wymagania`.

## Place lookup

```
GET https://oferty.praca.gov.pl/portal-api/v3/autocomplete/miejsce?name=<text>&limit=10&returnMiejscowosc=true&onlyPoland=true
```

`payload[]{ kod: "MIEJSCOWOSC:0950463" | "POWIAT:<id>" | "WOJEWODZTWO:<id>", opis }`.
The CLI prefers the hit whose `opis` starts with the exact name.

## Detail

```
GET https://oferty.praca.gov.pl/portal-api/v3/oferta/szczegoly/<id>
```

`payload`: `danePodstawowe{id,status,stanowisko,numer}`, `danePozostale{dataDodania,dataWaznosci,liczbaWolnychMiejsc}`,
`pracodawca{nazwa,adres,email,nrTelefonu,sposobAplikowania,wymaganeDokumetny,nazwaUrzeduPracy}`,
`warunki{miejscePracySkrot,zakresObowiazkow,rodzajUmowy,wymiarEtatu,zmianowosc,wynagrodzenieBruttoOdCzas,zawod,dataRozpoczecia}`,
`wymagania{konieczne,pozadane,dodatkowe}{jezyk[],uprawnienie[],wyksztalcenie[],zawod[]}`, `urzad{...}`.

## Web URL

The portal is an SPA; the list component links offers as `szczegoly-oferty/<id>` relative
to `/portal/lista-ofert`, hence `https://oferty.praca.gov.pl/portal/lista-ofert/szczegoly-oferty/<id>`.
The server returns the SPA shell for any path, so this URL cannot be verified by a plain fetch.
