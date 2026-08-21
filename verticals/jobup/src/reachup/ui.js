'use strict';

// =============================================================
// ReachUp admin UI — four server-rendered pages under /admin/marketing.
// One shell, one login panel (the existing jobup_admin owner credential), a tab
// bar, and the active tab's content. Every data call hits the requireOwner API.
// No emojis. Bilingual assets are shown EN and ES side by side so the reviewer
// gate (ES needs a bilingual_reviewer) is visible at a glance.
// =============================================================

const TABS = [
  ['audience', 'Audience'],
  ['studio', 'Studio'],
  ['queue', 'Queue'],
  ['campaigns', 'Campaigns'],
];

function shell(active, bodyHtml, tabScript, base) {
  const b = base || '';
  const nav = TABS.map(([id, label]) =>
    `<a class="tab${id === active ? ' on' : ''}" href="${b}/marketing/${id}">${label}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ReachUp — ${active[0].toUpperCase() + active.slice(1)}</title><style>
:root{--bg:#07080c;--card:#11141c;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.16);
--ink:#eef2f8;--mut:#9aa3b4;--faint:#6b7385;--cyan:#22d3ee;--red:#f87171;--grn:#34d399;--amber:#fbbf24;
--grad:linear-gradient(120deg,#22d3ee,#6366f1 55%,#8b5cf6);
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);min-height:100%}
body{color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:34px 22px}
h1{font-size:24px;font-weight:820;letter-spacing:-.03em;margin:0 0 3px}
.sub{color:var(--mut);font-size:13.5px;margin-bottom:20px}
.tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin-bottom:24px;flex-wrap:wrap}
.tab{padding:10px 16px;color:var(--mut);text-decoration:none;font-weight:650;font-size:14px;
border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--ink);border-bottom-color:var(--cyan)}
.tab:hover{color:var(--ink)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:18px}
.panel.slim{max-width:440px}
h2{font-size:12px;font-family:var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
margin:0 0 14px}
label{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
color:var(--faint);margin:12px 0 5px}
input,textarea,select{width:100%;background:var(--bg);border:1px solid var(--line2);border-radius:10px;
padding:11px 13px;color:var(--ink);font:inherit;outline:none}
textarea{min-height:90px;resize:vertical}
input:focus,textarea:focus,select:focus{border-color:var(--cyan)}
button{background:var(--grad);border:0;color:#06121a;font-weight:750;border-radius:999px;
padding:10px 20px;font:inherit;font-weight:750;cursor:pointer;margin-top:14px}
button.ghost{background:transparent;border:1px solid var(--line2);color:var(--ink)}
button.sm{padding:6px 13px;font-size:12.5px;margin:0 6px 0 0}
button:disabled{opacity:.5;cursor:not-allowed}
.err{color:var(--red);font-size:13.5px;margin-top:10px;min-height:18px}
.ok{color:var(--grn)}
.note{color:var(--faint);font-size:12.5px;font-family:var(--mono);margin-top:10px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;
color:var(--faint);padding:8px 9px;border-bottom:1px solid var(--line)}
td{padding:9px;border-bottom:1px solid var(--line);color:var(--mut);vertical-align:top}
.pill{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;
padding:2px 8px;border-radius:999px;border:1px solid var(--line2);color:var(--mut)}
.pill.draft{color:var(--mut)}.pill.pending_review{color:var(--amber);border-color:var(--amber)}
.pill.approved{color:var(--grn);border-color:var(--grn)}.pill.rejected{color:var(--red);border-color:var(--red)}
.pill.published{color:var(--cyan);border-color:var(--cyan)}
.pill.es{color:#c4b5fd;border-color:#8b5cf6}.pill.en{color:#7dd3fc;border-color:#0891b2}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:720px){.pair{grid-template-columns:1fr}}
.asset{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px}
.asset .body{white-space:pre-wrap;color:var(--ink);font-size:14px;margin:8px 0}
.hidden{display:none}
.flag{color:var(--amber);font-size:12px;font-family:var(--mono)}
</style></head><body><div class="wrap">
<h1>ReachUp</h1>
<div class="sub">JobUp marketing layer &mdash; audience, studio, approval, sending. Owner access only.</div>

<div id="login" class="panel slim hidden">
  <h2>Owner sign in</h2>
  <div class="note" style="margin:0 0 12px">Same credential as the JobUp platform console.</div>
  <label for="e">Owner email</label><input id="e" type="email" autocomplete="username">
  <label for="p">Admin password</label><input id="p" type="password" autocomplete="current-password">
  <button id="go">Sign in</button>
  <div class="err" id="lerr"></div>
</div>

<div id="app" class="hidden">
  <div class="tabs">${nav}</div>
  ${bodyHtml}
</div>
</div><script>
var ROOT=location.pathname.replace(/\\/admin\\/marketing.*$/,'');
var ADMIN=ROOT+'/admin';
var API=ROOT+'/api/v1/reachup';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function $(id){return document.getElementById(id);}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden');}
function showLogin(){$('app').classList.add('hidden');$('login').classList.remove('hidden');}
function api(path,opts){return fetch(API+path,Object.assign({headers:{'Content-Type':'application/json'}},opts||{}))
  .then(function(r){if(r.status===401||r.status===403){showLogin();throw new Error('auth');}return r.json();});}
function doLogin(){
  var err=$('lerr');err.textContent='';
  fetch(ADMIN+'/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:$('e').value,password:$('p').value})})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){if(!x.ok){err.textContent=(x.j.error||'Not authorised')+(x.j.note?' — '+x.j.note:'');return;}
      showApp();boot();})
    .catch(function(){err.textContent='Could not reach the server.';});
}
// Probe auth by hitting a guarded endpoint; 401 -> login.
function ensureAuth(){return api('/campaigns').then(function(){showApp();return true;})
  .catch(function(){return false;});}
${tabScript}
$('go').addEventListener('click',doLogin);
$('p').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
ensureAuth().then(function(ok){if(ok)boot();});
</script></body></html>`;
}

// ---- per-tab bodies + scripts ---------------------------------------------

function audienceTab(base) {
  const body = `
  <div class="panel">
    <h2>Capture test</h2>
    <div class="note" style="margin-top:0">POST /api/v1/reachup/capture &mdash; writes a subscriber and an email_marketing consent atomically.</div>
    <div class="pair">
      <div><label>Email</label><input id="c_email" type="email" placeholder="name@example.com"></div>
      <div><label>Language</label><select id="c_lang"><option value="en">English</option><option value="es">Espanol</option></select></div>
    </div>
    <div class="pair">
      <div><label>First name</label><input id="c_first"></div>
      <div><label>UTM source</label><input id="c_utm" placeholder="linkedin"></div>
    </div>
    <button id="c_go" class="sm" style="margin-top:16px">Capture</button>
    <span id="c_msg" class="note"></span>
  </div>

  <div class="panel">
    <h2>Import (quarantined)</h2>
    <div class="note" style="margin-top:0">One email per line. Imports land QUARANTINED and are never sendable until released with consent provenance and your admin id.</div>
    <textarea id="imp_rows" placeholder="a@example.com&#10;b@example.com"></textarea>
    <button id="imp_go" class="sm" style="margin-top:12px">Create batch</button>
    <span id="imp_msg" class="note"></span>
    <div id="batches" style="margin-top:16px"></div>
  </div>

  <div class="panel">
    <h2>Subscribers</h2>
    <div id="subs"></div>
  </div>`;
  const script = `
  function boot(){loadBatches();loadSubs();}
  function loadSubs(){api('/subscribers-list').then(function(o){
    var rows=(o.subscribers||[]);
    $('subs').innerHTML=rows.length?('<table><tr><th>Email</th><th>Lang</th><th>Stage</th><th>Source</th><th>State</th></tr>'+
      rows.map(function(s){return '<tr><td>'+esc(s.email)+'</td><td>'+esc(s.language)+'</td><td>'+esc(s.lifecycle_stage)+'</td><td>'+esc(s.source||'')+'</td><td>'+(s.quarantined?'<span class="pill amber">quarantined</span>':(s.suppressed?'<span class="pill rejected">suppressed</span>':'<span class="pill approved">active</span>'))+'</td></tr>';}).join('')+'</table>')
      :'<div class="note">No subscribers yet.</div>';
  }).catch(function(){});}
  function loadBatches(){api('/import-batches').then(function(o){
    var rows=(o.batches||[]);
    $('batches').innerHTML=rows.length?rows.map(function(b){
      var rel=b.status==='quarantined'?('<div style="margin-top:8px"><input id="pv_'+b.id+'" placeholder="Consent provenance (where/when they opted in)" style="margin-bottom:8px"><button class="sm" onclick="release('+b.id+')">Release batch</button></div>'):'';
      return '<div class="asset"><span class="pill '+(b.status==='released'?'approved':'pending_review')+'">'+esc(b.status)+'</span> batch #'+b.id+' &mdash; '+b.row_count+' rows'+(b.released_by?(' &mdash; released by '+esc(b.released_by)):'')+rel+'</div>';
    }).join(''):'<div class="note">No import batches.</div>';
  }).catch(function(){});}
  window.release=function(id){var pv=$('pv_'+id).value;
    api('/import-batches/'+id+'/release',{method:'POST',body:JSON.stringify({provenance_text:pv})})
    .then(function(r){if(!r.ok){alert(r.error||'Release failed');return;}loadBatches();loadSubs();}).catch(function(){});};
  $('c_go').addEventListener('click',function(){
    $('c_msg').textContent='';
    api('/capture',{method:'POST',body:JSON.stringify({email:$('c_email').value,language:$('c_lang').value,first_name:$('c_first').value,utm_source:$('c_utm').value,source:'admin_test'})})
    .then(function(r){$('c_msg').innerHTML=r.ok?'<span class="ok">Captured #'+r.subscriber_id+'</span>':esc(r.error||'failed');loadSubs();}).catch(function(){});});
  $('imp_go').addEventListener('click',function(){
    var rows=$('imp_rows').value.split('\\n').map(function(l){return {email:l.trim()};}).filter(function(r){return r.email;});
    api('/subscribers/import',{method:'POST',body:JSON.stringify({rows:rows})})
    .then(function(r){$('imp_msg').innerHTML=r.ok?'<span class="ok">Quarantined batch #'+r.batch_id+' ('+r.row_count+')</span>':esc(r.error||'failed');loadBatches();}).catch(function(){});});`;
  return shell('audience', body, script, base);
}

function studioTab(base) {
  const body = `
  <div class="panel">
    <h2>Generate from a brief</h2>
    <div class="note" style="margin-top:0">Produces three asset types (subject, body, caption), each in English and Spanish generated INDEPENDENTLY. Banned-phrase or emoji output is rejected, regenerated once, then flagged for a human.</div>
    <label>Brief</label>
    <textarea id="brief" placeholder="Announce the new AI job-match digest to free subscribers and invite them to upgrade."></textarea>
    <button id="gen">Generate</button>
    <span id="gmsg" class="note"></span>
  </div>
  <div id="out"></div>`;
  const script = `
  function boot(){loadAssets();}
  function assetCard(a){
    return '<div class="asset"><span class="pill '+a.language+'">'+a.language.toUpperCase()+'</span> '+
      '<span class="pill">'+esc(a.type)+'</span> <span class="pill '+a.status+'">'+esc(a.status)+'</span> '+
      (a.flagged?'<span class="flag">flagged for human rewrite</span>':'')+
      (a.is_simulated?'<span class="flag"> heuristic (no model)</span>':'')+
      '<div class="body">'+esc(a.body)+'</div>'+
      (a.status==='draft'||a.status==='pending_review'?'<button class="sm" onclick="submitA('+a.id+')">Submit for review</button>':'')+
      '</div>';
  }
  function loadAssets(){api('/assets').then(function(o){
    var by={};(o.assets||[]).forEach(function(a){(by[a.type]=by[a.type]||[]).push(a);});
    var types=['email_subject','email_body','social_caption'];
    $('out').innerHTML=types.filter(function(t){return by[t];}).map(function(t){
      var list=by[t].sort(function(x,y){return x.language<y.language?-1:1;});
      return '<div class="panel"><h2>'+esc(t)+'</h2><div class="pair">'+
        list.map(function(a){return assetCard(a);}).join('')+'</div></div>';
    }).join('')||'<div class="note">No assets yet. Generate from a brief above.</div>';
  }).catch(function(){});}
  window.submitA=function(id){api('/assets/'+id+'/submit',{method:'POST',body:'{}'}).then(function(){loadAssets();}).catch(function(){});};
  $('gen').addEventListener('click',function(){
    var b=$('brief').value.trim();if(!b){$('gmsg').textContent='Write a brief first.';return;}
    $('gen').disabled=true;$('gmsg').textContent='Generating six assets...';
    api('/briefs/generate',{method:'POST',body:JSON.stringify({prompt:b})})
    .then(function(r){$('gen').disabled=false;
      $('gmsg').innerHTML=r.ok?'<span class="ok">Generated brief #'+r.brief_id+'</span>':esc((r.halted?r.error:r.error)||'failed');
      loadAssets();}).catch(function(){$('gen').disabled=false;});});`;
  return shell('studio', body, script, base);
}

function queueTab(base) {
  const body = `
  <div class="panel">
    <h2>Approval queue</h2>
    <div class="note" style="margin-top:0">An asset cannot be published until approved. A SPANISH asset can only be approved by a bilingual_reviewer &mdash; enforced server-side, not here.</div>
    <div id="queue"></div>
  </div>`;
  const script = `
  function boot(){loadQ();}
  function card(a){
    return '<div class="asset"><span class="pill '+a.language+'">'+a.language.toUpperCase()+'</span> '+
      '<span class="pill">'+esc(a.type)+'</span> <span class="pill '+a.status+'">'+esc(a.status)+'</span>'+
      (a.language==='es'?' <span class="note" style="display:inline">requires bilingual_reviewer</span>':'')+
      '<div class="body">'+esc(a.body)+'</div>'+
      '<button class="sm" onclick="appr('+a.id+')">Approve</button>'+
      '<button class="sm ghost" onclick="rej('+a.id+')">Reject</button>'+
      '<span id="m_'+a.id+'" class="note" style="display:inline"></span></div>';
  }
  function loadQ(){api('/assets?status=pending_review').then(function(o){
    var rows=(o.assets||[]);
    $('queue').innerHTML=rows.length?rows.map(card).join(''):'<div class="note">Nothing awaiting review.</div>';
  }).catch(function(){});}
  window.appr=function(id){api('/assets/'+id+'/approve',{method:'POST',body:'{}'}).then(function(r){
    if(!r.ok){$('m_'+id).textContent=' '+(r.error||'blocked');return;}loadQ();}).catch(function(){});};
  window.rej=function(id){var why=prompt('Reason for rejection?')||'unspecified';
    api('/assets/'+id+'/reject',{method:'POST',body:JSON.stringify({reason:why})}).then(function(){loadQ();}).catch(function(){});};`;
  return shell('queue', body, script, base);
}

function campaignsTab(base) {
  const body = `
  <div class="panel">
    <h2>Build a test audience</h2>
    <div class="note" style="margin-top:0">Emails, one per line. Only matching, consented, non-suppressed subscribers receive a send.</div>
    <textarea id="aud_emails" placeholder="a@example.com&#10;b@example.com"></textarea>
    <label>Audience name</label><input id="aud_name" placeholder="Launch test">
    <button id="aud_go" class="sm" style="margin-top:12px">Create audience</button>
    <span id="aud_msg" class="note"></span>
  </div>
  <div class="panel">
    <h2>New campaign</h2>
    <div class="pair">
      <div><label>Name</label><input id="cm_name" placeholder="Launch email"></div>
      <div><label>Stream</label><select id="cm_stream"><option value="marketing">marketing</option><option value="cold">cold</option></select></div>
    </div>
    <div class="pair">
      <div><label>Audience id</label><input id="cm_aud" type="number"></div>
      <div><label>Approved subject asset id</label><input id="cm_subj" type="number"></div>
    </div>
    <label>Approved body asset id</label><input id="cm_body" type="number">
    <label style="margin-top:14px"><input type="checkbox" id="cm_dry" style="width:auto;margin-right:8px" checked>Dry run (record recipients, send nothing)</label>
    <div><button id="cm_go">Create and send</button></div>
    <span id="cm_msg" class="note"></span>
  </div>
  <div class="panel"><h2>Campaigns</h2><div id="camps"></div></div>`;
  const script = `
  function boot(){loadCamps();}
  function loadCamps(){api('/campaigns').then(function(o){
    var rows=(o.campaigns||[]);
    $('camps').innerHTML=rows.length?('<table><tr><th>Name</th><th>Stream</th><th>Status</th><th>Sent</th><th>Suppressed</th></tr>'+
      rows.map(function(c){return '<tr><td>'+esc(c.name)+'</td><td>'+esc(c.stream)+'</td><td><span class="pill '+(c.status==='sent'?'approved':'draft')+'">'+esc(c.status)+'</span></td><td>'+(c.sent_count||0)+'</td><td>'+(c.suppressed_count||0)+'</td></tr>';}).join('')+'</table>')
      :'<div class="note">No campaigns yet.</div>';
  }).catch(function(){});}
  $('aud_go').addEventListener('click',function(){
    var emails=$('aud_emails').value.split('\\n').map(function(l){return l.trim().toLowerCase();}).filter(Boolean);
    api('/audiences',{method:'POST',body:JSON.stringify({name:$('aud_name').value||'Test audience',definition:{emails:emails}})})
    .then(function(r){$('aud_msg').innerHTML=r.ok?'<span class="ok">Audience #'+r.audience_id+' ('+emails.length+' emails)</span>':esc(r.error||'failed');
      if(r.ok)$('cm_aud').value=r.audience_id;}).catch(function(){});});
  $('cm_go').addEventListener('click',function(){
    $('cm_go').disabled=true;$('cm_msg').textContent='Sending...';
    api('/email/campaigns',{method:'POST',body:JSON.stringify({name:$('cm_name').value||'Campaign',
      stream:$('cm_stream').value,audience_id:parseInt($('cm_aud').value,10)||null,
      subject_asset_id:parseInt($('cm_subj').value,10)||null,body_asset_id:parseInt($('cm_body').value,10)||null,
      send:true,dry_run:$('cm_dry').checked})})
    .then(function(r){$('cm_go').disabled=false;
      $('cm_msg').innerHTML=r.ok?('<span class="ok">Done &mdash; sent '+(r.sent||0)+', suppressed '+(r.suppressed||0)+', skipped '+(r.skipped||0)+(r.stream_configured?'':' (stream domain not configured)')+'</span>'):esc(r.error||'failed');
      loadCamps();}).catch(function(){$('cm_go').disabled=false;});});`;
  return shell('campaigns', body, script, base);
}

function render(tab, base) {
  if (tab === 'studio') return studioTab(base);
  if (tab === 'queue') return queueTab(base);
  if (tab === 'campaigns') return campaignsTab(base);
  return audienceTab(base);
}

module.exports = { render };
