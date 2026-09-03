/**
 * Formats an ISO timestamp as UTC HH:MM:SSZ, matching the mono display used
 * throughout the console (fleet table, robot detail diagnostics). Returns
 * an em dash for null — a robot that has never reported has no time to
 * format, and an em dash is the same "not a current value" signal used for
 * battery elsewhere (entities/robot/selectors.ts).
 */
export function formatTimeUtc(iso: string | null): string {
  if (iso === null) {
    return "—";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return `${parsed.toISOString().slice(11, 19)}Z`;
}
