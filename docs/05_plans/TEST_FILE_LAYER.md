# Preserve Production-Layer Classification for Tests

**Authority:** Planning only. The current classification remains unchanged.
**Status:** Active
**Updated:** 2026-08-20

## Summary

Make no lint, source-layout, or decision-register change. The current robotDetailFixtures.ts is shared by two sibling robot-feature suites and is not
materially duplicated, so it remains beside those tests in the feature layer.

## Documentation Change

- Replace the unresolved classification note in the robot-feature TODO with the settled policy:
  - test files inherit their production layer;
  - tests must obey the same feature/entity/shared dependency direction as production;
  - src/test does not become a universal permissive layer;
  - the current robot-detail fixture remains in features/robot;
  - multiple imports of one same-feature helper are reuse, not duplication.

- Record the future trigger as fixture construction or data being copied across multiple production layers or feature directories.
- Review root and web TODOs/READMEs for contradictory test-layer claims and update only
  affected statements; no normative decision or package specification changes.
- Leave the historical audit, docs/decisions.json, existing ADRs, package exports, and enforcement fixtures unchanged.

## Future Triggered Work

If material cross-layer duplication appears:

- Register the mechanical-rule change at that time.
- Add a narrowly named testing-fixture location for the affected domain, not a universal test layer.
- Permit only explicitly named test consumers through filename-scoped lint rules.
- Add enforcement fixtures proving unauthorized tests and all production files remain unable to import it.
- Keep ordinary tests classified in their production layers.

## Verification

- Confirm robotDetailPage.test.tsx and tenantPanelFlag.test.tsx remain the only consumers of robotDetailFixtures.ts.
- Run documentation formatting, pnpm check:architecture-docs, and git diff --check.
- No browser, build, or runtime testing is required because behavior and enforcement remain unchanged.

## Assumptions

- No fixture file is moved, renamed, exported, or duplicated.
- No ADR or D-id is created solely for source-tree tidiness.
- Existing boundary-violation fixtures remain untouched.
- No commit is created.
