# ADR 9 — Workspace Packages Export TypeScript Source; `tsx` Is the Runtime

**Decision:** Every workspace library package exports `./src/index.ts` with no build step, and packages that execute are run through `tsx` rather than plain `node`.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Build / workspace mechanics (the packaging half of ADR 4's structural rules).

## Issue

Four packages — `contracts`, `adapters`, `server`, `simulator` — publish `"exports": { ".": "./src/index.ts" }`. Nothing recorded that choice; it was made three times independently and once reversed, and it had already produced one live defect by the time it was written down.

Source exports work because `tsconfig.base.json` sets `noEmit` and `erasableSyntaxOnly`, which is exactly the configuration that makes TypeScript files loadable without a compile step. But "loadable" depends on how a package writes its own relative imports, and that is where the packages disagreed. `packages/contracts` was briefly built to `dist`, and its 18 internal imports still carry the `.js` extensions that were correct while it emitted JavaScript. The other three packages use `.ts` extensions — 112 of them.

The disagreement is invisible to every check in CI. `tsc` under `moduleResolution: bundler`, Vitest under esbuild, and Vite all map `./x.js` onto `./x.ts`. Plain Node does not: it looks for a literal `primitives.js` that nothing emits and fails with `ERR_MODULE_NOT_FOUND`. So `pnpm lint`, `typecheck`, `test` and `build` all pass green against a `@fleet/contracts` that Node cannot load, and the failure would first appear when `packages/server` boots — the moment ADR 8's listener lands.

This ADR decides how workspace source is consumed at runtime, so that "it typechecks" and "it runs" stop being independent facts.

## Assumptions

- Node 24's type stripping does load workspace TypeScript through a pnpm link; this was verified rather than assumed. The failure is specifier resolution, not type stripping.
- The specifier split is not going to stay stable on its own. It arose once from a package changing its packaging strategy, and any package that changes strategy again will reintroduce it, because nothing in the build reports it.
- `packages/simulator` runs on plain `node src/index.ts` today and works. That is not evidence against the problem: it works because it imports no workspace package. Its own source comment already anticipates moving a type to `@fleet/contracts`, which is the change that would break it.
- A demonstration repository is judged partly on `pnpm dev` working from a clean clone. A runtime that fails only outside the test suite is worse than one that fails inside it.

## Constraints

- No dependency without an ADR. This document is that record for `tsx`, and for `esbuild`, which `tsx` wraps.
- `pnpm-workspace.yaml` sets `allowBuilds` as an opt-in list, deliberately: "Lifecycle scripts are opt-in." `esbuild` ships a platform-specific native binary and needs its `postinstall` to link it, so adopting `tsx` requires approving that script. That is a change to the repository's supply-chain posture and is recorded here rather than absorbed silently in a lockfile.
- ADR 4's dependency rule and ADR 7's resolver configuration both assume `@/*` and workspace specifiers resolve to files. Nothing here may change what a specifier means to `tsc` or to ESLint.
- `packages/web` is out of scope. It is a Vite application, not a library, has no `exports` map, and its bundler already resolves both specifier styles.

## Decision

Every workspace library package exports TypeScript source from `./src/index.ts` and has no emit step. `build` in each of those packages is `tsc --noEmit`, which is a check rather than a build, and produces no artifact any other package depends on.

Packages that execute — `packages/server` now, `packages/simulator` when it gains a workspace import — run through `tsx`. `tsx` is added as a devDependency of the package that runs, and `esbuild` is approved in `pnpm-workspace.yaml`'s `allowBuilds`. `pnpm dev` and `pnpm start` are the supported entry points; `node path/to/file.ts` is not.

Both relative-specifier styles — `./x.ts` and `./x.js` — resolve correctly under `tsx`, `tsc`, Vitest and Vite. This ADR does not require the workspace to converge on one, and the existing split stands.

## Positions

1. **Converge every package on `.ts` specifiers and keep plain `node` as the runtime.** The cheapest option by dependency count: 18 lines changed in `contracts`, one tsconfig flag, no new package, and the runtime stays the platform itself. Rejected, but narrowly, and it remains the fallback. Its weakness is that it fixes today's instance of the problem without fixing the class: the convention would stay invisible, unenforced by any check, and the next package to change packaging strategy reintroduces the same silent break. It also makes the runtime depend on a Node feature — type stripping of linked workspace sources — that is newer than the rest of the toolchain relies on.
2. **Revert `contracts` to a build with `dist` output.** Makes its `.js` specifiers correct again and gives it a real published boundary with `.d.ts` as the contract. Rejected: it reintroduces build ordering across the workspace, and the ordering fails in the direction CI actually runs. On a clean clone `dist/` is gitignored and absent, and `pnpm lint` — which calls `typecheck` inside each package — runs before `pnpm build`. It also brings the stale-`dist` failure mode, where source and emitted types disagree and the tests pass against the older one.
3. **Bundle each runnable package with esbuild before running it.** Rejected as heavier than the problem: it introduces a build artifact, a watch mode, and a source-map story for a server whose entire job is to be thin.
4. **Run through `tsx`, leaving the specifier styles as they are.** Chosen.

## Argument

`tsx` was chosen because it makes the runtime agree with every other tool in the repository, rather than making one package agree with the runtime. `tsc`, Vitest and Vite already resolve both specifier styles; adopting a runtime that does the same removes the category of failure where a check passes and the process does not, instead of removing one instance of it.

The honest weakness is that it does not repair the underlying inconsistency. `node src/main.ts` stays broken for any package importing `@fleet/contracts`, and someone will eventually type it. That is a documentation and scripting problem — `pnpm dev` and `pnpm start` exist precisely so the supported path is the obvious one — where position 1's weakness was a recurrence problem, and a recurrence problem is the worse of the two in a repository whose stated purpose is to stay correct as agents change it.

The price is a devDependency, its native binary, and an approved `postinstall` in a workspace that gates lifecycle scripts on purpose. Approving one build script is a smaller concession than it looks — `esbuild` is already in the tree beneath Vitest and Vite — but it is a concession, and the `allowBuilds` entry carries a comment naming this ADR so the next reader knows why it is there.

## Implications

- `pnpm-workspace.yaml` gains `esbuild: true` under `allowBuilds`. Any future audit of approved build scripts should find this ADR from that comment.
- `packages/server` gains `tsx` as a devDependency, and its `dev` and `start` scripts invoke it. This is what makes ADR 8's listener runnable.
- `packages/simulator` keeps `node --watch src/index.ts` for now and is correct only while it imports nothing from the workspace. The day it imports `@fleet/contracts`, its scripts must move to `tsx` in the same change, or it breaks in exactly the way this ADR describes. That coupling is commented in its `package.json`.
- `build` scripts across the library packages are `tsc --noEmit` and produce nothing. The root `pnpm build` therefore verifies rather than builds, and CI's ordering of `lint`, `typecheck`, `test`, `build` carries no dependency between steps.
- The README's one-command start must document `pnpm dev` as the entry point and must not show `node` against a `.ts` file.
- Because no package emits, there is no published artifact and no `.d.ts` boundary. A consumer typechecks its dependency's source, so an error inside `@fleet/contracts` surfaces during a consumer's `typecheck`. That is a real cost of source exports and is accepted: at four packages in one repository, one program is a simpler mental model than four compiled boundaries.

## Open questions

- **Should the workspace converge on one relative-specifier style anyway, independent of the runtime?**
  _Current lean:_ Yes, on `.ts`, as tidiness rather than as a fix — 112 imports already use it against 18 that do not. It is no longer load-bearing now that `tsx` resolves both, which is why it is a question rather than part of the decision.
  _Resolves on:_ Someone deciding the 18-line change is worth making.
- **Should `packages/simulator` move to `tsx` now rather than when it first imports a workspace package?**
  _Current lean:_ Now, on consistency grounds — two runtime strategies in one workspace is the same class of invisible split that produced this ADR. Deferred because it adds a dependency to a package that currently needs none.
  _Resolves on:_ The simulator importing `@fleet/contracts`, or a decision to standardise first.
- **Is there a check that would catch a specifier break without running the process?**
  _Current lean:_ A smoke test that actually starts the server and hits `/api/health` would catch this and much else besides. That is worth more than a lint rule about extensions.
  _Resolves on:_ The listener existing to smoke-test.

## Observed consequences

- 19 August 2026: verified before recording. Plain `node` importing `@fleet/contracts` from `packages/server` fails with `ERR_MODULE_NOT_FOUND` on `src/shared/primitives.js`; the same import under `tsx` resolves and returns `SCHEMA_VERSION`. `pnpm install` then required `allowBuilds: esbuild: true` before `tsx` would run at all — pnpm had already inserted the key with the placeholder value `set this to true or false`.

## Related

- `ADR 8 — the listener this ADR makes runnable; the specifier break would have surfaced on its first boot.`
- `ADR 4 — feature-sliced structure and the dependency rule; this ADR changes nothing about what a specifier means to tsc or ESLint.`
- `ADR 6 — the source of the no-dependency-without-an-ADR rule this document discharges for tsx and esbuild.`
- `Principle 14 (the repository is operable by agents and auditable by people) — an undocumented packaging convention that CI cannot check is the drift this ADR exists to stop.`
- `Principle 15 (enforcement is proportionate and tested) — the reason the third open question prefers a smoke test over a lint rule about file extensions.`
- `Artifact tsconfig.base.json — erasableSyntaxOnly and noEmit are what make source exports possible; changing either reopens this ADR.`
- `Artifact pnpm-workspace.yaml — carries the allowBuilds approval and a comment pointing here.`
- `Artifact packages/adapters/TODO.md § D1 — asked for this ADR before the conflict existed.`

## Notes

- 19 August 2026: position 1 lost narrowly and is a complete fallback. If `tsx` becomes an obstacle, converging on `.ts` specifiers and reverting to plain `node` is an 18-line change plus one tsconfig flag, and requires nothing else in this design to move.
