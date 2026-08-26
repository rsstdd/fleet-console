import Chip from "@mui/material/Chip";
import type { StatusPresentation } from "@/utils/robotSelectors";

const VARIANT_COLOR: Record<StatusPresentation["variant"], string> = {
  neutral: "var(--text-muted)",
  active: "var(--live)",
  charging: "var(--live)",
  degraded: "var(--stale)",
  fault: "var(--unreachable)",
  unknown: "var(--unknown)",
};

/** Colour is never the only cue: the label carries the same statement in words. */
export function StatusChip({ presentation }: { readonly presentation: StatusPresentation }) {
  return (
    <Chip
      size="small"
      label={presentation.label}
      variant="outlined"
      sx={{
        color: VARIANT_COLOR[presentation.variant],
        borderColor: VARIANT_COLOR[presentation.variant],
        fontWeight: 600,
      }}
    />
  );
}
