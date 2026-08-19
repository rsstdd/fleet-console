// Public surface of the robot feature.
//
// `RobotDetail` is retained deliberately: `features/fleet/__boundary-violation__`
// imports this name to prove the dependency rule rejects feature → feature.
// Renaming it would silently defeat that fixture.
export { RobotDetailPage } from "./robotDetailPage";

export const RobotDetail = "placeholder";
