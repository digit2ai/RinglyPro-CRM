# MÉTODO RIZAL — CONTENT GENERATION BRIEF (Modules 2–12)

You are a CONTENT specialist generating gold-standard Spanish vocabulary datasets for the
Torna Idioma "Método Rizal" learning engine (Filipino + English learners of Spanish).

## EXEMPLAR (match this EXACTLY in structure, density, tone, field set)
`module1_vocab_roots.json` in this directory is the gold standard. Every module you write
must have the identical key names and key order per root:
`id, root_lemma, pos, derived_forms, gloss_en, gloss_fil, example_es, example_en, example_fil`
and identical top-level shape:
`schema_version, module, level, title_es, title_en, title_fil, tesda_unit_of_competency, method, sessions[]`
Each session object: `session, theme, element, roots[]`.

## HARD RULES
1. **6–8 sessions of EXACTLY 5 roots each** (≈30–40 roots/module). Distribute roots across
   the module's six elements/themes in syllabus order. Tag each root's `theme` + `element`.
2. **ids** unique and prefixed `m{N}-` (e.g. `m4-viajar`). Never reuse a Module 1 id or
   another module's id. Later modules may RECYCLE earlier roots only inside example
   sentences, never as a new root entry.
3. **derived_forms**: 2–4 REAL members of the word family (genuine derivations, not just
   padded inflections where a real family exists).
4. **example_es**: natural, correct standard Spanish AT THE MODULE'S CEFR LEVEL, and it must
   actually exercise that module's KEY GRAMMAR (see map below). E.g. M4 uses past tense +
   imperative; M6 uses subjunctive for advice.
5. **gloss_en** natural English; **gloss_fil** best natural Tagalog (proper spelling +
   diacritics: ñ, etc.); **example_en** + **example_fil** are faithful translations of
   `example_es`. Keep Tagalog register consistent and respectful.
6. Make examples Filipino-relevant where natural (local places, names, contexts) at lower
   levels. You MAY reference Rizal and his works from M8 onward.
7. Output: valid JSON, UTF-8, identical key names/order to the exemplar, NO comments, NO
   trailing commas. Include the module's `tesda_unit_of_competency` string from the map.
8. Write your file to `module{N}_vocab_roots.json` in this directory. Then verify it parses
   with `node -e "JSON.parse(require('fs').readFileSync('module{N}_vocab_roots.json','utf8')); console.log('OK')"`.

NOTE: All generated content lands in a QA STAGING table and learners see English until a
native Tagalog reviewer signs off (Gate G3). Still produce your best natural Tagalog.

## TESDA COMPETENCY MAP (your module's spec)

**M2 — A Day in the Life · CEFR A1→A2** · UoC: *Describe daily routines, schedules and plans in Spanish.*
Elements: 2.1 routines & city places · 2.2 schedules/times of day · 2.3 days/months & prepositions of time · 2.4 common actions (reg/irreg present) · 2.5 frequency adverbs · 2.6 future plans. Key grammar: reflexive present, adverbs of time/frequency, near future (ir a + inf).

**M3 — We Are What We Consume · CEFR A2** · UoC: *Conduct everyday consumer and shopping transactions in Spanish.*
Elements: 3.1 home & furniture (ser/estar + adj) · 3.2 shopping/stores (DO/IO pronouns) · 3.3 clothing (demonstratives) · 3.4 food/restaurants (gustar/preferir) · 3.5 quantities/prices (numbers, comparatives of equality) · 3.6 asking/answering questions.

**M4 — Places and Transportation · CEFR A2** · UoC: *Navigate places, directions and transportation in Spanish.*
Elements: 4.1 directions/locations (directional prepositions) · 4.2 transport (movement verbs) · 4.3 at the airport (present continuous) · 4.4 city/tourist sights (past tense reg/irreg) · 4.5 asking/giving directions (imperative tú/usted) · 4.6 travel expressions.

**M5 — Your Habits Speak for You · CEFR A2→B1** · UoC: *Discuss leisure, preferences and social plans in Spanish.*
Elements: 5.1 free time/hobbies (reflexives across tenses) · 5.2 cinema/music (preterite vs. present perfect) · 5.3 sports/outdoor (modal verbs: ability/possibility) · 5.4 events/shows (conditional for wishes/courtesy) · 5.5 opinions/preferences (subjunctive) · 5.6 plans/invitations (prepositions of date/time).

**M6 — Your Body Is Your Temple · CEFR B1** · UoC: *Communicate about health, the body and well-being in Spanish.*
Elements: 6.1 health/wellness (ser/estar + adj) · 6.2 doctor's office (DO/IO pronouns) · 6.3 healthy habits/nutrition (comparatives/superlatives) · 6.4 sports/exercise (gerund) · 6.5 symptoms/advice (subjunctive for wishes/advice) · 6.6 wishes/recommendations (conditional).

**M7 — What Do You Do for a Living? · CEFR B1** · UoC: *Communicate in work and professional contexts in Spanish.*
Elements: 7.1 work/professions (ser/hacer) · 7.2 skills/qualities (qualifying/possessive adj) · 7.3 interviews/CV (past tenses for experience) · 7.4 work environment (subjunctive for hypotheticals) · 7.5 office expressions (prepositions of place/relationship) · 7.6 work experience (preterite/imperfect/present perfect).

**M8 — Culture and Traditions · CEFR B1→B2** · UoC: *Discuss culture, traditions and the arts in Spanish.*
Elements: 8.1 festivities (present perfect/preterite; comparatives/superlatives) · 8.2 art/cultural expressions (present subjunctive for opinion) · 8.3 literature/writers (narrative connectors; past tenses) · 8.4 gastronomy (descriptive adj/adv) · 8.5 social customs/protocol (courtesy forms of address) · 8.6 folklore (present/past contrast). Rizal tie-in: element 8.3 is the natural anchor for the Rizal Studies unit.

**M9 — Media and Technology · CEFR B2** · UoC: *Communicate about media, technology and information in Spanish.*
Elements: 9.1 media/news (present/past contrast) · 9.2 social media (passive voice; DO/IO with communication verbs) · 9.3 tech vocabulary (descriptive adj/adv) · 9.4 media influence (impersonal passive) · 9.5 advertising/persuasion (subjunctive in recommendations) · 9.6 tech expressions (prepositions of location/connectivity).

**M10 — Travel and Tourism · CEFR B1→B2** · UoC: *Manage travel and tourism interactions in Spanish.*
Elements: 10.1 trip planning (future tenses) · 10.2 accommodation/reservations (prepositions of place) · 10.3 activities/excursions (transitive/intransitive verbs) · 10.4 local culture (imperative + courtesy) · 10.5 emergencies (modal verbs: need/obligation) · 10.6 traveler expressions (interrogatives).

**M11 — Environment and Sustainability · CEFR B2** · UoC: *Discuss environment and sustainability in Spanish.*
Elements: 11.1 environment/awareness (present subjunctive for wishes) · 11.2 problems/solutions (conditional for hypotheticals) · 11.3 recycling (indefinite pronouns/quantifiers) · 11.4 renewable energy (relative pronouns) · 11.5 ecotourism (modal verbs I) · 11.6 individual actions (modal verbs II).

**M12 — Contemporary Culture and Society · CEFR B2** · UoC: *Engage with contemporary culture and society in Spanish.*
Elements: 12.1 art/cultural expressions (descriptive adj/adv) · 12.2 music/genres (present-tense tastes) · 12.3 cinema/TV (opinion expressions) · 12.4 fashion/trends (present/future opinion) · 12.5 gastronomy (present/past experiences) · 12.6 customs/celebrations (adverbs of time/frequency).

## CEFR level string per module (use in the `level` field)
M2 "A1-A2" · M3 "A2" · M4 "A2" · M5 "A2-B1" · M6 "B1" · M7 "B1" · M8 "B1-B2" · M9 "B2" · M10 "B1-B2" · M11 "B2" · M12 "B2"
