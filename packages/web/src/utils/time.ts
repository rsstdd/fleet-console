/**
 * The console's one UTC timestamp spelling, and the two ways a surface may say it has no
 * time to show.
 *
 * One parse, two presentations. A table cell prints an em dash, because the column has a
 * shape to keep and the dash is the same "not a current value" signal battery uses
 * (utils/robotSelectors.ts). The connection banner omits the fragment instead: it is
 * stating an outage, and an em dash where a time belongs reads as a value that failed
 * rather than one that was never offered.
 */

/** No time to show, spelled the way a value surface spells absence. */
const NO_TIME = "—";

/**
 * @returns UTC `HH:MM:SSZ`, or null where there is no time — an absent value or one that
 *   does not parse. Callers that must render something use {@link formatTimeUtc}.
 */
export function formatTimeUtcOrNull(value: string | number | null): string | null {
  if (value === null) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return `${parsed.toISOString().slice(11, 19)}Z`;
}

/** As {@link formatTimeUtcOrNull}, with an em dash where it has nothing to show. */
export function formatTimeUtc(value: string | number | null): string {
  return formatTimeUtcOrNull(value) ?? NO_TIME;
}
