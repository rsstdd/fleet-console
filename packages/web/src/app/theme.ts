import type { TenantTheme } from "@/config/tenantTheme";

/**
 * Sets the root token profile. The app calls this before rendering because an effect
 * would paint one frame with another tenant's palette.
 */
export function applyTenantTheme(mode: TenantTheme): void {
  document.documentElement.setAttribute("data-theme", mode);
}
