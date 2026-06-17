'use strict';

/**
 * Rizal Studies — CONFIG-DRIVEN placement, required sections, and pass threshold.
 *
 * Per PART A §5 + PART D: required sections and the pass threshold must NEVER be
 * hard-coded into UI/business logic; they are confirmed at program registration
 * and may differ by institution (RA 1425 vs TESDA scope). Override via env without
 * a code change. The artifact is a "Completion Record," NOT a legal certificate.
 */

function parseSections(envVal, fallback) {
  if (!envVal) return fallback;
  const list = String(envVal).split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

const REQUIRED_SECTIONS = parseSections(
  process.env.TI_RIZAL_REQUIRED_SECTIONS,
  ['rz1', 'rz2', 'rz3', 'rz4', 'rz5']
);

const PASS_THRESHOLD = Number(process.env.TI_RIZAL_PASS_THRESHOLD || 70); // percent

module.exports = {
  REQUIRED_SECTIONS,
  PASS_THRESHOLD,
  ARTIFACT_LABEL: 'Rizal Studies — Completion Record',
  // The UI must not assert legal sufficiency; this disclaimer is surfaced verbatim.
  DISCLAIMER:
    'This Completion Record documents study of José Rizal\'s life and works through ' +
    'Spanish-language texts within the Torna Idioma program. It is a program record, ' +
    'not a government-issued certificate or a statement of legal compliance with any ' +
    'specific accreditation requirement.',
};
