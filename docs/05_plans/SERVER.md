# Align @fleet/server with Its Specifications and Principles

  ## Summary

  - Treat docs/03_package-specs/04_SERVER.md as the intended server spec; /docs/04_SERVER.md does not exist.
  - Preserve the extensive existing worktree changes and create no commit.
  - Start by creating docs/05_plans/SERVER.md as an Active planning-only document; archive it after all acceptance
    evidence is recorded.

  - Correct these confirmed gaps:
      - ADR 26’s 64 KiB guard currently buffers the complete body before checking it.
      - HTTP ingest behavior and ordering are insufficiently tested despite documentation claiming otherwise.
      - One failed WebSocket send can prevent delivery to later clients.
      - WebSocket connection/flush health is absent.
      - Listener bind failures are not handled deterministically.
      - Server boundary enforcement lacks a legal control fixture.
      - The spec, READMEs, TODOs, decision mappings, and source comments contain stale or contradictory claims.

  ## Implementation Changes

  - Replace arrayBuffer() ingest with a bounded streaming reader:
      - Validate vendor and declared Content-Length before reading.
      - Count actual chunks and cancel at the first byte beyond 64 KiB.
      - Retain at most 64 KiB in memory and decode UTF-8 fatally before JSON.parse.
      - Return canonical 413 payload_too_large, 400 malformed_payload, or existing adapter errors without leaking request values.
      - Preserve one-reading-per-request behavior and all existing state/raw-payload semantics.

  - Extend the contracts-owned health response with required process-scoped stream health:
      - activeConnections, connectionsOpened, connectionsClosed
      - nonEmptyFlushes, framesAccepted, sendFailures
      - Define framesAccepted as socket send() returning without a synchronous error, not proof of network delivery.
      - Keep slow-client buffered-byte and timeout counters absent; that work remains trigger-deferred.
      - Update contracts, server composition, strict decoders/fixtures, and any web tests together. Keep schema version 2 under the repository’s coordinated-
        deployment/no-compatibility-window policy and record that consequence in amended ADR 25.

  - Harden transport lifecycle:
      - Isolate each fan-out send; remove and close a synchronously failing client, increment sendFailures, and continue delivering the same flush to other
        clients.

      - Count listener opens/closes and non-empty fan-out cycles at their true scope.
      - Make port-binding failures reject startListener() cleanly without starting sweep/fan-out or leaking sockets.
      - Preserve snapshot-first joining, session reconciliation, 10 Hz maximum flush rate, and deferred slow-client policy.

  - Close enforcement and auditability gaps:
      - Add a legal server lint fixture and prove all intentional violations fail while legal code produces no findings.
      - Register server enforcement mechanisms in docs/decisions.json, including the owning ADR mappings for lint boundaries, freshness, fan-out/session
        sequencing, error construction, request limits, origin policy, and bounded state/history.

      - Amend ADR 25 for stream-health fields, record the ADR 26 streaming-cap repair, regenerate the decision index, and remove stale source references such as
        completed G3, H4, I4, B1d, and M5 task identifiers.

  ## Documentation and TODO Reconciliation

  - Update the server specification to:
      - Remove the contradictory claim that slow clients are already dropped with a health counter.
      - Describe slow-client limits as trigger-deferred and failed-send isolation as implemented.
      - Replace stale “missing transport harness” and unresolved initial-state text.
      - Expand the verification matrix with streaming limits, HTTP ingest branches, stream health, client-failure isolation, bind failure, and legal lint
        controls.

  - Update packages/server/README.md and all server-related root README sections:
      - Describe the actual streaming cap and new stream-health payload.
      - Remove stale claims about absent fan-out/receiver, blank contrast evidence, empty measurements, and universal legal controls.
      - Repair bare ADR references and distinguish dated measurements from current report-only runs.
      - Keep WebSocket origin policy, unauthenticated raw diagnostics, and slow-client protection visibly unresolved.

  - Reduce server TODOs to genuine remaining work:
      - Actionable: WebSocket origin policy and remaining server/stream measurements.
      - Release risk: unauthenticated raw diagnostics.
      - Trigger-deferred: slow-client limits, regressions counter, malformed-frame escalation, and scale changes.
      - Remove completed implementation history already preserved by ADRs, READMEs, or archives.
      - Synchronize the root TODO’s server baseline and measurement sections without editing historical audit files as current authority.

  ## Test and Acceptance Plan

  - Add focused tests first for:
      - Unknown vendor and declared oversize before any body read.
      - Exact-limit, under-declared, headerless, chunked-overlimit, invalid UTF-8, invalid JSON, schema-invalid, additional-field, and valid payloads.
      - HTTP ingest through adapter dispatch into fleet/detail/history/health and WebSocket output.
      - Correct metrics, no-leak responses, receipt timestamps, duplicate/regressive behavior, and raw-payload exclusion.
      - One failing WebSocket client not blocking another, accurate stream counters, orderly close, and occupied-port rejection.
      - Legal and violating lint fixtures.

  - Re-run:
      - Focused contracts/server tests, server coverage, lint, and typecheck.
      - pnpm docs:decisions, architecture-doc, type-safety, doc-comment, dependency, token, formatting, build, and serial workspace tests.
      - pnpm check:ci, fixture drift, bundle, diff-size, and git diff --check.
      - Real-stack Chromium and Firefox E2E plus the 500-robot scale scenario locally; require WebKit completion in CI because this host lacks its system
        libraries.

  - Acceptance requires all 15 principles to have explicit evidence or an honest out-of-scope statement in the planning document, no normative conflict, no
    hidden failing/unverified check, synchronized code/spec/README/TODO/ADR claims, and archival of the completed plan.

  ## Assumptions

  - No commands, authentication system, persistence, broker, batch ingest, virtualization, or slow-client timeout/buffer policy is introduced.
  - Root documentation changes are limited to claims concerning the server, its tests, measurements, and principle compliance.
  - Existing user changes remain intact and no commit is created.
