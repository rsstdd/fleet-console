/**
 * Violates `switch-exhaustiveness-check`, the rule that makes a fourth vendor a
 * compile error in `src/registry.ts` rather than a dispatch that silently misses.
 *
 * The union is local rather than `SupportedVendor` itself: a fixture that imported
 * the real one would start passing the day a vendor is added, which is the one moment
 * this rule matters most.
 */
type Dialect = "A" | "B" | "C";

/** Dispatches over `Dialect` while omitting one of its members. */
export function describe(dialect: Dialect): string {
  switch (dialect) {
    case "A":
      return "nested";
    case "B":
      return "flat";
  }
  return "unreachable";
}
