# ADR 8 — Hono on `node:http` for HTTP, `ws` for WebSocket Fan-Out

**Decision:** `packages/server` serves HTTP with Hono via `@hono/node-server` and serves WebSocket fan-out with `ws`, attached to the same Node HTTP server.
**Status:** Decided · 2026-08-19 · Not started
**Group:** Integration / transport (the implementation half of ADR 2, which chose the transports but named no library).

## Issue

ADR 2 decided that ingest is HTTP POST and fan-out is WebSocket. It did not decide what serves either. The server therefore cannot be built at all: `packages/server` today has framework-independent pieces — clock, ring buffer, delta coalescer, validated configuration, freshness sweep, current-state store, health metrics — and no process that listens.

Two facts force the decision now rather than later. Node 24 ships an HTTP server but **no WebSocket server**; the `WebSocket` global is a client only. So at least one runtime dependency is unavoidable, and the repository rule recorded in ADR 6 § Constraints — that no dependency is added without an ADR, applied to `better-sqlite3` "exactly as it would to a state-management library on the front end" — makes this document a precondition for writing the listener.

The choice also interacts with ADR 2's measurement commitment. ADR 2 names per-request HTTP overhead as the more likely first bottleneck ahead of CPU-bound validation, and commits to a harness at 50 and 500 robots that must attribute degradation to one or the other. Whatever serves HTTP puts its own per-request work inside that number.

## Assumptions

- The HTTP surface stays small: one `POST /api/telemetry/:vendor` plus `GET /api/fleet`, `GET /api/robots/:id`, `GET /api/robots/:id/history`, and `GET /api/health`. A framework is being chosen for ergonomics and correctness at that size, not for a large routing surface.
- Connected consoles number in the single digits (ADR 2 § Assumptions), so WebSocket library throughput is not a differentiator. Correctness of connection lifecycle — reconnect, slow client, orderly shutdown — is.
- Hono's per-request cost is small enough not to dominate ADR 2's ingest measurement, but it is not zero, and the harness must be able to separate it from validation cost rather than assume it away.
- The simulator already posts one JSON body per reading to `/api/telemetry/:vendor` using `globalThis.fetch` with no HTTP dependency at all. The server is free to choose differently from the client; the route shape, however, is already fixed by a working caller.

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

-

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
