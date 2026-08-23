import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";

import type { RobotDetail } from "@/types/robot";

import { MONO, Section } from "./detailSection";

/** Technician only. States the absence rather than rendering an empty block. */
export function RawPayloadSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  return (
    <Section index="05" title="Raw payload">
      <Paper sx={{ p: 3 }}>
        {/*
          States the exposure rather than implying protection (ADR 26). This content is
          the vendor's own message, unredacted by decision — field-name redaction over a
          dialect nobody has catalogued removes the evidence this panel exists to show
          without reliably removing anything sensitive. The endpoint behind it has **no
          server-side access rule**, because authentication is an explicit product cut
          (README § 9), so the technician toggle is presentation and not a permission.

          This notice is a release blocker, not decoration: it is the honest statement
          that must be replaced by a real access rule before this ships anywhere a
          stranger can reach. Do not soften it to make the panel look finished.
        */}
        <Typography
          variant="body2"
          sx={{ color: "text.secondary", mb: 2 }}
          data-testid="raw-payload-exposure"
        >
          Shown exactly as the vendor sent it, with nothing removed. This view is not
          access-controlled — anyone who can reach this console can read it.
        </Typography>
        {robot.rawPayload === null ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No payload was retained for this robot.
          </Typography>
        ) : (
          <Box
            component="pre"
            tabIndex={0}
            aria-label={`Raw payload for ${robot.id}`}
            sx={{
              ...MONO,
              m: 0,
              maxHeight: "var(--scroll-block-max-height)",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "var(--text-small)",
            }}
          >
            {JSON.stringify(robot.rawPayload, null, 2)}
          </Box>
        )}
      </Paper>
    </Section>
  );
}
