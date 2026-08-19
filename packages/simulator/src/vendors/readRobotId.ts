/**
 * Reads the robot identifier out of any vendor's payload without knowing which
 * dialect it is.
 *
 * Exists for tests and diagnostics that need to answer "which robot sent this"
 * across dialects. The key disagreement it navigates — `robot_id` for vendors A
 * and C, `id` for vendor B — is itself one of the deliberate differences, so
 * this reader is the only place allowed to paper over it. Nothing in generation
 * uses it; a generator that had to ask what a payload contains would mean the
 * dialects were no longer independent.
 */

/** Returns the robot id carried by a vendor payload, or undefined if it carries none. */
export function readRobotId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record: Record<string, unknown> = { ...payload };
  const identifier = record["robot_id"] ?? record["id"];
  return typeof identifier === "string" ? identifier : undefined;
}
