import type {
  Capabilities,
  Connectivity,
  FreshnessState,
  Health,
  Position,
  RobotStatus,
  SequenceHealth,
} from "@fleet/contracts";

export interface Robot {
  readonly id: string;
  readonly vendor: string;
  readonly siteId: string;
  /** False means registered but never observed. */
  readonly observed: boolean;
  readonly model: string | null;
  readonly connectivity: Connectivity | null;
  readonly position: Position | null;
  readonly capabilities: Capabilities;
  readonly status: RobotStatus;
  readonly health: Health | null;
  readonly freshness: FreshnessState;
  readonly batteryPercent: number | null;
  readonly lastSeenAt: string | null;
}

export interface RobotDiagnostics {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sequence: number | null;
  readonly sequenceHealth: SequenceHealth;
  readonly vendorReportedAt: string | null;
  readonly receivedAt: string | null;
  readonly clockDeltaMs: number | null;
  readonly schemaVersion: string;
}

export interface RobotDetail extends Robot {
  readonly diagnostics: RobotDiagnostics | null;
  readonly rawPayload: Readonly<Record<string, unknown>> | null;
}
