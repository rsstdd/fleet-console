# Fleet Console Delivery Roadmap

**Authority:** Historical only. This roadmap was consumed by the archived subordinate
plans and the current ADRs, specifications, implementation, TODOs, and READMEs they
produced.
**Status:** Done
**Archived:** 2026-08-20
**Superseded by:** Current ADRs 31–33, package and page specifications, implementation and
tests; the two unactivated proposals remain in `docs/05_plans/` as trigger-deferred plans.

## Outcome

Establish enforced decision-and-plan lifecycle rules first, then deliver reliable restart
recovery, browser-level evidence, honest disconnected fleet summaries, and a bounded
battery-history vertical slice. Then complete approved non-critical follow-ups and
reconcile repository documentation with verified behavior.

The sequence is mandatory where contracts or evidence depend on earlier work. Deferred
ideas remain trigger-bearing plans; they are not silently promoted into scope, decisions,
configuration, or public contracts.

## Binding delivery rules

Every phase follows these rules in addition to its linked plan:

1. **Resolve authority first.** Read the relevant scoped instructions, specification,
   decision mapping, and ADR. A conflict with a principle or ADR blocks the phase (P14).
2. **Work test-first at the cheapest reliable boundary.** Use pure, contract, component,
   process, and browser tests only where each provides distinct evidence (P10, P15).
3. **Decode external data at its boundary.** Changed HTTP, WebSocket, configuration, and
   browser payloads require runtime validation; types alone are insufficient (P2).
4. **Preserve authority and state distinctions.** The server owns freshness and protected
   behavior. Requested, observed, connection, resource, and view state remain separate
   and explicitly transitioned (P4, P7, P11).
5. **Keep ownership and dependencies intact.** Contracts own shared wire schemas; server
   owns runtime freshness and retention; shared UI stays presentational; features never
   import other features (P1, P3, P9).
6. **Specify complete user-visible async states.** Cover every applicable loading, empty,
   partial, stale, offline, recoverable-error, and terminal-error state without presenting
   stale data as current (P4, P5).
7. **Treat accessibility, performance, and observability as behavior.** Test semantics,
   keyboard/focus behavior, stable diagnostics, bounded data, and the agreed 500-robot
   claim. Use existing MUI and tenant tokens (P6, P8, P12, P13).
8. **Keep changes auditable.** Document exports and non-trivial coupling, make small
   reviewable diffs, preserve unrelated work, and create no commit (P14).

## Decision and documentation discipline

- Numbered ADRs are normative. `docs/decisions.json` maps D-ids, and
  `docs/PENDING_ARCHITECTURE_DECISIONS.md` is generated only with
  `pnpm docs:decisions`.
- With the register unchanged, D22 uses ADR 31, D23 uses ADR 32, and the combined
  history/retention question uses D24 / ADR 33. Re-read the register before creating each
  record. If another decision lands first, use the next available identifiers consistently.
- Once Phase 1 lands, every plan below carries a checked lifecycle status and update date
  (or a concrete trigger, for Phase 7); keep them current as phases close.
- Specifications describe current consequences, TODOs remaining work, and READMEs
  supported operation. Update implementation status only after acceptance evidence passes.
- Dated audits and archival findings remain historical; never rewrite them as current.
- Each phase synchronizes its ADRs, mapping and generated index when changed,
  specifications, root and scoped TODOs, and root and affected READMEs. The final audit is
  a backstop, not deferred phase documentation.

## Execution sequence

### Phase 0 — establish the baseline — **[DONE] 2026-08-20**

The baseline was recorded before decision allocation: D22 and D23 were the open stubs,
ADR 30 was latest, the subordinate plan set was reconciled, and unrelated worktree state
was preserved.

- Record the worktree state and preserve unrelated user changes.
- Run checks relevant to Phase 1 and distinguish pre-existing failures from regressions.
  Never weaken a check or edit an enforcement fixture merely to obtain green.
- Confirm D22 and D23 remain the only open registered decisions and ADR 30 remains latest.
  Otherwise recalculate allocations and update affected plans before continuing.
- Confirm all plans below agree on dependencies, active scope, and deferred triggers.
- Confirm the plan set in `docs/05_plans/` matches this roadmap's ten linked files exactly;
  otherwise update this roadmap before continuing.

Exit when the baseline and identifier allocation are recorded and no authority conflict
remains.

### Phase 1 — establish decision and plan lifecycle enforcement — **[DONE] 2026-08-20**

Executed the archived [lifecycle plan](../04_archive/DOCUMENT_LIFECYCLES.md) before the
ratifications below. `docs/DOCUMENT_LIFECYCLES.md`, its focused checker tests, and root
`AGENTS.md` are the current durable outputs.

- Define one process document that owns creation, execution, transition, and closure
  algorithms for durable decisions and implementation plans, with checked state
  definitions.
- Route root `AGENTS.md` decision-and-plan instructions through that process document.
- Give every active plan below a checked lifecycle status and update date; give each
  trigger-gated plan (Phase 7) a concrete, checked trigger.
- Require open decision stubs to name a next step, reject stale stub prose on resolved
  mappings, and require superseded ADRs to identify their replacement.
- Prove the guardrails fail with corrective messages under focused tests, wired into
  `pnpm check:architecture-docs`.
- Resolve, within this phase, whether the process document itself requires a registered
  decision and ADR, consistent with the meta-enforcement precedent of ADR 27–29; if so,
  allocate the next available identifier per the re-check instruction above.
- On verification, archive this plan under `docs/04_archive/` with the required archive
  metadata; the process document, its tests, and the updated agent instructions are the
  durable output, not the plan file itself.

Exit when the process document, its tests, and `AGENTS.md` routing are in place,
`pnpm check:architecture-docs` and formatting pass, and this plan is archived per its own
closure rule.

### Phase 2 — ratify and implement D22 stream recovery — **[DONE] 2026-08-20**

Executed [D22_RATIFY_AND_IMPLEMENT.md](../04_archive/D22_RATIFY_AND_IMPLEMENT.md)
(archived on completion) after Phase 1. ADR 31 ratified D22; the wire advanced to
version 2 with `serverSessionId` on snapshots and batches; the transport recovers
automatically under the full-jitter policy and was proven at unit, contract, and process
boundaries. The browser proof of restart recovery is owed to Phase 3 as its first
scenario.

This was first among product work because restart created an operator-visible
silent-update defect, and later browser scenarios must prove its recovery behavior.

- Ratify D22 with the retry, terminal-failure, and server-session policy.
- Advance and strictly decode affected snapshot/delta contracts.
- Join socket first and snapshot second, reconcile by server session, and recover
  automatically after restart without reload or operator action.
- On terminal disagreement, retain rows only as explicitly last-known, suppress row
  freshness, stop automatic retries, and expose immediate manual retry.
- Cover lifecycle transitions, races, stale callbacks, boundary cases, and restart at
  unit, contract, and process boundaries.

Exit when tests pass and the ADR, mapping/index, contracts, specifications, TODOs, and
READMEs agree with implementation.

### Phase 3 — ratify D23 and add browser evidence — **[DONE] 2026-08-20**

Executed [D23_PLAYWRIGHT.md](../04_archive/D23_PLAYWRIGHT.md) (now archived) after
Phase 2. D23 is ratified as ADR 32; the smoke suite passes 6/6 in Chromium and Firefox
locally with WebKit configured to run in CI; the 500-robot measurement reported its numbers
(9.79 Hz achieved, delta-to-paint p95 53.7 ms); cleanup and failure-artifact proofs ran.
One recorded departure: the harness serves the production build via `vite preview`,
because the dev build's render cost was measured to starve the browser (ADR 32).

- Ratify D23 and satisfy ADR 29 before adding Playwright.
- Build a deterministic real-stack harness with bounded startup, teardown, ports,
  artifacts, and failure diagnostics.
- Prove critical flows in the agreed browser matrix, including automatic D22 recovery
  after restart without Retry or reload.
- Measure the 500-robot live-stream path in Chromium without inventing an unowned gate.
- Update CI and the measured ADR consequences named by the subordinate plan.

Exit when the suite is repeatable locally and in CI-equivalent execution, artifacts are
usable, and dependency, decision, specification, TODO, and README surfaces are current.

### Phase 4 — qualify disconnected fleet counts — **[DONE] 2026-08-20**

Execute [FLEET_COUNTS.md](../04_archive/FLEET_COUNTS.md) after Phase 3 so its outage
behavior joins the committed browser suite.

> Done as planned. Six test-first fleetPage cases (five red before the change) drove a
> labelled section whose h2 reads "Fleet freshness" connected and "Fleet freshness · last
> known" otherwise, from the same `isStreamConnected` the row suppression uses; the
> Playwright outage scenario now asserts the qualified region and its four counts in a
> real browser (12/12 smoke across Chromium + Firefox). ADR 23's open question is resolved
> in place, fleet spec revision 5 records the semantics, fleet TODO A7 is closed, and the
> plan is archived. Note: the plan's "A8" label was a misnomer for TODO item **A7**.

- Amend ADR 23; create no new D-id or ADR.
- Keep counts visible in non-connected states only under the shared visible label
  `Fleet freshness · last known`.
- Keep the banner authoritative, suppress row freshness, and add no client freshness
  timer or invented aggregate timestamp.
- Prove the state matrix, retained counts, heading semantics, filtering invariants, and
  browser outage behavior.

Exit when ADR 23, the fleet specification, feature TODO, affected READMEs, tests, and
browser evidence describe the same behavior.

### Phase 5 — deliver battery history — **[DONE] 2026-08-20**

Execute [BATTERY_HEALTH_VERTICAL.md](../04_archive/BATTERY_HEALTH_VERTICAL.md).

> Done as planned, test-first at each boundary. D24 registered and ratified as ADR 33;
> ADR 6 amended where superseded. Contracts: `robotBatteryHistorySchema` with literal
> window/point-budget fields and cross-field count invariants (174 tests, 17 new).
> Server: compact `{receivedAt, batteryPercent | null}` retention at derived
> `HISTORY_CAPACITY = 3_001`, extrema-preserving decimation in `selectBatteryHistory`,
> and `GET /api/robots/:id/history` as the fifth route (186 tests, 23 new; G4/M4 closed).
> Web: `useRobotHistory` + the section-02 sparkline with every async and empty state
> named (313 tests, 18 new). The 50 Hz coupling is commented on both sides
> (`MAX_SOURCE_RATE_HZ` in server, `MAX_HZ` in simulator). The Playwright scenario
> proves the retained window survives a robot going silent (14/14 smoke across
> Chromium + Firefox). Retention memory measured, not gated: 89.5 MiB at 500 robots
> × 3,001 samples. Docs synced: robot-detail spec revision 7, package specs 00/01/04/05,
> simulator spec/README, READMEs, TODOs, FIXME F9 closed, decisions.json + index
> regenerated, and the plan archived.

- Register the combined history-response and retention-capacity question as the next D-id
  and ADR; amend ADR 6 only where prior retention consequences are superseded.
- Add a strict contracts-owned response and endpoint, bounded compact retention,
  deterministic extrema-preserving decimation, and no raw vendor-payload retention.
- Render an accessible robot-detail sparkline through existing boundaries and MUI tokens,
  with every applicable isolated async state defined and tested.
- Document and test the 50 Hz simulator/server capacity coupling on both sides.
- Verify the flow in a running browser using controlled data.

Exit when contract, server, domain, component, accessibility, and browser tests pass and
the complete decision/document closure set is current.

### Phase 6 — complete approved non-critical work — **[DONE] 2026-08-20**

These plans do not block Phases 2–5 and must not expand their scope.

1. Execute
   [REGRESSIVE_SEQUENCE_REPORTING.md](../04_archive/REGRESSIVE_SEQUENCE_REPORTING.md): add the stable,
   privacy-safe structured log event without a D-id, health-contract change, or
   misclassification under an existing counter. The `regressions` counter stays deferred
   until a real consumer requires coordinated contract versioning.
2. Executed [TEST_FILE_LAYER.md](../04_archive/TEST_FILE_LAYER.md) as documentation-only
   settlement: tests retain their production-layer classification. No ADR, universal test
   exemption, or fixture move was created.

Both subordinate plans are implemented and archived. The regressive-sequence slice emits
one safe event from the ingest path while the store retains ordering authority; focused
store, ingest, and live-composition tests pass in the 189-test server suite. Its
health-contract counter remains a separate consumer-triggered deferral. The named Phase 6
and roadmap closure checks pass; no browser run was added because neither subordinate
plan changes user-visible behavior.

Exit when each plan's focused evidence and named documentation updates pass. Do not invent
a browser requirement for documentation-only work or a public metric for the logging slice.

### Phase 7 — retain trigger-gated plans — **[DONE] 2026-08-20**

Both plans remain in `docs/05_plans/` as checked `Trigger-deferred` plans with observable
activation conditions. The decision register contains no entry for either proposal, and
current specifications, TODOs, and READMEs describe the work as unimplemented rather than
blocked or shipped.

- [HANDLE_MALFORMED_STREAM_FRAMES.md](../05_plans/HANDLE_MALFORMED_STREAM_FRAMES.md) activates only
  when the global stream-diagnostics surface is scheduled. Until then, allocate no D-id
  or ADR and add no contract-mismatch state or runtime policy. It does not block D22.
- [RATIFY_DEFER_SLOW_CLIENT_DRAIN.md](../05_plans/RATIFY_DEFER_SLOW_CLIENT_DRAIN.md) activates only
  after representative slow-client evidence or an explicit deployment-hardening need.
  Until then, allocate no D-id or ADR, configuration, health field, or runtime timeout.

When a trigger fires, re-evaluate the plan against then-current contracts, ADRs,
diagnostics design, and identifiers. A trigger is an entry condition, not ratification.

Exit by confirming both items are visibly trigger-deferred and are nowhere described as
blockers or implemented behavior.

### Phase 8 — reconcile documentation and hand off — **[DONE] 2026-08-20**

Executed and archived
[DOCUMENTATION_AUDIT_AND_RECONCILIATION.md](../04_archive/DOCUMENTATION_AUDIT_AND_RECONCILIATION.md).

That plan's instruction to keep D22 and D23 open applies only before their ratification.
Here, verify instead that their ADRs, mappings, generated index, implementation, and
closure claims agree.

- Audit non-archival READMEs, TODO/FIXMEs, plans, specifications, decision records, and
  documentation-bearing source comments against source and passing evidence.
- Classify every unresolved item as active blocker, actionable non-blocker,
  trigger-deferred item, or deliberate product cut.
- Reconcile stale package bootstrap claims and the server open-decision list without
  rewriting historical audits.
- Confirm the archived Phase 1 lifecycle plan carries the required archive metadata and
  that its process document, tests, and `AGENTS.md` routing remain current.
- Produce a concise handoff of behavior, evidence, open decisions, blockers, and triggers.

Exit when no document claims unimplemented behavior is shipped, no completed work remains
presented as blocked, and all ten subordinate plans agree with the final state.

#### Handoff

- **Behavior:** contracts strictly decode the version-2 session-aware fleet stream and
  battery-history response; the server runs five routes plus `/ws`, derives freshness,
  retains compact bounded history, and fans coalesced deltas; the console joins socket
  first, recovers automatically across restart, qualifies disconnected counts as
  last-known, and renders the isolated battery-history state matrix.
- **Evidence:** architecture, type-safety, doc-comment, token, dependency, lint/format,
  typecheck, serial unit/component test, build, bundle, and diff-size gates pass. The unit
  suites report contracts 174, adapters 227, server 189, simulator 211, and web 313 tests.
  The real-stack suite passes all 14 Chromium/Firefox scenarios locally; WebKit is
  unverified on this host because its GTK/GStreamer system libraries are absent, so the
  three-project command exits non-zero before any WebKit assertion; its project remains
  configured for CI.
- **Decisions and blockers:** every registered D1–D24 maps to an ADR; no registered stub is
  open. Submission AI-authorship/review evidence requires the author's external record.
  ADR 26's unauthenticated raw-diagnostics endpoint remains a deliberate deployment
  blocker, not UI authorization.
- **Actionable non-blockers:** fleet resource-state completion; robot-detail live updates
  and boundary-fixture cleanup; site-label authority; WebSocket origin policy; remaining
  server/stream measurements; and the manual screen-reader, responsive-theme, and
  forced-colors reviews.
- **Triggers:** malformed-frame escalation waits for a scheduled global diagnostics
  surface; slow-client drain waits for representative evidence or deployment hardening;
  a regressions health counter waits for a real consumer and coordinated contract version;
  batch/process scaling and virtualization wait for their recorded saturation or measured
  churn conditions.

Current plan state is deliberate: all eight consumed subordinate plans and this completed
roadmap are archived, while the two Phase 7 implementation plans remain trigger-deferred.
Phase 8 does not relabel deferred product work as implemented behavior.

## Verification matrix

Use the narrowest applicable commands within phases, then run the closure set below.

| Concern            | Required evidence                                                                   | Enforcement          |
| ------------------ | ----------------------------------------------------------------------------------- | -------------------- |
| Runtime decoding   | Valid, missing, malformed, boundary, extra-field, and version tests                 | Runtime, Types, Test |
| State and recovery | Deterministic transition/race tests and restart process/browser flow                | Types, Test          |
| Boundaries         | Lint rules and existing enforcement fixtures remain green                           | Static, Test         |
| Freshness honesty  | Server-derived fields, suppression, and last-known assertions                       | Runtime, Test        |
| Accessibility      | Names, roles, status, headings, keyboard, and focus                                 | Static, Test, Review |
| Performance        | Existing bundle gate and reported 500-robot measurement                             | Test, Review         |
| Observability      | Stable safe events/counters and deterministic emission tests                        | Runtime, Test        |
| Documentation      | ADR mapping/index check, source-backed status review, and lifecycle guardrail tests | Test, Review         |

```sh
pnpm check:architecture-docs
pnpm check:type-safety
pnpm check:doc-comments
pnpm check:tokens
pnpm check:dependencies
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
pnpm check:diff-size
git diff --check
```

Run `pnpm docs:decisions` whenever a mapping changes, before
`pnpm check:architecture-docs`. Run the Playwright command established by Phase 3 for
every later user-visible phase. Never claim checks that were not run; distinguish
environment limitations from product failures.

## Completion criteria

The roadmap is complete only when:

- Phase 1 establishes and archives the lifecycle process document; Phases 2–6 satisfy
  their linked plans and Phase 7 remains correctly gated;
- changed public contracts are strictly decoded, documented, versioned, and tested by all
  producers and consumers;
- no stale data is presented as current, and affected async surfaces have honest recovery;
- accessibility, dependency, performance, observability, and documentation enforcement
  pass without weakened rules or deleted fixtures;
- ADRs, mapping, generated index, specifications, implementation, TODOs, and READMEs agree;
- historical evidence and unrelated user changes remain intact; and
- no commit has been created.
