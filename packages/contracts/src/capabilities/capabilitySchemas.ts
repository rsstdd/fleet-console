import { z } from "zod";

import {
  healthSeveritySchema,
  identifierSchema,
  type ParseResult,
  parseWith,
} from "../shared/primitives.js";

/**
 * Declared capabilities: the mechanism ADR 1 uses to represent genuine vendor
 * differences without putting them on the canonical core.
 *
 * Two shapes exist for the same information. The runtime shape is a partial
 * record keyed by capability name, where key presence *is* the declaration. The
 * wire shape is an array of `{ name, payload }` entries, because a record whose
 * keys are optional survives JSON serialization only as an object with absent
 * keys, and an array of discriminated entries lets one Zod schema prove each
 * name carries its own payload type (ADR 1, Amendment).
 *
 * Coupling: `packages/web/src/entities/robot/model.ts` mirrors these payload
 * types for its read model, and `packages/adapters` produces them per vendor.
 * A payload change here is a change in both.
 */

/** Dock state: whether the robot is docked, and which dock when the vendor names one. */
export const dockCapabilitySchema = z.strictObject({
  docked: z.boolean(),
  /** Null when the vendor reports docking without identifying the dock. */
  dockId: identifierSchema.nullable(),
});

/** Lidar unit health: its own severity, plus spin rate when the vendor reports it; declared by Vendor A and not by B or C. */
export const lidarHealthCapabilitySchema = z.strictObject({
  severity: healthSeveritySchema,
  /** Revolutions per minute; null when the vendor reports health without a rate. */
  rpm: z.number().min(0).max(10_000).nullable(),
});

/** Water tank level as an inclusive 0-100 percentage; declared by Vendor C and not by A or B. */
export const waterLevelCapabilitySchema = z.strictObject({
  percent: z.number().min(0).max(100).nullable(),
});

/**
 * Vendor sequence number for the reading.
 *
 * A capability rather than a core field because Vendor B sends none (ADR 1), and
 * the one capability classified `diagnostic` in `CAPABILITY_KINDS` rather than
 * `operator` — it describes the integration, not the machine. Robot detail
 * therefore renders it under Diagnostics and not as a capability panel, and that
 * now follows from the classification rather than from a rule the console has to
 * remember (page spec 03 §6, ADR 19).
 */
export const sequenceCapabilitySchema = z.strictObject({
  value: z.number().int().min(0),
});

/** Dock state for a robot whose adapter declared the `dock` capability. */
export type DockCapability = z.infer<typeof dockCapabilitySchema>;

/** Lidar health for a robot whose adapter declared the `lidarHealth` capability. */
export type LidarHealthCapability = z.infer<typeof lidarHealthCapabilitySchema>;

/** Water level for a robot whose adapter declared the `waterLevel` capability. */
export type WaterLevelCapability = z.infer<typeof waterLevelCapabilitySchema>;

/** Sequence metadata for a robot whose adapter declared the `sequence` capability. */
export type SequenceCapability = z.infer<typeof sequenceCapabilitySchema>;

/**
 * The authoritative name-to-payload mapping. Every other capability type in this
 * package is derived from it, so a name can never be paired with the wrong
 * payload type and no second list of names exists to disagree with this one.
 */
export interface CapabilityPayloadByName {
  dock: DockCapability;
  lidarHealth: LidarHealthCapability;
  waterLevel: WaterLevelCapability;
  sequence: SequenceCapability;
}

/** A declared capability name, derived from the payload mapping rather than restated. */
export type CapabilityName = keyof CapabilityPayloadByName;

/**
 * Canonical capability order, used for deterministic wire output so fixtures,
 * logs and diffs do not churn on object key order.
 *
 * `satisfies` keeps every member a real name; the `CapabilityTypeAssertions` in
 * the test file prove the array is also complete, which `satisfies` alone cannot.
 */
export const CAPABILITY_NAMES = [
  "dock",
  "lidarHealth",
  "waterLevel",
  "sequence",
] as const satisfies readonly CapabilityName[];

/**
 * What kind of fact a capability carries.
 *
 * `operator` capabilities describe machine behaviour someone acts on. `diagnostic`
 * capabilities are transport or adapter metadata that happens to vary by vendor —
 * true of the machine's integration, not of the machine.
 *
 * The distinction is a property of the capability itself rather than of any one
 * console's layout, which is why it lives beside the payload mapping instead of in
 * `packages/web` (ADR 19). What each kind *looks like* is still entirely the
 * console's business, and which panels a deployment offers is still the tenant's
 * (ADR 17); this says only what sort of thing each capability is.
 */
export type CapabilityKind = "operator" | "diagnostic";

/**
 * The authoritative kind of every capability, and the second half of the single
 * declaration this package derives capability vocabulary from.
 *
 * `satisfies Record<CapabilityName, CapabilityKind>` is what makes the split
 * mechanical rather than conventional. The record is total, so a capability added
 * to `CapabilityPayloadByName` but not classified here fails to compile, and a name
 * here that is not a capability fails too. There is no way to add a capability and
 * have it land on neither side, which is the failure this mapping exists to prevent
 * (ADR 19).
 */
export const CAPABILITY_KINDS = {
  dock: "operator",
  lidarHealth: "operator",
  waterLevel: "operator",
  sequence: "diagnostic",
} as const satisfies Record<CapabilityName, CapabilityKind>;

/** The literal classification above, as the type both name subsets are derived from. */
type CapabilityKindByName = typeof CAPABILITY_KINDS;

/**
 * Capability names describing operator-facing machine behaviour.
 *
 * Derived from `CAPABILITY_KINDS`, never restated. Coupling:
 * `packages/web/src/features/robot/capabilityPanels.tsx` keys its panel registry
 * off this set, so classifying a new capability `operator` makes the console fail
 * to compile until it has a panel (ADR 19).
 */
export type OperatorCapabilityName = {
  [K in CapabilityName]: CapabilityKindByName[K] extends "operator" ? K : never;
}[CapabilityName];

/**
 * Capability names carrying transport or adapter metadata rather than machine
 * behaviour. `sequence` is the only member today (ADR 1: Vendor B sends none).
 *
 * Derived rather than written out for the same reason as `OperatorCapabilityName`:
 * two hand-maintained subsets are two more places to forget a capability, and the
 * point of ADR 19 is that forgetting must not be possible.
 */
export type DiagnosticCapabilityName = {
  [K in CapabilityName]: CapabilityKindByName[K] extends "diagnostic" ? K : never;
}[CapabilityName];

/** Narrows a capability name to the operator-facing set by reading `CAPABILITY_KINDS`. */
export function isOperatorCapability(name: CapabilityName): name is OperatorCapabilityName {
  return CAPABILITY_KINDS[name] === "operator";
}

/** Narrows a capability name to the diagnostic set by reading `CAPABILITY_KINDS`. */
export function isDiagnosticCapability(name: CapabilityName): name is DiagnosticCapabilityName {
  return CAPABILITY_KINDS[name] === "diagnostic";
}

/**
 * The operator-facing names in canonical order.
 *
 * Filtered from `CAPABILITY_NAMES` rather than listed again, so order comes from
 * one place and membership from another, and neither is restated. A consumer that
 * renders capability panels iterates this instead of filtering the full set itself.
 */
export const OPERATOR_CAPABILITY_NAMES: readonly OperatorCapabilityName[] =
  CAPABILITY_NAMES.filter(isOperatorCapability);

/** The diagnostic names in canonical order, filtered from `CAPABILITY_NAMES`. */
export const DIAGNOSTIC_CAPABILITY_NAMES: readonly DiagnosticCapabilityName[] =
  CAPABILITY_NAMES.filter(isDiagnosticCapability);

/**
 * A robot's declared capabilities at runtime. Partial by construction: an
 * undeclared capability has no key, so `"waterLevel" in capabilities` is the
 * whole question a consumer needs to ask (ADR 1).
 */
export type Capabilities = { readonly [K in CapabilityName]?: CapabilityPayloadByName[K] };

/**
 * One capability as it travels on the wire. A discriminated union on `name`, so
 * the schema itself rejects `{ name: "dock", payload: <waterLevel payload> }`.
 */
export const capabilityWireEntrySchema = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("dock"), payload: dockCapabilitySchema }),
  z.strictObject({ name: z.literal("lidarHealth"), payload: lidarHealthCapabilitySchema }),
  z.strictObject({ name: z.literal("waterLevel"), payload: waterLevelCapabilitySchema }),
  z.strictObject({ name: z.literal("sequence"), payload: sequenceCapabilitySchema }),
]);

/** One `{ name, payload }` pair as serialized on the wire. */
export type CapabilityWireEntry = z.infer<typeof capabilityWireEntrySchema>;

/**
 * Collapses decoded wire entries into the runtime record.
 *
 * The switch is deliberate rather than an `Object.fromEntries` call: it is the
 * one place where each name is bound to its own payload type with no cast, which
 * is what makes the mapped record trustworthy downstream.
 */
function toCapabilities(entries: readonly CapabilityWireEntry[]): Capabilities {
  const capabilities: { -readonly [K in CapabilityName]?: CapabilityPayloadByName[K] } = {};

  for (const entry of entries) {
    switch (entry.name) {
      case "dock":
        capabilities.dock = entry.payload;
        break;
      case "lidarHealth":
        capabilities.lidarHealth = entry.payload;
        break;
      case "waterLevel":
        capabilities.waterLevel = entry.payload;
        break;
      case "sequence":
        capabilities.sequence = entry.payload;
        break;
    }
  }

  return capabilities;
}

/**
 * The wire representation of a robot's capabilities: an array of entries,
 * transformed into the runtime record.
 *
 * Duplicates are rejected rather than resolved last-write-wins. Two entries for
 * one capability mean the producer holds two beliefs about the same fact, and
 * picking one silently discards the evidence that something upstream is wrong.
 */
export const capabilitiesWireSchema = z
  .array(capabilityWireEntrySchema)
  .check((ctx) => {
    const seen = new Set<CapabilityName>();
    for (const [index, entry] of ctx.value.entries()) {
      if (seen.has(entry.name)) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: [index, "name"],
          message: `Duplicate capability entry: ${entry.name}.`,
        });
      }
      seen.add(entry.name);
    }
  })
  .transform(toCapabilities);

/**
 * Encodes a runtime capability record back into wire entries, in canonical name
 * order.
 *
 * The inverse of `capabilitiesWireSchema`'s transform. Written by hand because a
 * Zod transform is one-directional, and written as a switch for the same reason
 * `toCapabilities` is: it keeps each name bound to its own payload type without
 * a cast.
 */
export function encodeCapabilities(capabilities: Capabilities): readonly CapabilityWireEntry[] {
  const entries: CapabilityWireEntry[] = [];

  for (const name of CAPABILITY_NAMES) {
    switch (name) {
      case "dock": {
        const payload = capabilities.dock;
        if (payload !== undefined) {
          entries.push({ name: "dock", payload });
        }
        break;
      }
      case "lidarHealth": {
        const payload = capabilities.lidarHealth;
        if (payload !== undefined) {
          entries.push({ name: "lidarHealth", payload });
        }
        break;
      }
      case "waterLevel": {
        const payload = capabilities.waterLevel;
        if (payload !== undefined) {
          entries.push({ name: "waterLevel", payload });
        }
        break;
      }
      case "sequence": {
        const payload = capabilities.sequence;
        if (payload !== undefined) {
          entries.push({ name: "sequence", payload });
        }
        break;
      }
    }
  }

  return entries;
}

/** Decodes an untrusted capability wire array into the runtime record. */
export function parseCapabilities(input: unknown): ParseResult<Capabilities> {
  return parseWith(capabilitiesWireSchema, input);
}
