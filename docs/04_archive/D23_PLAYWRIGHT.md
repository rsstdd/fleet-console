# Ratify D23 with a portfolio-grade Playwright suite

**Authority:** Historical only. This plan was consumed by the D23 ratification and its implementation.
**Archived:** 2026-08-20
**Superseded by:** `docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md` (the ratified decision), the harness and suites in `packages/web/e2e/` (`stack.ts`, `fixtures.ts`, `globalSetup.ts`, `smoke.spec.ts`, `scale.spec.ts`), `packages/web/playwright.config.ts`, and the `browser-evidence` job in `.github/workflows/ci.yml`.

Executed 2026-08-20. Every committed scenario passed in Chromium and Firefox locally
(CI is configured to install WebKit's system libraries and run that project); the scale
measurement reported its numbers; the cleanup and failure-artifact proofs ran as
specified. One departure from the letter of the plan, recorded in the ADR: the harness
serves the production build via `vite preview` rather than the dev server, because the
dev build's render cost was measured to starve the browser.

## Summary

Resolve D23 by adopting Playwright as the repository’s browser-testing framework.

This follows D22. The suite records D22's automatic restart recovery as durable browser
evidence, and D23 uses the next available ADR number when ratified.

## Framework and CI

- Add @playwright/test as the only new dependency, under packages/web, using a stable release accepted by ADR 29’s seven-day quarantine.
- Add it to the dependency allow-list with the rationale that real rendering, browser engines, WebSockets, keyboard behavior, traces, and paint timing cannot
  be verified by Vitest/jsdom.

- Place configuration and tests under packages/web/e2e, with a dedicated TypeScript configuration included in web typechecking and linting.
- Add scripts:
  - pnpm test:e2e for the three-browser correctness suite.
  - pnpm test:e2e:scale for the Chromium-only reported benchmark.
  - Matching filtered scripts in packages/web.

- Add a separate browser CI job after ordinary verification:
  - install Chromium, Firefox, and WebKit with playwright install --with-deps;
  - run smoke tests with one worker and one retry in CI;
  - run the scale measurement separately;
  - always upload the HTML report, failure traces, screenshots, video, process logs, and benchmark JSON.

- Use Playwright’s documented CI installation and artifact model: CI guidance (https://playwright.dev/docs/ci), trace viewer
  (https://playwright.dev/docs/trace-viewer-intro), and reporters (https://playwright.dev/docs/test-reporters).

- Ignore playwright-report/, test-results/, and local browser artifacts; do not commit visual snapshots.

## Browser harness and scenarios

- Build a test-scoped stack fixture using Node built-ins:
  - start Vite on a strict test port;
  - start the real server and simulator on isolated ports;
  - poll explicit readiness endpoints instead of sleeping;
  - expose controls to stop/restart server or simulator independently;
  - capture stdout/stderr and attach it on failure;
  - terminate all child processes, timers, and sockets after each test, escalating to forced termination only after a bounded graceful timeout.

- Run the smoke suite sequentially in Chromium, Firefox, and WebKit:
  - render the real 50-robot fleet and observe a streamed delta changing a row;
  - verify all three vendors normalize into the same table and expose their distinct capability panels;
  - verify keyboard access through the skip link, fleet filtering, row links, and detail navigation without focus theft;
  - stop the simulator and observe robot freshness degrade while the stream remains connected;
  - stop the server and verify rows remain, freshness labels disappear, and the connection banner reports loss;
  - restart the server and verify D22 automatically recovers without clicking Retry or
    reloading.

- Attach one successful fleet screenshot per browser as portfolio evidence. Screenshots are artifacts, not regression baselines.

## Reported 500-robot measurement

- Add a separate Chromium project that measures the web client, clearly distinguished from the already-recorded server benchmark.
- Obtain a valid decoded snapshot from the real stack, expand it through contracts-owned encoders to 500 robots, and serve it through Playwright’s HTTP and
  WebSocket routing. Do not hand-author or cast canonical payloads.

- Model the documented 500 robots at 5 Hz workload as ten WebSocket frames per second, with 250 robots changing in alternating frames.
- Warm up for 20 frames, then measure 100 frames and record:
  - rendered row and activation-link counts;
  - achieved WebSocket frame/update rate;
  - delta-to-next-paint latency p50/p95/max;
  - animation-frame interval p50/p95/max;
  - Chromium JS heap before and after;
  - browser version, viewport, CPU concurrency, OS, Node version, warmup, and sample count.

- Assert only benchmark integrity: 500 rows remain present and every sampled frame is applied. Do not fail on a timing or memory number without a separately
  derived budget.

- Write machine-readable JSON, print a concise CI job summary, and record the observed results in README, ADR 18, and ADR 24. The measurement reopens their
  deferred performance questions but does not authorize virtualization or delta-format changes by itself.

## Decision and documentation updates

- Create the next available ADR explaining why Playwright is justified for a front-end-heavy portfolio project, despite dependency size, browser installation cost, a second
  runner, and flake risk.

- Map D23 to that ADR and regenerate the decision index after D22 is resolved.
- Update ADR 29's observed allow-list consequences and the measured consequences of ADRs
  18 and 24.
- Update CI documentation, affected web package specifications, root and affected
  package/feature TODOs, and root and affected package READMEs with test instructions,
  automation status, and recorded measurements.
- Leave the dated decision audit unchanged.
- Mark browser automation complete only for the committed scenarios. Keep real screen-reader testing and subjective forced-colors inspection explicitly
  manual.

## Verification and assumptions

- Prove cleanup by intentionally failing a test and confirming ports can immediately be rebound and no child process survives.
- Prove the CI evidence path by forcing one browser assertion to fail locally and confirming trace, screenshot, video, and logs are generated; restore it
  afterward.

- Run dependency, architecture-doc, type-safety, lint, typecheck, unit-test, build, Playwright smoke, scale-report, bundle, formatting, and git diff --check
  checks.

- The E2E suite uses accessible roles and names, not CSS selectors or implementation details.
- Browser tests may use bounded polling and Playwright assertions; they must not use arbitrary wall-clock sleeps.
- Browser projects run sequentially because they mutate one real stack’s process state.
- Playwright automation is not evidence of screen-reader output.
- No product behavior is changed, and no commit is created.
- Before closing the phase, verify that ADRs, the decision mapping, generated index, CI
  documentation, specifications, TODOs, and READMEs agree on the committed browser
  coverage and remaining manual checks.
