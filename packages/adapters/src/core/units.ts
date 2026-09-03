/**
 * Unit conversions two or more dialects need, kept here rather than duplicated
 * per vendor because they must produce *identical* output for identical input.
 *
 * That is the test worth applying before moving anything else into this file. A
 * conversion between two units has one right answer, so two vendors disagreeing
 * about it is a defect — and D7's cross-vendor assertion, that two dialects
 * describing the same robot state produce identical canonical cores, would fail
 * for a reason that has nothing to do with either dialect.
 *
 * A *status vocabulary* is the opposite case and does not belong here even when
 * two dialects happen to agree: vendors A and C both spell their states
 * `idle`/`busy`/`charging`/`fault` today, but that is a coincidence between two
 * independent contracts, and a shared table would invite editing both when one
 * vendor changes. `packages/simulator/src/vendors/vendorA.ts` makes the same
 * argument on the producing side and keeps its serializers separate for it.
 */

/**
 * A `0..1` battery fraction as a `0..100` percentage, without IEEE-754 noise.
 *
 * `0.29 * 100` is `28.999999999999996` in binary floating point, and `0.564 * 100`
 * is `56.39999999999999` — digits no vendor sent, which would reach a technician's
 * screen. This is not a rare corner: of the 9,999 four-decimal fractions in
 * `(0, 1)`, 2,515 multiply to something other than their exact percentage, so
 * roughly one reading in four would carry noise. Rounding to four decimal places
 * of a percent removes it while staying two orders of magnitude finer than any
 * modelled dialect reports, so this discards artefacts rather than precision.
 *
 * Deliberately not rounded to a whole percent: `batteryPercentSchema` accepts
 * fractional readings precisely because rounding at the adapter would throw away
 * the difference between 96.6 and 96.61.
 *
 * Used by vendors A and C, which both report a fraction. Vendor B sends integer
 * percent already and must not call this.
 */
export function toBatteryPercent(fraction: number): number {
  return Math.round(fraction * 1_000_000) / 10_000;
}
