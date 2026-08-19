// @ts-nocheck -- the import is meant not to resolve; see ../../../__enforcement__/README.md.
/**
 * Violates the cross-vendor ban (ADR 1): one vendor adapter never imports another.
 * Shared behaviour belongs in `src/core`, where the sharing is visible.
 */
import { decode } from "../b/adapter.ts";

export const borrowed = decode;
