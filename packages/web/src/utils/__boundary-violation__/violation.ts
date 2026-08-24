// Deliberate violation of the external-dependency policy, required by ADR 4.
// The data layers (hooks, stores, utils, types) render nothing and route nothing, so react-dom is banned
// there. Exercised by ../../../features/fleet/__boundary-violation__/violation.test.ts,
// which asserts this file produces a boundaries/dependencies error.
//
// Excluded from the normal lint run via the `ignores` entry in eslint.config.js.
// Do not repair or delete: the test proves the rule is live, and a rule nobody
// tests is the state this repository was in until 19 August 2026 (TODO B11).
import { createRoot } from "react-dom/client";

export const root = createRoot;
