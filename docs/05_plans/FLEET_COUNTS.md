# Qualify disconnected fleet counts as last known

**Authority:** Planning only. ADR 23's fleet-summary question remains open.
**Status:** Active
**Updated:** 2026-08-20

Fleet freshness-summary suppression (A8): Keep the summary visible but label it clearly as last known while the stream is down, with the connection banner remaining the authoritative current status. If the UI cannot provide an unambiguous qualification within the existing design, suppress the summary instead. Never leave the counts visible as if current

## Summary

Keep all four fleet freshness counts visible during connection loss, but qualify their entire group with the visible heading:

- Connected: Fleet freshness
- Any non-connected state: Fleet freshness · last known

Implement this as a standalone change after D23. No client timestamp or freshness derivation is added.

## Decision and documentation

- Amend ADR 23 to resolve its fleet-summary open question: retained counts are permitted only with a shared, explicit last-known qualification.
- Update the fleet page specification’s summary, hierarchy, connection-loss behavior, accessibility, and verification sections.
- Close the corresponding fleet TODO and update root and affected package READMEs and
  TODOs wherever disconnected behavior is described.
- Leave the dated decision audit unchanged.
- Do not create a new D-id or ADR; ADR 23 already owns this open question.

## Implementation

- Wrap the four Stat metrics in a semantically labelled summary section.
- Add a visible h2-level summary heading using existing MUI typography and design tokens.
- Derive the heading solely from isStreamConnected(useConnectionState()):
  - only connected removes the qualification;
  - reconnecting, disconnected, and future non-connected states display last known.

- Keep the counts, fleet-wide selector, tones, filtering behavior, and retained robot state unchanged.
- Do not place “last known” on each metric, add an aria-live region, or use the latest robot timestamp as the summary timestamp. The connection banner already
  announces the outage, and robot timestamps do not identify when the aggregate was captured.

- Make no changes to Stat or other shared component APIs.

## Tests and verification

- Add focused FleetPage tests first:
  - connected summary is labelled Fleet freshness without last-known wording;
  - reconnecting and disconnected summaries are labelled Fleet freshness · last known;
  - all four counts remain visible and unchanged while disconnected;
  - row-level freshness labels remain suppressed;
  - filtering still leaves fleet-wide counts and qualification unchanged.

- Extend the Playwright outage scenario from D23 to verify that stopping the server retains the four counts and changes the shared heading to the last-known
  form.

- Verify the heading hierarchy remains one h1 followed by the summary h2, with no duplicate live-region announcement.
- Run web tests, lint, typecheck, build, Playwright smoke coverage, architecture-document checks, formatting, and git diff --check.

- Before closing the phase, verify ADR 23, the fleet page specification, fleet feature
  TODO, and affected READMEs all describe the same last-known qualification.

## Assumptions

- “Last known” qualifies the entire four-count group, not each metric independently.
- The frozen counts remain operationally useful during an outage.
- The connection banner remains the authoritative statement about current connectivity.
- No dependency, contract, selector, timer, or persistence change is required.
- No commit is created.
