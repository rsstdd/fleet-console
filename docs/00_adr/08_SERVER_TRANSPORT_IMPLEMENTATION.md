# ADR 8 — Hono on `node:http` for HTTP, `ws` for WebSocket Fan-Out

**Decision:** `packages/server` serves HTTP with Hono via `@hono/node-server` and serves WebSocket fan-out with `ws`, attached to the same Node HTTP server.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Integration / transport (the implementation half of ADR 2, which chose the transports but named no library).

## Issue

ADR 2 decided that ingest is HTTP POST and fan-out is WebSocket. It did not decide what serves either. The server therefore cannot be built at all: `packages/server` today has framework-independent pieces — clock, ring buffer, delta coalescer, validated configuration, freshness sweep, current-state store, health metrics — and no process that listens.

Two facts force the decision now rather than later. Node 24 ships an HTTP server but **no WebSocket server**; the `WebSocket` global is a client only. So at least one runtime dependency is unavoidable, and the repository rule recorded in ADR 6 § Constraints — that no dependency is added without an ADR, applied to `better-sqlite3` "exactly as it would to a state-management library on the front end" — makes this document a precondition for writing the listener.

The choice also interacts with ADR 2's measurement commitment. ADR 2 names per-request HTTP overhead as the more likely first bottleneck ahead of CPU-bound validation, and commits to a harness at 50 and 500 robots that must attribute degradation to one or the other. Whatever serves HTTP puts its own per-request work inside that number.

## Assumptions

- The HTTP surface stays small: one `POST /api/telemetry/:vendor` plus `GET /api/fleet`, `GET /api/robots/:id`, `GET /api/robots/:id/history`, and `GET /api/health`. A framework is being chosen for ergonomics and correctness at that size, not for a large routing surface.
- Connected consoles number in the single digits (ADR 2 § Assumptions), so WebSocket library throughput is not a differentiator. Correctness of connection lifecycle — reconnect, slow client, orderly shutdown — is.
- Hono's per-request cost is small enough not to dominate ADR 2's ingest measurement, but it is not zero, and the harness must be able to separate it from validation cost rather than assume it away.
- The simulator already posts one JSON body per reading to `/api/telemetry/:vendor` using `globalThis.fetch` with no HTTP dependency at all. The server is free to choose differently from the client. ~~The route shape, however, is already fixed by a working caller.~~ **Amended 19 August 2026: that sentence was an assumption doing a decision's work, and is now stated as one — see the route subsection of the Decision below.**

## Constraints

- No dependency without an ADR. This document is that record for three: `hono`, `@hono/node-server`, and `ws`.
- ADR 2 is not reopened. HTTP POST ingest and WebSocket delta fan-out stay as decided; this ADR only names what implements them. Introducing MQTT or a broker still requires amending ADR 2.
- `packages/server` must remain thin. The README weights it explicitly: "produce dialects, inject faults, fan out deltas. No more." A framework that invites middleware stacks, plugins, and its own validation layer would work against that.
- Request bodies, route parameters, and headers stay `unknown` until a Zod schema from `@fleet/contracts` decodes them (Principle 2). Whatever framework is chosen, its own validation or type-inference features are not permitted to become a second decode authority (Principle 1).
- The WebSocket server must share a port with HTTP. Two listeners is two things to configure, document, and get wrong in the one-command local start.

## Decision

HTTP is served by Hono, mounted on Node's HTTP server through `@hono/node-server`. WebSocket fan-out is served by `ws`, attached to that same HTTP server instance via its `upgrade` event, so one port serves both.

Three runtime dependencies are added to `packages/server`: `hono`, `@hono/node-server`, and `ws` (with `@types/ws` as a devDependency). No other transport dependency is introduced.

Hono is used as a router and nothing more. Route handlers read the raw body as `unknown` and hand it to `@fleet/contracts` schemas or to the adapter registry; Hono's own validators, its typed-client generation, and its middleware ecosystem are not used. Handlers stay thin, delegating state transitions to the framework-independent functions that already exist in this package.

### Vendor identity travels in the route

**Amended 19 August 2026, ratifying register stub D9 (option 1) and closing server TODO M7.**

The server learns which adapter to dispatch to from the `:vendor` path segment of `POST /api/telemetry/:vendor`, and from nowhere else. The segment is validated against the adapter registry's key set **before any body byte is read**; a segment naming no supported vendor is a 404 with the `unsupportedVendors` health counter incremented, never a fallback adapter and never a permissive pre-parse of the body.

The alternatives were a request header and a field inside the payload. The body is rejected as circular: the body is untrusted, and the vendor is what selects the schema that would make it trustworthy, so reading identity out of it means parsing before validating — a permissive pre-parse that becomes a second decode authority (Principles 1 and 2). A header carries the same validated-before-decode property as the route and was rejected on operability: it is invisible in ordinary HTTP logs, and a proxy that drops or rewrites headers turns a routing problem into an unsupported-vendor rejection with no evidence of why. Inferring the vendor from payload _shape_ is not a fourth option; it would make adding a fourth vendor a change to the dispatch heuristics of the other three.

Selection is `selectIngestVendor` in `packages/server/src/ingest`, a pure function taking the segment and nothing else, so the ordering is a property of the signature rather than a rule a handler must remember.

## Positions

1. **`node:http` alone plus `ws`.** One dependency, zero framework overhead in ADR 2's measurement, and the closest match to the simulator's zero-dependency precedent. Rejected, though it was the leading candidate on dependency count: five routes still need method-and-path matching, path-parameter extraction, body reading with a size limit, JSON parse error handling, and consistent error shaping. That is roughly a hundred lines of hand-rolled routing whose bugs are the boring kind — a missing `Content-Length` guard, a path that matches one segment too many — and which would need their own tests to reach the standard the rest of this repository holds. Writing a router is not the part of this project worth demonstrating.
2. **Fastify with `@fastify/websocket`.** The most production-shaped option: real lifecycle hooks, structured logging, and a mature WebSocket plugin. Rejected on proportionality. It brings the largest transitive tree of the candidates and a plugin/encapsulation model that is scope this server does not have, and its schema-validation feature actively invites the second decode authority Principle 1 forbids — the temptation to validate in Fastify's JSON Schema rather than in `@fleet/contracts` is a real one, and a rule that depends on nobody being tempted is not a rule.
3. **Express with `ws`.** Rejected: the largest and slowest of the routers considered, with middleware conventions that predate the Web-standard `Request`/`Response` this codebase already uses in the simulator's `fetch` client.
4. **Hono on `@hono/node-server`, with `ws` for the socket.** Chosen.

## Argument

Hono was chosen because it is the smallest thing that removes the hand-rolled router without importing a framework's worldview. It has no transitive dependencies of its own, it routes on Web-standard `Request`/`Response` objects — the same shape the simulator's `fetch`-based ingest client already speaks, so the two halves of the ingest path are described in one vocabulary — and it is small enough that its per-request cost stays a rounding error against the validation work ADR 2 wants measured.

The decisive comparison was against position 1 rather than against the frameworks. `node:http` alone is genuinely cheaper in dependencies and marginally cleaner for the measurement, and if this server had two routes it would be the right answer. At five routes, with path parameters on three of them, the balance tips: the routing code would be real code, with real edge cases, that no reviewer of this project would learn anything from.

`ws` was chosen for the socket because Node provides no alternative and because attaching it to an existing HTTP server through the `upgrade` event is the standard, documented path — `@hono/node-server` exposes the underlying server instance precisely so this works. Fastify's WebSocket plugin would have been the tighter integration, but only inside a framework rejected on other grounds.

The cost is three dependencies where one would do, and one of them (`@hono/node-server`) exists solely to bridge a Web-standard framework onto Node's non-standard server. That adapter layer is the honest price of the choice and is named here rather than discovered later.

## Implications

**From the route amendment (19 August 2026):**

- **The route is a contract with an already-shipped client.** `ingestUrlFor` in `packages/simulator` builds it and its integration test asserts the shape. Changing the route means changing that function, the server's route, `selectIngestVendor`, and their tests in one commit (Principle 14) — which is why this was worth ratifying before the server route existed rather than after.
- **Adapter selection precedes body reading, structurally.** `selectIngestVendor(segment)` has no access to a body. When the Hono handler lands it must call the selector first and return on rejection; a handler that reads the body before selecting produces no type error, so its own test must assert the ordering against a real request. That test is the one piece of the register's required evidence still outstanding.
- **`isSupportedVendor` keeps its `unknown` parameter.** The register asked whether the server validating first meant the adapter guard could narrow to `string`. It stays `unknown`: the value arrives from a URL, and a boundary guard with a precondition is a guard that can be called wrongly. The reasoning now sits at the guard itself.
- **An unsupported vendor is a 404 with its own counter, not a 400.** "Your vendor is not integrated" and "your payload is wrong" are different operator problems counted at different scopes; `HealthMetrics.recordUnsupportedVendor` exists for the first and must not absorb the second.
- **A caller can lie about the segment, and that is accepted.** So can a header, and so can a body field. Ingest is unauthenticated in this submission; the route decides _which schema decodes the payload_, not who may send it. Authentication is a separate decision, and until it exists the honest claim is that vendor identity is a routing key rather than an assertion of provenance.
- **Vendor ids are case-sensitive on the wire.** The registry key set is `A | B | C`, so `/api/telemetry/a` is a 404. The simulator emits the canonical form; accepting a lower-case route would mean the route and the registry disagreeing about what a vendor id is.

**From the original transport decision:**

- ADR 2's measurement harness must report Hono's per-request overhead as a distinguishable component, not fold it into "HTTP overhead" as an opaque total. Otherwise the harness cannot tell the framework's cost from Node's own, and ADR 2's staged mitigation — batch ingest first, then `node:cluster` — would be chosen against a number that does not separate them.
- The WebSocket server and the HTTP server share a port and therefore a lifecycle. Orderly shutdown must close socket clients before closing the HTTP server, or in-flight frames are dropped on a listener that no longer exists.
- `@hono/node-server` must expose the raw `http.Server` for `ws` to attach to. If a future version stops doing so, the upgrade path breaks and this ADR is reopened rather than worked around.
- Hono's validators and typed RPC client are deliberately unused. A reviewer seeing `hono` in `package.json` may reasonably expect them; the absence is a decision, recorded here, not an oversight.
- The route `POST /api/telemetry/:vendor` is now fixed by two parties: the simulator already calls it, and this ADR builds the server that answers it. Changing the shape is a two-package change.
- Adding `ws` gives the server its first dependency with a non-trivial security surface. It is a WebSocket server accepting connections from browsers, so payload size limits and connection caps are runtime concerns rather than configuration niceties.

## Open questions

- **Does Hono's per-request cost show up at all in the 500-robot ingest measurement, or is it below the noise floor against Zod validation?**
  _Current lean:_ Below the noise floor. Hono's routing is a trie lookup; ADR 2's own estimate puts validation in the tens of microseconds, which should dominate.
  _Resolves on:_ ADR 2's harness running at 500 robots and 5 Hz.
- **Should the WebSocket connection cap and maximum frame size be configuration or constants?**
  _Current lean:_ Configuration, alongside the freshness policy in `config/`, since they are deployment limits rather than behaviour (Principle 13).
  _Resolves on:_ The fan-out implementation landing.

## Observed consequences

- **20 August 2026 — the router landed without the listener, and only `hono` was declared.** `createHttpApp` in `packages/server/src/http/createApp.ts` mounts the cross-origin policy ahead of every route and owns the responses no route produces. `@hono/node-server` and `ws` are deliberately still absent: ADR 29's gate rejects a declared package nothing imports, so a transport dependency cannot be added ahead of the code that uses it, and this ADR's three-dependency decision is therefore discharged one dependency at a time rather than in one install. Hono's validators and RPC client are unused as decided, and the app takes `allowedOrigins` as an argument rather than loading configuration, which is what lets `app.request()` exercise the whole surface at two different policies in one test run — no port, no socket, and no wall-clock wait.
- **20 August 2026 — a preflight is answered by the middleware, not routed.** Routing `OPTIONS` would either 404 on a path that accepts `POST` alone or force an `OPTIONS` twin onto every route. The consequence worth naming is that the preflight's method and header list is now a claim about the whole surface, maintained beside the router rather than derived from it; a route added with a method outside `GET, POST, OPTIONS` is a two-line change, and the second line is easy to miss.
- **19 August 2026 — the assumption had already shipped in two packages before it was a decision.** `ingestUrlFor` posts to the route and asserts it in an integration test; `isSupportedVendor(value: unknown)` was widened specifically to take an unvalidated route parameter, a signature that only makes sense under this option. Neither package was wrong, and that is the register's point: three artifacts agreed on a rule no document had decided, which is how a rule becomes architecture by accident rather than by choice.
- **19 August 2026 — selection landed ahead of the listener.** `selectIngestVendor` and its tests exist while Hono is still uninstalled and no route is served. The selector is framework-independent by construction, so mounting it later is a handler that calls it; the ordering guarantee does not wait on the transport.

## Related

- `ADR 2 — chose HTTP POST ingest and WebSocket delta fan-out; this ADR names what serves them, and inherits ADR 2's measurement commitment.`
- `ADR 6 — the source of the repository rule that no dependency is added without an ADR; this document discharges it for hono, @hono/node-server, and ws.`
- `ADR 3 — the freshness sweep runs on the same event loop as these handlers; sustained ingest blocking delays it, which makes transport cost a freshness-correctness concern.`
- `Principle 1 (domain rules have one authoritative implementation) — the reason Hono's own validation features are excluded rather than merely unused.`
- `Principle 2 (external contracts are decoded once) — request bodies stay unknown until a contracts schema decodes them, regardless of what the router offers.`
- `Principle 12 (performance and observability are product behaviour) — the per-request overhead this ADR adds is inside the budget ADR 2 committed to measuring.`
- `Artifact packages/server — the listener this ADR unblocks; see its TODO.md § B1.`
- `Artifact packages/simulator/src/config/simulatorConfig.ts — already constructs POST /api/telemetry/:vendor, fixing the ingest route ahead of the server.`

## Notes

- 19 August 2026: decided against `node:http` alone by a narrow margin. If the route count ever falls to two or three, or if `@hono/node-server` becomes an obstacle to the `ws` upgrade path, position 1 is the fallback and requires no other change to this design.
- **Amendment (19 August 2026, route):** ratified register stub **D9** as option 1 and closed server TODO **M7**. The stub's own recommendation was to promote this ADR's assumption rather than write a new ADR, which is why this is an amendment and no new ADR number was taken. The Assumptions bullet is struck through rather than deleted, so a reader arriving from a document that cites "ADR 8 § Assumptions" still finds it.
