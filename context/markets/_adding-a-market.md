# Adding a second market (opt-in)

The kit is **single-market by default** — set your one market in
`context/marketing.config.json` (`primaryMarket`, e.g. `VN`). Claims in
`context/claims.json` are **flat**: each carries a `market` field and its own
approved wording/evidence/anchors. You do **not** need any multi-market
structure unless you actually operate in more than one market.

## When you genuinely run a second market

1. **Config** — add it to `marketing.config.json`:
   ```json
   { "primaryMarket": "VN", "markets": ["VN", "TH"] }
   ```
2. **Market policy file** — create `context/markets/<market>.md` from
   `context/markets/_template.md` (language(s), tone, channels, legal regime,
   consent rules, seasonality). Locale ≠ market: TH may be Thai + PDPA, etc.
3. **Claims** — give the second market its own approved claims. Two options:
   - **Simplest (recommended):** duplicate the claim with a new `claim_id` and
     `"market": "TH"`, translated wording, and its own evidence/approver.
   - **Per-locale upgrade:** if you want ONE `claim_id` with per-market wording,
     use the nested form the gate still supports —
     ```json
     { "claim_id": "CLM-008", "source": "...",
       "locales": { "VN": { "wording": "...", "status": "approved", ... },
                    "TH": { "wording": "...", "status": "unverified", ... } } }
     ```
     A claim approved for VN does **not** license a TH publish until TH is
     approved separately.
4. **Run the gate per market:**
   ```
   bash .prepkit/packs/marketing/gates/scripts/claims-check.sh <asset> --mode publish --market TH
   node .prepkit/scripts/context-resolve.mjs --market TH
   ```

Both the flat and per-locale forms work in the same registry, so you can adopt
per-market wording only for the specific claims that need it.
