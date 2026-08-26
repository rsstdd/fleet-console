import type { UnknownFieldTally } from "@fleet/contracts";
import { SUPPORTED_VENDORS, type SupportedVendor } from "./result.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stops at an unknown key so each foreign subtree is counted once. */
export function findUnknownFieldPaths(
  value: unknown,
  known: ReadonlySet<string>,
): readonly string[] {
  const found = new Set<string>();
  const walk = (node: unknown, prefix: string): void => {
    if (!isRecord(node)) {
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (!known.has(path)) {
        found.add(path);
      } else if (Array.isArray(child)) {
        for (const entry of child) {
          walk(entry, `${path}[]`);
        }
      } else {
        walk(child, path);
      }
    }
  };
  walk(value, "");
  return [...found];
}

export interface UnknownFieldLedger {
  note(vendor: SupportedVendor, paths: readonly string[]): void;
  byAdapter(): Readonly<Record<SupportedVendor, UnknownFieldTally>>;
}

/** Rejected payloads never contribute to unknown-field counts. */
export function createUnknownFieldLedger(): UnknownFieldLedger {
  const counts = new Map<SupportedVendor, Map<string, number>>(
    SUPPORTED_VENDORS.map((vendor) => [vendor, new Map()]),
  );

  const tally = (vendor: SupportedVendor): UnknownFieldTally => {
    const fields = counts.get(vendor) ?? new Map<string, number>();
    let total = 0;
    for (const count of fields.values()) {
      total += count;
    }
    return { total, fields: Object.fromEntries(fields) };
  };

  return {
    note(vendor, paths) {
      const fields = counts.get(vendor);
      if (fields === undefined) {
        return;
      }
      for (const path of paths) {
        fields.set(path, (fields.get(path) ?? 0) + 1);
      }
    },
    byAdapter() {
      return { A: tally("A"), B: tally("B"), C: tally("C") };
    },
  };
}
