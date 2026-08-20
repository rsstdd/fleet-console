# FIXME — package/ADR audit findings

**Authority:** Historical. This audit backlog is retained for provenance; verify every claim against current ADRs and package specifications before acting.

**Audited:** 19 August 2026
**Re-audited:** 20 August 2026 — adapter-related findings re-checked against the tree.

This file records discrepancies found while comparing every package with ADRs 1–9 and
with [`packages/README.md`](./README.md). It separates actual conflicts from accepted
decisions that are simply incomplete. Package TODOs remain the detailed implementation
plans; this file is the cross-package reconciliation list.

**Re-audit outcome.** F1–F12 were each re-verified against source. F1–F11 remain open; **F12 was closed on 19 August 2026** by ADR 16. **F13, F14 and F15 were added on 19 August 2026** — by ADR 21, ADR 25 and ADR 26 respectively — and are the newer kind of finding this file should expect more of: not contradictions, but decisions that landed correctly ahead of the code that will consume them.
**F14 was closed on 20 August 2026**, by the work its own entry prescribed. No other finding was closed in the 20 August re-audit. The re-audit corrected statements in
[`README.md`](./README.md) that the code contradicts: a test that does not exist, an
undercount of the dependency arrows drawn ahead of the code, a health endpoint the
server does not serve, a dependency rule attributed to the build rather than to lint,
and a `<name>/TODO.md` row that does not hold for `web`. This pass additionally corrected
the universal-script wording and the classification of the unfinished server as a
library.

## Confirmed conflicts

### F1. Vendor B's web fixture violates ADR 1's resolved capability profile

**Assessment: incorrect implementation; open.**

ADR 1's observed consequence resolves Vendor B to `dock` and nothing else, explicitly
stating that its payload carries no lidar source data. The simulator follows that
decision. `packages/web/src/entities/robot/useRobotDetail.ts`, however, declares both
`dock` and `lidarHealth` for Vendor B, and its comment repeats the obsolete profile.

Fix the fixture and its capability-absence tests so all packages demonstrate the same
profile:

| Vendor | Declared capabilities             |
| ------ | --------------------------------- |
| A      | `dock`, `lidarHealth`, `sequence` |
| B      | `dock`                            |
| C      | `dock`, `waterLevel`, `sequence`  |

This is not permission to branch on vendor identity in rendering. The fixture chooses
wire input by vendor; the page must continue to render only from decoded capabilities.

### F2. ADR 9's runtime decision, implications, and package scripts disagree

**Assessment: internally contradictory ADR plus mismatched manifests; open.**

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

### F3. ADR implementation statuses and artifact notes are stale

**Assessment: incorrect ADR metadata/prose; open.**

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

### F4. The fixture detail model derives robot connectivity from freshness

**Assessment: fixture-only ADR conflict; open.**

`packages/web/src/entities/robot/useRobotDetail.ts` currently returns `unknown`
connectivity only for an unreachable robot and `online` otherwise. ADR 1 explicitly
defines reported robot connectivity, server-derived freshness, and console socket state
as three disjoint facts. Inferring one from another creates false telemetry even in a
fixture.

Give each fixture an explicit reported connectivity value, including at least one case
that proves connectivity and freshness can disagree. The real mapper already copies
`core.connectivity` correctly; preserve that behavior. The scoped entity TODO labels
the current inference an assumption and says it must not outlive the fixture. That
accurately limits the defect but does not make deriving one independent fact from the
other correct.

## Accepted decisions not yet implemented

These are legitimate unfinished work, not contradictions. Keep them visible in package
TODOs and the root TODO; do not “fix” them by weakening the ADR.

### F5. ADR 1 adapter boundary is incomplete

**Assessment: accurate plan, incomplete implementation; open.**

`packages/adapters` now depends on `@fleet/contracts`, publishes one representative
recorded representative and boundary fixtures per vendor, publishes one separately
hand-authored malformed payload per vendor, and implements the accepted-only unknown-field
ledger and path discovery. All three vendors now have loose schemas, adapters, and exact
contract tests; the exhaustive dispatch registry owns their shared process tally. The
cross-vendor normalization assertion and server ingest integration remain. Therefore
end-to-end dispatch evidence and HTTP health reporting do not yet exist. The simulator intentionally has
no production dependency on contracts/adapters; its test-only adapters dependency guards
the supported-vendor list (ADR 16).

### F6. ADR 2 and ADR 8 transport are not implemented server-side

**Assessment: accurate plan, incomplete implementation; open.**

The simulator emits one HTTP POST per reading and the server has a delta coalescer, but
the server does not declare Hono, `@hono/node-server`, or `ws`; has no listener; and
implements no HTTP routes, WebSocket scheduler, connection limits, backpressure, or
shutdown. `packages/README.md` now describes these as planned rather than present.

### F7. ADR 3 is not complete end to end

**Assessment: accurate plan, incomplete integration; open.**

Contracts and server primitives agree with the ADR: derivation is pure, uses
`receivedAt`, runs in the server sweep, and marks freshness-only changes. Missing:

- ~~composition wiring from the sweep's late-tick callback into `HealthMetrics`~~
  **closed 20 August 2026.** `startServer` in `packages/server/src/runServer.ts` builds
  the store, the delta set, the counters and the sweep together, routes `onLateTick`
  into `HealthMetrics.noteLateFreshnessTick`, and also emits a `freshness.tick_late`
  warning — because the counter alone is unreadable until the health endpoint exists,
  and ADR 3's stated failure is that a sweep which silently stops looks identical to a
  healthy fleet. The sweep starts after the listener binds and stops before it closes;
- health HTTP exposure;
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

### F8. ADR 5 remains partially implemented

**Assessment: accurate Partial status, incomplete alignment/evidence; open.**

The web uses MUI and CSS custom-property tokens and has no competing CSS framework.
Remaining alignment work is concrete:

- `FreshnessLabel` duplicates class styling with inline style objects and stale CSS;
- JavaScript `TENANT_PALETTE` duplicates values in `tokens.css`;
- the stylelint selector rule rejects spec-required BEM element names, requiring local
  suppressions;
- contrast/forced-colors evidence is not recorded.

Resolve these through the token/MUI boundary; do not introduce another styling system.

### F9. ADR 6 read transport and restart behavior remain unproved

**Assessment: compliant primitives, incomplete transport proof; open.**

The state and bounded-history structures comply: canonical envelopes enter the ring
buffer, raw payload is held separately, capacity is bounded at 60, and no database or
broker dependency exists. The future API must preserve those properties, return history
without raw payload, and describe restart loss honestly. Integration tests must prove
the transport does not leak diagnostic payloads into fleet, history, or deltas.

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

### F13. ADR 21's endpoint configuration is decoded everywhere and consumed nowhere

**Assessment: closed 20 August 2026. Both halves now have readers.**

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

### F11. Add focused READMEs where package behavior becomes consumable

**Assessment: documentation gap/recommendation; open.**

`contracts` and `simulator` have package READMEs. `adapters` and `server` currently have
only scoped guides/TODOs, which is acceptable while their public runtime behavior is
incomplete. Add their READMEs when the adapter registry and server process land,
covering public API, boundary behavior, commands, configuration, and failure modes.

**The adapters half is closed (20 August 2026).** The registry landed (adapters TODO
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
lives in `web/UI_PLAN.md` and three per-slice TODOs under `src/entities/robot`,
`src/features/fleet`, and `src/features/robot`. `packages/README.md` claimed
`<name>/TODO.md` for every package; that row has been corrected. `contracts` and
`adapters` additionally carry a `TODO_E2E_JOIN.md` alongside their `TODO.md`.

## Closure rule

Close a finding only after the relevant implementation, ADR status/consequences,
package README, focused tests, and—where user-visible—running-browser evidence agree.
Do not convert an incomplete decision into a documentation-only “implemented” claim.
