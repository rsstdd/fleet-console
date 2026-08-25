# Archive

**Authority:** None. Nothing in this directory is normative, and nothing here should be
cited as the reason for a current behaviour.

Files land here when they were real working documents that have since been fully consumed
by the thing they produced. They are kept rather than deleted because they record _why_ a
structure looks the way it does, which the resulting structure itself cannot say.

**Before archiving a file, confirm it is genuinely spent.** A document that is merely
unfinished, unlinked, or inconvenient belongs where it was. The test is whether its content
now exists somewhere normative — an ADR, a spec, or executed code. If it does not, archiving
it deletes information while appearing to preserve it.

Every file here carries a header naming the date it was archived and what superseded it.

| File                                                                                       | What it was                                         | Superseded by                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| [`REMEDIATION_LOG.md`](./REMEDIATION_LOG.md)                                               | Phase 3 plan for restructuring the ADR field set    | The ADR set itself; all thirty files carry the new shape           |
| [`TODO_DECISION_AUDIT_2026-08-20.md`](./TODO_DECISION_AUDIT_2026-08-20.md)                 | Point-in-time TODO and open-decision audit          | Current TODOs and the completed roadmap handoff                    |
| [`DOCUMENT_LIFECYCLES.md`](./DOCUMENT_LIFECYCLES.md)                                       | Plan for enforceable ADR and plan lifecycles        | `docs/DOCUMENT_LIFECYCLES.md` and its CI checks                    |
| [`D22_RATIFY_AND_IMPLEMENT.md`](./D22_RATIFY_AND_IMPLEMENT.md)                             | Plan for stream recovery and restart reconciliation | ADR 31 (register D22) and the implemented transport                |
| [`D23_PLAYWRIGHT.md`](./D23_PLAYWRIGHT.md)                                                 | Plan for committed browser evidence                 | ADR 32 (register D23) and the committed Playwright suite           |
| [`FLEET_COUNTS.md`](./FLEET_COUNTS.md)                                                     | Plan for qualifying disconnected fleet counts       | ADR 23's amended Open questions and fleet page spec revision 5     |
| [`BATTERY_HEALTH_VERTICAL.md`](./BATTERY_HEALTH_VERTICAL.md)                               | Plan for the battery-history vertical slice         | ADR 33 (register D24) and robot-detail page spec revision 7        |
| [`TEST_FILE_LAYER.md`](./TEST_FILE_LAYER.md)                                               | Plan for settling test-file layer classification    | Web package spec § 4 and robot-feature TODO settled policy         |
| [`REGRESSIVE_SEQUENCE_REPORTING.md`](./REGRESSIVE_SEQUENCE_REPORTING.md)                   | Plan for privacy-safe regression reporting          | Server store/ingest composition, tests, and package spec           |
| [`ADAPTERS_E2E_JOIN.md`](./ADAPTERS_E2E_JOIN.md)                                           | Adapter-side joining constraints                    | ADRs 10/11/13/25, package spec, and browser joining test           |
| [`CONTRACTS_E2E_JOIN.md`](./CONTRACTS_E2E_JOIN.md)                                         | Contracts-side joining constraints                  | Contracts/adapters package specs and browser joining test          |
| [`DOCUMENTATION_AUDIT_AND_RECONCILIATION.md`](./DOCUMENTATION_AUDIT_AND_RECONCILIATION.md) | Whole-repository documentation reconciliation       | Current docs and ROADMAP Phase 8 handoff                           |
| [`ROADMAP.md`](./ROADMAP.md)                                                               | Phased delivery and repository reconciliation       | Current ADRs, specs, implementation, TODOs, and READMEs            |
| [`SUBMISSION_NOTES.md`](./SUBMISSION_NOTES.md)                                             | Partial evaluator notes for ADRs 1–6                | Current ADRs, README/TODO handoff, and external review record      |
| [`WEB_ALIGNMENT_PLAN.md`](./WEB_ALIGNMENT_PLAN.md)                                         | Web package alignment (schema v3, live detail)      | ADR 34 (register D25), web/page specs, and TODO P2.7/P3.3          |
| [`WEB_FOLDER_VOCABULARY.md`](./WEB_FOLDER_VOCABULARY.md)                                   | ADR 36 web folder migration                         | ADR 36, merge PR #38, package spec, and current README folder maps |
| [`WEB_TEST_LAYOUT_AND_DECOMPOSITION.md`](./WEB_TEST_LAYOUT_AND_DECOMPOSITION.md)           | Web test placement, decomposition, and fetch dedupe | Merged PRs #31–#38, current implementation, specs, and ADR 36      |
