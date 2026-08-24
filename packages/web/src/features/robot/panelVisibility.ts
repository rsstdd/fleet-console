import type { PanelCapabilityName } from "@/types/robot";
import type { TenantFlags } from "@/config/tenant";

/**
 * Turns a tenant's feature flags into the capability panels this deployment
 * does not offer.
 *
 * The one place flag names meet panel names, so a component never consults a
 * flag and never mentions a tenant (Principle 13). `utils/robotSelectors` applies the
 * result; a panel renders only when the robot declared the capability **and**
 * the tenant enabled it (ADR 17).
 *
 * Deliberately not a `Record<PanelCapabilityName, keyof TenantFlags>`: not every
 * panel has a flag and not every flag is about a panel, so a total mapping would
 * be a promise this cannot keep. Adding a panel flag is one line here plus one
 * field in `config/tenant.ts`.
 */
export function selectDisabledPanels(flags: TenantFlags): readonly PanelCapabilityName[] {
  const disabled: PanelCapabilityName[] = [];
  if (!flags.lidarHealthPanel) {
    disabled.push("lidarHealth");
  }
  return disabled;
}
