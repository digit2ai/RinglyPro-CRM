/**
 * Member-vs-role scoring used for AI invitations and open RFQ matching.
 * Identical semantics to chamber-template/routes/projects.js scoreMember.
 */
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
    const regionList = role.preferred_regions.map(r => String(r).toLowerCase().trim());
    const mc = String(member.country || '').toLowerCase();
    const regionId = member.region_id;
    const match = regionList.some(r => mc.includes(r) || r.includes(mc) || `region${regionId}` === r);
    score += match ? 0.3 : 0;
    denom += 0.3;
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
    score += ratio * 0.2;
    denom += 0.2;
  }

  score += parseFloat(member.trust_score || 0.7) * 0.1;
  denom += 0.1;

  return denom > 0 ? Math.min(1, score / denom) : 0;
}

module.exports = { scoreMember };
