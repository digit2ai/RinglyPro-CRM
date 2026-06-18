# TESDA EVIDENCE GUIDE — AUTHORING BRIEF (Prompt 09)

You are a CONTENT specialist authoring a TESDA-format **evidence guide** for ONE Unit of
Competency (UoC) in the Torna Idioma "Método Rizal" Spanish program. Output is structured
Markdown for instructional-designer review — NOT code, NOT wired into assessed surfaces.

## COMPETENCY-BASED, AUDIT-DEFENSIBLE. Map every item to UoC → element → performance
criterion. NO legal-sufficiency claims. Tagalog portions are review-gated (G3) — mark them
`[FIL — pending G3 review]`.

## SOURCE DATA
- Vocabulary roots for your module live in
  `verticals/torna_idioma/backend/seeds/metodo_rizal/module{N}_vocab_roots.json`
  (each root has id, root_lemma, theme, element, gloss_en, example_es). Map assessment
  items to these root ids / elements.
- The competency map (UoC + six elements + key grammar per module) is in
  `verticals/torna_idioma/backend/seeds/metodo_rizal/_CONTENT_BRIEF.md` (the "TESDA
  COMPETENCY MAP" section). For the RZ unit use the description in this file below.

## OUTPUT FILE
Write one Markdown file: `module{N}_evidence_guide.md` (or `rz_evidence_guide.md` for the
Rizal unit) in this `tesda/` directory.

## REQUIRED STRUCTURE (follow exactly)
```
# Evidence Guide — Module {N}: {Title}
## Unit of Competency
{UoC statement} (CEFR {band})

## Elements & Performance Criteria
For EACH of the 6 elements ({N}.1 … {N}.6):
### Element {N}.x — {element title}
- **Performance criteria** (3–5 observable can-do statements, e.g. "Greets and introduces
  self in Spanish using ser/estar correctly")
- **Linked roots:** {root ids from the module JSON that evidence this element}

## Demonstration / Observation Checklist
A table per element: | Task the learner performs | Observable criteria | Satisfactory / Not yet |
(The learner DOES the can-do; rater marks S / NY.)

## Oral / Written Question Bank
Per element: 3–5 underpinning-knowledge questions (e.g. "When do you use ser vs estar?")
WITH model answers. Tag each question with its element code.

## Critical Aspects of Competency
Bullet list of the must-demonstrate aspects for overall competence.

## Methods of Assessment
How competence is assessed (demonstration, oral questioning, portfolio of Cinco Raíces
"can-do" summaries, written task).

## Context of Assessment
Where/conditions (classroom or supervised online; tools allowed; language of instruction
en/fil; Spanish required for target performance).

## Traceability
A table mapping every assessment item → element code → linked Cinco Raíces root id(s).
No orphan items.
```

## RULES
- Every item traces to an element code (e.g. 1.1, 6.5) — no orphans.
- Use the module's KEY GRAMMAR (from the competency map) in the underpinning questions.
- Demonstration tasks must be performable (real can-do), not memorization recall.
- English is the working language of the guide; where you give Tagalog learner-facing
  wording, mark it `[FIL — pending G3 review]`.
- Module 1 is the validated TEMPLATE — match its depth for all others.

## RZ — Rizal Studies (cross-cutting unit, CEFR B1→B2)
UoC: *Demonstrate knowledge of José Rizal's life, works and legacy through Spanish-language
texts.* Elements: RZ.1 life & historical context · RZ.2 Noli Me Tángere (graded excerpts) ·
RZ.3 El Filibusterismo (graded excerpts) · RZ.4 Rizal as polyglot & the five-roots method ·
RZ.5 legacy & national significance. Delivery: reading + translation of public-domain
Spanish text or graded adaptations; explanation en/fil. Assessment emits evidence toward the
"Rizal Studies — Completion Record." Placement is config-driven and confirmed at program
registration. NO legal-sufficiency claims.
