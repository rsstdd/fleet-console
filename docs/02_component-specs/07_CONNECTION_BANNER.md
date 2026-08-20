# 07 — ConnectionBanner

- **Status:** implementation-ready
- **Revision 3:** ADR 31 (register D22) widened the vocabulary and named the terminal states. `connecting` joins the union — a first attempt is not a recovery, and its copy carries no last-event fragment because nothing was ever received. `terminalCause` is added so the two decided terminal disconnects render their own fixed sentences: initial probe exhausted ("Unable to connect to stream after 3 attempts") and stream integrity error ("Stream integrity error · showing last known state (may be stale)"). A contract failure keeps the plain disconnected copy. The retry control appears in every non-connected state, because ADR 31 pairs every terminal state with an immediate manual retry.
- **Revision 2:** the live region is now always mounted; rendering `null` when connected meant the `role="status"` container appeared at the same moment as its message, which screen readers do not reliably announce. Adds `attempt`, which the wireframes and the shell both require and the prop list omitted. Retry label fixed to "Retry now". Token names corrected: `--critical` and an `info` surface do not exist. Adds the ADR 3 coupling that makes this component part of the freshness mechanism rather than adjacent chrome.

Implementation: `shared/ui/ConnectionBanner.tsx`

## 1. Responsibility

`ConnectionBanner` reports stream connection integrity: connecting, connected, reconnecting, or disconnected — and, when the transport has stopped retrying, why. It is the surface that keeps the console honest when the transport is not healthy.

It does not own the WebSocket client, does not implement retry policy, and does not compute freshness. It reflects state passed from the app layer and invokes `onRetry`.

**This component is load-bearing for ADR 3.** Freshness is derived from a server sweep and delivered over the stream, so while the stream is down no per-robot freshness label can be trusted. The feature layer suppresses per-robot labels and this banner carries the connection-level truth instead. A console showing per-robot freshness with no live connection is a defect against Principle 4 regardless of what this banner says — the banner is necessary, not sufficient.

## 2. Dependencies

- Tokens: `--warning` and `--error` surfaces, text and borders
- MUI `Button` optional for retry; a native `button` is acceptable
- No domain, feature, or transport imports (Principle 9)
- The app shell places it above page content

## 3. Public contract

```ts
type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

type ConnectionTerminalCause = "handshake-exhausted" | "contract" | "session-mismatch";

interface ConnectionBannerProps {
  readonly state: ConnectionState;
  /** ISO 8601, or epoch ms. Last event actually received on the stream. */
  readonly lastEventAt?: string | number;
  /** Attempt number, surfaced so the control is visibly doing something. */
  readonly attempt?: number;
  /** Why retrying stopped; selects the disconnected sentence (ADR 31). */
  readonly terminalCause?: ConnectionTerminalCause | null;
  /**
   * Must force an immediate reconnect attempt and increment `attempt`.
   * A retry control that does nothing observable is the class of lie this
   * project exists to argue against.
   */
  readonly onRetry?: () => void;
  readonly className?: string;
}
```

## 4. Required output

The outer element is **always rendered**, in every state. Only its contents are conditional.

```tsx
<div
  className={["connection-banner", `connection-banner--${state}`, className]
    .filter(Boolean)
    .join(" ")}
  role="status"
  aria-live="polite"
  data-connected={state === "connected" ? "true" : "false"}
>
  {state === "connected" ? null : (
    <>
      <span className="connection-banner__message">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry now
        </button>
      ) : null}
    </>
  )}
</div>
```

When `state === "connected"` the container is present, empty, and visually hidden by CSS — not removed from the DOM.

**Why.** A live region must exist in the accessibility tree _before_ its content changes for the change to be announced. Mounting the region and its message together is the most common way to build a live region that never fires. The visual outcome is identical; the announced outcome is not (Principle 6).

Consequently the banner occupies no layout space when connected: the hidden state collapses to zero height rather than reserving a strip.

## 5. Content rules

Fixed message patterns:

- **connecting:** `Connecting to stream` · attempt number when `attempt` is supplied. Never a last-event fragment: nothing has ever been received, so there is no event whose time would be true.
- **reconnecting:** `Reconnecting to stream` · attempt number when `attempt` is supplied · last event time when `lastEventAt` is supplied
- **disconnected**, by `terminalCause`:
  - `handshake-exhausted`: `Unable to connect to stream after 3 attempts` — the number is `INITIAL_PROBE_ATTEMPT_LIMIT` in `shared/lib/streamLifecycle.ts`, and changing either updates both (ADR 31).
  - `session-mismatch`: `Stream integrity error · showing last known state (may be stale)`
  - `contract`, absent, or null: `Stream disconnected · showing last known state (may be stale)`

No attempt or last-event fragment in any disconnected sentence. Do not claim data is live while disconnected. Do not invent vendor-specific or reassuring wording.

## 6. Design-system mapping

| State        | Treatment                                     |
| ------------ | --------------------------------------------- |
| connecting   | `--warning` tint background, `--warning` text |
| reconnecting | `--warning` tint background, `--warning` text |
| disconnected | `--error` tint background, `--error` text     |
| connected    | rendered, empty, visually hidden, zero height |

`connecting` shares the warning treatment deliberately: it is not an outage, and it is not yet a stream.

`--warning` and `--error` are aliases of `--status-degraded` and `--status-fault`, so the feedback and status palettes cannot drift (Principle 8). There is no `--critical` token and no `info` surface; both were removed from the design profile.

Border or left rule optional. Padding compact (`0.5rem 1rem`). Mono for the timestamp and attempt fragments.

## 7. Responsive behavior

Message wraps; the retry control remains visible and never wraps to zero width. Full width of the shell content column.

## 8. Interaction states

Retry button: secondary or danger outline per the design system. Focus visible using the token focus ring.

`onRetry` is invoked directly; the component holds no state of its own and does not debounce. Rate limiting is transport policy and lives in `shared/lib` or the app layer.

## 9. Accessibility contract

- `role="status"` with `aria-live="polite"`, on a container that is mounted at all times (§ 4).
- Never `assertive`. A reconnect during a reconnect storm would interrupt whatever the operator is reading.
- Colour is never the only signal; the text states the condition (Principle 6).
- The banner never steals focus. Appearing mid-task must not move the caret, and reconnect churn must not repeatedly refocus anything.
- The retry control is a real `button` with a discernible name, reachable in normal tab order after the header controls.

## 10. Failure behavior

- `connected` → container rendered, contents empty.
- Missing `onRetry` → message only, no control.
- Missing or invalid `lastEventAt` → omit the time fragment; never render `Invalid Date`.
- Missing `attempt` → omit the attempt fragment rather than printing `attempt undefined`.

## 11. Verification

| Concern               | Check                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Live region announces | Region present in the DOM while connected; transition to `reconnecting` is announced without a remount (Principle 6) |
| Hidden when connected | No visible content and no reserved layout space                                                                      |
| Attempt surfaced      | `onRetry` increments the visible attempt count                                                                       |
| Stale honesty         | Disconnected copy states that shown data is last known                                                               |
| Terminal causes       | Each `terminalCause` renders its own fixed sentence; retry control present in all of them (ADR 31)                   |
| No focus theft        | Focus position unchanged across a connected → disconnected transition                                                |
| Tokens                | No raw hex; `--warning` / `--error` only (Principle 8)                                                               |

## 12. Change rules

Transport retry policy lives in `shared/lib` or the app layer; this component only invokes `onRetry`. Message copy changes update this specification and the wireframes in the same change, since the wireframes show the exact strings.
