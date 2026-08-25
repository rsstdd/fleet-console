import type { FreshnessState } from "@/components/freshnessLabel";
import type { StatusVariant } from "@/components/statusChip";

const GALLERY_CAPTURED_AT_MS = Date.parse("2026-08-19T09:41:20.000Z");

const instantBeforeCapture = (msBeforeCapture: number): string =>
  new Date(GALLERY_CAPTURED_AT_MS - msBeforeCapture).toISOString();

export const GALLERY_CAPTURED_AT_ISO = new Date(GALLERY_CAPTURED_AT_MS).toISOString();
export const GALLERY_LAST_EVENT_AT_ISO = instantBeforeCapture(18_000);
export const GALLERY_SOURCE_AT_ISO = instantBeforeCapture(19_000);

export const FLEET_ROWS: ReadonlyArray<{
  readonly id: string;
  readonly vendor: "A" | "B" | "C";
  readonly statusVariant: StatusVariant;
  readonly statusLabel: string;
  readonly freshness: FreshnessState;
  readonly asOf: string;
  readonly battery: string;
}> = [
  {
    id: "R-118",
    vendor: "A",
    statusVariant: "active",
    statusLabel: "Busy",
    freshness: "live",
    asOf: instantBeforeCapture(2_000),
    battery: "91%",
  },
  {
    id: "R-055",
    vendor: "B",
    statusVariant: "charging",
    statusLabel: "Charging",
    freshness: "live",
    asOf: instantBeforeCapture(5_000),
    battery: "34%",
  },
  {
    id: "R-301",
    vendor: "C",
    statusVariant: "fault",
    statusLabel: "Fault",
    freshness: "live",
    asOf: instantBeforeCapture(9_000),
    battery: "12%",
  },
  {
    id: "R-204",
    vendor: "A",
    statusVariant: "active",
    statusLabel: "Busy (last known)",
    freshness: "stale",
    asOf: instantBeforeCapture(18_000),
    battery: "67%",
  },
  {
    id: "R-087",
    vendor: "B",
    statusVariant: "neutral",
    statusLabel: "Idle (last known)",
    freshness: "unreachable",
    asOf: instantBeforeCapture(1_740_000),
    battery: "—",
  },
];

export const STATUS_VARIANTS: ReadonlyArray<{
  readonly variant: StatusVariant;
  readonly label: string;
}> = [
  { variant: "neutral", label: "Idle" },
  { variant: "active", label: "Busy" },
  { variant: "charging", label: "Charging" },
  { variant: "degraded", label: "Degraded" },
  { variant: "fault", label: "Fault" },
  { variant: "unknown", label: "Unknown" },
];

export const FRESHNESS_STATES: ReadonlyArray<FreshnessState> = [
  "live",
  "stale",
  "unreachable",
  "unknown",
];
