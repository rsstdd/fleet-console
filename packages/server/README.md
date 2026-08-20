# `@fleet/server`

The runtime authority for four things nothing else in this system can provide for itself:
the **receipt instant**, the **freshness sweep**, the **coalesced delta stream**, and the
**operational counters**.

It is deliberately thin. `packages/README.md` weights it "produce dialects, inject faults,
fan out deltas. No more." Thin is a budget rather than a licence: every rule below exists
because a shortcut past it shows up in the console as a lie about data age.

## Start it

```bash
pnpm --filter @fleet/server dev     # tsx watch src/main.ts
pnpm --filter @fleet/server start   # tsx src/main.ts
pnpm dev                            # this, the simulator and the console together
```

`node src/main.ts` does **not** work and is not a bug: `@fleet/contracts` exports source
whose internal imports carry `.js` extensions nothing emits, so Node fails with
`ERR_MODULE_NOT_FOUND` while `tsx`, `tsc`, Vitest and Vite all resolve it
([ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md)).

## Configuration

Two files and three environment variables, all decoded once at startup and all failing
loudly. A present-but-invalid value stops the process naming the offending key; an absent
one falls back only where absence genuinely means "no preference".

| Source                                    | Carries                                          | On invalid input                 |
| ----------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `config/freshness.json`                   | live/stale thresholds, sweep interval, tolerance | startup failure naming the field |
| `config/fleet-manifest.json`              | every registered robot                           | startup failure naming the field |
| `FLEET_SERVER_HOST` / `FLEET_SERVER_PORT` | where to listen (default `127.0.0.1:8080`)       | startup failure naming the key   |
| `FLEET_ALLOWED_ORIGINS`                   | browser origins permitted cross-origin           | startup failure naming the entry |

Both defaults **fail closed**. Loopback keeps an unauthenticated ingest endpoint off every
interface, and an empty origin list denies every cross-origin browser request rather than
allowing all of them ([ADR 21](../../docs/00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)).

The freshness policy is deliberately **not** defaulted. A server running rules nobody
deployed is the failure Principle 13 names, so the startup log states the policy it is
actually running.

## HTTP surface

| Route                         | Serves                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| `POST /api/telemetry/:vendor` | One reading. `204`, no body — the transition already happened.  |
| `GET /api/fleet`              | Every registered robot, observed or not, plus a flush sequence. |
| `GET /api/robots/:id`         | One robot, its diagnostics, and **the raw vendor payload**.     |
| `GET /api/health`             | Counters at three scopes, never summed.                         |
| `GET /ws`                     | Coalesced deltas; changed robots only.                          |

Anything else is the canonical `not_found` envelope. The startup record reports how many
routes are mounted, because a server answering 404 for a reason is a different state from
one answering 404 because it is broken.

### The ingest order is the contract

Selector → declared size → byte budget → `JSON.parse` → adapter → upsert. **None of it
produces a type error if reordered**, which is why each step says what it protects and the
tests assert the ordering rather than only the outcomes:

- vendor identity comes from the path segment and is validated **before any body byte is
  read**, because the body is untrusted and the vendor is what selects the schema that
  would make it trustworthy ([ADR 8](../../docs/00_adr/08_SERVER_TRANSPORT_IMPLEMENTATION.md));
- the size cap runs **before** `JSON.parse`, because a cap applied after decoding protects
  only the store, which was never the expensive part
  ([ADR 26](../../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md));
- `receivedAt` is stamped from the injected clock and passed into the adapter explicitly.
  It is never the vendor's `reportedAt`: the sweep reads receipt time and the operator's
  "last seen" reads report time, and their independence is a stated invariant
  ([ADR 3](../../docs/00_adr/03_FRESHNESS.md)).

## Failure modes, and what each one means

| Condition                    | Answer                                           | Counted as                                 |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Unknown vendor in the route  | `404 unsupported_vendor`                         | `unsupportedVendors`                       |
| Body is not JSON             | `400 malformed_payload`                          | `malformedIngest`                          |
| Body fails the vendor schema | `400`, the adapter's own issues                  | `malformedIngest`, `byAdapter[v].failures` |
| Body over 64 KiB             | `413 payload_too_large`                          | —                                          |
| Robot not in the manifest    | `404 not_found`                                  | —                                          |
| Anything unexpected          | `500 internal`, nothing derived from the request | —                                          |

"Your vendor is not integrated" and "your payload is wrong" are different operator
problems, counted at different scopes, and `malformedIngest` must never be summed with the
unknown-field tallies — their _pairing_ is the signal
([ADR 15](../../docs/00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md)).

## What it will not do

- **Derive freshness anywhere but the sweep.** One authority, one interval, one pure
  function from `@fleet/contracts`.
- **Let a raw payload out anywhere but `GET /api/robots/:id`.** The types carry the
  exclusion; a running server was checked for it in the fleet response and in a delta.
- **Add a database or a broker.** Lint blocks the common packages by name with the ADR in
  the failure message (ADR 6, ADR 2).
- **Read the wall clock outside `runtime/clock.ts`.** Enforced by lint, and it is what
  makes the sweep testable with fake timers instead of sleeps.
- **Import a vendor module.** Dispatch goes through the registry; the ban covers test files
  too, which admit `@fleet/adapters/testing` and nothing else (ADR 11).

## Measured

One `pnpm dev` run and the harness in `src/ingest/validationCost.test.ts` and
`src/freshness/sweepUnderLoad.test.ts`:

- **5.8 µs** to decode a message; **892 µs** for a whole request at 50 robots, **926 µs** at 500. Transport dominates validation ~150×, which is what ADR 2 estimated and which sends
  its staged mitigation to batch ingest rather than worker-pooled validation.
- **5,971 req/s** at concurrency 128 — about 2.4× ADR 2's design scale — with **zero late
  sweep ticks** at any level. Under saturation a delayed sweep would report stale robots as
  LIVE, so that number matters more than the throughput beside it.
- No degradation point was found, which is a statement about this machine and this offered
  load rather than about the ceiling.

## Not built

Slow-client drain protection (trigger-deferred until evidence or deployment hardening),
the history read for the proposed sparkline (blocked on an unratified history/retention
contract), and authentication—which is an explicit product cut. The unauthenticated
`GET /api/robots/:id` raw diagnostics surface remains a release risk under ADR 26.

See [`TODO.md`](./TODO.md) for the full checklist and [`AGENTS.md`](./AGENTS.md) for the
scoped rules.
