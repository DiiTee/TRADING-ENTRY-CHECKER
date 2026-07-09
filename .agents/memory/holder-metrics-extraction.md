---
name: Holder metrics extraction — computeHolderMetrics()
description: Shared holder-quality/momentum/divergence calc used by both initial structural analysis and post-fetch refresh; new fields must be propagated in both call sites.
---

## Rule
`computeHolderMetrics(hcMcap, trendState)` is the single source of truth for holder count quality, momentum, and divergence. It's called from two places: inline in `computeStructuralAnalysis()` (destructured field-by-field into local vars, then spread into the returned object) and in `refreshHolderMetricsOnAnalysis(sa)` (spreads the whole return object onto an existing `sa` via `for...in`).

**Why:** `refreshHolderMetricsOnAnalysis` copies the full object, but `computeStructuralAnalysis` only copies fields it explicitly names. Adding a new field to `computeHolderMetrics`'s return value without also adding it to `computeStructuralAnalysis`'s destructuring + return object means the field silently exists after a refresh but is `undefined` on first render — a hard-to-notice runtime gap, not a syntax error.

## How to apply
When adding any new field to `computeHolderMetrics()`'s return object, also add it in `computeStructuralAnalysis()`: (1) as a local var pulled from `_hm.<field>`, and (2) in the final returned structuralAnalysis object literal. Any UI code reading `sa.<newField>` should still use a defensive fallback (`!= null ? ... : default`) since `sa` can come from either code path.
