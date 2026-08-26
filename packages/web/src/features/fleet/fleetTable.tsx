import { Link as RouterLink } from "react-router";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { StatusChip } from "@/components/statusChip";
import {
  NO_HONEST_VALUE,
  selectBatteryDisplay,
  selectPositionDisplay,
  selectStatusPresentation,
} from "@/utils/robotSelectors";
import type { Robot } from "@/types/robot";

export interface FleetTableProps {
  readonly robots: readonly Robot[];
  readonly siteLabels: ReadonlyMap<string, string>;
  readonly isStreamConnected: boolean;
}

/** Keep the full DOM table for keyboard navigation and find-in-page. */
export function FleetTable({ robots, siteLabels, isStreamConnected }: FleetTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="Fleet">
        <TableHead>
          <TableRow>
            <TableCell>Robot</TableCell>
            <TableCell>Site</TableCell>
            <TableCell>Vendor</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Battery</TableCell>
            <TableCell>Position</TableCell>
            <TableCell>Freshness</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {robots.map((robot) => (
            <TableRow key={robot.id} hover>
              <TableCell>
                <Link component={RouterLink} to={`/robots/${robot.id}`} className="mono">
                  {robot.id}
                </Link>
              </TableCell>
              <TableCell>{siteLabels.get(robot.siteId) ?? robot.siteId}</TableCell>
              <TableCell>{robot.vendor}</TableCell>
              <TableCell>
                <StatusChip presentation={selectStatusPresentation(robot)} />
              </TableCell>
              <TableCell className="mono">
                {selectBatteryDisplay(robot, isStreamConnected)}
              </TableCell>
              <TableCell className="mono">
                {selectPositionDisplay(robot, isStreamConnected)}
              </TableCell>
              <TableCell>
                {robot.observed ? (
                  <FreshnessLabel freshness={robot.freshness} suppressed={!isStreamConnected} />
                ) : (
                  NO_HONEST_VALUE
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
