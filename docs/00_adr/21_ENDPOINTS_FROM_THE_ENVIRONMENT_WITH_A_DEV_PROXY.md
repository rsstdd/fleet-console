# ADR 21 — The Server Reads Its Endpoint From the Environment; the Console Reaches It Through a Dev Proxy

**Decision:** `packages/server` reads host, port and allowed origins from three `FLEET_`-prefixed environment variables, validated once at startup and failing loudly with every offending key named; `packages/web` carries its endpoints in typed tenant configuration as same-origin paths and reaches the server through a Vite development proxy aimed by the same variables.
**Group:** Integration / deployment (how three processes agree on one address).
**Status:** Decided · 2026-08-19 · Implemented

## Issue

Nothing in the repository said where the server listens or where the browser should call, and three packages had already made incompatible assumptions about it.

`packages/simulator` shipped `endpoint: "http://127.0.0.1:8080"` as a default with a `FLEET_INGEST_URL` override. `packages/server` read `freshness.json` and `fleet-manifest.json` and **nothing else** — no port, no host, no origin, and no `listen` call anywhere in the package. `packages/web` had no host, no proxy in `vite.config.ts`, and no endpoints field on its tenant configuration; the console literally could not express where its server was.

Register stub **D13** recorded this as blocking the first end-to-end run, and after ADR 20 closed **D16** it became the only open stub on the path of the vertical slice the architecture audit recommends shipping first.

The choice also decides something the stub named but did not emphasise: whether a CORS policy exists at all. Two origins means a preflight path, an allow-list, and a failure mode that appears only in the deployment that has two origins.

## Assumptions

- Port and bind address vary **per machine**, not per deployment. That is what separates them from `freshness.json` and `fleet-manifest.json`, which are reviewed artifacts identical everywhere the deployment runs (ADR 14).
- The one-command start must work from a clean clone with no environment set at all. `README.md` promises it and `pnpm dev` runs three processes from one shell.
- A development proxy misconfiguration is loud. A proxy aimed at a port nothing is listening on fails on the first request with a 502, in the browser, immediately.
- Authentication remains cut. That makes the _default_ bind address a security-relevant choice rather than a convenience one, because `GET /api/robots/:id` serves raw vendor payloads (register **D18**).

## Constraints

- **`process.env` is lint-restricted to `src/config/**`** in `packages/server` (`no-restricted-properties`). The decision had to fit that boundary, which was written in anticipation of exactly this.
- **`packages/web` may not import `packages/server`** (`eslint.config.js`). Anything the two must agree on is duplicated or joined through a third artifact, never imported.
- **Tenant endpoints live in typed configuration** (`CLAUDE.md`), beside branding and flags, and no component may name a host (Principle 13).
- **A tenant profile is baked at build time** (ADR 17). Whatever the console knows about its server, it knows before it ships.
- Configuration is untrusted external input and is decoded, never coerced (Principle 2).

## Decision

**The server reads three variables; the console proxies to them in development; both sides fail closed.**

`packages/server/src/config/runtimeEndpoints.ts` decodes `FLEET_SERVER_HOST`, `FLEET_SERVER_PORT` and `FLEET_ALLOWED_ORIGINS` into a `RuntimeEndpoints` value, raising the same `ConfigValidationError` the file loaders raise so a composition root has one thing to catch. `parseRuntimeEndpoints(env)` takes the environment as an argument and `loadRuntimeEndpoints()` is the only `process.env` read in the package.

**The names are `FLEET_`-prefixed and process-scoped**, not the bare `PORT`/`HOST` the stub proposed. `pnpm dev` starts the server, the simulator and Vite from one shell, where a bare `PORT` configures whichever process reads it first; the simulator had already established the prefix with `FLEET_INGEST_URL`.

**Defaults exist, and every one of them fails closed.** `127.0.0.1` binds loopback only, so an unauthenticated ingest endpoint serving raw vendor payloads is never published on every interface by accident — `0.0.0.0` must be asked for. The empty origin list denies every cross-origin browser request. Absence means nobody expressed a preference; a _present but invalid_ value is always a startup failure, so `FLEET_SERVER_PORT=""` and an unset `FLEET_SERVER_PORT` are not the same event.

**Validation is strict and each mistake reports once.** The port is matched as decimal digits _before_ becoming a number, so `"8080abc"`, `" 8080"`, `"+8080"`, `"0x1f"` and `"8080.0"` are rejected rather than silently parsed. Port 0 is refused with its own sentence: the operating system accepts it as "any free port", and a console or simulator whose configuration names a port cannot then address the server. An origin must equal its own `URL.origin`, so `https://a.test/` is refused with the form the deployer meant — an allow-list entry that cannot compare equal to an `Origin` header is one that silently never matches. `*` is refused by name, because ingest and diagnostics are unauthenticated and `*` would grant every site on the internet read access to the fleet.

**The console keeps its endpoints in the tenant profile** as `endpoints: { apiBaseUrl, streamUrl }`, and both shipped tenants use `/api` and `/ws` — same-origin. `vite.config.ts` proxies exactly those two paths, with `ws: true` on the stream so the socket upgrades rather than being forwarded as an ordinary GET. The proxy target comes from `src/config/devServerTarget.ts`, which reads the **same two environment keys with the same defaults**.

That last point is the decision, not an implementation detail: one variable moves the server _and_ the proxy together, so in development there is nothing to keep in sync and nothing is cross-origin.

## Positions

1. **A third root `config/` file**, read and validated by the server, with the console's origin baked at build time. Rejected. It treats a per-machine value as a reviewed deployment artifact, so one developer's port becomes everyone's committed file — and the register's own note against it holds: the console's copy is still build-time, so the two can still disagree and it needs the compatibility test ADR 14 needed.
2. **Environment variables plus a Vite dev proxy, carrying option 1's validation discipline.** Chosen.
3. **The server serves the built console.** One process, one origin, CORS gone entirely. Rejected: it couples the server's lifecycle to a web build and adds a static-asset concern to ADR 8's deliberately thin transport. Worth recording that it remains the cheapest way to _eliminate_ the cross-origin case if that case ever becomes a burden, rather than merely to avoid it in development.

## Argument

The stub's own reasoning is why option 2 wins: `process.env` was already lint-restricted to `src/config/**`, which is a boundary written in anticipation of this decision, and pairing it with a schema that fails startup on a bad value gives option 1's loud failure without option 1's committed file.

Option 2's stated weakness is that development and production paths differ, so a CORS bug appears only in production. That is real and is not fully answered — but it is smaller than it looks, because the dev proxy is not a workaround for CORS. It is a faithful model of the deployment this repository actually targets: console and API behind one origin, where no request is cross-origin and no policy is exercised in either environment. The divergence appears only when someone chooses two origins, and that choice is exactly what `FLEET_ALLOWED_ORIGINS` and the absolute-URL form of `endpoints` exist to express. So the untested path is entered deliberately, by editing configuration, rather than arrived at by default.

The counter-argument to the duplicated keys and defaults is stronger and is accepted rather than dismissed: `packages/web` and `packages/simulator` each restate values `packages/server` owns, and no mechanical check compares them. ADR 14 solved the same shape with a committed file as the join and a parity test from both ends. That machinery is not proportionate here (Principle 15), because the failure is not silent: a proxy aimed at the wrong port returns 502 on the console's first request, and a simulator aimed at the wrong port logs failed ingest immediately. What each package gets instead is a test pinning **its own** copy with a comment naming the other two — so a change shows up as a named assertion in the package that made it, rather than as a mystery at run time.

## Implications

- **`packages/server` can now be started.** `loadRuntimeEndpoints()` supplies what a `listen` call needs, and server TODO **C5** is closed. What remains is the composition root itself (ADR 8, still Not started), which must call this and must not catch `ConfigValidationError` and continue.
- **`FLEET_ALLOWED_ORIGINS` is decoded but nothing enforces it yet.** The value reaches `RuntimeEndpoints.allowedOrigins`; the CORS middleware that consults it belongs to the transport ADR 8 has not built. Until then, an operator setting this variable gets validation and no effect, which is recorded here rather than left to be discovered.
- **Three packages restate one address.** `ENDPOINT_DEFAULTS` in the server, `DEV_SERVER_DEFAULTS` in the console, `DEFAULTS.endpoint` in the simulator. Each is pinned by a test naming the other two. Adding a fourth consumer is the point at which this stops being proportionate and should become ADR 14's shape.
- **`endpoints` is a required field on every tenant profile**, with no default. A console that guessed its own API address is the defect this ADR closes, so there is nothing to fall back to and a profile missing the block fails to parse.
- **The two proxy keys and the two tenant paths are one coupling.** `/api` and `/ws` appear in `vite.config.ts` and in both profiles; changing one without the other leaves the console requesting something Vite does not forward — a 404 from the dev server rather than from the API, which is a confusing place to start debugging. A test in `tenant.test.ts` pins both paths and says so.
- **No new `VITE_` variable was invented**, which is what register **D8**'s tombstone asked of this decision. `FLEET_SERVER_HOST` and `FLEET_SERVER_PORT` are read in `vite.config.ts`, which runs in Node; they must **never** become `VITE_`-prefixed, because that prefix means "substitute into the bundle" and the browser must not learn the server's real address — the proxy is what keeps the console same-origin.
- **`docs/ARCHITECTURE_AUDIT.md` § 2 is not yet closed by this.** `pnpm dev` still starts a simulator emitting into a closed port, because the server has no composition root to open one. This ADR removes the configuration blocker, not the missing process.

## Open questions

- **Should `pnpm dev` set the variables explicitly rather than relying on three defaults agreeing?** A single `.env` at the root read by all three would delete the duplication, at the cost of a file that is per-machine and therefore either gitignored — invisible to a new clone — or committed, which is option 1 again.
- ~~**What does the server do when `FLEET_ALLOWED_ORIGINS` is set and the request has no `Origin` header?**~~ **Closed 20 August 2026** with the answer this ADR named as intended: no `Origin` means no cross-origin request, so no policy applies and the request is served. `evaluateOriginPolicy` in `packages/server/src/http/originPolicy.ts` decides it, and a test drives `null`, `undefined` and `""` because a header can be absent in more than one shape.
- **Does the console need a runtime endpoint override for a demo?** Today the answer is no and the build-time profile is enough. If one is ever wanted, it is a `VITE_`-prefixed variable and it re-opens the divergence this ADR's proxy avoids.

## Observed consequences

- **20 August 2026 — the allow-list gained a consumer, and it grants rather than refuses.** `evaluateOriginPolicy` compares the `Origin` header byte-exactly against `RuntimeEndpoints.allowedOrigins`, echoes a match instead of `*`, sets `Vary: Origin` on every outcome so a cache cannot hand a grant to a different origin, and answers the preflight a JSON `POST` requires. A declined origin is served _without_ the grant rather than refused with a status: `Origin` is caller-supplied, so an HTTP refusal would present as authorization the server does not perform, and it would need an error kind `@fleet/contracts` does not define (ADR 20). That choice is flagged in `packages/server/TODO.md` **B1d** rather than settled here, because reversing it is a contracts change first. The § Implications line above — "an operator setting this variable gets validation and no effect" — holds only until the listener mounts this, which is **B1a**.
- 19 August 2026: implemented across four packages. `packages/server` gained `runtimeEndpoints.ts` (19 tests), `packages/web` gained `devServerTarget.ts` and the `endpoints` tenant field (13 new tests), `packages/simulator` gained a pin on its endpoint default (2 tests). Server 45 → 72 tests, web 163 → 176, simulator 206 → 208.
- **Verified by running it, not by unit test alone.** With a stub server on `FLEET_SERVER_PORT=9137` and Vite on 5288: a request to `http://127.0.0.1:5288/api/fleet` reached the stub with the path intact and `servedByPort: 9137`, proving one variable moved both the server and the proxy; `/ws` returned **101 Switching Protocols**, proving `ws: true` upgrades rather than forwarding a plain GET; and an unproxied path returned the app HTML, proving the proxy is scoped to the two paths the tenant profile names rather than being a catch-all. Every request in that run was same-origin, so no `Origin` header and no preflight was involved — which is the "CORS is a non-issue in development" claim, demonstrated.
- The startup failures were exercised against the real `process.env`. A clean environment yields `{"host":"127.0.0.1","port":8080,"allowedOrigins":[]}`; `FLEET_SERVER_PORT=99999` fails with `FLEET_SERVER_PORT: expected a port from 1 to 65535`; a trailing-slash origin fails naming the offending entry; and three bad keys at once report all three, so a deployer is not made to bisect their own configuration.
- **The first draft reported one mistake twice.** An empty host produced both a length complaint and a pattern complaint, `*` produced both the wildcard refusal and a URL-format complaint, and port `99999` was told about port `0`. The refinements were rewritten to be mutually exclusive and a test now asserts exactly one line per bad value — a detail invisible to a passing test suite and obvious the moment the message is read.

## Related

- **ADR 8** (Hono on `node:http`, `ws` for fan-out) — the consumer. Its composition root calls `loadRuntimeEndpoints()`, and the CORS middleware that gives `allowedOrigins` an effect is its work, not this ADR's.
- **ADR 14** (one roster, two producers, equality asserted in CI) — the pattern this ADR deliberately does _not_ follow, and § Argument says why: that failure was silent, this one is a 502.
- **ADR 17** (build-time tenant configuration) — supplies the profile the `endpoints` field joins, and the `VITE_`-prefix convention this decision was required to extend rather than duplicate.
- **ADR 2** (HTTP ingest, WebSocket fan-out) — owns the `/ws` stream the proxy upgrades and the ingest route the simulator's endpoint targets.
- **ADR 21 is what makes register D14's measurement possible**, since nothing can be measured against a running stack until three packages agree on one address.
- **Register D13** — resolved by this ADR; the stub is now a tombstone.
- **Register D18** (raw-payload retention) — the reason the default bind address is loopback rather than all interfaces.
- **Principle 13** (tenant and deployment values in typed configuration) — both halves: the server's environment schema and the console's tenant `endpoints`.
- **Principle 2** (decode at the boundary, never coerce) — the reason the port is matched as a string before it becomes a number.
