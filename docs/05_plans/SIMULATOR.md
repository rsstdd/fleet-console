 # Simulator Alignment and Hardening

  ## Summary

  Bring @fleet/simulator, its package specification, README/TODO surfaces, tests, and enforcement metadata into agreement. Preserve its independent vendor-
  dialect boundary, deterministic behavior, freshness-by-silence semantics, and thin non-storage responsibility while correcting lifecycle, observability,
  validation, bounds, and documentation defects.

  Start with an active docs/05_plans/SIMULATOR.md following the repository lifecycle. Update its facts and evidence during implementation, then archive it when
  all acceptance criteria are met.

  ## Implementation Changes

  - Write focused failing tests before each behavioral change.
  - Correct transport and lifecycle behavior:
      - Track pending sends during shutdown, drain until the configured deadline, abort remaining work, and wait for cancellation accounting before emitting the
        final summary.

      - Make retry backoff abortable so shutdown leaves no long-lived retry timer and issues no post-cancellation request.
      - Memoize the shutdown promise so concurrent stop() calls and repeated signals await the same drain.
      - Keep process signal handlers active during shutdown and remove them after completion.

  - Correct observability:
      - Add sendShed; never classify global concurrency shedding as skippedOverdue.
      - Reserve skippedOverdue for a robot whose previous send remains outstanding and coalescedOverdue for late scheduler wake-ups.
      - Count initial requests and retry attempts when dispatched; the settled invariant is one requestsSent per accepted send and attempts - 1 retriesSent.
      - Use an internal attempt-notification seam on IngestClient.send so periodic and final metrics are accurate without exposing payload data.
      - Ensure final summaries contain settled cancellation, retry, shedding, and zero-in-flight values.

  - Strengthen boundary behavior:
      - Validate --endpoint and FLEET_INGEST_URL as HTTP(S) origins only.
      - Reject credentials, non-root paths, queries, fragments, and surrounding whitespace; accept an optional root slash and normalize to URL.origin.
      - Redact logged endpoints back to their origin as defense in depth.
      - Replace single-pass coordinate reflection with repeated mathematical reflection that remains finite and within site bounds after arbitrarily large
        elapsed intervals.

  - Preserve established contracts:
      - Keep all vendor payload shapes and nine recorded fixtures unchanged.
      - Keep canonical-model and production workspace-package independence.
      - Keep CLI defaults, one request per reading, bounded concurrency, and silence-only drop behavior.
      - Define restart honestly: every process reconstructs deterministic initial state from its seed; dropped robots are frozen only within their current
        process.

      - Keep main(argv, env) as the only supported package export. Other source exports remain internal test/recording seams; add no package subpaths.

  ## Documentation and Enforcement Alignment

  - Update docs/03_package-specs/03_SIMULATOR.md to:
      - Replace the stale 182-test claim with the final measured baseline.
      - Describe the actual package export surface and include the recording directory in the internal structure.
      - Document sendShed, exact attempt counting, abortable/idempotent shutdown, strict origin validation, bounded reflection, and deterministic-reset
        semantics.

      - Reconcile completed ADR 2 throughput evidence with the still-missing full ingest-to-fan-out/browser latency and degradation measurement.

  - Synchronize package and root documentation:
      - Remove every claim that restarting resumes in-memory robot state.
      - Explain that restart recreates seeded initial state and can temporarily produce lower A/C sequences until the server’s prior sequence is caught up.
      - Replace “once server exists” and “one representative fixture per vendor” language with the current server and nine-fixture facts.
      - Add package coverage/verification commands and the root fixture-recording command.
      - Remove completed browser/recovery work from packages/simulator/TODO.md; retain only genuine remaining work and link full-stack measurement to root TODO
        P3.2.

      - Update simulator-specific root README/TODO claims without changing unrelated work.

  - Restore Principle 14 traceability:
      - Replace stale TODO §…, adapter-TODO, and server-TODO references across simulator source/tests with current ADR, package-spec, scoped-guide, or symbol
        references.

      - Correct internal lidar documentation to identify Vendor A as the only serialized lidar source.
      - Replace “planned adapter schema” wording with references to the implemented adapter modules.

  - Align mechanical enforcement:
      - Add nearby citations in packages/simulator/eslint.config.js for its existing ADR-backed rules.
      - Register the simulator’s lint/configuration, manifest-parity, fixture-drift, runtime-entry, and vendor-parity mechanisms in docs/decisions.json against
        existing ADRs only.

      - Regenerate the pending-decision index and validate architecture documentation; create no new ADR.

  ## Test and Acceptance Plan

  Add deterministic coverage for:

  - Separate sendShed, per-robot busy, and scheduler-coalescing counters.
  - Exact multi-retry accounting and attempt timing.
  - Cancellation during retry backoff, no post-abort fetch, and no lingering timer.
  - Concurrent idempotent shutdown, deadline abort, settled final metrics, and repeated process signals.
  - Endpoint-origin acceptance, normalization, environment handling, actionable rejection messages, and secret-safe logging.
  - Position bounds after elapsed intervals large enough to cross the site repeatedly.
  - Same-seed process restarts resetting identically and dropped state remaining frozen within one run.

  Retain and rerun:

  - Exact dialect equality and deliberate-absence tests.
  - Vendor and manifest parity enforcement.
  - Nine-fixture determinism and adapter contract coverage.
  - Scheduler fairness at 50@1 Hz and 500@5 Hz.
  - Targeted drop isolation, real HTTP delivery, and subprocess liveness.

  Run in this order:

  1. pnpm --filter @fleet/simulator test:coverage
  2. pnpm --filter @fleet/simulator lint
  3. pnpm --filter @fleet/simulator build
  4. pnpm check:type-safety
  5. pnpm check:doc-comments
  6. pnpm check:dependencies
  7. pnpm docs:decisions
  8. pnpm check:architecture-docs
  9. pnpm record:fixtures
  10. git diff --exit-code -- 'packages/adapters/src/vendors/*/__fixtures__/*.json'
  11. Serial pnpm test
  12. Running-stack normal, drop, recovery, 50@1 Hz, and 500@5 Hz checks
  13. pnpm test:e2e
  14. pnpm test:e2e:scale
  15. pnpm check:ci once the unrelated active-plan metadata blocker is clear

  ## Assumptions

  - No new ADR is required; the work enforces ADRs 1, 2, 3, 9, 13, 14, 16, 21, and 33.
  - Persistence and runtime undrop controls remain out of scope.
  - Principles 5, 6, and 8 have no direct simulator UI surface; their relevant evidence remains in the real-stack browser suite. The other principles receive
    explicit simulator evidence through boundaries, validation, state separation, tests, metrics, configuration, documentation, and enforcement.

  - Existing unrelated working-tree changes are preserved.
  - Baseline evidence is 211 passing simulator tests, passing simulator lint/typecheck, passing dependency/doc-comment checks, and a passing serial 1,114-test
    workspace suite.

  - check:architecture-docs currently fails only because the unrelated untracked docs/05_plans/SERVER.md lacks required metadata. Do not silently modify that
    user-owned plan as part of this task.



   Order    Branch                  Semantic commit
  ━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1        fix/session-aware-      fix(web): recover streams across server restarts
            stream-recovery
  ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   2        test/playwright-        test(web): add real-stack Playwright evidence
            real-stack
  ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   3        fix/last-known-         fix(web): qualify disconnected fleet counts as last known
            fleet-counts
  ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   4        feat/battery-history    feat(history): add bounded battery history
  ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   5        feat/regressive-        feat(server): report regressive telemetry sequences
                     sequence-logging
  ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   6        docs/test-layer-        docs(web): settle test-file layer ownership
            policy
                                                                                ───────  ──────────────────────  ─────────────────────────────────────────────────────────────
   7        docs/roadmap-handoff    docs: reconcile roadmap delivery and archive consumed plans

   The basic sequence is:



 ## 1. Stream recovery

  git switch -c fix/session-aware-stream-recovery

  git add \
    docs/00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md \
    packages/contracts/src/envelope/envelopeSchema.test.ts \
    packages/contracts/src/envelope/envelopeSchema.ts \
    packages/contracts/src/health/healthResponseSchema.test.ts \
    packages/contracts/src/shared/primitives.test.ts \
    packages/contracts/src/shared/primitives.ts \
    packages/server/src/fanout/deltaFanOut.test.ts \
    packages/server/src/fanout/deltaFanOut.ts \
    packages/server/src/freshness/freshnessSweep.test.ts \
    packages/server/src/http/fleetResponse.test.ts \
    packages/server/src/http/fleetResponse.ts \
    packages/server/src/http/listener.test.ts \
    packages/server/src/http/listener.ts \
    packages/server/src/ingest/validationCost.test.ts \
    packages/web/src/app/appShell.test.tsx \
    packages/web/src/app/appShell.tsx \
    packages/web/src/app/useFleetTransport.test.ts \
    packages/web/src/app/useFleetTransport.ts \
    packages/web/src/entities/robot/fleetStore.test.ts \
    packages/web/src/entities/robot/fleetStoreContext.test.tsx \
    packages/web/src/shared/lib/coldStart.test.ts \
    packages/web/src/shared/lib/coldStart.ts \
    packages/web/src/shared/lib/connectionContext.test.ts \
    packages/web/src/shared/lib/connectionContext.ts \
    packages/web/src/shared/lib/fleetTransport.test.ts \
    packages/web/src/shared/lib/fleetTransport.ts \
    packages/web/src/shared/lib/streamLifecycle.test.ts \
    packages/web/src/shared/lib/streamLifecycle.ts \
    packages/web/src/shared/lib/transportDecoding.test.ts \
    packages/web/src/shared/lib/transportDecoding.ts \
    packages/web/src/shared/ui/connectionBanner.test.tsx \
    packages/web/src/shared/ui/connectionBanner.tsx

  git add -A -- \
    docs/05_plans/D22_RATIFY_AND_IMPLEMENT.md \
    docs/04_archive/D22_RATIFY_AND_IMPLEMENT.md

  # Select only ADR 31, version 2, server-session, reconnect, connecting,
  # terminal-cause, and restart-recovery hunks.
  git add -p \
    README.md TODO.md docs/decisions.json \
    docs/PENDING_ARCHITECTURE_DECISIONS.md \
    docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md \
    docs/00_adr/03_FRESHNESS.md \
    docs/00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md \
    docs/00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md \
    docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md \
    docs/01_page-specs/01_APP_SHELL.md \
    docs/01_page-specs/02_FLEET.md \
    docs/01_page-specs/03_ROBOT_DETAIL.md \
    docs/02_component-specs/07_CONNECTION_BANNER.md \
    docs/03_package-specs/00_PACKAGE_SPECS.md \
    docs/03_package-specs/01_CONTRACTS.md \
    docs/03_package-specs/04_SERVER.md \
    docs/03_package-specs/05_WEB.md \
    packages/FIXME.md packages/README.md \
    packages/contracts/TODO.md packages/contracts/src/index.test.ts \
    packages/contracts/src/index.ts packages/server/README.md \
    packages/server/TODO.md packages/server/src/http/createApp.test.ts \
    packages/server/src/http/createApp.ts packages/server/src/runServer.test.ts \
    packages/server/src/runServer.ts packages/web/README.md \
    packages/web/UI_PLAN.md packages/web/src/app/appRouter.tsx \
    packages/web/src/app/dev/componentGallery.tsx \
    packages/web/src/entities/robot/TODO.md \
    packages/web/src/features/fleet/TODO.md \
    packages/web/src/features/robot/TODO.md \
    packages/web/src/features/robot/robotDetailFixtures.ts

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit stream recovery, or Ctrl-C to stop: "
  git commit -m "fix(web): recover streams across server restarts"















  ## 2. Playwright real-stack evidence

  git switch -c test/playwright-real-stack

  git add \
    .github/workflows/ci.yml \
    .gitignore \
    .prettierignore \
    docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md \
    package.json \
    packages/web/package.json \
    packages/web/eslint.config.js \
    packages/web/playwright.config.ts \
    packages/web/tsconfig.e2e.json \
    packages/web/tsconfig.json \
    packages/web/vite.config.ts \
    packages/web/e2e/fixtures.ts \
    packages/web/e2e/globalSetup.ts \
    packages/web/e2e/scale.spec.ts \
    packages/web/e2e/stack.ts \
    pnpm-lock.yaml \
    scripts/checkDependencies.mjs

  git add -A -- \
    docs/05_plans/D23_PLAYWRIGHT.md \
    docs/04_archive/D23_PLAYWRIGHT.md

  # Stage the base Playwright scenarios, but exclude:
  # - "last known" fleet-count assertions
  # - the complete battery-history test
  git add -N packages/web/e2e/smoke.spec.ts
  git add -p packages/web/e2e/smoke.spec.ts

  # Select only ADR 32, Playwright, browser-evidence, CI, and scale hunks.
  git add -p \
    README.md TODO.md docs/decisions.json \
    docs/PENDING_ARCHITECTURE_DECISIONS.md \
    docs/00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md \
    docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md \
    docs/00_adr/29_VETTED_DEPENDENCY_ALLOW_LIST_AND_RELEASE_AGE_QUARANTINE.md \
    docs/01_page-specs/01_APP_SHELL.md \
    docs/01_page-specs/02_FLEET.md \
    docs/01_page-specs/03_ROBOT_DETAIL.md \
    docs/03_package-specs/04_SERVER.md \
    docs/03_package-specs/05_WEB.md \
    packages/FIXME.md packages/README.md packages/web/README.md \
    packages/web/UI_PLAN.md packages/web/src/entities/robot/TODO.md \
    packages/web/src/features/fleet/TODO.md \
    packages/web/src/features/robot/TODO.md

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit Playwright evidence, or Ctrl-C to stop: "
  git commit -m "test(web): add real-stack Playwright evidence"






  ## 3. Last-known fleet counts

  git switch -c fix/last-known-fleet-counts

  git add \
    packages/web/src/features/fleet/fleetPage.test.tsx \
    packages/web/src/features/fleet/fleetPage.tsx

  git add -A -- \
    docs/05_plans/FLEET_COUNTS.md \
    docs/04_archive/FLEET_COUNTS.md

  # Select the "Fleet freshness · last known" assertions only.
  git add -p packages/web/e2e/smoke.spec.ts

  # Select only ADR 23/A7/last-known fleet-summary hunks.
  git add -p \
    README.md TODO.md \
    docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md \
    docs/01_page-specs/02_FLEET.md \
    packages/README.md packages/web/README.md \
    packages/web/src/features/fleet/TODO.md

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit fleet counts, or Ctrl-C to stop: "
  git commit -m "fix(web): qualify disconnected fleet counts as last known"






  ## 4. Battery history

  git switch -c feat/battery-history

  git add \
    docs/00_adr/33_BATTERY_HISTORY_RETAINED_COMPACT_AND_SERVED_DECIMATED.md \
    docs/WIREFRAMES.md \
    packages/contracts/src/history/batteryHistorySchema.test.ts \
    packages/contracts/src/history/batteryHistorySchema.ts \
    packages/server/src/history/selectBatteryHistory.test.ts \
    packages/server/src/history/selectBatteryHistory.ts \
    packages/server/src/index.ts \
    packages/simulator/src/config/simulatorConfig.ts \
    packages/web/src/entities/robot/useRobotHistory.ts \
    packages/web/src/features/robot/batteryHistorySection.test.tsx \
    packages/web/src/features/robot/batteryHistorySection.tsx \
    packages/web/src/features/robot/robotDetailFixtures.ts \
    packages/web/src/features/robot/robotDetailPage.test.tsx \
    packages/web/src/features/robot/robotDetailPage.tsx \
    packages/web/src/styles/global.css \
    packages/web/src/styles/tokens.css

  git add -A -- \
    docs/05_plans/BATTERY_HEALTH_VERTICAL.md \
    docs/04_archive/BATTERY_HEALTH_VERTICAL.md

  # Select the complete battery-history browser scenario.
  git add -p packages/web/e2e/smoke.spec.ts

  # Select only D24/ADR 33/history/retention/decimation/60-second hunks.
  git add -p \
    README.md TODO.md docs/decisions.json \
    docs/PENDING_ARCHITECTURE_DECISIONS.md \
    docs/00_adr/06_BOUNDED_IN_MEMORY_HISTORY_NO_DB.md \
    docs/01_page-specs/03_ROBOT_DETAIL.md \
    docs/03_package-specs/00_PACKAGE_SPECS.md \
    docs/03_package-specs/01_CONTRACTS.md \
    docs/03_package-specs/03_SIMULATOR.md \
    docs/03_package-specs/04_SERVER.md \
    docs/03_package-specs/05_WEB.md \
    packages/FIXME.md packages/README.md \
    packages/contracts/TODO.md packages/contracts/src/index.test.ts \
    packages/contracts/src/index.ts packages/server/README.md \
    packages/server/TODO.md packages/server/src/http/createApp.test.ts \
    packages/server/src/http/createApp.ts \
    packages/server/src/ingest/ingestTelemetry.test.ts \
    packages/server/src/ingest/ingestTelemetry.ts \
    packages/server/src/runServer.test.ts packages/server/src/runServer.ts \
    packages/server/src/state/currentStateStore.test.ts \
    packages/server/src/state/currentStateStore.ts \
    packages/simulator/README.md packages/simulator/TODO.md \
    packages/web/README.md packages/web/src/entities/robot/TODO.md \
    packages/web/src/features/robot/TODO.md

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit battery history, or Ctrl-C to stop: "
  git commit -m "feat(history): add bounded battery history"







  ## 5. Regressive-sequence reporting

  git switch -c feat/regressive-sequence-logging

  git add -A -- \
    docs/05_plans/REGRESSIVE_SEQUENCE_REPORTING.md \
    docs/04_archive/REGRESSIVE_SEQUENCE_REPORTING.md

  # Select only telemetry.sequence_regression, acceptedSequence,
  # receivedSequence, injected logger, and associated test hunks.
  git add -p \
    packages/server/src/ingest/ingestTelemetry.test.ts \
    packages/server/src/ingest/ingestTelemetry.ts \
    packages/server/src/runServer.test.ts \
    packages/server/src/runServer.ts \
    packages/server/src/state/currentStateStore.test.ts \
    packages/server/src/state/currentStateStore.ts

  # Select only regression-logging documentation hunks.
  git add -p \
    README.md TODO.md docs/03_package-specs/04_SERVER.md \
    packages/server/README.md packages/server/TODO.md

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit regression reporting, or Ctrl-C to stop: "
  git commit -m "feat(server): report regressive telemetry sequences"









  ## 6. Test-file layer policy

  git switch -c docs/test-layer-policy

  git add -A -- \
    docs/05_plans/TEST_FILE_LAYER.md \
    docs/04_archive/TEST_FILE_LAYER.md

  # Select only test-file layer classification and fixture-placement hunks.
  git add -p \
    docs/03_package-specs/05_WEB.md \
    packages/web/src/features/robot/TODO.md

  git diff --cached --check
  git diff --cached --stat
  git diff --cached
  read -r -p "Press Enter to commit test-layer policy, or Ctrl-C to stop: "
  git commit -m "docs(web): settle test-file layer ownership"















  ## 7. Documentation reconciliation and handoff

  This excludes the three later package-alignment drafts.

  git switch -c docs/roadmap-handoff

  git status --short

  git add -A -- . \
    ':(exclude)docs/05_plans/SERVER.md' \
    ':(exclude)docs/05_plans/SIMULATOR.md' \
    ':(exclude)docs/05_plans/WEB.md'

  # Confirm this contains only documentation/archive/comment reconciliation.
  # If functional code remains, unstage it before committing:
  # git restore --staged path/to/file
  git diff --cached --check
  git diff --cached --stat
  git diff --cached

  read -r -p "Press Enter to commit the roadmap handoff, or Ctrl-C to stop: "
  git commit -m "docs: reconcile roadmap delivery and archive consumed plans"
























  ## 8. Verify the completed stack

  The invalid draft plans currently break architecture checks, so temporarily stash
  only those three files:

  git stash push --include-untracked \
    -m "hold package alignment plan drafts" -- \
    docs/05_plans/SERVER.md \
    docs/05_plans/SIMULATOR.md \
    docs/05_plans/WEB.md

  pnpm check:ci
  pnpm test:e2e
  pnpm test:e2e:scale
  git diff --check

  git stash pop
  git status --short --branch


















  ## 9. Optional: commit the three future plans

  Before doing this, add the following directly under the title in each plan and
  normalize their title indentation:

  **Authority:** Planning only.
  **Status:** Active
  **Updated:** 2026-08-20

  Then format them:

  pnpm exec prettier --write \
    docs/05_plans/SERVER.md \
    docs/05_plans/SIMULATOR.md \
    docs/05_plans/WEB.md

  pnpm check:architecture-docs

  Create independent sibling branches from docs/roadmap-handoff:

  git switch docs/roadmap-handoff
  git switch -c docs/server-alignment-plan
  git add docs/05_plans/SERVER.md
  git diff --cached
  git commit -m "docs(server): add package alignment plan"

  git switch docs/roadmap-handoff
  git switch -c docs/simulator-alignment-plan
  git add docs/05_plans/SIMULATOR.md
  git diff --cached
  git commit -m "docs(simulator): add package hardening plan"

  git switch docs/roadmap-handoff
  git switch -c docs/web-alignment-plan
  git add docs/05_plans/WEB.md
  git diff --cached
  git commit -m "docs(web): add package alignment plan"

  Optional pushes:

  git push -u origin fix/session-aware-stream-recovery
  git push -u origin test/playwright-real-stack
  git push -u origin fix/last-known-fleet-counts
  git push -u origin feat/battery-history
  git push -u origin feat/regressive-sequence-logging
  git push -u origin docs/test-layer-policy
  git push -u origin docs/roadmap-handoff
