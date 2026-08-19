// @ts-nocheck -- the import is meant not to resolve; see ./README.md.
/**
 * Violates the package boundary: the simulator reaching into the server.
 *
 * The HTTP ingest endpoint is the boundary (AGENTS.md § Dependency and ownership
 * boundaries). This fixture is the control proving that widening the import rules
 * for `@fleet/adapters` did not widen them for everything.
 */
import { anything } from "@fleet/server";

export const borrowed = anything;
