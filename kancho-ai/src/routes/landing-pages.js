'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}

// GET / - List landing pages for school
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const pages = await kanchoModels.KanchoLandingPage.findAll({
      where: { school_id: schoolId },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get landing page details
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const page = await kanchoModels.KanchoLandingPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create landing page
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const slug = (req.body.slug || req.body.name || 'page')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const page = await kanchoModels.KanchoLandingPage.create({
      school_id: schoolId,
      funnel_id: req.body.funnel_id || null,
      name: req.body.name || 'Untitled Page',
      slug,
      template: req.body.template || 'trial_class',
      headline: req.body.headline,
      subheadline: req.body.subheadline,
      hero_image_url: req.body.hero_image_url,
      body_html: req.body.body_html,
      form_fields: req.body.form_fields,
      cta_text: req.body.cta_text || 'Book Your Free Trial',
      thank_you_message: req.body.thank_you_message,
      redirect_url: req.body.redirect_url,
      style: req.body.style,
      seo: req.body.seo
    });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update landing page
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const page = await kanchoModels.KanchoLandingPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const allowed = ['name', 'template', 'headline', 'subheadline', 'hero_image_url', 'body_html', 'form_fields', 'cta_text', 'thank_you_message', 'redirect_url', 'style', 'seo', 'is_published'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await page.update(updates);
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/publish - Toggle publish
router.post('/:id/publish', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const page = await kanchoModels.KanchoLandingPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    await page.update({ is_published: !page.is_published, updated_at: new Date() });
    res.json({ success: true, data: page, message: page.is_published ? 'Page published' : 'Page unpublished' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete page
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const page = await kanchoModels.KanchoLandingPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    await page.destroy();
    res.json({ success: true, message: 'Page deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUBLIC: Render landing page + handle form submissions
// These endpoints are mounted WITHOUT auth middleware
// ============================================================

// GET /public/:schoolId/:slug - Render public landing page
router.get('/public/:schoolId/:slug', async (req, res) => {
  if (!kanchoModels) return res.status(503).send('Service unavailable');
  try {
    const page = await kanchoModels.KanchoLandingPage.findOne({
      where: { school_id: req.params.schoolId, slug: req.params.slug, is_published: true },
      include: [{ model: kanchoModels.KanchoSchool, as: 'school', attributes: ['name', 'logo_url', 'martial_art_type'] }]
    });
    if (!page) return res.status(404).send('Page not found');

    // Increment views
    const stats = page.stats || { views: 0, submissions: 0 };
    stats.views = (stats.views || 0) + 1;
    await page.update({ stats });

    const s = page.style || {};
    const school = page.school || {};
    const fields = page.form_fields || [];
    const seo = page.seo || {};

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${seo.title || page.headline || page.name}</title>
  <meta name="description" content="${seo.description || page.subheadline || ''}">
  ${seo.og_image ? '<meta property="og:image" content="' + seo.og_image + '">' : ''}
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { font-family: '${s.font || 'Inter'}', system-ui, sans-serif; background: ${s.bg_color || '#0D0D0D'}; color: ${s.text_color || '#FFFFFF'}; }
    .cta-btn { background: ${s.primary_color || '#E85A4F'}; }
    .cta-btn:hover { opacity: 0.9; transform: translateY(-1px); }
    input, select, textarea { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 12px 16px; border-radius: 8px; width: 100%; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: ${s.primary_color || '#E85A4F'}; }
    .thank-you { display: none; }
    .thank-you.show { display: block; }
    .form-section.hide { display: none; }
  </style>
</head>
<body class="min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-12">
    ${school.logo_url ? '<div class="text-center mb-8"><img src="' + school.logo_url + '" alt="' + school.name + '" class="h-16 mx-auto"></div>' : ''}
    ${page.hero_image_url ? '<div class="mb-8 rounded-2xl overflow-hidden"><img src="' + page.hero_image_url + '" alt="" class="w-full h-64 object-cover"></div>' : ''}
    <h1 class="text-4xl font-bold text-center mb-4">${page.headline || ''}</h1>
    <p class="text-xl text-center opacity-80 mb-8">${page.subheadline || ''}</p>
    ${page.body_html || ''}
    <div id="formSection" class="form-section card p-8 rounded-2xl" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
      <form id="lpForm" onsubmit="submitForm(event)">
        ${fields.map(f => '<div class="mb-4"><label class="block text-sm opacity-70 mb-1">' + f.label + (f.required ? ' *' : '') + '</label>' +
          (f.type === 'select' ? '<select name="' + f.name + '"' + (f.required ? ' required' : '') + '>' + (f.options || []).map(o => '<option value="' + o + '">' + o + '</option>').join('') + '</select>' :
          f.type === 'textarea' ? '<textarea name="' + f.name + '" rows="3"' + (f.required ? ' required' : '') + '></textarea>' :
          '<input type="' + f.type + '" name="' + f.name + '" placeholder="' + f.label + '"' + (f.required ? ' required' : '') + '>') +
        '</div>').join('')}
        <button type="submit" class="cta-btn w-full py-4 rounded-xl text-lg font-bold transition mt-4">${page.cta_text || 'Submit'}</button>
      </form>
    </div>
    <div id="thankYou" class="thank-you text-center py-16">
      <i class="fas fa-check-circle text-6xl mb-4" style="color: ${s.primary_color || '#E85A4F'}"></i>
      <h2 class="text-2xl font-bold mb-2">Thank You!</h2>
      <p class="opacity-80">${page.thank_you_message || 'We will be in touch shortly.'}</p>
    </div>
    <p class="text-center text-sm opacity-40 mt-12">${school.name || 'Powered by KanchoAI'}</p>
  </div>
  <script>
    async function submitForm(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      try {
        const res = await fetch('/kanchoai/api/v1/landing-pages/public/${req.params.schoolId}/${req.params.slug}/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          document.getElementById('formSection').classList.add('hide');
          document.getElementById('thankYou').classList.add('show');
          ${page.redirect_url ? 'setTimeout(() => window.location.href = "' + page.redirect_url + '", 3000);' : ''}
        } else {
          alert(result.error || 'Submission failed');
        }
      } catch (err) { alert('Error: ' + err.message); }
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading page');
  }
});

// POST /public/:schoolId/:slug/submit - Handle form submission
router.post('/public/:schoolId/:slug/submit', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const page = await kanchoModels.KanchoLandingPage.findOne({
      where: { school_id: req.params.schoolId, slug: req.params.slug, is_published: true }
    });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    // Increment submissions
    const stats = page.stats || { views: 0, submissions: 0 };
    stats.submissions = (stats.submissions || 0) + 1;
    await page.update({ stats });

    // Also update funnel stats if linked
    if (page.funnel_id) {
      const funnel = await kanchoModels.KanchoFunnel.findByPk(page.funnel_id);
      if (funnel) {
        const fStats = funnel.stats || { views: 0, submissions: 0, conversions: 0 };
        fStats.submissions = (fStats.submissions || 0) + 1;
        await funnel.update({ stats: fStats });
      }
    }

    // Create lead from submission
    const leadData = {
      school_id: parseInt(req.params.schoolId),
      first_name: req.body.first_name || req.body.name || 'Unknown',
      last_name: req.body.last_name || '',
      email: req.body.email || null,
      phone: req.body.phone || null,
      source: 'landing_page',
      status: 'new',
      temperature: 'hot',
      lead_score: 70,
      notes: 'From landing page: ' + page.name + (req.body.message ? '. Message: ' + req.body.message : ''),
      metadata: { landing_page_id: page.id, funnel_id: page.funnel_id, form_data: req.body }
    };

    const lead = await kanchoModels.KanchoLead.create(leadData);

    // Fire automation event
    try {
      if (req.app.locals.automationEngine) {
        req.app.locals.automationEngine.fireEvent('lead_created', parseInt(req.params.schoolId), lead.toJSON());
      }
    } catch (ae) { /* non-blocking */ }

    res.json({ success: true, message: 'Submission received', data: { lead_id: lead.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
