# AGENTS.md

TypeScript monorepo: a multi-vendor robot fleet telemetry console.

| Package     | Role                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| `contracts` | Canonical envelope, capability schemas, pure freshness derivation. No deps. |
| `server`    | Vendor adapters, ingest, fleet state, freshness sweep, fan-out, simulator.  |
| `web`       | React + Material UI console.                                                |

`contracts` imports nothing from the workspace. `web` never imports `server`; they
share `contracts` only. Both rules are lint-enforced in `eslint.config.js`.

## The two claims this codebase makes

1. **The console never presents a stale observation as current.** Freshness is derived
   server-side by a recurring sweep over `receivedAt`, never on arrival and never in the
   browser. It travels as a field on the envelope. While the stream is down, per-robot
   freshness is suppressed and the connection banner speaks for the whole fleet.
2. **Shared meaning is normalized; real vendor differences stay visible.** Every vendor
   maps onto one canonical core. What is not shared travels as a declared capability, and
   the UI renders from those declarations — never from a vendor branch.

## Rules

- Decode every payload at the boundary. Never cast untrusted input into a trusted type.
- Keep observed state and requested state separate. The UI never authorizes an operation.
- "Not evaluated" is not zero. Never render an unmeasured value as a measured one.
- A new vendor is a new adapter module plus a registry entry, never a contracts change.
- Comments explain what the code cannot: a non-obvious constraint, a rejected alternative,
  an external contract. Never restate the signature.
- Prefer a focused test at the cheapest boundary that can prove the behavior.
- Target WCAG 2.2 AA. Colour is never the only carrier of meaning.

## Commands

```bash
pnpm dev        # console on :5173, server and simulator alongside
pnpm check      # lint, typecheck, unit tests, build
pnpm test:e2e   # Playwright against the real stack
```
