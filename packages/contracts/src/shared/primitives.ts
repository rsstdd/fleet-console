import { z } from "zod";

/**
 * Shared primitive schemas for the canonical contract: identifiers, versions,
 * timestamps, the closed vocabularies, and the small value objects the
 * normalized core is built from.
 *
 * Everything here is a runtime schema first and a TypeScript type second. Types
 * are inferred from the schemas rather than declared beside them, so the
 * compile-time and runtime contracts cannot drift (Principle 2).
 */

/**
 * Identifier characters: an alphanumeric first character, then alphanumerics,
 * dot, underscore, or hyphen. Wide enough for `R-204`, `site.north` and
 * `adapter-a`, narrow enough that an identifier can be put in a URL path or a
 * log line without quoting.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Upper bound on every identifier, chosen to fit a database key or a URL segment comfortably. */
const IDENTIFIER_MAX_LENGTH = 64;

/** Display strings are prose: any printable character, but no control characters and no runs of whitespace. */
const DISPLAY_NAME_PATTERN = /^[^\s\p{C}](?:[^\p{C}]*[^\s\p{C}])?$/u;

/** Upper bound on human-readable names such as a vendor's model designation. */
const DISPLAY_NAME_MAX_LENGTH = 96;

/** Three-part numeric version, e.g. an adapter's `2.1.0`. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Upper bound on a health description, long enough for vendor prose and short enough to log. */
const DESCRIPTION_MAX_LENGTH = 240;

/**
 * The only schema version this package understands. Bumping it is a deliberate
 * act with coordinated consumer changes; an envelope carrying any other value
 * is rejected rather than reinterpreted (packages/contracts/AGENTS.md).
 */
export const SCHEMA_VERSION = "1";

/**
 * Largest accepted epoch-millisecond value, 31 December 9999. A timestamp past
 * this is a unit error (seconds read as milliseconds, or the reverse) rather
 * than a real instant, and rejecting it at the boundary keeps the mistake near
 * its source.
 */
export const MAX_EPOCH_MS = 253_402_300_799_999;

/**
 * Largest accepted absolute coordinate in metres. A site map a thousand
 * kilometres across does not exist; a coordinate beyond this is a frame or unit
 * error worth rejecting (Vendor B reports centimetres and its adapter converts).
 */
export const MAX_POSITION_METRES = 1_000_000;

/** Identifier for a robot, site, vendor, or adapter: non-empty, unpadded, and URL-safe. */
export const identifierSchema = z
  .string()
  .min(1)
  .max(IDENTIFIER_MAX_LENGTH)
  .regex(IDENTIFIER_PATTERN, {
    error:
      "Expected an identifier: alphanumeric start, then alphanumerics, dot, underscore or hyphen.",
  });

/** A human-readable name such as a vendor's model designation; prose, not an identifier. */
export const displayNameSchema = z
  .string()
  .min(1)
  .max(DISPLAY_NAME_MAX_LENGTH)
  .regex(DISPLAY_NAME_PATTERN, {
    error: "Expected a display name with no control characters and no leading or trailing space.",
  });

/** A three-part numeric version string, used for adapter versions. */
export const versionStringSchema = z.string().regex(VERSION_PATTERN, {
  error: "Expected a three-part numeric version, e.g. 1.0.0.",
});

/** The supported canonical schema version, as an exact literal. */
export const schemaVersionSchema = z.literal(SCHEMA_VERSION);

/**
 * An instant as integral epoch milliseconds. Both canonical timestamps use this
 * one representation so no consumer has to know which vendor sent ISO 8601 and
 * which sent epoch values (ADR 1).
 */
export const epochMillisecondsSchema = z.number().int().min(0).max(MAX_EPOCH_MS);

/**
 * A server-wide, monotonically increasing counter identifying one fan-out flush.
 *
 * ADR 2 requires it on both the fleet snapshot and every delta so a joining
 * client can tell a buffered delta its snapshot already covers from one it still
 * needs. The client opens the socket first and buffers, then fetches the
 * snapshot, then discards every buffered delta at or below the snapshot's
 * sequence. Without it, that reconciliation is unanswerable and the choice of an
 * HTTP snapshot over a socket-borne one stops being safe (ADR 18).
 *
 * Server-wide and per flush, **not** per robot: one number answers "does this
 * predate my snapshot" for the whole fleet, where per-robot versions would answer
 * it with five hundred. It counts flushes, so it is unrelated to a robot's own
 * `sequence` capability, which is vendor-supplied and per robot.
 *
 * Not a timestamp. `sentAt` already carries wall-clock time for measuring delay,
 * and two flushes inside one millisecond must still be orderable — which is
 * exactly the mass-transition case ADR 3 produces.
 *
 * Zero is legal and is the value a server that has never flushed reports, so a
 * cold snapshot taken before any delta discards nothing.
 */
export const flushSequenceSchema = z.number().int().min(0);

/**
 * The vendor that produced a reading, as an open identifier rather than a closed
 * enum. Adding a fourth vendor means adding an adapter module and its fixtures,
 * never editing this package (ADR 1, Principle 3) — a `z.enum(["A","B","C"])`
 * here would make every new vendor a contracts change.
 */
export const vendorIdSchema = identifierSchema;

/** The canonical status vocabulary: exactly the five values an adapter may emit (ADR 1). */
export const robotStatusSchema = z.enum(["idle", "busy", "charging", "fault", "unknown"]);

/** Health severity, a separate fact from status rather than a value folded into it (ADR 1). */
export const healthSeveritySchema = z.enum(["nominal", "degraded", "critical"]);

/**
 * The four freshness states, lowercase on the wire. `packages/web` uppercases
 * them for display; the contract does not (ADR 3, component spec 02).
 */
export const freshnessStateSchema = z.enum(["live", "stale", "unreachable", "unknown"]);

/**
 * The robot's own reported link state, normalized across vendors.
 *
 * Deliberately not freshness and not the console's WebSocket state. This answers
 * "does the robot consider itself connected to its vendor's network", freshness
 * answers "how long since the server heard anything" (ADR 3), and the connection
 * banner answers "can this browser see the server" (component spec 07). A vendor
 * that reports no link state maps to `unknown` rather than an optimistic
 * `online`.
 */
export const connectivitySchema = z.enum(["online", "offline", "unknown"]);

/**
 * Battery charge as an inclusive 0-100 percentage. Fractional readings are
 * accepted because Vendor A reports a 0-1 fraction and rounding at the adapter
 * would discard precision the detail view can legitimately show.
 */
export const batteryPercentSchema = z.number().min(0).max(100);

/**
 * A position in the vendor's own map frame, in metres.
 *
 * The frame is required: coordinates without a named frame are numbers an
 * operator cannot act on. There is no heading field, because no modelled vendor
 * reports one and ADR 1 treats a canonical field no adapter populates as a
 * defect.
 */
export const positionSchema = z.strictObject({
  frame: identifierSchema,
  x: z.number().min(-MAX_POSITION_METRES).max(MAX_POSITION_METRES),
  y: z.number().min(-MAX_POSITION_METRES).max(MAX_POSITION_METRES),
});

/**
 * Whether sequence continuity was evaluated, and what it found.
 *
 * The one representation of "not evaluated" in this repository (ADR 25). It was
 * previously spelled two ways that could not be compared: the server typed a
 * `SequenceObservation` union while `packages/web` used `sequenceGaps: number | null`
 * and injected it from outside the envelope. Two spellings of one fact is the drift
 * Principle 1 forbids, and this fact is worth more than most — reporting `0 gaps` for a
 * vendor that sends no sequence at all is a false statement to an operator.
 *
 * Discriminated on `evaluated` rather than nullable, deliberately. A `number | null` is
 * indistinguishable from "the field was absent", so a consumer that forgets the
 * distinction renders `0` and is believed. Here there is no `gaps` field to read until
 * `evaluated` has been checked, which makes the check structural rather than remembered.
 *
 * Scope comes from where this value sits, not from the value: on
 * `robotDiagnosticEnvelopeSchema` it is one robot's continuity, and on the health
 * response it is one adapter's rollup across every robot it decodes. Those answer
 * different questions and must not be summed or substituted for one another.
 *
 * Not to be confused with `healthSchema` above, which is the robot's own reported
 * condition. This is a property of the telemetry, not of the machine.
 */
export const sequenceHealthSchema = z.discriminatedUnion("evaluated", [
  z.strictObject({ evaluated: z.literal(false) }),
  z.strictObject({
    evaluated: z.literal(true),
    /** Readings missing from the sequence since the process started; not a rolling window. */
    gaps: z.number().int().min(0),
    /** Readings whose sequence number had already been seen. */
    duplicates: z.number().int().min(0),
  }),
]);

/** Sequence continuity, or the statement that it was never evaluated (ADR 25). */
export type SequenceHealth = z.infer<typeof sequenceHealthSchema>;

/**
 * Health as its own value: a severity, plus optional vendor prose.
 *
 * No cross-field invariant ties `fault` status to `critical` severity. ADR 1
 * leaves that question open and says to add the rule only if it holds for every
 * vendor; it is not established, so the two stay independent here and the
 * presentation rule lives in `packages/web/src/entities/robot/selectors.ts`
 * (ADR 1, Observed consequences, 19 August 2026).
 */
export const healthSchema = z.strictObject({
  severity: healthSeveritySchema,
  description: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).optional(),
});

/** A canonical identifier for a robot, site, vendor, or adapter. */
export type Identifier = z.infer<typeof identifierSchema>;

/** An instant expressed as integral epoch milliseconds. */
export type EpochMilliseconds = z.infer<typeof epochMillisecondsSchema>;

/** A server-wide monotonically increasing fan-out flush counter (ADR 2, ADR 18). */
export type FlushSequence = z.infer<typeof flushSequenceSchema>;

/** One of the five canonical robot statuses. */
export type RobotStatus = z.infer<typeof robotStatusSchema>;

/** One of the three canonical health severities. */
export type HealthSeverity = z.infer<typeof healthSeveritySchema>;

/** One of the four freshness states carried on the envelope. */
export type FreshnessState = z.infer<typeof freshnessStateSchema>;

/** The robot's reported link state, normalized across vendors. */
export type Connectivity = z.infer<typeof connectivitySchema>;

/** A position in a named map frame, in metres. */
export type Position = z.infer<typeof positionSchema>;

/** A health severity with optional vendor-supplied description. */
export type Health = z.infer<typeof healthSchema>;

/**
 * One validation failure, translated out of Zod's shape into a small stable
 * form so consumers assert on `code` and `path` rather than on Zod's prose.
 *
 * Carries no HTTP status and no user-facing copy: mapping a failure onto a
 * response belongs to `packages/server`, and onto a message belongs to
 * `packages/web` (packages/contracts/AGENTS.md, Dependency boundary).
 *
 * This is the repository's one failure vocabulary (ADR 20): an adapter's
 * `AdapterError` carries these, the server's HTTP error body carries the same
 * values unchanged, and the console renders `path` and `code` from them.
 * Coupling: `errors/errorEnvelopeSchema.ts` holds the runtime schema this
 * interface has to keep matching, and asserts the match at compile time.
 */
export interface ContractIssue {
  /** Dotted path to the offending value, or `(root)` when the whole input is wrong. */
  readonly path: string;
  /** Stable failure category, e.g. `invalid_type` or `unrecognized_keys`. */
  readonly code: string;
  /** Human-readable detail, suitable for a log line rather than an operator. */
  readonly message: string;
}

/** The outcome of decoding untrusted input: either a typed value or a list of issues. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ContractIssue[] };

/** Path segment marker used when a failure applies to the whole input rather than a field. */
const ROOT_PATH = "(root)";

/** Formats a Zod path as dotted segments with bracketed array indices, e.g. `capabilities[1].payload`. */
function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return ROOT_PATH;
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${String(segment)}]`;
    }
    const name = String(segment);
    return formatted === "" ? name : `${formatted}.${name}`;
  }, "");
}

/**
 * Translates a Zod error into the package's stable issue shape.
 *
 * One Zod issue usually becomes one `ContractIssue`, with the exception of
 * `unrecognized_keys`: Zod reports every unrecognized key of one object as a
 * single issue whose `path` names the object and whose `keys` array names the
 * offenders. Flattening that to one issue would put the offending names in the
 * message and nowhere else, so it is expanded into one issue per key whose
 * `path` points at the key itself. The message is Zod's, verbatim, because
 * consumers assert on `code` and `path` and never on prose (ADR 20).
 *
 * Only structure travels: paths name fields, codes name failure categories.
 * A rejected value is never copied into an issue, which is what lets the
 * server put these on the wire (`errorEnvelopeSchema`, ADR 20).
 */
export function toContractIssues(error: z.ZodError): readonly ContractIssue[] {
  return error.issues.flatMap((issue): readonly ContractIssue[] =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => ({
          path: formatPath([...issue.path, key]),
          code: issue.code,
          message: issue.message,
        }))
      : [
          {
            path: formatPath(issue.path),
            code: issue.code,
            message: issue.message,
          },
        ],
  );
}

/**
 * Decodes untrusted input with the given schema, returning a discriminated
 * result rather than throwing.
 *
 * This is the boundary helper every exported `parse*` function is built from.
 * The schemas remain exported too, so a consumer that wants Zod's own
 * `safeParse` is not forced through this shape.
 */
export function parseWith<Output, Input>(
  schema: z.ZodType<Output, Input>,
  input: unknown,
): ParseResult<Output> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: toContractIssues(parsed.error) };
}
