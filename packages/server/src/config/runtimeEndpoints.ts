/**
 * Validated runtime endpoint configuration: where this process listens, and which
 * browser origins are allowed to call it.
 *
 * Environment rather than a third root `config/` file (ADR 21). `freshness.json` and
 * `fleet-manifest.json` are deployment *policy* — deliberate, reviewed, and identical on
 * every machine running that deployment. A port and a bind address are the opposite: they
 * vary per machine and per developer, and committing them would make one person's local
 * choice everyone's shipped artifact.
 *
 * Principle 13 puts deployment values in typed, validated configuration and Principle 2
 * treats them as untrusted input, so the decoding is here, once, and every consumer takes
 * the decoded type. `no-restricted-properties` in `eslint.config.js` confines `process.env`
 * to `src/config/**` precisely so this stays the only door.
 *
 * Coupling: `packages/web/src/config/devServerTarget.ts` reads the same two keys with the
 * same defaults to aim its dev proxy, and `packages/simulator`'s `DEFAULTS.endpoint`
 * describes the same address. All three are named on each other; see ADR 21 § Implications
 * for why that duplication is documented rather than mechanically enforced.
 */

import { z } from "zod";

import { ConfigValidationError } from "./freshnessPolicy.ts";

/**
 * Environment keys read at startup.
 *
 * `FLEET_`-prefixed and process-scoped rather than a bare `PORT`/`HOST`, because
 * `pnpm dev` starts the server, the simulator and Vite from one shell, and a bare
 * `PORT` there configures whichever process reads it first. The simulator already
 * established the prefix with `FLEET_INGEST_URL` (ADR 21).
 */
export const ENDPOINT_ENV_KEYS = {
  host: "FLEET_SERVER_HOST",
  port: "FLEET_SERVER_PORT",
  allowedOrigins: "FLEET_ALLOWED_ORIGINS",
} as const;

/** Lowest port accepted. Zero is excluded deliberately — see `portSchema`. */
const MIN_PORT = 1;

/** Highest port accepted. */
const MAX_PORT = 65_535;

/**
 * Values used when a key is absent from the environment.
 *
 * Every default fails closed. `127.0.0.1` binds loopback only, so an unauthenticated
 * ingest endpoint is not published on every interface by accident — which matters while
 * authentication is an explicit product cut and `GET /api/robots/:id` serves raw vendor
 * payloads (register **D18**). The empty origin list denies every cross-origin browser
 * request, so CORS has to be granted deliberately rather than inherited.
 *
 * Unlike `ADR3_BASELINE_FRESHNESS_POLICY`, these *are* defaults and are applied. A missing
 * freshness policy would mean running rules nobody chose; a missing port means only that
 * nobody had a preference, and refusing to start would break the one-command demo the
 * README promises.
 */
export const ENDPOINT_DEFAULTS = {
  host: "127.0.0.1",
  port: 8080,
} as const;

/**
 * A TCP port as it arrives from the environment: decimal digits, then a range check.
 *
 * Matched as a string first rather than coerced, so `"8080abc"`, `"0x1f"`, `"8080.0"`,
 * `" 8080"` and `"+8080"` are rejected instead of silently becoming a number (Principle 2).
 *
 * Port 0 is rejected although the operating system accepts it as "any free port": a server
 * on a port nobody can predict cannot be reached by a console or a simulator whose own
 * configuration names one, so it turns a startup success into a connection failure later.
 */
const portSchema = z
  .string()
  .regex(/^\d+$/, { error: "expected a decimal integer with no sign, spaces or radix prefix" })
  .transform((raw) => Number.parseInt(raw, 10))
  // The two refinements are written to be mutually exclusive so a deployer is told one
  // thing about one value. `0` is legal to the operating system and wrong for us, which
  // deserves its own sentence rather than being folded into a range.
  .refine((port) => port !== 0, {
    error:
      "port 0 asks the operating system for any free port; a console or simulator whose own configuration names a port cannot then address this server",
  })
  .refine((port) => port === 0 || (port >= MIN_PORT && port <= MAX_PORT), {
    error: `expected a port from ${String(MIN_PORT)} to ${String(MAX_PORT)}`,
  });

/** A bind address: any non-empty run of non-whitespace, covering hostnames, IPv4, IPv6 and `0.0.0.0`. */
// One rule, not a `.min(1)` and a pattern: an empty string fails `^\S+$` already, and two
// refinements would report one mistake twice.
const hostSchema = z
  .string()
  .regex(/^\S+$/, { error: "expected a non-empty hostname or IP address with no whitespace" });

/**
 * One allowed browser origin, in the exact form a browser sends in the `Origin` header:
 * scheme, host and optional port, with no trailing slash, path, query or fragment.
 *
 * Compared against `URL.origin` rather than pattern-matched, so `https://a.test/`,
 * `https://a.test/app` and `HTTPS://A.TEST` are each rejected with the normalized form the
 * deployer probably meant. An origin that does not compare byte-for-byte against the header
 * is an allow-list entry that silently never matches.
 */
const originSchema = z
  .string()
  .refine((raw) => raw !== "*", {
    error:
      "wildcard origins are not accepted; ingest and diagnostics are unauthenticated, so `*` grants every site on the internet read access to the fleet",
  })
  // Guarded on `*` so a wildcard reports only the sentence that explains why it is
  // refused, rather than that plus a format complaint about a value nobody meant as a URL.
  .refine(
    (raw) => {
      if (raw === "*") return true;
      try {
        return new URL(raw).origin === raw;
      } catch {
        return false;
      }
    },
    {
      error:
        "expected a bare origin such as https://console.example.com — no trailing slash, path, query or fragment",
    },
  );

/** Where the server listens and which browser origins it answers. */
export interface RuntimeEndpoints {
  /** Bind address. Loopback by default; `0.0.0.0` must be asked for. */
  readonly host: string;
  /** TCP port to listen on. */
  readonly port: number;
  /**
   * Browser origins permitted to make cross-origin requests, in declaration order.
   *
   * Empty means no cross-origin request is allowed — the correct state when the console
   * reaches the server through Vite's dev proxy or is served from the same origin in
   * production, because then no request is cross-origin at all (ADR 21).
   */
  readonly allowedOrigins: readonly string[];
}

/** Splits the comma-separated origin list, dropping surrounding whitespace and empty entries. */
function splitOrigins(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * Decodes one optional environment value, returning the fallback when the key is absent.
 *
 * An absent key and a present-but-invalid key are different events and are treated
 * differently: absence means nobody expressed a preference, while `FLEET_SERVER_PORT=""`
 * means someone tried and got it wrong. Only the second is a startup failure.
 */
function decodeOptional<T>(
  schema: z.ZodType<T, string>,
  key: string,
  raw: string | undefined,
  fallback: T,
  issues: string[],
): T {
  if (raw === undefined) {
    return fallback;
  }
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    issues.push(`${key}: ${issue.message}`);
  }
  return fallback;
}

/**
 * Decodes runtime endpoint configuration from an environment-shaped record, or fails
 * loudly with every offending key named.
 *
 * Takes the environment as an argument rather than reading `process.env` itself, so the
 * validation rules are testable without mutating global state; `loadRuntimeEndpoints` is
 * the thin reader that supplies the real one.
 *
 * Every invalid key is reported, not just the first. A deployer fixing a port only to be
 * told about an origin on the next attempt is being made to bisect their own configuration.
 */
export function parseRuntimeEndpoints(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeEndpoints {
  const issues: string[] = [];

  const host = decodeOptional(
    hostSchema,
    ENDPOINT_ENV_KEYS.host,
    env[ENDPOINT_ENV_KEYS.host],
    ENDPOINT_DEFAULTS.host,
    issues,
  );
  const port = decodeOptional(
    portSchema,
    ENDPOINT_ENV_KEYS.port,
    env[ENDPOINT_ENV_KEYS.port],
    ENDPOINT_DEFAULTS.port,
    issues,
  );

  // An empty or whitespace-only list is the deliberate way to say "no cross-origin
  // caller", so unlike host and port it is accepted rather than reported.
  const rawOrigins = env[ENDPOINT_ENV_KEYS.allowedOrigins];
  const allowedOrigins: string[] = [];
  for (const entry of rawOrigins === undefined ? [] : splitOrigins(rawOrigins)) {
    const result = originSchema.safeParse(entry);
    if (result.success) {
      allowedOrigins.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        issues.push(`${ENDPOINT_ENV_KEYS.allowedOrigins}[${entry}]: ${issue.message}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError("environment", issues);
  }

  return { host, port, allowedOrigins };
}

/**
 * Reads and validates the endpoint configuration from the real environment.
 *
 * The only `process.env` read in this package. Deliberately separate from
 * `loadServerConfiguration`: that one decodes committed deployment policy from files, this
 * one decodes per-machine values from the environment, and folding them together would
 * make one `ConfigValidationError` name two unrelated sources (ADR 21).
 */
export function loadRuntimeEndpoints(): RuntimeEndpoints {
  return parseRuntimeEndpoints(process.env);
}
