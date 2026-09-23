const SCOPE_PATH=new URL(self.registration.scope).pathname;
const CHANNEL='guided-review';
const CACHE_PREFIX=`co-writer-${CHANNEL}-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE=`${CACHE_PREFIX}0.6.7-r2-b9b7b0d598d1`;
const ownsCache=key=>key.startsWith(CACHE_PREFIX);
const SHELL=['./','./index.html','./assets/cowriter.css?v=0.6.7-r2-b9b7b0d598d1','./assets/cowriter.js?v=0.6.7-r2-b9b7b0d598d1','./manifest.webmanifest','./icon-192.png','./icon-512.png','./THIRD-PARTY-NOTICES.txt'];
// A new shell activates after existing windows close; never swap a live editor's runtime.
const shellURLs=new Set(SHELL.map(file=>new URL(file,self.registration.scope).href));
const indexURL=new URL('./index.html',self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&ownsCache(key)).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type!=='CHECK_OFFLINE_SHELL'||!event.ports[0])return;
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    const present=await Promise.all([...shellURLs].map(url=>cache.match(url)));
    event.ports[0].postMessage({ready:present.every(Boolean),missing:present.filter(value=>!value).length});
  }).catch(()=>event.ports[0].postMessage({ready:false})));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const notebookPage=event.request.mode==='navigate'&&(url.pathname===SCOPE_PATH||url.pathname===new URL(indexURL).pathname);
  if(notebookPage){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(indexURL))||fetch(event.request)));return;}
  // Only known shell files belong in this cache. APIs, media and unknown paths stay ordinary requests.
  if(!shellURLs.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(cached=>cached||fetch(event.request))));
});
