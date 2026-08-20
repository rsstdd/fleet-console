# ADR 14 — One Roster, Two Producers, Equality Asserted in CI

**Decision:** `config/fleet-manifest.json` and `config/freshness.json` stay repository-root deployment configuration read only by the server; the simulator keeps generating its fleet from explicit CLI inputs, prints a roster in the server's spelling, and CI asserts that the printed roster is byte-for-byte the committed one.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** Configuration / deployment (the handoff between the two processes a demo runs, and the one place their views of the fleet can silently disagree).

## Issue

Two root files describe the fleet: `fleet-manifest.json` lists every robot the system expects, and `freshness.json` holds the thresholds the sweep derives against. The server reads both strictly and fails startup on either being malformed. The simulator reads neither — it generates its fleet from `--robots` and `--seed`, and offers `--print-manifest` so an operator can produce a roster from it.

That handoff was documented and did not work. `renderFleetManifest` printed `{ seed, robots: [{ robotId, siteId, vendor, model }] }`; `fleetManifestSchema` is a strict object that accepts `robots` alone and requires `vendorId`. Redirecting `--print-manifest` into the file the server reads therefore failed startup twice over: an unrecognized `seed` key, and a missing `vendorId` on all fifty entries. The committed file already used the server's spelling and already held the same fifty robots, so the two agreed on _contents_ and disagreed on _format_ — the failure a reader is least likely to catch by eye and least likely to suspect, because the roster looks right.

The question this ADR settles is not only who owns the files. It is what stops the two producers from drifting again once they agree, and which spelling wins when they differ.

## Assumptions

- The simulator's generation is deterministic at a pinned seed. `createFleet(50, 1)` produces the same fifty identities on every machine; the parity test is meaningless otherwise.
- The demo's documented inputs are the defaults. `--robots 50 --seed 1` are `DEFAULTS`, so a bare `--print-manifest` reproduces the shipped file, and a default change is a change to what the roster is.
- The simulator will keep _producing_ rosters rather than _consuming_ them. If it ever needs to read the roster the server booted with, this decision is the wrong one and option 5 below becomes worth its cost.

## Constraints

- No new runtime dependency edge between the two packages, and no new shared package (ADR 9 governs the workspace's dependency shape).
- The server keeps rejecting malformed configuration at startup rather than defaulting around it.
- Whatever proves compatibility must run in CI. A compatibility promise nobody executes is the state this decision found.

## Decision

**The server's spelling is canonical.** `fleetManifestSchema` defines the roster document: a `robots` array of `{ robotId, siteId, vendorId, model }`, strict, no wrapper. Where the two packages disagreed, the simulator changed.

Three consequences, all now in code:

1. `FleetManifestEntry.vendorId` replaces `vendorId`'s old spelling `vendor` in `packages/simulator`, and `toFleetManifest` emits it.
2. `renderFleetManifest` prints the manifest document alone. The seed moved to **stderr**, written at the CLI boundary in `index.ts`: stdout carries the document, stderr carries the provenance, so `> config/fleet-manifest.json` produces a file the server accepts while the operator still sees which seed produced it.
3. Equality is asserted from both sides, in CI, without a dependency edge:
   - `packages/simulator/src/fleet/manifestParity.test.ts` renders the roster at the recorded inputs and compares it byte for byte with the committed file, and pins those inputs against `DEFAULTS` so a default change fails rather than silently redefining the roster.
   - `packages/server/src/config/fleetManifest.test.ts` parses the same committed file with the real schema and asserts its shape.

   Neither package imports the other. The committed file is the join: the simulator proves it produces it, the server proves it accepts it, and CI runs both under `pnpm test`.

The simulator still reads neither root file at runtime. Reading the committed manifest inside a test is a test-time read of deployment configuration, not a runtime coupling.

## Positions

1. **Root files with independently tested decoders.** The status quo. Rejected as insufficient rather than wrong: it is this arrangement plus the missing test, and the missing test is exactly what let a broken handoff ship documented as working.
2. **A shared `@fleet/config` package exporting schemas and loaders.** Rejected. It is the only option that makes drift structurally impossible, and it costs a package, a dependency edge into a package that deliberately has almost none, and a production dependency for the simulator on parsing code it does not use at runtime. The problem is one field name and a wrapper key; the remedy is disproportionate to it (Principle 15).
3. **Same explicit inputs, equality asserted in CI.** Chosen.
4. **Package-local copies of the JSON.** Rejected outright. It optimizes for the one thing that was never a problem — coordination at runtime — by guaranteeing the thing that was: a robot the server knows about and the simulator never emits.
5. **Simulator asks the server for the roster at startup.** Rejected today. It is the right answer to a different question — a simulator that must mirror a roster it did not choose — and it buys that at the price of a startup ordering dependency in the one component whose job is to run before anything else is trustworthy.

## Argument

Option 3 was chosen because the disagreement was never about ownership; it was about verification. Both packages already had the right contents. What was missing was any execution path where a mismatch fails.

Against option 2, the deciding argument is proportionality. A shared package makes drift impossible by construction, which sounds strictly better until you price it: a new workspace package, a new dependency edge, and a simulator that now imports parsing code it never runs. The defect being prevented is a field name. A test that fails the build is the same guarantee at a fraction of the cost, and the cost it does carry — someone must keep the recorded inputs documented — is itself asserted by the test that pins them to `DEFAULTS`.

Against option 1, the deciding argument is that this _is_ option 1, plus the one thing that was missing. Leaving it as-is would have meant re-documenting the handoff without making it work.

The spelling question was decided by asymmetry, not preference. The server's schema is strict and validates untrusted deployment configuration at startup; the simulator's manifest type is a projection it controls entirely. Changing the strict consumer to match a producer would weaken a boundary; changing the producer to match a strict consumer costs one field name. Where a producer and a validating consumer disagree, the validator's spelling should win by default.

## Implications

**Each item below is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **The documented handoff now works end to end.** `pnpm --filter @fleet/simulator start -- --print-manifest > config/fleet-manifest.json` produces a file the server boots on. That command was in the simulator README before this ADR and did not.
- **A default change is now a roster change, and it fails loudly.** `manifestParity.test.ts` pins `robots: 50, seed: 1` against `DEFAULTS`. Changing either default without re-recording the committed file breaks the build, which is the intended behaviour — the shipped roster is a deliberate artifact, not whatever the simulator happens to emit today.
- **`--print-manifest` output must stay separable by stream.** The seed line goes to stderr. Anything else that prints to stdout in that path corrupts the document; that includes a future logger that defaults to stdout.
- **The simulator's `FleetManifestEntry` is now a mirror of a schema it cannot import.** That is a deliberate duplication with a test behind it, not an oversight. A field added to `fleetManifestSchema` must be added here too, and the parity test is what will say so.
- **`vendorId` is the vendor spelling everywhere a roster is written.** The simulator's internal `identity.vendor` keeps its name — it is not a roster field — but anything crossing into a manifest is `vendorId`.
- **Two tests are load-bearing and read like housekeeping.** A file-reading test in each package, both comparing against a JSON file at the repository root. Deleting either one restores the original failure mode silently, since the packages still agree today and will keep agreeing until they do not.
- **Neither package gained a dependency.** The check is a shared _file_, not shared _code_, which is what keeps option 3 cheaper than option 2 rather than merely different.
- **`freshness.json` is untouched by this decision.** It is server-only configuration with no second producer, so it has no parity question. If the simulator ever derives timing from it, that is a new decision.
- **The evidence the register asked for is now complete for this stub**, except one item that belongs to another: "one-command startup resolves paths from a clean clone" depends on the root `pnpm dev` orchestration, which is register **D13**'s ground rather than this one's.

## Open questions

- **Should the parity test regenerate the committed file rather than compare against it?**
  _Current lean:_ No. A test that rewrites a tracked artifact turns a failed comparison into a silent commit-time diff, which is how recorded fixtures rot elsewhere. Comparison fails; regeneration is a documented command a human runs.
  _Resolves on:_ the first time someone has to re-record and finds the command missing from the README.
- **Does the roster belong in `config/` at all, or in the simulator's package as recorded output?**
  _Current lean:_ `config/`. It is deployment configuration the server reads, and the simulator's ability to produce it is a convenience rather than its provenance.

## Observed consequences

- **19 August 2026 — the contents agreed, so the parity test passed on its first run after the format fix.** The two failing assertions before the change were the `seed` wrapper and the byte comparison; identifiers, sites and models matched exactly, confirming the register's reading. Had the contents disagreed, this would have been a much larger decision — the format fix was cheap precisely because the generation was already deterministic and already the shipped one.
- **19 August 2026 — the format was not the only thing broken about the handoff.** Running the README's command to verify this ADR's claim found a second failure: `pnpm start -- --print-manifest` forwards the `--` separator itself, which the CLI rejected as `Unknown option --`. The documented command therefore failed before it ever reached the format question, and a format-only fix would have shipped an ADR claiming a working handoff on the strength of a passing unit test. `parseArgs` now skips a bare `--` — POSIX end-of-options, and this CLI takes no positional arguments — and both invocation styles were run for real, each producing a file byte-identical to the committed roster with the seed on stderr. Unit tests cannot find this class of defect; only running the documented command can.
- **19 August 2026 — two existing simulator tests asserted the old spelling** (`createFleet.test.ts`, `app.test.ts`). Both were updated to `vendorId` with a comment naming this ADR. That they existed and passed is the point: they pinned the simulator's output faithfully, and the thing nobody had pinned was its agreement with the consumer.

- **20 August 2026 — the roster document widened to `{ sites, robots }` (ADR 34).** The manifest now opens with a `sites` directory of `{ siteId, label }` entries; site ids are unique and every robot must reference a defined site. The mechanism this ADR created absorbed the change unchanged: the simulator's `SITE_DIRECTORY` mirrors the widened schema exactly as `FleetManifestEntry` mirrors the roster entries, `manifestParity.test.ts` compares the whole document byte for byte, and the server's spelling remains canonical. A manifest without `sites` is now invalid server input.

## Related

- **ADR 3** (freshness, server-derived) — the roster exists so a never-reported robot reads UNKNOWN rather than being absent; that is what makes this file load-bearing rather than convenience.
- **ADR 9** (workspace source exports) — governs the dependency shape option 2 would have added to.
- **ADR 13** (recorded fixtures with a CI drift guard) — the same pattern one layer down: a recorded artifact plus an executed comparison, chosen over a shared runtime dependency for the same reason.
- **Principle 13** (configuration expresses deployment policy) — the roster and the thresholds are deployment values, validated at startup, not code.
- **Principle 15** (enforcement proportionate and tested) — the argument against option 2 in one line.
- **Register D6** (`docs/PENDING_ARCHITECTURE_DECISIONS.md`) — the stub this ADR ratifies; now a tombstone.
- **Artifact `config/fleet-manifest.json`** — the shipped roster; the join between the two tests.
- **Artifact `packages/simulator/src/fleet/manifestParity.test.ts`** — the producer half.
- **Artifact `packages/server/src/config/fleetManifest.test.ts`** — the consumer half.

## Notes

- 19 August 2026: ratified from register stub **D6**, option 3, with the server's spelling canonical as the recommendation proposed. Numbered 14 because 13 was taken by a concurrent ratification of **D4** while this one was being written — the second such collision of the day, which is itself worth a procedural fix: the register hands out stub identifiers, and nothing hands out ADR numbers.
