/**
 * Violates ADR 11's Node-free rule for the public fixture subpath, two ways.
 *
 * `packages/web` targets a browser and imports this directory. The rule was
 * documented in `../fixtures.ts` and `../README.md` and enforced by nothing until
 * `eslint.config.js` grew the block this fixture probes.
 */
import { existsSync } from "node:fs";

import { readFileSync } from "fs";

/** Reaches for the filesystem, which a browser consumer cannot resolve. */
export function here(): boolean {
  return existsSync(import.meta.dirname) && readFileSync(import.meta.filename).length > 0;
}
