import { useMemo, type ReactNode } from "react";
import { Link, Route, Routes } from "react-router";

import { AppShell } from "@/app/appShell";
import { ComponentGallery } from "@/app/dev/componentGallery";
import { FleetPage } from "@/features/fleet/fleetPage";
import { RobotDetailPage } from "@/features/robot/robotDetailPage";
import { EmptyState } from "@/shared/ui/emptyState";
import { useFleetTransport } from "@/app/useFleetTransport";
import { FleetStoreContext } from "@/entities/robot/fleetStoreContext";
import { StreamDiagnosticsContext } from "@/shared/lib/streamDiagnosticsContext";

/**
 * Route table for the console. Every route renders inside `AppShell`, so the
 * header, skip link and `#main` outlet exist on all of them including not-found.
 *
 * The gallery at /dev/ui is registered only when import.meta.env.DEV is true, so
 * it and its sample data are tree-shaken out of a production bundle (app-shell spec § 3).
 *
 * This is also where the console's one socket is owned. `app` owns transport lifecycle
 * (ADR 23), and the router is the outermost thing that renders on every route, so a
 * transport held here opens once for the session rather than once per page.
 */
export function AppRouter(): ReactNode {
  const transport = useFleetTransport();
  // Session-wide by definition: the transport and its counter live exactly as
  // long as this router, which mounts once per console session.
  const streamDiagnostics = useMemo(
    () => ({ rejectedFrames: transport.rejectedFrames }),
    [transport.rejectedFrames],
  );

  return (
    <FleetStoreContext.Provider value={transport.store}>
      <StreamDiagnosticsContext.Provider value={streamDiagnostics}>
        <Routes>
          <Route
            element={
              <AppShell
                connectionState={transport.connectionState}
                lastEventAt={transport.lastEventAt ?? undefined}
                attempt={transport.attempt}
                terminalCause={transport.terminalCause}
                onRetry={transport.retry}
              />
            }
          >
            <Route path="/" element={<FleetPage />} />
            <Route path="/robots/:id" element={<RobotDetailPage />} />
            {import.meta.env.DEV ? <Route path="/dev/ui" element={<ComponentGallery />} /> : null}
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  description="That address does not match a fleet or robot view."
                  action={<Link to="/">Return to Fleet</Link>}
                />
              }
            />
          </Route>
        </Routes>
      </StreamDiagnosticsContext.Provider>
    </FleetStoreContext.Provider>
  );
}
