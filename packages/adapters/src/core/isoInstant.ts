/**
 * ISO-8601 to epoch milliseconds, without touching `Date`.
 *
 * Vendors A and C send an ISO string where the canonical envelope wants
 * `reportedAt` in epoch milliseconds, and this package may not use `Date` to
 * bridge them: `eslint.config.js` restricts the global outright, so
 * `new Date(iso).getTime()` — a pure parse, not a clock read — is banned
 * alongside `Date.now()`. That is the rule working as intended rather than a gap
 * in it. `no-restricted-globals` cannot distinguish the parsing constructor from
 * the no-argument form, and the no-argument form is exactly what ADR 3 exists to
 * keep out of an adapter, so relaxing the rule to admit one would admit both.
 * Thirty lines of arithmetic is the cheaper side of that trade.
 *
 * In `core/` because two dialects need it; vendor B sends epoch milliseconds and
 * never calls this.
 */

/**
 * A complete instant: date, time, and a zone that fixes it to a point on the
 * timeline.
 *
 * A local time with no offset is deliberately unmatched. It names a wall-clock
 * reading in an unstated zone, so turning one into an instant means assuming a
 * zone — the invented precision `AGENTS.md` § Adapter contract forbids.
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/** Days per month in a common year, January first. */
const DAYS_IN_COMMON_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Proleptic Gregorian leap rule, which is the rule ISO-8601 dates are written against. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Length of one month, so 31 April is rejected rather than rolling into May. */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_COMMON_MONTH[month - 1] ?? 0;
}

/**
 * Days since 1970-01-01 for a proleptic Gregorian date.
 *
 * Howard Hinnant's `days_from_civil`, which is exact for every year this regex
 * can match and needs no table of cumulative month lengths. The year is shifted
 * back for January and February so a leap day lands at the end of the shifted
 * year, which is what removes the leap-year special case from the day count.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Minutes east of UTC for a `Z` or `±HH:MM` designator, or null if it is out of range. */
function zoneOffsetMinutes(zone: string): number | null {
  if (zone === "Z") {
    return 0;
  }
  const hours = Number(zone.slice(1, 3));
  const minutes = Number(zone.slice(4, 6));
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return (zone.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * Converts a complete ISO-8601 instant to epoch milliseconds, or returns null.
 *
 * Null rather than a throw, and null rather than `NaN`: the caller turns it into
 * an `unmappable_value` rejection carrying the field's path, and `NaN` would
 * propagate silently into an envelope instead.
 *
 * A leap second (`:60`) is rejected. No modelled dialect emits one, and the
 * canonical model has no representation for an instant that repeats, so
 * accepting it would mean choosing a neighbouring second on the vendor's behalf.
 */
export function parseIsoInstant(value: string): number | null {
  const match = ISO_INSTANT.exec(value);
  if (match === null) {
    return null;
  }

  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    zone === undefined
  ) {
    return null;
  }

  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const numericSecond = Number(second);

  if (numericMonth < 1 || numericMonth > 12) {
    return null;
  }
  if (numericDay < 1 || numericDay > daysInMonth(numericYear, numericMonth)) {
    return null;
  }
  if (numericHour > 23 || numericMinute > 59 || numericSecond > 59) {
    return null;
  }

  const offsetMinutes = zoneOffsetMinutes(zone);
  if (offsetMinutes === null) {
    return null;
  }

  // Truncated rather than rounded: sub-millisecond precision the canonical model
  // cannot carry is dropped, and rounding up would move the instant forward.
  const milliseconds = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  const days = daysFromCivil(numericYear, numericMonth, numericDay);

  return (
    ((days * 24 + numericHour) * 60 + numericMinute - offsetMinutes) * 60_000 +
    numericSecond * 1000 +
    milliseconds
  );
}
