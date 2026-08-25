import { createContext } from "react";

import { TENANT, type TenantConfig } from "@/config/tenant";

export const TenantConfigContext = createContext<TenantConfig>(TENANT);
