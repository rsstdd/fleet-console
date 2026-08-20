/**
 * The cross-origin policy: the consumer `FLEET_ALLOWED_ORIGINS` has been validated
 * against since ADR 21 and never actually had.
 *
 * ADR 21 § Implications recorded the gap in the plainest available terms — "an operator
 * setting this variable gets validation and no effect" — and left the middleware to the
 * transport ADR 8 had not built. This module is the policy half of that middleware,
 * written framework-independently for the same reason `selectIngestVendor` was: the rule
 * is testable against a header value and a method, and nothing about it needs a socket
 * (AGENTS.md § Tests, ADR 8 § Observed consequences).
 *
 * It answers ADR 21's own open question — what happens when the list is set and the
 * request carries no `Origin` at all — with the answer that ADR named as intended: such a
 * request is not cross-origin, so no policy applies to it. Same-origin browsers, the
 * simulator and `curl` all arrive that way, and refusing them would break ingest in the
 * deployment ADR 21 actually targets, where the console and the API share one origin.
 *
 * **This is not authorization** (Principle 7). `Origin` is caller-supplied and only a
 * browser is obliged to send it honestly, so the grant expressed here restrains browsers
 * and nothing else — the same limit ADR 8 § Implications states for the vendor route
 * segment. A caller that forges the header is not stopped by this file, and the thing that
 * would stop it is authentication, which is an explicit product cut.
 */

/**
 * Methods the HTTP surface answers, as a preflight response states them.
 *
 * Named here rather than derived from the router: a preflight is answered before routing,
 * so this list is a claim about the whole surface and has to be maintained with it. ADR 8
 * § Assumptions fixes that surface at one `POST` and four `GET`s.
 */
const ALLOWED_METHODS = "GET, POST, OPTIONS";

/**
 * Request headers a granted origin may send.
 *
 * `content-type` alone, because that is the one header the ingest client sets and the one
 * that makes a JSON `POST` non-simple and therefore preflighted at all. Widening this
 * widens what a granted origin can do; it is not a formatting detail.
 */
const ALLOWED_HEADERS = "content-type";

/** How long a browser may cache a preflight result, in seconds. */
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * What the policy concluded about one request's `Origin`.
 *
 * `not-granted` rather than `refused`: the request is served normally and simply carries
 * no grant, which is what makes the browser block the response. An HTTP refusal was
 * considered and deferred — see `TODO.md` **B1d**, because it would need an error kind
 * `@fleet/contracts` does not have (ADR 20) and would present as authorization the server
 * does not perform.
 */
export type OriginOutcome = "not-cross-origin" | "granted" | "not-granted";

/** One request, reduced to the two things the policy reads. */
export interface OriginRequest {
  /** The `Origin` header verbatim, or `null`/`undefined` when the request carried none. */
  readonly origin: string | null | undefined;
  /** The HTTP method, in whatever case it arrived. */
  readonly method: string;
}

/** The policy's conclusion, and the response headers that carry it. */
export interface OriginDecision {
  readonly outcome: OriginOutcome;
  /**
   * True when this is a CORS preflight — `OPTIONS` **with** an `Origin` — and the caller
   * should answer it directly instead of routing it.
   *
   * A bare `OPTIONS` with no `Origin` is not a preflight and is deliberately excluded, so
   * it falls through to the router and gets that surface's honest answer rather than a
   * synthesized success for a route that may not exist.
   */
  readonly preflight: boolean;
  /** Headers to add to the response, whatever the outcome. */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Decides whether one request's origin is granted, and with which headers.
 *
 * Matching is byte-exact against the configured list. `parseRuntimeEndpoints` already
 * rejects any entry that does not equal its own `URL.origin`, so the list holds exactly
 * the forms a browser sends and a lenient comparison here would only admit entries that
 * ADR 21 refused at startup for being unable to match.
 *
 * `Vary: Origin` is set on every outcome, including the ones that grant nothing. The
 * response body is identical across origins but the *headers* are not, and a cache keyed
 * without `Vary` would hand a granted response to an origin this policy declined.
 *
 * Coupling: `RuntimeEndpoints.allowedOrigins` in `src/config/runtimeEndpoints.ts` is the
 * only intended source of the second argument; that module's origin schema and this
 * comparison are one rule split across validation and use (ADR 21).
 */
export function evaluateOriginPolicy(
  request: OriginRequest,
  allowedOrigins: readonly string[],
): OriginDecision {
  const { origin } = request;
  const isOptions = request.method.toUpperCase() === "OPTIONS";

  // An absent header and an empty one are the same event: no origin was declared, so
  // there is no cross-origin request to have a policy about.
  if (origin === null || origin === undefined || origin === "") {
    return { outcome: "not-cross-origin", preflight: false, headers: { Vary: "Origin" } };
  }

  if (!allowedOrigins.includes(origin)) {
    return { outcome: "not-granted", preflight: isOptions, headers: { Vary: "Origin" } };
  }

  const headers: Record<string, string> = {
    Vary: "Origin",
    // The origin itself, never `*`. ADR 21 refuses `*` in configuration because ingest and
    // diagnostics are unauthenticated; echoing it here would reintroduce what that refused.
    "Access-Control-Allow-Origin": origin,
  };
  if (isOptions) {
    headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS;
    headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS;
    headers["Access-Control-Max-Age"] = String(PREFLIGHT_MAX_AGE_SECONDS);
  }
  return { outcome: "granted", preflight: isOptions, headers };
}
