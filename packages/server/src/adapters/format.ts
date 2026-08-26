const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Requires an explicit zone: without one `Date.parse` would silently read local time. */
export function parseIsoInstant(value: string): number | null {
  if (!ISO_INSTANT.test(value)) {
    return null;
  }
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? null : instant;
}

/** Preserve fractional percentages instead of rounding to whole percent. */
export function toBatteryPercent(fraction: number): number {
  return Math.round(fraction * 1_000_000) / 10_000;
}
