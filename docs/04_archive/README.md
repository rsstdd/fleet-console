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

| File                                                                       | What it was                                      | Superseded by                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| [`REMEDIATION_LOG.md`](./REMEDIATION_LOG.md)                               | Phase 3 plan for restructuring the ADR field set | The ADR set itself; all thirty files carry the new shape         |
| [`TODO_DECISION_AUDIT_2026-08-20.md`](./TODO_DECISION_AUDIT_2026-08-20.md) | Point-in-time TODO and open-decision audit       | Current `TODO.md`, package TODOs, and `docs/05_plans/ROADMAP.md` |
| [`DOCUMENT_LIFECYCLES.md`](./DOCUMENT_LIFECYCLES.md)                       | Plan for enforceable ADR and plan lifecycles     | `docs/DOCUMENT_LIFECYCLES.md` and its CI checks                  |
