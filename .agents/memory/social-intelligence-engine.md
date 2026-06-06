---
name: Social Intelligence Engine — Attention Briefing Architecture
description: Three-mode Social Intelligence Engine (FULL SOCIAL/PARTIAL SOCIAL/PROXY) added to the Trading Entry Checker Attention Briefing. Covers mode detection, blending, scoring, history, and dynamic checklist weights.
---

## Rule
`computeAttentionBriefing` now contains a Social Intelligence Engine at its tail (after all proxy signal calculations). It detects mode, blends scores, re-tiers, and returns expanded fields. `window._tecAttentionMode` is set here.

**Why:** Real social data (X/Twitter, Telegram, Reddit) should override or augment proxy-only signals when available, giving more accurate attention tier scoring.

## Mode Detection
- `FULL SOCIAL` (confidence HIGH): X AND Telegram data both available (h1 or h24 > 0).
- `PARTIAL SOCIAL` (confidence MEDIUM): any one platform available.
- `PROXY` (confidence LOW): no social data entered.
`window._tecAttentionMode` stores the current mode; read by `buildRecommendedEntryChecklist`.

## Social Score Composition (weights)
Velocity 35% | Acceleration 20% | Persistence 15% | Quality 15% | Source Expansion 10% | Narrative 5%

## Blending: Social 70% / Proxy 30%
`_blendPct = socialScore * 0.70 + proxyCorePct * 0.30` (PROXY mode: blendPct = proxyCorePct unchanged).

## Dynamic Checklist Weights (buildRecommendedEntryChecklist)
- FULL SOCIAL:    Sec 35%  · Str 35%  · Att 30%
- PARTIAL SOCIAL: Sec 38%  · Str 38%  · Att 24%
- PROXY:          Sec 42.5% · Str 42.5% · Att 15%

## Platform Weights (weighted mention aggregation)
X (ticker/CA avg): 0.85 | Telegram: 1.2 | Reddit: 0.5

## Attention History
- Key: `tec_att_history`. Max 50 entries.
- Functions: `attHistLoad()`, `attHistSave(ab, d)`, `attHistRender()`, `attHistClearAll()`, `attHistClearOne(id)`.
- `attHistSave` is called inside `buildAttentionBriefingHTML` after `computeAttentionBriefing`.
- Re-scan comparison: when same CA appears in history, `prevSnap` is stored in the new entry and rendered as a delta row (RISING/FADING/STABLE/etc. with % and mention change).
- Init: `attHistLoad(); attHistRender();` called at end of script after `wlLoad()`.

## Form Fields (21 social fields)
X: fSocXM15/30/1h/3h/24h, fSocXUp1h/24h, fSocXRt
Tg: fSocTgM15/30/1h/3h/24h, fSocTgCh1h/24h, fSocTgFwd
Rd: fSocRdM1h/24h, fSocRdUp1h/24h
All added to WL_FIELDS and gatherFormData.

## Social Intelligence Display (buildAttentionBriefingHTML)
Shown only when `ab.attMode !== 'PROXY'`. Inserted between pillars section and the first horizontal divider. Shows: Velocity, Acceleration, Persistence, Quality, Source Expansion, Weighted Mentions time windows.

## How to apply
- To add new social platforms: add platform weight constant, add to `wMentions` aggregation, update `platformsActive`, update `attQualScore` unique-ratio pooling.
- `_wLabel` in checklist auto-updates based on `window._tecAttentionMode` — no manual sync needed.
- `toggleSocialDataPanel()` controls the HTML panel collapsing (uses `socialDataPanel` + `socialDataChevron` IDs).
