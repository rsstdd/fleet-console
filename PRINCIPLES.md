# UI Engineering Principles for an Agent-Maintained Codebase

**Scope**: a UI for operational robot data and commands.
**Purpose**: keep the system safe, coherent, accessible and changeable as agents implement more of it.

## Non-negotiables

Rules protecting safety, authorization, data integrity and critical user behavior. Violations require automated or runtime controls plus review.

1. **Server is the authority.** UI may hide or disable actions; it never authorizes them. Authenticate and authorize every protected operation server-side (P10).
2. **External data is untrusted.** Decode every network, storage, URL, worker and cross-window payload at the boundary. Never cast raw payloads into trusted types (P4).
3. **Domain rules have one authority.** Robot identity, capability meaning, command eligibility and telemetry interpretation live in a framework-independent domain or application layer (P2).
4. **Requested ≠ observed.** Acknowledgement is not proof of physical state change. Reconcile explicitly, including timeout and conflict behavior (P3).
5. **Accessibility and high-consequence commands are release requirements.** Target WCAG 2.2 AA; destructive or safety-relevant commands require confirmation and audit proportional to consequence (P8, P10).

All other principles bind equally; the five above are the minimum that must never be review-only.

## Enforcement vocabulary

Every binding rule names its mechanism.

- **Static:** lint, dependency analysis or build-time structural check.
- **Types:** invalid states are harder to express. Types neither validate runtime input nor prove correctness.
- **Test:** automated test of observable behavior or contract.
- **Runtime:** production code validates, authorizes, measures or rejects the operation.
- **Review:** a reviewer judges context automation cannot reliably judge.

Review is valid, but review-only is convention rather than guarantee. Exceptions apply only where a rule states a path, and each must be narrow, explained beside the suppression or in an ADR, and covered by a test.

## Architecture Decision Records

Write an ADR under `/docs/adr` for cross-cutting, hard-to-reverse, security-sensitive or surprising decisions: state-management model, wire-versioning policy, vendor-extension mechanism, deliberate boundary exception. Do not require one for every non-obvious choice or before exploratory code. Record before acceptance; amend or supersede on change. The repository must never claim an ADR describes reality after implementation has diverged.

---

## 1. Dependencies follow declared boundaries and public APIs

Presentational primitives under `shared/ui` receive display data, state and callbacks; they do not import robot, site, freshness, tenant or vendor models. Higher layers compose them into domain-aware components.

Features do not reach into another feature's internals. Cross-feature behavior uses a documented public API, an application-level composition module or a lower-level shared abstraction. Cyclic feature dependencies are forbidden. This is not a ban on every feature-to-feature import, because a deliberate public feature API can be clearer than a premature move into `shared` or `entities`.

**Prevents:** domain leakage into reusable UI, dependency cycles, hidden coupling, falsely generic shared modules.
**Enforced by:** Static dependency and cycle rules; Test of rule configuration; Review for genuine shared abstraction.

## 2. Domain rules have one authoritative implementation

Rules defining robot identity, capability meaning, command eligibility, site grouping and telemetry interpretation live in a domain or application layer with framework-independent tests. React components render decisions and collect intent. Transport adapters decode and encode messages.

The folder name is not the principle: `entities` is acceptable where it is the domain boundary, and multi-entity workflows may belong in an application or use-case layer.

**Prevents:** duplicated rules, components that disagree, domain behavior coupled to React or a vendor client.
**Enforced by:** Static import rules where possible; Test of domain behavior; Review for inline reimplementation and misplaced orchestration.

## 3. State is separated by authority, lifetime and transition model

Keep distinct:

- **Remote resource state:** fetched records and cache lifecycle.
- **Observed live state:** timestamped facts from a robot or stream.
- **Requested state:** command or target state submitted by a user.
- **Workflow state:** draft, validating, submitting, acknowledged, rejected, timed out, cancelled, reconciled.
- **Local view state:** selection, expansion, sorting and other disposable presentation choices.

Do not duplicate a value across stores when one authoritative source can derive it. Acknowledgement is not proof of physical change; reconcile requested against observed state explicitly, including timeout and conflict behavior.

**Prevents:** impossible UI states, optimistic updates treated as facts, duplicated caches, ad-hoc loading and error flags.
**Enforced by:** Types (discriminated unions or state machines); Test of transitions, races and reconciliation; Review for duplicated state.

## 4. External contracts are decoded once and evolved deliberately

Treat every network, storage, URL, worker and cross-window payload as untrusted runtime data, and decode it at the boundary into an internal type. Downstream code neither casts raw payloads nor repeats vendor parsing.

Reject missing, malformed, unsafe or semantically invalid required data. Count and diagnose rejected messages without logging secrets. Unknown fields are not automatic errors: ignore, preserve or reject them per an explicit compatibility policy. Additive fields normally stay forward-compatible; breaking changes require a version or a negotiated capability. Compile-time types support this rule but do not enforce it at runtime.

**Prevents:** silent coercion, unsafe deserialization, inconsistent parsing, deployments broken by added fields.
**Enforced by:** Runtime schema validation; Test (valid, missing, malformed, boundary, additional-field, supported-version); Types for the decoded result.

## 5. The canonical model preserves shared meaning without erasing differences

Normalize concepts carrying the same operational meaning across vendors, and represent genuine differences through typed capabilities, versioned extensions or vendor adapters. UI behavior depends on capabilities and policy, never on vendor-name conditionals.

A capability determines what the interface may offer; it replaces neither server authorization nor a guarantee of availability. Contract tests require representative fixtures and edge cases for every supported vendor and version, because one recorded payload per vendor is a smoke test rather than proof.

**Prevents:** lowest-common-denominator models, fictional uniformity, vendor conditionals in UI, unsupported actions.
**Enforced by:** Types for capabilities and extension points; Test of fixtures, missing capabilities and mapping invariants; Review for loss of vendor semantics.

## 6. Provenance and freshness are explicit where they affect a decision

Telemetry and time-sensitive observations carry the source timestamp needed to evaluate age, plus receipt time where transport delay matters. Derive freshness from an injected clock and policy so that silence alone can move data from current to stale or unreachable.

Do not require every value to render a separate LIVE/STALE/UNREACHABLE/UNKNOWN label. Show freshness at the smallest scope users need in order to interpret or act — value, group or panel — and never by color alone. Preserve the distinction between unknown, never observed, stale and disconnected wherever they drive different decisions. Freshness vocabulary and thresholds are product policy: centralize them and test boundary times.

**Prevents:** stale observations read as current, duplicated timers, inaccessible status cues, screen-varying timestamp rules.
**Enforced by:** Types for time-sensitive read models; Test with a controlled clock; accessibility Test where status renders; Review of display scope.

## 7. Every asynchronous surface defines its complete user-visible state

Before implementing, define the relevant states: initial loading, background refresh, empty, partial data, stale data, offline, recoverable error, terminal error, pending command, success, rejection, cancellation, permission denial. Not every surface needs every state, but omission must be deliberate.

Preserve useful data through refresh and recoverable failures where doing so remains honest. Errors state what failed, what remains valid and what comes next, in a consistent shape:

- stable machine-readable code or category,
- human-readable explanation,
- indication of still-valid data or actions,
- recoverable next steps where they exist,
- correlation identifier for logs and support.

Retried or repeated commands need explicit idempotency and duplicate-submission behavior. The interface stays usable under degraded networks: prefer progressive enhancement so core observation and command flows degrade gracefully rather than blanking or blocking. The state matrix defines offline and partially-connected behavior; assume no continuous connectivity.

**Prevents:** blank screens, indefinite spinners, destructive retries, lost context, premature success messages, opaque errors.
**Enforced by:** Types for state variants; Test of the applicable state matrix and transitions; Review of content, recovery and operational safety.

## 8. Accessibility is a release requirement

Target WCAG 2.2 Level AA unless a stricter standard applies. Start from semantic HTML. All functionality is keyboard-operable; focus is visible and logical; controls have accessible names; errors and status changes are programmatically available; contrast, reflow, motion and target size meet the standard.

Automated checks catch only a subset, so critical workflows additionally require keyboard review and assistive-technology testing proportional to risk.

**Prevents:** exclusion of users, inaccessible real-time updates, invisible focus, incomplete custom-control semantics.
**Enforced by:** Static and automated accessibility Test; component tests for names, roles and status; browser Test of keyboard flows; periodic manual Review.

## 9. Design tokens represent repeated design decisions, not every CSS number

Use semantic tokens for repeated decisions: color roles, typography, spacing scales, radii, elevation, motion, responsive breakpoints. Where meaning matters, components consume semantic roles (`status-danger`) rather than palette positions (`red-500`).

Raw values remain allowed for intrinsic, non-reusable details such as a one-pixel separator, calculated geometry or a component-specific dimension; lint policy defines the allowed locations and a narrow suppression path. Relative and fluid units are often better than pixels for layout and text. Cover critical status, command and safety surfaces with visual-regression tests across meaningful appearance states, including themes and forced-colors, because appearance carrying operational meaning is behavior.

**Prevents:** visual drift, incomplete theming, meaningless token proliferation, hidden literal exceptions, silent regressions on safety surfaces.
**Enforced by:** Static checks for prohibited color and repeated style literals; visual-regression Test of critical components, status surfaces and themes; Review of token semantics and exceptions.

## 10. Security and privacy controls do not depend on the interface

The UI may hide or disable unavailable actions for clarity; the server authenticates and authorizes every protected operation. Treat user content, vendor content, URLs, storage values, cross-window messages and rendered rich text as untrusted. Avoid unsafe DOM sinks, constrain external content and apply a tested CSP where deployment permits.

Keep secrets out of client bundles. Minimize sensitive data in analytics, logs, screenshots and error reports. Destructive or safety-relevant robot commands require confirmation and audit proportional to consequence.

**Prevents:** client-side authorization, XSS, data leakage, accidental destructive commands, unauditable actions.
**Enforced by:** Runtime authorization and input handling; Static dependency and secret scanning; security Test; deployment-policy Test; threat-model and code Review.

## 11. Tests prove behavior at the cheapest reliable boundary

Test domain rules as pure units, adapters as contracts, components through accessible user behavior and critical workflows in a real browser; add visual regression where appearance carries meaning. Prefer deterministic fixtures, injected time and controlled network.

Do not require every behavior at every layer, and do not substitute implementation-detail assertions or broad snapshots for behavioral tests. A lint test proving boundary rules run does not replace tests of the protected behavior. Every defect fix adds a regression test at the lowest layer reproducing the failure reliably. Time-sensitive and asynchronous tests use an injected clock and controlled network so freshness, timeouts, races and reconciliation assert deterministically.

**Prevents:** slow brittle suites, false confidence from snapshots, regressions hidden behind mocks, code agents cannot safely change.
**Enforced by:** Test in CI; mutation or coverage analysis where useful; Review for relevance and determinism.

## 12. Performance and observability are product behavior

Define budgets for bundle cost and for user journeys where latency affects safety or task completion. Measure loading, interaction latency and layout stability in representative environments, using production field data when available.

Virtualize or aggregate high-rate telemetry instead of rendering every update, applying aggregation, sampling or virtualization at the earliest responsible layer so the UI stays responsive under realistic volume. Instrument failures, rejected payloads, stream health, reconnect behavior, command lifecycle and significant user-facing latency with stable names and correlation identifiers. Telemetry answers what failed and where without collecting unnecessary personal or operational data.

**Prevents:** an interface correct in function yet unusable at real data volume; incidents undiagnosable from production evidence.
**Enforced by:** performance and bundle Test with explicit budgets; Runtime metrics, traces and structured logs; Review of instrumentation usefulness and data minimization.

## 13. Configuration expresses deployment policy; code expresses stable behavior

Tenant branding, environment endpoints and deployment-specific values belong in typed, validated configuration. Runtime feature flags require an owner, purpose, default, rollout policy and removal condition. The authoritative backend enforces tenant entitlements and safety policy even where configuration controls presentation.

Do not convert every branch into configuration. Stable domain differences belong in typed models or strategies, short-lived rollout choices in flags, and user choices in persisted settings. Prefer composition or data-driven policy where a conditional would otherwise repeat.

**Prevents:** customer forks, stale flags, invalid startup state, hidden environment assumptions, configuration that merely relocates complexity.
**Enforced by:** Types and Runtime schema validation; Test of defaults and supported combinations; ownership or expiry automation for flags; Review of the variation mechanism.

## 14. The repository is operable by agents and auditable by people

Keep one authoritative repository instruction file, preferably `AGENTS.md`, with scoped overrides only where needed. It names setup, format, lint, type-check, test and build commands; architectural boundaries; generated-file policy; security constraints; and the definition of done. Generate any other agent-specific file from the same source, or state precedence, so instructions cannot contradict.

The development environment and its checks must reproduce without undocumented local state. Tasks carry explicit acceptance criteria and enough product context to distinguish a correct implementation from code that merely compiles. Agents produce small reviewable diffs, preserve unrelated changes, report validation evidence and surface uncertainty or failed checks.

**Agent definition of done (minimum):**

- lint, type-check and relevant tests pass;
- the change is small and reviewable;
- validation evidence is reported;
- no high-risk change merges without human approval.

High-risk means authorization policy, secrets, production deployment, destructive migrations, safety-relevant commands, or any change whose correctness available checks cannot establish. Agents do not approve their own high-risk changes.

**Prevents:** instruction drift, unreviewable generated changes, fabricated confidence, environment-specific success, autonomous escalation into high-risk operations.
**Enforced by:** CI Test and protected-branch policy; sandbox and permission controls where available; change-size or ownership policy where useful; human Review of high-risk categories.

## 15. Enforcement is proportionate and tested

Automate rules whose violations are mechanically recognizable and consequential. Keep checks fast enough to run locally, and make failure output tell the next developer or agent how to correct the problem. Test custom lint and dependency rules against valid and invalid fixtures so configuration regression cannot silently disable them.

Do not claim the build enforces all principles, because several require runtime controls, product judgment or human review. Measure each control against the failure it prevents, and remove checks generating noise without reducing risk.

**Prevents:** architectural decay, performative policy, ignored warnings, build complexity exceeding control value.
**Enforced by:** Static checks, Types, Test, Runtime controls and Review, as specified per principle.

---

# Evaluation of the original document

## Material gaps corrected

1. **Accessibility:** no requirement for semantics, keyboard operation, focus, status announcements, contrast, reflow or assistive-technology validation.
2. **Security and privacy:** no rule for runtime authorization, unsafe content, client-side secrets, browser security policy, sensitive telemetry or high-consequence commands.
3. **Complete UI states:** state separation was sound, yet loading, empty, partial, offline, error, retry, rejection, cancellation and reconciliation behavior went undefined.
4. **Agent-operable development:** agents justified the rules, but nothing defined repository instructions, reproducible commands, acceptance criteria, validation evidence, diff size or human-approval boundaries.
5. **Test strategy:** individual tests were named without policy for unit, contract, component, browser, accessibility and visual testing or deterministic time and network.
6. **Performance:** no budgets, and no behavior defined under high-rate telemetry or constrained devices.
7. **Observability:** rejected-payload counting appeared once; command lifecycle, reconnects, user-visible latency, correlation and data minimization were absent.
8. **Runtime trust boundaries:** wire validation was too narrow, because storage, URLs, workers, cross-window messages and rich content also cross trust boundaries.
9. **Configuration lifecycle:** flags lacked ownership and expiry, and were not distinguished from entitlements, domain strategy or user preference.
10. **Exception handling:** absolute rules offered no documented escape hatch, which encourages unnecessary architecture or silent suppression.

## Overstatements corrected

| Original claim                                                        | Problem                                                                                                                                                                 | Corrected position                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Every non-obvious decision has an ADR written before its code         | Creates documentation debt, discourages exploration, unlikely to stay true                                                                                              | Record consequential, cross-cutting or hard-to-reverse decisions before acceptance, not before exploration            |
| Presentational components know nothing about freshness                | Freshness can be a generic presentation concept even where robot freshness policy is domain-specific                                                                    | Shared UI may render generic status data but must not derive robot-specific freshness rules                           |
| Domain logic lives in `entities`                                      | Multi-entity workflows and policies often belong in an application layer                                                                                                | Give every rule one framework-independent authority; choose the layer by responsibility                               |
| Features never import features; shared behavior always moves downward | A stable public feature API or application-level composition can beat premature generalization                                                                          | Forbid internal reach-through and cycles; allow declared public dependencies and orchestration                        |
| Server, live and workflow state are three stores                      | Separation is conceptual; physical stores are an implementation choice, and local view state was missing                                                                | Separate by authority and lifecycle without mandating a store count                                                   |
| Unknown wire fields are malformed cases                               | Rejecting additive fields breaks forward compatibility unless strictness is intentional                                                                                 | Reject invalid required data; handle unknown fields by explicit compatibility policy                                  |
| One payload per vendor verifies the canonical mapping                 | One fixture covers neither optional fields, boundary values, versions nor malformed data                                                                                | Use representative fixtures, edge cases and mapping invariants per supported version                                  |
| Every telemetry value presents freshness                              | Repeated labels add noise and still miss group-level stream health                                                                                                      | Carry provenance sufficient to derive freshness, then display at the smallest decision-relevant scope                 |
| Feature code contains no raw pixel spacing                            | Pixels are valid for borders and exact device-space details; total tokenization yields meaningless tokens                                                               | Tokenize repeated design decisions; permit narrow, reviewed implementation literals                                   |
| Build enforcement is why all other principles hold                    | A build cannot guarantee authorization, runtime validation, usability or architectural judgment                                                                         | Combine Static, Types, Test, Runtime and Review according to risk                                                     |
| Configuration carries tenant differences                              | Tenant differences may be policy, entitlement, capability, branding or temporary rollout; treating all as configuration relocates conditionals instead of modeling them | Use typed configuration, capabilities, strategies, flags and server-enforced entitlements for their distinct purposes |
| Three rules are review-only                                           | The document assigned review to more than three principles; the count was internally inconsistent                                                                       | State no fixed count; label each control accurately                                                                   |

## Claims requiring repository evidence

These claims may hold, but the document alone cannot establish them:

- A dependency rule already forbids `shared` from importing higher layers.
- A deliberate boundary-violation fixture and a test of the lint failure exist.
- Store shapes distinguish observed values from requested values.
- The canonical envelope has exactly one runtime schema.
- Malformed-payload and vendor-mapping fixtures cover the stated cases.
- Every telemetry-derived read model carries freshness.
- Raw color and spacing literals are rejected in the stated directories.

Verify those controls in the repository before marking this document binding. Otherwise change **Enforced by** to **Planned enforcement** until the check exists.

## Primary references

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [TypeScript: Type Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility)
- [JSON Schema: object properties and additionalProperties](https://json-schema.org/understanding-json-schema/reference/object)
- [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Web Vitals](https://web.dev/articles/vitals)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OpenAI: Introducing Codex](https://openai.com/index/introducing-codex/)
- [OpenAI: Running Codex safely](https://openai.com/index/running-codex-safely/)
- [GitHub: Repository custom instructions for coding agents](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
