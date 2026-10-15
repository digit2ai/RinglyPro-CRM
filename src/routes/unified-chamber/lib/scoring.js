/**
 * Member-vs-role scoring used for AI invitations and open RFQ matching.
 * Identical semantics to chamber-template/routes/projects.js scoreMember.
 */

// Country synonyms -- AI-generated role.preferred_regions can use either
// "United States", "USA", "US", "U.S.", "America", etc. Canonical member
// country is now restricted to the dropdown list, but the regex/substring
// matcher needs to know these are the same place. Maps lowercased aliases
// to a canonical lowercased form.
const COUNTRY_SYNONYMS = {
  'united states': 'united states', 'usa': 'united states', 'us': 'united states',
  'u.s.': 'united states', 'u.s.a.': 'united states', 'america': 'united states',
  'united states of america': 'united states',
  'united kingdom': 'united kingdom', 'uk': 'united kingdom', 'u.k.': 'united kingdom',
  'great britain': 'united kingdom', 'britain': 'united kingdom', 'england': 'united kingdom',
  'estados unidos': 'united states', 'eeuu': 'united states', 'ee.uu.': 'united states', 'ee. uu.': 'united states',
  'spain': 'spain', 'espana': 'spain', 'españa': 'spain',
  'mexico': 'mexico', 'méxico': 'mexico',
  'brazil': 'brazil', 'brasil': 'brazil',
  'dominican republic': 'dominican republic', 'república dominicana': 'dominican republic',
  'philippines': 'philippines', 'filipinas': 'philippines', 'ph': 'philippines',
  'czech republic': 'czech republic', 'czechia': 'czech republic',
  'germany': 'germany', 'deutschland': 'germany'
};
// Accent-folded, lower-cased: 'Tecnológicas' and 'tecnologia' must meet.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function canonCountry(s) {
  // AI regions often add a gloss: 'Estados Unidos (mercado hispano)'.
  const k = fold(s).replace(/\s*\(.*\)\s*$/, '').trim();
  return COUNTRY_SYNONYMS[k] || k;
}

function scoreMember(member, role) {
  let score = 0;
  let denom = 0;

  if (role.preferred_sectors && role.preferred_sectors.length > 0) {
    // Compare on a 6-letter stem of each word, accent-folded, so the member's
    // dropdown value ('tecnologia', 'comercio_exterior') meets the planner's
    // free text ('Tecnológicas', 'Comercio exterior').
    const ms = fold(member.sector).replace(/_/g, ' ');
    const stem = w => w.slice(0, 6);
    const mStems = ms.split(/[^a-z]+/).filter(w => w.length >= 4).map(stem);
    const hit = ms && role.preferred_sectors.some(x => {
      const r = fold(x).replace(/_/g, ' ');
      if (r && (ms.includes(r) || r.includes(ms))) return true;
      return r.split(/[^a-z]+/).filter(w => w.length >= 4).some(w => mStems.includes(stem(w)));
    });
    score += hit ? 0.4 : 0;
    denom += 0.4;
  }

  if (role.preferred_regions && role.preferred_regions.length > 0) {
    // Canonicalise both sides through COUNTRY_SYNONYMS so "USA", "U.S.",
    // "America", and "United States" all match each other. Also keep the
    // substring fallback for sub-region strings like "florida" or "central
    // florida" inside a role region that includes the country name.
    const mc = canonCountry(member.country);
    const rawMc = fold(member.country);
    const regionList = role.preferred_regions.map(r => fold(r));
    const regionId = member.region_id;
    const match = regionList.some(r => {
      const cr = canonCountry(r);
      if (cr && mc && cr === mc) return true;       // canonical match
      if (rawMc && r && (rawMc.includes(r) || r.includes(rawMc))) return true; // substring fallback
      if (`region${regionId}` === r) return true;
      return false;
    });
    score += match ? 0.2 : 0;
    denom += 0.2;
  }

  if (role.required_skills && role.required_skills.length > 0) {
    const haystack = fold(
      (member.bio || '') + ' ' +
      (member.sub_specialty || '') + ' ' +
      (member.company_name || '')
    );
    // A skill counts when any of its words (4+ letters, stemmed to 6) appears:
    // 'Python / FastAPI' hits on 'python', 'ETL & data pipelines' on 'pipeli'.
    const hits = role.required_skills.filter(sk => {
      const words = fold(sk).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
      if (!words.length) return haystack.includes(fold(sk));
      return words.some(w => haystack.includes(w.slice(0, 6)));
    }).length;
    const ratio = hits / role.required_skills.length;
    score += ratio * 0.3;
    denom += 0.3;
  }

  // 0 or blank means the trust score was never computed (owner and admin
  // accounts are created that way); read it as the neutral default rather
  // than as the worst possible member.
  const trust = parseFloat(member.trust_score);
  score += (trust > 0 ? trust : 0.7) * 0.1;
  denom += 0.1;

  return denom > 0 ? Math.min(1, score / denom) : 0;
}

// The planner is told 1-3 sectors and 1-3 regions per role but does not always
// obey (a real cv-105 role came back with 6 regions and 11 sectors). With that
// many, almost every member earns the sector and region points and the match
// stops telling people apart. Keep the planner's first three of each.
const ROLE_TARGET_MAX = 3;
function capRoleTargets(plan) {
  if (!plan || !Array.isArray(plan.team_roles_required)) return plan;
  for (const r of plan.team_roles_required) {
    if (!r || typeof r !== 'object') continue;
    if (Array.isArray(r.preferred_sectors)) r.preferred_sectors = r.preferred_sectors.slice(0, ROLE_TARGET_MAX);
    if (Array.isArray(r.preferred_regions)) r.preferred_regions = r.preferred_regions.slice(0, ROLE_TARGET_MAX);
  }
  return plan;
}

module.exports = { scoreMember, capRoleTargets, ROLE_TARGET_MAX };
