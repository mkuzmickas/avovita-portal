# AvoVita Portal — Brand Alignment Spec

**For:** Claude Code, working on `portal.avovita.ca` (Next.js)
**Version 1.0 — 19 October 2026**
**Reference implementation:** avovita.ca, already live in this branding

---

## 0. What this is

avovita.ca was rebranded on 19 October 2026. The portal still carries the old
look. This spec makes the two match.

Every contrast figure below was measured, not estimated. Where a combination
fails, the spec says so and gives the alternative. **Do not substitute
"close enough" colours** — several of the near-misses fail accessibility in
ways that are invisible until someone complains.

This spec covers **appearance only**. It does not change booking logic,
pricing, the cart, or the collection-fee behaviour. If a change here would
require touching those, stop and flag it.

---

## 1. The name

The business is **AvoVita**. Not "AvoVita Wellness" — that name is retired.

- Product name in UI, emails, page titles, meta: **AvoVita**
- Tagline, where one is needed: **Private Blood Testing**
- Legal entity, for terms/privacy/receipts: **2490409 Alberta Ltd., operating as AvoVita**

Search the portal for `AvoVita Wellness` and replace with `AvoVita`. The one
exception is any legal or historical text that deliberately records the former
name — if you find one, leave it and flag it rather than guessing.

**Also scrub `FloLabs`.** They are a subcontracted collection provider and are
not to be named in customer-facing copy. Replace per context:

| Current pattern | Use instead |
|---|---|
| "A FloLabs phlebotomist…" | "A certified phlebotomist…" |
| "FloLabs phlebotomists collect…" | "Phlebotomists collect…" |
| "our phlebotomy partner FloLabs" | "our third-party collection provider" |
| "your FloLabs appointment" | "your collection appointment" |

Note the third one also removes the word *partner*, which is being eliminated
brand-wide (see §7).

---

## 2. Colour tokens

Define these once, as CSS custom properties on `:root`, and reference them
everywhere. Do not hardcode hex values in components.

```css
:root{
  /* Surfaces */
  --av-white:        #FFFFFF;
  --av-cream:        #F7F5F0;   /* page alt bands, table zebra striping */
  --av-stone:        #EFEAE0;   /* cards, wells, inset panels */

  /* Greens */
  --av-green:        #14301A;   /* PRIMARY. Headings, nav, primary buttons */
  --av-green-mid:    #1B4D2E;   /* secondary dark bands, hover states */
  --av-green-deep:   #0E2412;   /* deepest band, footer */

  /* Text */
  --av-ink:          #2C2C2C;   /* body copy */
  --av-ink-muted:    #5A5A5A;   /* secondary text, captions, metadata */

  /* Gold — read §3 before using any of these */
  --av-gold:         #B27730;   /* rules and borders on light. NEVER text. */
  --av-gold-deep:    #8A5A17;   /* the ONLY gold allowed as text on light */
  --av-gold-bright:  #E1A652;   /* gold on dark green ONLY */

  /* Lines */
  --av-line:         #E3DED4;   /* borders, dividers, table rules */
}
```

(Full spec saved verbatim — see commit message for date.)

---

## Rest of spec

See the original spec document provided by Mike on 19 Oct 2026. Sections:

- §3 The gold rule (no gold-on-white text)
- §4 Typography (Playfair Display + Inter)
- §5 Components (square-corner uppercase buttons)
- §6 Logo assets
- §7 Language rules (never "partner", never "FloLabs")
- §8 Known traps
- §9 Acceptance checks
- §10 What this spec does not cover

The full spec text should be kept in the implementation branch's PR description
or wherever Mike stores brand docs long-term; the condensed version here is for
quick in-repo reference.
