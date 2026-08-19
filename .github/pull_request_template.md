## What changed

<!-- One paragraph. What this does, and why now. -->

## Principle / ADR impact

- [ ] No ADR is contradicted by this change.
      If one is, it is amended **in this PR** under its `## Observed consequences`
      heading, with the date and the reason. Silent divergence is the thing
      CLAUDE.md forbids; a corrected ADR is a normal outcome.
- [ ] No new dependency. If there is one, the ADR justifying it is linked here.

## Area checks

<!-- Open the blocks that apply, delete the rest. These are the judgment calls
     only. Boundary rules, token rules, and accessibility lint already fail in
     CI, so they are deliberately not repeated here. -->

<details><summary><code>packages/web</code></summary>

- [ ] Freshness is read from the envelope field. Nothing in this package derives
      it and no component or entity holds a timer (ADR 3).
- [ ] Per-robot freshness labels stay suppressed while the stream is down; the
      connection banner carries the connection-level state (ADR 3).
- [ ] Every async surface touched here defines its full state set: loading,
      empty, stale, offline, recoverable error, terminal error (Principle 5).
- [ ] Observed and requested state remain separate fields (Principle 11).

</details>

<details><summary><code>packages/contracts</code></summary>

- [ ] The canonical core still carries only meaning genuinely shared across
      vendors. Anything vendor-specific is a declared capability (ADR 1).
- [ ] A new capability lands here _before_ the panel mapping in `web` (ADR 1).
- [ ] Schema tests cover valid, missing, malformed, and additional-field
      payloads (Principle 2).

</details>

<details><summary><code>packages/adapters</code></summary>

- [ ] The canonical envelope was not edited to accommodate a vendor (ADR 1).
- [ ] Unknown vendor fields are counted, not dropped (ADR 1).
- [ ] Fixture disagreements between vendors are preserved, not tidied away.
      They are the evidence the contract tests produce (ADR 1).

</details>

<details><summary><code>packages/server</code></summary>

- [ ] The sweep over `receivedAt` remains the single authority on freshness;
      no second derivation was introduced (ADR 3).
- [ ] Any protected operation is authorized here, not by the client
      (Principle 7, non-negotiable 1).

</details>

<details><summary><code>packages/simulator</code></summary>

- [ ] New fault-injection or load flags are reflected in the README demo script.

</details>

## Verification

- [ ] CI is green.
- [ ] Exercised end to end — stack started, flow run in a browser or the
      documented equivalent, observable result confirmed. Compiling and unit
      tests alone do not satisfy this (Principle 10).

## Judgment

<!-- Two sentences each. These are the parts no check can make for you. -->

**Which state authority does this touch?**

**What breaks if this is wrong?**
