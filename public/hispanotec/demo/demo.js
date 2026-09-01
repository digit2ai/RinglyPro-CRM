/* ============================================================================
   Hispanotec — simulador de la app de miembro.

   Una réplica manejable de la app de CamaraVirtual (cv-105) incrustada en la
   presentación: navegación real, búsqueda real, filtrado real y una pasada de
   ranking real, todo sobre el conjunto inventado de demo-data.js. Un miembro
   potencial ve cómo es de verdad la membresía sin necesidad de una cuenta, y
   el recorrido narrado tiene algo concreto que contar.

   Bilingüe: cada cadena vive en T y se vuelve a pintar cuando el selector de
   idioma cambia document.documentElement.lang. El español es el idioma por
   defecto de la cámara.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.HISPA_DEMO;
  if (!D) return;

  // ── i18n ───────────────────────────────────────────────────────────────
  var T = {
    nav_dashboard:  ['Dashboard', 'Panel'],
    nav_inbox:      ['Inbox', 'Mensajes'],
    nav_profile:    ['My Profile', 'Mi Perfil'],
    nav_directory:  ['Directory', 'Directorio'],
    nav_matching:   ['AI Matching', 'Matching con IA'],
    nav_searches:   ['My Searches', 'Mis Búsquedas'],
    nav_projects:   ['Projects', 'Proyectos'],
    nav_invites:    ['Invitations', 'Invitaciones'],
    nav_exchange:   ['Exchange', 'Intercambio'],
    nav_payments:   ['Payments', 'Pagos'],
    nav_guide:      ['Member Guide', 'Guía del Miembro'],
    nav_jobup:      ['JobUp — Global Profile', 'JobUp — Perfil Global'],
    nav_admin:      ['Admin', 'Admin'],

    role:           ['SUPERADMIN', 'SUPERADMIN'],
    welcome:        ['Welcome, <b>Alejandra</b>. Here is your network overview.', 'Bienvenida, <b>Alejandra</b>. Este es el resumen de tu red.'],
    k_members:      ['Active members', 'Miembros activos'],
    k_projects:     ['Active projects', 'Proyectos activos'],
    k_rfqs:         ['Open RFQs', 'RFQ abiertas'],
    k_hci:          ['HCI score', 'Índice HCI'],
    k_deals:        ['Deals closed (12 mo)', 'Negocios cerrados (12 m)'],
    k_value:        ['Value transacted', 'Valor transado'],
    by_region:      ['Members by region', 'Miembros por región'],
    by_tier:        ['Membership distribution', 'Distribución de membresía'],
    by_sector:      ['Top sectors', 'Sectores principales'],
    growth:         ['+18% vs. last year', '+18% vs. el año pasado'],

    inbox_lede:     ['Direct messages and group chats with chamber members.', 'Mensajes directos y chats grupales con miembros de la cámara.'],
    new_msg:        ['+ New message', '+ Nuevo mensaje'],
    new_group:      ['+ New group', '+ Nuevo grupo'],

    prof_lede:      ['Your profile drives who the AI matches you with. The more complete, the better the results.', 'Tu perfil determina con quién te empareja la IA. Cuanto más completo, mejores resultados.'],
    f_first:        ['First name', 'Nombre'],
    f_last:         ['Last name', 'Apellido'],
    f_country:      ['Country', 'País'],
    f_sector:       ['Sector', 'Sector'],
    f_sub:          ['Sub-specialty', 'Subespecialidad'],
    f_years:        ['Years of experience', 'Años de experiencia'],
    f_company:      ['Company', 'Empresa'],
    f_langs:        ['Languages', 'Idiomas'],
    f_region:       ['Region', 'Región'],
    f_trust:        ['Trust score (TrustRank)', 'Índice de confianza (TrustRank)'],
    f_reg:          ['Company registration / license / tax ID', 'Registro de empresa / licencia / ID fiscal'],
    trust_note:     ['Computed from verified registration, completed projects and peer endorsements. Not self-reported.', 'Calculado a partir del registro verificado, proyectos completados y respaldos de pares. No es autodeclarado.'],

    dir_ph:         ['Search by name or company...', 'Buscar por nombre o empresa...'],
    all_regions:    ['All regions', 'Todas las regiones'],
    all_sectors:    ['All sectors', 'Todos los sectores'],
    search:         ['Search', 'Buscar'],
    print_pdf:      ['Print PDF', 'Imprimir PDF'],
    add_member:     ['+ Add member', '+ Añadir miembro'],
    message:        ['Message', 'Mensaje'],
    view:           ['View', 'Ver'],
    showing:        ['Showing <b>{a}</b>-<b>{b}</b> of <b>{n}</b> members', 'Mostrando <b>{a}</b>-<b>{b}</b> de <b>{n}</b> miembros'],
    page_of:        ['Page {a} of {b}', 'Página {a} de {b}'],
    prev:           ['Previous', 'Anterior'],
    next:           ['Next', 'Siguiente'],
    yrs:            ['yrs exp.', 'años exp.'],
    no_results:     ['No members match those filters.', 'Ningún miembro coincide con esos filtros.'],

    match_title:    ['Intelligent partner search', 'Búsqueda inteligente de socios'],
    match_lede:     ['Describe what you need and the AI engine finds the best candidates, corrected for Gini equity.', 'Describe lo que necesitas y el motor de IA encuentra los mejores candidatos, con corrección de equidad Gini.'],
    match_label:    ['Describe what you need', 'Describe lo que necesitas'],
    match_ph:       ['E.g.: I need a freight forwarder in Valencia handling customs for fresh produce', 'Ej.: necesito un transitario en Valencia que gestione aduanas para fruta fresca'],
    try_one:        ['Try one:', 'Prueba una:'],
    save_search:    ['Save this search', 'Guardar esta búsqueda'],
    thinking:       ['Scoring 1,042 profiles...', 'Evaluando 1.042 perfiles...'],
    found:          ['<b>{n}</b> candidates ranked by affinity, then corrected for equity.', '<b>{n}</b> candidatos ordenados por afinidad y luego corregidos por equidad.'],
    gini_note:      ['<b>Gini equity correction applied.</b> Two slots were reserved for qualified members with fewer prior introductions, so the same well-connected names do not win every search.', '<b>Corrección de equidad Gini aplicada.</b> Se reservaron dos lugares para miembros calificados con menos presentaciones previas, para que los mismos nombres bien conectados no ganen todas las búsquedas.'],
    equity_pick:    ['equity slot', 'cupo de equidad'],
    match_score:    ['match', 'afinidad'],
    intro:          ['Request intro', 'Pedir presentación'],

    saved_title:    ['My saved searches', 'Mis búsquedas guardadas'],
    saved_lede:     ['Re-run a saved search, or delete ones you no longer need. New candidates arrive automatically as the network grows.', 'Vuelve a ejecutar una búsqueda guardada o elimina las que ya no necesites. Los nuevos candidatos llegan automáticamente a medida que crece la red.'],
    matches_n:      ['{n} matches', '{n} coincidencias'],
    last_run:       ['Last run:', 'Última ejecución:'],
    run_again:      ['Run again', 'Ejecutar de nuevo'],
    del:            ['Delete', 'Eliminar'],

    p_all:          ['All', 'Todos'],
    p_mine:         ['My projects', 'Mis proyectos'],
    p_joined:       ['Invited / joined', 'Invitado / unido'],
    p_matching:     ['Matching RFQs & roles', 'RFQ y roles compatibles'],
    p_grade:        ['Investment grade', 'Grado de inversión'],
    new_project:    ['+ New project', '+ Nuevo proyecto'],
    st_recruiting:  ['Recruiting', 'Reclutando'],
    st_executing:   ['Executing', 'En ejecución'],
    st_closed:      ['Closed', 'Cerrado'],
    r_proposer:     ['Proposer', 'Proponente'],
    r_member:       ['Member', 'Miembro'],
    r_open:         ['Open role', 'Rol abierto'],
    viability:      ['viability', 'viabilidad'],
    montecarlo:     ['(Monte Carlo, 10,000 runs)', '(Monte Carlo, 10.000 corridas)'],
    team_of:        ['{n} on team', '{n} en el equipo'],
    budget:         ['Budget', 'Presupuesto'],
    irs_note:       ['<b>IRS</b> is the Investment Readiness Score: team completeness, budget realism and Monte Carlo viability in one number. Nothing is funded on a promise.', '<b>IRS</b> es el Puntaje de Preparación para Inversión: integridad del equipo, realismo del presupuesto y viabilidad Monte Carlo en un solo número. Nada se financia con una promesa.'],

    inv_lede:       ['Roles you have been invited to fill inside member projects.', 'Roles a los que te han invitado dentro de proyectos de miembros.'],
    invited_by:     ['Invited by:', 'Invitado por:'],
    accepted:       ['Accepted', 'Aceptada'],
    pending:        ['Pending', 'Pendiente'],
    accept:         ['Accept', 'Aceptar'],
    decline:        ['Decline', 'Rechazar'],
    view_plan:      ['View plan', 'Ver plan'],

    x_companies:    ['Companies', 'Empresas'],
    x_rfqs:         ['RFQs', 'RFQ'],
    x_opps:         ['Opportunities', 'Oportunidades'],
    reg_company:    ['+ Register company', '+ Registrar empresa'],
    verified:       ['Verified', 'Verificada'],
    unverified:     ['In review', 'En revisión'],
    staff_n:        ['{n} staff', '{n} empleados'],
    posted_by:      ['Posted by', 'Publicada por'],
    bids_n:         ['{n} bids', '{n} ofertas'],
    closes_in:      ['closes in {n} days', 'cierra en {n} días'],
    submit_bid:     ['Submit bid', 'Enviar oferta'],

    pay_lede:       ['Membership dues, project escrow and chamber invoices in one place. Card details never touch our servers — Stripe holds them.', 'Cuotas de membresía, fideicomiso de proyectos y facturas de la cámara en un solo lugar. Los datos de tarjeta nunca tocan nuestros servidores: los guarda Stripe.'],
    pay_plan:       ['Current plan', 'Plan actual'],
    pay_next:       ['Next renewal', 'Próxima renovación'],
    pay_method:     ['Payment method', 'Método de pago'],
    pay_hist:       ['Recent invoices', 'Facturas recientes'],
    paid:           ['Paid', 'Pagada'],

    guide_lede:     ['How to get the most out of your digital chamber.', 'Cómo aprovechar al máximo tu cámara digital.'],
    contents:       ['Contents', 'Contenido'],

    jobup_h:        ['Your professional profile, beyond the chamber', 'Tu perfil profesional, más allá de la cámara'],
    jobup_p:        ['JobUp turns your resume into a living profile: real openings scored against what you have actually done, a public CV site recruiters and their AI can read, and outreach drafted for you to approve.', 'JobUp convierte tu currículum en un perfil vivo: vacantes reales evaluadas contra lo que realmente has hecho, un sitio de CV público que los reclutadores y su IA pueden leer, y mensajes redactados para que los apruebes.'],
    jobup_cta:      ['Open JobUp', 'Abrir JobUp'],

    adm_members:    ['Member management', 'Gestión de miembros'],
    adm_board:      ['Board of directors', 'Junta directiva'],
    adm_regions:    ['Regional delegations', 'Delegaciones regionales'],
    adm_settings:   ['Chamber settings', 'Ajustes de la cámara'],
    adm_ph:         ['Search member...', 'Buscar miembro...'],
    th_id:          ['ID', 'ID'],
    th_name:        ['Name', 'Nombre'],
    th_email:       ['Email', 'Correo'],
    th_country:     ['Country', 'País'],
    th_region:      ['Region', 'Región'],
    th_sector:      ['Sector', 'Sector'],
    th_tier:        ['Tier', 'Nivel'],
    board_note:     ['Board seats and regional delegate roles are assigned here. Governance changes are logged and visible to every member.', 'Aquí se asignan los puestos de la junta y los cargos de delegado regional. Los cambios de gobernanza quedan registrados y visibles para cada miembro.'],

    demo_tag:       ['Demo · sample data', 'Demo · datos de muestra'],
    demo_disc:      ['Interactive demonstration. Every member, company and project shown here is invented sample data — click anything.', 'Demostración interactiva. Cada miembro, empresa y proyecto mostrado aquí es dato de muestra inventado: haz clic en lo que quieras.']
  };

  var LANGS = { en: 0, es: 1 };
  function lang() { var l = document.documentElement.lang || 'en'; return LANGS[l] === undefined ? 'en' : l; }
  function t(k, vars) {
    var row = T[k]; if (!row) return k;
    var s = row[LANGS[lang()]] || row[0];
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  }
  function label(obj) { return obj[lang()] || obj.en; }
  function sector(id) { for (var i = 0; i < D.SECTORS.length; i++) if (D.SECTORS[i].id === id) return label(D.SECTORS[i]); return id; }
  function region(id) { for (var i = 0; i < D.REGIONS.length; i++) if (D.REGIONS[i].id === id) return label(D.REGIONS[i]); return id; }
  function tier(id) { for (var i = 0; i < D.TIERS.length; i++) if (D.TIERS[i].id === id) return label(D.TIERS[i]); return id; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  // Los separadores de millar se invierten entre los dos idiomas: 1,042 en
  // inglés y 1.042 en español. Un panel que mezcla ambos se lee como un error.
  function num(n) { return n.toLocaleString(lang() === 'en' ? 'en-US' : 'es-ES'); }

  // ── icons ──────────────────────────────────────────────────────────────
  var I = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    inbox: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
    profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    directory: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    matching: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35',
    searches: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    projects: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    invites: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
    exchange: 'M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4',
    payments: 'M2 6h20v12H2zM2 10h20',
    guide: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    jobup: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
    admin: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4'
  };
  function icon(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + I[k] + '"/></svg>';
  }

  var NAV = [
    ['dashboard', 'nav_dashboard'], ['inbox', 'nav_inbox', 7], ['profile', 'nav_profile'],
    ['directory', 'nav_directory'], ['matching', 'nav_matching'], ['searches', 'nav_searches'],
    ['projects', 'nav_projects'], ['invites', 'nav_invites', 2], ['exchange', 'nav_exchange'],
    ['payments', 'nav_payments'], ['guide', 'nav_guide'], ['jobup', 'nav_jobup'], ['admin', 'nav_admin']
  ];

  // ── view state ─────────────────────────────────────────────────────────
  var S = {
    screen: 'dashboard',
    dir: { q: '', region: '', sector: '', page: 0 },
    adm: { q: '', page: 0, tab: 'members' },
    proj: 'all',
    xch: 'companies',
    guide: 0,
    match: { q: '', results: null, busy: false }
  };
  var PER_CARD = 6, PER_ROW = 8;
  var LOGO = '/hispatec/logo-hispanotec.svg';

  // ── screens ────────────────────────────────────────────────────────────
  function head(titleKey) {
    return '<div class="vc-head"><img src="' + LOGO + '" alt=""><h3>' + t(titleKey) + '</h3></div>';
  }

  function scDashboard() {
    var st = D.STATS;
    var maxR = Math.max.apply(null, D.REGIONS.map(function (g) { return g.n; }));
    var maxT = Math.max.apply(null, D.TIERS.map(function (g) { return g.n; }));
    var secCount = {};
    D.MEMBERS.forEach(function (m) { secCount[m.sector] = (secCount[m.sector] || 0) + 1; });
    var top = Object.keys(secCount).map(function (k) { return { k: k, n: secCount[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var maxS = top[0].n;

    return head('nav_dashboard') +
      '<p class="vc-lede">' + t('welcome') + '</p>' +
      '<div class="vc-kpis">' +
        kpi('k_members', num(st.members), t('growth')) +
        kpi('k_projects', st.projects) +
        kpi('k_rfqs', st.rfqs, null, 'gold') +
        kpi('k_hci', st.hci + '%') +
        kpi('k_deals', num(st.deals)) +
        kpi('k_value', label(st.transacted)) +
      '</div>' +
      '<div class="vc-two">' +
        '<div class="vc-card"><h4>' + t('by_region') + '</h4><div class="vc-bars">' +
          D.REGIONS.map(function (g) { return bar(label(g), g.n, maxR); }).join('') +
        '</div></div>' +
        '<div class="vc-card"><h4>' + t('by_tier') + '</h4><div class="vc-bars">' +
          D.TIERS.map(function (g) { return bar(label(g), g.n, maxT, true); }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="vc-card"><h4>' + t('by_sector') + '</h4><div class="vc-bars">' +
        top.map(function (s) { return bar(sector(s.k), s.n, maxS); }).join('') +
      '</div></div>';
  }
  function kpi(k, v, sub, cls) {
    return '<div class="vc-kpi ' + (cls || '') + '"><small>' + t(k) + '</small><b>' + v + '</b>' +
      (sub ? '<u>' + sub + '</u>' : '') + '</div>';
  }
  function bar(name, n, max, gold) {
    var pct = Math.round((n / max) * 100);
    // Under ~14% the fill is narrower than its own label, so print the number
    // beside the bar rather than clipping it inside.
    var inside = pct >= 14;
    return '<div class="vc-bar' + (gold ? ' gold' : '') + '"><span>' + esc(name) + '</span>' +
      '<div><i style="width:' + pct + '%">' + (inside ? num(n) : '') + '</i>' +
      (inside ? '' : '<u style=\'left:' + pct + '%\'>' + num(n) + '</u>') + '</div></div>';
  }

  function scInbox() {
    return head('nav_inbox') +
      '<div class="vc-tools"><button class="vc-btn">' + t('new_msg') + '</button>' +
      '<button class="vc-btn ghost">' + t('new_group') + '</button></div>' +
      '<p class="vc-lede">' + t('inbox_lede') + '</p>' +
      D.CONVOS.map(function (c) {
        return '<div class="vc-conv"><div class="top"><b>' +
          (c.group ? '<span class="vc-pill blue">' + (lang() === 'en' ? 'GROUP' : 'GRUPO') + '</span> ' : '') +
          esc(c.who) + '</b><time>' + esc(c.when) + '</time></div>' +
          '<div class="co">' + esc(c.co) + (c.unread ? ' · <b style="color:#d33a2c">' + c.unread + '</b>' : '') + '</div>' +
          '<div class="msg">' + esc(label(c)) + '</div></div>';
      }).join('');
  }

  function scProfile() {
    function f(lbl, val, wide) {
      return '<div style="' + (wide ? 'grid-column:1/-1;' : '') + '"><small style="display:block;font-size:10.5px;letter-spacing:1px;color:#7a8497;text-transform:uppercase;font-weight:600;margin-bottom:5px;">' +
        t(lbl) + '</small><div class="vc-in" style="background:#fbfcfe;">' + esc(val) + '</div></div>';
    }
    return head('nav_profile') +
      '<p class="vc-lede">' + t('prof_lede') + '</p>' +
      '<div class="vc-card"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
        f('f_first', 'Alejandra') + f('f_last', 'Quiroga') +
        f('f_country', 'España') + f('f_sector', sector('tecnologia')) +
        f('f_sub', 'Plataformas IA') + f('f_years', '12') +
        f('f_company', 'Nervión Systems S.L.') + f('f_region', region('espana')) +
        f('f_langs', 'Español · English') + f('f_trust', '94 / 100') +
        f('f_reg', 'CIF B·····4821', true) +
      '</div>' +
      '<div class="vc-note">' + t('trust_note') + '</div></div>';
  }

  function filteredMembers() {
    var q = S.dir.q.toLowerCase().trim();
    return D.MEMBERS.filter(function (m) {
      if (S.dir.region && m.region !== S.dir.region) return false;
      if (S.dir.sector && m.sector !== S.dir.sector) return false;
      if (q && (m.name + ' ' + m.company + ' ' + m.sub).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function scDirectory() {
    var list = filteredMembers();
    var pages = Math.max(1, Math.ceil(list.length / PER_CARD));
    if (S.dir.page >= pages) S.dir.page = 0;
    var from = S.dir.page * PER_CARD;
    var slice = list.slice(from, from + PER_CARD);

    return head('nav_directory') +
      '<div class="vc-tools">' +
        '<input class="vc-in" id="vcDirQ" placeholder="' + t('dir_ph') + '" value="' + esc(S.dir.q) + '">' +
        selectEl('vcDirRegion', t('all_regions'), D.REGIONS, S.dir.region) +
        selectEl('vcDirSector', t('all_sectors'), D.SECTORS, S.dir.sector) +
        '<button class="vc-btn" data-act="dirSearch">' + t('search') + '</button>' +
        '<button class="vc-btn gray" data-act="noop">' + t('print_pdf') + '</button>' +
        '<button class="vc-btn green" data-act="noop">' + t('add_member') + '</button>' +
      '</div>' +
      '<p class="vc-count">' + (list.length
        ? t('showing', { a: num(from + 1), b: num(Math.min(from + PER_CARD, list.length)), n: num(list.length) })
        : t('no_results')) + '</p>' +
      '<div class="vc-grid">' + slice.map(memberCard).join('') + '</div>' +
      (list.length ? pager(S.dir.page, pages, 'dir') : '');
  }
  function memberCard(m) {
    return '<div class="vc-mc"><h5>' + esc(m.name) + '</h5>' +
      '<div class="co">' + (m.company ? esc(m.company) + ' ' : '') +
      '<span class="vc-pill ' + m.tier + '">' + tier(m.tier) + '</span></div>' +
      '<div class="meta">' + sector(m.sector) + ' · ' + esc(m.sub) + '<br>' + region(m.region) +
      ' · ' + m.years + ' ' + t('yrs') + ' · TrustRank ' + m.trust + '</div>' +
      '<div class="row"><button class="vc-btn sm gray" data-act="noop">' + t('message') + '</button>' +
      '<button class="vc-btn sm ghost" data-act="noop">' + t('view') + '</button></div></div>';
  }
  function selectEl(id, allLabel, opts, val) {
    return '<select class="vc-sel" id="' + id + '"><option value="">' + allLabel + '</option>' +
      opts.map(function (o) {
        return '<option value="' + o.id + '"' + (val === o.id ? ' selected' : '') + '>' + label(o) + '</option>';
      }).join('') + '</select>';
  }
  function pager(page, pages, kind) {
    return '<div class="vc-pager">' +
      '<button class="vc-btn sm gray" data-act="' + kind + 'Prev"' + (page === 0 ? ' disabled' : '') + '>&larr; ' + t('prev') + '</button>' +
      '<span>' + t('page_of', { a: num(page + 1), b: num(pages) }) + '</span>' +
      '<button class="vc-btn sm gray" data-act="' + kind + 'Next"' + (page >= pages - 1 ? ' disabled' : '') + '>' + t('next') + ' &rarr;</button></div>';
  }

  // ── AI matching ────────────────────────────────────────────────────────
  var EXAMPLES = [
    { es: 'Necesito un transitario en Valencia que gestione aduanas y cadena de frío para fruta fresca',
      en: 'I need a freight forwarder in Valencia handling customs and cold chain for fresh produce' },
    { es: 'Busco un despacho mercantil en México para constituir filial y contratos de distribución',
      en: 'Looking for a commercial law firm in Mexico to incorporate a subsidiary and draft distribution contracts' },
    { es: 'Ingeniería de fotovoltaica para autoconsumo compartido en un polígono industrial',
      en: 'Solar engineering for shared self-consumption in an industrial park' }
  ];

  function scoreMembers(q) {
    var terms = q.toLowerCase().split(/[^a-záéíóúñü]+/).filter(function (w) { return w.length > 3; });
    var scored = D.MEMBERS.map(function (m) {
      var hay = (m.name + ' ' + m.company + ' ' + m.sub + ' ' + m.sector + ' ' + m.region + ' ' +
        sector(m.sector) + ' ' + region(m.region) + ' ' +
        ['en', 'es'].map(function (L) {
          var s = D.SECTORS.filter(function (x) { return x.id === m.sector; })[0];
          return s ? s[L] : '';
        }).join(' ')).toLowerCase();
      var hits = 0;
      terms.forEach(function (w) { if (hay.indexOf(w) !== -1) hits++; });
      return { m: m, hits: hits, score: Math.min(98, Math.round(hits * 21 + m.trust * 0.34)) };
    }).filter(function (x) { return x.hits > 0; });

    scored.sort(function (a, b) { return b.score - a.score || a.m.id - b.m.id; });
    var top = scored.slice(0, 4);
    // Gini equity correction: reserve two slots for qualified members further down
    // the ranking, so the same well-connected profiles do not win every search.
    // Draw the equity picks from the qualified middle of the ranking, not the
    // tail: a reserved slot filled by a 40% match discredits the whole idea.
    var rest = scored.slice(4).filter(function (x) { return x.score >= 60; });
    var equity = [];
    var step = Math.max(1, Math.floor(rest.length / 4));
    for (var i = step; i < rest.length && equity.length < 2; i += step) {
      rest[i].equity = true; equity.push(rest[i]);
    }
    return { list: top.concat(equity), total: scored.length };
  }

  function scMatching() {
    var r = S.match.results;
    return head('nav_matching') +
      '<div class="vc-card"><h4>' + t('match_title') + '</h4>' +
      '<p class="vc-lede" style="margin-top:-8px">' + t('match_lede') + '</p>' +
      '<label style="display:block;font-size:10.5px;letter-spacing:1px;color:#7a8497;text-transform:uppercase;font-weight:600;margin-bottom:6px;">' +
      t('match_label') + '</label>' +
      '<textarea class="vc-ta" id="vcMatchQ" placeholder="' + t('match_ph') + '">' + esc(S.match.q) + '</textarea>' +
      '<div class="vc-tools" style="margin-top:10px">' +
        '<span style="font-size:12.5px;color:#6b7486">' + t('try_one') + '</span>' +
        EXAMPLES.map(function (e, i) {
          return '<button class="vc-btn sm gray" data-act="example" data-i="' + i + '">' +
            esc(label(e).slice(0, 34)) + '…</button>';
        }).join('') +
      '</div>' +
      '<div class="vc-tools" style="justify-content:flex-end">' +
        '<button class="vc-btn ghost" data-act="noop">' + t('save_search') + '</button>' +
        '<button class="vc-btn" data-act="runMatch">' + t('search') + '</button>' +
      '</div>' +
      (S.match.busy ? '<div class="vc-thinking"><span class="vc-spin"></span>' + t('thinking') + '</div>' : '') +
      '</div>' +
      (r ? matchResults(r) : '');
  }
  function matchResults(r) {
    if (!r.list.length) return '<p class="vc-empty">' + t('no_results') + '</p>';
    return '<p class="vc-count">' + t('found', { n: num(r.total) }) + '</p>' +
      '<div class="vc-grid">' + r.list.map(function (x) {
        var m = x.m;
        return '<div class="vc-mc"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
          '<div><h5>' + esc(m.name) + '</h5><div class="co">' + (m.company ? esc(m.company) : '—') + '</div></div>' +
          '<span class="vc-score' + (x.score < 70 ? ' mid' : '') + '">' + x.score + '% ' + t('match_score') + '</span></div>' +
          '<div class="meta">' + sector(m.sector) + ' · ' + esc(m.sub) + '<br>' + region(m.region) +
          ' · ' + m.years + ' ' + t('yrs') + ' · TrustRank ' + m.trust +
          (x.equity ? ' <span class="vc-pill gold">' + t('equity_pick') + '</span>' : '') + '</div>' +
          '<div class="row"><button class="vc-btn sm" data-act="noop">' + t('intro') + '</button>' +
          '<button class="vc-btn sm ghost" data-act="noop">' + t('view') + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="vc-note">' + t('gini_note') + '</div>';
  }

  function scSearches() {
    return head('nav_searches') +
      '<div class="vc-card"><h4>' + t('saved_title') + '</h4>' +
      '<p class="vc-lede" style="margin-top:-8px">' + t('saved_lede') + '</p>' +
      D.SAVED.map(function (s) {
        return '<div class="vc-conv" style="cursor:default"><div class="msg" style="font-style:italic;color:#3d4557">"' +
          esc(label(s)) + '"</div>' +
          '<div class="co" style="margin-top:8px"><b style="color:#1c3ca8">' + t('matches_n', { n: s.matches }) + '</b> · ' +
          t('last_run') + ' ' + s.last + '</div>' +
          '<div class="row" style="margin-top:10px"><button class="vc-btn sm" data-act="noop">' + t('run_again') + '</button>' +
          '<button class="vc-btn sm red" data-act="noop">' + t('del') + '</button></div></div>';
      }).join('') + '</div>';
  }

  function scProjects() {
    var tabs = [['all', 'p_all'], ['mine', 'p_mine'], ['joined', 'p_joined'], ['matching', 'p_matching'], ['grade', 'p_grade']];
    var list = D.PROJECTS.filter(function (p) {
      if (S.proj === 'mine') return p.role === 'proposer';
      if (S.proj === 'joined') return p.role === 'member';
      if (S.proj === 'matching') return p.status === 'recruiting';
      if (S.proj === 'grade') return p.irs >= 80;
      return true;
    });
    return head('nav_projects') +
      '<div class="vc-tabs">' + tabs.map(function (x) {
        return '<button class="vc-tab' + (S.proj === x[0] ? ' on' : '') + '" data-act="projTab" data-v="' + x[0] + '">' + t(x[1]) + '</button>';
      }).join('') + '<button class="vc-btn" style="margin-left:auto" data-act="noop">' + t('new_project') + '</button></div>' +
      '<div class="vc-grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">' +
      list.map(function (p) {
        var stKey = p.status === 'recruiting' ? 'st_recruiting' : p.status === 'closed' ? 'st_closed' : 'st_executing';
        var roleKey = p.role === 'proposer' ? 'r_proposer' : p.role === 'member' ? 'r_member' : 'r_open';
        return '<div class="vc-mc"><h5 style="min-height:42px">' + esc(label(p)) + '</h5>' +
          '<div class="row" style="margin:8px 0"><span class="vc-pill irs' + (p.irs < 80 ? ' mid' : '') + '">IRS ' + p.irs + '</span>' +
          '<span class="vc-pill ' + (p.role === 'open' ? 'gray' : 'blue') + '">' + t(roleKey) + '</span>' +
          '<span class="vc-pill ' + (p.status === 'closed' ? 'gray' : 'gold') + '">' + t(stKey) + '</span></div>' +
          '<div class="meta">' + esc(p.owner) + ' · ' + sector(p.sector) + '<br>' +
          '<b style="color:#1f9d55">' + p.viab + '% ' + t('viability') + '</b> ' + t('montecarlo') + '<br>' +
          t('team_of', { n: p.team }) + ' · ' + t('budget') + ' ' + p.budget + '</div>' +
          '<div class="row"><button class="vc-btn sm ghost" data-act="noop">' + t('view_plan') + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="vc-note">' + t('irs_note') + '</div>';
  }

  function scInvites() {
    return head('nav_invites') +
      '<p class="vc-lede">' + t('inv_lede') + '</p>' +
      D.INVITES.map(function (v) {
        var p = D.PROJECTS.filter(function (x) { return x.id === v.proj; })[0];
        var role = lang() === 'en' ? v.roleEn : v.roleEs;
        var acc = v.state === 'accepted';
        return '<div class="vc-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
          '<div><b style="font-size:15px;color:#16213e">' + esc(label(p)) + '</b>' +
          '<div class="co" style="color:#6b7486;font-size:12.5px;margin-top:4px">' + t('invited_by') + ' ' + esc(v.by) + '</div></div>' +
          '<span class="vc-pill ' + (acc ? 'green' : 'gold') + '">' + t(acc ? 'accepted' : 'pending') + '</span></div>' +
          '<div style="border:1px solid #e6eaf1;border-radius:9px;padding:12px 14px;margin-top:12px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<div><b>' + esc(role) + '</b><div style="font-size:12.5px;color:#6b7486">' + t('match_score') + ': ' + v.score + '%</div></div>' +
          (acc ? '<span class="vc-pill green">' + t('accepted') + '</span>'
               : '<div class="row"><button class="vc-btn sm green" data-act="noop">' + t('accept') + '</button>' +
                 '<button class="vc-btn sm red" data-act="noop">' + t('decline') + '</button></div>') +
          '</div>' +
          '<div class="row" style="margin-top:12px"><button class="vc-btn sm gray" data-act="noop">' + t('view_plan') + '</button></div></div>';
      }).join('');
  }

  function scExchange() {
    var tabs = [['companies', 'x_companies'], ['rfqs', 'x_rfqs'], ['opps', 'x_opps']];
    var body = '';
    if (S.xch === 'companies') {
      body = '<div class="vc-grid">' + D.COMPANIES.map(function (c) {
        return '<div class="vc-mc"><h5>' + esc(c.name) + '</h5>' +
          '<div class="co"><span class="vc-pill ' + (c.verified ? 'founding' : 'student') + '">' +
          t(c.verified ? 'verified' : 'unverified') + '</span></div>' +
          '<div class="meta">' + sector(c.sector) + ' · ' + region(c.region) + '<br>' + t('staff_n', { n: c.staff }) + '</div>' +
          '<div class="row"><button class="vc-btn sm ghost" data-act="noop">' + t('view') + '</button></div></div>';
      }).join('') + '</div>';
    } else if (S.xch === 'rfqs') {
      body = D.RFQS.map(function (r) {
        return '<div class="vc-card"><b style="font-size:15px;color:#16213e">' + esc(label(r)) + '</b>' +
          '<div class="meta" style="color:#5b6577;font-size:12.5px;margin:8px 0 10px">' +
          t('posted_by') + ' <b>' + esc(r.by) + '</b> · ' + sector(r.sector) + ' · ' + t('budget') + ' ' + r.budget + '<br>' +
          '<b style="color:#1c3ca8">' + t('bids_n', { n: r.bids }) + '</b> · ' + t('closes_in', { n: r.days }) + '</div>' +
          '<button class="vc-btn sm" data-act="noop">' + t('submit_bid') + '</button></div>';
      }).join('');
    } else {
      body = D.PROJECTS.filter(function (p) { return p.status === 'recruiting'; }).map(function (p) {
        return '<div class="vc-card"><b style="font-size:15px;color:#16213e">' + esc(label(p)) + '</b>' +
          '<div class="meta" style="color:#5b6577;font-size:12.5px;margin:8px 0 10px">' +
          esc(p.owner) + ' · ' + sector(p.sector) + ' · ' + t('budget') + ' ' + p.budget + ' · IRS ' + p.irs + '</div>' +
          '<button class="vc-btn sm" data-act="noop">' + t('view_plan') + '</button></div>';
      }).join('');
    }
    return head('nav_exchange') +
      '<div class="vc-tabs">' + tabs.map(function (x) {
        return '<button class="vc-tab' + (S.xch === x[0] ? ' on' : '') + '" data-act="xchTab" data-v="' + x[0] + '">' + t(x[1]) + '</button>';
      }).join('') + '<button class="vc-btn" style="margin-left:auto" data-act="noop">' + t('reg_company') + '</button></div>' + body;
  }

  function scPayments() {
    var rows = [
      ['FAC-2026-0413', '1 ago 2026', '180,00 €'],
      ['FAC-2026-0288', '1 jul 2026', '180,00 €'],
      ['FAC-2026-0151', '1 jun 2026', '180,00 €']
    ];
    return head('nav_payments') +
      '<p class="vc-lede">' + t('pay_lede') + '</p>' +
      '<div class="vc-kpis">' +
        '<div class="vc-kpi"><small>' + t('pay_plan') + '</small><b style="font-size:20px">' + tier('corporate') + '</b></div>' +
        '<div class="vc-kpi"><small>' + t('pay_next') + '</small><b style="font-size:20px">1 sep 2026</b></div>' +
        '<div class="vc-kpi"><small>' + t('pay_method') + '</small><b style="font-size:20px">Visa ···· 4242</b></div>' +
      '</div>' +
      '<div class="vc-card"><h4>' + t('pay_hist') + '</h4><div class="vc-tw"><table class="vc-t" style="min-width:auto">' +
      '<tbody>' + rows.map(function (r) {
        return '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td>' +
          '<td><span class="vc-pill founding">' + t('paid') + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  var GUIDE = [
    { es: 'Bienvenida', en: 'Welcome',
      bEs: 'Tu cuenta siempre está activa. Inicia sesión desde cualquier dispositivo en la página de tu cámara. Esta guía explica cada módulo y cómo obtener valor desde el primer día.',
      bEn: 'Your account is always on. Sign in from any device on your chamber landing page. This guide explains every module and how to extract value from day one.' },
    { es: 'Mi Perfil', en: 'My Profile',
      bEs: 'El sector y la subespecialidad determinan con quién te empareja la IA. País y región habilitan los filtros geográficos. Un registro mercantil verificado es la señal de confianza más fuerte que puedes añadir.',
      bEn: 'Sector and sub-specialty drive who the AI matches you with. Country and region enable geographic filters. A verified company registration is the single strongest trust signal you can add.' },
    { es: 'Directorio', en: 'Directory',
      bEs: 'Todos los miembros activos, filtrables por sector y región, a ambos lados del Atlántico. Escribe a cualquiera directamente: sin presentaciones ni intermediarios.',
      bEn: 'Every active member, filterable by sector and region, on both sides of the Atlantic. Message anyone directly — no introductions needed, no gatekeeper.' },
    { es: 'Matching con IA', en: 'AI Matching',
      bEs: 'Describe una necesidad en lenguaje natural. La similitud coseno ordena los perfiles por afinidad, TrustRank pondera la fiabilidad y una corrección Gini evita que la oportunidad se concentre en los mismos pocos miembros.',
      bEn: 'Describe a need in plain language. Cosine similarity ranks profiles by affinity, TrustRank weights reliability, and a Gini correction keeps opportunity from concentrating in the same few members.' },
    { es: 'Proyectos', en: 'Projects',
      bEs: 'Propón un proyecto, arma un equipo por roles y ejecuta una simulación Monte Carlo de 10.000 iteraciones antes de comprometer un euro. El puntaje IRS resume la preparación.',
      bEn: 'Propose a project, assemble a team by role, and run a 10,000-iteration Monte Carlo viability simulation before committing a euro. The IRS score summarises readiness.' },
    { es: 'Intercambio (RFQ)', en: 'Exchange (RFQs)',
      bEs: 'Publica una solicitud de cotización a toda la red, o presenta una oferta a la de otro. Las ofertas quedan dentro de la cámara, entre miembros con identidad verificada.',
      bEn: 'Post a request for quotation to the whole network, or bid on someone else\'s. Bids stay inside the chamber, between members whose identity has been verified.' },
    { es: 'Métricas y HCI', en: 'Metrics & HCI',
      bEs: 'El índice de cooperación HCI mide cuánto de la red realmente comercia entre sí, no solo cuánta gente se inscribió. Es la cifra que le dice a la junta si la cámara está funcionando.',
      bEn: 'The HCI cooperation index measures how much of the network is actually trading with each other, not just how many people joined. It is the number that tells the board whether the chamber is working.' }
  ];
  function scGuide() {
    var g = GUIDE[S.guide];
    var body = lang() === 'en' ? g.bEn : g.bEs;
    return head('nav_guide') +
      '<p class="vc-lede">' + t('guide_lede') + '</p>' +
      '<div class="vc-guide"><div class="vc-toc">' +
        '<div style="font-size:10.5px;letter-spacing:1px;color:#7a8497;text-transform:uppercase;font-weight:700;padding:4px 14px 8px">' + t('contents') + '</div>' +
        GUIDE.map(function (x, i) {
          return '<button class="' + (S.guide === i ? 'on' : '') + '" data-act="guide" data-i="' + i + '">' + (i + 1) + '. ' + label(x) + '</button>';
        }).join('') +
      '</div><div class="vc-card"><h4><span class="vc-step-n">' + (S.guide + 1) + '</span>' + label(g) + '</h4>' +
      '<p style="color:#4b5568;font-size:14px;margin:0">' + esc(body) + '</p></div></div>';
  }

  function scJobup() {
    return head('nav_jobup') +
      '<div class="vc-jobup"><h4>' + t('jobup_h') + '</h4><p>' + t('jobup_p') + '</p>' +
      '<a class="vc-btn" href="https://jobup.dev" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">' +
      t('jobup_cta') + ' &rarr;</a></div>';
  }

  function scAdmin() {
    var tabs = [['members', 'adm_members'], ['board', 'adm_board'], ['regions', 'adm_regions'], ['settings', 'adm_settings']];
    var body;
    if (S.adm.tab === 'members') {
      var q = S.adm.q.toLowerCase().trim();
      var list = D.MEMBERS.filter(function (m) {
        return !q || (m.name + ' ' + m.email + ' ' + m.company).toLowerCase().indexOf(q) !== -1;
      });
      var pages = Math.max(1, Math.ceil(list.length / PER_ROW));
      if (S.adm.page >= pages) S.adm.page = 0;
      var from = S.adm.page * PER_ROW;
      body = '<div class="vc-tools"><input class="vc-in" id="vcAdmQ" placeholder="' + t('adm_ph') + '" value="' + esc(S.adm.q) + '">' +
        '<button class="vc-btn" data-act="admSearch">' + t('search') + '</button></div>' +
        '<p class="vc-count">' + t('showing', { a: num(from + 1), b: num(Math.min(from + PER_ROW, list.length)), n: num(list.length) }) + '</p>' +
        '<div class="vc-tw"><table class="vc-t"><thead><tr>' +
        ['th_id', 'th_name', 'th_email', 'th_country', 'th_region', 'th_sector', 'th_tier'].map(function (k) {
          return '<th>' + t(k) + '</th>';
        }).join('') + '</tr></thead><tbody>' +
        list.slice(from, from + PER_ROW).map(function (m) {
          return '<tr><td>' + m.id + '</td><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.email) + '</td>' +
            '<td>' + esc(m.country) + '</td><td>' + region(m.region) + '</td><td>' + sector(m.sector) + '</td>' +
            '<td><span class="vc-pill ' + m.tier + '">' + tier(m.tier) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' + pager(S.adm.page, pages, 'adm');
    } else if (S.adm.tab === 'regions') {
      body = '<div class="vc-card"><h4>' + t('by_region') + '</h4><div class="vc-bars">' +
        D.REGIONS.map(function (g) {
          return bar(label(g), g.n, Math.max.apply(null, D.REGIONS.map(function (x) { return x.n; })));
        }).join('') + '</div></div>';
    } else if (S.adm.tab === 'board') {
      var board = D.MEMBERS.filter(function (m) { return m.tier === 'founding'; }).slice(0, 6);
      body = '<div class="vc-grid">' + board.map(function (m) {
        return '<div class="vc-mc"><h5>' + esc(m.name) + '</h5><div class="co">' + (m.company || '—') + '</div>' +
          '<div class="meta">' + sector(m.sector) + ' · ' + region(m.region) + ' · TrustRank ' + m.trust + '</div></div>';
      }).join('') + '</div><div class="vc-note">' + t('board_note') + '</div>';
    } else {
      body = '<div class="vc-card"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
        ['Hispanotec', 'cv-105', 'camaravirtual.app/cv-105', 'Español · English'].map(function (v, i) {
          var lbls = lang() === 'en'
            ? ['Chamber name', 'Slug', 'Public URL', 'Languages']
            : ['Nombre de la cámara', 'Slug', 'URL pública', 'Idiomas'];
          return '<div><small style="display:block;font-size:10.5px;letter-spacing:1px;color:#7a8497;text-transform:uppercase;font-weight:600;margin-bottom:5px">' +
            lbls[i] + '</small><div class="vc-in" style="background:#fbfcfe">' + v + '</div></div>';
        }).join('') + '</div></div>';
    }
    return head('nav_admin') +
      '<div class="vc-tabs">' + tabs.map(function (x) {
        return '<button class="vc-tab' + (S.adm.tab === x[0] ? ' on' : '') + '" data-act="admTab" data-v="' + x[0] + '">' + t(x[1]) + '</button>';
      }).join('') + '</div>' + body;
  }

  var SCREENS = {
    dashboard: scDashboard, inbox: scInbox, profile: scProfile, directory: scDirectory,
    matching: scMatching, searches: scSearches, projects: scProjects, invites: scInvites,
    exchange: scExchange, payments: scPayments, guide: scGuide, jobup: scJobup, admin: scAdmin
  };

  // ── render ─────────────────────────────────────────────────────────────
  var root;
  function render() {
    if (!root) return;
    root.innerHTML =
      '<div class="vc-side">' +
        '<div class="vc-brand"><img src="' + LOGO + '" alt=""><div class="vc-brand-name">Hispa<span>notec</span></div></div>' +
        '<div class="vc-nav">' + NAV.map(function (n, i) {
          return (i === 10 ? '<div class="vc-nav-sep"></div>' : '') +
            '<button class="' + (S.screen === n[0] ? 'on' : '') + '" data-act="go" data-v="' + n[0] + '">' +
            icon(n[0]) + '<span>' + t(n[1]) + '</span>' +
            (n[2] ? '<span class="vc-badge-n">' + n[2] + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<div class="vc-me"><b>Alejandra Quiroga</b><span>' + t('role') + '</span></div>' +
      '</div>' +
      '<div class="vc-main" id="vcMain">' + SCREENS[S.screen]() + '</div>';
    var tag = document.getElementById('vcDemoTag');
    if (tag) tag.textContent = t('demo_tag');
    var disc = document.getElementById('vcDisc');
    if (disc) disc.innerHTML = t('demo_disc');
  }

  function readInputs() {
    var q = document.getElementById('vcDirQ');
    if (q) S.dir.q = q.value;
    var r = document.getElementById('vcDirRegion'); if (r) S.dir.region = r.value;
    var s = document.getElementById('vcDirSector'); if (s) S.dir.sector = s.value;
    var a = document.getElementById('vcAdmQ'); if (a) S.adm.q = a.value;
    var m = document.getElementById('vcMatchQ'); if (m) S.match.q = m.value;
  }

  var ACT = {
    noop: function () {},
    go: function (v) { S.screen = v; S.match.busy = false; },
    projTab: function (v) { S.proj = v; },
    xchTab: function (v) { S.xch = v; },
    admTab: function (v) { S.adm.tab = v; S.adm.page = 0; },
    guide: function (v, el) { S.guide = +el.getAttribute('data-i'); },
    dirSearch: function () { S.dir.page = 0; },
    dirPrev: function () { S.dir.page = Math.max(0, S.dir.page - 1); },
    dirNext: function () { S.dir.page++; },
    admSearch: function () { S.adm.page = 0; },
    admPrev: function () { S.adm.page = Math.max(0, S.adm.page - 1); },
    admNext: function () { S.adm.page++; },
    example: function (v, el) {
      S.match.q = label(EXAMPLES[+el.getAttribute('data-i')]);
      S.match.results = null;
    },
    runMatch: function () {
      if (!S.match.q.trim()) return;
      S.match.busy = true;
      S.match.results = null;
      setTimeout(function () {
        S.match.busy = false;
        S.match.results = scoreMembers(S.match.q);
        render();
        var m = document.getElementById('vcMain');
        if (m) m.scrollTop = Math.max(0, m.scrollHeight - m.clientHeight);
      }, 850);
    }
  };

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    e.preventDefault();
    var fn = ACT[el.getAttribute('data-act')];
    if (!fn) return;
    readInputs();
    fn(el.getAttribute('data-v'), el);
    render();
  }

  // ── boot ───────────────────────────────────────────────────────────────
  function boot() {
    root = document.getElementById('vcApp');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.target.id === 'vcDirQ' || e.target.id === 'vcAdmQ')) {
        e.preventDefault(); readInputs();
        if (e.target.id === 'vcDirQ') S.dir.page = 0; else S.adm.page = 0;
        render();
      }
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // The page language switch drives the app too, and the narrated ecosystem
  // deck (/hispanotec/ecosystem/) drives it slide by slide through set()/runMatch().
  window.HispaDemo = {
    relang: render,
    go: function (s) { S.screen = s; render(); },
    // Put the app into an exact state for one slide of the deck.
    set: function (o) {
      o = o || {};
      if (o.screen) S.screen = o.screen;
      if (o.projTab) S.proj = o.projTab;
      if (o.xchTab) S.xch = o.xchTab;
      if (o.admTab) { S.adm.tab = o.admTab; S.adm.page = 0; }
      if (typeof o.guide === 'number') S.guide = o.guide;
      if (typeof o.dirSector === 'string') { S.dir.sector = o.dirSector; S.dir.page = 0; }
      if (typeof o.dirQ === 'string') { S.dir.q = o.dirQ; S.dir.page = 0; }
      if (o.clearMatch) { S.match.q = ''; S.match.results = null; S.match.busy = false; }
      render();
    },
    // Type an example need and run the ranking, so the deck can show the AI
    // working rather than an empty form. Resolves once results are on screen.
    runMatch: function (i) {
      S.screen = 'matching';
      S.match.q = label(EXAMPLES[i || 0]);
      S.match.results = null;
      S.match.busy = true;
      render();
      return new Promise(function (res) {
        setTimeout(function () {
          S.match.busy = false;
          S.match.results = scoreMembers(S.match.q);
          render();
          res();
        }, 850);
      });
    }
  };
})();
