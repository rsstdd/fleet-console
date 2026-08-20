# AGENTS.md

Docs tree for fleet-console: normative decision records, specifications, plans, and the lifecycle machinery that keeps them synchronized with code. `PRINCIPLES.md` and the repository `AGENTS.md` outrank this file. Docs are authoritative over code; each file's `Authority` marker states its force.

## Directory matrix

| Path                                 | Owns                                                                      | Agent MAY                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `00_adr/`                            | Numbered ADRs — the sole normative decision records                       | Amend without reversing position; supersede via a new ADR; never delete or renumber |
| `01_page-specs/`                     | Route behavior, states, hierarchy, accessibility                          | Edit the single numbered spec; enter via `00_PAGE_SPECS.md`                         |
| `02_component-specs/`                | Reusable presentational component contracts                               | Edit the single numbered spec; enter via `00_COMPONENT_SPECS.md`                    |
| `03_package-specs/`                  | Package responsibility, public API, implementation status                 | State consequences and link ADRs; never repeat decision rationale or status         |
| `04_archive/`                        | Terminal plans, historical audits — never normative                       | Read for history only; add archived plans with date + replacement evidence          |
| `05_plans/`                          | Executable planning documents (`Active` / `Blocked` / `Trigger-deferred`) | Copy `00_TEMPLATE.md`; update the single owning plan; archive terminal plans        |
| `decisions.json`                     | D-id → ADR routing + `mechanicalRules` registry                           | Append contiguous D-ids; open stubs need `next`, resolved entries drop it           |
| `PENDING_ARCHITECTURE_DECISIONS.md`  | Generated open-decision index                                             | Regenerate with `pnpm docs:decisions`; never edit by hand                           |
| `DOCUMENT_LIFECYCLES.md`             | Mandatory decision + plan state machines                                  | Execute its algorithms verbatim before creating/resolving/archiving                 |
| `DESIGN_SYSTEM.md` / `WIREFRAMES.md` | Tokens and visual rules / layout intent only                              | Follow tokens; treat wireframes as intent, not contract                             |
| `ARCHITECTURE_AUDIT.md`              | Historical audit evidence                                                 | Read only; never cite as current truth                                              |

## Lifecycle rules

- Decision state (`Decided` / `Superseded`) and implementation state (`Not started` / `Partial` / `Implemented`) are independent; change implementation state only on evidence.
- Undecided durable questions get the next contiguous D-id with `adr: null` and a non-empty `next`; no reserved ADR numbers.
- Superseding: old ADR keeps its text, gains `**Superseded by:** ADR N`; replacement links back. Never two active normative answers.
- Every mechanically recognizable rule lives in code/lint/test, cites its ADR beside the mechanism, and is registered under `mechanicalRules`.
- Plans declare `**Authority:** Planning only.`, `**Status:**`, `**Updated:** YYYY-MM-DD`. `Blocked` adds `**Blocker:**`; `Trigger-deferred` adds `**Trigger:**`; `Active` carries neither.
- Terminal plans (completed / abandoned / superseded) leave `05_plans/` for `04_archive/` with the archive date and replacement artifact. Never delete a plan for staleness.
- A plan may recommend a decision but cannot ratify one; a fired trigger does not ratify a proposed decision.

## Verify

| Trigger                                                | Command                        |
| ------------------------------------------------------ | ------------------------------ |
| D-id, mapping, `decisions.json`                        | `pnpm docs:decisions`          |
| ADR, spec, plan metadata, mechanical rule, audit, TODO | `pnpm check:architecture-docs` |
| `DESIGN_SYSTEM.md` or token change                     | `pnpm check:tokens`            |
| Large doc diff, pre-commit                             | `pnpm check:diff-size`         |

CI rejects: non-contiguous/duplicate D-ids, duplicate ADR routing, open stubs without `next`, malformed ADR metadata, superseded ADRs without replacement, plan files missing authority/status/date, trigger/blocker metadata on the wrong state, hand-edited generated index, missing ADR citations in registered enforcement.

## Routing

| Find                                 | Look here                                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| Lifecycle algorithm or state machine | `DOCUMENT_LIFECYCLES.md`                                         |
| Decision by D-id or ADR topic        | `decisions.json` → mapped `00_adr/NN_*.md`                       |
| Owning plan                          | Search `05_plans/` by filename or task term; open only the match |
| Spec by package / page / component   | The family's `00_*` index, then the single numbered spec         |
| Binding constraint or conflict       | `PRINCIPLES.md` (repo root)                                      |
| History, superseded work             | `04_archive/`; current ADR/spec/code for present truth           |

## Self-check before commit

- Followed the matching algorithm in `DOCUMENT_LIFECYCLES.md`, not memory.
- Regenerated the pending index if `decisions.json` changed.
- Ran `pnpm check:architecture-docs`; specs/TODOs/READMEs describe the same state as the docs change.
- No rationale duplicated across ADR, spec, and code comments.
