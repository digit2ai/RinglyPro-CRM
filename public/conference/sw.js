/* Build With AI: network first, cache fallback, so pages work offline after the first visit and edits show up immediately when online. */
var CACHE = "bwa-v1";
var FILES = ["./","program/","keynote/","script/","workshop/","join/","checklist/","qr/",
  "assets/site.css","assets/site.js","assets/config.js","assets/slides.js","assets/qr-join.svg"];
self.addEventListener("install", function(e){ e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); }).catch(function(){})); self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);})); })); self.clients.claim(); });
self.addEventListener("fetch", function(e){
  if(e.request.method!=="GET") return;
  e.respondWith(fetch(e.request).then(function(r){ if(r && r.ok && new URL(e.request.url).origin===location.origin){ var c=r.clone(); caches.open(CACHE).then(function(cc){ cc.put(e.request,c); }); } return r; })
    .catch(function(){ return caches.match(e.request).then(function(m){ return m || caches.match(e.request.url.replace(/index\.html$/,"")); }); }));
});
