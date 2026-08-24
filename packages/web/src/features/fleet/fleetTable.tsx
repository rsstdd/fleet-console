import type { ReactNode } from "react";
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
  styled,
} from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { StatusChip } from "@/components/statusChip";

import { selectBatteryDisplay, selectStatusPresentation } from "@/utils/robotSelectors";
import type { Robot } from "@/types/robot";
import { selectSiteLabel } from "@/utils/siteLabel";
import type { Site } from "@/types/site";

import { formatTimeUtc } from "@/utils/time";

/*
 * Styled at module scope, not `sx` in the row callback. `sx` is interpreted at
 * render: every row would allocate a fresh style object, miss Emotion's cache on
 * identity, and be re-serialized — 500 rows × 10 Hz is the measured path (ADR 24),
 * so four `sx` objects per row is four thousand serializations a second. These
 * components serialize once, at import, and every row shares the emitted class.
 */
const RobotRow = styled(TableRow)({
  "&:hover": { backgroundColor: "var(--row-hover)" },
});

/** The only activation path in the row, filling its cell (page spec §2). */
const RowLink = styled(Link)({
  display: "block",
  width: "100%",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "inherit",
  textDecoration: "none",
});

const SecondaryCell = styled(TableCell)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

/** Figures align on the decimal point; `tabular-nums` is what stops them dancing at 10 Hz. */
const NumericCell = styled(TableCell)({
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
});

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
                <RobotRow key={robot.id} hover>
                  <TableCell component="th" scope="row">
                    {/*
                      The only activation path in the row, and it fills its
                      cell (page spec §2). A row-level onClick plus this
                      nested link would fire twice on one pointer click and
                      would still leave no keyboard path, because a <tr> is
                      not focusable (Principle 6).
                    */}
                    <RowLink to={`/robots/${robot.id}`}>{robot.id}</RowLink>
                  </TableCell>
                  <SecondaryCell>{robot.vendor}</SecondaryCell>
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
                  <NumericCell align="right">{selectBatteryDisplay(robot)}</NumericCell>
                  <NumericCell align="right">{formatTimeUtc(robot.lastSeenAt)}</NumericCell>
                </RobotRow>
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
