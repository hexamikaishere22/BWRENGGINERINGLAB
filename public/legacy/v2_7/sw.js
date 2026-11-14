const CACHE_VERSION='bwr-engineering-lab-v2.7';
const SHELL_CACHE=CACHE_VERSION+'-shell';
const RUNTIME_CACHE=CACHE_VERSION+'-runtime';
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(CACHE_VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin===self.location.origin){
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(SHELL_CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match('./index.html'))));return;
 }
 // Cache the external Three.js script after a successful first online load.
 if(url.hostname==='cdnjs.cloudflare.com'&&url.pathname.includes('/three.js/')){
  event.respondWith(caches.open(RUNTIME_CACHE).then(async cache=>{const cached=await cache.match(req);const fresh=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))cache.put(req,res.clone());return res}).catch(()=>null);return cached||await fresh||new Response('',{status:503,statusText:'Offline: 3D library unavailable'})}));
 }
});
