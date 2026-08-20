/**
 * Violates `explicit-module-boundary-types`: an export whose return type is inferred.
 *
 * Section 7 of `docs/03_package-specs/02_ADAPTERS.md` lists this rule and nothing
 * proved it fired. An inferred boundary type is how a package's public shape changes
 * without anyone editing a signature.
 */
export function widen(value: string) {
  return { value, length: value.length };
}
