# Writing Styles

## Style Dimensions Framework

Each dimension is a spectrum. Rate 1–5 for each axis.

| Dimension | 1 (Low) | 5 (High) |
|-----------|---------|---------|
| Tone | Formal | Casual |
| Pace | Measured / deliberate | Fast / punchy |
| Vocabulary | Technical / specialized | Simple / plain |
| Emotion | Reserved / neutral | Expressive / warm |
| Humor | Serious | Playful |
| Perspective | Third person / institutional | First person / personal |
| Authority | Peer / collaborator | Expert / prescriptive |

---

## Pre-Built Style Profiles

### 1. Casual Conversational

**Best for:** B2C, consumer apps, creator economy, newsletters, social content

| Dimension | Score |
|-----------|-------|
| Tone | 5 — Casual |
| Pace | 4 — Fast |
| Vocabulary | 5 — Simple |
| Emotion | 4 — Warm |
| Humor | 3 — Occasional |
| Perspective | 5 — First person |
| Authority | 2 — Peer |

**Signature markers:** contractions always, sentence fragments for punch, "you" and "we" throughout, rhetorical questions, reading level Grade 6–7.

**Sample sentence:** "Honestly? Most landing pages fail for one reason: they try to say everything at once."

---

### 2. Professional Authoritative

**Best for:** B2B SaaS, consulting, enterprise, financial services, legal-adjacent

| Dimension | Score |
|-----------|-------|
| Tone | 2 — Formal-ish |
| Pace | 3 — Measured |
| Vocabulary | 3 — Mixed |
| Emotion | 2 — Reserved |
| Humor | 1 — Rare |
| Perspective | 3 — Mixed |
| Authority | 5 — Expert |

**Signature markers:** data and evidence lead, active voice preferred, no jargon without definition, short paragraphs, reading level Grade 10–12.

**Sample sentence:** "Teams that audit their SaaS stack quarterly recover an average of $18,000 in annual spend."

---

### 3. Edgy Provocative

**Best for:** Challenger brands, VC-backed disruptors, creator-led brands, agencies, consumer tech

| Dimension | Score |
|-----------|-------|
| Tone | 5 — Very casual |
| Pace | 5 — Very fast |
| Vocabulary | 4 — Simple + punchy |
| Emotion | 4 — Strong |
| Humor | 4 — Dry / pointed |
| Perspective | 5 — First person |
| Authority | 4 — Confident |

**Signature markers:** short sentences, deliberate provocations, "we're not for everyone" framing, contrarian angles, rhetorical jabs at convention.

**Sample sentence:** "Your competitor ships daily. You're still in your third brand refresh. Make it make sense."

---

### 4. Luxe Minimalist

**Best for:** Premium/luxury brands, high-end services, lifestyle products, architecture, fashion-adjacent

| Dimension | Score |
|-----------|-------|
| Tone | 3 — Neutral elegant |
| Pace | 2 — Deliberate |
| Vocabulary | 2 — Precise, elevated |
| Emotion | 2 — Restrained |
| Humor | 1 — Absent |
| Perspective | 3 — Mixed |
| Authority | 3 — Implied |

**Signature markers:** fewer words per page than peers, sensory language, quality over quantity framing, white space is intentional, no exclamation points.

**Sample sentence:** "Crafted from a single block of walnut. Designed to last thirty years."

---

### 5. Warm Supportive

**Best for:** Health, wellness, coaching, education, nonprofits, parenting, mental health adjacent

| Dimension | Score |
|-----------|-------|
| Tone | 4 — Warm casual |
| Pace | 3 — Gentle |
| Vocabulary | 5 — Plain |
| Emotion | 5 — Expressive |
| Humor | 2 — Occasional lightness |
| Perspective | 4 — First + second person |
| Authority | 2 — Peer / guide |

**Signature markers:** validating language ("it makes sense that..."), "we" as inclusive, no pressure or scarcity tactics, empathetic openers, reading level Grade 5–6.

**Sample sentence:** "You've already tried the obvious things. What you need isn't more effort — it's a different approach."

---

### 6. Technical Educator

**Best for:** Developer tools, data platforms, infosec, technical documentation marketing, engineering-led brands

| Dimension | Score |
|-----------|-------|
| Tone | 2 — Neutral/direct |
| Pace | 3 — Measured |
| Vocabulary | 2 — Technical where accurate |
| Emotion | 1 — Minimal |
| Humor | 2 — Dry references |
| Perspective | 3 — Mixed |
| Authority | 4 — Expert peer |

**Signature markers:** precise language over fluffy claims, code examples in body copy where relevant, show-don't-tell, no hyperbole, respect for reader's existing knowledge.

**Sample sentence:** "The query planner hits an index on user_id but falls back to a full scan on compound predicates — this explains the latency spike above 10k rows."

---

## YAML Custom Style Format

Use for per-project voice documentation. Commit to `/docs/` or `marketing-product-context`.

```yaml
brand_voice:
  name: "[Brand Name] Voice"
  style_profile: "[Closest pre-built style]"
  dimensions:
    tone: 3          # 1=formal, 5=casual
    pace: 4          # 1=slow, 5=fast
    vocabulary: 4    # 1=technical, 5=simple
    emotion: 3       # 1=reserved, 5=expressive
    humor: 2         # 1=serious, 5=playful
    perspective: 4   # 1=third person, 5=first person
    authority: 3     # 1=peer, 5=expert
  do:
    - "[Behavior to replicate]"
    - "[Sentence pattern to use]"
    - "[Tone marker to include]"
  dont:
    - "[Behavior to avoid]"
    - "[Phrase never to use]"
    - "[Tone to avoid]"
  signature_phrases:
    - "[Brand's characteristic phrase]"
    - "[Another recurring pattern]"
  example_approved:
    - "[Sample sentence matching this voice]"
  example_rejected:
    - "[Sample sentence that violates this voice]"
```

---

## Style Extraction Prompts

Use these when a client has existing copy but no documented voice:

1. "Find 10 sentences from [approved assets] that best represent the brand. What patterns do they share?"
2. "Which of the 6 pre-built styles is closest to these examples? What dimensions differ?"
3. "List 3 phrases that appear repeatedly. Are they intentional or accidental?"
4. "What does this brand never say? What would make a reader think 'that doesn't sound like them'?"
5. "Rate each style dimension 1–5 based on the existing copy. Explain each score with a direct quote."
