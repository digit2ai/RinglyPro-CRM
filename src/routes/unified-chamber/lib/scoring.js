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
  'spain': 'spain', 'espana': 'spain', 'españa': 'spain',
  'mexico': 'mexico', 'méxico': 'mexico',
  'brazil': 'brazil', 'brasil': 'brazil',
  'dominican republic': 'dominican republic', 'república dominicana': 'dominican republic',
  'philippines': 'philippines', 'filipinas': 'philippines', 'ph': 'philippines',
  'czech republic': 'czech republic', 'czechia': 'czech republic',
  'germany': 'germany', 'deutschland': 'germany'
};
function canonCountry(s) {
  const k = String(s || '').toLowerCase().trim();
  return COUNTRY_SYNONYMS[k] || k;
}

function scoreMember(member, role) {
  let score = 0;
  let denom = 0;

  if (role.preferred_sectors && role.preferred_sectors.length > 0) {
    const sectorList = role.preferred_sectors.map(s => String(s).toLowerCase().trim());
    const ms = String(member.sector || '').toLowerCase();
    score += sectorList.some(s => ms.includes(s) || s.includes(ms)) ? 0.4 : 0;
    denom += 0.4;
  }

  if (role.preferred_regions && role.preferred_regions.length > 0) {
    // Canonicalise both sides through COUNTRY_SYNONYMS so "USA", "U.S.",
    // "America", and "United States" all match each other. Also keep the
    // substring fallback for sub-region strings like "florida" or "central
    // florida" inside a role region that includes the country name.
    const mc = canonCountry(member.country);
    const rawMc = String(member.country || '').toLowerCase();
    const regionList = role.preferred_regions.map(r => String(r).toLowerCase().trim());
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
    const haystack = (
      (member.bio || '') + ' ' +
      (member.sub_specialty || '') + ' ' +
      (member.company_name || '')
    ).toLowerCase();
    const hits = role.required_skills.filter(s =>
      haystack.includes(String(s).toLowerCase().substring(0, 8))
    ).length;
    const ratio = hits / role.required_skills.length;
    score += ratio * 0.3;
    denom += 0.3;
  }

  score += parseFloat(member.trust_score || 0.7) * 0.1;
  denom += 0.1;

  return denom > 0 ? Math.min(1, score / denom) : 0;
}

module.exports = { scoreMember };
