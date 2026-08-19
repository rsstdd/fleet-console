# UI Engineering Principles for an Agent-Maintained Codebase

**Scope**: a UI for operational robot data and commands.
**Purpose**: keep the system safe, coherent, accessible and changeable as agents implement more of it.

## Non-negotiables

Rules protecting safety, authorization, data integrity and critical user behavior. Violations require automated or runtime controls plus review.

1. **Server is the authority.** UI may hide or disable actions; it never authorizes them. Authenticate and authorize every protected operation server-side (P7).
2. **External data is untrusted.** Decode every network, storage, URL, worker and cross-window payload at the boundary. Never cast raw payloads into trusted types (P2).
3. **Domain rules have one authority.** Robot identity, capability meaning, command eligibility and telemetry interpretation live in a framework-independent domain or application layer (P1).
4. **Requested ≠ observed.** Acknowledgement is not proof of physical state change. Reconcile explicitly, including timeout and conflict behavior (P11).
5. **Accessibility and high-consequence commands are release requirements.** Target WCAG 2.2 AA; destructive or safety-relevant commands require confirmation and audit proportional to consequence (P6, P7).

All other principles bind equally; the five above are the minimum that must never be review-only.

## Enforcement vocabulary

Every binding rule names its mechanism.

- **Static:** lint, dependency analysis or build-time structural check.
- **Types:** invalid states are harder to express. Types neither validate runtime input nor prove correctness.
- **Test:** automated test of observable behavior or contract.
- **Runtime:** production code validates, authorizes, measures or rejects the operation.
- **Review:** a reviewer judges context automation cannot reliably judge.

Review is valid, but review-only is convention rather than guarantee. Exceptions apply only where a rule states a path, and each must be narrow, explained beside the suppression or in an ADR, and covered by a test.

## Principles

**1. Domain rules have one authoritative implementation.**

- Rules defining robot identity, capability meaning, command eligibility, site grouping and telemetry interpretation live in a domain or application layer with framework-independent tests.
- **Prevents:** Duplicated rules, components that disagree, and domain behavior coupled to React or a vendor client.
- **Enforced by:** Static import rules where possible; Test of domain behavior; Review for inline reimplementation and misplaced orchestration.

**2. External contracts are decoded once and evolved deliberately.**

- Treat every network, storage, URL, worker and cross-window payload as untrusted runtime data, and decode it at the boundary into an internal type.
- **Prevents:** Silent coercion, unsafe deserialization, inconsistent parsing, and deployments broken by added fields.
- **Enforced by:** Runtime schema validation; Test (valid, missing, malformed, boundary, additional-field, supported-version); Types for the decoded result.

**3. The canonical model preserves shared meaning without erasing differences.**

- Normalize concepts carrying the same operational meaning across vendors, and represent genuine differences through typed capabilities, versioned extensions or vendor adapters.
- **Prevents:** Lowest-common-denominator models, fictional uniformity, vendor conditionals in UI, and unsupported actions.
- **Enforced by:** Types for capabilities and extension points; Test of fixtures, missing capabilities and mapping invariants; Review for loss of vendor semantics.

**4. Provenance and freshness are explicit where they affect a decision.**

- Telemetry and time-sensitive observations carry the source timestamp needed to evaluate age, plus receipt time where transport delay matters.
- **Prevents:** Stale observations read as current, duplicated timers, inaccessible status cues, and screen-varying timestamp rules.
- **Enforced by:** Types for time-sensitive read models; Test with a controlled clock; accessibility Test where status renders; Review of display scope.

**5. Every asynchronous surface defines its complete user-visible state.**

- Before implementing, define the relevant states: initial loading, background refresh, empty, partial data, stale data, offline, recoverable error, terminal error, pending command, success, rejection, cancellation, permission denial.
- **Prevents:** Blank screens, indefinite spinners, destructive retries, lost context, premature success messages, and opaque errors.
- **Enforced by:** Types for state variants; Test of the applicable state matrix and transitions; Review of content, recovery and operational safety.

**6. Accessibility is a release requirement.**

- Target WCAG 2.2 Level AA unless a stricter standard applies, starting from semantic HTML with keyboard-operable functionality and visible, logical focus.
- **Prevents:** Exclusion of users, inaccessible real-time updates, invisible focus, and incomplete custom-control semantics.
- **Enforced by:** Static and automated accessibility Test; component tests for names, roles and status; browser Test of keyboard flows; periodic manual Review.

**7. Security and privacy controls do not depend on the interface.**

- The UI may hide or disable unavailable actions for clarity, but the server authenticates and authorizes every protected operation while treating user and vendor content as untrusted.
- **Prevents:** Client-side authorization, XSS, data leakage, accidental destructive commands, and unauditable actions.
- **Enforced by:** Runtime authorization and input handling; Static dependency and secret scanning; security Test; deployment-policy Test; threat-model and code Review.

**8. Design tokens represent repeated decisions; raw literals are lint violations.**

- Use semantic tokens for repeated decisions like color roles, typography, spacing scales, radii, elevation, motion, and responsive breakpoints, with lint policy defining allowed locations for intrinsic details.
- **Prevents:** Visual drift, incomplete theming, meaningless token proliferation, hidden literal exceptions, and silent regressions on safety surfaces.
- **Enforced by:** Static checks for prohibited color and repeated style literals; visual-regression Test of critical components, status surfaces and themes; Review of token semantics and exceptions.

**9. Boundaries are enforced in the build.**

- Presentational primitives receive display data, state and callbacks without importing domain models, while features use documented public APIs or composition modules rather than reaching into another feature's internals.
- **Prevents:** Domain leakage into reusable UI, dependency cycles, hidden coupling, and falsely generic shared modules.
- **Enforced by:** Static dependency and cycle rules; Test of rule configuration; Review for genuine shared abstraction.

**10. Tests prove behavior at the cheapest reliable boundary.**

- Test domain rules as pure units, adapters as contracts, components through accessible user behavior, and critical workflows in a real browser, preferring deterministic fixtures, injected time, and controlled network.
- **Prevents:** Slow brittle suites, false confidence from snapshots, regressions hidden behind mocks, and code agents cannot safely change.
- **Enforced by:** Test in CI; mutation or coverage analysis where useful; Review for relevance and determinism.

**11. State is separated by authority, lifetime, and transition model.**

- Keep distinct remote resource state, observed live state, requested state, workflow state, and local view state, explicitly reconciling requested against observed state including timeout and conflict behavior.
- **Prevents:** Impossible UI states, optimistic updates treated as facts, duplicated caches, and ad-hoc loading and error flags.
- **Enforced by:** Types (discriminated unions or state machines); Test of transitions, races and reconciliation; Review for duplicated state.

**12. Performance and observability are product behavior.**

- Define budgets for bundle cost and user journeys where latency affects safety or task completion, instrumenting failures, stream health, and command lifecycle with stable names and correlation identifiers.
- **Prevents:** An interface correct in function yet unusable at real data volume, and incidents undiagnosable from production evidence.
- **Enforced by:** Performance and bundle Test with explicit budgets; Runtime metrics, traces and structured logs; Review of instrumentation usefulness and data minimization.

**13. Configuration expresses deployment policy; code expresses stable behavior.**

- Tenant branding, environment endpoints and deployment-specific values belong in typed, validated configuration, while runtime feature flags require an owner, purpose, default, rollout policy, and removal condition.
- **Prevents:** Customer forks, stale flags, invalid startup state, hidden environment assumptions, and configuration that merely relocates complexity.
- **Enforced by:** Types and Runtime schema validation; Test of defaults and supported combinations; ownership or expiry automation for flags; Review of the variation mechanism.

**14. The repository is operable by agents and auditable by people.**

- Keep one authoritative repository instruction file with scoped overrides, reproducible checks without undocumented local state, and explicit acceptance criteria for tasks.
- **Prevents:** Instruction drift, unreviewable generated changes, fabricated confidence, environment-specific success, and autonomous escalation into high-risk operations.
- **Enforced by:** CI Test and protected-branch policy; sandbox and permission controls where available; change-size or ownership policy where useful; human Review of high-risk categories.

**15. Enforcement is proportionate and tested.**

- Automate rules whose violations are mechanically recognizable and consequential, keeping checks fast enough to run locally with failure output that tells the next developer or agent how to correct the problem.
- **Prevents:** Architectural decay, performative policy, ignored warnings, and build complexity exceeding control value.
- **Enforced by:** Static checks, Types, Test, Runtime controls and Review, as specified per principle.
