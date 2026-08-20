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
| `pnpm test`      | passes — 24 files, 158 tests     |
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
    ├── fanout/deltaFanOut.ts       one coalescing set per console, bounded flush (H1-H6a)
    ├── freshness/freshnessSweep.ts recurring sweep + late-tick detection (ADR 3)
    ├── health/healthMetrics.ts     counters by scope (ADR 25)
    ├── ingest/selectVendor.ts      route segment → adapter, before the body (ADR 8)
    ├── ingest/errorResponse.ts     the one HTTP error body, in ContractIssue (ADR 20)
    ├── ingest/requestSizeLimit.ts  byte cap ahead of JSON.parse (ADR 26)
    ├── http/originPolicy.ts        the cross-origin grant ADR 21 configured (B1d)
    ├── http/createApp.ts           the Hono router, policy mounted ahead of it (B1a)
    ├── http/listener.ts            one port for HTTP and /ws, ordered shutdown (B1a)
    ├── observability/logger.ts     one JSON object per line on stdout (I1, part)
    ├── http/fleetResponse.ts       server state translated into the wire snapshot (G1)
    ├── http/robotResponse.ts       one robot plus the raw payload only this route serves (G2)
    ├── http/healthResponse.ts      three scopes joined without being blurred (G3)
    ├── ingest/ingestTelemetry.ts   one reading, untrusted bytes to fleet state (D0-D9)
    ├── runServer.ts                decoded configuration in, a running server out
    ├── main.ts                     the process: real env, real paths, real signals
    ├── config/freshnessPolicy.ts   validated sweep thresholds (ADR 3, Principle 13)
    ├── config/fleetManifest.ts     strict roster loader (ADR 14)
    ├── config/runtimeEndpoints.ts  host/port/origins from the environment (ADR 21)
    └── config/serverConfiguration.ts  the two files loaded together, strictly
```

**This listens, and serves one route.** `pnpm --filter @fleet/server start` reads the
repository-root configuration, binds loopback, announces the policy and roster it is
actually running, serves `GET /api/fleet` with all fifty manifest robots as UNKNOWN, and
shuts down on a signal, runs the ADR 3 freshness sweep on its own interval, and **accepts
telemetry** at `POST /api/telemetry/:vendor`, **serves one robot with its raw payload** at
`GET /api/robots/:id`, **reports operational health** at `GET /api/health`, and **fans
coalesced deltas out over `/ws`** — verified by running it: a live console received
`R-001:live` then `R-001:stale`, the second from the sweep alone. Only the history read for
the sparkline (**G4**) is unmounted, and its shape is undecided.

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

`dev` and `start` now exist and run `src/main.ts` under `tsx` (ADR 9), so root `pnpm dev`
starts the server alongside the simulator and Vite for the first time. The simulator's
ingest posts still 404 — no route is mounted — but they now reach a process rather than a
closed port.

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
- [x] **A4 — [adapters] Vendor adapters and the dispatch registry. Done 20 August 2026;
      server consumption unblocked the same day.** The public registry exists and the
      deep-import ban remains enforced by lint (§ 10). The two questions that were holding
      ingest are now closed as amendments, each ratifying the lean its own ADR stated and
      each on the event that ADR named as the resolver: **ADR 10** — the server does not
      re-validate adapter output at runtime, because the payload is decoded once by the
      adapter's schema and a second parse per reading doubles the cost ADR 2 measures;
      **ADR 11** — a server ingest test reaches recorded fixtures through
      `@fleet/adapters/testing` under a test-file exception, never a local copy. The
      exception is narrower than the one `packages/web` has: the rule is re-stated with
      that one subpath removed rather than switched off, so a vendor deep import is still
      rejected in a test file. Both amendments are cheap to reverse — one ADR edit each —
      and ADR 10 names the measurement that would reverse it. **One half of the exception
      is not yet mechanically watched.** All three cases were probed by hand when the rule
      landed — the subpath rejected in production, admitted in a test, and a vendor deep
      import still rejected in a test — but only the production rejection has a committed
      fixture, because ESLint's project service refuses a virtual path and a `.test.ts`
      fixture under `src/` would be collected by Vitest as an empty suite. The permission
      half is proven the moment the first server ingest test imports the subpath (**L4**):
      if the exception were wrong, that test would fail to lint. Until then it is an
      unwatched rule, which ADR 7 says is indistinguishable from no rule.
- [x] **A5 — [adapters] The registry-owned unknown-field ledger exists, and is now
      served.** The registry owns one process tally. ADR 30's identifier-space question is
      closed as of 20 August 2026 — `byAdapter` is keyed by vendor id — and the health
      route serves the ledger with its scope carried as data (**G3**).

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
- [x] **B1a — Done 20 August 2026: dependencies, router, listener, composition root.**
      `hono`, `@hono/node-server` and `ws` (with `@types/ws`) are declared and vetted in
      `scripts/checkDependencies.mjs` (ADR 29), each having arrived with the code that
      imports it. `createHttpApp` mounts the **B1d** origin policy ahead of every route and
      owns the two responses no route produces; `startListener` serves it and upgrades
      `/ws` on one port, closing stream clients, then the socket server, then the HTTP
      server on shutdown — the order ADR 8 § Implications requires, asserted by rebinding
      the same port rather than by inspection. Upgrades use `noServer: true` with an
      explicit path check, so a handshake elsewhere is destroyed instead of opening a
      stream nothing reads. `startServer` in `src/runServer.ts` composes decoded
      configuration into a running server, and `src/main.ts` is the process around it: it
      resolves the repository-root `config/` from the module rather than the working
      directory (root `pnpm dev` runs each package in its own), binds what
      `loadRuntimeEndpoints()` returns rather than a literal, refuses to continue past a
      `ConfigValidationError` (**C6**), and stops once on `SIGINT` or `SIGTERM`. The
      listener accepts port `0` although the configuration refuses it; that is deliberate,
      documented at `ListenerOptions.port`, and what lets the tests bind without picking a
      number. **Verified by running it, not only by unit test:** a real start logs one
      `server.listening` record naming the shipped policy and all fifty committed robots;
      `GET /api/fleet` returns the canonical `not_found` envelope; an allowed origin is
      echoed and a disallowed one is not; a preflight returns 204 with the method list; an
      out-of-range port exits 1 naming the key and the accepted range on stderr without
      ever binding; and `SIGTERM` produces `server.stopped`.
- [x] **B1b — `tsx` is the runtime**, recorded in
      [ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md). Already
      a devDependency here. Plain `node src/main.ts` does **not** work for this package:
      `@fleet/contracts` exports source whose internal imports carry `.js` extensions
      that nothing emits, so Node fails with `ERR_MODULE_NOT_FOUND` while `tsc`, Vitest
      and Vite all resolve it. `pnpm dev` and `pnpm start` are the supported entry points.
- [x] **B1c — Done 20 August 2026, with the listener.** `"dev": "tsx watch src/main.ts"`
      and `"start": "tsx src/main.ts"`. They were absent until `src/main.ts` existed
      because root `pnpm dev` is `pnpm -r --parallel dev`, where a script pointing at a
      missing file breaks the one-command start for every package at once.
- [x] **B2 — Do not add a database, broker, or queue.** ADR 6 decided against a database
      and ADR 2 against a broker; both name the conditions for revisiting. Lint blocks
      the common packages by name with the ADR reference in the failure message (§ 10).

### Deferred prominently — decisions required before **B1d** is finished

- **What a declined cross-origin request is answered with.** Today it is served without
  the grant, which is what makes a browser block it. The plan text said "refused", and an
  explicit 403 would be stronger against a non-browser caller — but `@fleet/contracts` has
  no `ErrorKind` for it (`ERROR_KINDS` is malformed / unmappable / unsupported-dialect /
  unsupported-vendor / not-found / too-large / internal) and `ErrorStatus` has no 403, so
  inventing either in a handler would make the server a second authority over a vocabulary
  ADR 20 puts in contracts. It would also present as authorization the server does not
  perform: `Origin` is caller-supplied, exactly like the vendor route segment ADR 8 §
  Implications accepts a caller can lie about. **Reversing this is a contracts change
  first (ADR 20), then this module.** Do not decide it in the middleware.

- **Whether the same allow-list governs the WebSocket stream.** CORS does not apply to a
  WebSocket upgrade and `ws` checks no origin of its own, so mounting this policy on the
  HTTP routes alone leaves `/ws` reachable from any origin while `/api` is not.
  `evaluateOriginPolicy` can decide an upgrade request unchanged — the gap is that nobody
  has decided whether it should. That is an ADR 8 or ADR 21 question. Settle it with
  **H1**, not with a line in the upgrade handler.

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

- [x] **D0-D5, D8, D9 — the ingest boundary. Done 20 August 2026.** `ingestTelemetry` in
      `src/ingest/ingestTelemetry.ts` is the transition and `POST /api/telemetry/:vendor`
      in `createApp.ts` is the transport around it (**D9**): the handler decides nothing
      about what a reading means. The ordering is the contract and none of it produces a
      type error if reversed, so each step names what it protects and the tests assert the
      order rather than only the outcomes — selector before any body byte (**D3**, ADR 8),
      then `checkDeclaredSize` on the caller's header, then `createByteBudget` on the bytes
      actually read, both **before** `JSON.parse` (**D0**, ADR 26; the header guard is a
      cheap early exit and the budget is what holds), then `receivedAt` from the injected
      clock passed explicitly into the registry (**D2**), then `withFreshness` completing
      the pre-freshness envelope with `now = receivedAt` so a reading is never born a
      microsecond stale (ADR 10), then the idempotent upsert (**D5**) which also retains
      the raw payload for the technician endpoint alone (**D7**, ADR 26). A malformed
      payload is counted and answered through `errorResponse` with the adapter's own
      issues copied rather than re-derived (**D4**, ADR 20). Unknown fields need no step:
      the registry owns one process ledger and counts as it decodes (**D8**, ADR 15) —
      asserted by vendor C's `telemetry.firmware_channel` moving `byAdapter.C` while
      `byAdapter.A` stays at zero. Only an accepted reading is marked for fan-out; a
      duplicate left stored state alone and would flush a frame that says nothing.
      Answering is **204** rather than 202, because the transition already happened
      synchronously — and with no body, because no contract describes an ingest response.
      If a caller ever needs the disposition back, that shape is a `@fleet/contracts`
      decision first (ADR 25). The test reaches the recorded fixtures through
      `@fleet/adapters/testing` under the ADR 11 exception, which is also the standing
      proof that exception is configured — the half that had no fixture when the rule
      landed. It derives its manifest by decoding the fixtures rather than restating their
      ids, because ADR 14 makes roster and payloads two views of one seeded fleet and a
      hardcoded id would drift the next time fixtures are re-recorded (ADR 13).
      **Verified by running it:** a valid vendor A payload returns 204 and appears in
      `GET /api/fleet` with server receipt time; `/api/telemetry/Z` returns the
      `unsupported_vendor` envelope and `/api/telemetry/a` a 404, because ADR 8 makes the
      segment case-sensitive; a non-JSON body is a counted 400; a 70 KB body is a 413; and
      an ingested robot was watched going **live to stale** on the sweep, which is the ADR
      3 guarantee working end to end for the first time.
- [x] **D6 — Represent "sequence not evaluated" distinctly from "zero gaps." Done for the
      case that matters.** A dialect with no counter — vendor B — records
      `noteSequence(adapterId, "not-evaluated")`, so it is never shown as zero gaps. The
      representation is `SequenceHealth` from `@fleet/contracts` (ADR 25) and no second
      shape was added at the handler. Everything else about continuity is **D6a**, and
      three sharper problems were found while building this rather than left latent:
      (1) `SequenceObservation` is `"gap" | "duplicate" | "not-evaluated"` with **no
      in-order value**, so an adapter delivering perfectly ordered readings never enters
      the snapshot at all and is indistinguishable from one never observed; (2) an
      **out-of-order** arrival has no term in that vocabulary, and `UpsertResult`
      distinguishes it from a duplicate while `HealthMetrics` cannot; (3) a **gap** cannot
      be detected from what ingest can see, because it needs the previous sequence, which
      `CurrentStateStore` holds. **D6a** moved continuity there and resolved (1) and (3);
      (2) is still open and is deferred under **D6a**.
- [x] **D6a — Track sequence continuity per robot, not only per adapter. Done 20 August 2026.** Both sub-decisions this item said to make while building it are made, and
      both went the same way for the same reason. **Where it lives:** `CurrentStateStore`,
      because gaps can only be counted where the previous accepted sequence already is —
      anywhere else means a second copy of that number, which is the drift Principle 1
      forbids. **How the rollup is produced:** folded from the per-robot values on demand
      (`sequenceByAdapter()`), not accumulated alongside them, because a second accumulator
      is a second authority that can disagree while both look plausible; the fold is over
      the fleet, on a health request nothing calls in a loop. **What it costs:** one small
      object per robot — `{ evaluated: false }` or three numbers — so five hundred robots
      is tens of kilobytes against the 31.25 MiB raw-payload budget ADR 26 already
      computed. Not a number worth a decision.
      Consequences worth carrying. `HealthMetrics.noteSequence` and
      `HealthSnapshot.sequence` are **removed**: they were the second copy, and leaving
      them fed from the store would have kept two spellings of one fact alive. `gaps`
      counts **readings missing**, not gap events — the contract's own field comment says
      so, and it is the number an operator can act on, since reporting a jump of five as
      `1` understates the loss by the amount that matters. Null, not `{ evaluated: false }`,
      before a robot has ever reported: that value claims "this dialect has no counter",
      which is a statement about vendor B and not about silence. An adapter's rollup is
      `{ evaluated: false }` if any of its robots is, because one unordered robot means the
      dialect's ordering cannot answer the rollup's question. **Deferred, decision not made — a regressive arrival is counted as nothing.**
      `SequenceHealth` has `gaps` and `duplicates` and no term for a reading whose sequence
      went _backwards_, which `UpsertResult` distinguishes from a duplicate and the store
      therefore knows about and cannot report. Stored state is still protected — the upsert
      returns without writing — so what is missing is the reporting, not the guard. Adding
      a third counter is a `@fleet/contracts` change under ADR 25, then this module and the
      health response; it must not be smuggled in as a `gaps` increment, which would report
      a lost reading that never existed.
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
- [x] **F5 — Record sweep lateness and expose it. Composed 20 August 2026; the HTTP
      surface is still deferred.** `startServer` builds the store, the delta set, the
      counters and the sweep together and routes `onLateTick` into
      `HealthMetrics.noteLateFreshnessTick`, closing the first bullet of
      `packages/FIXME.md` **F7**. The callback also emits a `freshness.tick_late` warning
      through the structured logger, which is the part that matters before **G3** exists:
      a counter nobody can read is not exposure, and ADR 3 § Implications names the failure
      precisely — under ingest saturation the sweep stops firing, the console freezes
      robots at their last computed state instead of degrading them, and a sweep that
      silently stops looks identical to a healthy fleet. A real six-second run emitted the
      startup line and nothing else, so the warning is a signal rather than noise. The
      sweep starts after the listener binds, so it never runs against a server that failed
      to bind and left nothing to stop it, and stops before the listener closes (**F6**).
      **Still deferred: `GET /api/health`.** `lateFreshnessTicks` reaches no HTTP response
      because **G3** waits on ADR 30's unresolved `byAdapter` key space, and that must not
      be decided in a handler.
- [x] **F6 — Explicit timer lifecycle.** `start()` / `stop()`, with tests and the
      shutdown path both stopping intervals and closing sockets. A leaked interval turns
      a test suite green and a process unkillable.

---

## Section 7 — HTTP read endpoints

- [x] **G1 — `GET /api/fleet`. Done 20 August 2026.** `encodeFleetSnapshot` in
      `src/http/fleetResponse.ts` translates `CurrentStateStore.list()` into the
      contract-owned `fleetSnapshotSchema` shape, and the route is `c.json` over it. The
      store is seeded from the manifest in `startServer`, so a robot that has never
      reported is a row rather than an absence (ADR 3, ADR 14) — fifty of them against the
      committed roster, confirmed by running it. `flushSequence` is zero until fan-out owns
      the counter (**H3a**); a cold snapshot discards nothing, which is what zero means.
      The translation is not a serialization, and that is the finding worth carrying:
      server state is a **superset** of the wire contract in two places that
      `JSON.stringify` accepts and `parseFleetSnapshot` rejects — an observed robot's
      capabilities are the runtime record rather than the wire array, and an unobserved
      robot carries the manifest's `model`, which `registeredRobotStateSchema` is strict
      against and no fleet row uses. A test round-trips the encoder through the contract's
      own decoder rather than asserting a shape by eye, because a body only
      `JSON.stringify` accepts reaches the console as a parse failure that reads like a
      network problem. **Ordering constraint this creates — do not land ingest without the
      sweep.** Every robot is `unknown` today because nothing reports, so the snapshot
      cannot be stale. The moment **D1** stores an observed envelope, `freshness` on it is
      whatever the upsert wrote, and a read hours later would serve that value as current,
      which is the exact failure Principle 4 forbids. **F1**-**F5** must land before or
      with Section 4, never after.
- [x] **G2 — `GET /api/robots/:id`. Done 20 August 2026.** `encodeRobotDetail` in
      `src/http/robotResponse.ts` serves the canonical robot plus the retained raw payload
      and `sequenceHealth`, which **D6a** made available. This is the only route that
      serves a raw payload (ADR 1), and the composition reads it through
      `store.diagnostic()` rather than around it, because that method is what makes the
      outbound deep copy real (ADR 26). The remaining robot-detail diagnostics the spec § 6
      lists — adapter id and version, both timestamps, schema version — are already fields
      on the envelope; clock delta is `receivedAt - reportedAt`, which the console computes
      rather than the server duplicating, and the unknown-field count is fleet-wide and
      belongs to **G3**. **G5** and **G7** land with it: an unknown id is an explicit 404
      carrying the canonical envelope, never a 200 with nothing in it, and the response is
      built from `@fleet/contracts` types throughout. **Verified by running it:** an
      unknown id returns 404, a registered robot returns its registration data, vendor C's
      recorded payload comes back verbatim under `rawPayload` with `sequenceHealth`
      alongside, and `GET /api/fleet` contains no `rawPayload` at all (**G6**).
      **Deferred, decision not made — there is no contract for this endpoint's union.**
      The route serves two populations: `robotDiagnosticEnvelopeSchema` for a robot that
      has reported, and `registeredRobotStateSchema` for one the manifest registered and
      nothing has been heard from. Both shapes are contract-owned, so nothing was invented
      here — but `@fleet/contracts` exports no union schema or parser for the pair, the way
      `fleetSnapshotRobotSchema` does for the same two populations inside the snapshot. A
      client therefore has to try both parsers and infer the discriminator itself. Serving
      a 404 for the unobserved case would have avoided the gap and is **wrong**:
      `docs/01_page-specs/03_ROBOT_DETAIL.md` requires a known-but-unseen robot to render
      registration data, and a 404 there contradicts the fleet page already listing it. The
      fix is a `robotDetailResponseSchema` union plus its parser in contracts under ADR 25,
      mirroring `fleetSnapshotRobotSchema`; it is a contracts change first, not a handler
      change.

- [x] **G5 — Validate identifiers and return explicit not-found. Done with G2.** An
      unknown robot id is a 404 carrying the canonical error envelope.
- [x] **G7 — Read models are canonical types. Done with G2** — both branches of the
      response are `@fleet/contracts` shapes, and no adapter type is reachable from a
      handler (lint enforces the second half).
- [x] **G3 — `GET /api/health`. Done 20 August 2026, and ADR 30's key space is settled.**
      `encodeHealthResponse` in `src/http/healthResponse.ts` joins three counters kept at
      three scopes by three components: process-scope `malformedIngest` and
      `unsupportedVendors` from `HealthMetrics`, the per-adapter unknown-field ledger from
      the registry, and per-dialect continuity folded by the store (**D6a**). `byAdapter` is
      keyed by **vendor id** (`A`), ratifying ADR 30's stated lean on the event that ADR
      named as its resolver; `CurrentStateStore.sequenceByAdapter` was renamed
      `sequenceByVendor` and rekeyed in the same change, so the join has one identifier
      space throughout rather than a re-key in the middle of it. Every supported vendor
      appears even before it has reported, because an absent key reads as "no such adapter"
      rather than "nothing yet". A vendor with no readings is `{ evaluated: false }`, never
      `{ evaluated: true, gaps: 0 }`, which would assert a measurement nobody made. The
      unknown-field scope travels as data, so the console renders its caveat from the value
      (**A5**, ADR 25). **Verified by running it:** after one accepted vendor C payload,
      one rejected vendor A payload and one unsupported-vendor request, the response showed
      `malformedIngest: 1`, `unsupportedVendors: 1`, vendor A with `failures: 1` and a flat
      ledger, and vendor C with `telemetry.firmware_channel: 1` and no failures — the exact
      pairing ADR 15 says a total would erase, now observable rather than argued.
- [ ] **G4 — History endpoint for the sparkline.** Decide whether history rides on
      `GET /api/robots/:id` or a separate `GET /api/robots/:id/history`.
      _Recommendation:_ separate — the detail view's freshness and summary update on the
      delta stream, while history is a fetch-once-per-visit read, and mixing the two
      lifetimes into one payload means refetching history to refresh a battery number.
- [ ] **G6 — Leak nothing.** No stack traces, no secrets, no raw payloads outside **G2**,
      no unbounded diagnostic data in any error or health response. For error bodies this is
      structural rather than a filter: a `ContractIssue` carries a path, a category and a
      schema-derived message and never a rejected value, and `errorResponse`'s summaries are
      constants (ADR 20). `errorResponse.test.ts` asserts it against a payload whose values
      are distinctive; keep that test when the handler lands.

---

## Section 8 — WebSocket fan-out (ADR 2)

- [x] **H1, H2, H5, H6, H6a — the fan-out unit. Done 20 August 2026; not yet attached to a
      socket.** `DeltaFanOut` in `src/fanout/deltaFanOut.ts` holds one `PendingDeltaSet`
      per console (**H6**), marks every set on a change, and flushes on its own interval
      floored at 100 ms — independent of the 500 ms sweep, because ADR 3 states that
      conflating them makes the two impossible to tune separately (**H2**). A frame carries
      changed robots only (**H1**), encoded so the capability record becomes the wire array
      JSON preserves (**H5**), and a test parses a real frame with the contract's own
      `parseTelemetryBatch` rather than eyeballing its shape. A console that joins after a
      change gets nothing: its picture is the `GET /api/fleet` snapshot, so the socket
      carries one message shape for its whole lifetime (**H3**). It owns no socket —
      clients arrive as a `send`/`close` pair — so the whole of fan-out is testable without
      a port, as every other unit in this package is. **Composed 20 August 2026.** The
      listener turns a `/ws` upgrade into a `send`/`close` pair and hands it to
      `streams.open`, the composition root registers it with the fan-out, and the sweep and
      ingest now take a `DeltaSink` — the write half of a coalescing set — so neither can
      drain a set it does not own and fan-out can substitute a broadcaster that is not a
      set at all. Fan-out stops before the listener closes, because ADR 8 § Implications
      requires consoles to close before the HTTP server goes away.
- [x] **H3 — Decided 19 August 2026: `GET /api/fleet` first, socket for deltas only.**
      Recorded by amending [ADR 2 § Decision](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md),
      which had been silent on it. The socket carries one message shape for its whole
      lifetime, and cold start and reconnect are the same code path.
- [x] **H3a — Produce the server-wide flush sequence. Done 20 August 2026.** `createFlushSequence()` is the one monotonic
      source, and `DeltaFanOut` advances it **only on a flush that sends something** — a
      counter climbing on empty ticks would describe no state, and a client reconciling a
      delta against its snapshot would discard readings it needed. Every frame in one flush
      carries that number, which is also the maximum any of them contains, satisfying
      **H6a** by construction rather than by a separate step. `GET /api/fleet` now reads
      the same counter rather than a hardcoded zero, so there is one source and the
      client's comparison is meaningful — the two-sources defect ADR 18 exists to prevent
      would have left both halves looking plausible. Original item follows. ([ADR 18](../../docs/00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md), register D10.)
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
- [ ] **H3b — Get the client's cold-start order right, and test it. Ordering unit landed
      20 August 2026 in `packages/web`; the transport around it has not.**
      `packages/web/src/shared/lib/coldStart.ts` implements buffer → settle → replay and
      reconciles with `isDeltaCoveredBySnapshot` from `@fleet/contracts` (ADR 18) rather
      than a comparison written again there. It is a module rather than a comment because
      fetching before opening loses every delta emitted in the gap, and the symptom is a
      row that quietly stops updating rather than an error — nothing else catches that.
      What remains is the socket and snapshot fetch that call it, which is fleet TODO
      **A3**, and the running-browser evidence that the order is what the console actually
      performs.
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
- [x] **H6a — Carry the highest flush sequence in a coalesced frame. Done 20 August 2026
      by construction.** Every frame carries the sequence of the flush that sent it, and a
      set that coalesced across earlier flushes is sent in the later one, so the value is
      the maximum it contains without a separate maximum being computed.
- [ ] **H6b — Close a connection that never drains, on a timeout. Deferred; the decision it
      needs is not made.** A bounded set is still a set held for a client that will never
      read it. This is the only place fan-out discards a client, and it must be counted on
      `/api/health`. **What blocks it:** ADR 8 § Open questions asks whether the connection
      cap and maximum frame size are configuration or constants, leans configuration
      "alongside the freshness policy in `config/`", and names _this_ work as the resolver.
      That is not a free choice — `freshnessPolicySchema` is strict and ADR 3 § Constraints
      fixes its keys, so it means either a fourth key with an ADR 3 amendment or a new
      configuration surface, and both are bigger than a threshold constant. `DeltaFanOut`
      therefore has **no backpressure signal at all** today: it flushes to every console
      with a pending set and never skips or drops one. That is correct at ADR 2's stated
      scale of single-digit consoles and wrong at any scale where a console stops reading.
      Decide the configuration surface first; do not put a number in the fan-out.
- [ ] **H6c — Define the remaining connection states. Orderly shutdown done 20 August
      2026; reconnect is registered as decision D22.** Fan-out stops and closes every
      console before the listener closes, which is what ADR 8 § Implications requires, and
      the test asserts it by rebinding the same port afterwards rather than by inspection.
      Reconnect is not a server-side gap at all — the client decides when to come back —
      and it is now a registered open decision rather than a note here; see
      [`docs/PENDING_ARCHITECTURE_DECISIONS.md`](../../docs/PENDING_ARCHITECTURE_DECISIONS.md)
      **D22**.
- [x] **H7 — Every asynchronous surface defines its complete state. Defined 20 August
      2026 in `packages/web`; the consumer is still fixture-backed.**
      `shared/lib/streamLifecycle.ts` is the matrix as a pure reducer —
      `idle | connecting | connected | reconnecting | failed` — with the transitions tested
      rather than described (Principle 5). `degraded` was **not** adopted: nothing in this
      design produces a partly-working stream, and a state with no producer is a state the
      banner would never show. Two questions the definition surfaced are deferred and
      flagged in `packages/web/src/features/fleet/TODO.md` **A3**: the published vocabulary
      is narrower than the transport's, so the banner cannot distinguish a first connection
      from a reconnection or a stopped client from a retrying one; and when to give up is
      an event the caller raises rather than a cap the reducer invents.

---

## Section 9 — Observability and measurement (Principle 12, ADR 2)

- [ ] **I1 — Structured events with stable names and correlation identifiers. Logger
      landed 20 August 2026; the correlation half has not.** `src/observability/logger.ts`
      writes one JSON object per line with an injected sink, and `server.listening`,
      `server.stopping`, `server.stopped` and `server.stop_failed` are its first stable
      names — `event` is a name and `fields` is everything that varies, because a name that
      changes with its data cannot be counted. Still owed: an identifier that follows one
      request across ingest, state and fan-out, which needs those stages to exist.
      **Deferred, decision not made — whether two JSON-line loggers should stay two.**
      `packages/simulator/src/observability/logger.ts` decided this shape first and this is
      a second implementation of it, because the server may not import the simulator and
      the workspace has no shared Node library to hold it. The duplication is real, and the
      two must agree on the record shape or one stream cannot be read with the other. The
      fix — a fifth workspace package — changes the shape of the repository and needs an
      ADR, so it is named here rather than taken quietly. Each side names the other in a
      `Coupling:` comment until then.
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
- [x] **L8 — Cross-origin, against a real request. Done 20 August 2026.**
      `src/http/createApp.test.ts` drives all four claims through `app.request()`: an origin
      in `FLEET_ALLOWED_ORIGINS` gets that exact origin echoed, an origin outside it gets no
      grant, a request with no `Origin` header is unaffected, and an empty allow-list grants
      nobody — each asserted on the 404 path, so the grant is shown to survive a response
      the router synthesized rather than only one a handler returned. The decline is
      asserted, not only the success: an allow-list nothing rejects is indistinguishable
      from no allow-list, which is ADR 7's recorded failure mode. What remains is the same
      evidence through a **bound socket** rather than an in-process `Request`, which is the
      only form that also proves `loadRuntimeEndpoints()` reached the app. It lands with
      **B1a**'s listener — and now does: `src/http/listener.test.ts` repeats the grant and
      the decline through a bound socket with `fetch`, which is the only form that also
      shows the app the listener actually serves is the one the policy is mounted on. What
      is not yet proven end to end is that `loadRuntimeEndpoints()` supplies those origins,
      because no composition root reads it yet (**B1a**).

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
3. Ingest stamps `receivedAt` from the injected clock, dispatches through the adapter registry, and rejects malformed input with a counted, defined error. **Done 20 August 2026** (**D0**-**D5**, **D8**, **D9**), verified against a running process for the valid, unsupported-vendor, non-JSON and oversized cases.
4. Current state is seeded from the manifest, so a robot that has never reported reads UNKNOWN rather than being absent. **Done 20 August 2026** — `startServer` builds the store from `configuration.manifest.robots`, and `GET /api/fleet` serves all fifty committed robots as UNKNOWN.
5. The sweep runs on its own interval, calls the contracts freshness function, and a freshness-only transition arrives at a connected client as a delta. **Done 20 August 2026, verified against a live socket:** a console connected to `/ws` received frame 1 with `R-001:live` after ingest and frame 2 with `R-001:stale` from the sweep alone, and `GET /api/fleet` then reported flush sequence 2 from the same counter.
6. Late ticks, malformed ingest, unsupported vendors and per-adapter unknown fields are all visible on `GET /api/health`, each at its true scope. **Done 20 August 2026** (**G3**), verified against a running process.
7. No raw vendor payload appears in a fleet response, a delta, or history — asserted by a test, not by inspection. **Done 20 August 2026** — the types carry the exclusion, `GET /api/robots/:id` is the only route that reads it, and a running server was checked for `rawPayload` in the fleet response.
8. Out-of-order and duplicate input cannot regress current state, and a robot whose sequence cannot be evaluated is reported as not-evaluated rather than as zero gaps. **Done 20 August 2026** (**D6**, **D6a**) — the store refuses both, counts readings missing and duplicates per robot, folds the per-adapter rollup from those, and reports a counterless dialect as not-evaluated. One reporting gap remains and is deferred under **D6a**: a regressive arrival has no term in `SequenceHealth`.
9. The demo script's steps 4 and 5 are both reproducible: three `--drop` robots degrade while the rest stay LIVE, and killing the stream produces a connection-level state rather than per-robot degradation.
10. Throughput and latency are measured at 50 and 500 robots, the bottleneck is attributed to HTTP overhead or validation cost, and the number is published in the README and in ADR 2 § Observed consequences.
11. The origin allow-list is enforced rather than merely validated: a disallowed origin is granted nothing and a request with no `Origin` header still succeeds, both against a **real request** (**L8**). The policy itself is decided and unit-tested (**B1d**); until a listener mounts it, `FLEET_ALLOWED_ORIGINS` still has no runtime consumer, and what a declined request is _answered with_ is deferred under **B1d** as a contracts decision.
12. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from the repository root.
