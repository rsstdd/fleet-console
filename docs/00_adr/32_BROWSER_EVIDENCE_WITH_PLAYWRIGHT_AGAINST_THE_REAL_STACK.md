# ADR 32 — Browser Evidence With Playwright, Against the Real Stack, on the Production Build

**Decision:** The repository's browser-level claims are proven by `@playwright/test` — its one new dependency — driving the real server, real simulator, and the production console bundle served by `vite preview`, as a three-engine smoke suite plus a Chromium-only reported 500-robot measurement, in a dedicated CI job that always uploads its evidence.
**Group:** Verification / tooling (the browser layer ADR 22's gates and ADR 31's recovery flow could not reach).
**Status:** Decided · 2026-08-20 · Implemented

## Issue

Register stub **D23** asked how the console's browser-only claims get durable evidence. The unit and contract suites run in jsdom, which cannot render, focus, paint, or open a socket against a real proxy — so the claims the project leans on hardest were the ones with no automated proof:

- ADR 31's headline behavior — a killed-and-restarted server, a console that re-joins by itself without Retry or reload — was proven at the transport boundary with fake sockets and fake timers, never in a browser against a real restart.
- The accessibility posture (skip link, keyboard-only operation, focus that survives streaming updates) is written into every page spec against the accessibility tree, which jsdom approximates and no assertion had ever exercised in an engine.
- ADR 2 measured the server's ingest half of the 500-robot claim; ADR 18 and ADR 24 both deferred their client-side questions "until measured", and no harness existed to measure them.

## Assumptions

- A browser suite against real processes has irreducible environmental noise; the design must spend that noise budget on real evidence (real restarts, real sockets), not on parallelism or shared state.
- The evidence users care about is the build users run. A development-mode rendering artifact is not a product finding.
- Timing and memory numbers without a derived budget must be reported, never gated (ADR 22's reasoning, applied to the client).
- Playwright automation is not evidence of screen-reader output; assistive-technology testing stays explicitly manual.

## Constraints

- One new dependency at most, admitted through ADR 29's allow-list with a written reason, at a release old enough to clear the seven-day quarantine.
- Assertions use accessible roles and names — the surface the specs are written against (Principle 6) — never CSS selectors or implementation details.
- Bounded polling only; no arbitrary wall-clock sleeps. The real clocks under test (`config/freshness.json`'s 2 s/10 s thresholds, ADR 31's 30-second retry ceiling) are production configuration, and the test timeouts bound them rather than replace them.
- The stack under test is joined the way production wiring joins it: the server reads `FLEET_SERVER_HOST`/`FLEET_SERVER_PORT`, Vite's proxy reads the same keys, the simulator takes `--endpoint` (ADR 21). No test doubles between the processes.
- No visual snapshot is ever committed; screenshots are portfolio artifacts and failure diagnostics, not regression baselines.
- No product behavior changes to make a test pass.

## Decision

**Framework.** `@playwright/test` 1.62.1 (released 30 July 2026, clearing the quarantine), under `packages/web`, with configuration and suites in `packages/web/e2e` and a dedicated `tsconfig.e2e.json` inside the package's typecheck and lint surface.

**Harness.** `e2e/stack.ts` starts the real server (`tsx src/main.ts`), the real simulator, and `vite preview` on isolated per-project ports, each in its own process group; readiness is polled against real endpoints; stdout/stderr are retained and attached on failure; teardown kills whole process groups, escalating to SIGKILL only after a bounded graceful wait. Every smoke test gets a fresh stack from a fixture (`e2e/fixtures.ts`), because the scenarios mutate process state and a shared stack would couple each test to its predecessor's wreckage.

**The production build, deliberately.** A one-time `vite build` in Playwright's global setup feeds every stack's `vite preview`, whose proxy forwards `/api` and `/ws` exactly as the dev proxy does. This was forced by measurement, not preference: under the dev server, profiling showed React's development-mode rendering of the 50-row table at the 10 Hz flush cadence saturating a core — 148 long tasks totaling 21 s of blocked main thread in a 14-second window, with every hot frame in `createElement`/`jsxDEV`, emotion style serialization, and react-dom's dev-only diagnostics — which starved every Playwright actionability check into 120-second timeouts. The same suite against the built console passes each scenario in single-digit seconds. The dev-mode cost is an artifact of the development build; the claim worth proving is about the bundle ADR 22 budgets.

**Smoke suite** (`e2e/smoke.spec.ts`), sequentially in Chromium, Firefox, and WebKit: the live 50-robot fleet renders and a streamed delta visibly changes a row; three vendor dialects normalize into one table with each robot's declared capability panels present and no others; the console is keyboard-operable end to end (skip link, filter, row activation, detail navigation) and streaming updates never steal focus; a silenced simulator degrades freshness Live → Stale → Unreachable while the stream stays connected; a killed server leaves last-known rows with freshness suppressed and the banner honest; a restarted server is re-joined automatically — ADR 31's recovery, proven against a real process restart with a real new session. One passing fleet screenshot per engine is attached as portfolio evidence.

**Reported 500-robot measurement** (`e2e/scale.spec.ts`), Chromium-only: a real decoded snapshot is captured from the running stack, expanded to 500 robots through contracts-owned encoders, re-validated with the console's own strict decoder, and served through Playwright's HTTP and WebSocket routing at the documented workload — ten frames per second, 250 robots changing in alternating frames, 20 warmup frames, 100 measured. Only integrity is asserted (all 500 rows present, every frame applied, final frame's content rendered); latency, frame-interval, and heap numbers are written to machine-readable JSON and a console summary, gated by nothing.

**CI.** A separate `browser-evidence` job installs the three engines with `--with-deps`, runs the smoke suite with one worker and one retry, runs the scale measurement, and always uploads the HTML report, traces, screenshots, videos, process logs, and benchmark JSON. Generated `playwright-report/` and `test-results/` are ignored by git, Prettier, and ESLint.

## Positions

1. **Playwright against the real stack, production build.** Chosen. One dependency buys three real engines, WebSocket routing, trace-based failure forensics, and an accessibility-tree selector model that matches how the specs are already written.
2. **Cypress.** Rejected: no WebKit, a bundled Electron-first runtime that is a far larger dependency surface for ADR 29 to vet, and its network layer cannot script WebSocket frames, which the scale measurement requires.
3. **Selenium/WebDriver.** Rejected: the driver-per-browser toolchain multiplies the vetting surface, and it offers none of the trace/actionability machinery this suite leans on for diagnosable failures.
4. **Extend jsdom coverage instead.** Rejected: jsdom cannot make any of the claims at issue — no layout, no focus engine faithful to a browser, no paint, no real socket through a real proxy. It is the gap, not the answer.
5. **Test against the Vite dev server.** Rejected by measurement, as above; kept for humans (`pnpm dev` is untouched). The dev-mode saturation finding is recorded here precisely because a future reader will be tempted to "simplify" the harness back to the dev server.
6. **Mock the backend from the browser tests.** Rejected for the smoke suite: the subject is the joined system — proxy upgrade, join order, restart semantics. Accepted narrowly for the scale measurement, where cadence must be controlled to be measurable, and even there every payload passes the real decoder.

## Argument

The suite exists to convert this repository's most-cited claims from "asserted in unit tests with fakes" to "observed in a browser against the real processes". That standard cuts both ways, and the discipline is in what the suite refuses to claim: WebKit compatibility requires a passing WebKit run on a host with its system libraries (CI is configured to install them with `--with-deps`; a developer box without root runs Chromium and Firefox and leaves WebKit to that job — an environment limitation, recorded as such, never a product failure). Timing numbers are reported without gates because a threshold without a derivation is worse than none (ADR 22); this measurement is the input a future derivation would use. And the screenshots are artifacts, because a visual-regression baseline is a maintenance treadmill this project has no reader for.

The cleanup and failure paths were proven, not assumed, per the plan: a deliberately broken assertion produced the full evidence set (screenshot, video, trace, error context, attached process logs), left no surviving child process, and freed every port for immediate rebinding by the next run.

## Implications

- The dependency allow-list gains `@playwright/test` with its reason; ADR 29's quarantine did its job visibly (1.62.1 cleared it by age, newer releases did not).
- `vite.config.ts` gains a `preview.proxy` block mirroring the dev proxy from the same `devServerTarget` keys — ADR 21's wiring claim now covered on both servers Vite can run.
- ADR 18 and ADR 24 receive their first client-side numbers; their deferred questions are reopened by evidence, not by this ADR — neither virtualization nor a delta-format change is authorized here.
- ADR 31's Observed consequences gain the browser-level proof its landing change owed to D23.
- CI gains a second runner whose cost (browser download, build, real waits) is paid once per push; the `verify` job is untouched, so code-level failures still fail fast.
- Real screen-reader testing and subjective forced-colors inspection remain explicitly manual; nothing here claims them.

## Open questions

- **Should the scale report's history be tracked across runs?** Current lean: no — one honest number per run, read by a human, until a decision actually hangs on a trend. Reopens if ADR 24's virtualization question is seriously reopened.
- **Should the smoke suite grow a technician-view scenario?** Current lean: yes, when the technician surface gains behavior only a browser can prove; nothing today qualifies beyond what the vendor-panel scenario covers.

## Observed consequences

- **20 August 2026 — first full runs, on WSL2 (Linux 6.18, Node 24).** Chromium 6/6 and Firefox 6/6 smoke scenarios pass in 23 s and 26 s per engine, fresh stack per test; WebKit fails to launch locally for missing system libraries (GTK/GStreamer/GLES), and the CI job is configured to install those libraries and run it. The scale measurement passed integrity — 120/120 frames applied, 500 rows and links retained — and reported: achieved rate 9.79 Hz against the 10 Hz target, delta-to-next-paint p50 47.3 ms / p95 53.7 ms / max 74.5 ms, animation-frame interval p50 16.7 ms / p95 50.1 ms, JS heap 0.7 MB → 153 MB after load plus 120 frames (Chromium 151, 1280×720, 8 logical CPUs).
- **20 August 2026 — the dev-server finding.** The suite's first form ran against the Vite dev server and produced three 120-second timeouts with no assertion failure; a CPU profile attributed the blocked main thread almost entirely to development-build rendering machinery. Recorded in this ADR's Decision; the fix (build once, serve `vite preview`) is why the harness looks the way it does.
- **23 August 2026 — the probe's "frames applied" was actually "frames received", and it was counted inside `requestAnimationFrame`.** External review caught both: the counter incremented only when an animation frame followed the socket message, so an occluded or throttled page starved the count and timed out the integrity poll while a screenshot showed the final frame's content correctly rendered — a probe defect, not a UI regression — and the name overstated the metric, since a received frame the store rejected would still have counted. Fixed by counting receipt synchronously in the message listener (rAF now samples only receipt-to-next-animation-frame latency) and renaming the metric `framesReceived`; the final-frame content assertion, which was always present, is the application evidence and is now named as such. Earlier evidence entries quoting "frames applied" describe what those runs printed and stand unedited; their integrity claim was in practice backed by the same final-frame assertion.

## Related

- **ADR 2** (HTTP ingest, WebSocket fan-out) — owns the server half of the scale claim, measured earlier; this ADR supplies the client half.
- **ADR 18** (flush sequence, delta granularity deferred) — its "until measured" now has a measurement; amended with the number.
- **ADR 21** (endpoints from the environment, dev proxy) — the wiring the harness reuses verbatim; amended with the preview proxy.
- **ADR 22** (gates from derived budgets, reports otherwise) — the reason the scale numbers are reported, not gated.
- **ADR 24** (narrow scale claim, virtualize on measured churn) — its churn question receives its first client-side evidence; amended with the number.
- **ADR 29** (dependency allow-list and quarantine) — admitted the one new dependency and is the reason there is only one.
- **ADR 31** (jittered reconnect, session reconciliation) — its restart recovery is the smoke suite's headline scenario, now browser-proven.
- **Register D23** — resolved by this ADR.
- **Principle 6** (accessibility is the interface) — the reason every selector is a role and a name.
- **Principle 15** (tooling over review memory) — the reason the evidence runs in CI rather than in a README claim.

## Notes

The suite's ports (8390/5390 smoke, 8395/5395 scale) are fixed per project so even an accidental overlap cannot collide, and they deliberately avoid every port `pnpm dev` uses — both stacks can run at once on one machine, which is exactly how the suite was developed.
