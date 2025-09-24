// SW — 5.10.0
const CACHE = 'ttpro-5.10.0';
const PRECACHE = [
  './','./index.html','./manifest.webmanifest?v=5.10.0',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png',
  './js/main.js?v=5.10.0','./css/app.css?v=5.10.0','./sw-reset.html',
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js'
];
self.addEventListener('install', (e)=>{ e.waitUntil((async()=>{ const c=await caches.open(CACHE); await c.addAll(PRECACHE); })()); self.skipWaiting(); });
self.addEventListener('activate',(e)=>{ e.waitUntil((async()=>{ for(const k of await caches.keys()){ if(k!==CACHE) await caches.delete(k);} })()); self.clients.claim(); });
self.addEventListener('fetch',(e)=>{
  const req=e.request;
  e.respondWith((async()=>{
    const cached=await caches.match(req,{ignoreSearch:true}); if(cached) return cached;
    try{ const net=await fetch(req,{cache:'no-store'}); const u=new URL(req.url);
      if(req.method==='GET'&&(u.origin===location.origin||u.hostname==='cdn.jsdelivr.net')){ (await caches.open(CACHE)).put(req, net.clone());}
      return net;
    }catch(err){
      const acc=req.headers.get('accept')||''; if(req.mode==='navigate'||acc.includes('text/html')){ const shell=await caches.match('./index.html',{ignoreSearch:true}); if(shell) return shell;}
      return new Response('Offline',{status:503});
    }
  })());
});
self.addEventListener('message', (e)=>{ if(e.data==='SKIP_WAITING') self.skipWaiting(); });
