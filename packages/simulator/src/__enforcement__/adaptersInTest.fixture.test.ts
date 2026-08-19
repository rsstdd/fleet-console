/**
 * The permitted direction of ADR 16: the same import under a test filename.
 *
 * Must produce no `no-restricted-imports` error. Without this control, a ban that
 * covered test files too would still pass `adaptersInProduction.ts`'s assertion
 * while breaking the one file the dev dependency exists for.
 *
 * Named `*.fixture.test.ts` so vitest does not collect it — it is an input to a
 * test, not a test (matching `packages/web`'s convention under ADR 12).
 */
import { SUPPORTED_VENDORS } from "@fleet/adapters";

export const permitted = SUPPORTED_VENDORS;
