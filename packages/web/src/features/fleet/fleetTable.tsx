import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { StatusChip } from "@/components/statusChip";

import { selectBatteryDisplay, selectStatusPresentation } from "@/utils/robotSelectors";
import type { Robot } from "@/types/robot";
import { selectSiteLabel } from "@/utils/siteLabel";
import type { Site } from "@/types/site";

import { formatTimeUtc } from "@/utils/time";

// Module constant, not an inline literal: a fresh object per row per render on
// the 500-row × 10 Hz measured path would defeat row memoization (ADR 24).
const ROW_LINK_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "inherit",
  textDecoration: "none",
};

/**
 * The fleet table plus its provenance plate, rendering exactly the rows it is
 * given — filtering stays with the page that owns the filter state.
 */
export function FleetTable({
  robots,
  sites,
  isStreamConnected,
  capturedAt,
  latestFrameAt,
}: {
  readonly robots: readonly Robot[];
  readonly sites: readonly Site[];
  readonly isStreamConnected: boolean;
  readonly capturedAt: number;
  readonly latestFrameAt: number | null;
}): ReactNode {
  return (
    <Paper sx={{ overflow: "hidden" }}>
      {/*
        Sticky header per page spec §4 and DESIGN_SYSTEM §5. The header can only stick
        inside a bounded scroll container, so the height is a constraint rather than a
        look: short enough that this container scrolls before the document does — which
        is what keeps the header on screen — and tall enough that the table is still the
        page. 70vh leaves room for the shell header, the connection banner, the summary
        strip and the filter bar above it. Nothing measures the number; it is an
        unresolved design choice, and moving it is a layout decision, not a tweak.
      */}
      <TableContainer sx={{ maxHeight: "70vh" }}>
        <Table size="small" stickyHeader aria-label="Fleet">
          <TableHead>
            <TableRow>
              <TableCell>Robot id</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Reporting status</TableCell>
              <TableCell>Site</TableCell>
              <TableCell align="right">Battery</TableCell>
              <TableCell align="right">Last seen</TableCell>
            </TableRow>
          </TableHead>
          {/*
            No aria-live wrapper here, per page spec §9: an aggressive
            live region on every row would announce every delta as it
            arrives. Freshness changes are visible, not announced.
          */}
          <TableBody>
            {robots.map((robot) => {
              const presentation = selectStatusPresentation(robot);
              return (
                <TableRow key={robot.id} hover sx={{ "&:hover": { bgcolor: "var(--row-hover)" } }}>
                  <TableCell component="th" scope="row">
                    {/*
                      The only activation path in the row, and it fills its
                      cell (page spec §2). A row-level onClick plus this
                      nested link would fire twice on one pointer click and
                      would still leave no keyboard path, because a <tr> is
                      not focusable (Principle 6).
                    */}
                    <Link to={`/robots/${robot.id}`} style={ROW_LINK_STYLE}>
                      {robot.id}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{robot.vendor}</TableCell>
                  <TableCell>
                    <StatusChip
                      variant={presentation.variant}
                      label={presentation.label}
                      isCurrent={presentation.isCurrent}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {/*
                      Suppressed, not substituted. While the stream is down the cell is
                      empty and the shell's banner carries the connection-level state
                      (fleet spec § 8, ADR 3). A per-robot "unreachable" here would
                      blame every machine for the console's own dead socket.
                    */}
                    {isStreamConnected ? (
                      <FreshnessLabel state={robot.freshness} asOf={robot.lastSeenAt} isCompact />
                    ) : null}
                  </TableCell>
                  <TableCell>{selectSiteLabel(robot.siteId, sites)}</TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {selectBatteryDisplay(robot)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatTimeUtc(robot.lastSeenAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ px: 3, py: 2 }}>
        {/*
          Decoded provenance, never invented: the capture instant the server
          stamped on the snapshot, and the send instant of the last applied
          stream frame (Principle 4, ADR 34). A client clock here would stamp
          render time, which moves while the data does not.
        */}
        <DataPlate>
          Fleet snapshot captured {formatTimeUtc(capturedAt)} · latest stream frame{" "}
          {latestFrameAt === null ? "none yet" : formatTimeUtc(latestFrameAt)}
        </DataPlate>
      </Box>
    </Paper>
  );
}
