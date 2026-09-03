'use strict';

// =============================================================
// Welcome email for a new subscriber, in THEIR language.
//
// Pure: no DB, no SendGrid. buildWelcome(sub) returns { subject, html, text }
// rendered in sub.language ('es' => Spanish, else English). Covers: a thank-you,
// why an online presence matters, what each plan (Free / Search / Landed) gives,
// and a clear path to upgrade. Prices come from the single plan catalog so they
// can never drift. Same JobUp header/button gradient as the digest email.
// =============================================================

const plans = require('./plans');

// The base URL and the product name both follow the SUBSCRIBER's brand, not a
// request — a welcome email is built after signup and a digest long after it,
// and a doctor must never receive mail headed JobUp.
const BRAND = require('../brand');
function baseUrl(sub) {
  return BRAND.publicUrl(BRAND.forSubscriber(sub));
}
function brandName(sub) { return BRAND.forSubscriber(sub).name; }
function price(id) { return Math.round((plans.PLANS[id].price_cents || 0) / 100); }
const PHYSICAL_ADDRESS = process.env.JOBUP_MAIL_ADDRESS || 'Digit2AI LLC, Wesley Chapel, Florida, USA';

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function copy(sub) {
  const es = String(sub.language || 'en') === 'es';
  const first = String(sub.name || '').trim().split(/\s+/)[0] || (es ? 'hola' : 'there');
  const addr = sub.address ? `https://${sub.address}` : baseUrl(sub);
  const S = price('search'); const L = price('landed');
  const planId = (sub.plan && plans.PLANS[sub.plan]) ? sub.plan : 'free';

  if (es) {
    return {
      es: true, first, addr, planId, S, L,
      subject: `¡Bienvenido a ${brandName(sub)}, ${first}! Tu presencia profesional ya está en marcha`,
      hi: `¡Bienvenido a ${brandName(sub)}, ${first}!`,
      thanks: 'Gracias por unirte. Acabas de dar un paso que la mayoría de los profesionales aún no da: publicar tu identidad profesional en internet, lista para que la encuentren las personas y la inteligencia artificial.',
      whyH: 'Por qué importa tu presencia en línea',
      why: 'En esta nueva era, a quien encuentran es a quien tiene una presencia sólida. Tu sitio de ${brandName(sub)} te hace visible para reclutadores y para las herramientas de IA que hoy buscan candidatos — y un equipo de IA trabaja las 24 horas conectando tu currículum con miles de vacantes reales en tiempo real.',
      plansH: 'Lo que incluye cada plan',
      free: ['Sitio de CV público en tu propia dirección', 'Perfil legible por IA (para que te encuentren)', '5 coincidencias de empleo por semana'],
      search: [`Todo lo de Free`, 'Coincidencias ilimitadas + 40 evaluaciones al día', '10 currículos adaptados al mes + contacto y pipeline', 'Un correo semanal con tus nuevas vacantes'],
      landed: ['Todo lo de Search', 'Adaptación ilimitada + evaluación prioritaria', 'Preparación de entrevista + 1 revisión humana al mes', 'Un correo diario con tus nuevas vacantes'],
      youreOn: (p) => `Estás en el plan ${plans.PLANS[p].name}.`,
      upgradeCta: 'Ver planes y mejorar',
      upgradeLine: `¿Buscas activamente? Search (${'$' + S}/mes) desbloquea coincidencias ilimitadas y contacto; Landed (${'$' + L}/mes) añade adaptación ilimitada y una revisión humana.`,
      openCta: 'Abrir mi panel',
      footer: `Estás recibiendo esto porque creaste una cuenta en ${brandName(sub)}.`,
      free_l: 'Free', search_l: 'Search', landed_l: 'Landed', mo: '/mes',
    };
  }
  return {
    es: false, first, addr, planId, S, L,
    subject: `Welcome to ${brandName(sub)}, ${first}! Your professional presence is live`,
    hi: `Welcome to ${brandName(sub)}, ${first}!`,
    thanks: 'Thank you for joining. You just did what most professionals still have not: published your professional self on the internet, ready to be found by people and by AI.',
    whyH: 'Why your online presence matters',
    why: `In this new era, the people who get found are the ones with a strong online presence. Your ${brandName(sub)} site makes you visible to recruiters and to the AI tools that now source candidates — and an AI workforce works around the clock, matching your resume to thousands of real jobs in real time.`,
    plansH: 'What each plan gives you',
    free: ['A public CV website at your own address', 'An AI-readable profile so machines can find you', '5 job matches every week'],
    search: ['Everything in Free', 'Unlimited matches + 40 scorings a day', '10 tailored resumes a month + outreach and pipeline', 'A weekly email of your new matches'],
    landed: ['Everything in Search', 'Unlimited tailoring + priority scoring', 'Interview prep + one human resume review a month', 'A daily email of your new matches'],
    youreOn: (p) => `You are on the ${plans.PLANS[p].name} plan.`,
    upgradeCta: 'See plans & upgrade',
    upgradeLine: `Actively looking? Search (${'$' + S}/mo) unlocks unlimited matches and outreach; Landed (${'$' + L}/mo) adds unlimited tailoring and a human review.`,
    openCta: 'Open my dashboard',
    footer: `You are receiving this because you created a ${brandName(sub)} account.`,
    free_l: 'Free', search_l: 'Search', landed_l: 'Landed', mo: '/mo',
  };
}

function planCard(name, priceLabel, bullets, highlight) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px">
    <tr><td style="background:${highlight ? 'linear-gradient(180deg,rgba(34,211,238,.08),transparent)' : '#12141b'};border:1px solid ${highlight ? 'rgba(34,211,238,.35)' : '#222634'};border-radius:12px;padding:14px 16px">
      <div style="font:800 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8">${esc(name)}
        <span style="font-weight:600;color:#9aa3b4;font-size:13px">${esc(priceLabel)}</span>
        ${highlight ? '<span style="float:right;background:rgba(34,211,238,.16);color:#22d3ee;border-radius:20px;padding:2px 10px;font-size:10.5px;font-weight:700">YOUR PLAN</span>' : ''}
      </div>
      <ul style="margin:8px 0 0;padding-left:18px;color:#9aa3b4;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif">
        ${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
      </ul>
    </td></tr></table>`;
}

function buildWelcome(sub) {
  const c = copy(sub);
  const base = baseUrl(sub);
  const dash = `${base}/app`;
  const planUrl = `${base}/plan`;

  const html = `<!doctype html><html lang="${c.es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brandName(sub)}</title></head>
<body style="margin:0;padding:0;background:#07080c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080c">
  <tr><td align="center" style="padding:26px 14px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
      <tr><td style="background:linear-gradient(90deg,#e64980,#ff922b);border-radius:14px 14px 0 0;padding:16px 20px">
        <span style="font:800 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff;letter-spacing:-.01em">${brandName(sub)}</span>
      </td></tr>
      <tr><td style="background:#0b0d13;border:1px solid #1b1f2b;border-top:none;border-radius:0 0 14px 14px;padding:24px 20px 10px">
        <div style="font:800 22px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8">${esc(c.hi)}</div>
        <div style="font:400 14px/1.65 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#c3cad6;margin:10px 0 6px">${esc(c.thanks)}</div>

        <div style="font:700 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8;margin:20px 0 6px">${esc(c.whyH)}</div>
        <div style="font:400 14px/1.65 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#9aa3b4">${esc(c.why)}</div>

        <div style="text-align:center;margin:20px 0 4px">
          <a href="${esc(c.addr)}" style="color:#22d3ee;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-decoration:none">${esc(c.addr.replace('https://', ''))} &rarr;</a>
        </div>

        <div style="font:700 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef2f8;margin:20px 0 10px">${esc(c.plansH)}</div>
        ${planCard(c.free_l, 'Free', c.free, c.planId === 'free')}
        ${planCard(c.search_l, '$' + c.S + c.mo, c.search, c.planId === 'search')}
        ${planCard(c.landed_l, '$' + c.L + c.mo, c.landed, c.planId === 'landed')}

        <div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#9aa3b4;margin:12px 0 0">${esc(c.upgradeLine)}</div>

        <div style="text-align:center;margin:22px 0 6px">
          <a href="${esc(dash)}" style="display:inline-block;background:linear-gradient(90deg,#e64980,#ff922b);color:#fff;text-decoration:none;font:700 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:13px 28px;border-radius:999px">${esc(c.openCta)}</a>
        </div>
        <div style="text-align:center;margin:0 0 6px">
          <a href="${esc(planUrl)}" style="color:#8a93a6;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-decoration:none">${esc(c.upgradeCta)} &rarr;</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 20px;font:400 11px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b7385;text-align:center">
        ${esc(c.footer)}<br><span style="color:#4c5568">${esc(PHYSICAL_ADDRESS)}</span>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  const lines = [];
  lines.push(c.hi); lines.push('');
  lines.push(c.thanks); lines.push('');
  lines.push(c.whyH); lines.push(c.why); lines.push('');
  lines.push(c.addr); lines.push('');
  lines.push(c.plansH);
  lines.push(`- ${c.free_l} (Free): ${c.free.join('; ')}`);
  lines.push(`- ${c.search_l} ($${c.S}${c.mo}): ${c.search.join('; ')}`);
  lines.push(`- ${c.landed_l} ($${c.L}${c.mo}): ${c.landed.join('; ')}`);
  lines.push(''); lines.push(c.upgradeLine); lines.push('');
  lines.push(`${c.openCta}: ${dash}`);
  lines.push(`${c.upgradeCta}: ${planUrl}`);
  lines.push(''); lines.push('---'); lines.push(c.footer); lines.push(PHYSICAL_ADDRESS);

  return { subject: c.subject, html, text: lines.join('\n') };
}

module.exports = { buildWelcome, PHYSICAL_ADDRESS };
