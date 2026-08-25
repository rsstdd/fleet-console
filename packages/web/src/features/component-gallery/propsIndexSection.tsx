import type { ReactElement } from "react";
import {
  Box,
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

import { COMPONENT_PROPS } from "./componentPropContracts";

const MonoCell = styled(TableCell)({ fontFamily: "var(--font-mono)" });

const MonoSecondaryCell = styled(TableCell)(({ theme }) => ({
  fontFamily: "var(--font-mono)",
  color: theme.palette.text.secondary,
}));

const SECTION_SX = { minWidth: 0, overflow: "hidden" } as const;
const SECTION_HEADER_SX = { px: 3, py: 2 } as const;
const DESCRIPTION_SX = { mt: 0.5 } as const;

export function PropsIndexSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-props-index-heading" sx={SECTION_SX}>
      <Box sx={SECTION_HEADER_SX}>
        <Typography variant="h3" component="h2" id="gallery-props-index-heading">
          Public props index
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={DESCRIPTION_SX}>
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
                <MonoCell component="th" scope="row">
                  {component}
                </MonoCell>
                <MonoSecondaryCell>{props}</MonoSecondaryCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
