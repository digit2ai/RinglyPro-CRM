'use strict';
(function () {
  const BASE = '/style-studio';
  const API = BASE + '/api/v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = { meta: null, items: [], outfits: [], shirt: null, pants: null, shoe: null, view: 'studio', preferRender: true, wCat: 'shirt' };

  async function api(path, opt = {}) {
    const o = { method: opt.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (o.method !== 'GET') o.headers['X-Studio'] = '1';
    if (opt.body instanceof FormData) o.body = opt.body;
    else if (opt.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
    const r = await fetch(API + path, o);
    let j = null; try { j = await r.json(); } catch (_) {}
    if (r.status === 401 && !path.startsWith('/auth/login')) { showLogin(); throw new Error('not_signed_in'); }
    if (!r.ok) { const e = new Error((j && (j.message || j.error)) || 'HTTP ' + r.status); e.data = j; e.status = r.status; throw e; }
    return j;
  }

  /* ── swatches for garments with no photo yet ───────────────────────── */
  function swatch(it) {
    const a = it.color_hex || '#ddd', b = it.color2_hex || '#999';
    let inner = `<rect width="40" height="40" fill="${a}"/>`;
    if (it.pattern === 'gingham') inner += `<g fill="${b}" opacity=".55"><rect x="0" width="5" height="40"/><rect x="10" width="5" height="40"/><rect x="20" width="5" height="40"/><rect x="30" width="5" height="40"/><rect y="0" width="40" height="5"/><rect y="10" width="40" height="5"/><rect y="20" width="40" height="5"/><rect y="30" width="40" height="5"/></g>`;
    else if (it.pattern === 'stripe') inner += `<g fill="${b}"><rect x="2" width="3" height="40"/><rect x="10" width="3" height="40"/><rect x="18" width="3" height="40"/><rect x="26" width="3" height="40"/><rect x="34" width="3" height="40"/></g>`;
    else if (it.pattern === 'plaid') inner += `<g fill="${b}" opacity=".7"><rect y="8" width="40" height="7"/><rect x="8" width="7" height="40"/><rect y="28" width="40" height="3"/><rect x="28" width="3" height="40"/></g>`;
    else if (it.category === 'shoes') inner += `<path d="M12 16 L20 26 L28 16" stroke="${b}" stroke-width="3" fill="none"/>`;
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${inner}</svg>`);
  }
  const itemImg = (it) => it.photo_id ? `${API}/photos/${it.photo_id}?size=thumb` : swatch(it);
  const occLabel = (k) => (S.meta.occasions.find((o) => o.key === k) || {}).label || k;
  const sketchUrl = (o) => `${API}/outfits/${o.id}/sketch.svg?v=${o.shirt.id}-${o.shirt.photo_id || 0}-${o.pants.photo_id || 0}-${encodeURIComponent(o.shirt.color_hex + o.pants.color_hex + o.shirt.pattern)}`;
  const bestImg = (o) => o.render_id ? `${API}/outfits/${o.id}/render?r=${o.render_id}` : sketchUrl(o);

  /* ── auth ───────────────────────────────────────────────────────────── */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#loginErr').textContent = '';
    const f = new FormData(e.target);
    try { await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); boot(); }
    catch (err) { $('#loginErr').textContent = err.message === 'too_many_attempts' ? 'Too many tries. Wait 15 minutes.' : 'That email and password did not match.'; }
  });
  $('#logout').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  async function boot() {
    try { S.meta = await api('/meta'); } catch (e) { if (e.message !== 'not_signed_in') alert('Could not load: ' + e.message); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    const occOpts = S.meta.occasions.map((o) => `<option value="${o.key}">${esc(o.label)}</option>`).join('');
    $('#todayOcc').innerHTML = occOpts;
    $('#gOcc').innerHTML = '<option value="">Any occasion</option>' + occOpts;
    $('#itemForm [name=pattern]').innerHTML = S.meta.patterns.map((p) => `<option>${p}</option>`).join('');
    const d = new Date(S.meta.today + 'T12:00:00').getDay();
    $('#todayOcc').value = d === 0 || d === 6 ? 'weekend' : 'business_casual';
    await reload();
    const first = S.outfits.find((o) => o.favorite) || S.outfits[0];
    if (first) { S.shirt = first.shirt.id; S.pants = first.pants.id; S.shoe = first.shoe.id; }
    renderStudio();
    show(location.hash.slice(1) || 'studio');
  }

  async function reload() {
    const [i, o] = await Promise.all([api('/items'), api('/outfits')]);
    S.items = i.items; S.outfits = o.outfits;
  }
  const current = () => S.outfits.find((o) => o.shirt.id === S.shirt && o.pants.id === S.pants && o.shoe.id === S.shoe) || null;

  /* ── views ──────────────────────────────────────────────────────────── */
  function show(v) {
    if (!$('#v-' + v)) v = 'studio';
    S.view = v;
    $$('.view').forEach((el) => { el.hidden = el.id !== 'v-' + v; });
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    history.replaceState(null, '', '#' + v);
    ({ studio: renderStudio, gallery: renderGallery, compare: renderCompare, planner: renderPlanner, wardrobe: renderWardrobe, settings: renderSettings })[v]();
    window.scrollTo(0, 0);
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

  /* STUDIO */
  function renderStudio() {
    const by = (c) => S.items.filter((i) => i.category === c);
    const thumb = (it, sel) => `<button class="tb ${sel ? 'on' : ''}" data-id="${it.id}" data-cat="${it.category}" title="${esc(it.name)}" aria-pressed="${sel}">
        <img src="${itemImg(it)}" alt="${esc(it.name)}" loading="lazy">${it.is_slot ? '<span class="slot">Add details</span>' : ''}${it.favorite ? '<span class="fav">&#9733;</span>' : ''}</button>`;
    const shirts = by('shirt');
    $('#shirtCount').textContent = shirts.length;
    $('#shirtList').innerHTML = shirts.map((i) => thumb(i, i.id === S.shirt)).join('');
    $('#pantsList').innerHTML = by('pants').map((i) => thumb(i, i.id === S.pants)).join('');
    $('#shoeList').innerHTML = by('shoes').map((i) => thumb(i, i.id === S.shoe)).join('');
    renderStage();
  }
  $('.inv').addEventListener('click', (e) => {
    const b = e.target.closest('.tb'); if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.cat === 'shirt') S.shirt = id; else if (b.dataset.cat === 'pants') S.pants = id; else S.shoe = id;
    renderStudio();
    if (window.innerWidth < 760) $('#frame').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  let detail = null;
  async function renderStage() {
    const o = current();
    if (!o) { $('#side').innerHTML = '<p class="muted">Pick a shirt, trousers and shoes.</p>'; $('#stageImg').removeAttribute('src'); return; }
    const useRender = S.preferRender && o.render_id;
    $('#showRender').classList.toggle('on', !!useRender); $('#showSketch').classList.toggle('on', !useRender);
    $('#showRender').disabled = !o.render_id;
    $('#stageImg').src = useRender ? `${API}/outfits/${o.id}/render?r=${o.render_id}` : sketchUrl(o);
    $('#stageLabel').textContent = useRender ? S.meta.labels.render : S.meta.labels.sketch + (o.shirt.photo_id ? ' · fabric from your photo' : ' · colours from the wardrobe');
    $('#dlBtn').href = `${API}/outfits/${o.id}/download.png`;
    const st = o.render_status;
    $('#renderNote').textContent = !S.meta.provider.configured ? 'AI try-on is not connected yet (no provider key). The illustration shows the colours and patterns, full body, every time.'
      : st === 'queued' || st === 'running' ? 'AI try-on in progress. It appears here when ready.'
      : st === 'failed' ? 'The last AI try-on failed. Check Settings for the reason.' : '';
    $('#genRender').disabled = !S.meta.provider.configured || st === 'queued' || st === 'running';
    $('#genRender').textContent = o.render_id ? 'Re-check AI try-on' : 'Generate AI try-on';
    try { detail = (await api('/outfits/' + o.id)).outfit; } catch (_) { return; }
    if (current() && current().id !== detail.id) return;
    renderSide(detail);
  }

  function renderSide(o) {
    const e = o.eval;
    const occ = e.occasions.slice().sort((a, b) => b.fit - a.fit).map((x) => `<div class="occ ${e.recommended.includes(x.key) ? 'best' : ''}"><span>${esc(x.label)}</span><span class="bar"><i style="width:${x.fit * 10}%"></i></span><span>${x.fit}</span></div>`).join('');
    const stars = [1, 2, 3, 4, 5].map((n) => `<button data-r="${n}" class="${o.rating >= n ? 'on' : ''}" aria-label="Rate ${n}">&#9733;</button>`).join('');
    $('#side').innerHTML = `
      <h2>${esc(o.shirt.name)}</h2>
      <div class="muted">with ${esc(o.pants.name)} and ${esc(o.shoe.name)}</div>
      ${o.shirt.is_slot ? '<p class="tiny err">This shirt slot has no details yet. Add its colour and a photo in Wardrobe.</p>' : ''}
      <div class="scores"><div class="score"><b>${e.overall}</b><span>Style score</span></div><div class="score"><b>${e.color}</b><span>Colour match</span></div></div>
      <p class="tiny muted">${esc(e.disclaimer)}</p>
      <div class="adv" id="explain">${esc(o.ai_note || e.explanation)}</div>
      ${e.cautions && e.cautions.length ? `<p class="tiny muted">Watch: ${esc(e.cautions.join('; '))}.</p>` : ''}
      <div class="adv"><b>${esc(e.tuck.advice)}.</b> ${esc(e.tuck.why)}.</div>
      <div class="adv"><b>Sleeves: ${esc(e.sleeves.advice)}.</b> ${esc(e.sleeves.why)}.</div>
      <h3>Occasions</h3>${occ}
      <div class="stars" id="stars" role="group" aria-label="Your rating">${stars}</div>
      <div class="acts">
        <button class="btn sm" id="favBtn">${o.favorite ? '&#9733; Favourite' : '&#9734; Add to favourites'}</button>
        <button class="btn sm" id="wornBtn">Wore it today</button>
        <button class="btn sm" id="aiBtn" ${S.meta.ai_text ? '' : 'title="AI wording is off; the rules text is shown"'}>AI stylist note</button>
      </div>
      <div class="acts"><label class="chk">Plan for <input type="date" id="planDate" value="${S.meta.today}"></label><button class="btn sm" id="planBtn">Plan</button></div>
      <p class="tiny" id="sideMsg"></p>`;
    $('#favBtn').onclick = async () => { await api('/outfits/' + o.id, { method: 'PATCH', body: { favorite: !o.favorite } }); await reload(); renderStage(); };
    $('#stars').onclick = async (ev) => { const b = ev.target.closest('button'); if (!b) return; const r = Number(b.dataset.r); await api('/outfits/' + o.id, { method: 'PATCH', body: { rating: o.rating === r ? null : r } }); await reload(); renderStage(); };
    $('#wornBtn').onclick = async () => { await api('/outfits/' + o.id + '/worn', { method: 'POST', body: { occasion: $('#todayOcc').value } }); $('#sideMsg').textContent = 'Logged as worn today.'; };
    $('#planBtn').onclick = async () => { const d = $('#planDate').value; await api('/plan/' + d, { method: 'PUT', body: { outfit_id: o.id, occasion: $('#todayOcc').value } }); $('#sideMsg').textContent = 'Planned for ' + d + '.'; };
    $('#aiBtn').onclick = async () => {
      $('#aiBtn').disabled = true;
      try { const r = await api('/outfits/' + o.id + '/advice', { method: 'POST' }); $('#explain').textContent = r.text; $('#sideMsg').textContent = r.note || (r.composed_by === 'model' ? 'Worded by the AI stylist from the same reasons.' : ''); }
      catch (e) { $('#sideMsg').textContent = e.message; } finally { $('#aiBtn').disabled = false; }
    };
  }

  $('#showRender').onclick = () => { S.preferRender = true; renderStage(); };
  $('#showSketch').onclick = () => { S.preferRender = false; renderStage(); };
  $('#genRender').onclick = async () => {
    const o = current(); if (!o) return;
    try {
      const r = await api('/renders', { method: 'POST', body: { outfit_ids: [o.id] } });
      const x = r.results[0];
      $('#renderNote').textContent = x.status === 'needs_photo' ? 'Add a photo of: ' + x.missing.join(', ') + ' (Wardrobe).' : x.status === 'cached' ? 'Already rendered with these photos.' : 'Queued. It appears here when ready.';
      pollRender(o.id);
    } catch (e) { $('#renderNote').textContent = (e.data && e.data.message) || e.message; }
  };
  let pollT = null;
  function pollRender(id) {
    clearTimeout(pollT);
    pollT = setTimeout(async () => {
      await reload(); const o = S.outfits.find((x) => x.id === id);
      if (S.view === 'studio') renderStage();
      if (o && (o.render_status === 'queued' || o.render_status === 'running')) pollRender(id);
    }, 6000);
  }

  // Zoom
  function openZoom(src) { $('#zoomImg').src = src; $('#zoomBody').classList.remove('big'); $('#zoomToggle').textContent = 'Zoom in'; $('#zoom').hidden = false; }
  $('#zoomBtn').onclick = () => openZoom($('#stageImg').src);
  $('#stageImg').onclick = () => openZoom($('#stageImg').src);
  $('#zoomToggle').onclick = () => { const b = $('#zoomBody').classList.toggle('big'); $('#zoomToggle').textContent = b ? 'Fit to screen' : 'Zoom in'; };
  $('#zoomClose').onclick = () => { $('#zoom').hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#zoom').hidden = true; $('#drawer').hidden = true; } });

  // Today / random
  function pickCard(o, why) {
    return `<div class="pick" data-id="${o.id}"><img src="${bestImg(o)}" alt=""><div><b>${esc(o.shirt.name)}</b><div class="tiny">with ${esc(o.pants.name)}</div><div class="tiny muted">Style ${o.eval.overall}/10${why ? ' · ' + esc(why) : ''}</div></div></div>`;
  }
  $('#todayGo').onclick = async () => {
    $('#todayOut').innerHTML = '<span class="muted">Thinking it over...</span>';
    const r = await api('/today?occasion=' + $('#todayOcc').value);
    const w = r.weather ? `${r.weather.place}: high of ${r.weather.temp_f}°F${r.weather.rain_chance != null ? ', ' + r.weather.rain_chance + '% chance of rain' : ''}. ` : '';
    $('#todayOut').innerHTML = r.picks.map((o, i) => pickCard(o, i === 0 ? 'Top pick' : '')).join('') + `<p class="tiny muted" style="grid-column:1/-1">${esc(w + r.basis)}</p>`;
  };
  $('#randomGo').onclick = async () => {
    const r = await api('/random?occasion=' + $('#todayOcc').value);
    $('#todayOut').innerHTML = pickCard(r.outfit, 'Random pick');
  };
  $('#todayOut').addEventListener('click', (e) => {
    const p = e.target.closest('.pick'); if (!p) return;
    const o = S.outfits.find((x) => x.id === Number(p.dataset.id)); if (!o) return;
    S.shirt = o.shirt.id; S.pants = o.pants.id; S.shoe = o.shoe.id; renderStudio();
    $('#frame').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* GALLERY */
  function card(o) {
    return `<article class="ocard" data-id="${o.id}"><div class="pic"><img src="${bestImg(o)}" alt="${esc(o.shirt.name)} with ${esc(o.pants.name)}" loading="lazy"></div>
      <div class="meta"><b>${esc(o.shirt.name)}</b><span class="muted">with ${esc(o.pants.name)}</span>
      <div class="chips"><span class="chip dark">Style ${o.eval.overall}/10</span>${o.favorite ? '<span class="chip">&#9733; Favourite</span>' : ''}${o.render_id ? '<span class="chip">AI render</span>' : '<span class="chip">Illustration</span>'}${o.eval.recommended.slice(0, 2).map((k) => `<span class="chip">${esc(occLabel(k))}</span>`).join('')}</div></div></article>`;
  }
  let gTimer = null;
  async function renderGallery() {
    const q = new URLSearchParams();
    if ($('#gQ').value.trim()) q.set('q', $('#gQ').value.trim());
    if ($('#gOcc').value) q.set('occasion', $('#gOcc').value);
    if ($('#gFav').checked) q.set('favorite', '1');
    const r = await api('/outfits?' + q);
    $('#gCount').textContent = r.total + ' outfits';
    $('#gallery').innerHTML = r.outfits.map(card).join('') || '<p class="muted">Nothing matches.</p>';
  }
  $('#gQ').addEventListener('input', () => { clearTimeout(gTimer); gTimer = setTimeout(renderGallery, 250); });
  $('#gOcc').onchange = renderGallery; $('#gFav').onchange = renderGallery;
  function openInStudio(e) {
    const c = e.target.closest('.ocard'); if (!c) return;
    const o = S.outfits.find((x) => x.id === Number(c.dataset.id)); if (!o) return;
    S.shirt = o.shirt.id; S.pants = o.pants.id; S.shoe = o.shoe.id; show('studio');
  }
  $('#gallery').addEventListener('click', openInStudio);

  /* COMPARE */
  async function renderCompare() {
    const shirts = S.items.filter((i) => i.category === 'shirt');
    if (!$('#cShirt').options.length || $('#cShirt').options.length !== shirts.length) $('#cShirt').innerHTML = shirts.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    if (S.shirt) $('#cShirt').value = S.shirt;
    const sid = Number($('#cShirt').value);
    $('#cDl').href = `${API}/compare/${sid}/download.png`;
    $('#cPdf').href = `${API}/export/catalog.pdf?shirt=${sid}`;
    const r = await api('/compare/' + sid);
    $('#compare').innerHTML = r.outfits.map(card).join('');
  }
  $('#cShirt').onchange = () => { S.shirt = Number($('#cShirt').value); renderCompare(); };
  $('#compare').addEventListener('click', (e) => { const c = e.target.closest('.ocard'); if (c) openZoom(c.querySelector('img').src); });
  $('#cRender').onclick = async () => {
    try { const r = await api('/renders', { method: 'POST', body: { scope: 'shirt:' + $('#cShirt').value } }); alert(summarizeQueue(r)); }
    catch (e) { alert((e.data && e.data.message) || e.message); }
  };
  function summarizeQueue(r) {
    const c = {}; r.results.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
    const miss = [...new Set(r.results.filter((x) => x.missing).flatMap((x) => x.missing))];
    return Object.entries(c).map(([k, v]) => v + ' ' + k.replace('_', ' ')).join(', ') + (miss.length ? '. Photos needed: ' + miss.join(', ') : '');
  }

  /* PLANNER */
  async function renderPlanner() {
    const [p, h] = await Promise.all([api('/plan?from=' + S.meta.today), api('/history')]);
    const byDate = new Map(p.plan.map((x) => [x.date, x]));
    const opts = S.outfits.filter((o) => !o.shirt.is_slot).map((o) => `<option value="${o.id}">${esc(o.shirt.name)} + ${esc(o.pants.color_name || o.pants.name)}</option>`).join('');
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(S.meta.today + 'T12:00:00'); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const pl = byDate.get(iso); const o = pl && S.outfits.find((x) => x.id === pl.outfit_id);
      days.push(`<div class="day ${i === 0 ? 'today' : ''}" data-date="${iso}"><h4>${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
        ${o ? `<img src="${bestImg(o)}" alt="">` : '<div class="muted tiny">Nothing planned</div>'}
        <select aria-label="Outfit for ${iso}"><option value="">Choose...</option>${opts}</select>
        ${o ? '<button class="btn sm ghost" data-clear>Clear</button>' : ''}</div>`);
    }
    $('#plan').innerHTML = days.join('');
    $$('#plan .day').forEach((el) => { const pl = byDate.get(el.dataset.date); if (pl) $('select', el).value = pl.outfit_id; });
    $('#history').innerHTML = h.history.map((x) => `<div class="hist"><span>${esc(x.date)} · <b>${esc(x.shirt)}</b> with ${esc(x.pants)}${x.occasion ? ' · ' + esc(occLabel(x.occasion)) : ''}</span><button class="btn sm ghost" data-hid="${x.id}">Remove</button></div>`).join('') || '<p class="muted">Nothing logged yet. Tap "Wore it today" on an outfit.</p>';
  }
  $('#plan').addEventListener('change', async (e) => {
    const day = e.target.closest('.day'); if (!day || !e.target.value) return;
    await api('/plan/' + day.dataset.date, { method: 'PUT', body: { outfit_id: Number(e.target.value) } }); renderPlanner();
  });
  $('#plan').addEventListener('click', async (e) => { if (!e.target.matches('[data-clear]')) return; await api('/plan/' + e.target.closest('.day').dataset.date, { method: 'DELETE' }); renderPlanner(); });
  $('#history').addEventListener('click', async (e) => { const id = e.target.dataset.hid; if (!id) return; await api('/history/' + id, { method: 'DELETE' }); renderPlanner(); });

  /* WARDROBE */
  async function renderWardrobe() {
    const r = await api('/items' + ($('#wArch').checked ? '?archived=1' : ''));
    const list = r.items.filter((i) => i.category === S.wCat);
    $('#wList').innerHTML = list.map((i) => `<button class="witem ${i.archived ? 'arch' : ''}" data-id="${i.id}"><img src="${itemImg(i)}" alt=""><span><b>${esc(i.name)}</b><span class="tiny muted">${esc([i.brand, i.color_name, i.pattern].filter(Boolean).join(' · '))}</span><br><span class="tiny muted">${i.photo_count} photo${i.photo_count === 1 ? '' : 's'}${i.archived ? ' · archived' : ''}${i.is_slot ? ' · needs details' : ''}${i.favorite ? ' · &#9733;' : ''}</span></span></button>`).join('');
    S._wItems = r.items;
  }
  $('#wCat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.wCat = b.dataset.c; $$('#wCat button').forEach((x) => x.classList.toggle('on', x === b)); renderWardrobe(); });
  $('#wArch').onchange = renderWardrobe;
  $('#wAdd').onclick = () => openDrawer({ category: S.wCat, name: '', pattern: S.wCat === 'shirt' ? 'oxford' : 'solid', color_hex: '#dddddd' });
  $('#wList').addEventListener('click', (e) => { const b = e.target.closest('.witem'); if (b) openDrawer(S._wItems.find((i) => i.id === Number(b.dataset.id))); });

  let dItem = null;
  async function openDrawer(it) {
    dItem = it; const f = $('#itemForm');
    $('#dTitle').textContent = it.id ? 'Edit ' + it.name : 'Add ' + ({ shirt: 'a shirt', pants: 'trousers', shoes: 'shoes' }[it.category]);
    for (const k of ['id', 'category', 'name', 'brand', 'garment_type', 'color_name', 'notes', 'pattern']) f[k].value = it[k] == null ? '' : it[k];
    f.color_hex.value = it.color_hex || '#dddddd'; f.color2_hex.value = it.color2_hex || '#999999'; f.favorite.checked = !!it.favorite;
    $('#dArchive').hidden = !it.id; $('#dDelete').hidden = !it.id; $('#dArchive').textContent = it.archived ? 'Restore' : 'Archive';
    $('#photoBlock').hidden = !it.id; $('#photoMsg').textContent = '';
    $('#drawer').hidden = false;
    if (it.id) loadPhotos();
  }
  async function loadPhotos() {
    const r = await api('/items/' + dItem.id + '/photos');
    $('#dPhotos').innerHTML = r.photos.map((p) => `<div class="photo ${p.is_primary ? 'prim' : ''}" data-id="${p.id}"><img src="${API}/photos/${p.id}?size=thumb" alt=""><div class="pa">${p.is_primary ? '<button disabled>Main</button>' : '<button data-a="prim">Make main</button>'}<button data-a="del">Delete</button></div></div>`).join('') || '<p class="tiny muted">No photos yet.</p>';
  }
  $('#dPhotos').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const id = b.closest('.photo').dataset.id;
    if (b.dataset.a === 'del') { if (!confirm('Delete this photo?')) return; await api('/photos/' + id, { method: 'DELETE' }); }
    else await api('/photos/' + id, { method: 'PATCH', body: { is_primary: true } });
    await loadPhotos(); await reload();
  });
  $('#dClose').onclick = () => { $('#drawer').hidden = true; };
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') $('#drawer').hidden = true; });
  $('#itemForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value, brand: f.brand.value, garment_type: f.garment_type.value, color_name: f.color_name.value, color_hex: f.color_hex.value, color2_hex: ['gingham', 'stripe', 'plaid'].includes(f.pattern.value) || dItem.category === 'shoes' ? f.color2_hex.value : null, pattern: f.pattern.value, notes: f.notes.value, favorite: f.favorite.checked };
    try {
      if (dItem.id) await api('/items/' + dItem.id, { method: 'PATCH', body });
      else { const r = await api('/items', { method: 'POST', body: { ...body, category: dItem.category } }); dItem = { ...body, id: r.id, category: dItem.category }; $('#photoBlock').hidden = false; f.id.value = r.id; loadPhotos(); }
      await reload(); renderWardrobe(); $('#photoMsg').textContent = 'Saved.';
    } catch (err) { alert(err.message); }
  });
  $('#dArchive').onclick = async () => {
    if (dItem.archived) await api('/items/' + dItem.id, { method: 'PATCH', body: { archived: false } });
    else await api('/items/' + dItem.id, { method: 'DELETE' });
    $('#drawer').hidden = true; await reload(); renderWardrobe();
  };
  $('#dDelete').onclick = async () => {
    if (!confirm('Delete "' + dItem.name + '" for good? Its photos, its outfits and their history go with it. Archive keeps them.')) return;
    await api('/items/' + dItem.id + '?hard=1', { method: 'DELETE' }); $('#drawer').hidden = true; await reload(); renderWardrobe();
  };
  $('#photoForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const fd = new FormData();
    for (const file of f.photos.files) fd.append('photos', file);
    $('#photoMsg').textContent = 'Uploading...';
    try {
      const r = await api('/items/' + dItem.id + '/photos' + (f.trim.checked ? '?trim=1' : ''), { method: 'POST', body: fd });
      const bad = r.results.filter((x) => !x.ok);
      $('#photoMsg').textContent = (r.results.length - bad.length) + ' uploaded.' + (bad.length ? ' Not uploaded: ' + bad.map((x) => x.name + ' (' + x.error + ')').join('; ') : '');
    } catch (err) { $('#photoMsg').textContent = (err.data && err.data.results ? err.data.results.map((x) => x.name + ': ' + x.error).join('; ') : err.message); }
    f.reset(); await loadPhotos(); await reload(); renderWardrobe();
  });

  /* SETTINGS */
  async function renderSettings() {
    S.meta = await api('/meta');
    const p = S.meta.provider;
    $('#modelPrev').innerHTML = S.meta.model_photo ? `<img src="${API}/photos/${S.meta.model_photo.id}?size=thumb" alt="Your reference photo">` : '<span class="muted">No photo yet</span>';
    $('#provLine').textContent = p.configured ? 'Provider: ' + p.name + '. It dresses your reference photo in your garment photos. Patterns and logos can drift, so every result is labelled as an AI render.' : 'No try-on provider is connected yet (FASHN_API_KEY is not set on the server). Everything else works; outfits show as illustrations.';
    $('#consentText').textContent = p.configured ? 'I agree that my reference photo and my garment photos are sent to ' + p.name + ' to create try-on images. Unticking this stops anything still waiting.' : 'Consent becomes available once a provider is connected.';
    $('#consent').checked = !!S.meta.consent; $('#consent').disabled = !p.configured;
    $$('[data-scope]').forEach((b) => { b.disabled = !p.configured; });
    const q = await api('/renders');
    $('#queue').innerHTML = `<p class="tiny muted">${q.done} done · ${q.queued} waiting · ${q.running} running · ${q.failed} failed</p>` +
      q.renders.slice(0, 25).map((r) => { const o = S.outfits.find((x) => x.id === r.outfit_id); return `<div><span>${o ? esc(o.shirt.name + ' + ' + o.pants.color_name) : 'Outfit ' + r.outfit_id}</span><span>${esc(r.status)}${r.step ? ' (' + esc(r.step) + ')' : ''}${r.error ? ': ' + esc(r.error) : ''}</span></div>`; }).join('');
  }
  $('#consent').onchange = async (e) => { try { await api('/settings', { method: 'PUT', body: { consent: e.target.checked } }); } catch (err) { alert(err.message); } renderSettings(); };
  $$('[data-scope]').forEach((b) => { b.onclick = async () => { try { const r = await api('/renders', { method: 'POST', body: { scope: b.dataset.scope } }); alert(summarizeQueue(r)); renderSettings(); } catch (e) { alert((e.data && e.data.message) || e.message); } }; });
  $('#modelForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    if (!e.target.full_body.checked) return;
    $('#modelMsg').textContent = 'Uploading...';
    try { const r = await api('/model-photo', { method: 'POST', body: fd }); $('#modelMsg').textContent = r.warning || 'Saved. This is now your reference photo.'; e.target.reset(); renderSettings(); }
    catch (err) { $('#modelMsg').textContent = (err.data && err.data.message) || err.message; }
  });
  $('#delGo').onclick = async () => {
    const what = $$('.del:checked').map((c) => c.value); if (!what.length) return;
    if (!confirm('Delete ' + what.join(', ') + ' for good? This cannot be undone.')) return;
    const r = await api('/privacy/delete', { method: 'POST', body: { confirm: 'delete', what } });
    $('#delMsg').textContent = 'Deleted: ' + Object.entries(r.deleted).map(([k, v]) => v + ' ' + k.replace('_', ' ')).join(', ') + '.';
    $$('.del').forEach((c) => { c.checked = false; }); await reload(); renderSettings();
  };

  boot();
})();
