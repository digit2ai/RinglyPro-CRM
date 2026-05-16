/**
 * Chamber member trust-score verifier.
 *
 * Replaces the static stored trust_score with a computed value based on
 * AI-verified business signals from the member's actual digital footprint.
 *
 * Components (weighted, sum = 1.0):
 *   verification        0.20  -- email verified, admin-verified, email/domain match
 *   web_presence        0.25  -- website lives, page mentions company, search hits
 *   social_proof        0.15  -- LinkedIn URL provided + valid
 *   profile_completeness 0.15 -- bio length, sub_specialty, phone, langs, years
 *   tenure              0.10  -- months since signup (capped at 24)
 *   activity            0.15  -- projects participated, DMs sent, searches saved
 *
 * Plus an optional Claude synthesis pass that adjusts the raw weighted sum
 * by up to ±10% based on the cohesion / quality of the evidence.
 */

const WEIGHTS = {
  verification: 0.20,
  web_presence: 0.25,
  social_proof: 0.15,
  profile_completeness: 0.15,
  tenure: 0.10,
  activity: 0.15
};

// ----- low-level evidence collectors -----

// HTTP HEAD-then-GET probe; returns { ok, status, finalUrl, snippet } or null.
async function probeUrl(url, { timeoutMs = 8000 } = {}) {
  if (!url) return null;
  let normalized = String(url).trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(normalized, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 CamaraVirtual TrustVerifier' }
    });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') || '';
    let text = '';
    if (res.ok && ct.includes('text/html')) {
      try {
        text = await res.text();
      } catch (_) { /* ignore body errors */ }
    }
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || normalized,
      snippet: text.slice(0, 8000)
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// Brave Search API search (falls back to DuckDuckGo HTML scrape if no key).
// Returns up to 5 result snippets so we can confirm the company has a web presence.
async function searchCompany(companyName) {
  if (!companyName || companyName.trim().length < 2) return [];
  const q = companyName.trim();
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  try {
    if (braveKey) {
      const r = await fetch(
        'https://api.search.brave.com/res/v1/web/search?count=5&q=' + encodeURIComponent(q),
        {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': braveKey,
            'User-Agent': 'CamaraVirtual TrustVerifier'
          }
        }
      );
      if (r.ok) {
        const j = await r.json();
        return ((j && j.web && j.web.results) || []).slice(0, 5).map(x => ({
          title: x.title, url: x.url, snippet: x.description || ''
        }));
      }
    }
    // Fallback: DuckDuckGo HTML (no API key required). Crude regex parse.
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 CamaraVirtual TrustVerifier' }
    });
    if (!r.ok) return [];
    const html = await r.text();
    const hits = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null && hits.length < 5) {
      hits.push({ url: m[1], title: m[2].trim(), snippet: m[3].trim() });
    }
    return hits;
  } catch (_) {
    return [];
  }
}

function extractDomain(url) {
  if (!url) return null;
  try {
    let u = String(url).trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) { return null; }
}

function emailDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

// ----- per-component scoring (0..1 each) -----

function scoreVerification(member, evidence) {
  let score = 0;
  let detail = {};
  // Email verification (basic level)
  if (member.verified) { score += 0.25; detail.email_verified = true; }
  if (member.verification_level && member.verification_level !== 'email') {
    score += 0.20; detail.elevated_verification = member.verification_level;
  }
  // Email domain matches website domain (corporate email signal)
  const eDom = emailDomain(member.email);
  const wDom = extractDomain(member.website_url);
  if (eDom && wDom && eDom === wDom) {
    score += 0.20; detail.email_matches_website_domain = true;
  } else if (eDom && wDom) {
    detail.email_matches_website_domain = false;
  }
  // Company registration / license / document ID. Strongest single signal of
  // a real legal entity. Format-checked here (length + alphanumeric); deeper
  // jurisdiction-specific lookup (EIN, SIRET, CNPJ, etc.) is left to the AI
  // synthesis step which can cross-reference web search results.
  if (member.company_registration_id) {
    const rid = String(member.company_registration_id).trim();
    if (rid.length >= 5 && /^[A-Z0-9\-\/.\s]+$/i.test(rid)) {
      score += 0.35;
      detail.company_registration_id_provided = true;
      detail.company_registration_country = member.company_registration_country || null;
    } else if (rid.length > 0) {
      score += 0.10;
      detail.company_registration_id_provided = true;
      detail.company_registration_id_format = 'suspicious';
    }
  } else {
    detail.company_registration_id_provided = false;
  }
  return { score: Math.min(1, score), detail };
}

function scoreWebPresence(member, evidence) {
  let score = 0;
  const detail = {};
  const probe = evidence.website_probe;
  if (probe && probe.ok && probe.status >= 200 && probe.status < 400) {
    score += 0.5; detail.website_live = true; detail.website_status = probe.status;
    // Bonus if the page text mentions the company name (case-insensitive substring)
    if (member.company_name && probe.snippet) {
      const cn = String(member.company_name).toLowerCase();
      if (probe.snippet.toLowerCase().includes(cn)) {
        score += 0.2; detail.website_mentions_company = true;
      }
    }
  } else if (member.website_url) {
    detail.website_live = false;
    if (probe) detail.website_status = probe.status;
  }
  const hits = evidence.company_search || [];
  if (hits.length >= 3) { score += 0.3; detail.company_search_hits = hits.length; }
  else if (hits.length > 0) { score += 0.15; detail.company_search_hits = hits.length; }
  return { score: Math.min(1, score), detail };
}

function scoreSocialProof(member, evidence) {
  let score = 0;
  const detail = {};
  if (member.linkedin_url) {
    const url = String(member.linkedin_url);
    if (/linkedin\.com\/(in|company|pub)\//i.test(url)) {
      score += 0.7; detail.linkedin_url_valid = true;
    } else {
      score += 0.3; detail.linkedin_url_valid = false;
    }
  }
  if (member.linkedin_probe && member.linkedin_probe.ok) {
    score += 0.3; detail.linkedin_reachable = true;
  }
  return { score: Math.min(1, score), detail };
}

function scoreProfileCompleteness(member, evidence) {
  let filled = 0;
  let total = 6;
  const detail = {};
  if (member.bio && member.bio.trim().length >= 80) { filled++; detail.bio = 'substantive'; }
  else if (member.bio && member.bio.trim().length > 0) { filled += 0.5; detail.bio = 'thin'; }
  if (member.sub_specialty && member.sub_specialty.trim().length > 0) { filled++; detail.sub_specialty = true; }
  if (member.phone && member.phone.trim().length > 0) { filled++; detail.phone = true; }
  if (Array.isArray(member.languages) && member.languages.length > 0) { filled++; detail.languages = member.languages.length; }
  if (member.years_experience && member.years_experience > 0) { filled++; detail.years_experience = member.years_experience; }
  if (member.sector) { filled++; detail.sector = member.sector; }
  return { score: Math.min(1, filled / total), detail };
}

function scoreTenure(member, evidence) {
  const detail = {};
  if (!member.created_at) return { score: 0, detail };
  const months = (Date.now() - new Date(member.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
  detail.months_active = Math.round(months * 10) / 10;
  // Cap at 24 months for full credit; linear ramp.
  const score = Math.max(0, Math.min(1, months / 24));
  return { score, detail };
}

function scoreActivity(member, evidence) {
  let score = 0;
  const detail = {};
  const proj = evidence.activity_counts && evidence.activity_counts.projects || 0;
  const dms = evidence.activity_counts && evidence.activity_counts.dms || 0;
  const groups = evidence.activity_counts && evidence.activity_counts.groups || 0;
  const searches = evidence.activity_counts && evidence.activity_counts.searches || 0;
  detail.projects = proj;
  detail.dms = dms;
  detail.groups = groups;
  detail.searches = searches;
  // Each axis caps at 0.25, summed.
  score += Math.min(0.4, proj * 0.15);
  score += Math.min(0.25, dms * 0.02);
  score += Math.min(0.2, groups * 0.05);
  score += Math.min(0.15, searches * 0.05);
  return { score: Math.min(1, score), detail };
}

// ----- optional AI synthesis pass -----

async function maybeAiAdjust(member, evidence, components, baseScore) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { adjusted_score: baseScore, ai_used: false, ai_reason: null };
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const summary = {
      member: {
        name: `${member.first_name || ''} ${member.last_name || ''}`.trim(),
        email_domain: emailDomain(member.email),
        company_name: member.company_name,
        website_domain: extractDomain(member.website_url),
        linkedin_url: member.linkedin_url || null,
        sector: member.sector,
        bio_length: (member.bio || '').length,
        years_experience: member.years_experience,
        company_registration_id: member.company_registration_id || null,
        company_registration_country: member.company_registration_country || null
      },
      evidence: {
        website_status: evidence.website_probe ? evidence.website_probe.status : null,
        website_mentions_company: components.web_presence.detail.website_mentions_company,
        company_search_hit_count: (evidence.company_search || []).length,
        company_search_top_titles: (evidence.company_search || []).slice(0, 5).map(h => h.title),
        company_search_top_snippets: (evidence.company_search || []).slice(0, 3).map(h => (h.snippet || '').slice(0, 200))
      },
      components_score: Object.fromEntries(
        Object.entries(components).map(([k, v]) => [k, Math.round(v.score * 100) / 100])
      ),
      base_score: Math.round(baseScore * 100) / 100
    };
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      system: `You audit chamber-member trust scores. Given component scores and underlying evidence, decide whether the base score should be adjusted up or down by no more than 0.10 (10 percentage points) to reflect cohesion / quality / legitimacy of evidence.

KEY LEGITIMACY SIGNALS:
- company_registration_id + company_registration_country: real legal entities have a registration / license / tax ID (e.g. US EIN like "12-3456789", UK Companies House like "12345678", Brazil CNPJ like "12.345.678/0001-90", Spain CIF like "B12345678", Mexico RFC, France SIRET). Cross-reference with company_name + country and search results -- does this look like a plausible real registration?
- Web search results: do the snippets/titles describe the same company the member claims to represent? An exact-match official site + Crunchbase/LinkedIn corporate page is strong; only unrelated results is weak.
- Website + email coherence: corporate email at the same domain as a live website is strong; freemail (gmail/yahoo) + claimed major corporate website is weak.

REASONS TO ADJUST DOWN: parked / placeholder website, company search hits are unrelated to the claimed business, evidence contradicts itself, registration ID format is implausible for the claimed country, freemail email with grandiose company claims.

REASONS TO ADJUST UP: strong cohesion across signals, well-known company in search results, registration ID format matches the country pattern, corporate email matches website domain, deep tenure with sustained platform activity.

Reply ONLY with valid JSON: {"adjustment": number (between -0.10 and +0.10), "reason": "one-sentence explanation"}.`,
      messages: [{ role: 'user', content: JSON.stringify(summary) }]
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    let parsed;
    try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
    catch (_) { return { adjusted_score: baseScore, ai_used: false, ai_reason: 'parse_failed' }; }
    const adj = Math.max(-0.10, Math.min(0.10, parseFloat(parsed.adjustment) || 0));
    return {
      adjusted_score: Math.max(0, Math.min(1, baseScore + adj)),
      ai_used: true,
      ai_adjustment: adj,
      ai_reason: parsed.reason || null
    };
  } catch (e) {
    return { adjusted_score: baseScore, ai_used: false, ai_reason: 'ai_error:' + e.message };
  }
}

// ----- public API -----

/**
 * Run the full verifier against one member.
 * `member` should include: id, email, company_name, website_url, linkedin_url,
 * sector, sub_specialty, bio, phone, languages, years_experience, verified,
 * verification_level, created_at
 *
 * `activityCounts` is an object: { projects, dms, groups, searches }
 *
 * Returns: { score, components, evidence, verified_at }
 */
async function verifyMember(member, activityCounts = {}, opts = {}) {
  const useAi = opts.useAi !== false; // default on; pass useAi:false to skip Claude

  // 1. Collect evidence (network calls in parallel)
  const [website_probe, company_search] = await Promise.all([
    member.website_url ? probeUrl(member.website_url) : Promise.resolve(null),
    member.company_name ? searchCompany(member.company_name) : Promise.resolve([])
  ]);
  const evidence = { website_probe, company_search, activity_counts: activityCounts };

  // 2. Score each component
  const components = {
    verification: scoreVerification(member, evidence),
    web_presence: scoreWebPresence(member, evidence),
    social_proof: scoreSocialProof(member, evidence),
    profile_completeness: scoreProfileCompleteness(member, evidence),
    tenure: scoreTenure(member, evidence),
    activity: scoreActivity(member, evidence)
  };

  // 3. Weighted base score
  const baseScore = Object.entries(WEIGHTS)
    .reduce((sum, [k, w]) => sum + (components[k].score * w), 0);

  // 4. Optional AI adjustment (Claude reviews the whole picture)
  const aiResult = useAi
    ? await maybeAiAdjust(member, evidence, components, baseScore)
    : { adjusted_score: baseScore, ai_used: false, ai_reason: null };

  return {
    score: Math.round(aiResult.adjusted_score * 1000) / 1000,
    base_score: Math.round(baseScore * 1000) / 1000,
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, {
        score: Math.round(v.score * 1000) / 1000,
        weight: WEIGHTS[k],
        contribution: Math.round(v.score * WEIGHTS[k] * 1000) / 1000,
        detail: v.detail
      }])
    ),
    ai: {
      used: aiResult.ai_used,
      adjustment: aiResult.ai_adjustment || 0,
      reason: aiResult.ai_reason
    },
    evidence: {
      website_status: website_probe ? website_probe.status : null,
      website_final_url: website_probe ? website_probe.finalUrl : null,
      company_search_count: company_search.length,
      company_search_top_titles: company_search.slice(0, 3).map(h => h.title)
    },
    verified_at: new Date().toISOString()
  };
}

module.exports = { verifyMember, WEIGHTS };
