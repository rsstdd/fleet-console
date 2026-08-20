# ADR 23 — Stream Connection State Reaches the Features Through a Scoped Context in `shared/lib`

**Decision:** `packages/web/src/shared/lib/connectionContext.ts` declares a React context carrying the stream's connection state and nothing else; `app` provides it, `features/fleet` and `features/robot` consume it to suppress per-robot freshness labels, and its default is `disconnected` so a missing provider fails closed.
**Group:** Presentation / boundaries (how one fact crosses a dependency rule that forbids the obvious route).
**Status:** Decided · 2026-08-19 · Implemented

## Issue

ADR 3 makes the connection banner part of the freshness mechanism's correctness, not a decoration beside it. Freshness is derived by a server sweep and delivered over the stream, so while the stream is down no per-robot label can be trusted: the console must suppress the labels and let the banner carry the connection-level state. Component spec 02 § "Disconnected stream" and page specs 02 § 8 and 03 § 8 all say so.

**Half of it existed.** `AppShell` rendered `ConnectionBanner` from a `connectionState` prop. The other half did not: `fleetPage.tsx` and `robotDetailPage.tsx` each rendered `<FreshnessLabel>` unconditionally, reading no connection state at all. A dead socket left every row asserting a currency the client could not support — the single thing the README's first guarantee says the console never does.

The reason it had not been fixed is structural, and it is why this needed a decision rather than a patch. The fact is produced in `app`, which owns the transport lifecycle. It is needed in `features`, and **`features` may not import `app`** (ADR 4, enforced by `boundaries/dependencies`). The value could not travel down the import graph, so it had to travel some other way — and the same hole existed in _two_ features, which meant fixing it in one place only would create a second authority for one question.

Making it worse: `AppShell`'s prop defaulted to `"connected"`. Nothing supplied it, so the console's actual runtime state was an optimistic literal.

## Assumptions

- There is exactly one stream and therefore exactly one connection state per running console. A per-feature or per-route connection is not a thing this architecture has.
- Connection state changes rarely — on connect, disconnect and reconnect — so a context re-rendering its whole subtree is not a performance concern at this size. If that stops being true it is a memoisation problem, not a decision to revisit.
- The app owns one transport client and publishes its real socket state through this context. The original injected-state tests remain the cheapest guard for feature behavior.
- `shared/lib` may hold a stateful module. It has held only pure helpers so far, which is a convention rather than a rule; the lint boundaries permit it and this ADR is the record that it was a choice.

## Constraints

- **`features` may not import `app`** (ADR 4). This is the whole constraint. `shared/lib` is the only layer both `app` and `features` may import.
- **`shared/lib` and `shared/ui` are siblings and neither may import the other.** The banner's `ConnectionState` type therefore cannot be imported by the context module, or the reverse.
- **`shared/ui` may not import `@fleet/contracts`** and takes presentational unions only, so the vocabulary cannot be pushed down into the contract package either.
- Observed and requested state are never collapsed, and state is separated by authority, lifetime and transition model (Principle 11).
- No client-side freshness timer may exist anywhere in `packages/web` (ADR 3).

## Decision

**A context in `shared/lib`, scoped to connection state and nothing else.**

`connectionContext.ts` exports four things and deliberately stops there: `StreamConnectionState`, `DEFAULT_CONNECTION_STATE`, `ConnectionContext`, `useConnectionState`, and the predicate below. Its module comment names the risk in the first paragraph — that this becomes the place a general application store grows, because it is the one stateful thing every layer can reach — and states what belongs elsewhere: robot state in `entities/robot`, deployment configuration in `config`, view state in the feature that owns it.

**The state union is restated, not imported.** `shared/ui/connectionBanner.tsx` holds a structurally identical union and the two layers cannot see each other, so TypeScript's structural typing is what keeps a value of either assignable to the other with no adapter. The same reasoning is already written on `StatusPresentationVariant` in `entities/robot/selectors.ts`; this follows it rather than inventing a second pattern. A test asserts the two remain interchangeable.

**`isStreamConnected(state)` lives in the same module.** Not in each feature: `features` may not import each other, so a rule written inline in `fleetPage` and again in `robotDetailPage` is two rules that can disagree, and the way they would disagree is one page suppressing while the other does not — exactly the state ADR 3 exists to prevent (Principle 1). `reconnecting` counts as **not** delivering, because nothing updates freshness during a reconnect and the last value ages silently.

It is deliberately not named `isStreamLive`. `live` is a freshness state in ADR 3's vocabulary, and a helper whose name collides with it invites the precise conflation Principle 11 forbids.

**The default is `disconnected`, and `AppShell`'s prop default changed to match.** The two ways to be wrong about a missing provider are not symmetric. Defaulting to `connected` makes every row assert a currency nothing is supplying; defaulting to `disconnected` suppresses the labels and shows the banner, so the mistake is visible. The app-owned transport supplies the live value in production; the default protects missing or broken composition.

**Suppression is suppression, not substitution.** Nothing is rendered in the label's place — no "unreachable", no em dash, no placeholder. The rows and their values remain, frozen at last known, exactly as the page specs require. A per-robot state substituted here would blame every machine for the console's own dead socket.

## Positions

1. **`ConnectionContext` in `shared/lib`, provided in `app`.** Chosen. The only option legal under the dependency rule that keeps a single authority.
2. **Connection state on the transport client or the entity read model**, so features subscribe to the thing that produces it. Rejected on Principle 11 directly, not on taste: connection state is the browser's observation of its own socket, changing on connect and disconnect; robot state is the server's observation of a machine, changing on every flush. Different authorities, different lifetimes, different transition models — collapsing them is the failure that principle names, and the concrete consequence is a console that degrades every robot to "unreachable" when its own socket dies.
3. **Prop-drill from `app` through the router.** Rejected. Every intermediate component carries a prop it does not use, and nothing prevents a future page from forgetting it and re-asserting freshness — the failure is silent and is exactly the one being fixed.

## Argument

The dependency rule is doing real work here and was not worked around. Options 2 and 3 are both ways of avoiding a new module in `shared/lib`, and both pay for it with something worse: option 2 with a Principle 11 violation, option 3 with a rule enforced by everyone remembering.

The genuine cost of option 1 is that `shared/lib` becomes stateful for the first time, and the honest risk is scope creep — a module every layer can import is where an application store grows by accretion, one "while we're here" at a time. That risk is addressed the only way it can be: by making the module's scope explicit in its own text, naming the rule, and keeping its export list short enough that an addition is visible in review. The register's recommendation asked for exactly this, and it is a mitigation rather than a guarantee.

One thing was decided beyond the stub. The stub said to route the state; it did not say what the state should default to. Leaving `AppShell`'s optimistic `"connected"` default in place would have satisfied the letter of the item while leaving the console asserting currency in the one configuration it actually runs in today. Changing it to `disconnected` is what makes the fix true rather than merely present.

## Implications

- **Both pages now suppress, and a test fails if either stops.** Verified by removing the condition from both features: exactly four tests fail and forty-six unrelated ones still pass, so the suppression tests are the guard rather than incidental coverage.
- **The app-owned transport now supplies real connection state.** Labels render only after the socket and snapshot join succeeds; missing composition still fails closed to an empty Freshness column and a disconnected banner.
- **`shared/lib` is stateful from here on.** The next module added there does not get to cite this one as precedent for a store; it gets to cite the comment explaining why this one is narrow.
- **Two structurally identical unions now exist** — the banner's and the context's — and a test pins their interchangeability. Adding a fourth connection state is a change in three places: component spec 07, the banner, and here.
- **`AppShell` is the single provider.** A second provider anywhere below it would silently shadow the first for its subtree, which is the one way this design can grow a second authority. There is no lint rule preventing that today; the test asserting a routed child sees the shell's value is what would catch it.
- **The fleet summary still counts freshness states while disconnected — under an explicit qualification.** Originally left as a real inconsistency this ADR did not resolve; resolved 20 August 2026 by the shared "· last known" heading. See Open questions.
- **Entity-layer freshness mapping is untouched.** `selectStatusPresentation` and `selectBatteryDisplay` still map freshness onto presentation; what changed is only whether the label renders at all. No freshness derivation moved into the console, and a grep confirms no interval or timer ages robots locally — the one `Date.now()` in `packages/web` builds fixture timestamps and is guarded by its own comment.

## Open questions

- ~~**Should the fleet summary's freshness counts be suppressed too?**~~ **Resolved** (20 August 2026): neither suppressed nor left bare — qualified. The four counts stay visible during an outage, wrapped in a labelled section whose visible h2 heading reads "Fleet freshness" while connected and "Fleet freshness · last known" in every other state, derived solely from `isStreamConnected(useConnectionState())`. Suppressing the counts would discard operationally useful last-known state the rows themselves are allowed to keep; leaving them unqualified repeats at fleet scope the currency claim this ADR removed per robot (Principle 4). One shared heading qualifies the group — no per-metric tag, no aria-live region (the banner already announces the outage; a second announcement would be a duplicate authority), and no client timestamp (robot timestamps do not identify when the aggregate was captured, and deriving one would be client-side freshness reasoning ADR 3 forbids). Fleet spec § 8 now says so; fleet TODO **A7** is closed. This was a spec change resolved through the fleet page spec, not a new decision — no new D-id or ADR.
- **Should a missing provider be an error rather than a fail-closed default?** A sentinel default plus a throwing hook would catch the programming mistake at its source. It was not taken because it adds a runtime failure path to a console whose asynchronous states are already fully enumerated (Principle 5), and because failing closed is already safe. Worth revisiting if a second provider ever appears.
- **Where does reconnect attempt count and `lastEventAt` live?** `AppShell` takes them as props and the banner renders them; features do not need them today. If a feature ever does, this module is the wrong place for it unless the answer is still "connection state and nothing else".

## Observed consequences

- 19 August 2026: implemented. `shared/lib/connectionContext.ts` written with 7 tests; `AppShell` provides the context and its prop default changed from `connected` to `disconnected`; both features suppress. Web at 197 tests, up from 176.
- **The guard was probed before landing.** Replacing `streamConnected ? (` with `true ? (` in both features fails exactly the four suppression tests and nothing else. The complementary vacuity check is a fifth test asserting the labels _are_ present when connected, so an empty cell for an unrelated reason cannot pass as suppression.
- **Two existing robot-detail tests failed the moment the default changed**, which is the fail-closed decision being noticed exactly where it should be. Both were rendering without a provider and relying on the old optimistic default; both now state their connection state explicitly. `fleetPage.test.tsx` did **not** fail, which exposed a real coverage gap — it had never asserted a per-row freshness label at all — now closed.
- **A plausible-looking off-by-one was caught by the vacuity check.** The first version of the fleet test read the freshness cell as `getAllByRole("cell")[3]`, which silently returns the Site column, because the robot id is a row header and is excluded from the `cell` role. The connected-case assertion failed with `"Zone A"` instead of `"Live"`. Had only the suppression case been written, it would have passed for the wrong reason.
- `features/fleet/fleetScale.test.tsx` failed once under parallel load and passes in isolation and on re-run. It renders 500 rows and drives `userEvent` typing; the failure was a query timeout, not a suppression regression. Noted because a flaky scale test is worth someone knowing about.
- **20 August 2026 — the fleet-summary question closed the way the resolution above records.** Six fleetPage tests landed first and five failed red (connected heading unqualified, reconnecting and disconnected qualified, counts unchanged while down, filtering leaves fleet-wide counts and qualification untouched, one h1 then the summary h2); the implementation is a `section` labelled by the heading, reading the same `streamConnected` the row suppression already used — no new state, no Stat API change. The Playwright outage scenario (ADR 32) now also asserts the browser truth: after `stopServer()` the region named "Fleet freshness · last known" holds the heading and all four stat labels. One test-authoring trap surfaced: a bare `/last known/` text query matches every suppressed row's "Idle (last known)" chip, so the absence assertion is scoped to headings.

## Related

- **ADR 3** (freshness derived server-side on a timer) — the source of the suppression requirement, and of the rule that no client-side timer may substitute for it. This ADR completes the console half of that decision.
- **ADR 4** (feature-sliced structure) — the constraint that made this a decision rather than a patch. `features` may not import `app`, and `shared/lib` is the only layer both may reach.
- **Component spec 07** (`ConnectionBanner`) — the authority for the state vocabulary, and the surface that carries the connection-level state once the labels are gone. Its own prose already said the banner is "necessary, not sufficient".
- **Component spec 02** (`FreshnessLabel`) — states that this component is not rendered per robot while the stream is disconnected; that sentence is now enforced by tests rather than by review.
- **ADR 21** (endpoints from the environment) — supplies the address the transport client connects to; this ADR supplies the channel its connection state travels on.
- **Register D15** — resolved by this ADR; the stub is now a tombstone.
- **Principle 11** (state separated by authority, lifetime and transition model) — the reason position 2 was rejected outright rather than weighed.
- **Principle 1** (one authoritative implementation) — the reason `isStreamConnected` is in the shared module rather than written once per feature.
