import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

export function Loading({ label }: { readonly label: string }) {
  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center", p: 3 }} role="status">
      <CircularProgress size={20} />
      <Typography>{label}</Typography>
    </Box>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail?: string;
}) {
  return (
    <Box sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}>
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      {detail !== undefined && <Typography variant="body2">{detail}</Typography>}
    </Box>
  );
}

export function ErrorState({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail?: string;
}) {
  return (
    <Alert severity="error" role="alert">
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      {detail !== undefined && <Typography variant="body2">{detail}</Typography>}
    </Alert>
  );
}
