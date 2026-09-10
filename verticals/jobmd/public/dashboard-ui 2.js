/* ── JobMD.io dashboard — the ONE renderer the real app and the simulator
   both run. Not a mock of the dashboards: literally the functions that draw
   them, so a demo can never show a screen the product does not have.

   The only thing that differs between the two hosts is the TRANSPORT. The real
   app points it at the API; the simulator points it at fixtures built from the
   seeded demo rows and the live matching engine. Nothing in this file knows
   which one it is talking to, and nothing in it can reach the network on its
   own — `api()` throws until a host installs a transport, so a simulator page
   that forgot to stub something fails loudly instead of quietly calling the
   real API with a prospect watching.
   ------------------------------------------------------------------------ */
var ME=null, REF=null;
var API_TRANSPORT=null;
function setApiTransport(fn){ API_TRANSPORT=fn; }
function api(p,opt){
  if(!API_TRANSPORT) return Promise.reject(new Error('no API transport installed'));
  return API_TRANSPORT(p,opt||{});
}
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
function money(n){return n==null?'':'$'+Number(n).toLocaleString();}

// The seven dimension bars. Short labels, because seven full names do not fit.
var SHORT={'Clinical Match':'CLIN','Technology Match':'TECH','Geographic Match':'GEO',
  'Career Match':'CAREER','Compensation Match':'COMP','Availability Match':'AVAIL',
  'Cultural / Professional Match':'CULT'};
function dimsHtml(dims){
  return '<div class="dims">'+dims.map(function(d){
    return '<div class="dim" title="'+esc(d.dimension+' — '+d.evaluates)+'">'+
      '<div class="n">'+d.score+'</div><div class="b"><i style="width:'+d.score+'%"></i></div>'+
      '<div class="l">'+esc(SHORT[d.dimension]||d.dimension)+'</div></div>';}).join('')+'</div>';
}
function whyHtml(reasons,gaps){
  var h='<div class="why">';
  if(reasons.length) h+='<b>Why this scored well</b><ul>'+reasons.map(function(r){
    return '<li>'+esc(r)+'</li>';}).join('')+'</ul>';
  if(gaps.length) h+='<b style="display:block;margin-top:10px">Gaps</b><ul>'+gaps.map(function(g){
    return '<li class="gap">'+esc(g)+'</li>';}).join('')+'</ul>';
  if(!reasons.length&&!gaps.length) h+='<span class="sub">No notable reasons either way.</span>';
  return h+'</div>';
}

// ── PHYSICIAN ─────────────────────────────────────────────────────────────
function completenessHtml(c){
  return '<h3>Profile completeness</h3><div class="bar"><i style="width:'+c.percent+'%"></i></div>'+
    '<p class="sub">'+c.percent+'% complete'+(c.missing.length?
      ' &mdash; still needed: <b>'+esc(c.missing.join(', ').replace(/_/g,' '))+'</b>':' &mdash; nothing missing')+'</p>';
}
function refreshCompleteness(c){
  ME.completeness=c;
  var el=$('compcard'); if(el) el.innerHTML=completenessHtml(c);
}
function renderPhysician(){
  var c=ME.completeness||{percent:0,missing:[]};
  $('root').innerHTML=
   '<h1>Welcome, '+esc(ME.account.name)+'</h1>'+
   '<p class="sub">Your Talent Intelligence Record is what every match is computed from. '+
   'The more of it you fill in, the more accurate your matches.</p>'+
   '<div class="card" id="compcard" style="margin-top:20px">'+completenessHtml(c)+'</div>'+
   '<div class="tabs"><button class="tab on" data-t="matches">My matches</button>'+
   '<button class="tab" data-t="profile">My profile</button>'+
   '<button class="tab" data-t="cv">Read my CV</button></div>'+
   '<div id="pane"></div>';
  bindTabs(function(t){ if(t==='matches')paneMatches(); else if(t==='profile')paneProfile(); else paneCv(); });
  paneMatches();
}
function paneMatches(){
  $('pane').innerHTML='<p class="sub" style="margin-top:18px">Scoring&hellip;</p>';
  api('/matches').then(function(d){
    if(!d.items.length){
      $('pane').innerHTML='<div class="empty">'+esc(d.message||'No open positions match your profile yet.')+'</div>';
      return;
    }
    $('pane').innerHTML='<h2>'+d.items.length+' open position'+(d.items.length===1?'':'s')+', scored against your profile</h2>'+
      '<p class="sub">Every score comes with the reasons behind it and the gaps. Nothing is hidden.</p>'+
      d.items.map(function(m){
        var p=m.position;
        return '<div class="match"><header><div style="flex:1">'+
          '<h3>'+esc(p.title)+'</h3>'+
          '<div class="meta">'+esc(p.organization?p.organization.name:'')+
            (p.city?' &middot; '+esc(p.city)+', '+esc(p.state):'')+
            ' &middot; '+esc(p.specialty)+
            (p.compensation_min?' &middot; '+money(p.compensation_min)+'&ndash;'+money(p.compensation_max):'')+
          '</div></div><div style="text-align:right"><div class="score">'+m.score+'</div>'+
          '<div class="meta">/100</div></div></header>'+
          dimsHtml(m.dimensions)+
          '<details><summary>Why this score</summary>'+whyHtml(m.reasons,m.gaps)+'</details>'+
          (m.stage
            ? '<p class="sub" style="margin-top:12px">You are in this pipeline &mdash; current stage: <span class="stage">'+esc(m.stage)+'</span></p>'
            : '<button class="btn p s" style="margin-top:12px" data-apply="'+p.id+'">I am interested</button>')+
          '</div>';
      }).join('');
    [].forEach.call(document.querySelectorAll('[data-apply]'),function(b){
      b.addEventListener('click',function(){
        var id=this.getAttribute('data-apply'); this.disabled=true; this.textContent='Sending...';
        api('/apply',{method:'POST',body:JSON.stringify({position_id:id})})
          .then(function(){paneMatches();})
          .catch(function(e){ b.disabled=false; b.textContent=e.message; });
      });
    });
  }).catch(function(e){ $('pane').innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
}
function field(id,label,val,type){
  return '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(val==null?'':val)+'">';
}
function paneProfile(){
  api('/profile').then(function(d){
    var p=d.profile||{};
    $('pane').innerHTML='<div class="card" style="margin-top:18px"><h3>Talent Intelligence Record</h3>'+
      '<label for="specialty">Specialty</label><select id="specialty"><option value="">Choose&hellip;</option>'+
        d.specialties.map(function(s){return '<option'+(p.specialty===s?' selected':'')+'>'+esc(s)+'</option>';}).join('')+
      '</select>'+
      '<div class="row">'+field('years_experience','Years of experience',p.years_experience,'number')+
        field('publications','Publications',p.publications,'number')+'</div>'+
      '<div class="chk"><input type="checkbox" id="board_certified"'+(p.board_certified?' checked':'')+
        '><label for="board_certified" style="margin:0">Board certified</label></div>'+
      field('licenses','Licensed in (state codes, comma separated)',(p.licenses||[]).join(', '))+
      field('robotic_platforms','Robotic platforms (comma separated)',(p.robotic_platforms||[]).join(', '))+
      '<div class="row">'+field('robotic_years','Years robotic',p.robotic_years,'number')+
        field('robotic_cases_annual','Robotic cases a year',p.robotic_cases_annual,'number')+'</div>'+
      '<div class="chk"><input type="checkbox" id="robotics_program_leadership"'+
        (p.robotics_program_leadership?' checked':'')+
        '><label for="robotics_program_leadership" style="margin:0">I have led a robotics programme</label></div>'+
      field('procedure_expertise','Procedures (comma separated)',(p.procedure_expertise||[]).join(', '))+
      field('geographic_preferences','Preferred states (comma separated)',(p.geographic_preferences||[]).join(', '))+
      '<div class="chk"><input type="checkbox" id="relocation_willing"'+(p.relocation_willing?' checked':'')+
        '><label for="relocation_willing" style="margin:0">Open to relocation</label></div>'+
      '<div class="row">'+field('compensation_expectation','Compensation expectation (USD)',p.compensation_expectation,'number')+
        field('available_from','Available from',p.available_from,'date')+'</div>'+
      '<div class="row"><div><label for="employment_preference">Employment preference</label>'+
        '<select id="employment_preference">'+['any','employed','independent','academic'].map(function(x){
          return '<option'+(p.employment_preference===x?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>'+
        '<div><label for="call_tolerance">Call tolerance</label><select id="call_tolerance">'+
        ['any','none','light','moderate'].map(function(x){
          return '<option'+(p.call_tolerance===x?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div></div>'+
      '<button class="btn p" id="save" style="margin-top:20px">Save profile</button>'+
      '<div class="msg" id="pmsg"></div></div>';
    $('save').addEventListener('click',function(){
      var b=this; b.disabled=true; b.textContent='Saving...';
      var list=function(id){return ($(id).value||'').split(',').map(function(s){return s.trim();}).filter(Boolean);};
      var num=function(id){var v=parseInt($(id).value,10);return isNaN(v)?null:v;};
      api('/profile',{method:'PUT',body:JSON.stringify({
        specialty:$('specialty').value||null, years_experience:num('years_experience'),
        publications:num('publications'), board_certified:$('board_certified').checked,
        licenses:list('licenses').map(function(s){return s.toUpperCase();}),
        robotic_platforms:list('robotic_platforms'), robotic_years:num('robotic_years'),
        robotic_cases_annual:num('robotic_cases_annual'),
        robotics_program_leadership:$('robotics_program_leadership').checked,
        procedure_expertise:list('procedure_expertise'),
        geographic_preferences:list('geographic_preferences').map(function(s){return s.toUpperCase();}),
        relocation_willing:$('relocation_willing').checked,
        compensation_expectation:num('compensation_expectation'),
        available_from:$('available_from').value||null,
        employment_preference:$('employment_preference').value,
        call_tolerance:$('call_tolerance').value })})
      .then(function(d){ refreshCompleteness(d.completeness);
        var m=$('pmsg'); m.className='msg ok'; m.textContent='Saved. Your matches have been rescored.';
        b.disabled=false; b.textContent='Save profile'; })
      .catch(function(e){ var m=$('pmsg'); m.className='msg err'; m.textContent=e.message;
        b.disabled=false; b.textContent='Save profile'; });
    });
  });
}
function paneCv(){
  $('pane').innerHTML='<div class="card" style="margin-top:18px"><h3>Read my CV</h3>'+
    '<p class="sub">Paste your CV. We read it and <b>propose</b> values &mdash; nothing is saved until you '+
    'press apply, and anything we could not find is listed so you can fill it in yourself.</p>'+
    '<textarea id="cvtext" placeholder="Paste the text of your CV here"></textarea>'+
    '<button class="btn p" id="read" style="margin-top:14px">Read it</button>'+
    '<div id="cvout"></div></div>';
  $('read').addEventListener('click',function(){
    var b=this; b.disabled=true; b.textContent='Reading...';
    api('/profile/cv',{method:'POST',body:JSON.stringify({text:$('cvtext').value})})
     .then(function(d){
       b.disabled=false; b.textContent='Read it';
       var f=d.fields, keys=Object.keys(f);
       var h='<div class="note" style="margin-top:18px"><b>Found '+keys.length+' field'+
         (keys.length===1?'':'s')+'.</b> '+esc(d.note)+'</div>';
       if(keys.length) h+='<div class="tablewrap"><table><thead><tr><th>Field</th><th>Value</th>'+
         '<th>Read from</th></tr></thead><tbody>'+keys.map(function(k){
           return '<tr><td>'+esc(k.replace(/_/g,' '))+'</td><td><b style="color:var(--ink)">'+
             esc(Array.isArray(f[k])?f[k].join(', '):f[k])+'</b></td><td>'+
             esc(d.evidence[k]||'')+'</td></tr>';}).join('')+'</tbody></table></div>';
       if(d.not_found.length) h+='<div class="note"><b>Not found in your CV:</b> '+
         esc(d.not_found.join(', ').replace(/_/g,' '))+'. Add these on the profile tab.</div>';
       if(f.specialty_candidates) h+='<div class="note"><b>Your CV names more than one specialty:</b> '+
         esc(f.specialty_candidates.join(', '))+'. We used the first; change it on the profile tab if that is wrong.</div>';
       if(keys.length) h+='<button class="btn p" id="applycv" style="margin-top:14px">Apply these to my profile</button>';
       $('cvout').innerHTML=h;
       var ac=$('applycv');
       if(ac) ac.addEventListener('click',function(){
         var payload={}; ['specialty','board_certified','years_experience','robotic_platforms',
           'robotic_years','robotic_cases_annual','licenses','fellowship','residency','publications',
           'leadership','robotics_program_leadership'].forEach(function(k){ if(f[k]!==undefined) payload[k]=f[k]; });
         ac.disabled=true; ac.textContent='Applying...';
         api('/profile',{method:'PUT',body:JSON.stringify(payload)})
          .then(function(d){ refreshCompleteness(d.completeness);
            ac.textContent='Applied — see the profile tab'; })
          .catch(function(e){ ac.disabled=false; ac.textContent=e.message; });
       });
     })
     .catch(function(e){ b.disabled=false; b.textContent='Read it';
       $('cvout').innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
  });
}

// ── HOSPITAL / RECRUITER ──────────────────────────────────────────────────
function renderEmployer(){
  var isRec=ME.account.role==='recruiter';
  $('root').innerHTML='<h1>'+(isRec?'Recruiter desk':esc(ME.organization?ME.organization.name:'Your hospital'))+'</h1>'+
   '<p class="sub">'+(isRec
      ? 'You see every candidate and every position across the platform.'
      : 'You see your own positions and the candidates on them.')+'</p>'+
   '<div class="tabs"><button class="tab on" data-t="pipe">Pipeline</button>'+
   '<button class="tab" data-t="pos">Positions</button>'+
   '<button class="tab" data-t="new">Post a position</button>'+
   '<button class="tab" data-t="copilot">Copilot</button>'+
   '<button class="tab" data-t="agents">Agent queue</button></div><div id="pane"></div>';
  bindTabs(function(t){ if(t==='pipe')panePipeline(); else if(t==='pos')panePositions();
    else if(t==='copilot')paneCopilot(); else if(t==='agents')paneAgents(); else paneNewPosition(); });
  panePipeline();
}
function panePipeline(){
  $('pane').innerHTML='<p class="sub" style="margin-top:18px">Loading&hellip;</p>';
  api('/pipeline').then(function(d){
    if(!d.items.length){
      $('pane').innerHTML='<div class="empty">Nobody is in the pipeline yet. '+
        'Candidates appear here when a physician expresses interest in one of your positions.</div>';
      return;
    }
    $('pane').innerHTML='<h2>'+d.items.length+' candidate'+(d.items.length===1?'':'s')+' in the pipeline</h2>'+
      '<div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Position</th><th>Stage</th>'+
      '<th>Move to</th></tr></thead><tbody>'+d.items.map(function(it){
        return '<tr><td><b style="color:var(--ink)">'+esc(it.candidate.name)+'</b><br>'+
          '<span style="font-size:12.5px">'+esc(it.candidate.specialty||'')+
          (it.candidate.years_experience?' &middot; '+it.candidate.years_experience+'y':'')+'</span></td>'+
          '<td>'+esc(it.position?it.position.title:'')+'<br><span style="font-size:12.5px">'+
          esc(it.position?(it.position.city||'')+' '+(it.position.state||''):'')+'</span></td>'+
          '<td><span class="stage">'+esc(it.stage)+'</span>'+
          (it.set_by_kind==='agent'?'<br><span style="font-size:11px;color:var(--teal)">set by an agent</span>':'')+'</td>'+
          '<td><select data-move="'+it.id+'">'+d.stages.map(function(s){
            return '<option'+(s===it.stage?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select>'+
          '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+
          '<button class="btn g s" data-draft="'+it.id+'">Draft outreach</button>'+
          '<button class="btn g s" data-slots="'+it.id+'">Propose times</button></div></td></tr>';
      }).join('')+'</tbody></table></div>'+
      '<div class="note"><b>Who may move a candidate.</b> You can move anyone to any stage. '+
      'An AI agent may only set the four stages its own function produces &mdash; '+
      d.agent_authority.filter(function(a){return a.maySet.length;}).map(function(a){
        return esc(a.agent)+' &rarr; '+esc(a.maySet.join(', '));}).join('; ')+
      '. No agent can move anyone to Offer, Credentialing or Placement.</div>';
    [].forEach.call(document.querySelectorAll('[data-draft],[data-slots]'),function(btn){
      btn.addEventListener('click',function(){
        var isDraft=this.hasAttribute('data-draft');
        var id=this.getAttribute(isDraft?'data-draft':'data-slots');
        btn.disabled=true; btn.textContent='Working...';
        api('/agents/'+(isDraft?'outreach':'schedule')+'/'+id,{method:'POST'})
         .then(function(){ btn.textContent='Added to the queue';
           setTimeout(function(){ [].forEach.call(document.querySelectorAll('.tab'),function(x){x.classList.remove('on');});
             var t=[].slice.call(document.querySelectorAll('.tab')).filter(function(x){return x.dataset.t==='agents';})[0];
             if(t){t.classList.add('on'); paneAgents();} },600); })
         .catch(function(e){ btn.disabled=false; btn.textContent=e.message; });
      });
    });
    [].forEach.call(document.querySelectorAll('[data-move]'),function(sel){
      sel.addEventListener('change',function(){
        var id=this.getAttribute('data-move'), v=this.value, self=this;
        self.disabled=true;
        api('/pipeline/'+id,{method:'PATCH',body:JSON.stringify({stage:v})})
          .then(function(){ panePipeline(); })
          .catch(function(e){ alert(e.message); self.disabled=false; });
      });
    });
  }).catch(function(e){ $('pane').innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
}
function panePositions(){
  $('pane').innerHTML='<p class="sub" style="margin-top:18px">Loading&hellip;</p>';
  api('/positions').then(function(d){
    if(!d.items.length){ $('pane').innerHTML='<div class="empty">No positions yet. Post one on the next tab.</div>'; return; }
    $('pane').innerHTML=d.items.map(function(p){
      return '<div class="match"><header><div style="flex:1"><h3>'+esc(p.title)+'</h3>'+
        '<div class="meta">'+esc(p.organization?p.organization.name:'')+
        (p.city?' &middot; '+esc(p.city)+', '+esc(p.state):'')+' &middot; '+esc(p.specialty)+
        (p.compensation_min?' &middot; '+money(p.compensation_min)+'&ndash;'+money(p.compensation_max):'')+
        (p.robotics_required?' &middot; robotics required':'')+'</div></div>'+
        '<button class="btn g s" data-cands="'+p.id+'">Ranked candidates</button></header>'+
        '<div id="c'+p.id+'"></div></div>';
    }).join('');
    [].forEach.call(document.querySelectorAll('[data-cands]'),function(b){
      b.addEventListener('click',function(){
        var id=this.getAttribute('data-cands'), box=$('c'+id);
        b.disabled=true; b.textContent='Ranking...';
        api('/positions/'+id+'/candidates').then(function(d){
          b.disabled=false; b.textContent='Ranked candidates';
          if(!d.items.length){ box.innerHTML='<div class="empty">No physician profiles to rank yet.</div>'; return; }
          box.innerHTML='<div class="tablewrap"><table><thead><tr><th>Score</th><th>Candidate</th>'+
            '<th>Why / gaps</th><th>Stage</th></tr></thead><tbody>'+d.items.map(function(m){
              return '<tr><td><span class="score" style="font-size:16px">'+m.score+'</span></td>'+
                '<td><b style="color:var(--ink)">'+esc(m.candidate.name)+'</b><br>'+
                '<span style="font-size:12.5px">'+esc(m.candidate.specialty||'')+
                (m.candidate.years_experience?' &middot; '+m.candidate.years_experience+'y':'')+
                (m.candidate.board_certified?' &middot; board certified':'')+'</span></td>'+
                '<td style="max-width:420px;font-size:12.5px">'+
                (m.reasons.length?esc(m.reasons[0]):'')+
                (m.gaps.length?'<br><span style="color:var(--warn)">'+esc(m.gaps[0])+'</span>':'')+'</td>'+
                '<td>'+(m.stage?'<span class="stage">'+esc(m.stage)+'</span>':'&mdash;')+'</td></tr>';
            }).join('')+'</tbody></table></div>';
        }).catch(function(e){ b.disabled=false; b.textContent='Ranked candidates';
          box.innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
      });
    });
  });
}
function paneNewPosition(){
  var orgSel='';
  var draw=function(orgs){
    $('pane').innerHTML='<div class="card" style="margin-top:18px"><h3>Post a position</h3>'+
      (orgs?'<label for="org_id">Organisation</label><select id="org_id">'+orgs.map(function(o){
        return '<option value="'+o.id+'">'+esc(o.name)+'</option>';}).join('')+'</select>':'')+
      '<label for="title">Title</label><input id="title" placeholder="Robotic General Surgeon">'+
      '<label for="specialty">Specialty</label><select id="specialty">'+
        REF.specialties.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>'+
      '<div class="row"><div><label for="city">City</label><input id="city"></div>'+
      '<div><label for="state">State</label><input id="state" maxlength="2" placeholder="FL"></div></div>'+
      '<div class="row"><div><label for="compensation_min">Comp min</label><input id="compensation_min" type="number"></div>'+
      '<div><label for="compensation_max">Comp max</label><input id="compensation_max" type="number"></div></div>'+
      '<div class="row"><div><label for="employment_model">Employment model</label><select id="employment_model">'+
        REF.employment_models.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select></div>'+
      '<div><label for="call_schedule">Call</label><select id="call_schedule">'+
        REF.call_levels.map(function(x){return '<option>'+x+'</option>';}).join('')+'</select></div></div>'+
      '<div class="row"><div><label for="min_years_experience">Minimum years</label>'+
        '<input id="min_years_experience" type="number" value="0"></div>'+
      '<div><label for="start_date">Start date</label><input id="start_date" type="date"></div></div>'+
      '<div class="chk"><input type="checkbox" id="robotics_required"><label for="robotics_required" style="margin:0">Robotic experience required</label></div>'+
      '<label for="robotic_platforms">Robotic platforms (comma separated)</label><input id="robotic_platforms">'+
      '<label for="procedures">Procedures (comma separated)</label><input id="procedures">'+
      '<button class="btn p" id="post" style="margin-top:18px">Post position</button>'+
      '<div class="msg" id="nmsg"></div></div>';
    $('post').addEventListener('click',function(){
      var b=this; b.disabled=true; b.textContent='Posting...';
      var list=function(id){return ($(id).value||'').split(',').map(function(s){return s.trim();}).filter(Boolean);};
      var num=function(id){var v=parseInt($(id).value,10);return isNaN(v)?null:v;};
      var body={title:$('title').value.trim(),specialty:$('specialty').value,
        city:$('city').value.trim(),state:$('state').value.trim().toUpperCase(),
        compensation_min:num('compensation_min'),compensation_max:num('compensation_max'),
        employment_model:$('employment_model').value,call_schedule:$('call_schedule').value,
        min_years_experience:num('min_years_experience')||0,start_date:$('start_date').value||null,
        robotics_required:$('robotics_required').checked,
        robotic_platforms:list('robotic_platforms'),procedures:list('procedures')};
      if($('org_id')) body.org_id=$('org_id').value;
      api('/positions',{method:'POST',body:JSON.stringify(body)})
       .then(function(){ var m=$('nmsg'); m.className='msg ok';
         m.textContent='Posted. It is now open and will appear in physician matches.';
         b.disabled=false; b.textContent='Post position'; })
       .catch(function(e){ var m=$('nmsg'); m.className='msg err'; m.textContent=e.message;
         b.disabled=false; b.textContent='Post position'; });
    });
  };
  if(ME.account.role==='recruiter') api('/organizations').then(function(d){draw(d.items);});
  else draw(null);
}

// ── Recruiter Copilot ─────────────────────────────────────────────────────
function paneCopilot(){
  $('pane').innerHTML='<div class="card" style="margin-top:18px"><h3>Ask in plain English</h3>'+
    '<p class="sub">It searches the physician records this platform actually holds. '+
    'Anything in your question it did not understand is listed back to you, so you never '+
    'have to guess which part was applied.</p>'+
    '<input id="q" placeholder="board certified urologists in Florida with more than 8 years">'+
    '<button class="btn p" id="ask" style="margin-top:14px">Search</button>'+
    '<div id="qout"></div></div>';
  var run=function(){
    var b=$('ask'); b.disabled=true; b.textContent='Searching...';
    api('/search',{method:'POST',body:JSON.stringify({q:$('q').value})})
     .then(function(d){
       b.disabled=false; b.textContent='Search';
       var h='<div class="note" style="margin-top:18px"><b>'+d.items.length+' of '+d.searched+
         ' physician record'+(d.searched===1?'':'s')+' matched.</b><br>'+
         (d.applied.length?'Filters applied: '+esc(d.applied.join('; '))+'.':'No filters were applied.')+
         (d.ignored.length?'<br><span style="color:var(--warn)">Not understood, and NOT filtered on: '+
           esc(d.ignored.join(', '))+'</span>':'')+'</div>';
       if(!d.items.length) h+='<div class="empty">Nothing matched. '+
         (d.searched===0?'There are no physician profiles on the platform yet.':'Try a broader question.')+'</div>';
       else h+='<div class="tablewrap"><table><thead><tr><th>Name</th><th>Specialty</th>'+
         '<th>Experience</th><th>Licensed</th><th>Robotic</th></tr></thead><tbody>'+
         d.items.map(function(x){
           return '<tr><td><b style="color:var(--ink)">'+esc(x.name)+'</b></td><td>'+esc(x.specialty||'')+'</td>'+
             '<td>'+(x.years_experience||'—')+(x.board_certified?' &middot; BC':'')+'</td>'+
             '<td>'+esc((x.licenses||[]).join(', ')||'—')+'</td>'+
             '<td>'+esc((x.robotic_platforms||[]).join(', ')||'—')+'</td></tr>';}).join('')+
         '</tbody></table></div>';
       $('qout').innerHTML=h;
     })
     .catch(function(e){ b.disabled=false; b.textContent='Search';
       $('qout').innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
  };
  $('ask').addEventListener('click',run);
  $('q').addEventListener('keydown',function(e){ if(e.key==='Enter') run(); });
}

// ── The agent queue: drafts, proposals and flags awaiting a person ────────
function paneAgents(){
  $('pane').innerHTML='<p class="sub" style="margin-top:18px">Loading&hellip;</p>';
  Promise.all([api('/agents/followup'),api('/agents/actions')]).then(function(r){
    var fu=r[0], acts=r[1];
    var h='<div class="note" style="margin-top:18px"><b>Nothing here is sent by the platform.</b> '+
      'Agents draft, propose and flag. You approve, and you send it yourself.</div>';

    h+='<h2>Follow-Up Agent</h2><p class="sub">'+esc(fu.note)+'</p>';
    if(!fu.items.length) h+='<div class="empty">Nothing has stalled.</div>';
    else h+='<div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Position</th>'+
      '<th>Stage</th><th>Waiting</th></tr></thead><tbody>'+fu.items.map(function(x){
        return '<tr><td>'+esc(x.candidate)+'</td><td>'+esc(x.position)+'</td>'+
          '<td><span class="stage">'+esc(x.stage)+'</span></td>'+
          '<td style="color:var(--warn)">'+x.days_in_stage+' days (limit '+x.threshold_days+')</td></tr>';
      }).join('')+'</tbody></table></div>';

    h+='<h2>Review queue</h2><p class="sub">'+esc(acts.note)+'</p>';
    if(!acts.items.length) h+='<div class="empty">No drafts yet. Open the Pipeline tab and ask an agent '+
      'to draft outreach or propose interview times for a candidate.</div>';
    else h+=acts.items.map(function(a){
      return '<div class="match"><header><div style="flex:1"><h3>'+esc(a.subject||a.kind)+'</h3>'+
        '<div class="meta">'+esc(a.agent)+' &middot; <span class="stage">'+esc(a.status)+'</span></div></div></header>'+
        '<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;color:var(--mut);'+
        'margin-top:12px;background:var(--bg2);padding:14px;border-radius:10px">'+esc(a.body)+'</pre>'+
        (a.payload&&a.payload.gaps_for_recruiter&&a.payload.gaps_for_recruiter.length
          ? '<div class="note"><b>Gaps to raise on the call</b> (deliberately not in the message): '+
            esc(a.payload.gaps_for_recruiter.join(' ')) +'</div>' : '')+
        (a.status==='draft'
          ? '<div style="margin-top:12px"><button class="btn p s" data-act="'+a.id+'" data-st="approved">Approve for sending</button>'+
            ' <button class="btn g s" data-act="'+a.id+'" data-st="discarded">Discard</button></div>'
          : '')+'</div>';
    }).join('');
    $('pane').innerHTML=h;
    [].forEach.call(document.querySelectorAll('[data-act]'),function(b){
      b.addEventListener('click',function(){
        b.disabled=true;
        api('/agents/actions/'+this.getAttribute('data-act'),
            {method:'PATCH',body:JSON.stringify({status:this.getAttribute('data-st')})})
         .then(paneAgents).catch(function(e){ b.disabled=false; alert(e.message); });
      });
    });
  }).catch(function(e){ $('pane').innerHTML='<div class="msg err" style="display:block">'+esc(e.message)+'</div>'; });
}

function bindTabs(fn){
  [].forEach.call(document.querySelectorAll('.tab'),function(t){
    t.addEventListener('click',function(){
      [].forEach.call(document.querySelectorAll('.tab'),function(x){x.classList.remove('on');});
      this.classList.add('on'); fn(this.getAttribute('data-t'));
    });
  });
}
