# canonical-fleet page specifications

Status: implementation-ready page contract index
Stack: React · TypeScript · Vite · MUI · design-token layer
Primary deliverable: `/packages/web`

## 1. Purpose

Each route has one owning specification. Page specs define product intent, locked decisions, hierarchy, layout, data dependencies, component composition, accessibility, failure behaviour, and verification. Component API, token values, and domain rules live in their own documents; pages only compose and constrain them.

## 2. Ownership

| Route                        | Owning specification    | Feature ownership        |
| ---------------------------- | ----------------------- | ------------------------ |
| App shell (all routes)       | `01_APP_SHELL.md`       | `web/src/app`            |
| `/` (Fleet)                  | `02_FLEET.md`           | `web/src/features/fleet` |
| `/robots/:id` (Robot detail) | `03_ROBOT_DETAIL.md`    | `web/src/features/robot` |

Document numbers match filenames. Earlier revisions titled each spec one lower than its filename, so "§ 01" meant two different documents depending on which you opened.

The optional map route has no page spec and no contract until it is scheduled.

## 3. Normative hierarchy

- `PRINCIPLES.md` and `/docs/00_adr` own product and architectural rules.
- Design tokens and `02_component-specs` own primitive appearance and API.
- Entity layer owns domain models, selectors, and freshness derivation (Principle 1).
- Page specs own route-level composition, information architecture, and UX invariants.

Conflict rule: contradictory text is corrected in the same change. Do not implement against an unresolved contradiction.

## 4. Shared page conventions

- Freshness is visible wherever operational state is shown (Principle 4).
- Status never relies on colour alone; use `StatusChip` with a text label (Principle 6).
- Presentational primitives come from `/shared/ui`; features do not redefine their look (Principle 9).
- No feature imports another feature (Principle 9).
- The tenant accent is identity and primary action only; never status. The token is `--accent` (Principle 8).
- Connection integrity is visible in the shell when the stream is not healthy (Principle 5).
- Tenant theming and feature flags come from `/config`; pages read config and do not hard-code tenant branches beyond flag checks (Principle 13).
- Every route defines its complete user-visible asynchronous state set before implementation — initial load, background refresh, empty, partial, stale, offline, recoverable error, terminal error. Omission is allowed; silent omission is not (Principle 5).
- Filter selections, expansion and persona are local view state and live in the feature that owns them. They are never merged with observed telemetry or with fetched records (Principle 11).

---

# Cross-page verification matrix

| Invariant                       | Principle | Fleet     | Robot detail | Shell     |
| ------------------------------- | --------- | --------- | ------------ | --------- |
| Freshness visible with state    | 4         | ✓ rows    | ✓ header     | —         |
| Status labelled chips           | 6         | ✓         | ✓            | —         |
| Connection honesty              | 5         | via shell | via shell    | ✓ banner  |
| Async state set defined         | 5         | ✓ § 10    | ✓ § 10       | ✓ § 8     |
| Local view state kept separate  | 11        | ✓ filters | ✓ persona    | —         |
| Token-only colours              | 8         | ✓         | ✓            | ✓         |
| Feature isolation               | 9         | ✓         | ✓            | no domain |
| Capability-driven UI            | 3         | —         | ✓            | —         |
| Two personas, one layout        | —         | —         | ✓            | —         |

---

# Out of scope for page specs (explicit)

| Item                       | Reason                                  |
| -------------------------- | --------------------------------------- |
| Map page                   | Optional; no contract until scheduled       |
| Auth / login routes        | Not built; see README "not built"           |
| Settings / tenant admin UI | Config only (Principle 13)                  |
| Command confirmation flows | Not built; requires a new ADR (Principle 7) |
| Discovery / commissioning  | Named cut; see README "not built"           |

---

# Change protocol

- Route IA, hierarchy, or locked decisions change only with this document in the same commit as code (Principle 14).
- Component API changes land in `02_component-specs` first; pages update composition only (Principle 9).
- ADR amendments that affect freshness, transport, or boundaries must be reflected here when user-visible behaviour changes.
