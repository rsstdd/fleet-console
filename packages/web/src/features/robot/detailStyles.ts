/**
 * Monospace tabular styling shared by the identity heading, field values, and
 * the raw-payload block. Its own module rather than an export of
 * `detailSection.tsx`: a non-component export there invalidates Fast Refresh
 * for every section that imports the file.
 */
export const MONO = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
} as const;
