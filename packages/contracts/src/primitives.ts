import { z } from "zod";

/** Version changes reject older payloads; no compatibility fallback exists. */
export const SCHEMA_VERSION = "3";

export const MAX_EPOCH_MS = 253_402_300_799_999;

export const MAX_POSITION_METRES = 1_000_000;

export const identifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    error:
      "Expected an identifier: alphanumeric start, then alphanumerics, dot, underscore or hyphen.",
  });

export const displayNameSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[^\s\p{C}](?:[^\p{C}]*[^\s\p{C}])?$/u, {
    error: "Expected a display name with no control characters and no leading or trailing space.",
  });

export const versionStringSchema = z.string().regex(/^\d+\.\d+\.\d+$/, {
  error: "Expected a three-part numeric version, e.g. 1.0.0.",
});

export const schemaVersionSchema = z.literal(SCHEMA_VERSION);
export const epochMillisecondsSchema = z.number().int().min(0).max(MAX_EPOCH_MS);

/** Server-wide flush count; compare it only within the same server session. */
export const flushSequenceSchema = z.number().int().min(0);

export const serverSessionIdSchema = z.uuid();

/** Vendor IDs remain open so adding a vendor does not change canonical contracts. */
export const vendorIdSchema = identifierSchema;

export const robotStatusSchema = z.enum(["idle", "busy", "charging", "fault", "unknown"]);
export const healthSeveritySchema = z.enum(["nominal", "degraded", "critical"]);
export const freshnessStateSchema = z.enum(["live", "stale", "unreachable", "unknown"]);

/** The robot's own link state — not freshness, and not the browser's socket state. */
export const connectivitySchema = z.enum(["online", "offline", "unknown"]);

/** Percent values may be fractional; adapters must not round them to integers. */
export const batteryPercentSchema = z.number().min(0).max(100);

export const positionSchema = z.strictObject({
  frame: identifierSchema,
  x: z.number().min(-MAX_POSITION_METRES).max(MAX_POSITION_METRES),
  y: z.number().min(-MAX_POSITION_METRES).max(MAX_POSITION_METRES),
});

/** "Not evaluated" is distinct from zero gaps. */
export const sequenceHealthSchema = z.discriminatedUnion("evaluated", [
  z.strictObject({ evaluated: z.literal(false) }),
  z.strictObject({
    evaluated: z.literal(true),
    gaps: z.number().int().min(0),
    duplicates: z.number().int().min(0),
  }),
]);

/** The robot's reported condition; severity and status stay independent. */
export const healthSchema = z.strictObject({
  severity: healthSeveritySchema,
  description: z.string().min(1).max(240).optional(),
});

export type Identifier = z.infer<typeof identifierSchema>;
export type EpochMilliseconds = z.infer<typeof epochMillisecondsSchema>;
export type FlushSequence = z.infer<typeof flushSequenceSchema>;
export type ServerSessionId = z.infer<typeof serverSessionIdSchema>;
export type RobotStatus = z.infer<typeof robotStatusSchema>;
export type HealthSeverity = z.infer<typeof healthSeveritySchema>;
export type FreshnessState = z.infer<typeof freshnessStateSchema>;
export type Connectivity = z.infer<typeof connectivitySchema>;
export type Position = z.infer<typeof positionSchema>;
export type Health = z.infer<typeof healthSchema>;
export type SequenceHealth = z.infer<typeof sequenceHealthSchema>;

/** Consumers identify failures by code and path; message text is not stable. */
export interface ContractIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ContractIssue[] };

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "(root)";
  }
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${String(segment)}]`;
    }
    const name = String(segment);
    return formatted === "" ? name : `${formatted}.${name}`;
  }, "");
}

/** Expands unknown keys to structured paths without copying rejected values. */
export function toContractIssues(error: z.ZodError): readonly ContractIssue[] {
  return error.issues.flatMap((issue): readonly ContractIssue[] =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => ({
          path: formatPath([...issue.path, key]),
          code: issue.code,
          message: issue.message,
        }))
      : [{ path: formatPath(issue.path), code: issue.code, message: issue.message }],
  );
}

export function parseWith<Output, Input>(
  schema: z.ZodType<Output, Input>,
  input: unknown,
): ParseResult<Output> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: toContractIssues(parsed.error) };
}
