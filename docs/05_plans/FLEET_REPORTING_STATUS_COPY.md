# Fleet Reporting Status Copy

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-21

## Outcome

Production operator UI no longer displays "Freshness". The Fleet summary heading reads
"Fleet reporting status" while the stream is connected and "Fleet reporting status ·
last known" in any other state; the filter and the table column read "Reporting status".
The state labels "Live", "Stale", "Unreachable", and "Unknown" are unchanged, and
`pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` plus the
e2e smoke suite stay green with only the copy assertions updated.

## Scope

### In scope

- The three operator-facing placements in
  `packages/web/src/features/fleet/fleetPage.tsx`: the summary `h2` (line 115), the
  filter `InputLabel`/`Select` label (lines 200/203), and the table column header
  (line 256).
- Fleet page unit tests and the Playwright smoke assertions that quote the old copy.
- Durable documentation that quotes the old operator copy (see Documentation
  synchronization).

### Out of scope

- Canonical freshness fields, selectors, types, `FreshnessLabel`, internal IDs
  (`freshness-filter-label`), handler/prop names, and code comments — developer-facing
  and domain terminology remains "freshness" (ADR 3 vocabulary).
- The state words rendered by `FreshnessLabel` ("Live", "Stale", "Unreachable",
  "Unknown", "(last known)" chips).
- The development-only `/dev/ui` component gallery.
- Archived records under `docs/04_archive/` — historical text is not rewritten.
- Any change to public APIs, schemas, state values, data flow, filtering, connection
  handling, or accessibility structure. The summary section's accessible name changes
  because it is labelled by its heading; the structure does not.

## Authorities and dependencies

- ADR 3 (server-derived freshness — the domain term this plan deliberately keeps
  internal), ADR 23 (summary qualification — its quoted wording is amended, its
  position unchanged, per `docs/DOCUMENT_LIFECYCLES.md` "amend" step 1), ADR 32
  (Playwright evidence), Principle 4.
- Page spec `docs/01_page-specs/02_FLEET.md` (needs a revision entry), component spec
  02 (`FreshnessLabel` — unchanged).
- No decision work: no new dependency, no D-id, `docs/decisions.json` untouched.

## Execution

1. Update `packages/web/src/features/fleet/tests/fleetPage.test.tsx` first: the column-header
   list, the four summary-heading assertions (connected, reconnecting, disconnected,
   heading order), and new filter coverage via `getByLabelText("Reporting status")`.
2. Update `packages/web/e2e/smoke.spec.ts`: the connected heading assertion and the
   outage region/heading name "Fleet reporting status · last known"; last-known count
   assertions unchanged.
3. Replace the three placements in `fleetPage.tsx`; nothing else in code changes.
4. Synchronize the documents listed below in the same branch.

## Acceptance criteria

- [ ] `grep` over production Fleet JSX finds no rendered "Freshness"/"Fleet freshness"
      copy (tests, comments, and the dev gallery excluded).
- [ ] Unit tests assert both summary heading variants, the "Reporting status" filter
      label, and the "Reporting status" column header.
- [ ] Playwright smoke verifies the connected and outage copy through accessible roles
      and confirms last-known counts remain unchanged.
- [ ] `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` and
      `pnpm test:e2e` green; `pnpm check:architecture-docs` green.
- [ ] Every unverified item recorded honestly. Known: the e2e webkit project cannot
      launch on the development WSL host (missing system libraries); smoke evidence
      covers chromium and firefox.

## Documentation synchronization

- `docs/01_page-specs/02_FLEET.md` — Revision 6 entry; quoted heading and column copy
  in §§ 2, 3, 8, 9, 11. Concept prose keeps "freshness".
- `docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md` — amend the quoted
  heading strings in the resolved question and log; append a dated log line recording
  the wording amendment.
- `README.md` — summary-strip description's quoted headings.
- `docs/WIREFRAMES.md` — Fleet filter-bar wireframe label.
- `demo/DEMO.md`, `demo/demo.sh`, `demo/PROJECT_GUIDE.md` — narration and lists quoting
  the visible heading, filter, or column copy; domain prose keeps "freshness".
- `packages/web/src/features/fleet/TODO.md` — quoted headings in the A7 record.
- `docs/05_plans/SIMULATOR.md` — grep instruction quoting the outage-heading assertion.
- Unchanged: `docs/04_archive/`, `docs/DESIGN_SYSTEM.md`, component specs, package
  specs, `00_PAGE_SPECS.md`, `01_APP_SHELL.md` (domain vocabulary, not quoted UI copy).

## Verification

- `pnpm --filter web test`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm test:e2e` (operator-visible copy on an ADR 32-evidenced surface)
- `pnpm check:architecture-docs`

## Completion

Archive under `docs/04_archive/` once the implementation is merged and code, tests, and
the durable documents above all describe the new wording; add the archive date and name
the merged PR as replacement evidence.
