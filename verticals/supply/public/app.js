/* RinglyPro Supply — dashboard SPA. Vanilla JS, no build step. Every value rendered goes through esc(). */
(function () {
  'use strict';
  var BASE = window.SUP_BASE || '';
  var ME = null; var ACT_AS = null; var VOCAB = {};
  try { ACT_AS = sessionStorage.getItem('sup_act_as'); } catch (e) { /* private mode */ }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return n == null ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(n) { return n == null ? '' : Number(n).toLocaleString('en-US'); }
  function date(d) { return d ? new Date(d).toLocaleString() : ''; }
  function label(s) { return String(s || '').replace(/_/g, ' '); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 4000); }

  function api(method, path, body, isForm) {
    var h = { 'X-Supply': '1' };
    if (!isForm) h['Content-Type'] = 'application/json';
    if (ACT_AS) h['X-Supply-Tenant'] = ACT_AS;
    return fetch(BASE + '/api/v1' + path, { method: method, headers: h, body: body == null ? undefined : (isForm ? body : JSON.stringify(body)) })
      .then(function (r) {
        if (r.status === 401) { location.href = BASE + '/login'; throw new Error('Signed out'); }
        return r.json().then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Request failed'); e.data = d; throw e; } return d; });
      });
  }
  function fail(e) { toast(e.message + (e.data && e.data.missing ? ': ' + e.data.missing.join(', ') : '')); }
  function formData(form) { var o = {}; Array.prototype.forEach.call(form.elements, function (el) { if (!el.name) return; if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.multiple) o[el.name] = Array.prototype.filter.call(el.options, function (x) { return x.selected; }).map(function (x) { return Number(x.value); }); else if (el.value !== '') o[el.name] = el.value; }); return o; }
  function table(cols, rows, empty) {
    if (!rows || !rows.length) return '<p class="muted">' + esc(empty || 'Nothing here yet.') + '</p>';
    return '<div class="tablewrap"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + (c[2] ? c[2](r) : esc(r[c[1]])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function field(name, lab, type, val, extra) {
    if (type === 'textarea') return '<div><label>' + esc(lab) + '</label><textarea name="' + name + '">' + esc(val) + '</textarea></div>';
    return '<div><label>' + esc(lab) + '</label><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '></div>';
  }
  function select(name, lab, opts, val, multiple) {
    return '<div><label>' + esc(lab) + '</label><select name="' + name + '"' + (multiple ? ' multiple size="6"' : '') + '>' + (multiple ? '' : '<option value="">(none)</option>') +
      opts.map(function (o) { var sel = multiple ? (val || []).indexOf(o[0]) >= 0 : String(o[0]) === String(val); return '<option value="' + esc(o[0]) + '"' + (sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function statusPill(s) {
    var cls = { active: 'ok', approved: 'ok', won: 'ok', completed: 'ok', paid: 'ok', pending_approval: 'warn', paused: 'warn', pending: 'warn', dispatched: 'warn', draft: '', cancelled: 'bad', failed: 'bad', lost: 'bad', void: 'bad' }[s];
    return '<span class="pill ' + (cls || '') + '">' + esc(label(s)) + '</span>';
  }
  function isAdmin() { return ME && (ME.user.is_super_admin || ['owner', 'admin'].indexOf(ME.user.role) >= 0); }

  var NAV = [
    ['Sell', [['dashboard', 'Dashboard'], ['products', 'Products'], ['pricing', 'Competitive Pricing'], ['contractors', 'Contractors'], ['buyers', 'Potential Buyers'], ['campaigns', 'Campaigns']]],
    ['Calls', [['calls', 'Calls'], ['conversations', 'Conversations'], ['pipeline', 'Sales Pipeline'], ['commissions', 'Commissions']]],
    ['Setup', [['agents', 'AI Agents'], ['ghl', 'GoHighLevel'], ['reports', 'Reports'], ['settings', 'Settings']]]
  ];
  function drawNav(cur) {
    var h = NAV.map(function (g) { return '<div class="group">' + esc(g[0]) + '</div>' + g[1].map(function (i) { return '<a href="#' + i[0] + '" class="' + (i[0] === cur ? 'on' : '') + '">' + esc(i[1]) + '</a>'; }).join(''); }).join('');
    if (ME && ME.user.is_super_admin) h += '<div class="group">Platform</div><a href="#platform" class="' + (cur === 'platform' ? 'on' : '') + '">Super Admin</a>';
    $('#nav').innerHTML = h;
  }

  var V = {};
  function go() {
    var key = (location.hash || '#dashboard').slice(1).split('/')[0] || 'dashboard';
    if (!V[key]) key = 'dashboard';
    drawNav(key); $('#side').classList.remove('open');
    $('#actions').innerHTML = ''; $('#view').innerHTML = '<p class="muted">Loading…</p>';
    if (!ME.tenant && !ACT_AS && key !== 'platform') { location.hash = '#platform'; return; }
    V[key]().catch(function (e) { $('#view').innerHTML = '<div class="card"><b>Could not load.</b><p class="muted">' + esc(e.message) + '</p></div>'; });
  }
  function title(t, actions) { $('#title').textContent = t; $('#actions').innerHTML = actions || ''; }

  // ── Dashboard ──
  V.dashboard = function () {
    return Promise.all([api('GET', '/dashboard'), api('GET', '/onboarding')]).then(function (x) {
      var d = x[0]; var ob = x[1]; var k = d.kpis;
      title('Dashboard');
      var tiles = [['Active campaigns', k.active_campaigns], ['Outbound calls today', k.outbound_today], ['Connected calls', k.connected], ['Interested contractors', k.interested],
        ['Potential buyers', k.potential_buyers], ['Callbacks', k.callbacks], ['Sales transfers', k.transfers], ['Quotes', k.quotes], ['Sales', k.sales], ['Revenue', money(k.revenue)],
        ['Conversion rate', k.conversion_rate == null ? 'n/a' : k.conversion_rate + '%'], ['GoHighLevel', d.ghl ? (d.ghl.ok ? 'Connected' : 'Error') : 'Not checked']];
      var h = '<div class="kpis">' + tiles.map(function (t) { return '<div class="kpi"><b>' + esc(t[1]) + '</b><span>' + esc(t[0]) + '</span></div>'; }).join('') + '</div>';
      if (ob.done < ob.total) h += '<div class="card" style="margin-bottom:16px"><b>Setup: ' + ob.done + ' of ' + ob.total + '</b><div class="row small" style="margin-top:8px">' + ob.steps.map(function (s) { return '<span class="pill ' + (s.done ? 'ok' : '') + '">' + s.step + '. ' + esc(s.label) + '</span>'; }).join(' ') + '</div></div>';
      if (d.ghl && !d.ghl.ok) h += '<div class="card" style="margin-bottom:16px;border-color:var(--bad)"><b>GoHighLevel error</b><p class="small muted">' + esc(d.ghl.last_error) + '</p></div>';
      h += '<div class="two"><div><h3>Top products</h3>' + table([['Product', 'name'], ['Buyers', 'buyers'], ['Revenue', '', function (r) { return money(r.revenue); }]], d.top_products, 'No buyer activity yet.') +
        '<h3>Top contractor categories</h3>' + table([['Category', 'name'], ['Buyers', 'buyers']], d.top_categories) + '</div>' +
        '<div><h3>Best campaigns</h3>' + table([['Campaign', 'campaign_name'], ['Status', '', function (r) { return statusPill(r.status); }], ['Buyers', 'buyers'], ['Revenue', '', function (r) { return money(r.revenue); }]], d.best_campaigns) +
        '<h3>Inventory opportunities</h3><p class="small muted">In stock, priced, and in no open campaign.</p>' + table([['Product', 'name'], ['On hand', '', function (r) { return num(r.quantity_available) + ' ' + esc(r.unit || ''); }], ['Stock value', '', function (r) { return money(r.stock_value); }]], d.inventory_opportunities) +
        '<h3>Verified price advantages</h3>' + table([['Product', 'name'], ['vs', 'competitor'], ['Savings', '', function (r) { return Number(r.savings_percentage).toFixed(1) + '%'; }], ['Checked', '', function (r) { return esc(String(r.date_checked).slice(0, 10)); }]], d.price_advantages, 'No verified competitor prices yet.') + '</div></div>';
      $('#view').innerHTML = h;
    });
  };

  // ── Products ──
  V.products = function () {
    return api('GET', '/products').then(function (rows) {
      title('Products', isAdmin() ? '<button class="btn" id="an">Analyze all buyers</button> <button class="btn primary" id="add">Add product</button>' : '');
      var h = '';
      if (isAdmin()) h += '<div class="card" style="margin-bottom:14px"><b>Upload catalog</b> <span class="muted small">CSV or Excel. Columns like SKU, UPC, Name, Category, Brand, Model, Unit, Qty, Cost, Price, Min Price, Promo Price. Other columns are kept as attributes. Rows with a known SKU are updated.</span><form id="up" class="row" style="margin-top:8px"><input type="file" name="file" accept=".csv,.xlsx,.xls" required><button class="btn primary" style="flex:none">Import</button></form><div id="upr" class="small"></div></div>';
      h += '<div id="pform"></div>' + table([['SKU', 'sku'], ['Product', '', function (r) { return '<a href="#product/' + r.id + '">' + esc(r.name) + '</a>'; }], ['Category', 'category'], ['On hand', '', function (r) { return num(r.quantity_available) + ' ' + esc(r.unit || ''); }],
        ['Price', '', function (r) { return money(r.selling_price) + (r.promotional_price ? ' <span class="pill warn">promo ' + money(r.promotional_price) + '</span>' : ''); }], ['Min', '', function (r) { return money(r.minimum_price); }], ['Status', '', function (r) { return r.active ? statusPill('active') : statusPill('cancelled').replace('cancelled', 'inactive'); }]], rows, 'No products yet. Upload your catalog.');
      $('#view').innerHTML = h;
      if ($('#add')) $('#add').onclick = function () { productForm({}); };
      if ($('#an')) $('#an').onclick = function () { api('POST', '/products/analyze-all').then(function (r) { toast('Analyzed ' + r.analyzed + ' products'); }).catch(fail); };
      if ($('#up')) $('#up').onsubmit = function (e) { e.preventDefault(); api('POST', '/products/import', new FormData(e.target), true).then(function (r) { $('#upr').innerHTML = 'Created ' + r.created + ', updated ' + r.updated + ', failed ' + r.failed + (r.errors.length ? '<pre>' + esc(r.errors.map(function (x) { return 'Row ' + x.row + ': ' + x.error; }).join('\n')) + '</pre>' : ''); setTimeout(go, 1500); }).catch(fail); };
    });
  };
  function productForm(p) {
    var f = [['sku', 'SKU'], ['upc', 'UPC'], ['name', 'Name'], ['category', 'Category'], ['subcategory', 'Subcategory'], ['brand', 'Brand'], ['model', 'Model'], ['dimensions', 'Dimensions'], ['material', 'Material'], ['unit', 'Unit (e.g. sq ft)'],
      ['quantity_available', 'Quantity available', 'number'], ['cost', 'Cost', 'number'], ['selling_price', 'Selling price', 'number'], ['minimum_price', 'Minimum price', 'number'], ['promotional_price', 'Promotional price', 'number'],
      ['inventory_location', 'Inventory location'], ['product_url', 'Product URL'], ['image', 'Image URL']];
    var el = $('#pform') || $('#view');
    el.innerHTML = '<form class="card" id="pf" style="margin-bottom:14px"><div class="row">' + f.map(function (x) { return field(x[0], x[1], x[2], p[x[0]], x[2] === 'number' ? 'step="any" min="0"' : ''); }).join('') + '</div>' +
      field('description', 'Description', 'textarea', p.description) + field('notes', 'Notes', 'textarea', p.notes) +
      '<label><input type="checkbox" name="active" style="width:auto" ' + (p.active === false ? '' : 'checked') + '> Active</label><div class="row" style="margin-top:10px"><button class="btn primary" style="flex:none">Save</button></div></form>';
    $('#pf').onsubmit = function (e) { e.preventDefault(); var d = formData(e.target); (p.id ? api('PATCH', '/products/' + p.id, d) : api('POST', '/products', d)).then(function (r) { toast('Saved'); location.hash = '#product/' + r.id; go(); }).catch(fail); };
  }
  V.product = function () {
    var id = location.hash.split('/')[1];
    return Promise.all([api('GET', '/products/' + id), api('GET', '/categories')]).then(function (x) {
      var d = x[0]; var p = d.product; var cats = x[1];
      title(p.name, isAdmin() ? '<button class="btn" id="ed">Edit</button> <button class="btn primary" id="an">Analyze likely buyers</button>' : '');
      var h = '<div id="pform"></div><div class="two"><div class="card"><div class="small muted">SKU ' + esc(p.sku) + ' · UPC ' + esc(p.upc) + ' · ' + esc(p.brand) + ' ' + esc(p.model) + '</div><p>' + esc(p.description) + '</p>' +
        '<p><b>' + money(p.promotional_price || p.selling_price) + '</b> per ' + esc(p.unit || 'unit') + ' · ' + num(p.quantity_available) + ' on hand · floor ' + money(p.minimum_price) + '</p>' +
        (Object.keys(p.attributes || {}).length ? '<pre>' + esc(JSON.stringify(p.attributes, null, 2)) + '</pre>' : '') + '</div>' +
        '<div><h3 style="margin-top:0">Who buys it</h3>' + table([['Contractor category', 'category'], ['Relevance', '', function (r) { return '<b>' + r.relevance_score + '</b> <span class="pill">' + esc(r.source) + '</span>'; }], ['Why', 'reasoning_summary']], d.relevance, 'Not analyzed yet.') +
        (isAdmin() ? '<form id="ms" class="row"><div>' + select('category_id', 'Set a score by hand', cats.map(function (c) { return [c.id, c.name]; })) + '</div>' + field('score', 'Score 0-100', 'number', '', 'min="0" max="100"') + field('reason', 'Reason') + '<button class="btn" style="flex:none">Set</button></form>' : '') + '</div></div>' +
        '<h3>Competitor prices</h3>' + priceTable(d.prices);
      $('#view').innerHTML = h;
      if ($('#ed')) $('#ed').onclick = function () { productForm(p); };
      if ($('#an')) $('#an').onclick = function () { api('POST', '/products/' + p.id + '/analyze').then(function () { toast('Analyzed'); go(); }).catch(fail); };
      if ($('#ms')) $('#ms').onsubmit = function (e) { e.preventDefault(); api('PUT', '/products/' + p.id + '/relevance', formData(e.target)).then(go).catch(fail); };
      bindConfirm();
    });
  };

  // ── Pricing ──
  function priceTable(rows) {
    return table([['Product', 'product_name'], ['Competitor', 'competitor'], ['Their listing', '', function (r) { return esc(r.competitor_product) + (r.competitor_url ? ' <a href="' + esc(r.competitor_url) + '" target="_blank" rel="noopener noreferrer">link</a>' : ''); }],
      ['Their price', '', function (r) { return money(r.competitor_price) + ' / ' + esc(r.competitor_unit || ''); }], ['Checked', '', function (r) { return esc(String(r.date_checked).slice(0, 10)); }],
      ['Match', '', function (r) { return Number(r.match_confidence).toFixed(2) + '<div class="small muted">' + esc((r.match_basis || []).join(', ')) + '</div>'; }],
      ['Savings', '', function (r) { return r.savings_percentage == null ? '' : Number(r.savings_percentage).toFixed(1) + '%'; }],
      ['Usable in calls', '', function (r) { return r.verified ? '<span class="pill ok">verified</span>' : '<span class="pill warn">not verified</span>' + (isAdmin() ? ' <button class="btn small" data-confirm="' + r.id + '">I checked: same item</button>' : ''); }]], rows, 'No competitor prices recorded.');
  }
  function bindConfirm() { document.querySelectorAll('[data-confirm]').forEach(function (b) { b.onclick = function () { api('POST', '/prices/' + b.getAttribute('data-confirm') + '/confirm').then(go).catch(fail); }; }); }
  V.pricing = function () {
    return Promise.all([api('GET', '/prices'), api('GET', '/products'), api('GET', '/competitors')]).then(function (x) {
      title('Competitive Pricing');
      $('#view').innerHTML = '<div class="card" style="margin-bottom:14px"><b>Record a competitor price</b><p class="small muted">Enter what the competitor listed and when you checked it. A price is used in calls only when it is verified (same UPC, or same brand and model, or you confirm it), checked within your freshness window, in the same unit, and higher than yours. Nothing here is scraped: retailers offer no public price API and forbid automated collection.</p>' +
        '<form id="pf"><div class="row">' + select('product_id', 'Our product', x[1].map(function (p) { return [p.id, (p.sku ? p.sku + ' · ' : '') + p.name]; })) +
        '<div><label>Competitor</label><input name="competitor" list="comps" required><datalist id="comps">' + x[2].map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist></div>' +
        field('competitor_product', 'Their product name (as listed)') + field('competitor_brand', 'Brand') + field('competitor_model', 'Model') + field('competitor_upc', 'UPC') + field('competitor_sku', 'Their SKU') +
        field('competitor_price', 'Price', 'number', '', 'step="any" min="0"') + field('competitor_unit', 'Unit') + field('date_checked', 'Date checked', 'date', new Date().toISOString().slice(0, 10)) + field('competitor_url', 'Listing URL', 'url') +
        '</div><button class="btn primary" style="margin-top:10px">Save price</button></form></div>' + priceTable(x[0]);
      $('#pf').onsubmit = function (e) { e.preventDefault(); api('POST', '/prices', formData(e.target)).then(function (r) { toast('Saved · match ' + Number(r.match_confidence).toFixed(2) + (r.verified ? ' · verified' : ' · not verified')); go(); }).catch(fail); };
      bindConfirm();
    });
  };

  // ── Contractors ──
  V.contractors = function () {
    return Promise.all([api('GET', '/contractors' + (V._q ? '?q=' + encodeURIComponent(V._q) : '')), api('GET', '/categories'), api('GET', '/reps')]).then(function (x) {
      var cats = x[1]; var reps = x[2];
      title('Contractors', '<button class="btn primary" id="add">Add contractor</button>');
      var h = '<div class="row" style="margin-bottom:10px"><input id="q" placeholder="Search company, contact, phone, city" value="' + esc(V._q || '') + '"></div>';
      if (isAdmin()) h += '<details class="card" style="margin-bottom:14px"><summary><b>Import contractors</b></summary><p class="small muted">CSV or Excel with Company, Contact, Phone, Email, Website, Category, Address, City, State, Zip, Do Not Call. Duplicates (same phone, or same company in the same ZIP/city) are merged, not doubled.</p><form id="up" class="row"><input type="file" name="file" accept=".csv,.xlsx,.xls" required><button class="btn primary" style="flex:none">Import</button></form><div id="upr" class="small"></div></details>';
      h += '<div id="cform"></div>' + table([['Company', '', function (r) { return '<a href="#contractor/' + r.id + '">' + esc(r.company_name) + '</a>' + (r.do_not_contact ? ' <span class="pill bad">DNC</span>' : ''); }], ['Contact', 'contact_name'], ['Phone', 'phone'],
        ['Category', 'category'], ['City', '', function (r) { return esc([r.city, r.state].filter(Boolean).join(', ')); }], ['Stage', '', function (r) { return statusPill(r.stage); }], ['Interest', 'interest_level'], ['Rep', 'rep_name'], ['Last contact', '', function (r) { return esc(date(r.last_contact)); }]], x[0], 'No contractors yet.');
      $('#view').innerHTML = h;
      $('#q').onchange = function (e) { V._q = e.target.value; go(); };
      $('#add').onclick = function () { contractorForm({}, cats, reps); };
      if ($('#up')) $('#up').onsubmit = function (e) { e.preventDefault(); api('POST', '/contractors/import', new FormData(e.target), true).then(function (r) { $('#upr').innerHTML = 'Created ' + r.created + ', merged ' + r.merged + ', failed ' + r.failed + (r.errors.length ? '<pre>' + esc(r.errors.map(function (z) { return 'Row ' + z.row + ': ' + z.error; }).join('\n')) + '</pre>' : ''); }).catch(fail); };
    });
  };
  function contractorForm(c, cats, reps) {
    var el = $('#cform') || $('#view');
    el.innerHTML = '<form class="card" id="cf" style="margin-bottom:14px"><div class="row">' + [['company_name', 'Company'], ['contact_name', 'Contact name'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'], ['website', 'Website'], ['business_type', 'Business type'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP']].map(function (f) { return field(f[0], f[1], f[2], c[f[0]]); }).join('') +
      select('category_id', 'Contractor category', cats.map(function (x) { return [x.id, x.name]; }), c.category_id) + select('assigned_rep_id', 'Assigned rep', reps.map(function (x) { return [x.id, x.name]; }), c.assigned_rep_id) +
      select('consent_status', 'Consent basis', [['unknown', 'Unknown'], ['business_published', 'Published business line'], ['express', 'Express consent'], ['revoked', 'Revoked']], c.consent_status || 'unknown') + '</div>' +
      field('notes', 'Notes', 'textarea', c.notes) + '<label><input type="checkbox" name="do_not_contact" style="width:auto" ' + (c.do_not_contact ? 'checked' : '') + '> Do not contact</label><button class="btn primary" style="margin-top:10px">Save</button></form>';
    $('#cf').onsubmit = function (e) { e.preventDefault(); var d = formData(e.target); (c.id ? api('PATCH', '/contractors/' + c.id, d) : api('POST', '/contractors', d)).then(function (r) { toast('Saved'); location.hash = '#contractor/' + r.id; go(); }).catch(function (er) { if (er.data && er.data.duplicate_id) { toast('Already exists — opening it'); location.hash = '#contractor/' + er.data.duplicate_id; } else fail(er); }); };
  }
  V.contractor = function () {
    var id = location.hash.split('/')[1];
    return Promise.all([api('GET', '/contractors/' + id), api('GET', '/categories'), api('GET', '/reps')]).then(function (x) {
      var d = x[0]; var c = d.contractor;
      title(c.company_name, '<button class="btn" id="sync">Sync to GoHighLevel</button> <button class="btn" id="ed">Edit</button>');
      $('#view').innerHTML = '<div id="cform"></div><div class="two"><div class="card"><p>' + esc(c.contact_name) + ' · ' + esc(c.phone) + ' · ' + esc(c.email) + '</p><p class="small muted">' + esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')) + '</p><p>Stage ' + statusPill(c.stage) + ' · Consent: ' + esc(label(c.consent_status)) + (c.do_not_contact ? ' <span class="pill bad">Do not contact</span>' : '') + '</p><p class="small muted">GoHighLevel contact: ' + esc(c.ghl_contact_id || 'not synced') + '</p></div>' +
        '<div class="card"><b>What the AI knows about them</b><p class="small muted">This is written onto their GoHighLevel contact after every call, so the inbound agent has it when they call back.</p><pre>' + esc(d.context && d.context.text) + '</pre></div></div><h3>Calls</h3>' + callTable(d.calls);
      $('#ed').onclick = function () { contractorForm(c, x[1], x[2]); };
      $('#sync').onclick = function () { api('POST', '/contractors/' + c.id + '/sync').then(function (r) { toast(r.context.ok ? 'Synced' : 'Contact synced; context not written: ' + r.context.reason); go(); }).catch(fail); };
    });
  };

  // ── Buyers ──
  V.buyers = function () {
    return Promise.all([api('GET', '/buyers?status=open'), api('GET', '/reps')]).then(function (x) {
      title('Potential Buyers');
      $('#view').innerHTML = '<p class="small muted">Created automatically when a call shows commercial interest. The campaign and original call are fixed at creation, so the sale is credited to the campaign that found them.</p>' +
        table([['Company', '', function (r) { return '<a href="#contractor/' + r.contractor_id + '">' + esc(r.company_name) + '</a><div class="small muted">' + esc(r.contact_name) + ' · ' + esc(r.phone) + '</div>'; }], ['Product', 'product_name'], ['Quantity', 'quantity'], ['Timeframe', 'buying_timeframe'], ['Interest', 'interest_level'],
          ['Campaign', 'campaign_name'], ['Rep', 'rep_name'], ['Next action', 'next_action'], ['', '', function (r) { return '<button class="btn small" data-sale="' + r.id + '">Record sale</button> <button class="btn small danger" data-lost="' + r.id + '">Lost</button>'; }]], x[0], 'No potential buyers yet.');
      document.querySelectorAll('[data-sale]').forEach(function (b) { b.onclick = function () { var amt = prompt('Sale amount (USD)'); if (!amt) return; api('POST', '/sales', { buyer_id: Number(b.getAttribute('data-sale')), sale_amount: amt }).then(function (r) { toast('Sale recorded' + (r.commission ? ' · commission ' + money(r.commission.commission_amount) : '')); go(); }).catch(fail); }; });
      document.querySelectorAll('[data-lost]').forEach(function (b) { b.onclick = function () { api('PATCH', '/buyers/' + b.getAttribute('data-lost'), { status: 'lost' }).then(go).catch(fail); }; });
    });
  };

  // ── Campaigns ──
  V.campaigns = function () {
    return api('GET', '/campaigns').then(function (rows) {
      title('Campaigns', isAdmin() ? '<button class="btn" id="gen">Create campaign from inventory</button> <button class="btn primary" id="add">New campaign</button> <button class="btn" id="run">Run dialer now</button>' : '');
      $('#view').innerHTML = '<p class="small muted">Nothing calls until an owner or admin approves AND activates a campaign. Changing products, audience or offer after approval sends it back to draft.</p><div id="gform"></div>' +
        table([['Campaign', '', function (r) { return '<a href="#campaign/' + r.id + '">' + esc(r.campaign_name) + '</a>' + (r.generated_by !== 'manual' ? ' <span class="pill">AI proposed</span>' : ''); }], ['Status', '', function (r) { return statusPill(r.status); }], ['Queued', 'queued'], ['Calls', 'calls'], ['Buyers', 'buyers'], ['Rep', 'rep_name'], ['Daily limit', 'daily_call_limit']], rows, 'No campaigns yet.');
      if ($('#gen')) $('#gen').onclick = function () { api('POST', '/campaigns/generate', {}).then(function (r) { toast(r.proposals.length + ' draft(s) proposed. ' + r.note); go(); }).catch(fail); };
      if ($('#run')) $('#run').onclick = function () { api('POST', '/dialer/run').then(function (r) { toast('Dispatched ' + r.tick.dispatched + ', skipped ' + r.tick.skipped + ', waiting for hours ' + r.tick.deferred + ', failed ' + r.tick.failed + (r.tick.errors[0] ? ' (' + r.tick.errors[0] + ')' : '')); }).catch(fail); };
      if ($('#add')) $('#add').onclick = function () { campaignForm(); };
    });
  };
  function campaignForm() {
    Promise.all([api('GET', '/products?active=true'), api('GET', '/categories'), api('GET', '/reps')]).then(function (x) {
      $('#gform').innerHTML = '<form class="card" id="cf" style="margin-bottom:14px"><div class="row">' + field('campaign_name', 'Campaign name') + select('sales_rep_id', 'Sales rep', x[2].map(function (r) { return [r.id, r.name]; })) + '</div><div class="row">' +
        select('product_ids', 'Products (hold Ctrl/Cmd)', x[0].map(function (p) { return [p.id, p.name]; }), [], true) + select('category_ids', 'Contractor categories (empty = any)', x[1].map(function (c) { return [c.id, c.name]; }), [], true) + '</div><div class="row">' +
        field('states', 'States (comma separated)') + field('cities', 'Cities') + field('zips', 'ZIP prefixes') + field('minimum_match_score', 'Minimum match score', 'number', 60) + field('daily_call_limit', 'Daily call limit', 'number', 50) + field('ghl_workflow_id', 'GoHighLevel outbound workflow id') + '</div>' +
        field('call_objective', 'Call objective', 'textarea') + '<button class="btn primary" style="margin-top:10px">Create draft</button></form>';
      $('#cf').onsubmit = function (e) { e.preventDefault(); var d = formData(e.target); d.geographic_target = { states: d.states || '', cities: d.cities || '', zips: d.zips || '' }; api('POST', '/campaigns', d).then(function (r) { location.hash = '#campaign/' + r.id; }).catch(fail); };
    }).catch(fail);
  }
  V.campaign = function () {
    var id = location.hash.split('/')[1];
    return Promise.all([api('GET', '/campaigns/' + id), api('GET', '/campaigns/' + id + '/preview')]).then(function (x) {
      var c = x[0]; var pv = x[1]; var o = c.offer || {};
      var next = { draft: [['pending_approval', 'Submit for approval']], pending_approval: [['approved', 'Approve'], ['draft', 'Back to draft']], approved: [['active', 'Activate calling']], active: [['paused', 'Pause'], ['completed', 'Complete']], paused: [['active', 'Resume'], ['completed', 'Complete']] }[c.status] || [];
      title(c.campaign_name, isAdmin() ? next.map(function (n) { return '<button class="btn ' + (n[0] === 'active' || n[0] === 'approved' ? 'primary' : '') + '" data-to="' + n[0] + '">' + esc(n[1]) + '</button>'; }).join(' ') + (['completed', 'cancelled'].indexOf(c.status) < 0 ? ' <button class="btn danger" data-to="cancelled">Cancel</button>' : '') : '');
      var inc = pv.contractors.filter(function (r) { return r.included; });
      $('#view').innerHTML = '<p>' + statusPill(c.status) + ' ' + (c.approved_at ? '<span class="small muted">approved ' + esc(date(c.approved_at)) + '</span>' : '') + '</p>' + (c.rationale ? '<div class="card" style="margin-bottom:14px"><b>Why this campaign</b><p>' + esc(c.rationale) + '</p></div>' : '') +
        '<div class="two"><div class="card"><b>Offer</b> <span class="pill">' + esc(o.composed_by) + '</span>' + (o.has_verified_comparison ? ' <span class="pill ok">verified comparison</span>' : ' <span class="pill">no price comparison</span>') + '<p>' + esc(o.value_proposition) + '</p><b>Talking points</b><ul>' + (o.talking_points || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul><p class="small muted">' + esc(o.pricing_language) + '</p><b>Objections</b><ul class="small">' + (o.objection_handling || []).map(function (t) { return '<li><b>' + esc(t.objection) + '</b> — ' + esc(t.response) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="card"><b>Agent</b><p class="small">Outbound workflow: <b>' + esc((c.agent || {}).ghl_workflow_id || 'not set') + '</b></p>' + (isAdmin() && ['completed', 'cancelled'].indexOf(c.status) < 0 ? '<form id="wf" class="row">' + field('ghl_workflow_id', 'GoHighLevel outbound workflow id', 'text', (c.agent || {}).ghl_workflow_id) + field('daily_call_limit', 'Daily limit', 'number', c.daily_call_limit) + '<button class="btn" style="flex:none">Save</button></form><p class="small muted">Changing the workflow or limit does not reset approval; changing products, audience or offer does.</p>' : '') +
        '<p class="small">Minimum match score ' + c.minimum_match_score + ' · Geography ' + esc(JSON.stringify(c.geographic_target)) + '</p></div></div>' +
        '<h3>Audience: ' + inc.length + ' contractors would be called</h3>' + table([['Company', 'company_name'], ['Where', '', function (r) { return esc([r.city, r.state].filter(Boolean).join(', ')); }], ['Score', 'score'], ['Included', '', function (r) { return r.included ? '<span class="pill ok">yes</span>' : '<span class="pill">' + esc(r.reason) + '</span>'; }]], pv.contractors, 'No contractors match yet.') +
        '<h3>Calls</h3><div id="ccalls"></div>';
      document.querySelectorAll('[data-to]').forEach(function (b) { b.onclick = function () { var to = b.getAttribute('data-to'); if (to === 'active' && !confirm('Start calling contractors for this campaign?')) return; api('POST', '/campaigns/' + c.id + '/status', { to: to }).then(function (r) { toast('Now ' + label(to) + (r.audience ? ' · queued ' + r.audience.queued + ', skipped ' + r.audience.skipped : '')); go(); }).catch(fail); }; });
      if ($('#wf')) $('#wf').onsubmit = function (e) { e.preventDefault(); api('PATCH', '/campaigns/' + c.id, formData(e.target)).then(go).catch(fail); };
      api('GET', '/calls?campaign_id=' + c.id).then(function (r) { var el = $('#ccalls'); if (el) el.innerHTML = callTable(r); });
    });
  };

  // ── Calls & conversations ──
  function callTable(rows) {
    return table([['When', '', function (r) { return esc(date(r.started_at)); }], ['Direction', 'direction'], ['Contractor', '', function (r) { return r.company_name ? '<a href="#contractor/' + r.contractor_id + '">' + esc(r.company_name) + '</a>' : ''; }], ['Campaign', 'campaign_name'],
      ['Status', '', function (r) { return statusPill(r.status); }], ['Outcome', '', function (r) { return r.outcome ? esc(label(r.outcome)) + ' <span class="pill">' + esc(r.outcome_source) + '</span>' : ''; }], ['Summary', '', function (r) { return '<a href="#call/' + r.id + '">' + esc(String(r.summary || '').slice(0, 120) || 'open') + '</a>'; }]], rows, 'No calls yet.');
  }
  V.calls = function () { return api('GET', '/calls').then(function (r) { title('Calls'); $('#view').innerHTML = '<p class="small muted">A dispatched call has no platform id until its call log comes back. The dialer checks call logs every minute and the call-ended webhook fills it immediately.</p>' + callTable(r); }); };
  V.conversations = function () {
    return api('GET', '/calls').then(function (r) {
      title('Conversations');
      var done = r.filter(function (c) { return c.status === 'completed'; });
      $('#view').innerHTML = done.length ? done.map(function (c) { return '<div class="card" style="margin-bottom:10px"><div class="small muted">' + esc(date(c.started_at)) + ' · ' + esc(c.direction) + ' · ' + esc(c.campaign_name || '') + '</div><b><a href="#contractor/' + c.contractor_id + '">' + esc(c.company_name) + '</a></b> ' + (c.outcome ? statusPill(c.outcome) : '') + '<p>' + esc(c.summary) + '</p><a href="#call/' + c.id + '">Transcript</a></div>'; }).join('') : '<p class="muted">No completed conversations yet.</p>';
    });
  };
  V.call = function () {
    var id = location.hash.split('/')[1];
    return api('GET', '/calls/' + id).then(function (c) {
      title('Call #' + c.id);
      $('#view').innerHTML = '<p>' + statusPill(c.status) + ' ' + esc(c.direction) + ' · ' + esc(date(c.started_at)) + (c.duration_sec != null ? ' · ' + c.duration_sec + ' s' : '') + '</p><div class="two"><div class="card"><b>Summary</b><p>' + esc(c.summary) + '</p><b>Extracted</b><pre>' + esc(JSON.stringify(c.extracted, null, 2)) + '</pre><b>Actions</b><pre>' + esc(JSON.stringify(c.actions, null, 2)) + '</pre></div>' +
        '<div class="card"><b>Transcript</b><pre>' + esc(c.transcript || 'No transcript.') + '</pre></div></div>' + (c.context_package ? '<h3>What the agent was given</h3><pre>' + esc(JSON.stringify(c.context_package, null, 2)) + '</pre>' : '');
    });
  };

  // ── Pipeline ──
  V.pipeline = function () {
    return api('GET', '/pipeline').then(function (d) {
      title('Sales Pipeline');
      $('#view').innerHTML = '<p class="small muted">Calls move contractors forward automatically when the outcome is clear; a call never moves anyone backward or out of a stage a person owns (quote sent, negotiation, won, lost).</p><div class="board">' + d.stages.map(function (s) {
        return '<div class="col"><h3>' + esc(label(s.stage)) + ' (' + s.items.length + ')</h3>' + s.items.slice(0, 50).map(function (i) { return '<div class="item"><a href="#contractor/' + i.id + '">' + esc(i.company_name) + '</a><div class="muted">' + esc(i.rep_name || '') + '</div><select data-move="' + i.id + '">' + (VOCAB.pipeline || []).map(function (p) { return '<option ' + (p === s.stage ? 'selected' : '') + ' value="' + p + '">' + esc(label(p)) + '</option>'; }).join('') + '</select></div>'; }).join('') + '</div>';
      }).join('') + '</div>';
      document.querySelectorAll('[data-move]').forEach(function (sel) { sel.onchange = function () { api('POST', '/pipeline/move', { contractor_id: Number(sel.getAttribute('data-move')), stage: sel.value }).then(go).catch(fail); }; });
    });
  };

  // ── Commissions ──
  V.commissions = function () {
    return Promise.all([api('GET', '/commissions'), api('GET', '/sales')]).then(function (x) {
      title('Commissions');
      $('#view').innerHTML = '<p class="small muted">Nothing here pays anyone. Approve and mark paid once settled in your payroll.</p>' + table([['Rep', 'rep_name'], ['Contractor', 'company_name'], ['Product', 'product_name'], ['Campaign', 'campaign_name'], ['Sale', '', function (r) { return money(r.sale_amount); }], ['%', 'commission_percentage'], ['Commission', '', function (r) { return money(r.commission_amount); }], ['Status', '', function (r) { return statusPill(r.commission_status) + (isAdmin() && r.commission_status === 'pending' ? ' <button class="btn small" data-cs="' + r.id + ':approved">Approve</button>' : '') + (isAdmin() && r.commission_status === 'approved' ? ' <button class="btn small" data-cs="' + r.id + ':paid">Mark paid</button>' : ''); }]], x[0], 'No commissions yet.') +
        '<h3>Sales</h3>' + table([['Date', '', function (r) { return esc(date(r.sold_at)); }], ['Contractor', 'company_name'], ['Product', 'product_name'], ['Campaign', 'campaign_name'], ['Rep', 'rep_name'], ['Amount', '', function (r) { return money(r.sale_amount); }], ['', '', function (r) { return '<button class="btn small" data-attr="' + r.id + '">Attribution</button>'; }]], x[1], 'No sales yet.') + '<div id="attr"></div>';
      document.querySelectorAll('[data-cs]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-cs').split(':'); api('POST', '/commissions/' + p[0] + '/status', { status: p[1] }).then(go).catch(fail); }; });
      document.querySelectorAll('[data-attr]').forEach(function (b) { b.onclick = function () { api('GET', '/sales/' + b.getAttribute('data-attr') + '/attribution').then(function (a) { $('#attr').innerHTML = '<div class="card"><b>Attribution chain</b><p>Campaign <b>' + esc(a.campaign_name || 'none') + '</b> → outbound call #' + esc(a.original_call_id || '—') + ' (' + esc(date(a.original_call_at)) + ', ' + esc(label(a.original_call_outcome)) + ') → <b>' + esc(a.company_name) + '</b> → potential buyer #' + esc(a.buyer_id || '—') + ' → rep <b>' + esc(a.sales_rep || '—') + '</b> → sale ' + money(a.sale_amount) + ' → commission ' + money(a.commission_amount) + ' (' + esc(a.commission_status || '—') + ')</p></div>'; }).catch(fail); }; });
    });
  };

  // ── AI agents ──
  V.agents = function () {
    return api('GET', '/ghl').then(function (g) {
      title('AI Agents');
      var gh = g.ghl || {};
      $('#view').innerHTML = '<div class="card stack"><p>The voice agents run inside your GoHighLevel sub-account. RinglyPro Supply decides who they call and writes what they should say onto each contact before the call.</p>' +
        '<form id="ag" class="row">' + field('outbound_agent_id', 'Outbound sales agent id (GHL)', 'text', gh.outbound_agent_id) + field('inbound_agent_id', 'Inbound receptionist agent id (GHL)', 'text', gh.inbound_agent_id) + field('default_workflow_id', 'Default outbound workflow id', 'text', gh.default_workflow_id) + (isAdmin() ? '<button class="btn primary" style="flex:none">Save</button>' : '') + '</form></div>' +
        '<div class="two" style="margin-top:14px"><div class="card"><b>Agent prompt</b><p class="small muted">Copy all of this into the big prompt box of the GoHighLevel Voice AI agent. If a {{contact...}} tag does not turn into a chip, delete it and insert it with the # Custom Value button: Contact, then RinglyPro Supply Context / Offer / Assigned Rep.</p><button class="btn small" id="cpp">Copy prompt</button><pre id="pp">' + esc('You are Lina, a friendly sales assistant calling contractors on behalf of a building-material supplier. You speak English or Spanish, matching the caller.\n\nWHAT YOU KNOW ABOUT THIS CONTRACTOR (read before speaking):\n{{contact.ringlypro_supply_context}}\n\nTODAY\'S OFFER AND RULES:\n{{contact.ringlypro_supply_offer}}\n\nASSIGNED SALES REP: {{contact.ringlypro_supply_assigned_rep}}\n\nYOUR GOAL ON THIS CALL\n1. Introduce yourself and the supplier in one sentence.\n2. Ask if they buy the materials in the offer for their jobs.\n3. Present the offer briefly, using only the prices written in the offer above.\n4. If interested, ask which product, roughly how much, and when they need it.\n5. If they want pricing, a quote, or a person, transfer the call to the sales rep.\n6. If they are busy, ask for a better time to call back.\n\nRULES\n- Quote ONLY the prices and numbers written in the offer. Never invent a price, discount or stock level.\n- Never compare to Home Depot, Lowe\'s or any competitor unless the offer text contains that exact comparison.\n- If they ask not to be called again, apologize, confirm they will not be called, and end the call.\n- Keep answers short and natural. One question at a time.\n- If you do not know something, say a sales rep will follow up.\n') + '</pre></div>' +
        '<div class="card"><b>Extraction fields to add to the agent</b><p class="small muted">The call log returns these; they drive outcome, potential buyer and pipeline.</p><ul>' + g.extract_keys.map(function (k) { return '<li><code>' + esc(k) + '</code></li>'; }).join('') + '</ul><p class="small">rps_outcome must be one of: ' + esc((VOCAB.outcomes || []).join(', ')) + '</p></div></div>';
      $('#cpp').onclick = function () { navigator.clipboard.writeText($('#pp').textContent).then(function () { toast('Prompt copied'); }); };
      $('#ag').onsubmit = function (e) { e.preventDefault(); api('PATCH', '/ghl', formData(e.target)).then(function () { toast('Saved'); }).catch(fail); };
    });
  };

  // ── GoHighLevel ──
  V.ghl = function () {
    return Promise.all([api('GET', '/ghl'), api('GET', '/tenant')]).then(function (x) {
      var g = x[0]; var gh = g.ghl || {};
      title('GoHighLevel', isAdmin() ? '<button class="btn primary" id="test">Test connection</button>' : '');
      var sm = gh.stage_map || {};
      $('#view').innerHTML = '<div class="two"><div class="card"><b>Connection</b><p class="small">Provider in use: <b>' + esc(g.provider) + '</b> · Source: ' + esc(gh.source || 'none') + (gh.crm_client_id ? ' (CRM client ' + esc(gh.crm_client_id) + ')' : '') + ' · Token stored: ' + (g.token_set ? 'yes' : 'no') + '</p>' + (g.health ? '<p class="small">Last check: ' + (g.health.ok ? '<span class="pill ok">ok</span>' : '<span class="pill bad">error</span> ' + esc(g.health.last_error)) + ' ' + esc(date(g.health.last_checked_at)) + '</p>' : '') +
        (isAdmin() ? '<form id="cn">' + select('source', 'Connect with', [['private_token', 'My sub-account (Private Integration token)']].concat(ME.user.is_super_admin ? [['crm_client', 'Existing RinglyPro CRM connection (super admin)']] : []), gh.source) + field('location_id', 'Location id', 'text', gh.location_id) + field('token', 'Private Integration token (blank keeps the stored one)', 'password') + (ME.user.is_super_admin ? field('crm_client_id', 'CRM client id', 'number', gh.crm_client_id) : '') +
          '<p class="small muted">Private Integration scopes to tick: View/Edit Contacts, View/Edit Custom Fields, View/Edit Opportunities, View Workflows + add contact to workflow, View Locations, Voice AI call logs.</p><button class="btn primary">Save connection</button></form>' : '') + '<div id="tres" class="small"></div></div>' +
        '<div class="card"><b>Webhook URL</b><p class="small muted">Add a Webhook action to your GHL workflows (call ended with event=call.completed; inbound call with event=inbound; contact DND changes). Treat this URL as a secret.</p><pre>' + esc(x[1].webhook_url) + '</pre>' +
        '<b>Pipeline mapping</b><form id="pm"><div class="row">' + field('pipeline_id', 'GHL pipeline id', 'text', gh.pipeline_id) + '</div><div class="row">' + g.pipeline_stages.map(function (s) { return field('stage_' + s, label(s) + ' stage id', 'text', sm[s]); }).join('') + '</div>' + (isAdmin() ? '<button class="btn" style="margin-top:8px">Save mapping</button>' : '') + '</form></div></div>' +
        '<h3>What is automatic and what is not</h3>' + table([['Requirement', 'need'], ['Class', '', function (r) { return '<span class="pill cls-' + esc(r.class) + '">' + esc(label(r.class)) + '</span>'; }], ['How', 'how']], g.capabilities);
      if ($('#cn')) $('#cn').onsubmit = function (e) { e.preventDefault(); api('PATCH', '/ghl', formData(e.target)).then(function () { toast('Saved'); go(); }).catch(fail); };
      if ($('#pm')) $('#pm').onsubmit = function (e) { e.preventDefault(); var d = formData(e.target); var map = {}; Object.keys(d).forEach(function (k) { if (k.indexOf('stage_') === 0) map[k.slice(6)] = d[k]; }); api('PATCH', '/ghl', { pipeline_id: d.pipeline_id || null, stage_map: map }).then(function () { toast('Saved'); }).catch(fail); };
      if ($('#test')) $('#test').onclick = function () { $('#tres').textContent = 'Testing…'; api('POST', '/ghl/test').then(function (r) { $('#tres').innerHTML = (r.health.ok ? '<span class="pill ok">connected</span> ' : '<span class="pill bad">failed</span> ') + esc(r.health.detail) + (r.custom_fields ? (r.custom_fields.error ? '<p class="small" style="color:var(--bad)">' + esc(r.custom_fields.error) + '</p>' : '<p class="small"><span class="pill ok">custom fields ready</span> Use these exact tags in the agent prompt:</p><pre>' + esc(Object.keys(r.custom_fields.prompt_tags || {}).map(function (k) { return k + '  ' + r.custom_fields.prompt_tags[k]; }).join('\n') || 'GoHighLevel returned no tag names; insert them with # Custom Value.') + '</pre>') : ''); }).catch(fail); };
    });
  };

  // ── Reports ──
  V.reports = function () {
    return Promise.all([api('GET', '/reports/campaigns'), isAdmin() ? api('GET', '/audit') : Promise.resolve([])]).then(function (x) {
      title('Reports');
      $('#view').innerHTML = '<h3>Campaign performance</h3>' + table([['Campaign', 'campaign_name'], ['Status', '', function (r) { return statusPill(r.status); }], ['Targets', 'targets'], ['Outbound', 'outbound_calls'], ['Connected', 'connected'], ['Buyers', 'buyers'], ['Transfers', 'transfers'], ['Sales', 'sales'], ['Revenue', '', function (r) { return money(r.revenue); }], ['Commissions', '', function (r) { return money(r.commissions); }]], x[0]) +
        (isAdmin() ? '<h3>Audit trail</h3>' + table([['When', '', function (r) { return esc(date(r.created_at)); }], ['Who', 'actor_email'], ['Action', 'action'], ['Subject', '', function (r) { return esc((r.subject_type || '') + ' ' + (r.subject_id || '')); }], ['Detail', '', function (r) { return '<span class="small">' + esc(JSON.stringify(r.detail)) + '</span>'; }]], x[1]) : '');
    });
  };

  // ── Settings ──
  V.settings = function () {
    return Promise.all([api('GET', '/tenant'), api('GET', '/reps'), api('GET', '/categories'), api('GET', '/suppression'), isAdmin() ? api('GET', '/tenant/users') : Promise.resolve([]), api('GET', '/onboarding')]).then(function (x) {
      var t = x[0].tenant; var s = t.settings || {};
      title('Settings', isAdmin() && t.status !== 'active' ? '<button class="btn primary" id="act">Activate company</button>' : '');
      $('#view').innerHTML = '<div class="card" style="margin-bottom:14px"><b>Onboarding</b><ol>' + x[5].steps.map(function (st) { return '<li>' + (st.done ? '<span class="pill ok">done</span> ' : '') + esc(st.label) + '</li>'; }).join('') + '</ol></div>' +
        '<div class="two"><form class="card" id="st"><b>Company and calling rules</b><div class="row">' + field('name', 'Company name', 'text', t.name) + field('timezone', 'Timezone', 'text', t.timezone) + field('calling_start', 'Calling starts (contractor local time)', 'time', s.calling_start) + field('calling_end', 'Calling ends', 'time', s.calling_end) + field('calling_days', 'Calling days (0=Sun..6=Sat)', 'text', (s.calling_days || []).join(',')) + field('default_commission_pct', 'Default commission %', 'number', s.default_commission_pct) + field('price_fresh_days', 'Competitor price valid for (days)', 'number', s.price_fresh_days) + field('min_verified_confidence', 'Auto-verify at match confidence', 'number', s.min_verified_confidence, 'step="0.05" min="0.5" max="1"') + '</div>' +
        field('recording_disclosure', 'Recording disclosure (said first on every call)', 'textarea', s.recording_disclosure) + '<label><input type="checkbox" name="require_consent_status" style="width:auto" ' + (s.require_consent_status ? 'checked' : '') + '> Only call contractors with a recorded consent basis</label>' + (isAdmin() ? '<button class="btn primary" style="margin-top:8px">Save</button>' : '') + '</form>' +
        '<div class="stack"><div class="card"><b>Sales representatives</b>' + table([['Name', 'name'], ['Phone', 'phone'], ['Commission %', 'commission_pct'], ['Default', '', function (r) { return r.is_default ? 'yes' : ''; }]], x[1], 'No reps yet.') + (isAdmin() ? '<form id="rp" class="row">' + field('name', 'Name') + field('phone', 'Phone', 'tel') + field('email', 'Email', 'email') + field('commission_pct', 'Commission %', 'number') + '<label style="flex:none"><input type="checkbox" name="is_default" style="width:auto"> Default</label><button class="btn" style="flex:none">Add rep</button></form>' : '') + '</div>' +
        '<div class="card"><b>Do Not Call / suppression list</b><p class="small muted">National DNC registry scrubbing is not built (it needs an FTC subscription). Load numbers you scrubbed elsewhere with reason national_dnc.</p><form id="sp" class="row">' + field('phone', 'Phone', 'tel') + select('reason', 'Reason', (VOCAB.suppression_reasons || []).map(function (r) { return [r, label(r)]; }), 'do_not_call') + '<button class="btn" style="flex:none">Add</button></form>' + table([['Phone', 'phone_e164'], ['Reason', 'reason'], ['Source', 'source'], ['Added', '', function (r) { return esc(date(r.created_at)); }]], x[3], 'Empty.') + '</div></div></div>' +
        '<h3>Contractor categories</h3>' + table([['Category', 'name'], ['Keywords used by Product Intelligence', 'keywords']], x[2]) + (isAdmin() ? '<form id="ct" class="row">' + field('name', 'New category') + field('keywords', 'Keywords (comma separated)') + '<button class="btn" style="flex:none">Add</button></form>' : '') +
        (isAdmin() ? '<h3>Users</h3>' + table([['Email', 'email'], ['Name', 'name'], ['Role', 'role'], ['Active', '', function (r) { return r.active ? 'yes' : 'no'; }]], x[4]) + '<form id="us" class="row">' + field('email', 'Email', 'email') + field('name', 'Name') + field('password', 'Temporary password (10+)', 'password') + select('role', 'Role', [['rep', 'Rep'], ['admin', 'Admin'], ['viewer', 'Viewer'], ['owner', 'Owner']], 'rep') + '<button class="btn" style="flex:none">Add user</button></form>' : '');
      $('#st').onsubmit = function (e) { e.preventDefault(); var d = formData(e.target); d.calling_days = String(d.calling_days || '').split(',').map(function (v) { return Number(v.trim()); }).filter(function (v) { return !isNaN(v); }); ['default_commission_pct', 'price_fresh_days', 'min_verified_confidence'].forEach(function (k) { if (d[k] != null) d[k] = Number(d[k]); }); api('PATCH', '/tenant/settings', d).then(function () { toast('Saved'); }).catch(fail); };
      if ($('#rp')) $('#rp').onsubmit = function (e) { e.preventDefault(); api('POST', '/reps', formData(e.target)).then(go).catch(fail); };
      $('#sp').onsubmit = function (e) { e.preventDefault(); api('POST', '/suppression', formData(e.target)).then(go).catch(fail); };
      if ($('#ct')) $('#ct').onsubmit = function (e) { e.preventDefault(); api('POST', '/categories', formData(e.target)).then(go).catch(fail); };
      if ($('#us')) $('#us').onsubmit = function (e) { e.preventDefault(); api('POST', '/tenant/users', formData(e.target)).then(function () { toast('User added'); go(); }).catch(fail); };
      if ($('#act')) $('#act').onclick = function () { api('POST', '/tenant/activate').then(function () { toast('Company activated'); go(); }).catch(fail); };
    });
  };

  // ── Super admin ──
  V.platform = function () {
    if (!ME.user.is_super_admin) { location.hash = '#dashboard'; return Promise.resolve(); }
    return api('GET', '/platform/overview').then(function (d) {
      var t = d.totals;
      title('Super Admin', '<button class="btn primary" id="nt">New company</button>');
      $('#view').innerHTML = '<div class="kpis">' + [['Tenants', t.tenants], ['Active', t.active], ['Trial', t.trial], ['Platform calls', t.calls], ['Potential buyers', t.potential_buyers], ['Sales generated', money(t.sales)], ['Failed events', t.failed_events]].map(function (k) { return '<div class="kpi"><b>' + esc(k[1]) + '</b><span>' + esc(k[0]) + '</span></div>'; }).join('') + '</div>' +
        '<p class="small muted">Counts and money only. Customer lists stay inside each company; "Work in" is recorded in that company\'s audit log for every change.</p><div id="ntf"></div>' +
        table([['Company', '', function (r) { return esc(r.name) + (r.is_demo ? ' <span class="pill">demo</span>' : ''); }], ['Status', '', function (r) { return statusPill(r.status) + ' <select data-st="' + r.id + '">' + ['trial', 'active', 'suspended', 'cancelled'].map(function (s) { return '<option ' + (s === r.status ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>'; }], ['Users', 'users'], ['Products', 'products'], ['Contractors', 'contractors'], ['Active campaigns', 'active_campaigns'], ['Calls 30d', 'calls_30d'], ['Buyers', 'potential_buyers'], ['Sales', '', function (r) { return money(r.sales); }],
          ['GHL', '', function (r) { return r.ghl_source ? (r.ghl_ok === false ? '<span class="pill bad">error</span>' : r.ghl_ok ? '<span class="pill ok">ok</span>' : '<span class="pill">unchecked</span>') : '<span class="pill">none</span>'; }], ['Failed events', 'failed_events'], ['', '', function (r) { return '<button class="btn small" data-as="' + r.id + '">Work in</button>'; }]], d.tenants) +
        '<h3>Recent errors</h3>' + table([['Company', 'tenant'], ['Event', 'event_type'], ['Error', 'error'], ['Attempts', 'attempts'], ['When', '', function (r) { return esc(date(r.created_at)); }]], d.errors, 'None.');
      document.querySelectorAll('[data-as]').forEach(function (b) { b.onclick = function () { ACT_AS = b.getAttribute('data-as'); try { sessionStorage.setItem('sup_act_as', ACT_AS); } catch (e) { /* ok */ } boot(); location.hash = '#dashboard'; }; });
      document.querySelectorAll('[data-st]').forEach(function (s) { s.onchange = function () { api('POST', '/platform/tenants/' + s.getAttribute('data-st') + '/status', { status: s.value }).then(go).catch(fail); }; });
      $('#nt').onclick = function () {
        $('#ntf').innerHTML = '<form class="card" id="ntform" style="margin-bottom:14px"><div class="row">' + field('company', 'Company name') + field('timezone', 'Timezone', 'text', 'America/New_York') + field('owner_email', 'Owner email', 'email') + field('owner_name', 'Owner name') + field('owner_password', 'Owner temporary password', 'password') + '</div><label><input type="checkbox" name="is_demo" style="width:auto"> Demo / sample company</label><button class="btn primary" style="margin-top:8px">Create</button></form>';
        $('#ntform').onsubmit = function (e) { e.preventDefault(); api('POST', '/platform/tenants', formData(e.target)).then(function () { toast('Company created'); go(); }).catch(fail); };
      };
    });
  };

  function boot() {
    return api('GET', '/auth/me').then(function (d) {
      ME = d; VOCAB = d.vocab || {};
      var name = d.tenant ? d.tenant.name : (ACT_AS ? 'Working in company #' + ACT_AS : 'Platform');
      $('#tenantName').innerHTML = esc(name) + (ACT_AS && d.user.is_super_admin ? ' · <a href="#" id="leave">leave</a>' : '') + '<br>' + esc(d.user.email) + ' · ' + esc(d.user.is_super_admin ? 'super admin' : d.user.role);
      if ($('#leave')) $('#leave').onclick = function (e) { e.preventDefault(); ACT_AS = null; try { sessionStorage.removeItem('sup_act_as'); } catch (x) { /* ok */ } location.hash = '#platform'; boot(); };
      go();
    });
  }
  window.addEventListener('hashchange', go);
  $('#logout').onclick = function () { api('POST', '/auth/logout').then(function () { location.href = BASE + '/login'; }); };
  $('#burger').onclick = function () { $('#side').classList.toggle('open'); };
  $('#theme').onclick = function () { var dark = document.documentElement.getAttribute('data-theme') !== 'dark'; document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); try { localStorage.setItem('sup_theme', dark ? 'dark' : 'light'); } catch (e) { /* ok */ } };
  boot().catch(function (e) { $('#view').innerHTML = '<p>' + esc(e.message) + '</p>'; });
})();
