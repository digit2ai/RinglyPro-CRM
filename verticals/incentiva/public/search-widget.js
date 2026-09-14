/* BuyersLine home search widget: form + results + map, used by BOTH the landing
   page (compact) and /search (full), so the two can never diverge.

   <div data-bl-search data-mode="compact|full"></div>

   - Talks only to {BASE}/api/v1/public/listings; the RentCast key never reaches the browser.
   - Language follows <html lang> and re-renders when the page's EN/ES toggle changes it.
   - Leaflet is loaded on demand from cdnjs if the page did not already include it.
   - "Ask our agent" goes to the intake form with the ZIP filled in (same page when on the landing). */
(function () {
  'use strict';
  var BASE = window.BL_BASE || '';
  var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

  var I18N = {
    en: {
      f_zip: 'ZIP code', f_radius: 'Distance', f_max: 'Max price', f_beds: 'Bedrooms', f_sort: 'Sort', f_go: 'Search homes', any: 'Any',
      sort_low: 'Price: low to high', sort_high: 'Price: high to low', sort_new: 'Newest',
      map_label: 'Map of results', results_label: 'Search results', err_zip: 'Enter a 5-digit ZIP code.',
      count: '{n} new-construction homes', count_of: '{n} of {total} new-construction homes match your filters', searching: 'Searching...',
      fresh: 'Updated {when}', stale: 'Showing saved results from {when}; live search is paused.',
      beds: '{n} bd', baths: '{n} ba', sqft: '{n} sq ft', hoa: 'HOA {amount}/mo', dom: '{n} days on market', built: 'Built {n}',
      builder_by: 'by {name}', mls: 'MLS {name} #{num}', cta: 'Ask our agent about this home',
      see_all: 'See all {n} homes on the full search', open_full: 'Open full search',
      empty_t: 'No new-construction homes found here', empty_p: 'Try a larger distance, a nearby ZIP code or remove a filter.',
      start_t: 'Start with a ZIP code', start_p: 'Enter a ZIP code to see new-construction homes for sale nearby.',
      nc_t: 'Home search is not connected yet', nc_p: 'We are connecting our listing data. Meanwhile, tell us what you need and our agent will send you verified options.',
      cap_t: 'Search is resting for this month', cap_p: 'We have reached our monthly search limit. Tell us what you need and our agent will send you options.',
      err_t: 'Search is unavailable right now', err_p: 'Please try again in a few minutes.',
      get_report: 'Get my free report',
      zip_only: 'Showing homes in ZIP {zip} (distance search unavailable right now).',
      source_note: 'Listing data from RentCast public sources, refreshed at most once a day. These are homes for sale, not verified incentives. Prices, availability and details can change; our agent confirms them with the builder.'
    },
    es: {
      f_zip: 'Código postal', f_radius: 'Distancia', f_max: 'Precio máximo', f_beds: 'Habitaciones', f_sort: 'Ordenar', f_go: 'Buscar casas', any: 'Cualquiera',
      sort_low: 'Precio: menor a mayor', sort_high: 'Precio: mayor a menor', sort_new: 'Más recientes',
      map_label: 'Mapa de resultados', results_label: 'Resultados de la búsqueda', err_zip: 'Escriba un código postal de 5 dígitos.',
      count: '{n} casas de construcción nueva', count_of: '{n} de {total} casas de construcción nueva coinciden con sus filtros', searching: 'Buscando...',
      fresh: 'Actualizado {when}', stale: 'Mostrando resultados guardados del {when}; la búsqueda en vivo está en pausa.',
      beds: '{n} hab', baths: '{n} baños', sqft: '{n} pies²', hoa: 'HOA {amount}/mes', dom: '{n} días en el mercado', built: 'Construida {n}',
      builder_by: 'de {name}', mls: 'MLS {name} #{num}', cta: 'Pregunte a nuestro agente por esta casa',
      see_all: 'Ver las {n} casas en la búsqueda completa', open_full: 'Abrir búsqueda completa',
      empty_t: 'No encontramos casas nuevas aquí', empty_p: 'Pruebe una distancia mayor, un código postal cercano o quite un filtro.',
      start_t: 'Empiece con un código postal', start_p: 'Escriba un código postal para ver casas nuevas en venta cerca.',
      nc_t: 'La búsqueda de casas aún no está conectada', nc_p: 'Estamos conectando nuestros datos. Mientras tanto, cuéntenos qué necesita y nuestro agente le enviará opciones verificadas.',
      cap_t: 'La búsqueda descansa este mes', cap_p: 'Llegamos al límite mensual de búsquedas. Cuéntenos qué necesita y nuestro agente le enviará opciones.',
      err_t: 'La búsqueda no está disponible ahora', err_p: 'Inténtelo de nuevo en unos minutos.',
      get_report: 'Obtener mi informe gratis',
      zip_only: 'Mostrando casas en el código postal {zip} (la búsqueda por distancia no está disponible ahora).',
      source_note: 'Datos de anuncios de fuentes públicas de RentCast, actualizados como máximo una vez al día. Son casas en venta, no incentivos verificados. Precios, disponibilidad y detalles pueden cambiar; nuestro agente los confirma con la constructora.'
    }
  };

  function lang() { return (document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en'; }
  function t(k, p) { var s = I18N[lang()][k] || I18N.en[k] || k; return p ? s.replace(/\{(\w+)\}/g, function (m, x) { return p[x] != null ? p[x] : m; }) : s; }
  function loc() { return lang() === 'es' ? 'es-US' : 'en-US'; }
  function money(n) { return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
  function numf(n) { return new Intl.NumberFormat(loc()).format(n); }
  function shortMoney(n) { return n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(n / 1000) + 'K'; }
  function when(iso) { return iso ? new Date(iso).toLocaleString(loc(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  var leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[href="' + LEAFLET_CSS + '"]')) {
        document.head.appendChild(el('link', { rel: 'stylesheet', href: LEAFLET_CSS, crossorigin: 'anonymous', referrerpolicy: 'no-referrer' }));
      }
      var existing = document.querySelector('script[src="' + LEAFLET_JS + '"]');
      var s = existing || el('script', { src: LEAFLET_JS, crossorigin: 'anonymous', referrerpolicy: 'no-referrer' });
      s.addEventListener('load', function () { resolve(window.L); });
      s.addEventListener('error', function () { reject(new Error('leaflet')); });
      if (!existing) document.head.appendChild(s);
      else if (window.L) resolve(window.L);
    });
    return leafletPromise;
  }

  var uid = 0;
  function mount(root) {
    if (root.__blMounted) return;
    root.__blMounted = true;
    var mode = root.getAttribute('data-mode') === 'compact' ? 'compact' : 'full';
    var id = 'bls' + (++uid);
    var LIMIT = mode === 'compact' ? 6 : 300;
    root.classList.add('bls', 'bls-' + mode);

    // ---------- markup ----------
    function selectField(name, key, options) {
      var sel = el('select', { id: id + '_' + name, name: name });
      options.forEach(function (o) { sel.appendChild(el('option', { value: o[0], 'data-k': o[2] || null, text: o[1] })); });
      return el('div', { class: 'field' }, [el('label', { for: id + '_' + name, 'data-k': key, text: t(key) }), sel]);
    }
    var zipInput = el('input', { id: id + '_zip', name: 'zip', type: 'text', inputmode: 'numeric', autocomplete: 'postal-code', maxlength: '5', pattern: '[0-9]{5}', placeholder: '33578', required: 'required' });
    var form = el('form', { class: 'search-form', novalidate: 'novalidate' }, [
      el('div', { class: 'field' }, [el('label', { for: id + '_zip', 'data-k': 'f_zip', text: t('f_zip') }), zipInput]),
      selectField('radius', 'f_radius', [['5', '5 mi'], ['10', '10 mi'], ['15', '15 mi'], ['25', '25 mi'], ['40', '40 mi']]),
      selectField('max_price', 'f_max', [['', t('any'), 'any'], ['300000', '$300,000'], ['400000', '$400,000'], ['500000', '$500,000'], ['650000', '$650,000'], ['800000', '$800,000'], ['1000000', '$1,000,000']]),
      selectField('beds_min', 'f_beds', [['', t('any'), 'any'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5+']]),
      mode === 'full' ? selectField('sort', 'f_sort', [['price_asc', t('sort_low'), 'sort_low'], ['price_desc', t('sort_high'), 'sort_high'], ['newest', t('sort_new'), 'sort_new']]) : null,
      el('button', { class: 'btn btn-primary go', type: 'submit', 'data-k': 'f_go', text: t('f_go') })
    ]);
    form.elements.radius.value = '15';
    var formError = el('p', { class: 'hint search-error', role: 'alert', hidden: 'hidden' });
    var count = el('p', { class: 'results-count', 'aria-live': 'polite' });
    var fresh = el('p', { class: 'source-note', style: 'margin:0' });
    var list = el('div', { class: 'list', role: 'region', 'data-k-aria': 'results_label', 'aria-label': t('results_label') });
    var mapEl = el('div', { class: 'bl-map', role: 'region', 'data-k-aria': 'map_label', 'aria-label': t('map_label') });
    var more = el('p', { class: 'search-more' });
    var note = el('p', { class: 'source-note', 'data-k': 'source_note', text: t('source_note') });
    root.appendChild(form);
    root.appendChild(formError);
    root.appendChild(el('div', { class: 'results-bar' }, [count, fresh]));
    root.appendChild(el('div', { class: 'results' }, [list, el('div', { class: 'map-wrap' }, [mapEl])]));
    root.appendChild(more);
    root.appendChild(note);

    // ---------- map ----------
    var map = null, markers = {};
    function ensureMap() {
      if (map) return Promise.resolve(map);
      return loadLeaflet().then(function (L) {
        if (map) return map;
        // One-finger drags scroll the page on touch screens until the map is tapped.
        map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true, dragging: !L.Browser.mobile, tap: false }).setView([27.95, -82.46], 9);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
        map.on('click', function () { map.scrollWheelZoom.enable(); map.dragging.enable(); });
        return map;
      });
    }

    var state = { kind: 'start', data: null };
    var selectedId = null;

    function select(hid, fromMap) {
      selectedId = hid;
      Array.prototype.forEach.call(list.querySelectorAll('.home-card'), function (c) { c.classList.toggle('is-selected', c.getAttribute('data-id') === hid); });
      Object.keys(markers).forEach(function (k) {
        var node = markers[k].getElement && markers[k].getElement();
        var pin = node && node.querySelector('.price-pin');
        if (pin) pin.classList.toggle('is-selected', k === hid);
        markers[k].setZIndexOffset(k === hid ? 1000 : 0);
      });
      if (fromMap) {
        var card = list.querySelector('.home-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(hid) : hid) + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (markers[hid] && map) map.panTo(markers[hid].getLatLng());
    }

    function intakeHref(zip) { return BASE + '/?lang=' + lang() + (zip ? '&zip=' + encodeURIComponent(zip) : '') + '#intake'; }
    function goIntake(e, zip) {
      var intake = document.getElementById('intake');
      if (!intake) return; // different page: follow the link
      e.preventDefault();
      var f = document.getElementById('f_zips');
      if (f && zip) f.value = zip;
      intake.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }, 400);
    }

    function stateBox(title, body, withCta) {
      var box = el('div', { class: 'state-box' }, [el('h3', { text: title }), el('p', { class: 'muted', text: body })]);
      if (withCta) {
        var a = el('a', { class: 'btn btn-primary btn-small', href: intakeHref(zipInput.value.trim()), text: t('get_report') });
        a.addEventListener('click', function (e) { goIntake(e, zipInput.value.trim()); });
        box.appendChild(a);
      }
      return box;
    }

    function render() {
      list.textContent = ''; count.textContent = ''; fresh.textContent = ''; more.textContent = '';
      if (state.kind === 'loading') { count.textContent = t('searching'); return; }
      if (state.kind === 'start') { list.appendChild(stateBox(t('start_t'), t('start_p'), false)); drawMarkers([]); return; }
      if (state.kind === 'not_configured') { list.appendChild(stateBox(t('nc_t'), t('nc_p'), true)); drawMarkers([]); return; }
      if (state.kind === 'cap_reached') { list.appendChild(stateBox(t('cap_t'), t('cap_p'), true)); drawMarkers([]); return; }
      if (state.kind === 'error') { list.appendChild(stateBox(t('err_t'), t('err_p'), false)); drawMarkers([]); return; }
      var d = state.data;
      var total = d.total_new_construction || 0;
      count.textContent = d.matching === total ? t('count', { n: numf(total) }) : t('count_of', { n: numf(d.matching), total: numf(total) });
      fresh.textContent = d.stale ? t('stale', { when: when(d.fetched_at) }) : (d.fetched_at ? t('fresh', { when: when(d.fetched_at) }) : '');
      if (d.area_mode === 'zip_only') list.appendChild(el('p', { class: 'source-note', text: t('zip_only', { zip: d.zip }) }));
      if (!d.listings.length) { list.appendChild(stateBox(t('empty_t'), t('empty_p'), true)); drawMarkers([]); return; }
      var shown = d.listings.slice(0, LIMIT);
      shown.forEach(function (h) {
        var specs = [h.beds != null ? t('beds', { n: h.beds }) : null, h.baths != null ? t('baths', { n: h.baths }) : null, h.sqft != null ? t('sqft', { n: numf(h.sqft) }) : null].filter(Boolean).join(' · ');
        var builder = el('div', { class: 'builder' });
        if (h.builder && h.builder.community) builder.appendChild(el('span', { class: 'chip', text: h.builder.community }));
        if (h.builder && h.builder.name) builder.appendChild(el('span', { class: 'chip chip-muted', text: t('builder_by', { name: h.builder.name }) }));
        var meta = [h.hoa_monthly != null ? t('hoa', { amount: money(h.hoa_monthly) }) : null, h.days_on_market != null ? t('dom', { n: h.days_on_market }) : null,
          h.year_built ? t('built', { n: h.year_built }) : null, mode === 'full' && h.mls_name && h.mls_number ? t('mls', { name: h.mls_name, num: h.mls_number }) : null].filter(Boolean).join(' · ');
        var zip = h.zip || d.zip;
        var cta = el('a', { class: 'btn btn-secondary btn-small cta', href: intakeHref(zip), text: t('cta') });
        cta.addEventListener('click', function (e) { e.stopPropagation(); goIntake(e, zip); });
        var card = el('article', { class: 'home-card', 'data-id': h.id || '', tabindex: '0' }, [
          el('div', { class: 'price', text: h.price != null ? money(h.price) : '' }),
          specs ? el('div', { class: 'specs', text: specs }) : null,
          h.address ? el('div', { class: 'addr', text: h.address }) : null,
          builder.childNodes.length ? builder : null,
          meta ? el('div', { class: 'meta', text: meta }) : null,
          cta
        ]);
        card.addEventListener('click', function () { select(h.id); });
        card.addEventListener('keydown', function (e) { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(h.id); } });
        list.appendChild(card);
      });
      if (mode === 'compact') {
        var q = new URLSearchParams(currentQuery()); q.set('lang', lang());
        var link = el('a', { class: 'btn btn-secondary', href: BASE + '/search?' + q.toString(), text: d.matching > LIMIT ? t('see_all', { n: numf(d.matching) }) : t('open_full') });
        more.appendChild(link);
      }
      drawMarkers(shown, d.center);
    }

    function drawMarkers(items, center) {
      ensureMap().then(function (m) {
        var L = window.L;
        Object.keys(markers).forEach(function (k) { m.removeLayer(markers[k]); });
        markers = {};
        var bounds = [];
        items.forEach(function (h) {
          if (h.lat == null || h.lng == null || !h.id) return;
          var label = h.price != null ? shortMoney(h.price) : '';
          var pin = document.createElement('span'); pin.className = 'price-pin'; pin.textContent = label;
          var mk = L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'pin-host', html: pin.outerHTML, iconSize: [0, 0] }), keyboard: true, title: (h.address || '') + (label ? ' · ' + label : '') }).addTo(m);
          mk.on('click', function () { select(h.id, true); });
          markers[h.id] = mk; bounds.push([h.lat, h.lng]);
        });
        if (bounds.length) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        else if (center) m.setView([center.lat, center.lng], 11);
        setTimeout(function () { m.invalidateSize(); }, 60);
      }).catch(function () { /* map is an enhancement; the list still works */ });
    }

    function currentQuery() {
      var q = new URLSearchParams();
      ['zip', 'radius', 'max_price', 'beds_min', 'sort'].forEach(function (k) { var f = form.elements[k]; if (f && f.value) q.set(k, f.value.trim()); });
      return q;
    }

    function run(push) {
      var zip = zipInput.value.trim();
      if (!/^\d{5}$/.test(zip)) { formError.textContent = t('err_zip'); formError.hidden = false; zipInput.focus(); return; }
      formError.hidden = true;
      var q = currentQuery();
      if (push && mode === 'full') {
        var u = new URL(location.href);
        ['zip', 'radius', 'max_price', 'beds_min', 'sort'].forEach(function (k) { if (q.get(k)) u.searchParams.set(k, q.get(k)); else u.searchParams.delete(k); });
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      state = { kind: 'loading' }; render();
      fetch(BASE + '/api/v1/public/listings?' + q.toString(), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          var s = body && body.status;
          if (s === 'ok') state = { kind: 'ok', data: body };
          else if (s === 'not_configured') state = { kind: 'not_configured' };
          else if (s === 'cap_reached') state = { kind: 'cap_reached' };
          else if (s === 'invalid') { state = { kind: 'start' }; formError.textContent = t('err_zip'); formError.hidden = false; }
          else state = { kind: 'error' };
          render();
        })
        .catch(function () { state = { kind: 'error' }; render(); });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); run(true); });
    ['radius', 'max_price', 'beds_min', 'sort'].forEach(function (k) {
      var f = form.elements[k];
      if (f) f.addEventListener('change', function () { if (/^\d{5}$/.test(zipInput.value.trim())) run(true); });
    });

    function relabel() {
      Array.prototype.forEach.call(root.querySelectorAll('[data-k]'), function (n) {
        var k = n.getAttribute('data-k');
        if (n.tagName === 'OPTION') n.textContent = t(k); else n.textContent = t(k);
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-k-aria]'), function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-k-aria'))); });
      if (!formError.hidden) formError.textContent = t('err_zip');
      render();
    }
    if (window.MutationObserver) new MutationObserver(relabel).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    // Full page: restore a shared search from the URL and run it. Compact: prefill only, no automatic request.
    var params = new URLSearchParams(location.search);
    ['zip', 'radius', 'max_price', 'beds_min', 'sort'].forEach(function (k) { var v = params.get(k); var f = form.elements[k]; if (v && f) f.value = v; });
    render();
    if (mode === 'full' && /^\d{5}$/.test(zipInput.value.trim())) run(false);
    else if ('IntersectionObserver' in window) {
      // Load the map library only when the widget comes near the screen.
      var io = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) { io.disconnect(); ensureMap(); } }, { rootMargin: '400px' });
      io.observe(root);
    } else ensureMap();
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('[data-bl-search]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.BLSearch = { mount: mount };
})();
