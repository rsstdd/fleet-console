/**
 * Violates ADR 16's test-only rule: a production module importing `@fleet/adapters`.
 *
 * The simulator restates the vendor identifiers instead. Importing them here would
 * make the two lists one list, which sounds like an improvement and is not: this
 * package must stay able to emit a payload the adapters reject, and a shared
 * literal quietly removes the possibility of that ever happening.
 */
import { SUPPORTED_VENDORS } from "@fleet/adapters";

export const borrowed = SUPPORTED_VENDORS;
