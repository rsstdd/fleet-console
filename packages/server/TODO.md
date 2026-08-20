# TODO — bootstrapping `packages/server`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the server package specification govern conflicts.

**Created:** 19 August 2026
**Scope:** this package only. Work owned elsewhere is marked with the package that owns it.
**Governing documents:** [`AGENTS.md`](./AGENTS.md) (authoritative scoped guide), [`../../PRINCIPLES.md`](../../PRINCIPLES.md), [ADR 1](../../docs/00_adr/01_ADAPTER_BOUNDARY.md), [ADR 2](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md), [ADR 3](../../docs/00_adr/03_FRESHNESS.md), [ADR 6](../../docs/00_adr/06_BOUNDED_IN_MEMORY_HISTORY_NO_DB.md).

This package is the runtime authority for four things the rest of the system cannot
provide for itself: the receipt instant (`receivedAt`), the freshness sweep, the
coalesced delta stream, and the health counters. It is deliberately thin — the README
weights it "thin: produce dialects, inject faults, fan out deltas. No more." Thin is a
budget, not a licence to skip the boundary: every rule in Sections 4 through 9 exists
because a shortcut there is visible in the console as a lie about data age.

---

## Section 0 — What already exists

Landed with this bootstrap, verified from `packages/server`:

| Command          | Result                           |
| ---------------- | -------------------------------- |
| `pnpm typecheck` | passes                           |
| `pnpm lint:js`   | passes                           |
| `pnpm lint`      | passes (`lint:js` + `typecheck`) |
| `pnpm test`      | passes — 15 files, 98 tests      |
| `pnpm build`     | passes (`tsc --noEmit`)          |

```
packages/server/
├── package.json          @fleet/server, source-exported, catalog-pinned deps, zod only
├── tsconfig.json         extends ../../tsconfig.base.json; node types, no DOM lib
├── vitest.config.ts      node environment, fake timers pre-armed, v8 coverage
├── eslint.config.js      eight enforced package rules (§ 10)
├── TODO.md               this file
└── src/
    ├── index.ts                    public entry point
    ├── runtime/clock.ts            Clock, systemClock, fixedClock, manualClock
    ├── state/ringBuffer.ts         bounded per-robot history (ADR 6)
    ├── state/currentStateStore.ts  manifest-seeded state, idempotent upsert (ADR 6)
    ├── fanout/pendingDeltas.ts     per-robot delta coalescing (ADR 2)
    ├── freshness/freshnessSweep.ts recurring sweep + late-tick detection (ADR 3)
    ├── health/healthMetrics.ts     counters by scope (ADR 25)
    ├── ingest/selectVendor.ts      route segment → adapter, before the body (ADR 8)
    ├── ingest/errorResponse.ts     the one HTTP error body, in ContractIssue (ADR 20)
    ├── ingest/requestSizeLimit.ts  byte cap ahead of JSON.parse (ADR 26)
    ├── config/freshnessPolicy.ts   validated sweep thresholds (ADR 3, Principle 13)
    ├── config/fleetManifest.ts     strict roster loader (ADR 14)
    ├── config/runtimeEndpoints.ts  host/port/origins from the environment (ADR 21)
    └── config/serverConfiguration.ts  the two files loaded together, strictly
```

**None of this listens.** Every module above is framework-independent by design —
required by an accepted ADR, testable without a socket, and correct without an HTTP
library. What does not exist is the process that composes them: no listener, no route, no
socket, no `dev` script. Sections 4, 7 and 8 are that work.

On the four earliest pieces, whose reasoning is worth keeping:

- **`clock.ts`** is the only module in this package permitted to read the wall clock,
  enforced by lint. Everything else takes a `Clock`. This is what makes the sweep,
  late-tick detection, coalescing and shutdown testable with fake timers instead of
  wall-clock sleeps (AGENTS.md § Tests).
- **`ringBuffer.ts`** answers ADR 6's open question — array with a write cursor, not a
  deque — with one allocation at construction and none per write. **The capacity is
  still unchosen**; see **C2**.
- **`pendingDeltas.ts`** takes whatever state the caller marks rather than diffing two
  states, specifically so a freshness-only transition can enter the set. A class that
  decided for itself whether a change was "real" would get exactly that case wrong
  (ADR 3 § Implications).
- **`freshnessPolicy.ts`** is strict: an unrecognized key is a startup failure, and the
  ADR 3 baseline is exported as documentation and test evidence, explicitly **not** as a
  fallback default. A server that silently runs a policy nobody deployed is the failure
  Principle 13 names.

Deliberately **not** added: no HTTP framework, no WebSocket library, no `dev` script.
The first two need an ADR (**B1**); the third would break the root `pnpm dev` fan-out
until there is something to run.

---

## Section 1 — Blocked on other packages

Nothing in Sections 4 through 8 can be finished before these. Do not work around them by
declaring a local canonical envelope or a local freshness function — that is the
duplicate-authority failure Principle 1 exists to prevent, and ADR 3 § Observed
consequences records the repository already making that mistake once.

- [x] **A1 — [contracts] Bootstrap `@fleet/contracts`.** The package and public entry
      point now exist and are linked as a workspace dependency.
- [x] **A2 — [contracts] Canonical envelope type, Zod schema, and the capability wire
      transform.** These now ship from the contracts public entry point.
- [x] **A3 — [contracts] The pure freshness function.** `deriveFreshness` now remains in
      contracts while this package owns only the recurring caller.
- [x] **A4 — [adapters] Vendor adapters and the dispatch registry. Done 20 August 2026.**
      The public registry exists and the deep-import ban remains enforced by lint (§ 10).
      Server consumption is deferred until ADR 10 and ADR 11's open questions are resolved;
      do not copy a vendor fixture locally to make the ingest test possible.
- [x] **A5 — [adapters] The registry-owned unknown-field ledger exists.** The registry
      owns one process tally. Health serialization remains deferred under **G3** because
      ADR 30 has not selected `SupportedVendor` versus software `adapterId` as the response
      key.

---

## Section 2 — Transport dependencies (decided)

ADR 2 decided the _transports_; [ADR 8](../../docs/00_adr/08_SERVER_TRANSPORT_IMPLEMENTATION.md)
now decides what implements them. The listener is unblocked.

- [x] **B1 — Decided: Hono + `@hono/node-server` + `ws`**, recorded in
      [ADR 8](../../docs/00_adr/08_SERVER_TRANSPORT_IMPLEMENTATION.md). Three runtime
      dependencies, one port — `ws` attaches to the Node server `@hono/node-server`
      exposes. Hono is used as a router only: its validators and typed RPC client are
      deliberately unused, because request bodies stay `unknown` until a
      `@fleet/contracts` schema decodes them, and a second validation layer would be a
      second decode authority (Principles 1 and 2). `node:http` alone was the runner-up
      and remains the fallback if the route count shrinks or the `ws` upgrade path breaks.
- [ ] **B1a — Add the transport dependencies and write the listener.** `hono`,
      `@hono/node-server`, `ws` as dependencies; `@types/ws` as a devDependency. Close
      socket clients before closing the HTTP server on shutdown, or in-flight frames are
      dropped on a listener that no longer exists (ADR 8 § Implications). Bind
      host and port from `loadRuntimeEndpoints()` (**C5**, ADR 21) — never a literal, and
      never `0.0.0.0` by default: the loopback default is what keeps an unauthenticated
      ingest endpoint serving raw vendor payloads off every interface (**D18**).
- [ ] **B1d — Enforce the origin allow-list the configuration already validates.** ADR 21
      decodes `FLEET_ALLOWED_ORIGINS` into `RuntimeEndpoints.allowedOrigins` and **nothing
      reads it**, so an operator who sets it today gets validation and no effect. The
      middleware belongs here, with the listener, and has three cases to get right:
      an allowed origin is echoed back in `Access-Control-Allow-Origin` rather than
      answered with `*`; a disallowed origin is refused; and a request carrying **no**
      `Origin` header at all — same-origin browsers, the simulator, curl — is not
      cross-origin and must pass. Empty `allowedOrigins` means "refuse every cross-origin
      request", not "allow everything". Credentials are not involved while authentication
      is cut (**K1**–**K3**), and this must not become the thing that quietly introduces
      them. Test with **L8**.
- [x] **B1b — `tsx` is the runtime**, recorded in
      [ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md). Already
      a devDependency here. Plain `node src/main.ts` does **not** work for this package:
      `@fleet/contracts` exports source whose internal imports carry `.js` extensions
      that nothing emits, so Node fails with `ERR_MODULE_NOT_FOUND` while `tsc`, Vitest
      and Vite all resolve it. `pnpm dev` and `pnpm start` are the supported entry points.
- [ ] **B1c — Add the `dev` and `start` scripts with the listener, not before.**
      `"dev": "tsx watch src/main.ts"` and `"start": "tsx src/main.ts"`. They are
      deliberately absent today: root `pnpm dev` is `pnpm -r --parallel dev`, so a script
      pointing at a `src/main.ts` that does not exist breaks the one-command start for
      every package at once.
- [x] **B2 — Do not add a database, broker, or queue.** ADR 6 decided against a database
      and ADR 2 against a broker; both name the conditions for revisiting. Lint blocks
      the common packages by name with the ADR reference in the failure message (§ 10).

---

## Section 3 — Configuration (Principle 13, ADR 3)

- [x] **C1 — Decide where `config/` lives, then create it.** ADR 3 names
      `config/freshness.json` and `config/fleet-manifest.json` without saying whose
      directory. ADR 14 chose repository-root deployment configuration read at runtime
      only by the server. The simulator retains explicit `--robots` and `--seed` inputs
      and produces the same roster; CI asserts its output equals the committed manifest.
      The file is the test-time join, so neither package gains a production dependency.
- [x] **C2 — Write `config/freshness.json` with the ADR 3 baseline** — `liveThresholdMs: 2000`,
      `staleThresholdMs: 10000`, `sweepIntervalMs: 500` — and add a test asserting the
      shipped file parses and equals `ADR3_BASELINE_FRESHNESS_POLICY`. The schema and its
      invariants already exist and are tested; only the file and that one test are missing.
- [x] **C3 — Fleet manifest schema and loader.** ADR 3 calls it a list of "every expected
      robot identifier", but an identifier alone is not enough: a registered robot that
      has never reported must still render a fleet row, and
      `docs/01_page-specs/02_FLEET.md` § 6 requires `robotId`, `vendor`, `siteId`/site
      label, `status`, `freshness`, `batteryPercent` and `lastSeenAt` per row. So the
      manifest must carry at least `robotId`, `siteId`, `vendorId` and `model`, with
      status `unknown`, battery `null` and `lastSeenAt` `null` until telemetry arrives.
      Validate strictly, reject duplicate ids, and fail startup on an invalid manifest.
      ADR 14 makes this server spelling canonical for every roster producer.
- [x] **C4 — Decide where the late-tick tolerance is configured.** ADR 3 requires the
      sweep to record when a tick is late "by more than a stated tolerance", but its
      Constraints fix exactly three keys in `freshness.json`, and the schema is strict.
      _Recommendation:_ add a fourth key, `lateTickToleranceMs`, and amend ADR 3 §
      Constraints in the same change rather than hardcoding a tolerance in the sweep —
      the ADR's own reason for externalizing the other three applies unchanged.
- [x] **C5 — Port, host and origin configuration.** Done (ADR 21).
      `src/config/runtimeEndpoints.ts` decodes `FLEET_SERVER_HOST`, `FLEET_SERVER_PORT` and
      `FLEET_ALLOWED_ORIGINS` into `RuntimeEndpoints`, raising the same
      `ConfigValidationError` the file loaders raise, and `loadRuntimeEndpoints()` is the
      only `process.env` read in the package. Defaults fail closed: loopback bind, empty
      origin list. Two things the composition root must honour — call it and let
      `ConfigValidationError` terminate the process (**C6**), and note that
      `allowedOrigins` is validated but **not yet enforced**: the CORS middleware that
      consults it is ADR 8's and does not exist, so setting the variable today has no
      effect.
- [x] **C6 — Fail startup loudly on invalid configuration.** `ConfigValidationError`
      already names the source and every invalid field; the composition root must not
      catch it and continue with defaults.

---

## Section 4 — Ingest boundary (ADR 1, ADR 2, Principle 2)

- [ ] **D0 — Apply the ingest size cap first, before anything reads the body.** Built and
      tested as `src/ingest/requestSizeLimit.ts`
      ([ADR 26](../../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md));
      what remains is calling it in the right place. **Order is the whole point** — a cap
      applied after `JSON.parse` or after adapter dispatch protects only the store, which
      was never the expensive part.
      Both guards, not one: `checkDeclaredSize(contentLength)` rejects before a byte is
      read, and `createByteBudget()` counts chunks as the body streams. The header is
      caller-supplied, so a client that under-declares or omits it walks past the first
      guard — **do not delete the budget as redundant.** Answer a rejection through
      `errorResponse("payload_too_large")`, which is a 413.
- [ ] **D1 — `POST /api/telemetry`, one reading per request** (ADR 2). Body, route
      params and headers are `unknown` until decoded. No casts — lint blocks them.
- [ ] **D2 — Stamp `receivedAt` from the injected `Clock` at the boundary**, before
      dispatch, and pass it explicitly into the adapter. Never substitute the vendor's
      `reportedAt`. These two values have different owners and different jobs: the sweep
      reads `receivedAt`, the operator-facing "last seen" displays `reportedAt`, and
      ADR 3 § Decision calls their independence a stated invariant of the system.
- [ ] **D3 — Vendor identity is selected through the adapter registry**, keyed by
      supported vendor. An unknown vendor is a defined rejection plus a metric, never a
      guess and never a fallback adapter.
- [ ] **D4 — Malformed payloads are rejected and counted, not coerced** (ADR 2 §
      Decision). **The error shape is now decided and built**: answer through
      `src/ingest/errorResponse.ts`, which is the only place an error body may be
      constructed. It returns the contract's `errorEnvelopeSchema` body — a `kind`, a fixed
      summary and the adapter's own `ContractIssue[]`, copied rather than re-derived — and
      the HTTP status for that kind
      ([ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md), register **D16**).
      What is left here is the counting and the handler that calls it.
- [ ] **D5 — Idempotent upsert.** Duplicate or out-of-order input must not roll observed
      state backward or append misleading history. Compare against the current stored
      sequence for that robot only — no sequence log, per ADR 6.
- [ ] **D6 — Represent "sequence not evaluated" distinctly from "zero gaps."** Vendor B
      has no sequence; its adapter synthesizes ordering from timestamps, which cannot
      distinguish a duplicate from two events in the same millisecond. Showing "0 gaps"
      for such a robot is a false statement to an operator (ADR 1 § Implications,
      README § 4). The health payload and the robot-detail diagnostics field must carry
      a not-evaluated state, not a zero.
      **The representation is now decided and is not this package's to choose**
      ([ADR 25](../../docs/00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md)):
      `SequenceHealth` from `@fleet/contracts`, which `HealthMetrics` already imports
      rather than declaring its own twin. Do not add a second shape at the handler.
- [ ] **D6a — Track sequence continuity per robot, not only per adapter.** Work ADR 25
      created and named rather than left latent. `HealthMetrics` keys `#sequence` by
      **adapter id**, but `robotDiagnosticEnvelopeSchema.sequenceHealth` is **per robot**,
      because an adapter rollup cannot answer "did this robot miss readings" — which is
      the question the robot-detail page asks. Both scopes are wanted and neither
      substitutes for the other: the per-adapter rollup stays on `GET /api/health` and
      answers "is this dialect ordered at all".
      Two things to decide while building it: whether the rollup is derived from the
      per-robot map or accumulated separately, and what a per-robot map costs at 500
      robots (ADR 6 bounds memory, and this is a new per-robot allocation). Until it
      exists the server cannot populate a field the contract requires, so the diagnostic
      endpoint cannot be served at all.
- [ ] **D7 — Retain the raw payload for technician diagnosis only.** Excluded from the
      fleet read model, from history, and from every delta; served only as a separate
      field on `GET /api/robots/:id` (ADR 1, robot-detail spec § 2). Assert this in a
      test rather than trusting the shape — see **I3**.
      **The retention rules are decided (ADR 26) and the store already implements them:**
      one payload per robot, replaced not accumulated, kept verbatim with no redaction,
      and deep-copied in **both** directions so neither the writer nor a reader holds a
      reference to retained evidence. Memory is bounded by the cap at **31.25 MiB** for
      500 robots. Two things the handler must not undo: do not add redaction (it cannot
      identify unknown secrets and removes the evidence this endpoint exists for), and do
      not serve `slot.rawPayload` around `diagnostic()`, which is what makes the outbound
      copy real.
      **This endpoint has no access rule and the console says so.** That notice is a
      release blocker, not decoration — see **K4**.
- [ ] **D8 — Note unknown fields to the process-wide ledger**, per adapter, never per
      robot (**A5**).
- [ ] **D9 — Keep the handler thin.** Transport in, decoded value out, state transition
      in a framework-independent function with its own test. A handler that grows domain
      logic is a second authority (Principle 1).

---

## Section 5 — State and history (ADR 6, Principle 11)

- [x] **E1 — Current-state map, one entry per registered robot**, seeded from the
      manifest at startup so a robot that has never reported exists as UNKNOWN rather
      than as an absence (ADR 3 § Decision, Position 4).
- [x] **E2 — Choose the ring-buffer capacity and record it.** ADR 6's open question
      resolves "once the sparkline's real point count is known"; the structure is
      settled (array with cursor, built), the number is not. Decide against the
      decimated sparkline's actual consumption — tens of points — and write the outcome
      into **ADR 6 § Observed consequences**, which is currently empty. The structural
      half of that same open question should be recorded there too, in the same edit.
- [x] **E3 — History stores canonical envelopes, never raw vendor payloads** (ADR 6).
- [x] **E4 — Keep the five state kinds separate** (Principle 11): observed telemetry,
      derived freshness, requested command state, workflow state, health metrics. They
      have different authorities and different lifetimes; one object holding all five is
      the collapse the principle forbids.
- [x] **E5 — Do not imply cross-session continuity.** A restart loses current state and
      history by design. No API response should suggest otherwise, and the demo script
      should avoid a mid-sequence restart (ADR 6 § Implications).

---

## Section 6 — Freshness sweep (ADR 3)

The single most load-bearing mechanism in the repository: the README's first core
guarantee depends on it, and the demo script's steps 4 and 5 exist to show it working.

- [x] **F1 — A recurring interval, independent of message arrival and of fan-out
      flushes.** Conflating the sweep with the flush makes the two impossible to tune
      separately (ADR 3 § Constraints).
- [x] **F2 — Each tick calls the pure contracts function** with each registered robot's
      `receivedAt`, the injected clock, and the validated policy. Derive nothing here.
- [x] **F3 — Never derive freshness from `reportedAt`.** Server receipt time is the only
      clock the guarantee can be made against.
- [x] **F4 — A freshness-only transition is a real change** and must enter the pending
      delta set without touching observed telemetry or `reportedAt`
      (`PendingDeltaSet.mark` is built for exactly this).
- [ ] **F5 — Record sweep lateness and expose it. Half landed; the half that matters is
      the composition.** `FreshnessSweep` measures the gap against
      `policy.lateTickToleranceMs` and calls `onLateTick(latenessMs)`, and
      `HealthMetrics.noteLateFreshnessTick` consumes exactly that shape into
      `lateFreshnessTicks`. Both are tested. **Nothing connects them** — `src/index.ts`
      re-exports the pieces and composes nothing — and there is no health endpoint to read
      the counter (**G3**). ADR 3 § Implications is explicit about why this cannot stay
      half-built: under ingest saturation the sweep stops firing, the console freezes
      robots at their last computed state instead of degrading them, and that is precisely
      the failure the mechanism exists to prevent. A sweep that silently stops looks
      identical to a healthy fleet. Recorded as `packages/FIXME.md` **F7**, first bullet.
- [x] **F6 — Explicit timer lifecycle.** `start()` / `stop()`, with tests and the
      shutdown path both stopping intervals and closing sockets. A leaked interval turns
      a test suite green and a process unkillable.

---

## Section 7 — HTTP read endpoints

- [ ] **G1 — `GET /api/fleet`** — canonical read model for every registered robot. No raw
      payloads. Fields per `docs/01_page-specs/02_FLEET.md` § 6.
- [ ] **G2 — `GET /api/robots/:id`** — the same canonical robot plus the retained raw
      payload as a separate field, plus the diagnostics the robot-detail spec § 6 lists:
      adapter id/version, sequence, sequence gaps (total since start, or not-evaluated),
      vendor ts, received ts, clock delta, schema version, unknown-field count.
- [ ] **G3 — `GET /api/health`** — malformed-ingest count, unsupported-vendor count,
      adapter failures, per-adapter unknown fields, WebSocket connection and flush
      health, late freshness ticks. Label the unknown-field count per-adapter; presenting
      a per-adapter counter as a per-robot fact is called out in both ADR 1 and AGENTS.md.
- [ ] **G4 — History endpoint for the sparkline.** Decide whether history rides on
      `GET /api/robots/:id` or a separate `GET /api/robots/:id/history`.
      _Recommendation:_ separate — the detail view's freshness and summary update on the
      delta stream, while history is a fetch-once-per-visit read, and mixing the two
      lifetimes into one payload means refetching history to refresh a battery number.
- [ ] **G5 — Validate identifiers and return explicit not-found.** An unknown robot id
      is a 404, never a 200 with an empty body (AGENTS.md § HTTP and WebSocket transport).
- [ ] **G6 — Leak nothing.** No stack traces, no secrets, no raw payloads outside **G2**,
      no unbounded diagnostic data in any error or health response. For error bodies this is
      structural rather than a filter: a `ContractIssue` carries a path, a category and a
      schema-derived message and never a rejected value, and `errorResponse`'s summaries are
      constants (ADR 20). `errorResponse.test.ts` asserts it against a payload whose values
      are distinctive; keep that test when the handler lands.
- [ ] **G7 — Read models are canonical types**, never an adapter's internal types.

---

## Section 8 — WebSocket fan-out (ADR 2)

- [ ] **H1 — One connection per console; changed robots only.** Never a full snapshot on
      every flush (ADR 2 Position 3).
- [ ] **H2 — Coalesce between flushes and flush at no more than 10 Hz**, on a scheduler
      independent of the 500 ms sweep. `PendingDeltaSet` is the coalescing half; the
      scheduler is not written.
- [x] **H3 — Decided 19 August 2026: `GET /api/fleet` first, socket for deltas only.**
      Recorded by amending [ADR 2 § Decision](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md),
      which had been silent on it. The socket carries one message shape for its whole
      lifetime, and cold start and reconnect are the same code path.
- [ ] **H3a — Produce the server-wide flush sequence. Contracts half done ([ADR 18](../../docs/00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md), register D10).**
      `packages/contracts` now carries `flushSequenceSchema`, a required `flushSequence`
      on `telemetryBatchSchema`, the `fleetSnapshotSchema` that did not previously exist,
      and `isDeltaCoveredBySnapshot` — the reconciliation rule itself, so the client and
      this package cannot implement it differently. What is left here is producing the
      counter: **one** monotonic source per process, incremented per flush, read by both
      the snapshot handler and the fan-out. Two sources is the defect the decision exists
      to prevent. A frame assembled from several flushes carries the **max** sequence it
      contains, not the last written.
      Two things to know before writing it: `UnobservedRobotState` carries `model` and
      `registeredRobotStateSchema` is strict, so project it off before serializing a
      never-observed robot; and the sequence currently has no restart story — a restarted
      server begins at zero and a client holding a higher snapshot sequence discards
      everything until it catches up (ADR 18 § Open questions).
- [ ] **H3b — Get the client's cold-start order right, and test it.** Socket open →
      buffer → fetch → reconcile → apply, where reconcile is
      `isDeltaCoveredBySnapshot` from `@fleet/contracts` (ADR 18) rather than a
      comparison written again here. Fetching before opening loses every delta
      emitted in the gap, and the symptom is a row that quietly stops updating rather
      than an error. That is worth an explicit test, because nothing else will catch it.
- [ ] **H4 — [web] There is no transport client yet.** `packages/web/src/shared/lib`
      contains only `time.ts`, and `packages/web/src/entities/robot/useFleetRobots.ts`
      returns hardcoded fixtures. The wire format decided here has no consumer until that
      client exists; whoever writes it should be reading this section. (While in that
      package: it is named `web`, not `@fleet/web`, unlike every other package. Renaming
      it would let this package's import ban name one thing instead of two.)
- [ ] **H5 — Encode with the canonical wire schemas**, including the capability array
      form JSON requires (ADR 1).
- [x] **H6 — Decided 19 August 2026: per-client coalescing sets.** Recorded by amending
      [ADR 2 § Decision](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md). Each
      connection owns a `PendingDeltaSet`; a flush writes it and empties it. A slow
      client's backlog collapses per robot exactly as the global one does, so its memory
      is bounded by fleet size rather than by how far behind it is, and it receives
      current state less often but never stale state. The class this package already has
      is the right shape — fan-out just owns one per client instead of one in total.
- [ ] **H6a — Carry the highest flush sequence in a coalesced frame.** A frame assembled
      across flushes 41–44 states 44. The client only uses it to reconcile against its
      cold-start snapshot (**H3a**), so the maximum is the correct value.
- [ ] **H6b — Close a connection that never drains, on a timeout.** A bounded set is
      still a set held for a client that will never read it. This is the only place
      fan-out discards a client; count it on `/api/health`.
- [ ] **H6c — Define the remaining connection states.** Reconnect and orderly shutdown
      still need defining; ADR 8 § Implications requires socket clients to close before
      the HTTP server does, or in-flight frames land on a dead listener.
- [ ] **H7 — Every asynchronous surface defines its complete state** (Principle 5). For
      the stream that means: connecting, connected, degraded, disconnected, reconnecting,
      terminal failure — and the console's connection banner is the consumer of it.

---

## Section 9 — Observability and measurement (Principle 12, ADR 2)

- [ ] **I1 — Structured events with stable names and correlation identifiers** where a
      request crosses stages. `no-console` is enforced, so the logger is a real module
      with a real shape, decided rather than accreted.
- [ ] **I2 — Build the measurement harness ADR 2 commits to**: throughput and latency at
      **50 and 500 robots**, and it must **distinguish per-request HTTP overhead from
      schema-validation cost**. ADR 2's own estimate is that validation costs tens of
      microseconds per message and that HTTP overhead is the likelier first bottleneck;
      the harness exists to confirm or falsify that, and the falsification threshold is
      stated there (>400 µs per message).
      **Narrowed 19 August 2026 ([ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md),
      register D17).** The validation half is built and gated:
      `src/ingest/validationCost.test.ts` measures `JSON.parse` plus a strict canonical
      decode and fails above ADR 2's 400 µs. Measured **5.8–6.4 µs**, about 1.5% of one
      core at 2,500 msg/s — so ADR 2's estimate is confirmed and HTTP overhead is now the
      only open half of its own question. What remains here is the part needing a
      listening server: per-request overhead, throughput, latency, and the vendor schema
      decode once adapters exist. Extend that test rather than starting a second harness;
      the threshold must stay 400 µs, because a tightened falsifier is the undefended
      threshold ADR 22 refused to ship.
      **This harness also owes the console a number.**
      [ADR 24](../../docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md)
      (register D14) defers fleet-table virtualization until delta-apply cost at 500 robots
      is measured **under a live stream**, and register D10's deferred half wants one
      mass-transition flush measured at the same scale. Three decisions are waiting on this
      one run; produce all its numbers together rather than one at a time.
- [ ] **I3 — Report the degradation point, not only a favourable number.** Publish it in
      the README measurements section and add the outcome to **ADR 2 § Observed
      consequences**, which is currently empty.
- [ ] **I4 — Treat event-loop saturation as a freshness-correctness bug**, not a latency
      nit: it delays the sweep, and a delayed sweep reports stale robots as LIVE
      (ADR 3, ADR 6 § Implications).

---

## Section 10 — Enforcement

`eslint.config.js` encodes eight package rules. Each was probed once against a
deliberate violation on 19 August 2026 and observed to fire — ADR 7's lesson is that a
rule nobody has watched fail is indistinguishable from a rule that does nothing:

| Rule                                      | Probe                                   | Fired |
| ----------------------------------------- | --------------------------------------- | ----- |
| Wall clock outside `src/runtime/clock.ts` | `Date.now()`, `new Date()`              | ✔     |
| No database (ADR 6)                       | `import Database from "better-sqlite3"` | ✔     |
| No broker (ADR 2)                         | `import { createClient } from "redis"`  | ✔     |
| No deep import into a vendor adapter      | `@fleet/adapters/vendors/a/adapter.ts`  | ✔     |
| No import of the console                  | `@fleet/web`                            | ✔     |
| No unsafe type assertion at the boundary  | `body as Envelope`                      | ✔     |
| No `console.*` (Principle 12)             | `console.log(...)`                      | ✔     |
| No `process.env` outside `src/config/**`  | `process.env.LOG_LEVEL`                 | ✔     |

- [x] **J1 — Make the probes permanent.** `packages/web` keeps a `__boundary-violation__`
      fixture plus a test asserting lint reports it, with assertions on `ruleId` and
      message text (root `TODO.md` **B10**). Do the same here for at least the wall-clock
      rule and the no-database rule, and add the fixture directory to `lint:js`'s ignore
      list the way `packages/web` does.
- [x] **J2 — CI needs no change.** `.github/workflows/ci.yml` runs `pnpm lint`,
      `typecheck`, `test` and `build` recursively, so this package was picked up the
      moment it had a `package.json`. Confirmed: all four fan out to `packages/server`.
- [x] **J3 — Root `pnpm lint` was red for unrelated reasons. Green as of 19 August 2026.**
      The named `AGENTS.md` files now pass `prettier --check`; the last two offenders were
      `docs/00_adr/08_...md` and `14_...md`, fixed as formatting only. Root `pnpm lint`,
      `typecheck`, `test`, `build`, `check:architecture-docs`, the fixture-drift guard and
      `check:bundle` all pass. Keep it that way: a consistently red gate is not a gate.
- [ ] **J4 — Add the `dev` script once there is a process to run**, and confirm the root
      one-command start (`pnpm dev` → simulator + server + console) actually works.
      README § 2 no longer carries a `[FILL]` marker there; it now states plainly that
      `pnpm dev` starts the simulator and the console only, and that the simulator posts
      to an address where nothing is listening. Correct that sentence in the same change
      that adds the script, not before (Principle 14).

---

## Section 11 — Security and commands (Principle 7)

- [ ] **K1 — Do not invent command endpoints.** The robot-detail spec has none, and
      AGENTS.md says not to add them "merely to appear production-complete."
- [ ] **K2 — If a command endpoint is ever added**, it arrives with server-side
      authentication and authorization, a decoded input boundary, requested state kept
      separate from observed telemetry, and the full transition set — pending, accepted,
      rejected, timed-out, conflicted, cancelled — defined _before_ implementation
      (Principles 7 and 11, non-negotiables 1 and 4). An acknowledgement is not proof of
      physical state change.
- [ ] **K3 — Capabilities are not authorization.** A declared capability limits what the
      UI offers; it never decides what the server permits (README § 6).
- [ ] **K4 — Raw diagnostics are unauthenticated by decision, and that is a release
      blocker.** [ADR 26](../../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md)
      chose to ship the exact vendor payload with no redaction and no access rule while
      this is a local demonstration, and to say so on the page rather than imply
      protection. The successor is named and not deferred indefinitely: **position 2 —
      exact payload behind a diagnostic permission** — and its trigger is _any_ deployment
      beyond the demo, not a judgement about the network it lands on.
      The technician toggle is presentation and authorizes nothing (Principle 7). Do not
      let it be mistaken for the access rule, and do not soften the console's exposure
      notice to make the panel look finished.

---

## Section 12 — Tests

Wired and passing: **98 tests over 15 files** — ring buffer, current-state store,
coalescer, clock, freshness sweep, health metrics, vendor selection, the two ingest
guards, all four configuration loaders, and the boundary-violation probes.
`vitest.config.ts` pre-arms fake timers for `setTimeout`, `setInterval` and `Date`. What
is missing is everything that needs a socket.

- [x] **L1 — Unit.** Done, and none of it opens a socket. `currentStateStore.test.ts`
      covers manifest seeding, idempotent upsert, out-of-order and duplicate rejection,
      and raw payload staying out of state and history — including that a caller cannot
      mutate retained evidence through its own object, in either direction.
      `healthMetrics.test.ts` covers the counters and keeps failure and sequence scopes
      distinct (ADR 25).
- [ ] **L2 — Boundary:** valid, malformed, missing, additional-field, unsupported-vendor
      and unsupported-schema-version inputs (Principle 2's full matrix).
- [ ] **L3 — Sweep. Partly done.** Late-tick detection and explicit interval lifecycle
      are covered in `freshnessSweep.test.ts`, on fake timers, and the LIVE → STALE →
      UNREACHABLE ladder plus UNKNOWN-for-never-reported are covered exhaustively in
      `packages/contracts`' `deriveFreshness.test.ts`, which is where the pure function
      lives. What is **not** covered is the ladder driven _through the sweep_: the sweep
      asserts one freshness-only transition, not a robot walking all three states across
      successive ticks while its neighbours stay live. Write that here rather than
      re-testing the pure function — the thing that can break is the recurring caller.
- [ ] **L4 — Integration:** HTTP ingest → adapter dispatch → current state; single-robot
      raw diagnostics; health metrics; initial WebSocket state; coalesced deltas.
- [ ] **L5 — The three invariant tests that protect the ADRs.** These are the ones worth
      writing first, because each has a failure mode that is invisible in normal use: 1. a freshness-only change fans out (ADR 3 → ADR 2); 2. a raw payload never appears in a fleet response, a delta, or history (ADR 1); 3. out-of-order input does not regress current state (ADR 6).
- [ ] **L6 — Shutdown:** intervals cleared, sockets closed, no open handles left. Assert
      it; a leaked interval passes every other test.
- [ ] **L7 — Keep performance tests reproducible** and report degradation rather than
      asserting only a favourable scale point (AGENTS.md § Tests).
- [ ] **L8 — Cross-origin:** the third piece of ADR 21's required evidence, which could
      not be written when that ADR landed because **B1d** does not exist. A request from an
      origin in `FLEET_ALLOWED_ORIGINS` is allowed and the header echoes that exact origin;
      a request from an origin outside it is refused; a request with no `Origin` header is
      unaffected; and with an empty allow-list every cross-origin request is refused while
      same-origin traffic still works. Assert the refusal, not only the success — an
      allow-list nothing rejects is indistinguishable from no allow-list, which is ADR 7's
      recorded failure mode.

---

## Open decisions

- **M1 — HTTP framework and WebSocket library. RESOLVED 19 August 2026 — ADR 8.**
  Hono + `@hono/node-server` + `ws`. See **B1**.

- **M2 — Where `config/` lives.** Root, shared with the simulator, or per package. See
  **C1**; recommendation is root, because the manifest has two readers and a drifting
  copy fails silently — the console shows a robot as UNKNOWN forever and nothing errors.

- **M3 — The late-tick tolerance's home.** A fourth key in `freshness.json` (with an ADR
  3 amendment) against a constant in the sweep. See **C4**; recommendation is the
  fourth key, since ADR 3's stated reason for externalizing the other three applies
  unchanged, and the schema is strict so the key cannot be added by accident.

- **M4 — Ring-buffer capacity.** Unresolved by design: ADR 6 says it resolves when the
  sparkline's real point count is known, and the sparkline is not built. Pick it from
  the decimated consumer, not from a round number, and record it in ADR 6 § Observed
  consequences.

- **M5 — Initial WebSocket state. RESOLVED 19 August 2026 — ADR 2 amended.** The HTTP
  read. The rejected alternative — a snapshot as the socket's first frame — needed no
  sequence at all, because WebSocket ordering supplies the guarantee; the chosen option
  buys one message shape on the socket and pays for it with the flush sequence in
  **H3a**. See **H3**.

- **M6 — Backpressure policy. RESOLVED 19 August 2026 — ADR 2 amended.** Per-client
  coalescing sets, which neither drop nor buffer without bound. The framing in this
  item was wrong: it presented drop-against-buffer as the only axis, and missed that a
  per-robot keyed set is already bounded by the fleet. Slowness costs a client update
  frequency, not update content. See **H6**.

- **M7 — RESOLVED 19 August 2026 · route, ratified as [ADR 8 § Decision](../../docs/00_adr/08_SERVER_TRANSPORT_IMPLEMENTATION.md) (register stub D9, option 1).** `selectIngestVendor` in `src/ingest/selectVendor.ts` validates the `:vendor` segment against the adapter registry and returns a 404 rejection for anything else, before any body byte is read; the caller records `HealthMetrics.recordUnsupportedVendor()`. `isSupportedVendor` keeps its `unknown` parameter, and the ADR's Implications say why. The one piece of evidence still outstanding is a handler test asserting the ordering against a real request, which waits on the Hono route itself. The original question is kept below for its reasoning.

- **M7 (original) — Does ingest carry vendor identity in the route, a header, or the body?** The
  body is untrusted and the vendor determines which schema decodes it, which is
  circular. _Recommendation:_ the route (`POST /api/telemetry/:vendor`), validated
  against the registry's key set before any body decoding — it makes adapter selection a
  decision about a validated path segment rather than about unvalidated payload
  contents.

  **Coupling (19 August 2026):** `packages/simulator` now ships against this
  recommendation. `ingestUrlFor` in `packages/simulator/src/config/simulatorConfig.ts`
  posts to `{endpoint}/api/telemetry/{A|B|C}` with `content-type: application/json`,
  and its integration test asserts that route shape. Settling M7 differently means
  changing that function and its test in the same commit (Principle 14).

---

## Definition of done for the bootstrap

1. A new ADR records the HTTP and WebSocket implementation choice, and the server listens.
2. `config/freshness.json` and `config/fleet-manifest.json` exist, are strictly validated at startup, and an invalid file stops the process with a message naming the field. The same holds for the environment: `FLEET_SERVER_HOST`, `FLEET_SERVER_PORT` and `FLEET_ALLOWED_ORIGINS` are decoded once by `loadRuntimeEndpoints()`, an invalid value stops the process naming the key (done, ADR 21), and the listener binds what it returns rather than a literal (**B1a**).
3. Ingest stamps `receivedAt` from the injected clock, dispatches through the adapter registry, and rejects malformed input with a counted, defined error.
4. Current state is seeded from the manifest, so a robot that has never reported reads UNKNOWN rather than being absent.
5. The sweep runs on its own interval, calls the contracts freshness function, and a freshness-only transition arrives at a connected client as a delta.
6. Late ticks, malformed ingest, unsupported vendors and per-adapter unknown fields are all visible on `GET /api/health`, each at its true scope.
7. No raw vendor payload appears in a fleet response, a delta, or history — asserted by a test, not by inspection.
8. Out-of-order and duplicate input cannot regress current state, and a robot whose sequence cannot be evaluated is reported as not-evaluated rather than as zero gaps.
9. The demo script's steps 4 and 5 are both reproducible: three `--drop` robots degrade while the rest stay LIVE, and killing the stream produces a connection-level state rather than per-robot degradation.
10. Throughput and latency are measured at 50 and 500 robots, the bottleneck is attributed to HTTP overhead or validation cost, and the number is published in the README and in ADR 2 § Observed consequences.
11. The origin allow-list is enforced rather than merely validated: a disallowed origin is refused by a test, and a request with no `Origin` header still succeeds (**B1d**, **L8**). Until this holds, `FLEET_ALLOWED_ORIGINS` is configuration with no consumer.
12. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from the repository root.
