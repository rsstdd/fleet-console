# ADR 17 — Tenant Configuration Is Selected and Validated at Build Time

**Decision:** The console ships two tenant profiles as literals, one is selected per build through `VITE_TENANT`, and both the selection and the selected profile are validated — the selection in `vite.config.ts` so a bad value fails the build, the profile at module load so an invalid one cannot reach a rendered page.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** Presentation / configuration (the deployment half of ADR 5's tenant theming).

## Issue

`packages/web/src/config/tenant.ts` was a bare TypeScript literal: `id`, `wordmark`, `theme`, and nothing else. Principle 13 asks for tenant branding, endpoints and feature flags in _validated_ typed configuration, and the design system (§ 1) makes "one panel disabled" part of what distinguishes Tenant B from Tenant A — but no flag existed, no validation existed, and no mechanism selected between profiles.

That left three questions unanswered at once, which the register held as **D8**: where deployment tenant configuration comes from, what happens when it is wrong, and which concrete flag distinguishes the second profile. The third is the one that had been quietly deferred longest: the design system described a second tenant profile the code could not demonstrate, which is a documentation claim with nothing behind it.

## Assumptions

- One deployment serves one tenant. Nothing in this console switches tenant at runtime, and no operator overrides the brand they were deployed with (ADR 5 § Assumptions).
- Exactly two profiles exist for this build — A dark, B light — so the mechanism needs two complete value sets rather than an open-ended provisioning story.
- A tenant switch is a redeploy. That is acceptable here and is the assumption that makes the runtime failure paths of a loader unnecessary rather than merely unbuilt.
- The flag that distinguishes the profiles should be visible in the demo. A flag nobody can see turned off proves nothing.

## Constraints

- Configuration is parsed and validated, not trusted (Principle 13, Principle 2). A literal that typechecks is not the same as a literal that is valid — `wordmark: ""` typechecks.
- No tenant conditionals in components (Principle 13). A flag may gate behaviour; a tenant _name_ may not appear in `features` or `entities`.
- `entities` may not import `config`. The dependency rule is enforced by `boundaries/dependencies`, so whatever gates a panel cannot reach tenant configuration from the entity layer.
- The theme a profile names must have a palette behind it. Two independent declarations of "dark | light" would be the duplicate authority Principle 1 forbids.
- No dependency without an ADR (`packages/web/CLAUDE.md`). This document is that record for one: `zod` becomes a direct dependency of `packages/web`.

## Decision

**Source.** Two profiles stay as literals in `config/tenant.ts`. `VITE_TENANT` selects between them; Vite replaces it at build time, so the shipped bundle contains a constant rather than a lookup. Absent means tenant A.

**Validation, in two places, for two different failures.**

- `vite.config.ts` calls `resolveTenantId(process.env.VITE_TENANT)` before the build starts. An unknown tenant is a failed build with the value named.
- `config/tenant.ts` decodes every profile through `parseTenantConfig` at module load. An invalid profile throws before the console renders.

The selection logic lives in its own module, `config/tenantSelection.ts`, precisely so `vite.config.ts` can import it: that module reads nothing from `import.meta.env` and is therefore safe to load in Node during the build.

**Failure policy: no fallback.** Neither check falls back to a default. A silent default is how one customer's brand ships to another.

**The flag.** `flags: { lidarHealthPanel: boolean }` — `true` for tenant A, `false` for tenant B. Named for what it turns off, never for the tenant that turns it off; a flag called `tenantB…` would put a tenant conditional in configuration, which is the same defect as putting one in a component.

**The gate.** A panel renders when the robot **declared** the capability and the tenant **enables** it. `features/robot/panelVisibility.ts` turns flags into a disabled-panel list; `selectPanelCapabilities(robot, disabled)` in `entities/robot` applies it. The list is injected rather than imported because the dependency rule forbids `entities → config` — and the separation is right anyway: what a robot declares is a vendor fact, what a deployment offers is a deployment decision.

## Positions

1. **Build-time validated configuration, one deployment tenant per build.** Chosen.
2. **Startup-loaded configuration with a documented safe fallback.** Read a file or environment at process start; fall back to a known-good default when validation fails. Rejected: it buys multi-tenant and dynamic provisioning, neither of which this deployment has, and pays with a runtime failure path that must be tested and monitored. The fallback is the worse half — a console rendering tenant A's theme with tenant B's wordmark because half the config validated is a failure mode this design should not be able to express.
3. **Server-provided tenant configuration, fetched and decoded by the console.** Single source of truth, changeable without rebuilding. Rejected: it makes the console unable to render its own shell until the server answers, adds a startup ordering problem, and puts branding behind the same transport whose failure the console is built to survive.
4. **Remove the unimplemented Tenant B flag claim.** Delete the design-system promise, keep theme and wordmark. This was the honest fallback if nobody would name the panel, and it stays the right answer if the named flag is ever rejected without a replacement. Not needed: the flag is named and demonstrated.

## Argument

Position 1 was chosen because the deployment model really is one tenant per build, and every other position pays for flexibility this console does not use. Position 2's fallback is the specific thing worth refusing: a configuration system whose failure mode is "render something plausible" is worse than one whose failure mode is "do not start", because the first kind of failure reaches a customer and the second reaches a build log.

The decisive detail was discovered while implementing rather than while deciding. Validating at module load — which is what option 1 nominally asks for — does **not** fail a build. Vite substitutes the environment value and never executes the module, so `VITE_TENANT=tenant-z` produced a clean bundle that would white-screen on load. That is exactly the runtime failure mode option 1 was chosen to avoid, arrived at by implementing option 1 carelessly. Hence the second check in `vite.config.ts`, and hence `tenantSelection.ts` existing at all: the check has to run in Node, so the module it calls must not touch `import.meta.env`.

Naming the flag `lidarHealthPanel` rather than a generic `panelX` follows the same reasoning as the tenant-name ban: a flag should say what it controls. Lidar health was chosen over dock (universal — disabling it would look like breakage) and water level (vendor C only — the demo's vendor A robots would show no difference at all), so the profile difference is visible on the robots an operator is most likely to open.

## Implications

**The roadmap half. Each item is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **`zod` is now a direct dependency of `packages/web`.** It was already in the bundle through `@fleet/contracts`, so the cost is a manifest line rather than bytes — the production bundle moved 567.36 kB → 568.32 kB raw, and gzip went _down_ slightly (175.03 → 174.77 kB). This ADR is the record `packages/web/CLAUDE.md` requires for it.
- **Two validation calls exist on purpose, and deleting either changes the failure mode.** Removing the `vite.config.ts` call moves the failure from a build log to a blank page; removing the module-load parse lets an invalid literal ship. The coupling is commented in both directions.
- **`VITE_TENANT` establishes a `VITE_`-prefixed build-variable convention** for this package. D13 later resolved as ADR 21: server host/port/origins use validated `FLEET_` process variables, while typed tenant endpoints use the Vite proxy. The lifetimes stay separate rather than forcing runtime endpoint policy into the build-time tenant selector.
- **The theme union and the palette are one declaration.** `TENANT_THEMES` in `tenantTheme.ts` is the array; the type derives from it and the schema validates against it. A profile naming a colour scheme with no palette behind it is now impossible rather than merely unlikely.
- **Adding a tenant is one profile literal plus one id**, and it is validated the moment it is added. Adding a _flag_ is one field in the schema plus one line in `panelVisibility.ts` — the schema is strict, so a renamed flag fails the build rather than reading as absent.
- **`selectPanelCapabilities` now takes a second argument.** It defaults to an empty list, so every existing caller and test kept working, but the signature is the seam through which any future deployment gate reaches the entity layer. Anything richer than a list of disabled panels should be reconsidered rather than appended.
- **The design system's Tenant B row is now a claim with code behind it.** `DESIGN_SYSTEM.md` § 1 names the panel, and three tests hold the line: the profiles differ in wordmark, theme and flag together; the flag maps to the lidar panel; and a robot that declares lidar health renders no lidar panel under tenant B.
- **Position 4 stays available and cheap.** If the named flag is ever rejected, deleting the flag field, the visibility module and the design-system row returns the console to an honest two-profile theme switch. Nothing else depends on the flag existing.
- **`packages/web/README.md` documents `VITE_TENANT` and both supported profiles.** The build variable and its failure behavior are part of the supported workflow rather than source-only knowledge.

## Open questions

- ~~**Does the tenant profile eventually need endpoints, as `CLAUDE.md`'s "branding, endpoints and feature flags" implies?**~~ **Resolved by ADR 21.** Typed browser paths live on `TenantConfig`; server binding and allowed origins remain process-lifetime `FLEET_` variables, joined locally by Vite's proxy.
- **Is one flag enough to demonstrate white-label deployment?**
  _Current lean:_ yes for this build. A second flag would be more surface without more argument, and the register's own advice is to avoid gates nobody defends.
  _Resolves on:_ a reviewer finding the single flag unconvincing, or a second genuine per-tenant difference appearing.
- **Should `TenantConfigContext` be the only way features read tenant configuration?**
  _Current lean:_ no. The context exists for the shell; features import `config/tenant` directly because the dependency rule allows it and a context would add indirection without adding an authority. If a runtime-varying tenant ever appears, this inverts — and that is position 2, which would be a new decision.
  _Resolves on:_ any move away from one tenant per build.

## Observed consequences

- 19 August 2026: implemented and green. `packages/web` at 163 tests (from 140); lint, typecheck, build and tests pass, and `VITE_TENANT=tenant-a|tenant-b` produce different bundle content hashes, which is the evidence that selection really is baked at build time.
- 19 August 2026: `VITE_TENANT=tenant-z` fails the build with `TenantConfigError: … unknown tenant "tenant-z"; expected one of tenant-a, tenant-b`. Before the `vite.config.ts` check was added it built successfully in 270 ms and would have failed only in the browser — recorded because the gap was invisible to every test and was found by running the build with a bad value rather than by reading the code.
- 19 August 2026: the page-level test was probed by removing the gate from `CapabilitiesSection`, and it failed as it should. ADR 7's lesson: a rule nobody has watched fail is indistinguishable from a rule that does nothing.
- 19 August 2026: the package's own lint rules rejected two shortcuts — passing Vite's loosely typed `import.meta.env` value straight into a `string | undefined` parameter, and an inline `import()` type in the test's module mock. The first became `resolveTenantId(raw: unknown)`, which is the more honest signature anyway: a build environment is outside the program.

## Related

- `ADR 5 — fixed exactly two tenant profiles, A dark and B light, and put theming behind a token layer; this ADR decides how a build selects between them and what else moves with the theme.`
- `ADR 4 — the dependency rule that forbids entities importing config, which is why the panel gate is injected into a selector rather than read inside one.`
- `ADR 9 — source-exported workspace packages and the tsx/Vite resolution rules that let vite.config.ts import a .ts module from src.`
- `Principle 13 (tenant branding, endpoints and feature flags live in typed configuration) — this ADR is its implementation for branding and flags; endpoints remain open as D13.`
- `Principle 2 (external input is decoded, never trusted) — the reason resolveTenantId takes unknown and the profiles are parsed rather than asserted.`
- `Principle 3 (no vendor branching) — unchanged by this ADR: a panel still requires a declared capability, and the flag can only take one away.`
- `Artifact packages/web/src/config/tenant.ts — schema, profiles, and the build-time selected TENANT.`
- `Artifact packages/web/src/config/tenantSelection.ts — the Node-safe half, imported by vite.config.ts.`
- `Artifact packages/web/src/features/robot/panelVisibility.ts — the one place flag names meet panel names.`
- `Artifact docs/DESIGN_SYSTEM.md § 1 — the Tenant B row this ADR gives code behind.`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D8 — the stub this ADR resolves; D13 inherits the VITE_ convention it establishes.`

## Notes

- 19 August 2026: **the short version of the implications.** One tenant per build, chosen with `VITE_TENANT`, validated twice — in `vite.config.ts` so a bad value fails the build, and at module load so a bad profile cannot render. No fallback anywhere. The flag is `lidarHealthPanel`, off for tenant B, and a panel needs the robot's declaration _and_ the tenant's permission. `zod` is now a direct web dependency. Adding a tenant is one literal; adding a flag is one schema field plus one line in `panelVisibility.ts`. If the flag is ever rejected, position 4 — delete it and the design-system row — is still available and costs nothing else.
- 19 August 2026: the implementation found what the decision missed. "Validated at module load" sounds like a build-time guarantee and is not one; Vite never runs the module during a build. Anyone extending this pattern to other `VITE_` variables (see **D13**) should copy the two-call shape rather than the one-line version.
