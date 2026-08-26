# Fleet Store State Modeling

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-25

## Outcome

`packages/web/src/stores/fleetStore.ts` represents fleet state as one discriminated
union in which every unreachable combination is unconstructable, orders rows
deterministically by robot id, and refuses the two transitions that can currently
disagree with the resource state — with the exported `FleetStore` and
`FleetResourceState` surfaces unchanged, so no consumer moves.

## Findings

### S1 — Two variables model one state machine

The store holds a `Phase` union carrying no data alongside a separate
`held: { sites, capturedAt, latestFrameAt } | null`. Nothing ties them together, so
`{ phase: "ready", held: null }` is representable, and `buildState` needs a runtime
fallback to absorb it (`fleetStore.ts:195`: `if (data === null) return { kind: "loading" }`).
That fallback is the state machine defending itself against its own representation.
Collapsing the two into one union whose data-bearing members carry `fleet` inline deletes
the fallback rather than relocating it.

### S2 — Row order is arbitrary, and the doc comment says otherwise

`FleetData.robots` is documented as "The current fleet, in stable id order"
(`fleetStore.ts:46`), but nothing sorts: not the store
(`cachedRobots ??= [...robots.values()]`, `:179`), not the server snapshot, and not the
table — the only `.sort()` in `packages/web/src` is over vendor names
(`fleetPage.tsx:70`). Row order is ingest-arrival order and can reshuffle across a
reconnect. Page spec 02 requires no particular order, so this is a defect against the
store's own stated contract rather than against the spec.

### S3 — `getRobot` can answer for a robot `getState` does not list

`applyBatch` writes frames into the robot map before any snapshot has landed
(`fleetStore.ts:227-236`). `held` stays null, so the resource still reads `loading` while
`getRobot` returns a row that no data-bearing state carries. The real transport always
sends the snapshot first (`useFleetTransport.ts:106-111`), so the path exists only for
callers that drive the store directly.

### S4 — `snapshotStart` notifies even when nothing changes

`snapshotStart` assigns a phase and notifies unconditionally (`fleetStore.ts:205-210`).
The transport calls it on every `connecting`/`reconnecting` transition
(`useFleetTransport.ts:112-117`), so an ADR 31 backoff storm invalidates the state cache
and wakes every subscriber once per attempt while the rendered state is identical.

## Scope

### In scope

- S1 structural collapse, behaviour-preserving, evidenced by the store suite passing unedited.
- S3 and S4 transition guards, with tests, including the three existing tests that assert
  the behaviour being fixed.
- S2 deterministic id ordering, sorted only when fleet membership changes.
- An ADR 39 comment pass over the file once its structure has settled.

### Out of scope

- The exported `FleetData`, `FleetResourceState`, `FleetRecoverableFailure`,
  `FleetStore`, and `NotifyScheduler` shapes, and therefore every consumer.
- Migrating `fleetPage.tsx:62` and `mapPage.tsx:57` from a `"data" in resource`
  structural test to an exhaustive switch. Correct, but feature-layer work.
- Entity mapping (`utils/fromEnvelope.ts`), transport policy, freshness handling, and the
  resource-state vocabulary itself.

## Authorities and dependencies

- `PRINCIPLES.md` 1, 4, 5, 11, 12; `packages/web/AGENTS.md` (layer graph, data layers).
- ADR 18 (robot-level delta granularity), ADR 20 (failure vocabulary), ADR 24 (fleet-table
  scale), ADR 27 (reviewable-diff budget), ADR 28 and ADR 39 (comment policy),
  ADR 31 (reconnect and retry), ADR 34 (site directory and provenance), ADR 36 (`stores/`).
- Slices are sequential: S1 lands the structure the later slices edit.
- A full-file rewrite is roughly 550 counted lines against a 300-line budget
  (`scripts/checkDiffSize.mjs`), so the slices below are also the PR boundaries.

## Execution

1. **S1 — collapse the representation.** Replace `Phase` + `held` with one
   `FleetStoreState` union carrying `LastKnownFleet` on its data-bearing members; lift the
   returned closures into named function declarations; delete the `data === null`
   fallback. `fleetStore.test.ts` is not edited.
2. **S3 + S4 — guard the transitions.** `applyBatch` returns early when no fleet is held;
   `snapshotStart` returns without notifying when the phase would not change. Seed a
   snapshot in `fleetStore.test.ts`'s once-per-frame case and in the two
   `robotDetailPage.test.tsx` cases that call `applyBatch` with no snapshot; add cases for
   the ignored pre-snapshot frame and both no-op starts.
3. **S2 — order rows by id.** Keep `robotsById` in id order so `getRobotList` stays a
   plain `[...values()]`; re-insert in order only when membership changes — on a snapshot,
   and on a frame naming an id the map does not hold. Correct the `FleetData.robots` doc
   comment to the order the code now delivers.
4. **Comment pass.** Remove what restates a signature or repeats ADR-owned rationale;
   keep the notify-coalescing rule, the `useSyncExternalStore` identity requirement, the
   keyed-replace invariant, the no-derivation rule, and the row-order invariant.

## Acceptance criteria

- [x] `ready` and `refreshing` carry fleet data by construction; no runtime path degrades
      a data-bearing kind to `loading` (S1). `FleetStoreState`'s data-bearing members carry
      `LastKnownFleet` non-nullably, and `buildResourceState` has no fallback branch.
- [x] `fleetStore.test.ts` passes unedited across step 1 — the behaviour-preservation
      evidence for the collapse. 18/18 green before any test was touched.
- [x] A frame arriving before the first snapshot changes nothing a caller can observe,
      through either `getState` or `getRobot` (S3).
- [x] Repeated `snapshotStart` calls in one phase wake subscribers once (S4).
- [x] `FleetData.robots` is in id order after a snapshot and after a frame that introduces
      a new robot; a frame that only replaces rows does not reorder or re-sort (S2).
- [x] `pnpm --filter web test` 427/427, `lint`, and `build` green; `check:doc-comments`,
      `check:dependencies`, and `check:architecture-docs` green.
- [x] Browser evidence for S2, which changes rendered row order: `smoke-chromium` 13/13 and
      `smoke-firefox` 13/13.
- [x] The comment pass leaves only what the code cannot carry, audited against the `comments`
      skill's five justifications. Duplicated prose went first: the `data` absence note was
      identical on both error members and now sits once on the union, and
      `FleetRecoverableFailure.cause` repeated its parent. Two caller-visible guarantees were
      _restored_ rather than cut, because a signature cannot carry them — `applyBatch` is
      ignored before a snapshot, and `getState` returns the same reference until something
      changes, which is the guarantee `useSyncExternalStore` depends on. A third was found
      over-cut on review and restored: the pass deleted `FleetData.robots`'s order comment
      instead of correcting it per step 3, leaving the id-order guarantee stated only on a
      private helper and in test names while `readonly Robot[]` cannot carry it.
- [x] The ADR 24 scale measurement does not regress. Measured on this development host
      against an otherwise identical tree with the store reverted, because the run recorded
      in `REFACTOR_WEB_REACT_QUALITY.md` (9.76 Hz, delta-to-paint p95 50.9 ms) was taken on
      different hardware and is not comparable to a number from this one:

| Store  | Frames  | Rate    | delta-to-paint p50 | p95      |
| ------ | ------- | ------- | ------------------ | -------- |
| Before | 120/120 | 9.65 Hz | 137.5 ms           | 179.5 ms |
| After  | 120/120 | 9.67 Hz | 129.6 ms           | 165.9 ms |

- [ ] Unverified, recorded honestly: the `smoke-webkit` project cannot launch on this WSL
      host (missing system libraries), so browser evidence covers chromium and firefox only.
      The scale project is flaky on this host independently of this change — one run under
      each store failed the frames-received poll before passing on repeat, so the numbers
      above are single successful runs rather than a distribution.

## Documentation synchronization

- This plan (status and date on every scope or evidence change).
- `TODO.md`: the "Complete fleet resource-state modeling" non-blocker names this plan.
- No specification change: no public API, route behaviour, or component contract moves.

## Verification

- `pnpm --filter web test`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm check:diff-size` before each commit
- `pnpm test:e2e` and `pnpm test:e2e:scale` after the ordering slice
- `pnpm check:doc-comments` and `pnpm check:architecture-docs` after this plan and the
  TODO.md edit

## Completion

Archive under `docs/04_archive/` once the four slices have merged, naming the PRs that
carry them as the replacement evidence.
