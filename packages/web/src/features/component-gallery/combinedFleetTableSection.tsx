import type { ReactElement } from "react";
import {
  Box,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  styled,
} from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { SectionLabel } from "@/components/sectionLabel";
import { StatusChip } from "@/components/statusChip";

import { FLEET_ROWS, GALLERY_CAPTURED_AT_ISO } from "./galleryFixtures";

const SecondaryCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

const SampleRow = styled(TableRow)({
  "&:hover": { backgroundColor: "var(--row-hover)" },
});

const NumericText = styled("span", {
  shouldForwardProp: (prop) => prop !== "isCurrent",
})<{ readonly isCurrent: boolean }>(({ theme, isCurrent }) => ({
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: isCurrent ? theme.palette.text.primary : theme.palette.text.disabled,
}));

const SECTION_SX = { minWidth: 0, overflow: "hidden" } as const;
const SECTION_HEADER_SX = { px: 3, py: 2 } as const;
const HEADING_SX = { mt: 1 } as const;
const DESCRIPTION_SX = { mt: 0.5 } as const;
const DIVIDER_SX = { borderColor: "var(--line)" } as const;
const DATA_PLATE_CONTAINER_SX = { px: 3 } as const;

export function CombinedFleetTableSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-combined-heading" sx={SECTION_SX}>
      <Box sx={SECTION_HEADER_SX}>
        <SectionLabel>06 — Combined usage</SectionLabel>
        <Typography variant="h3" component="h2" id="gallery-combined-heading" sx={HEADING_SX}>
          Fleet table
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={DESCRIPTION_SX}>
          Status and freshness read together. A row whose freshness is not LIVE shows its status
          chip in the last-known treatment and its battery value as an em dash, never a stale number
          presented as current.
        </Typography>
      </Box>
      <Divider sx={DIVIDER_SX} />
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
              <SampleRow key={row.id} hover>
                <TableCell>
                  <NumericText isCurrent>{row.id}</NumericText>
                </TableCell>
                <SecondaryCell>{row.vendor}</SecondaryCell>
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
                  <NumericText isCurrent={row.freshness === "live"}>{row.battery}</NumericText>
                </TableCell>
              </SampleRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={DATA_PLATE_CONTAINER_SX}>
        <DataPlate>Fleet snapshot · live · {GALLERY_CAPTURED_AT_ISO} · source: fleet-api</DataPlate>
      </Box>
    </Paper>
  );
}
