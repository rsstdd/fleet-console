// features/fleet/__boundary-violation__/legal.ts
//
// The positive half of the dependency-rule test: a feature importing the types layer
// is explicitly allowed. Without this, a disabled or inert rule would pass the
// negative assertion by producing no messages for any input at all (TODO B10).
import type { Robot } from "@/types/robot";

export type FleetRow = Pick<Robot, "id">;
