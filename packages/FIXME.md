# FIXME — package/ADR audit findings

**Authority:** Historical. This audit backlog is retained for provenance; verify every claim against current ADRs and package specifications before acting.

**Audited:** 19 August 2026
**Re-audited:** 20 August 2026 — adapter-related findings re-checked against the tree.

This file records discrepancies found while comparing every package with ADRs 1–9 and
with [`packages/README.md`](./README.md). It separates actual conflicts from accepted
decisions that are simply incomplete. Package TODOs remain the detailed implementation
plans; this file is the cross-package reconciliation list.

**Re-audit outcome.** F1–F12 were each re-verified against source. F1–F11 remain open; **F12 was closed on 19 August 2026** by ADR 16. **F13, F14 and F15 were added on 19 August 2026** — by ADR 21, ADR 25 and ADR 26 respectively — and are the newer kind of finding this file should expect more of: not contradictions, but decisions that landed correctly ahead of the code that will consume them.
**F14 was closed on 20 August 2026**, by the work its own entry prescribed.

**Fifth pass, later on 20 August 2026 — F9 closed.** Its two halves resolved by ADR: the
restart story by [ADR 31](../docs/00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md)
(server-session reconciliation, proved over real sockets and in real browsers) and the
history read by [ADR 33](../docs/00_adr/33_BATTERY_HISTORY_RETAINED_COMPACT_AND_SERVED_DECIMATED.md)
(compact retention at derived capacity 3,001, decimated `GET /api/robots/:id/history`,
sparkline on robot detail). Two findings remain open — **F10** a retained caution,
**F15** a decided product cut — plus **F8**'s one un-automatable bullet; **F16** closed
under ADR 34 on 20 August 2026.

**Fourth pass, 20 August 2026 — the last sweep.** **F7** and **F11** closed, **F8** down to
its one un-automatable bullet, and **F17** raised and fixed in the same pass. Findings
remaining open share one property — **none is a contradiction between documents and
code**: **F9** is real work behind a named ADR question, **F10** is a retained caution
rather than a defect, and **F15** is a decided product cut that is a release blocker by
design. (**F16**, once in that list, closed under ADR 34 later on 20 August 2026.) Three
assessment lines that still read "open" over struck-through bullets were corrected here;
that drift is the same shape as **F3** and is worth re-checking whenever a finding closes.

**Third pass, 20 August 2026 — the fixture fictions and the stale metadata.** **F1**
(vendor B declaring a capability no vendor B payload produces) and **F4** (connectivity
derived from freshness) are closed, both by checking the console's fixtures against what the
real adapters actually return rather than against an ADR — which is only possible now that
the adapters exist. **F2** and **F3** are closed too: two of F2's three bullets were retired
by the server gaining an executable process, and F3's stale ADR statuses were corrected with
dates. Six of fifteen findings remain open; none of the remaining six is a contradiction
between documents and code.

**Second pass, earlier on 20 August 2026 — the critical path closed, and with it four
findings.** **F5** (adapter boundary incomplete), **F6** (transport not implemented
server-side, except backpressure), **F13** (endpoint configuration with no reader) and the
composition-wiring bullet of **F7** are closed by the server's listener, ingest, sweep and
fan-out, and by the console's transport. **F9** is half closed: the no-leak property is
proved against a running server, while the history read and the restart story remain — both
blocked on named ADR questions rather than unwritten. Every closure in this pass was
checked against a running process, not against the diff; where only a unit test exists, the
entry says so.

The earlier re-audit corrected statements in
[`README.md`](./README.md) that the code contradicts: a test that does not exist, an
undercount of the dependency arrows drawn ahead of the code, a health endpoint the
server does not serve, a dependency rule attributed to the build rather than to lint,
and a `<name>/TODO.md` row that does not hold for `web`. This pass additionally corrected
the universal-script wording and the classification of the unfinished server as a
library.

## Confirmed conflicts

### F1. Vendor B's web fixture violates ADR 1's resolved capability profile — **CLOSED 20 August 2026**

**Assessment: was an incorrect implementation; fixed, and now checkable against the real adapter.**

ADR 1's observed consequence resolves Vendor B to `dock` and nothing else, explicitly
stating that its payload carries no lidar source data. The simulator follows that
decision. `packages/web/src/entities/robot/useRobotDetail.ts`, however, declares both
`dock` and `lidarHealth` for Vendor B, and its comment repeats the obsolete profile.

**Fixed 20 August 2026.** The fixture declares `dock` alone for vendor B, and the tests
moved with it: the "renders a panel only for a declared capability" case now uses R-118
(vendor A, which does declare lidar), a new case asserts B's narrower profile directly, and
`tenantPanelFlag.test.tsx` moved to R-118 too — it was hiding a lidar panel for a robot that
should never have had one, so it had been passing for the wrong reason.

What makes this different from a fixture edit is that the answer is no longer a matter of
reading an ADR. Decoding the recorded payloads through the real registry gives
`A: dock+lidarHealth+sequence`, `B: dock`, `C: dock+sequence+waterLevel`, so the console's
fixtures can be checked against the system rather than against a document. The original
instruction follows.

Fix the fixture and its capability-absence tests so all packages demonstrate the same
profile:

| Vendor | Declared capabilities             |
| ------ | --------------------------------- |
| A      | `dock`, `lidarHealth`, `sequence` |
| B      | `dock`                            |
| C      | `dock`, `waterLevel`, `sequence`  |

This is not permission to branch on vendor identity in rendering. The fixture chooses
wire input by vendor; the page must continue to render only from decoded capabilities.

### F2. ADR 9's runtime decision, implications, and package scripts disagree — **CLOSED 20 August 2026**

**Assessment: two bullets closed by the server landing; the third rests on a reading of ADR 9 the current text does not support.**

- _"server declares `tsx` but has no `dev` or `start` script and no executable process"_ —
  no longer true. Both scripts exist and run `src/main.ts`, which binds a port.
- _"`pnpm-workspace.yaml` approves `esbuild` … although no current script invokes it"_ —
  no longer true, and this was the bullet with teeth: an approved postinstall justified by
  behaviour that did not exist. `tsx watch src/main.ts` invokes it now.
- _"internally contradictory ADR"_ — the current text is not. ADR 9 § Decision reads
  "Packages that execute — `packages/server` now, `packages/simulator` **when it gains a
  workspace import** — run through `tsx`", stating the carve-out in the Decision itself
  rather than only in the Implications. The simulator still imports no workspace package in
  production (its adapters dependency is test-only, ADR 16), so `node --watch src/index.ts`
  remains correct under that sentence, and ADR 9's own open question — whether to move it
  early anyway — is the right home for what is left.

No ADR change was needed, which is worth recording: the finding prescribed narrowing a
decision that had already been written narrowly. The original text follows.

ADR 9's Decision says executable workspace packages run through `tsx`, not plain
`node`. Its Implications then carve out the simulator to keep `node` until it imports a
workspace package. The implementation follows the carve-out:

- simulator `dev` and `start` invoke `node`;
- server declares `tsx` but has no `dev` or `start` script and no executable process;
- `pnpm-workspace.yaml` approves `esbuild` because it says `tsx` is the workspace
  runtime, although no current script invokes it.

Reconcile the ADR before changing scripts. Either narrow the top-level decision to
source-exporting executables that consume workspace packages, preserving the explicit
simulator exception, or move every executable to `tsx`. Then make the manifests,
workspace comment, and package README say the same thing. Do not leave an approved
native build script and unused `tsx` dependency justified by behavior that does not
exist.

### F3. ADR implementation statuses and artifact notes are stale — **CLOSED 20 August 2026**

**Assessment: was incorrect ADR metadata; corrected.**

ADR 1 had already moved to Implemented. ADR 2, ADR 3 and ADR 6 were still saying "Not
started" while their mechanisms ran in production — the worst version of stale metadata,
since a reader checking whether the transport exists would have been told no by the document
that decided it.

- **ADR 2 → Partial.** HTTP ingest and WebSocket fan-out are built and measured; batch
  ingest and backpressure are not.
- **ADR 3 → Implemented.** The sweep runs from the composition root, freshness travels as a
  field, and per-robot suppression on stream loss was observed in a browser.
- **ADR 6 → Partial.** Manifest-seeded state and the bounded ring buffer are in use; the
  history read is unmounted and the ring capacity is still unchosen (**M4**).

Each status now carries the date it changed, so a later reader can tell a decision that was
reviewed from one never revisited. The stale artifact prose this entry names went in the
same pass: ADR 1's three "(not yet implemented)" artifact lines and ADR 3's "will contain
the sweep" all described a repository that no longer exists. The original text follows.

The code implements meaningful portions of decisions whose ADR headers still say “Not
started”:

- ADR 1: contracts and adapter-core mechanisms exist; vendor adapters do not. Status
  should be Partial, not Not started.
- ADR 2: delta coalescing and simulator HTTP emission exist; server HTTP/WebSocket
  transport does not. Decide whether the cross-package implementation state is Partial
  and state the boundary precisely.
- ADR 3: the pure function, validated configuration, manifest population, server sweep,
  late-tick callback, and freshness-only delta marking exist. Web disconnect suppression
  and live fan-out do not. Status should be Partial.
- ADR 6: the manifest-seeded current state and 60-entry ring buffer are implemented and
  even recorded under Observed consequences. The header still says Not started and
  Related still calls `packages/server` “not yet implemented.”

ADR 1 and ADR 3 also retain “not yet implemented” artifact/Notes prose after recording
implemented consequences. Update each ADR atomically so its header, artifacts, notes,
and observed consequences describe the same repository (Principle 14).

### F4. The fixture detail model derives robot connectivity from freshness — **CLOSED 20 August 2026, and its remedy corrected**

**Assessment: was a fixture-only ADR conflict; the inference is gone, and the fix it asked for turned out to be unconstructible.**

`packages/web/src/entities/robot/useRobotDetail.ts` currently returns `unknown`
connectivity only for an unreachable robot and `online` otherwise. ADR 1 explicitly
defines reported robot connectivity, server-derived freshness, and console socket state
as three disjoint facts. Inferring one from another creates false telemetry even in a
fixture.

**Fixed 20 August 2026.** `fixtureConnectivity` is deleted and the fixture reports a
constant `unknown`. The real mapper still copies `core.connectivity` unchanged, as this
entry required.

**The remedy this entry prescribed cannot be carried out, and that is a finding rather than
a shortfall.** It asked for "at least one case that proves connectivity and freshness can
disagree". No such case can be built: decoding all nine recorded payloads through the real
registry gives `connectivity: "unknown"` for every one, because **no vendor dialect reports
a link state at all** (ADR 30 § Implications). A fixture showing `online` would be the same
invention this entry objected to, wearing the other label. The disagreement case becomes
constructible only if ADR 30's open question — should the dialects report a link state? —
is answered yes, and it should be written then.

The original instruction follows, kept because its reasoning about the three disjoint facts
is why the inference was wrong in the first place.

Give each fixture an explicit reported connectivity value, including at least one case
that proves connectivity and freshness can disagree. The real mapper already copies
`core.connectivity` correctly; preserve that behavior. The scoped entity TODO labels
the current inference an assumption and says it must not outlive the fixture. That
accurately limits the defect but does not make deriving one independent fact from the
other correct.

## Accepted decisions not yet implemented

These are legitimate unfinished work, not contradictions. Keep them visible in package
TODOs and the root TODO; do not “fix” them by weakening the ADR.

### F5. ADR 1 adapter boundary is incomplete — **CLOSED 20 August 2026**

**Assessment: closed. The boundary is complete and consumed.**

`packages/adapters` now depends on `@fleet/contracts`, publishes one representative
recorded representative and boundary fixtures per vendor, publishes one separately
hand-authored malformed payload per vendor, and implements the accepted-only unknown-field
ledger and path discovery. All three vendors now have loose schemas, adapters, and exact
contract tests; the exhaustive dispatch registry owns their shared process tally. The
cross-vendor normalization assertion now exists, and `packages/server` dispatches every
reading through the registry: `POST /api/telemetry/:vendor` decodes with the adapter the
route segment selects, and `GET /api/health` serves the ledger per adapter with its scope
carried as data. Measured on one `pnpm dev` run, vendor C's `telemetry.firmware_channel`
reached 235 while A and B stayed at zero — the end-to-end dispatch evidence this finding
was waiting for. The simulator intentionally has no production dependency on
contracts/adapters; its test-only adapters dependency guards the supported-vendor list
(ADR 16).

### F6. ADR 2 and ADR 8 transport are not implemented server-side — **CLOSED 20 August 2026, with one part deliberately still absent**

**Assessment: closed for transport; backpressure remains open under a named ADR question.**

The server now declares `hono`, `@hono/node-server` and `ws`, each vetted in the ADR 29
allow-list and each landing with the code that imports it. It binds one port for HTTP and
`/ws`, serves the ingest route plus three reads, runs the fan-out scheduler at up to 10 Hz
on its own interval, and closes stream clients before the HTTP server on shutdown as ADR 8
§ Implications requires — asserted by rebinding the same port afterwards rather than by
inspection.

**Connection limits and backpressure are still absent**, and that is the one part of this
finding that survives: `DeltaFanOut` flushes to every console with a pending set and never
skips or drops one. Correct at ADR 2's stated scale of single-digit consoles, wrong the
moment a console stops reading. ADR 8 § Open questions asks whether the connection cap is
configuration or a constant and leans configuration "alongside the freshness policy" — but
`freshnessPolicySchema` is strict and ADR 3 § Constraints fixes its keys, so that means a
fourth key with an ADR 3 amendment or a new configuration surface. Tracked as server TODO
**H6b**; decide the surface before putting a number in the fan-out.

### F7. ADR 3 is not complete end to end — **CLOSED 20 August 2026**

**Assessment: was an accurate plan with incomplete integration; every bullet is now closed.**

The last one to fall was the browser proof, which ADR 23 could not reach because there was
no transport to kill. Headless Chrome against the running stack showed `{Live: 46, Stale: 4}`
under a connected banner, `{Unreachable: 50}` after the simulator stopped — banner still
connected — and, with the server stopped, every row retained with **no** per-robot freshness
label under a `Stream reconnecting` banner. That is the whole of ADR 3's guarantee, observed
rather than injected.

Contracts and server primitives agree with the ADR: derivation is pure, uses
`receivedAt`, runs in the server sweep, and marks freshness-only changes. Missing:

- ~~composition wiring from the sweep's late-tick callback into `HealthMetrics`~~
  **closed 20 August 2026.** `startServer` in `packages/server/src/runServer.ts` builds
  the store, the delta set, the counters and the sweep together, routes `onLateTick`
  into `HealthMetrics.noteLateFreshnessTick`, and also emits a `freshness.tick_late`
  warning — because the counter alone is unreadable until the health endpoint exists,
  and ADR 3's stated failure is that a sweep which silently stops looks identical to a
  healthy fleet. The sweep starts after the listener binds and stops before it closes;
- ~~health HTTP exposure~~ **closed 20 August 2026.** `GET /api/health` serves
  `lateFreshnessTicks` alongside the per-adapter counters, and the sweep also emits a
  `freshness.tick_late` structured warning — because a counter no route could read was
  itself the silence ADR 3 § Implications names as the failure;
- ~~WebSocket delivery of freshness-only deltas~~ **closed 20 August 2026.** A console
  connected to `/ws` receives a coalesced frame carrying the aged robot and nothing else;
  verified against a running server, not only in a unit test;
- a real console connection state. The console side is **now complete** (ADR 23):
  `ConnectionContext` in `shared/lib` carries the state from `app` to both features,
  and the default on both the context and `AppShell`'s prop is `disconnected` rather
  than the old optimistic `"connected"`. What is missing is only a transport that
  supplies a real value (fleet TODO **A3**), so today the console honestly reports
  itself disconnected;
- ~~suppression of per-robot labels while disconnected~~ — **closed 19 August 2026 by
  ADR 23.** Both pages now render `FreshnessLabel` only while the stream is connected,
  `reconnecting` included, with nothing substituted in its place. Four tests cover it
  and fail if the condition is removed;
- the targeted-drop and stream-loss browser proof. This is the item ADR 23 could not
  reach: with no transport there is nothing to kill, so the suppression is proved
  against injected states rather than a real socket.

The `Date.now()` calls used to construct web fixtures do not derive freshness and are
not themselves an ADR 3 violation; adding a client freshness timer would be.

### F8. ADR 5 remains partially implemented — **three of four bullets closed 20 August 2026**

**Assessment: alignment done; forced-colors evidence is the one bullet left, and it cannot be automated.**

The web uses MUI and CSS custom-property tokens and has no competing CSS framework.
Remaining alignment work is concrete:

- ~~`FreshnessLabel` duplicates class styling with inline style objects and stale CSS~~ —
  **closed 20 August 2026, with one residual named below.** The inline style objects are
  gone and the component renders classes only; `global.css` now styles the class names it
  actually renders. The stylesheet's old rules were worse than duplicated — they were
  **dead and contradictory**, targeting `.state` and `.age` (never rendered) and colouring
  freshness from the status palette, three lines under a comment saying freshness "does not
  share the status palette. It is carried by emphasis". The inline styles followed the
  comment; the CSS did not, and nothing failed because nothing matched.

  _Residual:_ one test got weaker. `freshnessLabel.test.tsx` asserted
  `text-decoration: underline dotted` on a stale timestamp, which it could only do because
  the component set it inline. jsdom loads no external stylesheet, so with the rule in CSS
  the test now asserts the modifier class instead, and **nothing checks that the stylesheet
  still carries the rule**. That is a real trade — duplicated-and-overriding styling for one
  unasserted CSS rule — and it is named here rather than glossed;

- ~~JavaScript `TENANT_PALETTE` duplicates values in `tokens.css`~~ — **closed 20 August 2026.** The duplication is unavoidable without a build step (CSS custom properties are
  the design source; MUI needs JavaScript values), so it is pinned instead:
  `scripts/checkTokens.mjs` fails CI if any of the nine colours disagrees between the two
  files, and fails if a new palette key is added that the check does not cover;
- ~~the stylelint selector rule rejects spec-required BEM element names, requiring local
  suppressions~~ — **closed 20 August 2026.** `selector-class-pattern` admitted
  `block` and `block--modifier` but not `block__element`, while
  `docs/02_component-specs/02_FRESHNESS_LABEL.md` writes the markup the stylesheet has to
  match and uses `__` throughout. Widened once, centrally, with the reason in the rule's own
  message — the alternative was a suppression on every rule that styles an element, which is
  the workaround this bullet objected to;
- ~~contrast/forced-colors evidence is not recorded~~ — **contrast closed 20 August 2026;
  forced-colors open.** The same script computes every WCAG ratio and gates on them: 4.5:1
  for text tokens on both backgrounds, 3:1 for status colours as non-text UI (1.4.11). It
  prints all eighteen ratios whether or not anything fails, so the evidence is in the run
  rather than in a document that rots (ADR 22's report-as-well-as-gate).

  **It found a real failure on its first run.** `--status-neutral` measured **2.84:1** in
  the dark theme, below the 3:1 non-text threshold, on a token used for a freshness dot and
  a chip. Lightened to `#767068` (3.34:1 on `--surface`, 3.66:1 on `--bg`) with the
  reasoning recorded beside it in `tokens.css`. Every other token already cleared.

  Forced-colors mode is still unrecorded and still needs a person.

Resolve these through the token/MUI boundary; do not introduce another styling system.

### F9. ADR 6 read transport and restart behavior remain unproved — **CLOSED 20 August 2026**

**Assessment: fully closed 20 August 2026.** The restart story closed under ADR 31 — a
restarted server is detected by its `serverSessionId` and re-joined from the new snapshot,
proved over real sockets in `runServer.test.ts` and against a really-restarted server in
the Playwright suite. The history read closed under ADR 33 — the ring buffer now holds
compact battery samples at derived capacity 3,001 (not 60 envelopes; the capacity question
**M4** resolved from the window and the source ceiling, not the point count), and
`GET /api/robots/:id/history` serves the retained minute decimated behind the
contracts-owned response. Original text follows.

The state and bounded-history structures comply: canonical envelopes enter the ring
buffer, raw payload is held separately, capacity is bounded at 60, and no database or
broker dependency exists.

**The no-leak property is now proved rather than owed.** The raw payload is served only by
`GET /api/robots/:id`, the types carry the exclusion rather than a rule each response has
to remember, and a running server was checked for `rawPayload` in the fleet response and in
a delta frame — neither carries it. The composition reads it through `store.diagnostic()`
rather than around it, which is what makes the outbound deep copy real (ADR 26).

**Still open, and both are decisions rather than omissions.** The history read is not
mounted, because ADR 6 ties the ring-buffer capacity to the sparkline's real decimated
point count and the sparkline is not built — picking a round number now is what that ADR
exists to prevent (server TODO **G4**, **M4**). Restart loss is still undescribed anywhere
a reader would find it: a restarted server begins at flush sequence zero and a client
holding a higher snapshot sequence discards everything until it catches up (ADR 18 § Open
questions). That is a real client-visible behaviour with no test and no documentation, and
as of 20 August 2026 it is owned: `packages/server/TODO.md` **H3c** carries it with three
candidate answers, because an ADR's open-questions section is not somewhere a client
implementer looks.

### F10. ADR 4 and ADR 7 enforcement is web-specific by decision

**Assessment: correct implementation caution, not a defect; retain until boundary
configuration changes are covered by a repeatable probe.**

The feature-sliced dependency rule and resolver are implemented and tested in web.
Boundary-violation fixtures under Node packages are deliberate negative tests, not
architecture violations. Do not delete or “repair” their illegal imports. If aliases or
workspace export maps change, rerun the enforcement probes because unresolved imports
can otherwise make the rule silently pass.

### F12. The simulator's restated vendor list is guarded by a test that does not exist — **CLOSED**

**Assessment: resolved 19 August 2026 by [ADR 16](../docs/00_adr/16_TEST_ONLY_ADAPTERS_DEPENDENCY_FOR_VENDOR_PARITY.md), which settled register D7.**

The finding was that `packages/simulator` restates `VENDOR_IDS = ["A", "B", "C"]` rather
than importing `@fleet/adapters` — correct, because a production import would invert the
dependency the package exists to exercise — but that the guard holding the duplication in
place did not exist. `simulatedRobot.ts` named a `vendorId.test.ts` that was nowhere in
the repository, and called the adapter type `VendorId` when the public type is
`SupportedVendor`. A named guard that was never written is worse than plain duplication:
it reads as verified.

What closed it:

- `packages/simulator/src/fleet/vendorId.test.ts` now exists, under the name the comment
  used. It asserts list equality including order, that every emitted vendor satisfies
  `isSupportedVendor`, that every supported vendor has a producer, and that a fleet built
  at `SUPPORTED_VENDORS.length` actually contains all of them.
- `@fleet/adapters` is a **dev** dependency of the simulator, banned in production code by
  `no-restricted-imports` and lifted for test files only.
- `src/__enforcement__/` probes the ban in both directions plus a control, so it cannot go
  inert the way ADR 7 records `boundaries/dependencies` doing.
- The comment in `simulatedRobot.ts` was rewritten; it no longer names a missing file or
  the wrong type.
- The corrected sentence in `packages/README.md` was restored to the claim it was
  originally making, which is now true.

Both drift directions were exercised before landing: a fourth vendor in `VENDOR_IDS`
alone fails two assertions, and one in `SUPPORTED_VENDORS` alone fails three.

### F13. ADR 21's endpoint configuration is decoded everywhere and consumed nowhere — **CLOSED 20 August 2026**

**Assessment: closed. Both halves now have readers.**

[ADR 21](../docs/00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md) closed
register **D13** and ended the state where three packages guessed at one address. What it
could not do is give the decoded values a consumer, because the two things that would read
them do not exist. Both halves are configuration that validates correctly and changes
nothing:

- **`FLEET_ALLOWED_ORIGINS` is validated and unenforced.** `parseRuntimeEndpoints` decodes
  it into `RuntimeEndpoints.allowedOrigins` — and, at the time of writing, nothing read the
  result. **Closed 20 August 2026:** `evaluateOriginPolicy` consumes the list, the listener
  mounts it ahead of every route (**B1d**), and **L8** asserts the grant and the decline
  through a bound socket.
- **`TENANT.endpoints` has no reader.** Both tenant profiles carry
  `{ apiBaseUrl: "/api", streamUrl: "/ws" }`, validated at module load and pinned by a
  test, and `packages/web/src/shared/lib` contained only `time.ts` at the time of writing.
  **Closed 20 August 2026:** `app/useFleetTransport.ts` builds the snapshot URL from
  `apiBaseUrl` and the socket URL from `streamUrl` plus the **page's** origin — never from
  configuration, since a console that knew the server's real address would stop being
  same-origin. Verified live through the dev proxy: `/api/fleet` returns the committed
  roster and `/ws` answers `101 Switching Protocols`.

**Why this is not a defect in ADR 21.** The alternative was to leave the addresses
hardcoded until their consumers arrived, which is precisely the state D13 recorded — a
simulator with a baked-in origin, a server that read no port, and a console that could not
express where its server was. Deciding ahead of the consumer was the point; the ADR says so
and names both gaps in its Implications. What would be a defect is _forgetting_, which is
what this entry exists to prevent.

**Do not close by deleting either value.** An unused validated value here is cheap and
reversible. Removing it would put the guess back.

**Closes when:** **B1d** enforces the allow-list with **L8** asserting a refusal (not only
a success), and **A3** builds its socket URL from `TENANT.endpoints.streamUrl` rather than
from a literal.

---

### F14. Every boundary-enforcement suite fails transiently under parallel load — **CLOSED**

**Assessment: real defect in a load-bearing test; resolved 20 August 2026.**

Observed three times on 19 August 2026 during full-workspace `pnpm test` runs, across
**two packages**:

- `packages/simulator/src/__enforcement__/enforcement.test.ts` —
  `rejects @fleet/adapters in production code (ADR 16)`, twice;
- `packages/server/src/__boundary-violation__/enforcement.test.ts` —
  `rejects wall-clock reads outside the clock module`, once.

Every one passed on re-run and in isolation. Nothing about either boundary changed between
the failing and passing runs, and `packages/adapters`' equivalent suite passes in isolation
too — it is not that one package's fixtures are wrong.

The mechanism is shared: these suites construct an `ESLint` instance with `ignore: false`
and lint **files on disk** while `pnpm --recursive` builds and writes other packages in
parallel. They are the only tests in the repository whose input is the live tree rather
than a fixture value, which is exactly what lets them fail for reasons unrelated to what
they assert. Treat this as a property of the pattern, not of one file: `packages/adapters`
has the same shape and has simply not been caught yet.

**Why this matters more than an ordinary flake.** ADR 7 records that
`boundaries/dependencies` sat inert for most of this repository's life while reporting
nothing, and that silence was indistinguishable from passing. This suite is the guard
against that recurring. A guard that fails at random is one somebody eventually marks
`skip` or deletes, and the deletion will look like housekeeping.

**Do not fix it by widening a timeout.** The failure was a query/lint timing artefact, not
a slow assertion, and a longer timeout hides it rather than removing it. The candidate
fixes are to point the ESLint instance at a stable copy of the fixtures rather than the
working tree, or to run this suite serially and say why in the config.

What closed it, on 20 August 2026:

- **The root `test` script runs packages one at a time** —
  `pnpm --recursive --workspace-concurrency=1 test`. Nothing else in the workspace is in
  flight while a suite lints the tree, which is the concurrency this finding is about. The
  whole price was measured before taking it: 18.1s serial against 13.0s parallel for all
  five packages, and the parallel run was never the faster one by enough to buy a flake.
- **The reason is stated in all four vitest configs** —
  `packages/adapters/vitest.config.ts`, `packages/server/vitest.config.ts`,
  `packages/simulator/vitest.config.ts` and `packages/web/vite.config.ts` — at the top of
  the `test` block, where someone restoring parallelism is standing when they do it. Root
  `package.json` carries the same note as `_test`, beside the script itself.
- **All four suites changed, not the two that were caught.** `packages/web`'s counts here:
  it has the same shape and the same seven cases linting the tree, and this finding says in
  as many words that not being caught is luck.
- **Each suite now takes one lint pass in `beforeAll` and asserts against that snapshot.**
  Its cases can no longer disagree about the tree, and the file has exactly one moment of
  contact with it. This is not a speed change — typescript-eslint builds its program once
  per process either way.
- **A fatal ESLint result now throws.** A parse or configuration failure produces a message
  with no rule id, and all four suites filtered on rule ids — so "ESLint could not run"
  arrived as "the rule did not fire", an accusation against an innocent boundary. That is
  the shape all five recorded occurrences had. Verified against a deliberate syntax error:
  `ruleId: null, fatal: true, "Parsing error: Variable declaration expected."`
- **No timeout was widened, and the per-case allowances are gone.** What remains is one
  hook budget per suite, documented as covering the single lint pass and not as a knob to
  turn when something fails.

The suites still lint files on disk, which is what makes them worth having. What they no
longer do is lint a tree something else is writing.

---

### F15. Raw vendor diagnostics ship unauthenticated, by decision, and that is a release blocker

**Assessment: decided, implemented, and deliberately incomplete; open until deployment is ruled out or authentication exists.**

[ADR 26](../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md)
closed register **D18** by choosing to bound the raw payload, keep it verbatim, and **not**
protect it — on the reasoning that the alternative safeguards are worse than their absence.
Redaction over a dialect nobody has catalogued cannot identify unknown secrets, and every
field it does strip is evidence the endpoint exists to show; authorization requires the
authentication capability `README` § 9 explicitly cuts.

So `GET /api/robots/:id` will serve the exact vendor message to anyone who can reach it,
and the robot-detail panel says so in as many words. That notice is asserted by tests,
including for a robot with no retained payload, because the endpoint is equally unprotected
either way.

**This entry exists so the decision cannot be inherited silently.** An honest statement in
a UI is the right answer for a local demonstration and the wrong one for anything reachable
by a stranger. The successor is already named — ADR 26 position 2, exact payload behind a
diagnostic permission — and its trigger is _any_ deployment beyond the demo, not a
judgement about how private the network looks.

**Do not close this by softening the notice**, and do not treat the technician toggle as
the access rule: it is presentation and authorizes nothing (Principle 7).

**Closes when:** either the single-robot diagnostic endpoint has a tested server-side
access rule, or a deliberate decision records that this repository will never be deployed
and the panel's notice is retained as the reason.

---

## Package README follow-ups

### F17. The 500-robot scale test was failing on a timeout it refuses to assert — **CLOSED 20 August 2026**

**Assessment: fixed 20 August 2026; recorded because the shape recurs.**

`fleetScale.test.tsx` renders 500 rows and its own header says it "does not assert a
duration, and does not publish one as a ceiling" — jsdom has no layout, paint or
compositor, so a millisecond figure from it would be a measurement against a fixture.

It was nonetheless failing on one. Two cases cost 3–4 s unloaded and crossed Vitest's **5 s
default** whenever the rest of the suite competed for the machine: green in isolation, red
in a full run, reproducibly. The file that refuses to assert a duration was gated by an
undeclared one.

**F14 warns against widening a timeout to make a transient failure go away, and this is not
that.** The cause is known and measured, and the number being replaced is a framework
default nobody derived — the thing ADR 22 objects to. The explicit 30 s is roughly eight
times the unloaded cost, chosen to be unreachable by scheduling noise and therefore never a
performance gate. If these tests ever approach it, the answer is to investigate the render.

**The shape to watch for:** a test whose stated philosophy is "no timing assertions" still
inherits one from its runner. Any expensive test in this repository has the same exposure.

### F16. Site labels are the console's last invented data — **CLOSED 20 August 2026**

**Assessment: real gap with no source; closed by ADR 34 (the first option below, taken as
a recorded decision).** The manifest widened to `{ sites, robots }` with strict
`{ siteId, label }` entries; the schema version advanced to "3"; `GET /api/fleet` carries
the directory; the simulator emits the same one and the ADR 14 parity test covers it byte
for byte. The console deleted `SITES` and resolves labels from the decoded directory —
`selectSiteLabel(siteId, sites)` — with the raw id only as a pre-snapshot fallback. The
shipped `SITE-NORTH`/`SITE-SOUTH`/`SITE-EAST` ids now label as "North site", "South
site", and "East site" in a real browser (Playwright smoke scenario).

The original finding, kept for the record:

Every other hook in the console reads the server. `entities/site/model.ts` still does not,
and it cannot: the committed fleet manifest carries a `siteId` per robot and **no label for
it**, so `SITES` is a hand-written list of four display names and `selectSiteLabel` matches
against it.

The consequence is visible rather than theoretical. The shipped manifest uses ids like
`SITE-NORTH`, which appear in no fixture, so the fleet table renders the raw identifier
through the fallback — correct behaviour (an identifier beats a blank), but it means the
label mechanism is dead code against real data while looking alive against fixtures.

Two ways to close it, and the choice is a decision rather than a cleanup:

- **Add a label to the manifest schema** (`config/fleet-manifest.json`, ADR 14). Site names
  become deployment configuration, which is where tenant-visible strings belong
  (Principle 13) — but it widens a schema two packages validate and ADR 14 makes the roster
  a parity join, so the simulator's generator changes with it.
- **Keep ids on screen and delete the label layer.** Honest, smaller, and defensible for an
  operations console where the id is what an operator says out loud. It contradicts
  `docs/01_page-specs/02_FLEET.md`, which specifies a site label column.

Until one is taken, do not "fix" this by extending the fixture list to match the shipped
manifest: that hides the gap behind data that agrees by hand, which is the class of error
**F1** and **F4** both were.

### F11. Add focused READMEs where package behavior becomes consumable — **CLOSED 20 August 2026**

**Assessment: documentation gap/recommendation; open.**

`contracts` and `simulator` have package READMEs. `adapters` and `server` currently have
only scoped guides/TODOs, which is acceptable while their public runtime behavior is
incomplete. Add their READMEs when the adapter registry and server process land,
covering public API, boundary behavior, commands, configuration, and failure modes.

**CLOSED 20 August 2026.** All four packages that needed one now have a README written
against what they actually do. `packages/server/README.md` landed once its precondition did
— its public runtime behaviour is a process rather than a set of pieces — and covers the
start commands, the two configuration files and three environment variables, the five
routes, the ingest ordering and _why it is an ordering_, a table of every failure mode with
what each is counted as, the five things the package refuses to do, and the measured costs.
`packages/web/README.md` replaced the Vite template verbatim-in-place: layers and the one
dependency rule that explains two otherwise-ornate designs, how data arrives and why the
order matters, the two failures the UI keeps apart, and the rendering rules worth knowing
before editing.

**The adapters half was closed earlier the same day.** The registry landed (adapters TODO
**C8**), which is what this finding was waiting for, and `packages/adapters/README.md`
now covers the dialect differences, `createAdapterRegistry` as the one public way in,
the two rejection kinds, and the measured cost of adding a fourth vendor. `server` is
still open on the same terms: its public runtime behavior is a set of pieces, not a
process, so a README would describe an HTTP surface nothing serves yet.

`packages/web/README.md` is still the Vite template — verbatim, down to the React
Compiler section and the `@vitejs/plugin-react-swc` link — and says nothing about the
console. Replace it now: the web package already has meaningful routes, architecture,
tests, and development commands even though its data source remains fixtures.

Related: `web` is also the one package with no top-level `TODO.md`. Its remaining work
lives in three per-slice TODOs under `src/entities/robot`,
`src/features/fleet`, and `src/features/robot`. `packages/README.md` claimed
`<name>/TODO.md` for every package; that row has been corrected. `contracts` and
`adapters` additionally carry a `TODO_E2E_JOIN.md` alongside their `TODO.md`.

## Closure rule

Close a finding only after the relevant implementation, ADR status/consequences,
package README, focused tests, and—where user-visible—running-browser evidence agree.
Do not convert an incomplete decision into a documentation-only “implemented” claim.
