// @ts-nocheck -- the import is meant not to resolve; see README.md in this directory.
/**
 * Violates the workspace allow-list: this package may import `@fleet/contracts`
 * and nothing else from the workspace.
 */
import { anything } from "@fleet/server";

export const borrowed = anything;
