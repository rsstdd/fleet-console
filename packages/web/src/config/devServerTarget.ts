/**
 * Where Vite's development proxy forwards `/api` and `/ws`.
 *
 * Read from the environment in `vite.config.ts`, which runs in Node before any browser
 * code exists. Deliberately **not** a `VITE_` variable: that prefix exists so Vite
 * substitutes a value into the bundle, and this value must never reach the bundle — the
 * console talks to its own origin in development and the proxy is what makes that true
 * (ADR 21).
 *
 * Coupling: the two keys and both defaults are `packages/server`'s, declared in
 * `packages/server/src/config/runtimeEndpoints.ts` as `ENDPOINT_ENV_KEYS` and
 * `ENDPOINT_DEFAULTS`. They are restated here rather than imported because the console
 * must not depend on the server (`eslint.config.js` bans the specifier). If they disagree
 * the dev proxy returns 502 on the first request, which is loud and immediate — see ADR 21
 * § Implications for why that is left as a documented coupling rather than a parity test.
 */

/** Environment keys naming the server this proxy forwards to; mirrors the server's `ENDPOINT_ENV_KEYS`. */
export const DEV_SERVER_ENV_KEYS = {
  host: "FLEET_SERVER_HOST",
  port: "FLEET_SERVER_PORT",
} as const;

/** Fallbacks when neither key is set; mirrors the server's `ENDPOINT_DEFAULTS`. */
export const DEV_SERVER_DEFAULTS = {
  host: "127.0.0.1",
  port: "8080",
} as const;

/**
 * Builds the proxy target origin from the environment.
 *
 * Values are used as given rather than re-validated. The server validates them and refuses
 * to start on a bad one, so a second set of rules here could only disagree with the
 * authority — and a proxy pointed at a port nothing is listening on fails visibly on the
 * first request rather than silently.
 *
 * An IPv6 literal is bracketed, because `http://::1:8080` is not a URL any client can
 * parse and the mistake is invisible until something tries to connect.
 */
export function devServerTarget(env: Readonly<Record<string, string | undefined>> = {}): string {
  const host = env[DEV_SERVER_ENV_KEYS.host] ?? DEV_SERVER_DEFAULTS.host;
  const port = env[DEV_SERVER_ENV_KEYS.port] ?? DEV_SERVER_DEFAULTS.port;
  const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${authority}:${port}`;
}
