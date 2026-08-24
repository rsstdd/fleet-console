import type { FreshnessState } from "@/components/freshnessLabel";
import type { StatusVariant } from "@/components/statusChip";

/** One capture instant, so every relative fixture timestamp in the gallery agrees. */
export const NOW = new Date();

/** Sample fleet rows spanning every freshness state, for the combined-usage table. */
export const FLEET_ROWS: ReadonlyArray<{
  id: string;
  vendor: "A" | "B" | "C";
  statusVariant: StatusVariant;
  statusLabel: string;
  freshness: FreshnessState;
  asOf: string;
  battery: string;
}> = [
  {
    id: "R-118",
    vendor: "A",
    statusVariant: "active",
    statusLabel: "Busy",
    freshness: "live",
    asOf: new Date(NOW.getTime() - 2_000).toISOString(),
    battery: "91%",
  },
  {
    id: "R-055",
    vendor: "B",
    statusVariant: "charging",
    statusLabel: "Charging",
    freshness: "live",
    asOf: new Date(NOW.getTime() - 5_000).toISOString(),
    battery: "34%",
  },
  {
    id: "R-301",
    vendor: "C",
    statusVariant: "fault",
    statusLabel: "Fault",
    freshness: "live",
    asOf: new Date(NOW.getTime() - 9_000).toISOString(),
    battery: "12%",
  },
  {
    id: "R-204",
    vendor: "A",
    statusVariant: "active",
    statusLabel: "Busy (last known)",
    freshness: "stale",
    asOf: new Date(NOW.getTime() - 18_000).toISOString(),
    battery: "67%",
  },
  {
    id: "R-087",
    vendor: "B",
    statusVariant: "neutral",
    statusLabel: "Idle (last known)",
    freshness: "unreachable",
    asOf: new Date(NOW.getTime() - 1_740_000).toISOString(),
    battery: "—",
  },
];

/** The six status variants with demo labels — one per state the canonical model can produce. */
export const STATUS_VARIANTS: ReadonlyArray<{ variant: StatusVariant; label: string }> = [
  { variant: "neutral", label: "Idle" },
  { variant: "active", label: "Busy" },
  { variant: "charging", label: "Charging" },
  { variant: "degraded", label: "Degraded" },
  { variant: "fault", label: "Fault" },
  { variant: "unknown", label: "Unknown" },
];

/** Every freshness state, in the order the FreshnessLabel section demonstrates them. */
export const FRESHNESS_STATES: ReadonlyArray<FreshnessState> = [
  "live",
  "stale",
  "unreachable",
  "unknown",
];

/** The public-props index rendered at the top of the gallery, one row per primitive. */
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
