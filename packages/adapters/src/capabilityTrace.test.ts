/**
 * The trace behind every non-core field: what in the payload produced it, and
 * that nothing else did (adapters TODO C6, ADR 1 § Constraints).
 *
 * The per-vendor suites already pin each declared capability *set* and each
 * payload's exact value. Neither of those is the property this file asserts. A
 * capability set can be right while the payload is copied from the wrong field,
 * and an exact-output test agrees with whatever the adapter currently does — it
 * cannot distinguish a value that came from the dialect from one the adapter
 * invented, because both are just the recorded output.
 *
 * So the trace is established by mutation rather than by inspection. Change one
 * documented field in a recorded payload, decode it again, and diff the envelope
 * by region: exactly the region the table names must move. That fails in both
 * directions — a capability wired to the wrong source stops moving when its own
 * field changes, and one that leaks into the core moves two regions at once.
 *
 * The table sits here rather than beside each adapter because a cross-vendor
 * file is the only place the *inverse* is checkable: a canonical core field no
 * dialect feeds. `canonicalCoreSchema` calls that the failure mode it exists to
 * prevent, and `positionSchema` records `heading` as the field already removed
 * for it. There is one such field left, and `UNSOURCED_CORE_FIELDS` is where it
 * is named rather than repeated as three quiet constants in three adapters.
 *
 * This file may import all three vendors; the ban in `eslint.config.js` is on one
 * vendor directory reaching into another, which is a production coupling. Reading
 * all three from above is what a cross-vendor property requires.
 */
import { CAPABILITY_NAMES, type AdapterEnvelope } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import type { VendorAdapter } from "./core/adapter.ts";
import { createUnknownFieldLedger } from "./core/unknownFields.ts";
import type { SupportedVendor } from "./core/vendor.ts";
import { FIXTURE_RECORDING, loadVendorFixture } from "./testing/index.ts";
import { createVendorAAdapter } from "./vendors/a/adapter.ts";
import { VENDOR_A_KNOWN_PATHS } from "./vendors/a/schema.ts";
import { createVendorBAdapter } from "./vendors/b/adapter.ts";
import { VENDOR_B_KNOWN_PATHS } from "./vendors/b/schema.ts";
import { createVendorCAdapter } from "./vendors/c/adapter.ts";
import { VENDOR_C_KNOWN_PATHS } from "./vendors/c/schema.ts";

/** One instant after the pinned recording instant, matching the per-vendor suites. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

/**
 * Core fields no dialect reports, each with the reason it is still canonical.
 *
 * An entry here is a claim under review, not an exemption: `canonicalCoreSchema`
 * admits a field only if every adapter can populate it from its own dialect, so a
 * field nothing populates is either a modelling defect or a field waiting on a
 * vendor that reports it. Recorded in `TODO.md` § FIXME either way.
 *
 * The suite fails when a dialect starts feeding one of these, which is the point:
 * that is the moment the entry has to go, and nothing else would notice.
 */
const UNSOURCED_CORE_FIELDS: Readonly<Record<string, string>> = {
  connectivity:
    "No modelled dialect carries link state; all three adapters emit the constant `unknown`.",
};

/**
 * One documented payload field, the envelope region it feeds, and a different
 * valid value to prove it with.
 *
 * `to` is a region rather than a leaf path because a source field legitimately
 * feeds several leaves of one region — vendor A's `pose.x_m` moves `core.position`
 * without touching `position.frame` — and asserting at leaf granularity would say
 * nothing more while breaking on every unrelated shape change.
 */
interface TraceRow {
  readonly path: string;
  readonly to: string;
  readonly value: unknown;
}

/** A vendor's adapter, its schema's documented paths, and its source-to-region table. */
interface VendorTrace {
  readonly vendor: SupportedVendor;
  readonly adapter: VendorAdapter;
  readonly knownPaths: ReadonlySet<string>;
  readonly rows: readonly TraceRow[];
}

const TRACES: readonly VendorTrace[] = [
  {
    vendor: "A",
    adapter: createVendorAAdapter(createUnknownFieldLedger()),
    knownPaths: VENDOR_A_KNOWN_PATHS,
    rows: [
      { path: "seq", to: "capabilities.sequence", value: 7 },
      { path: "telemetry.dock.docked", to: "capabilities.dock", value: true },
      { path: "telemetry.dock.dock_id", to: "capabilities.dock", value: "SITE-NORTH-DOCK-01" },
      { path: "telemetry.lidar.fault", to: "capabilities.lidarHealth", value: true },
      { path: "telemetry.lidar.rpm", to: "capabilities.lidarHealth", value: 450 },
      { path: "telemetry.battery.level", to: "core.batteryPercent", value: 0.5 },
      { path: "telemetry.pose.x_m", to: "core.position", value: 1.25 },
      { path: "telemetry.pose.y_m", to: "core.position", value: -3.5 },
      { path: "telemetry.state", to: "core.status", value: "charging" },
      { path: "telemetry.health.level", to: "core.health", value: "degraded" },
    ],
  },
  {
    vendor: "B",
    adapter: createVendorBAdapter(createUnknownFieldLedger()),
    knownPaths: VENDOR_B_KNOWN_PATHS,
    rows: [
      { path: "dock_state", to: "capabilities.dock", value: 1 },
      { path: "batt_pct", to: "core.batteryPercent", value: 42 },
      { path: "x_cm", to: "core.position", value: 100 },
      { path: "y_cm", to: "core.position", value: -250 },
      { path: "status_code", to: "core.status", value: 2 },
      { path: "health_code", to: "core.health", value: 1 },
    ],
  },
  {
    vendor: "C",
    adapter: createVendorCAdapter(createUnknownFieldLedger()),
    knownPaths: VENDOR_C_KNOWN_PATHS,
    rows: [
      { path: "seq", to: "capabilities.sequence", value: 7 },
      { path: "telemetry.dock.docked", to: "capabilities.dock", value: true },
      { path: "telemetry.dock.dock_id", to: "capabilities.dock", value: "SITE-NORTH-DOCK-03" },
      { path: "telemetry.water.level_pct", to: "capabilities.waterLevel", value: 12 },
      { path: "telemetry.battery.level", to: "core.batteryPercent", value: 0.5 },
      { path: "telemetry.pose.x_m", to: "core.position", value: 1.25 },
      { path: "telemetry.pose.y_m", to: "core.position", value: -3.5 },
      { path: "telemetry.state", to: "core.status", value: "charging" },
      { path: "telemetry.health.level", to: "core.health", value: "degraded" },
    ],
  },
];

/**
 * Narrows fixture content to a spreadable record.
 *
 * A runtime check rather than a cast: this package bans type assertions, and a
 * recorded payload is exactly the boundary the ban exists for.
 */
function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected an object at ${what}.`);
  }
  return { ...value };
}

/** Returns a copy of `payload` with the dotted `path` replaced by `value`. */
function withValueAt(payload: unknown, path: string, value: unknown): Record<string, unknown> {
  const record = asRecord(payload, path);
  const dot = path.indexOf(".");
  if (dot === -1) {
    return { ...record, [path]: value };
  }
  const head = path.slice(0, dot);
  return { ...record, [head]: withValueAt(record[head], path.slice(dot + 1), value) };
}

/**
 * Serializes one region for comparison, giving an undeclared capability a value.
 *
 * The branch is not defensive: `JSON.stringify(undefined)` returns `undefined`,
 * which its own return type does not admit, so the case is taken before the call
 * rather than patched after it — `?? "undefined"` reads as dead code to the
 * type checker and is rejected by `no-unnecessary-condition`.
 */
function serialize(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Flattens an envelope into the regions a trace row can name.
 *
 * Values are serialized because the comparison only has to answer "did this
 * move", and every region here is JSON-safe and built from an object literal, so
 * key order is fixed by the adapter rather than by iteration. An undeclared
 * capability serializes to the string `undefined` and so compares equal to
 * itself, which is what keeps absence a stable region rather than a difference.
 */
function regionsOf(envelope: AdapterEnvelope): ReadonlyMap<string, string> {
  const regions = new Map<string, string>();
  for (const [field, value] of Object.entries(envelope.core)) {
    regions.set(`core.${field}`, serialize(value));
  }
  for (const name of CAPABILITY_NAMES) {
    regions.set(`capabilities.${name}`, serialize(envelope.capabilities[name]));
  }
  return regions;
}

/** Returns the region names whose serialized value differs between two envelopes. */
function movedRegions(before: AdapterEnvelope, after: AdapterEnvelope): readonly string[] {
  const baseline = regionsOf(before);
  return [...regionsOf(after)]
    .filter(([region, value]) => baseline.get(region) !== value)
    .map(([region]) => region);
}

describe.each(TRACES)(
  "vendor $vendor capability and core trace",
  ({ vendor, adapter, knownPaths, rows }) => {
    function decode(payload: unknown): AdapterEnvelope {
      const result = adapter(payload, RECEIVED_AT);
      if (!result.ok) {
        throw new Error(`Vendor ${vendor} rejected a payload the trace table built.`);
      }
      return result.value;
    }

    const baseline = decode(loadVendorFixture(vendor).payload);
    const declared = Object.keys(baseline.capabilities);

    it.each(rows)("$path feeds $to and no other region", ({ path, to, value }) => {
      const mutated = decode(withValueAt(loadVendorFixture(vendor).payload, path, value));

      expect(movedRegions(baseline, mutated)).toEqual([to]);
    });

    it("sources every field the table names from the dialect's own schema", () => {
      // A path the schema never declared is a capability declared from an absence,
      // which is the defect ADR 1 names — and it would also be counted as an unknown
      // field the moment a vendor actually sent it.
      expect(rows.map(({ path }) => path).filter((path) => !knownPaths.has(path))).toEqual([]);
    });

    it("traces every declared capability back to a source field", () => {
      const traced = new Set(
        rows
          .filter(({ to }) => to.startsWith("capabilities."))
          .map(({ to }) => to.slice("capabilities.".length)),
      );

      expect(declared.filter((name) => !traced.has(name))).toEqual([]);
      // The other direction: a row naming a capability this vendor does not declare
      // is a table that has outlived the adapter it describes.
      expect([...traced].filter((name) => !declared.includes(name))).toEqual([]);
    });

    it("populates every canonical core field from the dialect, or names it unsourced", () => {
      const traced = new Set(
        rows.filter(({ to }) => to.startsWith("core.")).map(({ to }) => to.slice("core.".length)),
      );
      const unpopulated = Object.keys(baseline.core).filter((field) => !traced.has(field));

      expect(unpopulated).toEqual(Object.keys(UNSOURCED_CORE_FIELDS));
    });
  },
);

describe("canonical core fields no dialect reports", () => {
  it("holds the same constant in every adapter, so the gap is one decision and not three", () => {
    // Read off the envelopes rather than the modules: three adapters agreeing by
    // coincidence and three agreeing by decision look identical in review, and only
    // the second survives one of them changing its mind.
    const connectivity = TRACES.map(({ vendor, adapter }) => {
      const result = adapter(loadVendorFixture(vendor).payload, RECEIVED_AT);
      return result.ok ? result.value.core.connectivity : "rejected";
    });

    expect(connectivity).toEqual(["unknown", "unknown", "unknown"]);
    expect(Object.keys(UNSOURCED_CORE_FIELDS)).toEqual(["connectivity"]);
  });
});

describe("sequence ownership (ADR 25)", () => {
  it("carries only the raw counter for A and C, omits it for B, and never derives health", () => {
    const envelopes = TRACES.map(({ vendor, adapter }) => {
      const result = adapter(loadVendorFixture(vendor).payload, RECEIVED_AT);
      if (!result.ok) {
        throw new Error(`Vendor ${vendor} rejected its representative fixture.`);
      }
      return [vendor, result.value] as const;
    });

    const byVendor = Object.fromEntries(envelopes);

    expect(byVendor.A?.capabilities.sequence).toEqual({ value: 0 });
    expect(byVendor.B?.capabilities).not.toHaveProperty("sequence");
    expect(byVendor.C?.capabilities.sequence).toEqual({ value: 0 });

    for (const envelope of Object.values(byVendor)) {
      // Per-robot continuity needs prior state and therefore belongs to the
      // server's diagnostic envelope. An adapter sees one reading and may expose
      // only the source counter capability; synthesizing a gap here would merge
      // two authorities and make the first reading look discontinuous (ADR 25).
      expect(envelope).not.toHaveProperty("sequenceHealth");
      if (envelope.capabilities.sequence !== undefined) {
        expect(Object.keys(envelope.capabilities.sequence)).toEqual(["value"]);
      }
    }
  });
});
