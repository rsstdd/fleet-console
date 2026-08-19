import type { ReactNode } from "react";
import { Link, Route, Routes } from "react-router";

import { AppShell } from "@/app/appShell";
import { ComponentGallery } from "@/app/dev/componentGallery";
import { FleetPage } from "@/features/fleet/fleetPage";
import { RobotDetailPage } from "@/features/robot/robotDetailPage";
import { EmptyState } from "@/shared/ui/emptyState";

/**
 * Route table for the console. Every route renders inside `AppShell`, so the
 * header, skip link and `#main` outlet exist on all of them including not-found.
 *
 * The gallery at /dev/ui is registered only when import.meta.env.DEV is true, so
 * it and its sample data are tree-shaken out of a production bundle (TODO D10).
 */
export function AppRouter(): ReactNode {
  return (
    <Routes>
      <Route element={<AppShell />}>
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
  );
}
