import { Route, Routes } from "react-router";
import { FleetPage } from "@/features/fleet/fleetPage";
import { RobotDetailPage } from "@/features/robot/robotDetailPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<FleetPage />} />
      <Route path="/robots/:robotId" element={<RobotDetailPage />} />
    </Routes>
  );
}
