import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CssBaseline,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { DataPlate } from "@/shared/ui/dataPlate";
import { ConnectionBanner, type ConnectionState } from "@/shared/ui/connectionBanner";
import { EmptyState } from "@/shared/ui/emptyState";
import { FreshnessLabel, type FreshnessState } from "@/shared/ui/freshnessLabel";
import { PersonaToggle, type Persona } from "@/shared/ui/personaToggle";
import { SectionLabel } from "@/shared/ui/sectionLabel";
import { Stat } from "@/shared/ui/stat";
import { StatusChip, type StatusVariant } from "@/shared/ui/statusChip";
import { type TenantTheme } from "@/config/tenantTheme";
import { applyTenantTheme, buildMuiTheme } from "@/app/theme";
import { TENANT } from "@/config/tenant";

const NOW = new Date();

const FLEET_ROWS: ReadonlyArray<{
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

const STATUS_VARIANTS: ReadonlyArray<{ variant: StatusVariant; label: string }> = [
  { variant: "neutral", label: "Idle" },
  { variant: "active", label: "Busy" },
  { variant: "charging", label: "Charging" },
  { variant: "degraded", label: "Degraded" },
  { variant: "fault", label: "Fault" },
  { variant: "unknown", label: "Unknown" },
];

const FRESHNESS_STATES: ReadonlyArray<FreshnessState> = ["live", "stale", "unreachable", "unknown"];

const COMPONENT_PROPS: ReadonlyArray<{ readonly component: string; readonly props: string }> = [
  {
    component: "ConnectionBanner",
    props: "state · lastEventAt? · attempt? · onRetry? · className?",
  },
  { component: "DataPlate", props: "children · as? · className?" },
  { component: "EmptyState", props: "title · description? · action? · className?" },
  {
    component: "FreshnessLabel",
    props: "state · asOf · receivedAt? · compact? · className?",
  },
  { component: "PersonaToggle", props: "value · onChange · disabled? · className?" },
  { component: "SectionLabel", props: "children · className?" },
  { component: "Stat", props: "label · value · hint? · tone? · className?" },
  { component: "StatusChip", props: "variant · label · current · size? · className?" },
];

/**
 * Dev-only gallery of the `shared/ui` primitives, mounted at /dev/ui and excluded
 * from production builds by an import.meta.env.DEV guard on the route (TODO D10).
 *
 * It is a preview of the design system, not the application. It keeps its own
 * ThemeProvider and tenant switch so the two tenant themes can be compared side by
 * side without changing the tenant the rest of the console is running as.
 */
export function ComponentGallery() {
  const [tenant, setTenant] = useState<TenantTheme>("dark");
  const [filtered, setFiltered] = useState(false);
  const [persona, setPersona] = useState<Persona>("operator");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connected");
  const [reconnectAttempt, setReconnectAttempt] = useState(1);
  const theme = useMemo(() => buildMuiTheme(tenant), [tenant]);

  useEffect(() => {
    applyTenantTheme(tenant);
    return () => {
      applyTenantTheme(TENANT.theme);
    };
  }, [tenant]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          px: { xs: 2, md: 4 },
          py: 4,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mb: 4, alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "primary.main", display: "block", mb: 0.5 }}
            >
              shared/ui
            </Typography>
            <Typography variant="h1" component="h1">
              Component demo
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              ConnectionBanner · DataPlate · EmptyState · FreshnessLabel · PersonaToggle ·
              SectionLabel · Stat · StatusChip
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={tenant}
            onChange={(_, next: TenantTheme | null) => {
              if (next) setTenant(next);
            }}
            aria-label="Tenant theme"
          >
            <ToggleButton value="dark">Tenant A · dark</ToggleButton>
            <ToggleButton value="light">Tenant B · light</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack spacing={3} sx={{ maxWidth: 1200 }}>
          <Paper sx={{ overflow: "hidden" }}>
            <Box sx={{ px: 3, py: 2 }}>
              <Typography variant="h3" component="h2">
                Public props index
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Required props are unmarked; optional props carry ?. Interactive and semantic
                branches are demonstrated in the sections below.
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small" aria-label="Shared UI public props">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell>Public props</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {COMPONENT_PROPS.map(({ component, props }) => (
                    <TableRow key={component}>
                      <TableCell component="th" scope="row" sx={{ fontFamily: "var(--font-mono)" }}>
                        {component}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "var(--font-mono)", color: "text.secondary" }}>
                        {props}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>01 — StatusChip</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              StatusChip variants
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Five map to the canonical status enum; degraded maps to health severity. There is no
              seventh variant — no token exists for a state no adapter can produce.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {STATUS_VARIANTS.map(({ variant, label }) => (
                <StatusChip key={variant} variant={variant} label={label} current />
              ))}
            </Stack>

            <Typography variant="h3" component="h3" sx={{ mt: 3 }}>
              Current vs. last known
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Same variant, rendered twice. Filled and solid means current. Outline and hollow means
              the robot stopped reporting and this is the last thing it said — the caller supplies
              the wording.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap>
              <StatusChip variant="active" label="Busy" current />
              <StatusChip variant="active" label="Busy (last known)" current={false} />
            </Stack>

            <Typography variant="h3" component="h3" sx={{ mt: 3 }}>
              Sizes
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              The default medium size is for general surfaces; small is the table-density variant.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center" }}>
              <StatusChip variant="neutral" label="Medium" current size="medium" />
              <StatusChip variant="neutral" label="Small" current size="small" />
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>02 — FreshnessLabel</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              FreshnessLabel states
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Compact (table cell) beside full (detail / technician). The source time is required as
              a prop but nullable only for a registered robot that has never reported.
            </Typography>
            <Stack divider={<Divider sx={{ borderColor: "var(--line)" }} />} spacing={2}>
              {FRESHNESS_STATES.map((state) => {
                const row = FLEET_ROWS.find((sample) => sample.freshness === state);
                const asOf = row?.asOf ?? null;
                return (
                  <Stack key={state} spacing={2} direction="row" useFlexGap>
                    <Typography variant="overline" sx={{ color: "text.disabled", minWidth: 112 }}>
                      {state}
                    </Typography>
                    <FreshnessLabel state={state} asOf={asOf} compact />
                    <FreshnessLabel state={state} asOf={asOf} />
                  </Stack>
                );
              })}
            </Stack>
            <Stack spacing={2} sx={{ mt: 3 }}>
              <Typography variant="h3" component="h3">
                Timestamp branches
              </Typography>
              <Box data-testid="freshness-never-observed">
                <FreshnessLabel state="unknown" asOf={null} />
              </Box>
              <Box data-testid="freshness-received-at">
                <FreshnessLabel
                  state="live"
                  asOf="2026-08-19T09:41:01.000Z"
                  receivedAt="2026-08-19T09:41:02.000Z"
                />
              </Box>
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>03 — Stat</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              Stat tones and values
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Freshness counts only — mutually exclusive, totalling the fleet. Status distribution
              belongs in the table and its filters, not duplicated here as a second set of counts.
            </Typography>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Stat label="Live" value={44} hint="of 50" />
              <Stat label="Stale" value={4} tone="warning" />
              <Stat label="Unreachable" value={2} tone="critical" />
              <Stat label="Unknown" value={0} />
              <Stat label="String value" value="—" tone="default" />
            </Stack>
          </Paper>

          {/* ---------- PersonaToggle ---------- */}
          <Paper sx={{ p: 3 }}>
            <SectionLabel>04 — PersonaToggle</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              PersonaToggle states
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Compare the selected-state treatment here against the tenant switch above: same
              underlying MUI component, deliberately different appearance. The global theme gives{" "}
              <Box component="code" sx={{ fontFamily: "var(--font-mono)" }}>
                .Mui-selected
              </Box>{" "}
              a filled accent background — correct for the tenant switch, wrong for persona, which
              is identity rather than a primary action. This component's local <code>sx</code>{" "}
              override wins over the theme and renders a subtle outline instead.
            </Typography>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <PersonaToggle value={persona} onChange={setPersona} />
                <Typography variant="body2" color="text.secondary">
                  Selected: {persona}
                </Typography>
              </Stack>

              <Box sx={{ p: 2, border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
                {persona === "operator" ? (
                  <Typography variant="body2">
                    Operator view: summary block plus declared-capability panels only.
                  </Typography>
                ) : (
                  <Typography variant="body2">
                    Technician view: adds diagnostics and the raw payload, additive to the operator
                    content — not a second layout.
                  </Typography>
                )}
              </Box>

              <Typography variant="overline" sx={{ color: "text.disabled" }}>
                Disabled state
              </Typography>
              <PersonaToggle value="operator" onChange={() => {}} disabled />
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }} data-testid="connection-banner-gallery">
            <SectionLabel>05 — ConnectionBanner</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              ConnectionBanner states and retry
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              The live region remains mounted while connected. Reconnecting shows attempt and last
              event metadata; retry increments the visible attempt. Disconnected uses fixed
              last-known copy.
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={connectionState}
              onChange={(_, next: ConnectionState | null) => {
                if (next !== null) {
                  setConnectionState(next);
                  if (next === "reconnecting") setReconnectAttempt(1);
                }
              }}
              aria-label="Connection banner state"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="connected">Connected</ToggleButton>
              <ToggleButton value="reconnecting">Reconnecting</ToggleButton>
              <ToggleButton value="disconnected">Disconnected</ToggleButton>
            </ToggleButtonGroup>
            <ConnectionBanner
              state={connectionState}
              attempt={connectionState === "reconnecting" ? reconnectAttempt : undefined}
              lastEventAt={
                connectionState === "reconnecting" ? "2026-08-19T09:41:02.000Z" : undefined
              }
              onRetry={
                connectionState === "connected"
                  ? undefined
                  : () => {
                      setReconnectAttempt((attempt) => attempt + 1);
                    }
              }
            />
          </Paper>

          <Paper sx={{ overflow: "hidden" }}>
            <Box sx={{ px: 3, py: 2 }}>
              <SectionLabel>06 — Combined usage</SectionLabel>
              <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
                Fleet table
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Status and freshness read together. A row whose freshness is not LIVE shows its
                status chip in the last-known treatment and its battery value as an em dash, never a
                stale number presented as current.
              </Typography>
            </Box>
            <Divider sx={{ borderColor: "var(--line)" }} />
            <TableContainer>
              <Table size="small" aria-label="Fleet sample">
                <TableHead>
                  <TableRow>
                    <TableCell>Robot</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Freshness</TableCell>
                    <TableCell align="right">Battery</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {FLEET_ROWS.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ "&:hover": { bgcolor: "var(--row-hover)" } }}
                    >
                      <TableCell>
                        <Box
                          component="span"
                          sx={{
                            fontFamily: "var(--font-mono)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {row.id}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{row.vendor}</TableCell>
                      <TableCell>
                        <StatusChip
                          variant={row.statusVariant}
                          label={row.statusLabel}
                          current={row.freshness === "live"}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <FreshnessLabel state={row.freshness} asOf={row.asOf} compact />
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          component="span"
                          sx={{
                            fontFamily: "var(--font-mono)",
                            fontVariantNumeric: "tabular-nums",
                            color: row.freshness === "live" ? "text.primary" : "text.disabled",
                          }}
                        >
                          {row.battery}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ px: 3 }}>
              <DataPlate>Fleet snapshot · live · {NOW.toISOString()} · source: fleet-api</DataPlate>
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>07 — EmptyState</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1, mb: 2 }}>
              EmptyState optional content
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <Button
                size="small"
                variant={filtered ? "contained" : "outlined"}
                onClick={() => {
                  setFiltered(true);
                }}
              >
                Apply an impossible filter
              </Button>
              <Button
                size="small"
                variant={!filtered ? "contained" : "outlined"}
                onClick={() => {
                  setFiltered(false);
                }}
              >
                Clear
              </Button>
            </Stack>
            {filtered ? (
              <EmptyState
                title="No robots match these filters"
                description="Clear filters or change site."
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setFiltered(false);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                (Filters currently match all rows — nothing to show here.)
              </Typography>
            )}
            <Divider sx={{ my: 3, borderColor: "var(--line)" }} />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Box sx={{ flex: 1, border: "1px solid var(--line)", borderRadius: 1 }}>
                <EmptyState title="Title only" />
              </Box>
              <Box sx={{ flex: 1, border: "1px solid var(--line)", borderRadius: 1 }}>
                <EmptyState title="With description" description="Optional supporting copy." />
              </Box>
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>08 — DataPlate</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              DataPlate semantic elements
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              The same metadata treatment supports its default div, a page footer, or a figure
              caption. Children may contain any React content.
            </Typography>
            <Stack spacing={2}>
              <DataPlate className="gallery-data-plate-div">
                Default div · fleet snapshot · source: fleet-api
              </DataPlate>
              <DataPlate as="footer" className="gallery-data-plate-footer">
                Footer · generated at 09:41:02Z
              </DataPlate>
              <Box component="figure" sx={{ m: 0 }}>
                <DataPlate as="figcaption" className="gallery-data-plate-figcaption">
                  Figcaption · telemetry history · UTC
                </DataPlate>
              </Box>
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <SectionLabel>09 — SectionLabel</SectionLabel>
            <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
              SectionLabel composition
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              This is a visual index, never a heading. The caller supplies the real heading
              immediately after it.
            </Typography>
            <SectionLabel className="gallery-section-label">03 — Capabilities</SectionLabel>
            <Typography variant="h3" component="h3" sx={{ mt: 1 }}>
              Capabilities
            </Typography>
          </Paper>

          <Typography variant="caption" color="text.disabled">
            Tokens only · no hex · freshness never uses --accent · asOf is required · status has six
            variants, matched to what the canonical model can actually produce · PersonaToggle never
            uses a filled accent selected state.
          </Typography>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
