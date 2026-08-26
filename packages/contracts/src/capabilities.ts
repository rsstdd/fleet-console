import { z } from "zod";
import {
  healthSeveritySchema,
  identifierSchema,
  type ParseResult,
  parseWith,
} from "./primitives.js";

export const dockCapabilitySchema = z.strictObject({
  docked: z.boolean(),
  dockId: identifierSchema.nullable(),
});
export const lidarHealthCapabilitySchema = z.strictObject({
  severity: healthSeveritySchema,
  rpm: z.number().min(0).max(10_000).nullable(),
});
export const waterLevelCapabilitySchema = z.strictObject({
  percent: z.number().min(0).max(100).nullable(),
});
export const sequenceCapabilitySchema = z.strictObject({ value: z.number().int().min(0) });

export type DockCapability = z.infer<typeof dockCapabilitySchema>;
export type LidarHealthCapability = z.infer<typeof lidarHealthCapabilitySchema>;
export type WaterLevelCapability = z.infer<typeof waterLevelCapabilitySchema>;
export type SequenceCapability = z.infer<typeof sequenceCapabilitySchema>;

export interface CapabilityPayloadByName {
  dock: DockCapability;
  lidarHealth: LidarHealthCapability;
  waterLevel: WaterLevelCapability;
  sequence: SequenceCapability;
}
export type CapabilityName = keyof CapabilityPayloadByName;
export type Capabilities = { readonly [K in CapabilityName]?: CapabilityPayloadByName[K] };

/** Diagnostic capabilities require explicit operator opt-in. */
export const CAPABILITY_KINDS = {
  dock: "operator",
  lidarHealth: "operator",
  waterLevel: "operator",
  sequence: "diagnostic",
} as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[CapabilityName];
export const CAPABILITY_NAMES = ["dock", "lidarHealth", "waterLevel", "sequence"] as const;

export type OperatorCapabilityName = {
  [K in CapabilityName]: (typeof CAPABILITY_KINDS)[K] extends "operator" ? K : never;
}[CapabilityName];
export type DiagnosticCapabilityName = Exclude<CapabilityName, OperatorCapabilityName>;

export function isOperatorCapability(name: CapabilityName): name is OperatorCapabilityName {
  return CAPABILITY_KINDS[name] === "operator";
}
export function isDiagnosticCapability(name: CapabilityName): name is DiagnosticCapabilityName {
  return CAPABILITY_KINDS[name] === "diagnostic";
}

export const OPERATOR_CAPABILITY_NAMES: readonly OperatorCapabilityName[] =
  CAPABILITY_NAMES.filter(isOperatorCapability);
export const DIAGNOSTIC_CAPABILITY_NAMES: readonly DiagnosticCapabilityName[] =
  CAPABILITY_NAMES.filter(isDiagnosticCapability);

export const capabilityWireEntrySchema = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("dock"), payload: dockCapabilitySchema }),
  z.strictObject({ name: z.literal("lidarHealth"), payload: lidarHealthCapabilitySchema }),
  z.strictObject({ name: z.literal("waterLevel"), payload: waterLevelCapabilitySchema }),
  z.strictObject({ name: z.literal("sequence"), payload: sequenceCapabilitySchema }),
]);
export type CapabilityWireEntry = z.infer<typeof capabilityWireEntrySchema>;

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
  .transform((entries) =>
    entries.reduce<Capabilities>(
      (capabilities, entry) => ({ ...capabilities, [entry.name]: entry.payload }),
      {},
    ),
  );

export function encodeCapabilities(capabilities: Capabilities): readonly CapabilityWireEntry[] {
  const { dock, lidarHealth, waterLevel, sequence } = capabilities;
  const entries: CapabilityWireEntry[] = [];
  if (dock !== undefined) {
    entries.push({ name: "dock", payload: dock });
  }
  if (lidarHealth !== undefined) {
    entries.push({ name: "lidarHealth", payload: lidarHealth });
  }
  if (waterLevel !== undefined) {
    entries.push({ name: "waterLevel", payload: waterLevel });
  }
  if (sequence !== undefined) {
    entries.push({ name: "sequence", payload: sequence });
  }
  return entries;
}

export function parseCapabilities(input: unknown): ParseResult<Capabilities> {
  return parseWith(capabilitiesWireSchema, input);
}
