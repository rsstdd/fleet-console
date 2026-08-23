import { OPERATOR_CAPABILITY_NAMES } from "@fleet/contracts";

import type {
  Freshness,
  PanelCapabilityName,
  Position,
  Robot,
  RobotDetail,
  RobotHealth,
  RobotStatus,
} from "@/types/robot";

/**
 * Structurally identical to components/statusChip's StatusVariant, but not
 * imported from it. The data layers may never import components
 * (ADR 4; ADR 36) — and more fundamentally, importing the type here would be
 * exactly the unification the component-set spec's own prose forbids:
 * "they are not the same types and must not be unified." Declaring the
 * same string-literal union independently, rather than importing it, is
 * what makes the two layers stay decoupled. TypeScript's structural typing
 * makes a value typed this way assignable wherever StatusChip's `variant`
 * prop is expected, with no import and no boundary crossed.
 */
export type StatusPresentationVariant =
  | "neutral" // idle
  | "active" // busy
  | "charging"
  | "degraded" // health severity, not a vendor status
  | "fault"
  | "unknown";

const STATUS_VARIANT: Record<RobotStatus, StatusPresentationVariant> = {
  idle: "neutral",
  busy: "active",
  charging: "charging",
  fault: "fault",
  unknown: "unknown",
};

const STATUS_LABEL: Record<RobotStatus, string> = {
  idle: "Idle",
  busy: "Busy",
  charging: "Charging",
  fault: "Fault",
  unknown: "Unknown",
};

export interface StatusPresentation {
  readonly variant: StatusPresentationVariant;
  readonly label: string;
  /** false drives StatusChip's outline/hollow "last known" treatment. */
  readonly current: boolean;
}

/**
 * Health severity outranks status where it is the more serious of the two.
 *
 * `critical` maps to the `fault` variant rather than passing through to the
 * status colour: the fleet table has no health column (fleet spec §2), so the
 * chip is the only health signal there, and leaving `critical` unmapped chipped
 * a critically unhealthy idle robot as ordinary "Idle" while the *lesser*
 * `degraded` severity was visible. No new variant or token was added — the
 * existing danger colour already means "needs attention now" (ADR 1, Observed
 * consequences, 19 August 2026).
 *
 * The label still names the status, so severity and status stay two facts
 * rather than one word: a critical idle robot reads "Idle" on a fault chip.
 */
function selectVariant(status: RobotStatus, health: RobotHealth | null): StatusPresentationVariant {
  if (status === "fault" || health?.severity === "critical") {
    return "fault";
  }
  if (health?.severity === "degraded") {
    return "degraded";
  }
  // A robot with no health reported at all falls through to its status, which
  // for a never-seen robot is `unknown` — the honest chip.
  return STATUS_VARIANT[status];
}

/**
 * Maps a robot's canonical status, health severity, and freshness into what
 * StatusChip needs to render. The caller passes `label` straight through —
 * the "(last known)" wording is decided here, once, rather than duplicated
 * at each call site.
 */
export function selectStatusPresentation(robot: Robot): StatusPresentation {
  const current = robot.freshness === "live";
  const variant = selectVariant(robot.status, robot.health);
  const baseLabel = STATUS_LABEL[robot.status];

  return {
    variant,
    label: current ? baseLabel : `${baseLabel} (last known)`,
    current,
  };
}

/**
 * Battery is only meaningful when the value is current. An em dash is
 * honest where a stale or absent number is not (fleet page spec §6).
 */
export function selectBatteryDisplay(robot: Robot): string {
  if (robot.freshness !== "live" || robot.batteryPercent === null) {
    return "—";
  }
  return `${String(robot.batteryPercent)}%`;
}

export interface FreshnessSummary {
  readonly live: number;
  readonly stale: number;
  readonly unreachable: number;
  readonly unknown: number;
}

/**
 * Freshness counts only, per fleet page spec §2 — mutually exclusive,
 * totalling the fleet exactly. Status distribution is not counted here; it
 * belongs to the table and its filters, not a second summary strip.
 */
export function selectFreshnessSummary(robots: readonly Robot[]): FreshnessSummary {
  const initial: FreshnessSummary = { live: 0, stale: 0, unreachable: 0, unknown: 0 };

  return robots.reduce<FreshnessSummary>((acc, robot) => {
    const key: Freshness = robot.freshness;
    switch (key) {
      case "live":
        return { ...acc, live: acc.live + 1 };
      case "stale":
        return { ...acc, stale: acc.stale + 1 };
      case "unreachable":
        return { ...acc, unreachable: acc.unreachable + 1 };
      case "unknown":
        return { ...acc, unknown: acc.unknown + 1 };
    }
  }, initial);
}

/**
 * Position in its native map frame, frame named alongside the numbers so an
 * operator knows what they mean (robot detail spec §6).
 *
 * Deliberately the same currency rule as `selectBatteryDisplay`: a coordinate
 * that is not current is an em dash, not a number. Two readings on one surface
 * disagreeing about what "current" means is worse than either rule alone.
 */
export function selectPositionDisplay(robot: RobotDetail): string {
  if (robot.freshness !== "live" || robot.position === null) {
    return "—";
  }
  const { frame, x, y } = robot.position;
  return `${frame} · ${x.toFixed(1)}, ${y.toFixed(1)}`;
}

/**
 * The capabilities robot detail may render as panels: those the robot actually
 * declared, minus the diagnostic-only ones and minus any the deployment
 * disabled, in a stable order.
 *
 * Which capabilities are operator-facing is a domain question, answered once in
 * `@fleet/contracts`' `CAPABILITY_KINDS` and read here as
 * `OPERATOR_CAPABILITY_NAMES` — already in canonical order and already without
 * the diagnostic ones. This file used to restate both the order and the
 * exclusion, which meant a fifth capability could be added to the contract and
 * silently reach neither surface (ADR 19). How each one draws is still the
 * feature's registry (Principle 1).
 *
 * The order is the contract's and is fixed, rather than derived from key
 * insertion order, so a delta that re-declares a capability cannot reshuffle the
 * grid under the operator (robot detail spec §7). That property used to come from
 * a local copy of `CAPABILITY_NAMES` that happened to agree with it.
 *
 * `disabled` is injected rather than read from tenant configuration: the
 * dependency rule forbids the data layers importing `config`, and the separation is
 * the right one anyway — whether a panel is *offered* is a deployment decision,
 * whether it is *declared* is a vendor fact. A panel renders only when both
 * hold (ADR 17). Coupling: the list is produced by
 * `features/robot/panelVisibility.ts` from `TenantFlags`.
 */
export function selectPanelCapabilities(
  robot: RobotDetail,
  disabled: readonly PanelCapabilityName[] = [],
): readonly PanelCapabilityName[] {
  return OPERATOR_CAPABILITY_NAMES.filter(
    (name) => robot.capabilities[name] !== undefined && !disabled.includes(name),
  );
}

/**
 * Clock delta as a signed, human-readable millisecond figure, or an em dash
 * when either timestamp is missing. A missing delta is not a zero delta.
 */
export function selectClockDeltaDisplay(robot: RobotDetail): string {
  const delta = robot.diagnostics?.clockDeltaMs ?? null;
  if (delta === null) {
    return "—";
  }
  return `${delta > 0 ? "+" : ""}${String(delta)} ms`;
}

/**
 * Sequence gap count, distinguishing "none observed" from "not evaluated".
 * Showing "0" for a robot nobody checks is a false statement to an operator
 * (ADR 1, Implications).
 *
 * Reads the contract's discriminated `sequenceHealth` (ADR 25). The previous
 * `number | null` made the wrong answer reachable by forgetting a null check;
 * here there is no count to read until `evaluated` has been checked, so the
 * distinction is structural rather than remembered.
 *
 * Absent diagnostics still means not evaluated: a robot with no diagnostic
 * response has had nothing counted for it either.
 */
export function selectSequenceGapDisplay(robot: RobotDetail): string {
  const health = robot.diagnostics?.sequenceHealth;
  if (health === undefined || !health.evaluated) {
    return "Not evaluated";
  }
  return String(health.gaps);
}

/**
 * Duplicate-reading count on the same terms as gaps.
 *
 * Its own selector rather than a second return from the one above, because a
 * caller that wanted only gaps should not have to know duplicates exist. Both
 * read one field, so they cannot disagree about whether it was evaluated.
 */
export function selectSequenceDuplicateDisplay(robot: RobotDetail): string {
  const health = robot.diagnostics?.sequenceHealth;
  if (health === undefined || !health.evaluated) {
    return "Not evaluated";
  }
  return String(health.duplicates);
}

/*
 * ------------------------------------------------------------------ map --
 * Pure projection pipeline for the map view (page spec 04, ADR 35).
 * Coupling: `features/map/mapPage.tsx` composes these and owns the
 * per-session extents state (Principle 11).
 */

/** Axis-aligned bounds of one site frame, in metres (ADR 35). */
export interface SiteExtents {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** The SVG coordinate space a projection targets, in user units. */
export interface ViewBoxSize {
  readonly width: number;
  readonly height: number;
}

/** A robot the map can plot: its `position` is proven non-null by selection. */
export interface PlottableRobot extends Robot {
  readonly position: Position;
}

/** One fully derived marker; the canvas computes nothing (page spec 04 § 7). */
export interface MapMarker {
  readonly robotId: string;
  /** ViewBox coordinates, already projected and y-inverted. */
  readonly x: number;
  readonly y: number;
  readonly variant: StatusPresentationVariant;
  /** Hollow when freshness is not live or the stream is not connected. */
  readonly hollow: boolean;
}

/** Fraction of each axis span added on both sides of a derived bounding box. */
const EXTENTS_PAD_RATIO = 0.1;

/** Smallest axis span in metres; guards against a degenerate box (ADR 35). */
const MIN_EXTENT_SPAN_METRES = 10;

/**
 * The site's robots the canvas can plot: membership by `siteId`, with a
 * position (page spec 04 § 6).
 */
export function selectPlottableRobots(
  robots: readonly Robot[],
  siteId: string,
): readonly PlottableRobot[] {
  return robots.filter(
    (robot): robot is PlottableRobot => robot.siteId === siteId && robot.position !== null,
  );
}

/**
 * One site's robots, positioned or not — the roster a site-scoped surface
 * starts from (page spec 04 § 2).
 */
export function selectSiteRobots(robots: readonly Robot[], siteId: string): readonly Robot[] {
  return robots.filter((robot) => robot.siteId === siteId);
}

/**
 * The robots in the given roster that never reported a position, so a surface
 * can account for them rather than silently dropping them (Principle 4).
 */
export function selectUnpositionedRobots(robots: readonly Robot[]): readonly Robot[] {
  return robots.filter((robot) => robot.position === null);
}

/** Widens one axis to the pad ratio, then to the minimum span, around its centre. */
function padAxis(min: number, max: number): { readonly min: number; readonly max: number } {
  const pad = (max - min) * EXTENTS_PAD_RATIO;
  let lower = min - pad;
  let upper = max + pad;
  if (upper - lower < MIN_EXTENT_SPAN_METRES) {
    const centre = (lower + upper) / 2;
    lower = centre - MIN_EXTENT_SPAN_METRES / 2;
    upper = centre + MIN_EXTENT_SPAN_METRES / 2;
  }
  return { min: lower, max: upper };
}

/**
 * Padded bounding box of the given positions, or null when there are none
 * (ADR 35, Principle 4).
 */
export function computeSiteExtents(positions: readonly Position[]): SiteExtents | null {
  const first = positions[0];
  if (first === undefined) {
    return null;
  }
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }
  const x = padAxis(minX, maxX);
  const y = padAxis(minY, maxY);
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

/**
 * Union of two extents, so the box only widens within a session (ADR 35).
 * Null on either side yields the other; a union that widens nothing returns
 * `previous` by reference so callers can detect "unchanged".
 */
export function mergeExtents(
  previous: SiteExtents | null,
  next: SiteExtents | null,
): SiteExtents | null {
  if (previous === null) {
    return next;
  }
  if (next === null) {
    return previous;
  }
  const minX = Math.min(previous.minX, next.minX);
  const maxX = Math.max(previous.maxX, next.maxX);
  const minY = Math.min(previous.minY, next.minY);
  const maxY = Math.max(previous.maxY, next.maxY);
  if (
    minX === previous.minX &&
    maxX === previous.maxX &&
    minY === previous.minY &&
    maxY === previous.maxY
  ) {
    return previous;
  }
  return { minX, maxX, minY, maxY };
}

/** ViewBox dimensions matching the extents' aspect ratio at the given width. */
export function computeViewBoxSize(extents: SiteExtents, width: number): ViewBoxSize {
  const spanX = extents.maxX - extents.minX;
  const spanY = extents.maxY - extents.minY;
  return { width, height: roundCoordinate((width * spanY) / spanX) };
}

/**
 * Projects a position into the viewBox, inverting y (SVG y grows downward).
 * Extents must have positive spans; `computeSiteExtents`' floor guarantees it.
 */
export function projectToViewBox(
  position: Position,
  extents: SiteExtents,
  viewBox: ViewBoxSize,
): { readonly x: number; readonly y: number } {
  const fractionX = (position.x - extents.minX) / (extents.maxX - extents.minX);
  const fractionY = (position.y - extents.minY) / (extents.maxY - extents.minY);
  return {
    x: roundCoordinate(fractionX * viewBox.width),
    y: roundCoordinate((1 - fractionY) * viewBox.height),
  };
}

/** Rounds to 2 dp so SVG attributes stay readable and referentially stable. */
function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Everything the canvas needs for one marker: colour from the shared status
 * selector, fill encoding freshness, forced hollow while the stream is down
 * (ADR 3).
 */
export function selectMapMarker(
  robot: PlottableRobot,
  extents: SiteExtents,
  viewBox: ViewBoxSize,
  streamConnected: boolean,
): MapMarker {
  const { x, y } = projectToViewBox(robot.position, extents, viewBox);
  return {
    robotId: robot.id,
    x,
    y,
    variant: selectStatusPresentation(robot).variant,
    hollow: !streamConnected || robot.freshness !== "live",
  };
}

/** The "N of M robots positioned" accounting for one site (page spec 04 § 2). */
export interface PositionedSummary {
  readonly positioned: number;
  readonly total: number;
}

/**
 * Counts a site's robots and how many carry a position, so the surface can
 * state the unplottable rest (Principle 4).
 */
export function selectPositionedSummary(
  robots: readonly Robot[],
  siteId: string,
): PositionedSummary {
  const siteRobots = robots.filter((robot) => robot.siteId === siteId);
  return {
    positioned: siteRobots.filter((robot) => robot.position !== null).length,
    total: siteRobots.length,
  };
}
