// Public surface of the robot feature.
//
// Coupling: `features/fleet/__boundary-violation__/violation.ts` imports
// `RobotDetailPage` from here to prove the dependency rule rejects
// feature → feature. Removing or renaming this export silently defeats
// that fixture.
export { RobotDetailPage } from "./robotDetailPage";
