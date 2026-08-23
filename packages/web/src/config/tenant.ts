// Tenant identity, branding and feature flags for one deployment.
//
// Data plus one validation step, no domain logic (packages/web/CLAUDE.md).
//
// 01_APP_SHELL.md section 2 requires the wordmark to come from here so that no
// brand string is hardcoded in the shell, and requires theme, wordmark and
// flags to move together so a tenant switch changes all three at once.
//
// PRINCIPLES.md 13 calls for parsed, validated configuration rather than a bare
// module literal. ADR 17 decides how: the profiles stay literals, one is
// selected at build time, and the selected one is validated here at module
// load. There is no runtime loader and no fallback — an invalid profile fails
// the build rather than shipping a console with a half-applied brand.
import { z } from "zod";

import { TENANT_THEMES } from "./tenantTheme";
import { TENANT_IDS, TenantConfigError, resolveTenantId, type TenantId } from "./tenantSelection";

export { TENANT_IDS, TenantConfigError, resolveTenantId, type TenantId } from "./tenantSelection";

/**
 * Per-tenant feature switches.
 *
 * Named for what they turn off, never for the tenant that turns it off: a flag
 * called `tenantB…` would put a tenant conditional in configuration, which is
 * the same defect as putting one in a component (Principle 13).
 *
 * Strict, so a renamed flag fails the build instead of silently reading as
 * absent, and required rather than optional, so a flag nobody deployed is never
 * invented by a default.
 */
const tenantFlagsSchema = z.strictObject({
  /**
   * Whether robot detail offers the lidar-health capability panel.
   *
   * Coupling: consumed by `features/robot/panelVisibility.ts`, which turns it
   * into the panel list `utils/robotSelectors` filters against. A robot must declare
   * the capability **and** the tenant must enable it (ADR 17).
   */
  lidarHealthPanel: z.boolean(),
});

/** Feature switches for one deployment tenant. */
export type TenantFlags = z.infer<typeof tenantFlagsSchema>;

/**
 * A same-origin root-relative path, or an absolute URL to another origin.
 *
 * Both forms are legal because both deployments are (ADR 21). `/api` means "wherever this
 * page came from", which is what the Vite dev proxy serves and what a production
 * deployment putting the console and the API behind one origin serves; an absolute URL is
 * the cross-origin deployment, and choosing it is what turns CORS from a non-issue into a
 * path the server's `FLEET_ALLOWED_ORIGINS` must name and a test must cover.
 *
 * A protocol-relative `//host/path` is rejected: it looks root-relative and is not, which
 * is the one mistake here that would silently leave the origin up to the page.
 */
const endpointUrlSchema = z
  .string()
  .min(1)
  .refine((raw) => !raw.startsWith("//"), {
    error: "protocol-relative URLs are ambiguous; use a root-relative path or an absolute URL",
  })
  .refine(
    (raw) => {
      if (raw.startsWith("/")) return true;
      try {
        return ["http:", "https:", "ws:", "wss:"].includes(new URL(raw).protocol);
      } catch {
        return false;
      }
    },
    {
      error: "expected a root-relative path such as /api, or an absolute http(s)/ws(s) URL",
    },
  );

/**
 * Where this deployment's console reaches its server.
 *
 * In typed tenant configuration because `CLAUDE.md` puts tenant endpoints there beside
 * branding and flags, and because a component must never name a host. Baked at build time
 * like the rest of the profile (ADR 17), which is why the development story is a proxy
 * rather than a second value: with `/api` and `/ws` the console talks to its own origin and
 * there is nothing to keep in sync (ADR 21).
 *
 * Coupling: `vite.config.ts` proxies exactly these two paths to the server named by
 * `src/config/devServerTarget.ts`. Changing a path here without changing the proxy key
 * leaves the console requesting something Vite does not forward.
 */
const tenantEndpointsSchema = z.strictObject({
  /** Base for HTTP calls; the fleet, health and robot-detail routes hang off it. */
  apiBaseUrl: endpointUrlSchema,
  /** The WebSocket delta stream (ADR 2). */
  streamUrl: endpointUrlSchema,
});

/** HTTP and WebSocket endpoints for one deployment tenant. */
export type TenantEndpoints = z.infer<typeof tenantEndpointsSchema>;

const tenantConfigSchema = z.strictObject({
  id: z.enum(TENANT_IDS),
  /** Shown in the app shell. Never a hardcoded string in a component. */
  wordmark: z.string().min(1).max(48),
  /** Selects the palette in `tenantTheme.ts`; the two share one declaration. */
  theme: z.enum(TENANT_THEMES),
  endpoints: tenantEndpointsSchema,
  flags: tenantFlagsSchema,
});

/** Identity, branding, theme, endpoints and feature flags for one deployment tenant. */
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/**
 * Decodes a tenant profile, throwing with the offending fields named.
 *
 * Exported so the profiles below and any future source of one go through the
 * same door, and so the rejection cases are testable without a build.
 */
export function parseTenantConfig(input: unknown): TenantConfig {
  const result = tenantConfigSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  throw new TenantConfigError(
    result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  );
}

/**
 * The profiles this console ships with.
 *
 * Two, because ADR 5 fixed exactly two for this build: A dark, B light. They
 * differ in wordmark, theme **and** flags together — a profile differing in
 * only one of the three would stop demonstrating white-label deployment, which
 * is the whole reason the second profile exists.
 *
 * Their `endpoints` deliberately do **not** differ. Both are same-origin, because that is
 * the deployment this repository actually runs; a second origin here would be an untested
 * claim about CORS rather than a demonstration of anything (ADR 21).
 */
export const TENANT_PROFILES: Readonly<Record<TenantId, TenantConfig>> = {
  "tenant-a": parseTenantConfig({
    id: "tenant-a",
    wordmark: "Fleet Console",
    theme: "dark",
    endpoints: { apiBaseUrl: "/api", streamUrl: "/ws" },
    flags: { lidarHealthPanel: true },
  }),
  "tenant-b": parseTenantConfig({
    id: "tenant-b",
    wordmark: "Northwind Robotics",
    theme: "light",
    endpoints: { apiBaseUrl: "/api", streamUrl: "/ws" },
    flags: { lidarHealthPanel: false },
  }),
};

/**
 * The tenant this build serves, validated at module load.
 *
 * `import.meta.env.VITE_TENANT` is replaced by Vite at build time, so this is a
 * constant in the shipped bundle rather than a runtime lookup: one deployment
 * tenant per build, with no runtime failure path to test or monitor (ADR 17).
 */
export const TENANT: TenantConfig = TENANT_PROFILES[resolveTenantId(import.meta.env.VITE_TENANT)];
