# `canonical-fleet` — Fleet Console Design Profile

**Written:** 18 August 2026
**Revision 2.** Scoped to the surfaces actually built. Status vocabulary now derives from the canonical model rather than from the palette. Light mode folded into the tenant axis. Commercial typefaces removed.

This profile covers the seven views in the submission and nothing else. A design system specifying more than the product uses is a document nobody verified.

---

## 0. Principles

1. **Status before brand.** Semantic state colours are the primary signal. The accent never encodes state.
2. **The palette follows the contract.** Every status token maps to a value the canonical envelope can actually carry. No token exists for a state the adapters cannot produce.
3. **Freshness travels with value.** Any telemetry value on screen is accompanied by its age, and a value that is not current is visually de-emphasised rather than merely annotated.
4. **Density with clarity.** More information per viewport without sacrificing legibility.
5. **Data reads as data.** Mono with tabular numerals for identifiers, timestamps, coordinates and percentages.
6. **Borders before shadows.** Structure comes from hairlines. Elevation is minimal.

---

## 1. Themes and tenants

Dark and light are not a user preference. They are the two tenant profiles, and switching tenant switches theme, wordmark, accent and feature availability together through `config`. One mechanism demonstrates white-label deployment and dual-theme parity at once.

|               | Tenant A                       | Tenant B                      |
| ------------- | ------------------------------ | ----------------------------- |
| Profile       | Dark, operational control room | Light, warm paper field       |
| Wordmark      | From `config.tenant.wordmark`  | From `config.tenant.wordmark` |
| Accent        | `--accent`                     | `--accent`                    |
| Feature flags | All panels enabled             | One panel disabled            |

Attribute `data-theme="dark" | "light"` on `<html>`, set from tenant configuration at boot. No `localStorage` persistence and no `prefers-color-scheme`, because a user preference store is a third kind of state and buys nothing for the argument.

Nothing in `features` or `entities` reads a colour, a wordmark or a flag directly. All three come from `config`.

---

## 2. Colour

### 2.1 Surfaces and text

| Token              | Dark      | Light     | Role                                  |
| ------------------ | --------- | --------- | ------------------------------------- |
| `--bg`             | `#141816` | `#F4F2EC` | Page background                       |
| `--surface`        | `#1C211E` | `#FFFFFF` | Cards, panels                         |
| `--surface-raised` | `#232925` | `#FFFFFF` | Inputs, sticky headers                |
| `--surface-sunken` | `#101412` | `#EBE8E0` | Table headers, wells                  |
| `--line`           | `#2E3430` | `#D9D4C8` | Borders, dividers                     |
| `--line-strong`    | `#3F4742` | `#C4BDB0` | Emphasised borders                    |
| `--ink`            | `#E8E6E1` | `#1A1D1B` | Primary text                          |
| `--ink-soft`       | `#C5C2B8` | `#3D4240` | Secondary text                        |
| `--ink-muted`      | `#8E8B82` | `#6B6860` | Captions, metadata, last-known values |

### 2.2 Accent

| Token            | Dark      | Light     | Role                                     |
| ---------------- | --------- | --------- | ---------------------------------------- |
| `--accent`       | `#C2A671` | `#A67C3A` | Wordmark, primary buttons, section ticks |
| `--accent-hover` | `#A8905E` | `#8F6A30` | Primary button hover                     |
| `--accent-text`  | `#C2A671` | `#8F6A30` | Text and icon accent on surfaces         |

Both values are tenant-supplied. The table records the defaults.

### 2.3 Status

Six tokens, one per presentational variant. Each corresponds to a state the canonical model can produce. `maintenance` and `info` are removed, because no adapter emits them.

| Token               | Dark      | Light     | Presentational meaning                |
| ------------------- | --------- | --------- | ------------------------------------- |
| `--status-neutral`  | `#6B6560` | `#5A554F` | Idle, present and doing nothing       |
| `--status-active`   | `#3D9B6E` | `#2F7D56` | Busy, executing                       |
| `--status-charging` | `#3B82A0` | `#2E6A86` | At dock, charging                     |
| `--status-degraded` | `#C4A035` | `#A67C1A` | Reporting reduced health              |
| `--status-fault`    | `#C75138` | `#B33E2A` | Fault reported                        |
| `--status-unknown`  | `#8E8B82` | `#6B6860` | Never reported, or state not knowable |

Each has `--status-*-bg` and `--status-*-border` tint tokens for chips.

**Rules.** Status colour is always paired with a text label. Chips are tinted and outlined, never solid. The accent is never used for status. Fault remains the danger colour in both themes.

### 2.4 Feedback

Feedback tokens are aliases, not values, so the two sets cannot drift.

```
--success: var(--status-active);
--warning: var(--status-degraded);
--error:   var(--status-fault);
```

### 2.5 Freshness

Freshness is not a status and does not share the status palette. It is expressed by emphasis, not by hue.

| Freshness   | Treatment                                                                            |
| ----------- | ------------------------------------------------------------------------------------ |
| LIVE        | Full opacity, `--ink`                                                                |
| STALE       | `--ink-soft`, dotted underline on the age                                            |
| UNREACHABLE | `--ink-muted`, status chip drops to outline only, label suffixed with `(last known)` |
| UNKNOWN     | `--ink-muted`, em dash in place of the value                                         |

The suffix matters more than the colour. A reader scanning the status column alone must not be misled about whether a value is current.

---

## 3. Typography

Two families, both open-licensed, so the repository can be public and MIT without a font problem. EB Garamond is removed; a serif reserved for empty states does not justify a font load.

| Role        | Face          | Weights  | Use                                            |
| ----------- | ------------- | -------- | ---------------------------------------------- |
| UI and body | IBM Plex Sans | 400, 500 | All interface text                             |
| Data        | IBM Plex Mono | 400      | Identifiers, timestamps, coordinates, payloads |

The two share metrics and design intent, so mixed lines align without adjustment.

**Scale**

| Token      | Size / line height        | Use                            |
| ---------- | ------------------------- | ------------------------------ |
| `h1`       | 1.75rem / 1.2             | Page titles                    |
| `h2`       | 1.25rem / 1.25            | Section titles                 |
| `h3`       | 1rem / 1.3                | Panel titles                   |
| `body`     | 0.9375rem / 1.5           | Default                        |
| `small`    | 0.8125rem / 1.45          | Table cells, secondary UI      |
| `caption`  | 0.75rem / 1.4             | Metadata, data plates          |
| `overline` | 0.6875rem mono, uppercase | Section indices, table headers |

`font-variant-numeric: tabular-nums` on every data column and every live value, so updating values do not shift layout.

---

## 4. Spacing, radius, elevation

Base 4px. Working set 4, 8, 12, 16, 24, 32, 48. Radii 4px for controls and 6px for panels.

| Level | Treatment                             | Use                   |
| ----- | ------------------------------------- | --------------------- |
| 0     | `--bg`                                | Page                  |
| 1     | `--surface` plus 1px `--line`         | Cards, panels, inputs |
| 2     | `--surface-raised` plus subtle shadow | Dropdowns, popovers   |

Level 3 and the density modes are removed, because no view in the submission uses them.

Focus rings use `--accent` and are verified for contrast against `--surface` in both themes.

---

## 5. Components

Structure is identical in both themes and only token values change.

**Status chip.** Tinted background, border, 6px dot, mono label. Outline only when freshness is not LIVE. The accessible name carries the state and the age together, so a screen reader receives the same qualification a sighted reader receives.

**Freshness label.** Chip plus relative age, with the absolute timestamp in mono on the technician surface.

**Buttons.** Primary uses `--accent` with near-black text on dark and white text on light. Secondary is outlined. Ghost and danger as needed.

**Table.** Sticky header, hairline rows, mono tabular data, status and freshness chips, one row per robot.

**Data plate.** Mono caption beneath tables and live snapshots, carrying source and snapshot time.

---

## 6. Contrast verification

Verify before Friday and record the result in the README:

- `--ink` on `--bg` and on `--surface`, both themes
- `--accent-text` on `--surface`, both themes
- Every status label on its own tint background, both themes
- `--ink-muted` on `--surface`, both themes, because the last-known treatment relies on it and must remain legible rather than merely faint

---

## 7. Implementation notes

Single token set at `:root` with a `[data-theme="light"]` override block. No component-level hex or raw pixel spacing outside `shared/ui` and `config`; lint enforces this and a missing token is added rather than worked around.

Real-time values update in place with tabular numerals and no layout shift.

This profile applies to the product console only.
