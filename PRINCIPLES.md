# UI Engineering Principles for an Agent-Maintained Codebase

These principles govern a user interface for operational robot data and commands. They are intended to keep the system safe, coherent, accessible and changeable as coding agents produce a larger share of the implementation.

The original document had a sound direction: isolate domain rules, validate external data, distinguish observation from intent, enforce important boundaries and centralize deliberate variation. However, several claims were too absolute to serve as binding engineering rules, and important UI and agent-operability requirements were absent.

## Executive summary / Non-negotiables

The following rules protect safety, authorization, data integrity and critical user behaviour. Violations in these areas require automated or runtime controls in addition to review:

1. **Server is the authority** — The UI may hide or disable actions; it never authorises them. Every protected operation is authenticated and authorised on the server (Principle 10).
2. **External data is untrusted** — Decode every network, storage, URL, worker and cross-window payload at the boundary. Never cast raw payloads into trusted types (Principle 4).
3. **Domain rules have one authority** — Robot identity, capability meaning, command eligibility and telemetry interpretation live in a framework-independent domain or application layer (Principle 2).
4. **Requested ≠ observed** — A command acknowledgement is not proof that the physical state changed. Reconcile explicitly, including timeout and conflict behaviour (Principle 3).
5. **Accessibility and high-consequence commands are release requirements** — Target WCAG 2.2 Level AA; destructive or safety-relevant robot commands require confirmation and audit behaviour proportional to consequence (Principles 8 and 10).

All other principles remain binding; the list above is the minimum set that must never be review-only.

## Enforcement vocabulary

Every binding rule names its actual enforcement mechanism.

- **Static:** lint, dependency analysis or another build-time structural check.
- **Types:** the type system makes invalid states harder to express. Types do not validate runtime input or prove correctness.
- **Test:** an automated test checks observable behavior or a contract.
- **Runtime:** production code validates, authorizes, measures or rejects the relevant operation.
- **Review:** a reviewer must evaluate context that automation cannot reliably judge.

Review is a valid control, but a review-only rule is a convention rather than a guarantee. Rules that protect safety, authorization, data integrity or critical user behavior require an automated or runtime control as well as review.

Exceptions are allowed only when the rule states an exception path. An exception must be narrow, explained beside the suppression or in an Architecture Decision Record, and covered by an appropriate test.

## Architecture Decision Records

Use an Architecture Decision Record under `/docs/adr` for decisions that are cross-cutting, difficult to reverse, security-sensitive or likely to surprise a future maintainer. Examples include a state-management model, a wire-versioning policy, a vendor-extension mechanism or a deliberate boundary exception.

Do not require an ADR for every non-obvious implementation choice, and do not require one before exploratory code exists. Record the decision before it becomes the accepted implementation, then amend or supersede the record when the decision changes. The repository must never claim that an ADR describes reality when the implementation has diverged.

---

## 1. Dependencies follow declared boundaries and public APIs

Presentational primitives under `shared/ui` receive display data, state and callbacks. They do not import robot, site, freshness, tenant or vendor models. Higher layers may compose them into domain-aware components.

Features do not reach into another feature's internals. Cross-feature behavior must use a documented public API, an application-level composition module or a lower-level shared abstraction. Cyclic feature dependencies are forbidden.

This is not a universal ban on every feature-to-feature import. A deliberate public feature API can be clearer than prematurely moving feature-specific behavior into `shared` or `entities`.

**Prevents:** domain leakage into reusable UI, dependency cycles, hidden coupling and falsely generic shared modules.

**Enforced by:** Static dependency rules and cycle detection; Test for the rule configuration; Review for whether an extracted abstraction is genuinely shared.

## 2. Domain rules have one authoritative implementation

Rules that define robot identity, capability meaning, command eligibility, site grouping and telemetry interpretation live in a domain or application layer with framework-independent tests. React components render decisions and collect user intent. Transport adapters decode and encode messages.

The exact folder name is not the principle. `entities` is acceptable if it represents the domain boundary, but business workflows that coordinate several entities may belong in an application or use-case layer rather than being forced into a single entity.

**Prevents:** duplicated rules, components that disagree and domain behavior coupled to React or a vendor client.

**Enforced by:** Static import rules where possible; Test for domain behavior; Review for inline reimplementation and misplaced orchestration.

## 3. State is separated by authority, lifetime and transition model

Keep these concerns distinct:

- **Remote resource state:** fetched records and their cache lifecycle.
- **Observed live state:** timestamped facts reported by a robot or stream.
- **Requested state:** the command or target state submitted by a user.
- **Workflow state:** draft, validating, submitting, acknowledged, rejected, timed out, cancelled or reconciled.
- **Local view state:** selection, expansion, sorting and other disposable presentation choices.

Do not duplicate a value in several stores when it can be derived from one authoritative source. A command acknowledgement is not proof that the physical state changed. Reconcile requested and observed state explicitly, including timeout and conflict behavior.

**Prevents:** impossible UI states, optimistic updates presented as facts, duplicated caches and ad hoc loading or error flags.

**Enforced by:** Types using discriminated unions or state machines; Test for transitions, races and reconciliation; Review for duplicated or redundant state.

## 4. External contracts are decoded once and evolved deliberately

Treat every network, storage, URL, worker and cross-window payload as untrusted runtime data. Decode it at the boundary into an internal type. Downstream code must not cast raw payloads into trusted types or repeat vendor parsing.

Reject missing, malformed, unsafe or semantically invalid required data. Count and diagnose rejected messages without logging secrets or sensitive payloads. Unknown fields are not automatically errors: ignore, preserve or reject them according to an explicit compatibility policy. Additive fields should normally remain forward-compatible; breaking semantic changes require a version or negotiated capability.

Compile-time TypeScript types support this rule but do not enforce it at runtime.

**Prevents:** silent coercion, unsafe deserialization, inconsistent parsing and deployments that break when a producer adds a field.

**Enforced by:** Runtime schema validation; Test with valid, missing, malformed, boundary-value, additional-field and supported-version cases; Types for the decoded result.

## 5. The canonical model preserves shared meaning without erasing differences

Normalize concepts that have the same operational meaning across vendors. Represent genuine differences through typed capabilities, versioned extensions or vendor adapters. UI behavior depends on capabilities and policy, not vendor-name conditionals scattered through components.

A capability determines what the interface may offer; it does not replace server-side authorization or guarantee current availability. Contract tests require representative fixtures and edge cases for every supported vendor and contract version. One recorded payload per vendor is a smoke test, not proof of the entire mapping.

**Prevents:** a lowest-common-denominator model, fictional uniformity, vendor conditionals in UI code and unsupported actions.

**Enforced by:** Types for capabilities and extension points; Test for representative fixtures, missing capabilities and mapping invariants; Review for loss of vendor semantics.

## 6. Provenance and freshness are explicit where they affect a decision

Telemetry and other time-sensitive observations carry the source timestamp required to evaluate their age, plus receipt time when transport delay matters. Freshness is derived from an injected clock and policy, so silence can move data from current to stale or unreachable without a new message.

Do not require every telemetry value to render a separate `LIVE`, `STALE`, `UNREACHABLE` or `UNKNOWN` label. Show freshness at the smallest scope users need to interpret or act on the data, such as a panel, group or value. Never use color alone. Preserve a distinction between unknown, never observed, stale and disconnected when those states lead to different decisions.

The freshness vocabulary and thresholds are product policy, not universal facts. Centralize them and test boundary times.

**Prevents:** stale observations presented as current, duplicated timers, inaccessible status cues and timestamp rules that vary by screen.

**Enforced by:** Types for time-sensitive read models; Test with a controlled clock; accessibility Test where status is rendered; Review for the correct display scope.

## 7. Every asynchronous surface defines its complete user-visible state

Before implementing an asynchronous feature, define the relevant states: initial loading, background refresh, empty, partial data, stale data, offline, recoverable error, terminal error, pending command, success, rejection, cancellation and permission denial. Not every surface needs every state, but omission must be deliberate.

Preserve useful data during refresh and recoverable failures when doing so is honest. Errors state what failed, what remains valid and what the user can do next. Prefer a consistent error shape that includes:

- a stable machine-readable code or category,
- a human-readable explanation of what failed,
- an indication of what data or actions remain valid,
- recoverable next steps where they exist,
- a correlation identifier that can be used in logs and support.

Retried or repeated commands must have explicit idempotency and duplicate-submission behavior.

The interface should remain usable under degraded network conditions. Prefer progressive enhancement: core observation and command flows should degrade gracefully rather than become blank or permanently blocked when connectivity is intermittent. Offline or partially-connected behaviour is defined by the state matrix above; do not assume continuous connectivity.

**Prevents:** blank screens, indefinite spinners, destructive retries, lost context, success messages that precede confirmation, and opaque errors that agents and operators cannot diagnose.

**Enforced by:** Types for state variants; Test for the applicable state matrix and transitions; Review for content, recovery and operational safety.

## 8. Accessibility is a release requirement

Target WCAG 2.2 Level AA for user-facing web interfaces unless a stricter product or legal standard applies. Start with semantic HTML. All functionality must be keyboard operable; focus must remain visible and logical; controls need accessible names; errors and status changes must be programmatically available; contrast, reflow, motion and target size must meet the adopted standard.

Automated accessibility checks catch only a subset of defects. Critical workflows also require keyboard review and assistive-technology testing at a frequency proportional to risk.

**Prevents:** interfaces that exclude users, inaccessible real-time updates, invisible focus and custom controls with incomplete semantics.

**Enforced by:** Static and automated accessibility Test; component tests for names, roles and status messages; browser Test for keyboard flows; periodic manual Review.

## 9. Design tokens represent repeated design decisions, not every CSS number

Use semantic tokens for repeated decisions such as color roles, typography, spacing scales, radii, elevation, motion and responsive breakpoints. Components consume semantic roles such as `status-danger` rather than palette positions such as `red-500` when the meaning matters.

Raw values are allowed for intrinsic implementation details that are not reusable design decisions, including a one-pixel separator, calculated geometry or a component-specific dimension. The lint policy must define allowed locations and a narrow suppression path. Relative and fluid units are often more appropriate than pixels for layout and text.

Critical status, command and safety surfaces must be covered by visual-regression tests that exercise the meaningful appearance states (including themes and forced-colors where relevant). Appearance that carries operational meaning is treated as behaviour.

**Prevents:** visual drift, incomplete theming, meaningless token proliferation, exceptions hidden as arbitrary literals, and silent visual regressions on safety-relevant surfaces.

**Enforced by:** Static checks for prohibited color and repeated style literals; visual-regression Test for critical components, status surfaces and themes; Review for token semantics and justified exceptions.

## 10. Security and privacy controls do not depend on the interface

The UI may hide or disable unavailable actions for clarity, but the server must authenticate and authorize every protected operation. Treat user content, vendor content, URLs, storage values, cross-window messages and rendered rich text as untrusted. Avoid unsafe DOM sinks, constrain external content and apply a tested Content Security Policy where the deployment permits it.

Do not place secrets in client bundles. Minimize sensitive data in analytics, logs, screenshots and error reports. Destructive or safety-relevant robot commands require confirmation and audit behavior proportional to their consequence.

**Prevents:** client-side authorization, cross-site scripting, data leakage, accidental destructive commands and unauditable actions.

**Enforced by:** Runtime authorization and input handling; Static dependency and secret scanning; security Test; deployment-policy Test; threat-model and code Review.

## 11. Tests prove behavior at the cheapest reliable boundary

Test domain rules as pure units, adapters as contracts, components through accessible user behavior and critical workflows in a real browser. Add visual regression tests for layouts or states where appearance carries meaning. Prefer deterministic fixtures, injected time and controlled network behavior.

Do not require every behavior to be covered at every layer. Do not use implementation-detail assertions or broad snapshots as substitutes for behavioral tests. A lint test proving that the boundary rules themselves run is useful, but it does not replace tests of the behavior those boundaries protect.

Every defect fix adds a regression test at the lowest layer that reproduces the failure reliably.

Time-sensitive and asynchronous tests must use an injected, controllable clock and controlled network behaviour so that freshness, timeouts, races and reconciliation can be asserted deterministically.

**Prevents:** slow brittle suites, false confidence from snapshots, regressions hidden behind mocks and code that agents cannot safely change.

**Enforced by:** Test in continuous integration; mutation or coverage analysis where it provides useful signal; Review for test relevance and determinism.

## 12. Performance and observability are product behavior

Define budgets for bundle cost and the user journeys where latency affects safety or task completion. Measure loading, interaction latency and layout stability in representative environments; use production field data when available.

Virtualize or aggregate high-rate telemetry rather than rendering every update blindly. Prefer aggregation, sampling or virtualization at the earliest responsible layer so that the UI remains responsive under realistic data volume.

Instrument failures, rejected payloads, stream health, reconnect behavior, command lifecycle and significant user-facing latency using stable names and correlation identifiers. Telemetry must answer what failed and where without collecting unnecessary personal or operational data.

**Prevents:** an interface that is functionally correct but unusable under real data volume, and incidents that cannot be diagnosed from production evidence.

**Enforced by:** performance and bundle Test with explicit budgets; Runtime metrics, traces and structured logs; Review for instrumentation usefulness and data minimization.

## 13. Configuration expresses deployment policy; code expresses stable behavior

Tenant branding, environment endpoints and deployment-specific values belong in typed, validated configuration. Runtime feature flags require an owner, purpose, default, rollout policy and removal condition. Tenant entitlements and safety policy are enforced by the authoritative backend, even when configuration also controls their presentation.

Do not convert every branch into configuration. Stable domain differences belong in typed models or strategies; short-lived rollout choices belong in flags; user preferences belong in persisted user settings. Prefer composition or data-driven policy when a conditional would otherwise be repeated.

**Prevents:** customer forks, stale flags, invalid startup state, hidden environment assumptions and a configuration system that merely relocates complexity.

**Enforced by:** Types and Runtime schema validation; Test for defaults and supported combinations; ownership or expiry automation for flags; Review for the correct variation mechanism.

## 14. The repository is operable by agents and auditable by people

Keep one authoritative repository instruction file, preferably `AGENTS.md`, with scoped overrides only where needed. It names the setup, format, lint, type-check, test and build commands; architectural boundaries; generated-file policy; relevant security constraints; and the definition of done. If other agent-specific files exist, generate them from the same source or state their precedence to prevent contradictory instructions.

The development environment and checks must be reproducible without undocumented local state. Tasks should have explicit acceptance criteria and enough product context to distinguish a correct implementation from code that merely compiles. Agents produce small, reviewable diffs, preserve unrelated changes, report validation evidence and surface uncertainty or failed checks.

**Agent Definition of Done (minimum):**

- lint, type-check and relevant tests pass;
- the change is small and reviewable;
- validation evidence is reported;
- no new high-risk change (authorization policy, secrets, production deployment, destructive migrations, safety-relevant commands, or changes whose correctness cannot be established by the available checks) is merged without human approval.

Agents do not approve their own high-risk changes. Human review is required for authorization policy, secrets, production deployment, destructive migrations, safety-relevant commands and changes whose correctness cannot be established by the available checks.

**Prevents:** instruction drift, unreviewable generated changes, fabricated confidence, environment-specific success and autonomous escalation into high-risk operations.

**Enforced by:** continuous-integration Test and protected-branch policy; sandbox and permission controls where available; change-size or ownership policy where useful; human Review for high-risk categories.

## 15. Enforcement is proportionate and tested

Automate rules whose violations are mechanically recognizable and consequential. Keep checks fast enough to run locally, and make failure output tell the next developer or agent how to correct the problem. Test custom lint and dependency rules with valid and invalid fixtures so a configuration regression cannot silently disable them.

Do not claim that all principles are enforced in the build. Several require runtime controls, product judgment or human review. Measure each control against the failure it is meant to prevent, and remove checks that generate noise without reducing risk.

**Prevents:** architectural decay, performative policy, ignored warnings and a build whose complexity exceeds the value of its controls.

**Enforced by:** Static checks, Types, Test, Runtime controls and Review, as specified by each principle.

---

# Evaluation of the original document

## Material gaps corrected

1. **Accessibility:** no requirement covered semantics, keyboard operation, focus, status announcements, contrast, reflow or assistive-technology validation.
2. **Security and privacy:** no rule covered runtime authorization, unsafe content, client-side secrets, browser security policy, sensitive telemetry or high-consequence commands.
3. **Complete UI states:** state separation was good, but loading, empty, partial, offline, error, retry, rejection, cancellation and reconciliation behavior were not defined.
4. **Agent-operable development:** the document justified rules by reference to agents but did not define repository instructions, reproducible commands, acceptance criteria, validation evidence, small diffs or human approval boundaries.
5. **Test strategy:** individual tests were named, but there was no policy for unit, contract, component, browser, accessibility and visual testing or for deterministic time and network behavior.
6. **Performance:** no budgets or behavior under high-rate telemetry and constrained devices were included.
7. **Observability:** rejected payload counting appeared once, but command lifecycle, reconnects, user-visible latency, correlation and data minimization were absent.
8. **Runtime trust boundaries:** wire validation was too narrow; storage, URLs, workers, cross-window messages and rich content also cross runtime trust boundaries.
9. **Configuration lifecycle:** feature flags lacked ownership, expiry and a distinction from entitlements, domain strategy and user preference.
10. **Exception handling:** several absolute rules had no documented escape hatch, encouraging either unnecessary architecture or silent suppression.

## Overstatements corrected

| Original claim                                                               | Problem                                                                                                                                                                                    | Corrected position                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Every non-obvious decision has an ADR written before its code                | This creates documentation debt, discourages exploration and is unlikely to remain true.                                                                                                   | Record consequential, cross-cutting or difficult-to-reverse decisions before acceptance, not necessarily before exploration. |
| Presentational components know nothing about freshness                       | Freshness can be a generic presentation concept even when robot freshness policy is domain-specific.                                                                                       | Shared UI may render generic status data but must not derive robot-specific freshness rules.                                 |
| Domain logic lives in `entities`                                             | Multi-entity workflows and policies often belong in an application or use-case layer.                                                                                                      | Give every rule one framework-independent authority; choose the layer by responsibility.                                     |
| Features do not import other features; shared behavior always moves downward | A stable public feature API or application-level composition can be safer than premature generalization.                                                                                   | Forbid internal reach-through and cycles; allow declared public dependencies and orchestration.                              |
| Server, live and workflow state are three stores                             | The conceptual separation is correct, but physical stores are an implementation choice and local view state is missing.                                                                    | Separate by authority and lifecycle without mandating a specific number of stores.                                           |
| Unknown wire fields are malformed cases                                      | Rejecting additive fields damages forward compatibility unless strict rejection is an intentional protocol rule.                                                                           | Reject invalid required data; handle unknown fields through an explicit compatibility policy.                                |
| One payload per vendor verifies the canonical mapping                        | One fixture cannot cover optional fields, boundary values, versions or malformed data.                                                                                                     | Use representative fixtures, edge cases and mapping invariants for each supported version.                                   |
| Every telemetry value presents freshness                                     | Repeated labels can add noise and still fail to communicate group-level stream health.                                                                                                     | Carry enough provenance to derive freshness, then display it at the smallest decision-relevant scope.                        |
| Feature code contains no raw pixel spacing                                   | Pixels are valid for borders and exact device-space details; tokenizing every number creates meaningless tokens.                                                                           | Tokenize repeated design decisions and permit narrow, reviewed implementation literals.                                      |
| Build enforcement is why all other principles hold                           | Authorization, runtime validation, usability and architectural judgment cannot all be guaranteed by a build.                                                                               | Combine static, type, test, runtime and review controls according to the risk.                                               |
| Configuration carries tenant differences                                     | Tenant differences can be policy, entitlement, domain capability, branding or temporary rollout state. Treating all of them as configuration relocates conditionals without modeling them. | Use typed configuration, capabilities, strategies, flags and server-enforced entitlements for their distinct purposes.       |
| Three rules are review-only                                                  | The document actually assigned review wholly or partially to more than three principles, so the count was internally inconsistent.                                                         | Do not state a fixed count; label each control accurately.                                                                   |

## Claims that depend on repository evidence

The following original claims may be true, but the document alone cannot establish them:

- A dependency rule already forbids `shared` from importing higher layers.
- A deliberate boundary-violation fixture and a test of the lint failure exist.
- Store shapes distinguish observed values from requested values.
- The canonical envelope has exactly one runtime schema.
- Malformed payload and vendor mapping fixtures cover the stated cases.
- Every telemetry-derived read model carries freshness.
- Raw color and spacing literals are rejected in the stated directories.

Before marking this document as binding, verify those controls in the repository. Otherwise change **Enforced by** to **Planned enforcement** until the check exists.

## Primary references

- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [TypeScript: Type Compatibility and Soundness](https://www.typescriptlang.org/docs/handbook/type-compatibility)
- [JSON Schema: Object properties and additional properties](https://json-schema.org/understanding-json-schema/reference/object)
- [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Web Vitals](https://web.dev/articles/vitals)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OpenAI: Introducing Codex](https://openai.com/index/introducing-codex/)
- [OpenAI: Running Codex safely](https://openai.com/index/running-codex-safely/)
- [GitHub: Repository custom instructions for coding agents](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
