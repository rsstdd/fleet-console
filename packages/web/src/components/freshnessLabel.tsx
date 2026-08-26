import Box from "@mui/material/Box";
import type { FreshnessState } from "@fleet/contracts";
import { FRESHNESS_COLOR } from "@/app/theme";
import { FRESHNESS_LABEL } from "@/utils/robotSelectors";

export interface FreshnessLabelProps {
  readonly freshness: FreshnessState;
  /** Suppressed while the connection banner owns fleet-wide freshness. */
  readonly suppressed: boolean;
}

export function FreshnessLabel({ freshness, suppressed }: FreshnessLabelProps) {
  if (suppressed) {
    return (
      <Box component="span" sx={{ color: "var(--text-muted)" }}>
        —<span className="visually-hidden">Freshness unavailable while disconnected</span>
      </Box>
    );
  }
  return (
    <Box
      component="span"
      sx={{ color: FRESHNESS_COLOR[freshness], fontWeight: 600, letterSpacing: "0.04em" }}
    >
      {FRESHNESS_LABEL[freshness]}
    </Box>
  );
}
