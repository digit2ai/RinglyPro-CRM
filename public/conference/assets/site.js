(function(){
  var E = window.EVENT || {};
  var KEY = "bwa-lang";
  function getLang(){ try{ return localStorage.getItem(KEY) || "en"; }catch(e){ return "en"; } }
  function setLang(l){ document.documentElement.lang = l; try{ localStorage.setItem(KEY,l); }catch(e){} 
    document.querySelectorAll(".lang-btn").forEach(function(b){ b.textContent = l==="en" ? "Español" : "English"; b.setAttribute("aria-label", l==="en" ? "Ver en español" : "View in English"); });
    document.dispatchEvent(new CustomEvent("langchange",{detail:l})); }
  window.BWA = { lang:getLang, setLang:setLang, t:function(o){ return o && typeof o==="object" ? (o[getLang()]||o.en) : o; } };
  document.documentElement.lang = getLang();

  var pages = [
    ["", {en:"Overview",es:"Inicio"}],
    ["program/", {en:"Program",es:"Programa"}],
    ["keynote/", {en:"Keynote",es:"Conferencia"}],
    ["script/", {en:"Script",es:"Guion"}],
    ["build/", {en:"Live build",es:"Construcción en vivo"}],
    ["join/", {en:"Audience page",es:"Página del público"}],
    ["checklist/", {en:"Checklist",es:"Lista previa"}]
  ];
  document.addEventListener("DOMContentLoaded", function(){
    var h = document.getElementById("site-header");
    if(h){
      var root = h.getAttribute("data-root") || "";
      var cur = h.getAttribute("data-page") || "";
      var nav = pages.map(function(p){
        return '<a href="'+root+p[0]+'"'+(p[0]===cur?' aria-current="page"':'')+'><span class="en">'+p[1].en+'</span><span class="es">'+p[1].es+'</span></a>';
      }).join("");
      h.innerHTML = '<div class="band"><div class="band-inner"><a class="brand" href="'+root+'">'+(E.title||"Build With AI")+'</a><nav class="nav" aria-label="Event pages">'+nav+'</nav><button class="lang-btn" type="button"></button></div></div>';
    }
    document.querySelectorAll("[data-ev]").forEach(function(el){
      var v = el.getAttribute("data-ev").split(".").reduce(function(o,k){return o&&o[k];}, E);
      if(v && typeof v==="object"){ el.innerHTML = '<span class="en">'+v.en+'</span><span class="es">'+v.es+'</span>'; } else if(v){ el.textContent = v; }
    });
    document.querySelectorAll("a[data-href]").forEach(function(a){ a.href = E[a.getAttribute("data-href")] || "#"; });
    document.querySelectorAll(".lang-btn").forEach(function(b){ b.addEventListener("click", function(){ setLang(getLang()==="en"?"es":"en"); }); });
    setLang(getLang());
  });

  /* offline after first visit */
  if("serviceWorker" in navigator && location.protocol.indexOf("http")===0){
    var s = document.currentScript && document.currentScript.src;
    if(s){ navigator.serviceWorker.register(s.replace(/assets\/site\.js.*$/,"sw.js")).catch(function(){}); }
  }
})();
