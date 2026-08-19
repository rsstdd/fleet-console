<!-- Adding a vendor dialect. Open with:
       gh pr create --template add-vendor.md
     or append ?template=add-vendor.md to the compare URL.
     For anything else, use the default template. -->

## Vendor

**Dialect:**
**How it disagrees with the others:**

<!-- ADR 1 treats these disagreements as load-bearing fixtures, not flavour.
     Name them concretely: units, timestamp format, nesting, battery scale,
     fields present or absent, anything undocumented it sends. -->

## The shape of the change

ADR 1: adding a vendor is one adapter module plus its fixtures. It never means
editing the canonical envelope.

- [ ] One new module under `packages/adapters`, plus recorded fixtures.
- [ ] `packages/contracts` is untouched — **or**, if this vendor genuinely
      required a new capability, that contracts change landed first and is
      linked here, with the panel mapping in `web` following it (ADR 1).
- [ ] No `if (vendor)` introduced anywhere in `features` or `shared`. Panels
      render from declared capabilities; absence is the interface (Principle 3).

## Normalization

- [ ] `reportedAt` normalized to epoch-milliseconds; `receivedAt` is left as the
      server's own receipt instant (ADR 1).
- [ ] Units converted into the canonical set rather than carried through.
- [ ] Status mapped into `idle | busy | charging | fault | unknown`. Health
      severity stays a separate field and is not folded into status (ADR 1).
- [ ] Vendor-specific payloads are declared capabilities — key presence _is_ the
      declaration. Not hard-coded fields left empty for other vendors (ADR 1).

## Unknown fields

- [ ] Fields this adapter does not recognize are counted, not dropped (ADR 1).
- [ ] The count reaches the health endpoint, and it is per adapter — the
      diagnostics panel must not imply per-robot precision it does not have.

## Tests

- [ ] Adapter contract tests cover valid, missing, malformed, boundary, and
      additional-field payloads (Principle 2).
- [ ] Malformed payloads are rejected at the boundary. Nothing is coerced.

## Verification

- [ ] CI is green.
- [ ] The new vendor's robots were viewed in the running console: capability
      panels appear where declared and are absent where not (Principle 10).

## Judgment

**What did this vendor force you to reconsider in the canonical model, if anything?**

<!-- If the answer is "nothing", the boundary held. If it is "something", say so
     here — that is ADR 1's open question meeting real code, and it belongs in
     the ADR's Observed consequences. -->
