'use strict';

/**
 * Filipino → Spanish pronunciation interference profile.
 *
 * A generic pronunciation score ("78/100") tells a learner nothing they can act on.
 * What a Filipino learner of Spanish actually needs is the short, predictable list of
 * sounds where Tagalog transfers badly — and, just as importantly, the list where it
 * transfers PERFECTLY, because those are free wins that an English-speaking learner
 * has to work for. Both belong in the lesson.
 *
 * Sources for the contrasts: Tagalog's phoneme inventory (no native /f/, /v/, /x/, or
 * alveolar trill; five pure vowels; syllable-timed rhythm) against Latin American
 * Spanish. Every entry is keyed to a spelling pattern so a target can be attached to
 * real lesson vocabulary rather than asserted in the abstract.
 */

// Each rule: does this written word exercise the sound, and what does the learner do about it.
const RULES = [
  {
    id: 'f',
    kind: 'contrast',
    sound: '/f/',
    label: 'f',
    // Tagalog has no native /f/; loanwords take /p/ (Filipino "pamilya" < familia).
    test: (w) => /f/i.test(w),
    tip_en: 'Tagalog has no native /f/, so it tends to come out as /p/ — "familia" becomes "pamilya". Bite the lower lip lightly and let the air hiss: f-f-familia.',
    tip_fil: 'Walang katutubong /f/ ang Tagalog, kaya madalas nagiging /p/ — "familia" na nagiging "pamilya". Kagatin nang bahagya ang ibabang labi at hayaang humaging ang hangin.',
  },
  {
    id: 'rr',
    kind: 'contrast',
    sound: '/r/ (trill)',
    label: 'rr',
    // Tagalog has the tap but not the sustained trill.
    test: (w) => /rr/i.test(w) || /^r/i.test(w),
    tip_en: 'Tagalog has the quick tap (as in "para") but not the sustained trill. Start from the tap you already own and let the tongue tip bounce loose behind the teeth — do not force it from the throat.',
    tip_fil: 'May mabilis na tapik ang Tagalog (gaya sa "para") pero walang tuloy-tuloy na "rr". Magsimula sa tapik na kaya mo na at hayaang pumitik nang maluwag ang dulo ng dila.',
  },
  {
    id: 'jota',
    kind: 'contrast',
    sound: '/x/ (j, ge, gi)',
    label: 'j / g',
    test: (w) => /j/i.test(w) || /g[ei]/i.test(w),
    tip_en: 'The Spanish j is further back than the Filipino h — friction at the soft palate, not an open breath. "trabajo", "gente".',
    tip_fil: 'Mas malalim ang Espanyol na j kaysa sa Filipinong h — may kiskisan sa likod ng ngalangala, hindi basta hininga.',
  },
  {
    id: 'd-fricative',
    kind: 'contrast',
    sound: '[ð] (d between vowels)',
    label: 'd',
    test: (w) => /[aeiouáéíóú]d[aeiouáéíóú]/i.test(w),
    tip_en: 'Between vowels the Spanish d softens toward the English "th" in "this" — "nada", "cada". A hard Tagalog /d/ here sounds clipped.',
    tip_fil: 'Sa pagitan ng patinig, lumalambot ang Espanyol na d palapit sa "th" ng Ingles — "nada", "cada".',
  },
  {
    id: 'stress',
    kind: 'contrast',
    sound: 'written accent',
    label: 'stress',
    test: (w) => /[áéíóú]/i.test(w),
    tip_en: 'The written accent is not decoration — it moves the beat of the word. Land the stress exactly where the tilde sits.',
    tip_fil: 'Hindi palamuti ang tuldik — inilalipat nito ang diin ng salita. Idiin nang eksakto kung nasaan ang tuldik.',
  },
  {
    id: 'enye',
    kind: 'advantage',
    sound: '/ɲ/ (ñ)',
    label: 'ñ',
    test: (w) => /ñ/i.test(w),
    tip_en: 'Free win: this is the Filipino "ny" you already say in "niyog". No new sound to learn.',
    tip_fil: 'Libreng panalo: ito ang "ny" na sinasabi mo na sa "niyog". Walang bagong tunog na aaralin.',
  },
  {
    id: 'b-v',
    kind: 'advantage',
    sound: '/b/ (b and v)',
    label: 'b / v',
    test: (w) => /v/i.test(w),
    // English speakers fight this for months. Filipino learners already merge them.
    test_note: true,
    tip_en: 'Free win: Spanish b and v are the SAME sound. English speakers spend months separating them; you never have to.',
    tip_fil: 'Libreng panalo: iisang tunog lang ang b at v sa Espanyol. Hindi mo kailangang paghiwalayin.',
  },
  {
    id: 'vowels',
    kind: 'advantage',
    sound: 'five pure vowels',
    label: 'a e i o u',
    test: () => true, // every word exercises the vowels
    tip_en: 'Free win: Spanish has exactly five pure vowels and so does Tagalog. Keep them clean and short — never let them drift into English diphthongs ("no" is /no/, not /nou/).',
    tip_fil: 'Libreng panalo: lima lang ang malinis na patinig ng Espanyol, gaya rin ng Tagalog. Panatilihing malinis at maikli.',
  },
];

/** Which sounds does this single word exercise? */
function targetsFor(word) {
  const w = String(word || '');
  if (!w) return [];
  return RULES.filter((r) => {
    if (r.id === 'vowels') return false; // global, reported once per lesson not per word
    try { return r.test(w); } catch (e) { return false; }
  }).map((r) => r.id);
}

/**
 * The pronunciation focus for a whole lesson: which contrasts its own vocabulary
 * actually exercises, with an example word drawn from that vocabulary. A rule that
 * no word in the lesson triggers is left out rather than padded in.
 */
function lessonFocus(terms) {
  const words = (terms || []).map((t) => t.term || '').filter(Boolean);
  const focus = [];

  for (const rule of RULES) {
    if (rule.id === 'vowels') continue;
    const hits = words.filter((w) => {
      try { return rule.test(w); } catch (e) { return false; }
    });
    if (!hits.length) continue;
    focus.push({
      id: rule.id,
      kind: rule.kind,
      sound: rule.sound,
      label: rule.label,
      examples: hits.slice(0, 4),
      count: hits.length,
      tip_en: rule.tip_en,
      tip_fil: rule.tip_fil,
    });
  }

  // Vowel purity applies to every lesson, so it anchors the list rather than
  // competing with the word-specific contrasts.
  const vowels = RULES.find((r) => r.id === 'vowels');
  focus.push({
    id: vowels.id,
    kind: vowels.kind,
    sound: vowels.sound,
    label: vowels.label,
    examples: words.slice(0, 3),
    count: words.length,
    tip_en: vowels.tip_en,
    tip_fil: vowels.tip_fil,
  });

  // Contrasts (the work) before advantages (the encouragement), each by how much
  // of this lesson's vocabulary actually exercises them.
  return focus.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'contrast' ? -1 : 1;
    return b.count - a.count;
  });
}

module.exports = { RULES, targetsFor, lessonFocus };
