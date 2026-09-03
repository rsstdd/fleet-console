import { createContext } from "react";

import { TENANT, type TenantConfig } from "@/config/tenant";

/** Stable deployment configuration shared by all routes beneath the app shell. */
export const TenantConfigContext = createContext<TenantConfig>(TENANT);
