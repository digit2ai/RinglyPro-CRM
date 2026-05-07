'use strict';

/**
 * Contract PDF Renderer
 *
 * Server-side puppeteer-based PDF generation. The client posts a fully-formed
 * HTML document (the same content the Print iframe uses) and we render it
 * with the browser's native print engine — no html2canvas, no html2pdf, no
 * coordinate-math edge cases.
 *
 * Mount: /pinaxis/api/v1/contract-pdf
 *   POST /render  -> body: { html, filename } -> application/pdf
 */

const express = require('express');
const router = express.Router();

// Production (Render): use puppeteer-core + @sparticuz/chromium (serverless-friendly,
// self-contained Chromium binary that runs without system-level Chrome deps).
// Local dev fallback: full puppeteer (which bundles its own Chromium for macOS).
let puppeteer, chromium;
try {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
  console.log('[contract-pdf] using puppeteer-core + @sparticuz/chromium');
} catch (e) {
  try {
    puppeteer = require('puppeteer');
    console.log('[contract-pdf] falling back to bundled puppeteer');
  } catch (e2) {
    console.warn('[contract-pdf] no puppeteer available:', e2.message);
  }
}

router.post('/render', async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'PDF renderer not available on this server' });
  }
  const { html, filename } = req.body || {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'html (string) is required' });
  }
  if (html.length > 5 * 1024 * 1024) {
    return res.status(413).json({ error: 'html too large (max 5MB)' });
  }

  const safeName = (filename || 'PINAXIS-Service-Contract.pdf').replace(/[^A-Za-z0-9._-]/g, '_');

  let browser;
  try {
    const launchOpts = chromium
      ? {
          headless: chromium.headless,
          args: chromium.args.concat([
            '--font-render-hinting=medium',
            '--hide-scrollbars',
            '--disable-web-security'
          ]),
          executablePath: await chromium.executablePath(),
          defaultViewport: chromium.defaultViewport
        }
      : {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--font-render-hinting=medium'
          ]
        };
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 1500, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    // Wait extra for Google Fonts (Barlow / Lexend Deca) to settle.
    // page.waitForTimeout was removed in puppeteer 22+, use raw setTimeout promise.
    await new Promise(r => setTimeout(r, 800));
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.65in', left: '0.5in' }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error('[contract-pdf] render error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF render failed', detail: err.message });
    }
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, puppeteer: !!puppeteer });
});

module.exports = router;
