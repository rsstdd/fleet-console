export interface Endpoints {
  readonly snapshotUrl: string;
  readonly streamUrl: string;
  readonly robotUrl: (robotId: string) => string;
}

export function readEndpoints(
  env: Record<string, string | undefined> = import.meta.env,
): Endpoints {
  const base = (env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  const streamBase =
    env.VITE_STREAM_URL ??
    (base === ""
      ? `${globalThis.location.protocol === "https:" ? "wss" : "ws"}://${globalThis.location.host}/ws`
      : `${base.replace(/^http/, "ws")}/ws`);

  return {
    snapshotUrl: `${base}/api/fleet`,
    streamUrl: streamBase,
    robotUrl: (robotId) => `${base}/api/robots/${encodeURIComponent(robotId)}`,
  };
}

export interface TenantConfig {
  readonly name: string;
}

export function readTenantConfig(
  env: Record<string, string | undefined> = import.meta.env,
): TenantConfig {
  return { name: env.VITE_TENANT_NAME ?? "Fleet Console" };
}
