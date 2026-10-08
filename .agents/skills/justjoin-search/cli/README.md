# justjoin-cli

CLI for searching IT job offers on JustJoin.it (Poland) - public pages, zero runtime dependencies.

**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> Public pages only, honest User-Agent (`justjoin-cli/1.0`), exponential backoff on 429/5xx.
> Personal use — keep volume low. Endpoints and parsing anchors: `../url-reference.md`.

## Installation

```bash
cd .agents/skills/justjoin-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--format json\|table\|plain`, default `json`) |
| `detail` | Full detail for one posting by id or portal URL (`--format json\|plain`) |

Run `bun run src/cli.ts --help` for every flag. All errors go to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`; unknown flags are rejected.

## Tests

```bash
bun run typecheck
bun run test       # offline flag-validation tests (what CI runs)
bun run test:live  # plus one live search + detail smoke test against the portal
```

See `../SKILL.md` for usage examples and portal notes.
