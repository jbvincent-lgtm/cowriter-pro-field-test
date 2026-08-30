const SCOPE_PATH=new URL(self.registration.scope).pathname;
const CHANNEL='collab-alpha';
const CACHE_PREFIX=`co-writer-${CHANNEL}-`;
const CACHE=`${CACHE_PREFIX}0.6.3-r1`;
const ownsCache=key=>key.startsWith(CACHE_PREFIX)||(CHANNEL==='stable'&&/^co-writer-\d/.test(key));
const SHELL=['./','./index.html','./assets/cowriter.css','./assets/cowriter.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&ownsCache(key)).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(cached=>{const fresh=fetch(event.request).then(response=>{if(response.ok)cache.put(event.request,response.clone());return response;}).catch(()=>cached||cache.match('./index.html'));return cached||fresh;})));});
