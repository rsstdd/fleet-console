/**
 * Per-adapter accounting for input fields no schema recognized.
 *
 * ADR 1 requires unknown fields to be counted rather than silently dropped, and
 * the count to be per adapter rather than per robot: Vendor C's undocumented
 * field is a fact about the dialect, not about one machine. Coupling:
 * `packages/server` owns one ledger for the process and exposes `snapshot()` on
 * its health endpoint; the robot-detail diagnostics panel must label the number
 * as per-adapter (ADR 1 § Implications).
 *
 * Only accepted payloads are noted here. A payload the schema rejected belongs to
 * the server's malformed-ingest counter instead, because the two numbers answer
 * different questions — "is this vendor sending something new?" against "is this
 * vendor broken?" — and one malformed payload on a retry loop would otherwise
 * inflate this count until dialect drift and a stuck client looked identical
 * (ADR 15, ratifying a position taken 19 August 2026).
 *
 * That scope is carried in the data as `scope: "accepted"` rather than left to a
 * consumer's caption. If the rejected-payload tally ADR 15 leaves open is ever
 * added, it arrives as a second scope beside this one — an addition, not a
 * rename across the server's health endpoint and the console's diagnostics.
 */

import { findUnknownFieldPaths } from "./unknownFieldPaths.ts";
import { SUPPORTED_VENDORS, type SupportedVendor } from "./vendor.ts";

/** What one adapter has seen and not recognized, by dotted field path. */
export interface UnknownFieldTally {
  /** Total unrecognized field occurrences observed by this adapter. */
  readonly total: number;
  /** Occurrence count per dotted field path, in first-seen order. */
  readonly fields: Readonly<Record<string, number>>;
}

/** The population a tally covers. Only accepted payloads are counted today (ADR 15). */
export type UnknownFieldScope = "accepted";

/** The unknown-field counts for every vendor dialect, with the population they cover. */
export interface UnknownFieldSnapshot {
  /**
   * The population these counts cover, carried as data so the health endpoint
   * and the console label the number from the value rather than from a comment
   * that can go stale (ADR 15).
   */
  readonly scope: UnknownFieldScope;
  /** Counts keyed by adapter. Per adapter, never per robot (ADR 1). */
  readonly byAdapter: Readonly<Record<SupportedVendor, UnknownFieldTally>>;
}

/** Mutable per-adapter unknown-field accounting shared across a process. */
export interface UnknownFieldLedger {
  /**
   * Records unrecognized dotted field paths from a payload the schema accepted.
   *
   * Named for its precondition: a rejected payload must not reach it. Prefer
   * `noteAcceptedPayload`, which takes that precondition as an argument rather
   * than trusting each caller to check it first.
   */
  noteAccepted(vendor: SupportedVendor, paths: readonly string[]): void;
  /** Returns an immutable copy of every adapter's counts. */
  snapshot(): UnknownFieldSnapshot;
}

/** Creates an empty unknown-field ledger with a zeroed tally for every vendor. */
export function createUnknownFieldLedger(): UnknownFieldLedger {
  const counts = new Map<SupportedVendor, Map<string, number>>(
    SUPPORTED_VENDORS.map((vendor) => [vendor, new Map<string, number>()]),
  );

  const tally = (vendor: SupportedVendor): UnknownFieldTally => {
    const fields = counts.get(vendor) ?? new Map<string, number>();
    let total = 0;
    for (const count of fields.values()) total += count;
    return { total, fields: Object.fromEntries(fields) };
  };

  return {
    noteAccepted(vendor, paths) {
      const fields = counts.get(vendor);
      if (fields === undefined) return;
      for (const path of paths) {
        fields.set(path, (fields.get(path) ?? 0) + 1);
      }
    },

    snapshot() {
      // Written out per vendor rather than reduced into a record so that adding a
      // vendor to `SupportedVendor` fails the typecheck here instead of silently
      // producing a snapshot with a missing adapter.
      return { scope: "accepted", byAdapter: { A: tally("A"), B: tally("B"), C: tally("C") } };
    },
  };
}

/** Everything `noteAcceptedPayload` needs to decide whether and what to count. */
export interface AcceptedPayloadNote {
  readonly ledger: UnknownFieldLedger;
  readonly vendor: SupportedVendor;
  /**
   * Whether the vendor schema accepted this payload.
   *
   * An argument rather than a convention: ADR 15 counts unknown fields only on
   * accepted payloads, and three vendor adapters each remembering to check
   * first is three chances to get the ordering wrong.
   */
  readonly accepted: boolean;
  /** The raw payload, walked as received — before parsing applied any default. */
  readonly payload: unknown;
  /** The dialect's declared paths, from `knownFieldPaths`, computed once per module. */
  readonly knownPaths: ReadonlySet<string>;
}

/**
 * Notes a payload's unknown fields when the schema accepted it, and nothing otherwise.
 *
 * Returns the paths noted, so an adapter can attach them to its own result
 * without walking the payload twice.
 *
 * Coupling: `packages/server` owns one ledger per process and serves
 * `snapshot()` from `GET /api/health`; a rejected payload increments that
 * endpoint's malformed-ingest counter instead, and the two must not be summed
 * (ADR 15).
 */
export function noteAcceptedPayload(note: AcceptedPayloadNote): readonly string[] {
  if (!note.accepted) return [];
  const paths = findUnknownFieldPaths(note.payload, note.knownPaths);
  if (paths.length > 0) note.ledger.noteAccepted(note.vendor, paths);
  return paths;
}
