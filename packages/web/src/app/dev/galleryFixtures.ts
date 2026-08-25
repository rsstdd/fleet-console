import type { FreshnessState } from "@/components/freshnessLabel";
import type { StatusVariant } from "@/components/statusChip";

const GALLERY_CAPTURED_AT_MS = Date.now();

export const GALLERY_CAPTURED_AT_ISO = new Date(GALLERY_CAPTURED_AT_MS).toISOString();

/** Sample fleet rows spanning every freshness state, for the combined-usage table. */
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
    asOf: new Date(GALLERY_CAPTURED_AT_MS - 2_000).toISOString(),
    battery: "91%",
  },
  {
    id: "R-055",
    vendor: "B",
    statusVariant: "charging",
    statusLabel: "Charging",
    freshness: "live",
    asOf: new Date(GALLERY_CAPTURED_AT_MS - 5_000).toISOString(),
    battery: "34%",
  },
  {
    id: "R-301",
    vendor: "C",
    statusVariant: "fault",
    statusLabel: "Fault",
    freshness: "live",
    asOf: new Date(GALLERY_CAPTURED_AT_MS - 9_000).toISOString(),
    battery: "12%",
  },
  {
    id: "R-204",
    vendor: "A",
    statusVariant: "active",
    statusLabel: "Busy (last known)",
    freshness: "stale",
    asOf: new Date(GALLERY_CAPTURED_AT_MS - 18_000).toISOString(),
    battery: "67%",
  },
  {
    id: "R-087",
    vendor: "B",
    statusVariant: "neutral",
    statusLabel: "Idle (last known)",
    freshness: "unreachable",
    asOf: new Date(GALLERY_CAPTURED_AT_MS - 1_740_000).toISOString(),
    battery: "—",
  },
];

/** The six status variants with demo labels — one per state the canonical model can produce. */
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

/** All four states FreshnessLabel renders; nothing makes a fifth a compile error here. */
export const FRESHNESS_STATES: ReadonlyArray<FreshnessState> = [
  "live",
  "stale",
  "unreachable",
  "unknown",
];

/** Prop lists copied by hand: no check compares them to the components, so they drift silently. */
export const COMPONENT_PROPS: ReadonlyArray<{
  readonly component: string;
  readonly props: string;
}> = [
  {
    component: "ConnectionBanner",
    props: "state · lastEventAt? · attempt? · onRetry? · className?",
  },
  { component: "DataPlate", props: "children · as? · className?" },
  { component: "EmptyState", props: "title · description? · action? · className?" },
  {
    component: "FreshnessLabel",
    props: "state · asOf · receivedAt? · isCompact? · className?",
  },
  { component: "PersonaToggle", props: "value · onChange · isDisabled? · className?" },
  { component: "SectionLabel", props: "children · className?" },
  { component: "Stat", props: "label · value · hint? · tone? · className?" },
  { component: "StatusChip", props: "variant · label · isCurrent · size? · className?" },
];
