import { Hono } from "hono";

import { errorResponse } from "../ingest/errorResponse.ts";
import type { FleetSnapshotWire } from "./fleetResponse.ts";
import { evaluateOriginPolicy } from "./originPolicy.ts";

/**
 * The HTTP surface: a Hono router carrying the cross-origin policy and the two
 * responses that belong to no route.
 *
 * Hono is a router and nothing else here (ADR 8 § Decision). Its validators and its typed
 * RPC client are deliberately unused, because a request body stays `unknown` until a
 * `@fleet/contracts` schema decodes it, and a second validation layer would be a second
 * decode authority (Principles 1 and 2). A reviewer seeing `hono` in `package.json` may
 * reasonably expect those features; their absence is the decision ADR 8 records.
 *
 * Separate from the listener on purpose. This module composes an app out of a
 * configuration value, which makes every claim about the surface — the origin grant, the
 * 404 shape, the fact that a thrown error reveals nothing — testable through
 * `app.request()` against a real `Request`, with no socket and no port to pick.
 */

/** What the HTTP surface needs from validated configuration to be assembled. */
export interface HttpAppOptions {
  /**
   * The decoded allow-list from `RuntimeEndpoints.allowedOrigins` (ADR 21).
   *
   * Passed in rather than read here: `process.env` is confined to `src/config/**` by lint,
   * and an app that loaded its own configuration could not be tested at two different
   * policies in one run.
   */
  readonly allowedOrigins: readonly string[];
  /**
   * Produces the current fleet snapshot.
   *
   * A function rather than the store, so the router never learns what state looks like
   * and cannot grow a state transition inside a handler (Principle 1, package spec § 12).
   * It is synchronous because reading in-memory state is (ADR 6): making it a promise
   * would invite a handler that awaits something the store cannot actually do.
   */
  readonly readFleet: () => FleetSnapshotWire;
}

/** Status for a preflight that is answered rather than routed. */
const PREFLIGHT_STATUS = 204;

/**
 * Builds the router with the cross-origin policy mounted ahead of every route.
 *
 * The policy runs first and unconditionally. Mounting it per route is how a later route
 * arrives without it — the failure **L8** exists to catch — so the one thing this function
 * guarantees is that no response leaves without having been through
 * `evaluateOriginPolicy`.
 *
 * A preflight is answered here rather than passed to the router. It is a browser mechanism
 * asking what a *subsequent* request may do, so routing it would either 404 on a path that
 * accepts `POST` but not `OPTIONS`, or require every route to carry an `OPTIONS` twin.
 *
 * Coupling: `packages/simulator` posts to `POST /api/telemetry/:vendor` and the console
 * reads `/api` through Vite's proxy; the routes those callers need are not mounted yet, so
 * both currently receive this module's 404 (`TODO.md` **D1**, **G1**–**G3**).
 */
export function createHttpApp(options: HttpAppOptions): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const decision = evaluateOriginPolicy(
      { origin: c.req.header("origin"), method: c.req.method },
      options.allowedOrigins,
    );

    if (decision.preflight) {
      return new Response(null, { status: PREFLIGHT_STATUS, headers: decision.headers });
    }

    await next();

    // After `next`, so the headers land on whatever the route produced — including the
    // 404 and 500 below, which a browser has to be able to read to report the failure.
    for (const [name, value] of Object.entries(decision.headers)) {
      c.res.headers.set(name, value);
    }
    return undefined;
  });

  // ADR 2 gives a joining console its initial picture over HTTP rather than as the
  // socket's first frame, so this is the whole cold start and the socket carries one
  // message shape for its lifetime. No raw vendor payload appears here — that is served
  // only by `GET /api/robots/:id` (ADR 1), and the snapshot type is what enforces it.
  app.get("/api/fleet", (c) => c.json(options.readFleet()));

  app.notFound((c) => {
    const { status, body } = errorResponse("not_found");
    return c.json(body, status);
  });

  app.onError((_error, c) => {
    // The error itself is deliberately not read. A message or stack from an unexpected
    // throw is the one place a raw vendor payload could reach a caller that ADR 26 never
    // intended, so the response is a constant and the exception is the caller's problem
    // only in the sense that something failed (**G6**).
    const { status, body } = errorResponse("internal");
    return c.json(body, status);
  });

  return app;
}
