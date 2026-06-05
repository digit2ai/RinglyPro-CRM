'use strict';

/**
 * Veritas — Takedown letter/report generators.
 *
 * Produces the text body of a takedown request for a given detection + method.
 * Phase 2: human-in-the-loop — the dashboard renders these for review, then the
 * operator submits via the platform's abuse form / Apple-Mail magic link
 * (matching the project-wide EMAIL_AUTOSEND_DISABLED pattern). Phase 3 can POST
 * directly to platform abuse APIs.
 *
 * IMPORTANT: these are operational drafts, not legal advice. Final language
 * should be reviewed by counsel before the program goes live (see ECOSYSTEM.md
 * dependency list).
 */

// Where to send each platform's reports. `email` = the platform's real DMCA
// designated-agent inbox (verified; best for copyright/trademark). `portal` =
// the web form (required for pure impersonation reports).
const PLATFORM_ABUSE = {
  facebook:  { name: 'Meta (Facebook)', email: 'ip@fb.com',            portal: 'https://www.facebook.com/help/contact/impersonation' },
  instagram: { name: 'Meta (Instagram)', email: 'ip@instagram.com',    portal: 'https://help.instagram.com/contact/636276399721841' },
  tiktok:    { name: 'TikTok',          email: 'Copyright@tiktok.com',  portal: 'https://www.tiktok.com/legal/report/Copyright' },
  youtube:   { name: 'YouTube',         email: 'dmca-agent@google.com', portal: 'https://support.google.com/youtube/answer/2807622' },
  web:       { name: 'Web host / registrar', email: '',                portal: 'WHOIS abuse contact' }
};

function header(platform) {
  const p = PLATFORM_ABUSE[platform] || PLATFORM_ABUSE.web;
  return { platformName: p.name, portal: p.portal, email: p.email || '' };
}

function impersonationLetter({ targeted_person, platform, source_url, confidence }) {
  const { platformName } = header(platform);
  return `To the ${platformName} Trust & Safety Team,

We are submitting an impersonation report on behalf of ${targeted_person || 'our client'}.

The content at the URL below is an AI-generated deepfake that impersonates ${targeted_person || 'our client'} without authorization, and is being used to deceive the public and facilitate fraud.

Infringing content: ${source_url || '[URL]'}
Detection confidence: ${confidence != null ? confidence + '%' : 'high'} (automated deepfake analysis)
Basis: Unauthorized impersonation / synthetic media misrepresentation

We request immediate removal of this content under your impersonation and manipulated-media policies. ${targeted_person || 'Our client'} has not consented to the creation or distribution of this synthetic likeness.

We attest, under penalty of perjury, that the information in this report is accurate and that we are authorized to act on behalf of the rights holder.

Respectfully,
Veritas — Brand & Executive Protection (on behalf of ${targeted_person || 'the rights holder'})`;
}

function dmcaLetter({ targeted_person, platform, source_url }) {
  const { platformName } = header(platform);
  return `DMCA Takedown Notice — to the ${platformName} Designated Agent,

I have a good-faith belief that the material identified below infringes copyright owned by or exclusively licensed to ${targeted_person || 'our client'}, and that its use is not authorized by the copyright owner, its agent, or the law.

Identification of copyrighted work: original media/likeness of ${targeted_person || 'our client'}.
Identification of infringing material (to be removed): ${source_url || '[URL]'}

Contact: support@veritas.app

I state UNDER PENALTY OF PERJURY that the information in this notification is accurate and that I am the copyright owner or authorized to act on the owner's behalf.

Signed,
Veritas — Brand & Executive Protection`;
}

function trademarkLetter({ targeted_person, platform, source_url }) {
  const { platformName } = header(platform);
  const brand = targeted_person || 'our client';
  return `Trademark Infringement Report — to the ${platformName} Brand Protection Team,

The content below makes unauthorized use of the ${brand} trademark and brand assets to mislead consumers, in violation of your intellectual-property policies.

Brand owner: ${brand}
Infringing content: ${source_url || '[URL]'}
Nature of infringement: Unauthorized use of brand name/logo in a fraudulent advertisement or synthetic endorsement.

We request removal of this content and any associated advertiser account actions. We are authorized to act on behalf of the ${brand} brand.

Respectfully,
Veritas — Brand & Executive Protection`;
}

/**
 * generate({ method, detection, asset }) -> { method, platform, portal, subject, body }
 */
function generate({ method, detection = {}, asset = {} }) {
  const platform = asset.source_platform || detection.platform || 'web';
  const ctx = {
    targeted_person: detection.targeted_person,
    platform,
    source_url: asset.source_url,
    confidence: detection.confidence
  };
  const { portal, platformName, email } = header(platform);

  let body, subject;
  switch (method) {
    case 'dmca':
      body = dmcaLetter(ctx);
      subject = `DMCA Takedown — ${ctx.targeted_person || 'rights holder'}`;
      break;
    case 'trademark':
      body = trademarkLetter(ctx);
      subject = `Trademark Infringement — ${ctx.targeted_person || 'brand'}`;
      break;
    case 'impersonation':
    default:
      body = impersonationLetter(ctx);
      subject = `Impersonation / Deepfake Report — ${ctx.targeted_person || 'rights holder'}`;
      break;
  }
  return { method: method || 'impersonation', platform, platformName, portal, email, subject, body };
}

module.exports = { generate, PLATFORM_ABUSE };
