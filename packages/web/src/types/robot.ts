/**
 * Robot read model for the console. Framework-independent — no React, no MUI,
 * no router. See ADR 1 (canonical model), ADR 4 (data-layer boundary).
 *
 * Contract types are imported from `@fleet/contracts` and re-exported under the
 * names this package already uses; they are not restated here. A second
 * declaration of the same union is a second authority that drifts the first
 * time one side changes (Principle 1). What this file still owns is the *read
 * model* — the shape the console renders, which is not the shape the wire
 * carries: timestamps are ISO strings rather than epoch milliseconds, and the
 * per-adapter counters the technician view shows come from the health
 * endpoint rather than from a telemetry envelope.
 *
 * The mapping between the two lives in `fromEnvelope.ts`. Coupling:
 * `packages/contracts/src/capabilities/capabilitySchemas.ts` names this file
 * as its downstream consumer.
 */
import type {
  Capabilities,
  CapabilityName,
  CapabilityPayloadByName,
  Connectivity,
  DiagnosticCapabilityName,
  DockCapability,
  FreshnessState,
  Health,
  HealthSeverity,
  LidarHealthCapability,
  OperatorCapabilityName,
  Position,
  RobotStatus,
  SequenceCapability,
  SequenceHealth,
  WaterLevelCapability,
} from "@fleet/contracts";

export type {
  CapabilityName,
  CapabilityPayloadByName,
  Connectivity,
  DiagnosticCapabilityName,
  DockCapability,
  HealthSeverity,
  LidarHealthCapability,
  OperatorCapabilityName,
  Position,
  RobotStatus,
  SequenceCapability,
  SequenceHealth,
  WaterLevelCapability,
};

/**
 * Freshness state, derived exclusively by the server's sweep over `receivedAt`
 * and delivered as a field on the envelope (ADR 3). Aliased from the contract's
 * `FreshnessState` rather than redeclared: this package displays the value and
 * holds no timer, so it has no business owning the vocabulary either.
 *
 * While the stream is down the feature layer suppresses per-robot freshness
 * labels in favour of the connection banner, rather than falling back to a
 * client timer — a client timer would degrade every row when the console's
 * own socket dies, which attributes the console's blindness to the machines.
 */
export type Freshness = FreshnessState;

/**
 * Health as the contract defines it: a severity, plus optional vendor prose.
 * Its own fact, never a qualifier appended to status text (robot detail
 * spec §6).
 */
export type RobotHealth = Health;

/** A robot's declared capabilities; key presence is the declaration (ADR 1). */
export type CapabilitySet = Capabilities;

/**
 * Capabilities eligible for an operator-facing panel.
 *
 * An alias, not a subset computed here. Which capabilities describe machine
 * behaviour and which are integration metadata is a property of the capability
 * itself, so `@fleet/contracts` classifies them once in `CAPABILITY_KINDS` and
 * derives both name sets from it; this package used to `Exclude` a hand-written
 * `"sequence"` literal, which was a second authority that nothing checked
 * (ADR 19, robot detail spec §6).
 *
 * "Panel" is the feature layer's word for how an operator capability is drawn, so
 * the local name stays. Being an alias rather than a restatement is what keeps it
 * from drifting: a capability classified `operator` in contracts appears here with
 * no edit, and `features/robot/capabilityPanels.tsx` fails to compile until it has
 * a panel.
 */
export type PanelCapabilityName = OperatorCapabilityName;

/** Observed or manifest-only canonical fleet data mapped into the immutable row shared by web layers. */
export interface Robot {
  readonly id: string;
  /**
   * The vendor id exactly as the envelope carried it, an open identifier: the
   * contract keeps it open so a fourth vendor is an adapter change and never a
   * contracts change (ADR 1), and a closed union here would put that coupling
   * back in the console. The fleet filter derives its options from the robots
   * it was given rather than from any constant.
   */
  readonly vendor: string;
  readonly siteId: string;
  /**
   * Whether telemetry has ever been observed for this robot, or the manifest
   * merely registered it. The discriminant behind every nullable field below:
   * a registered-only robot has no model, no connectivity, no position, and no
   * declared capabilities to show (ADR 3).
   */
  readonly observed: boolean;
  /** Null for a robot that has never reported: the manifest names a vendor, not a model. */
  readonly model: string | null;
  /**
   * The robot's own reported link state, which is neither the console's socket
   * state nor freshness (ADR 1). Null before the first report.
   */
  readonly connectivity: Connectivity | null;
  readonly position: Position | null;
  /** Declared capabilities; empty for a robot that has never reported (ADR 1). */
  readonly capabilities: CapabilitySet;
  readonly status: RobotStatus;
  /**
   * Null for a robot that has never reported. The canonical severity
   * vocabulary has no word for "not known", and `nominal` would be a
   * fabricated reassurance about a machine nobody has heard from
   * (Principle 4). See `toRegisteredRobot` in fromEnvelope.ts.
   */
  readonly health: RobotHealth | null;
  readonly freshness: Freshness;
  /**
   * The last reported charge, or null when the vendor reported none and for a
   * robot that has never reported at all.
   *
   * Carried whatever the freshness, and **suppressed at presentation**:
   * `selectBatteryDisplay` in `utils/robotSelectors.ts` refuses to render a number for a robot
   * that is not live, or whenever the stream is down and that `live` is merely the last one
   * received, because neither is a current reading (fleet page spec §6). The value survives
   * so the detail view can show a last-known figure with its age beside it; nulling it here
   * would destroy that and put a display rule in the read model.
   */
  readonly batteryPercent: number | null;
  /**
   * Null for a robot that is registered but has never reported (freshness
   * "unknown"). A robot cannot have a last-seen time it has never had.
   */
  readonly lastSeenAt: string | null;
}

/** Adapter and transport facts, shown to technicians only (spec §6). */
export interface RobotDiagnostics {
  readonly adapterId: string;
  readonly adapterVersion: string;
  /** Null for a vendor that sends no sequence (ADR 1: vendor B). */
  readonly sequence: number | null;
  /**
   * This robot's sequence continuity, or the statement that it was never
   * evaluated (ADR 25).
   *
   * Read off the diagnostic envelope, not injected. It used to be
   * `number | null` supplied from outside, which was this package's own second
   * spelling of a fact the server already had a type for — the drift Principle 1
   * forbids. The discriminated shape is why "not evaluated" cannot be rendered as
   * "0": there is no count to read until `evaluated` has been checked.
   */
  readonly sequenceHealth: SequenceHealth;
  readonly vendorReportedAt: string | null;
  readonly receivedAt: string | null;
  /** receivedAt − reportedAt, in ms. Null when either timestamp is missing. */
  readonly clockDeltaMs: number | null;
  readonly schemaVersion: string;
  /**
   * Per-adapter and fleet-wide, not per-robot. The label at the render site
   * must say so rather than implying a precision this count does not have
   * (ADR 1, Implications).
   *
   * Null when `GET /api/health` could not be read, which is a different fact
   * from a count of zero: zero is a measurement, and claiming one nobody took
   * is the failure Principle 4 names. Health is a second request and fails
   * independently of the robot's own data.
   */
  readonly unknownFieldCount: number | null;
}

/**
 * The single-robot read model. Extends the fleet row rather than restating it,
 * so a value shown on both surfaces cannot disagree between them.
 *
 * `rawPayload` is served only by GET /api/robots/:id and is excluded from the
 * fleet read model and the delta stream (ADR 1). Null means the payload was
 * not retained — the technician section says so instead of rendering an empty
 * code block (spec §10).
 */
export interface RobotDetail extends Robot {
  /**
   * Null for a robot that has never reported. Registration names no adapter,
   * no sequence and no schema version, and a row of em dashes would imply the
   * robot reported and said nothing (spec §10, "registration data only").
   */
  readonly diagnostics: RobotDiagnostics | null;
  readonly rawPayload: Readonly<Record<string, unknown>> | null;
}
