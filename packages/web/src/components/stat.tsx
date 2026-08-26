import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface StatProps {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
}

export function Stat({ label, value, color }: StatProps) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "var(--text-muted)", display: "block" }}>
        {label}
      </Typography>
      <Typography component="p" sx={{ fontWeight: 600, color: color ?? "inherit" }}>
        {value}
      </Typography>
    </Box>
  );
}
