# Método Rizal — QA Report (Prompts 02/08 gates)

Generated for the production pipeline. Module 1 (40 authored gold roots) is on the assessed surface (ti_vocab_roots). Modules 2-12 (machine-generated) are in ti_vocab_roots_staging, qa_status=pending, and are NOT visible to learners until Gate G3 sign-off.

## Per-module counts

| Module | CEFR | Roots | Unit of Competency |
|---|---|---|---|
| 1 | A1 | 40 | Communicate basic personal and social information in Spanish (ASSESSED — gold standard) |
| 2 | A1-A2 | 35 | Describe daily routines, schedules and plans in Spanish. |
| 3 | A2 | 35 | Conduct everyday consumer and shopping transactions in Spanish. |
| 4 | A2 | 35 | Navigate places, directions and transportation in Spanish. |
| 5 | A2-B1 | 35 | Discuss leisure, preferences and social plans in Spanish |
| 6 | B1 | 35 | Communicate about health, the body and well-being in Spanish (CEFR B1) |
| 7 | B1 | 35 | Communicate in work and professional contexts in Spanish |
| 8 | B1-B2 | 35 | Discuss culture, traditions and the arts in Spanish |
| 9 | B2 | 35 | Communicate about media, technology and information in Spanish (CEFR B2) |
| 10 | B1-B2 | 35 | Manage travel and tourism interactions in Spanish (CEFR B1-B2) |
| 11 | B2 | 35 | Discuss environment and sustainability in Spanish. |
| 12 | B2 | 35 | Engage with contemporary culture and society in Spanish (CEFR B2) |

**Total roots:** 425 (40 assessed + 385 staged).

## QA Gate results

- **G1 Schema** — PASS. All 12 modules parse; every root has the full field set; every session has exactly 5 roots; ids unique and prefixed m{N}-. (425 unique ids.)
- **G2 Spanish correctness** — PASS (automated + per-agent review). example_es exercises each module key grammar; derived_forms are real family members. One Cyrillic homoglyph (m3) and one duplicate derived form (m9) were caught and fixed during generation. No rows quarantined.
- **G4 Level fit** — PASS. Vocabulary/grammar match each module CEFR band (M2-4 A1-A2, M5-8 B1, M9-12 B2).
- **G5 Coverage** — PASS. All six elements present in every module (verified by element-tag scan).
- **G3 Tagalog native review** — PENDING (HARD GATE). 385 staged gloss_fil/example_fil rows exported for native review.

## G3 review sheet

`g3_review/g3_tagalog_review_sheet.csv` — columns: module, root_id, element, root_lemma, gloss_fil, example_fil, gloss_en (English back-gloss), example_en, qa_status, reviewer_ok (Y/N), reviewer_notes.

**Promotion procedure (after native sign-off):** for each approved module N, copy rows from ti_vocab_roots_staging into ti_vocab_roots:

```sql
INSERT INTO ti_vocab_roots (id,module,level,theme,element,root_lemma,pos,derived_forms,gloss_en,gloss_fil,example_es,example_en,example_fil,sort_order)
SELECT id,module,level,theme,element,root_lemma,pos,derived_forms,gloss_en,gloss_fil,example_es,example_en,example_fil,sort_order
FROM ti_vocab_roots_staging WHERE module = N AND qa_status = 'g3_approved'
ON CONFLICT (id) DO NOTHING;
```

Until promoted, learners only see Module 1 (current_module defaults to 1; daily-session pulls only from ti_vocab_roots).
