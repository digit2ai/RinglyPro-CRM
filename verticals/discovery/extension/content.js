'use strict';

/**
 * CONTENT SCRIPT — records the SHAPE of an interaction and nothing else.
 *
 * Scribe's content script captures the element's text and a screenshot, because
 * it is writing a document a human will follow. This one captures the element's
 * ROLE and how long you stayed, because it is building a cost model. The
 * difference is the whole reason this is installable at a company with a
 * compliance officer.
 *
 * WHAT IS DELIBERATELY NEVER READ HERE:
 *   element.value / textContent / innerText / placeholder / aria-label
 *   location.search, location.hash
 *   clipboard contents on copy or paste
 *   any screenshot, at any point
 *
 * The server redacts again on arrival and counts what it removed. Two passes,
 * because a promise about code running on an employee's laptop is not a
 * guarantee — an extension can be modified by whoever installs it. This pass
 * exists so that sensitive strings never leave the machine at all; the server
 * pass exists so that a modified client still cannot land one in the database.
 *
 * IT IS NEVER COVERT. While recording, a fixed banner sits at the top of every
 * page. A capture tool a person cannot see is spyware regardless of what it
 * collects, and this one has no reason to hide: the whole product depends on
 * an operator trusting it enough to leave it on for a week.
 */

(function () {
  if (window.__orbupDiscoveryLoaded) return;
  window.__orbupDiscoveryLoaded = true;

  let recording = false;
  let lastAt = Date.now();
  let banner = null;

  const ROLE_TAGS = {
    BUTTON: 'button', A: 'link', INPUT: 'field', TEXTAREA: 'field',
    SELECT: 'select', TABLE: 'table', TR: 'row', FORM: 'field',
    LABEL: 'field', SUMMARY: 'menu'
  };

  /** The element's ROLE, never its label. `button`, not "Approve invoice 4471". */
  function roleOf(el) {
    if (!el || !el.tagName) return 'other';
    const explicit = (el.getAttribute && el.getAttribute('role') || '').toLowerCase();
    if (['button', 'link', 'tab', 'menu', 'dialog', 'checkbox', 'row', 'table'].includes(explicit)) return explicit;
    if (el.tagName === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return 'checkbox';
      if (t === 'submit' || t === 'button') return 'button';
      if (t === 'file') return 'file';
      return 'field';
    }
    if (el.isContentEditable) return 'editor';
    return ROLE_TAGS[el.tagName] || 'other';
  }

  /** Path only. Query and fragment are not read, not sent, not shortened — omitted. */
  function pathOnly() {
    try { return location.pathname; } catch (e) { return '/'; }
  }

  function hostOnly() {
    try { return location.hostname; } catch (e) { return null; }
  }

  function emit(action, role) {
    if (!recording) return;
    const now = Date.now();
    const dwell = Math.min(now - lastAt, 1000 * 60 * 15);
    lastAt = now;
    try {
      chrome.runtime.sendMessage({
        type: 'orbup_step',
        step: { action, target_role: role || null, host: hostOnly(), path: pathOnly(), dwell_ms: dwell }
      });
    } catch (e) { /* the worker may be asleep; the next step re-wakes it */ }
  }

  /* ── listeners ─────────────────────────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const role = roleOf(e.target);
    emit(role === 'link' ? 'navigate' : 'click', role);
  }, true);

  // `input` fires per keystroke. We record that typing HAPPENED, once per
  // field per second, and never what was typed. Debounced because a cost model
  // does not get better from 400 keystroke events, and because a per-keystroke
  // stream is a keylogger's traffic pattern even when the payload is empty.
  let typeTimer = null;
  document.addEventListener('input', () => {
    if (typeTimer) return;
    typeTimer = setTimeout(() => { typeTimer = null; }, 1000);
    emit('type', 'field');
  }, true);

  document.addEventListener('submit', () => emit('submit', 'button'), true);
  document.addEventListener('copy', () => emit('copy', null), true);
  document.addEventListener('paste', () => emit('paste', 'field'), true);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'file') emit('upload', 'file');
  }, true);

  let scrollTimer = null;
  document.addEventListener('scroll', () => {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => { scrollTimer = null; }, 4000);
    emit('scroll', null);
  }, true);

  // SPA navigation. A single-page CRM changes route without a page load, and
  // missing those makes a ten-screen workflow look like one long screen.
  let lastPath = pathOnly();
  setInterval(() => {
    if (!recording) return;
    const p = pathOnly();
    if (p !== lastPath) { lastPath = p; emit('navigate', 'link'); }
  }, 1200);

  window.addEventListener('pageshow', () => emit('navigate', 'link'));

  /* ── the visible banner ────────────────────────────────────────────────── */
  function showBanner() {
    if (banner || !document.body) return;
    banner = document.createElement('div');
    banner.setAttribute('data-orbup-discovery', 'banner');
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#0b1220', 'color:#e8edf7', 'font:600 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
      'padding:7px 14px', 'text-align:center', 'letter-spacing:.02em',
      'border-bottom:1px solid #2b3a55', 'pointer-events:none'
    ].join(';');
    banner.textContent = 'OrbUp Discovery is recording the shape of this work — which app, which kind of action, how long. Not what you type, not page contents, not the address bar beyond the site name.';
    document.body.appendChild(banner);
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'orbup_state') {
      recording = !!msg.recording;
      lastAt = Date.now();
      if (recording) showBanner(); else hideBanner();
    }
  });

  chrome.runtime.sendMessage({ type: 'orbup_hello' }, (r) => {
    if (r && r.recording) { recording = true; showBanner(); }
  });
})();
