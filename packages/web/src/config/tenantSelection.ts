// Which tenant a build is for, and the failure when that answer is wrong.
//
// Split from `tenant.ts` so `vite.config.ts` can import it: this module reads
// nothing from `import.meta.env`, so it is safe to load in Node during the
// build, which is where the selection has to be checked. `tenant.ts` does the
// env read and holds the profiles (ADR 17).
//
// Data and one guard, no domain logic (packages/web/CLAUDE.md).

/** Every tenant this console can be built for. */
export const TENANT_IDS = ["tenant-a", "tenant-b"] as const;

/** The deployment tenants the build can select between. */
export type TenantId = (typeof TENANT_IDS)[number];

/** Thrown when a tenant profile or a build's tenant selection is invalid. */
export class TenantConfigError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid tenant configuration: ${issues.join("; ")}`);
    this.name = "TenantConfigError";
  }
}

function isTenantId(value: string): value is TenantId {
  return (TENANT_IDS as readonly string[]).includes(value);
}

/**
 * Resolves the tenant a build selected, defaulting to tenant A.
 *
 * Takes `unknown` because that is what a build environment hands over — an
 * environment value comes from outside the program and is decoded rather than
 * trusted (Principle 2).
 *
 * An unrecognized value throws rather than falling back. A typo in a deploy
 * pipeline must not quietly ship one customer's brand to another, and a silent
 * default is exactly how that happens.
 *
 * Coupling: called twice on purpose — once by `vite.config.ts` so a bad value
 * fails the build, and once by `tenant.ts` so the bundle contains a constant.
 * Dropping the first call moves the failure from a build log to a blank page.
 */
export function resolveTenantId(raw: unknown): TenantId {
  if (raw === undefined || raw === "") {
    return "tenant-a";
  }
  if (typeof raw !== "string" || !isTenantId(raw)) {
    throw new TenantConfigError([
      `VITE_TENANT: unknown tenant ${JSON.stringify(raw)}; expected one of ${TENANT_IDS.join(", ")}`,
    ]);
  }
  return raw;
}
