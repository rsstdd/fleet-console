import type { ReactNode } from "react";
import {
  Box,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { SectionLabel } from "@/components/sectionLabel";
import { Stat } from "@/components/stat";
import { StatusChip } from "@/components/statusChip";

import {
  COMPONENT_PROPS,
  FLEET_ROWS,
  FRESHNESS_STATES,
  NOW,
  STATUS_VARIANTS,
} from "./galleryFixtures";

/** The gallery's opening reference table: each primitive's public props at a glance. */
export function PropsIndexSection(): ReactNode {
  return (
    <Paper sx={{ overflow: "hidden" }}>
      <Box sx={{ px: 3, py: 2 }}>
        <Typography variant="h3" component="h2">
          Public props index
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Required props are unmarked; optional props carry ?. Interactive and semantic branches are
          demonstrated in the sections below.
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
  );
}

/** Section 01: every status variant, the current vs. last-known treatments, and both sizes. */
export function StatusChipSection(): ReactNode {
  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>01 — StatusChip</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        StatusChip variants
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Five map to the canonical status enum; degraded maps to health severity. There is no seventh
        variant — no token exists for a state no adapter can produce.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {STATUS_VARIANTS.map(({ variant, label }) => (
          <StatusChip key={variant} variant={variant} label={label} isCurrent />
        ))}
      </Stack>

      <Typography variant="h3" component="h3" sx={{ mt: 3 }}>
        Current vs. last known
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Same variant, rendered twice. Filled and solid means current. Outline and hollow means the
        robot stopped reporting and this is the last thing it said — the caller supplies the
        wording.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap>
        <StatusChip variant="active" label="Busy" isCurrent />
        <StatusChip variant="active" label="Busy (last known)" isCurrent={false} />
      </Stack>

      <Typography variant="h3" component="h3" sx={{ mt: 3 }}>
        Sizes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        The default medium size is for general surfaces; small is the table-density variant.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center" }}>
        <StatusChip variant="neutral" label="Medium" isCurrent size="medium" />
        <StatusChip variant="neutral" label="Small" isCurrent size="small" />
      </Stack>
    </Paper>
  );
}

/** Section 02: each freshness state compact beside full, plus the nullable-timestamp branches. */
export function FreshnessLabelSection(): ReactNode {
  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>02 — FreshnessLabel</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        FreshnessLabel states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Compact (table cell) beside full (detail / technician). The source time is required as a
        prop but nullable only for a registered robot that has never reported.
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
              <FreshnessLabel state={state} asOf={asOf} isCompact />
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
  );
}

/** Section 03: the fleet-level freshness counters in every tone, with number and string values. */
export function StatSection(): ReactNode {
  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>03 — Stat</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        Stat tones and values
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Freshness counts only — mutually exclusive, totalling the fleet. Status distribution belongs
        in the table and its filters, not duplicated here as a second set of counts.
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Stat label="Live" value={44} hint="of 50" />
        <Stat label="Stale" value={4} tone="warning" />
        <Stat label="Unreachable" value={2} tone="critical" />
        <Stat label="Unknown" value={0} />
        <Stat label="String value" value="—" tone="default" />
      </Stack>
    </Paper>
  );
}

/** Section 06: status, freshness, and battery read together in one sample fleet table. */
export function CombinedFleetTableSection(): ReactNode {
  return (
    <Paper sx={{ overflow: "hidden" }}>
      <Box sx={{ px: 3, py: 2 }}>
        <SectionLabel>06 — Combined usage</SectionLabel>
        <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
          Fleet table
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Status and freshness read together. A row whose freshness is not LIVE shows its status
          chip in the last-known treatment and its battery value as an em dash, never a stale number
          presented as current.
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
              <TableRow key={row.id} hover sx={{ "&:hover": { bgcolor: "var(--row-hover)" } }}>
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
                    isCurrent={row.freshness === "live"}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <FreshnessLabel state={row.freshness} asOf={row.asOf} isCompact />
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
  );
}

/** Section 08: the same metadata treatment as div, footer, and figcaption. */
export function DataPlateSection(): ReactNode {
  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>08 — DataPlate</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        DataPlate semantic elements
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        The same metadata treatment supports its default div, a page footer, or a figure caption.
        Children may contain any React content.
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
  );
}

/** Section 09: the label as a visual index beside the real heading it introduces. */
export function SectionLabelSection(): ReactNode {
  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>09 — SectionLabel</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        SectionLabel composition
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        This is a visual index, never a heading. The caller supplies the real heading immediately
        after it.
      </Typography>
      <SectionLabel className="gallery-section-label">03 — Capabilities</SectionLabel>
      <Typography variant="h3" component="h3" sx={{ mt: 1 }}>
        Capabilities
      </Typography>
    </Paper>
  );
}
