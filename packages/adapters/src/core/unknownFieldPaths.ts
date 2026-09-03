/**
 * Detection half of unknown-field accounting: which dotted paths in a payload
 * the vendor's schema never declared (ADR 15).
 *
 * The mechanism is a key-difference walk against paths derived from the schema
 * itself, rather than reading a strict schema's rejection. Strict mode
 * *rejects* the payload, and ADR 1 wants unknown fields counted on a payload
 * that is otherwise accepted — the two cannot be the same operation.
 *
 * Deriving the known set from the schema, rather than hand-listing it beside
 * each vendor module, is what keeps the two from drifting: there is one
 * declaration of what a dialect contains, and this reads it.
 *
 * Cost note: `knownFieldPaths` walks a schema and is meant to run once per
 * module at import, not once per payload. At ADR 2's peak of roughly 2,500
 * readings a second, calling it per message would put a schema traversal in the
 * ingest path for no benefit.
 */
import type { z } from "zod";

/**
 * Narrows unknown input to a walkable object.
 *
 * A type predicate rather than an assertion, deliberately: this package bans
 * `as` at a boundary, and Zod's internals are as untrusted here as a vendor
 * payload is anywhere else. Every narrowing below is a real runtime check.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a Zod schema's internal definition, or undefined for anything else.
 *
 * Reaching into `_zod.def` is reading a private surface, and it is the price of
 * deriving known paths from the schema rather than hand-listing them beside it.
 * If a Zod upgrade moves this, `knownFieldPaths` returns fewer paths and the
 * tests in this directory fail loudly — rather than the ledger quietly counting
 * declared fields as unknown.
 */
function definitionOf(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const internals = schema._zod;
  if (!isRecord(internals)) return undefined;
  const definition = internals.def;
  return isRecord(definition) ? definition : undefined;
}

/** Returns an object schema's field shape, or undefined if it has none. */
function shapeOf(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const shape = schema.shape;
  return isRecord(shape) ? shape : undefined;
}

/**
 * Looks through `optional`, `nullable`, `default` and similar wrappers.
 *
 * A wrapper is not a shape. Stopping at one would make every optional block in
 * a dialect read as an unknown field the moment a payload populated it. The
 * depth bound is a cycle guard, not a limit anyone should reach.
 */
function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < 10; depth += 1) {
    const inner = definitionOf(current)?.innerType;
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

function collect(schema: unknown, prefix: string, into: Set<string>): void {
  const unwrapped = unwrap(schema);
  const shape = shapeOf(unwrapped);

  if (shape !== undefined) {
    for (const [key, child] of Object.entries(shape)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      into.add(path);
      collect(child, path, into);
    }
    return;
  }

  const element = definitionOf(unwrapped)?.element;
  if (element !== undefined) {
    // Array element paths carry `[]` rather than an index. The ledger counts
    // dialect facts; indexed paths would make a 500-element array produce 500
    // distinct entries and drown the signal the counter exists for.
    collect(element, `${prefix}[]`, into);
  }
}

/**
 * Returns every dotted field path a schema declares, array elements marked `[]`.
 *
 * Call once per vendor module and keep the result; see the cost note above.
 */
export function knownFieldPaths(schema: z.ZodType): ReadonlySet<string> {
  const paths = new Set<string>();
  collect(schema, "", paths);
  return paths;
}

function walk(
  value: unknown,
  prefix: string,
  known: ReadonlySet<string>,
  found: Set<string>,
): void {
  if (!isRecord(value)) return;

  // `Object.keys` rather than `for…in`: an inherited key is not a field the
  // vendor sent, and counting one would be a fact about JavaScript.
  for (const key of Object.keys(value)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;

    if (!known.has(path)) {
      // Reported at its shallowest path, and not descended into. One new block
      // is one dialect change; counting its children as well would make a
      // single vendor addition look like a rewrite.
      found.add(path);
      continue;
    }

    const child = value[key];
    if (Array.isArray(child)) {
      for (const entry of child) walk(entry, `${path}[]`, known, found);
    } else {
      walk(child, path, known, found);
    }
  }
}

/**
 * Returns the dotted paths in `value` that `known` does not declare, each once.
 *
 * Deliberately walks the **raw** payload rather than a parsed result: parsing
 * can apply defaults and transforms, and the question this answers is what the
 * vendor actually sent.
 *
 * One path per payload however many times it occurs — three array elements
 * carrying the same new key is one dialect fact, and counting it three times
 * would make the ledger's total a function of payload size.
 *
 * Input that is not an object yields nothing. A payload too malformed to walk
 * never reaches here: the schema rejected it, and a rejected payload does not
 * touch the ledger (ADR 15).
 */
export function findUnknownFieldPaths(
  value: unknown,
  known: ReadonlySet<string>,
): readonly string[] {
  const found = new Set<string>();
  walk(value, "", known, found);
  return [...found];
}
