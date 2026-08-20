# End-to-end contract join — completed

**Authority:** Historical only. This completed joining checklist is retained for provenance;
current ADRs and package specifications govern behavior.
**Archived:** 2026-08-20
**Superseded by:** the contracts and adapters package specifications plus the
raw-fixture-to-browser joining test.
**Completion:** 20 August 2026.

The joined path is raw recorded vendor fixture → adapter registry → `AdapterEnvelope` →
server freshness/wire encoding → strict browser decode → robot read model. It covers A, B,
and C without giving contracts a vendor dependency.

The assumptions that remain binding are:

- `withFreshness` is the only transition from adapter to canonical envelope;
- `SCHEMA_VERSION` is interpreted exactly rather than coerced;
- `ContractIssue` is the single boundary-failure vocabulary;
- browser decoding cost remains inside ADR 22's enforced bundle budget.

Future wire changes must update all producers, strict decoders, fixtures, and joining tests
together.
