# 01 — App shell

- **Status:** implementation-ready
- **Revision 2:** wordmark, accent, and feature flags now sourced from tenant config rather than hardcoded, matching the design profile's tenant-switch mechanism.
- **Scope:** All authenticated console routes
- **Implementation:** `web/src/app` (providers, router, shell layout)
- **Revision 3:** document number aligned to filename. Connection UI reconciled with the always-mounted live region in component spec 07. Adds the ADR 3 rule that per-robot freshness is suppressed while the stream is down, and the context-stability requirement for tenant config.
- **Revision 4:** connection vocabulary reconciled with ADR 31: the shell renders `connecting` (first attempt; header label `Stream connecting`, warning color) as well as the three prior states, and forwards `terminalCause` to the banner so the two named terminal disconnects — probe exhausted, stream integrity error — render their fixed sentences. Recovery is automatic; the shell owns none of the schedule (transport policy in `shared/lib`/`app`), it only reflects state.
- **Governing documents:** `PRINCIPLES.md` (esp. 5, 6, 9, 13); ADR 2 (transport, connection state); ADR 3 (freshness, banner coupling); ADR 4 (feature-sliced structure); ADR 5 (MUI + tokens); component spec 07 ConnectionBanner

## 1. Product intent

The shell is the operational frame: identity, navigation, theme, connection integrity, and the outlet for page content. It must not become a dumping ground for fleet or robot domain UI.

## 2. Locked decisions

| Concern       | Decision                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand         | Wordmark read from `config.tenant.wordmark`. No hardcoded product name anywhere in the shell. Links to `/`                                                                                                                                                                           |
| Navigation    | Primary: Fleet. Robot detail is reached from the table, not a global nav item                                                                                                                                                                                                        |
| Connection UI | `ConnectionBanner` mounted above main content at all times. Its live region must exist before its message does, so the shell renders it in every state and the component hides its own contents when `connected` (component spec 07 § 4). The shell does not conditionally render it |
| Theme         | `data-theme` on `documentElement`, set from `config.tenant.theme` at boot. Tenant A is dark, Tenant B is light — not a user preference; no `localStorage` persistence                                                                                                                |
| Tenant        | Theme, wordmark, and feature flags all come from `/config` together, so a tenant switch changes all three at once                                                                                                                                                                    |
| Skip link     | First focusable control: skip to `#main`                                                                                                                                                                                                                                             |

## 3. Hierarchy

1. Skip link → `#main`
2. Header: wordmark (from config), primary nav, optional tenant label, connection indicator (non-banner)
3. `ConnectionBanner` — always mounted, contents conditional, zero height when connected
4. `<main id="main">` page outlet
5. No global marketing footer required for MVP

## 4. Layout

- Sticky header; bottom hairline using `--line`
- Header background `--header-bg` with optional backdrop blur that must not harm contrast
- Main content max width ~1200–1440px for data views; horizontal padding from token gutters
- Banner full width of content column

## 5. Data dependencies

| Data             | Source                       | Shell responsibility                                                  |
| ---------------- | ---------------------------- | --------------------------------------------------------------------- |
| Connection state | Transport client / app store | Pass into `ConnectionBanner`, including `attempt` and `terminalCause` |
| Tenant config    | `/config`                    | Apply theme, wordmark, and expose flags via context, together         |
| Route            | Router                       | Render outlet only                                                    |

Shell does not subscribe to per-robot telemetry (Principle 9).

**Context stability.** Tenant config is provided through context and read by every route. Its value must be referentially stable across renders — a frozen module value, or `useMemo` over the parsed config — because a fresh object literal in the provider re-renders the entire tree on every shell render, including the fleet table. Connection state changes at reconnect frequency and must not travel in the same context value as tenant config, which never changes after boot (Principle 12).

## 6. Component boundary

| Piece              | Owner          |
| ------------------ | -------------- |
| Skip link          | App shell      |
| Header / nav       | App shell      |
| `ConnectionBanner` | `shared/ui`    |
| Theme provider     | App shell      |
| Page content       | Feature routes |

## 7. Accessibility

- One `main` landmark per view
- Banner uses `role="status"` / `aria-live="polite"` per its component spec, and its container is mounted in every state. A live region introduced at the same moment as its message is not reliably announced; that is why the shell does not conditionally render it (Principle 6)
- Focus order: skip → header controls → banner control when present → main
- Do not auto-focus the banner, and do not move focus on reconnect churn
- The skip link is the first focusable control in DOM order, not merely the first visually

## 8. Failure behavior

Asynchronous state set for the shell (Principle 5):

| Condition                        | Behaviour                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Initial load                     | Render immediately from the tenant profile baked into this build; there is no runtime configuration fetch                      |
| Connected                        | Banner mounted and empty; routes render normally                                                                               |
| Connecting (first attempt)       | Banner shows `Connecting to stream` with the attempt count and no last-event fragment; per-robot freshness suppressed (ADR 31) |
| Reconnecting                     | Banner shows attempt and last event time; page data remains; per-robot freshness suppressed (ADR 3)                            |
| Disconnected                     | Banner states that shown data is last known (or the terminal-cause sentence from component spec 07 § 5); page data remains     |
| Tenant selection/profile invalid | Fail the build; never ship a plausible fallback carrying the wrong tenant's branding or feature policy (ADR 17)                |
| Unknown route                    | Simple not-found inside `main`: title plus a link to Fleet. Not a marketing 404                                                |

**Freshness while disconnected.** ADR 3 derives freshness from a server sweep delivered over the stream. While the stream is down the client cannot support a per-robot currency claim, so features suppress per-robot freshness labels in favour of the connection-level state. The shell owns the connection state that makes that suppression possible; the rule itself is enforced in the features that render the labels.

**Theme application.** `data-theme` is set on `documentElement` from tenant config at boot, before first paint. Setting it in an effect after mount produces a flash of the wrong tenant's palette, which on a dark-to-light tenant switch is not a subtle defect.

## 9. Verification

| Concern                    | Check                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Banner mounted always      | Container present in the DOM while connected; no visible content and no reserved height                                       |
| Banner announces           | Connected → reconnecting transition is announced without the region remounting (Principle 6)                                  |
| Skip link first            | Keyboard path; first focusable element in DOM order                                                                           |
| No domain imports in shell | Lint / dependency rule (Principle 9)                                                                                          |
| Wordmark not hardcoded     | Grep for literal brand strings in `src/app`; must find none                                                                   |
| Tenant switch              | Wordmark, theme, and at least one flag all change together, without remounting the tree incorrectly                           |
| No theme flash             | `data-theme` present on first paint, not applied in a post-mount effect                                                       |
| Context stability          | Tenant config value is referentially stable; a connection-state change does not re-render routes that read only tenant config |

## 10. Change rules

Adding global nav items or a second primary persona switch in the shell requires this spec and PRINCIPLES review. Robot-level persona stays on the detail page.

---
