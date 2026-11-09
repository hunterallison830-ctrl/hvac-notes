// hvac-v13: network-first for this site's files (always fresh when online), cache fallback when offline.
const V='v13',C='hvac-'+V,F=['./','index.html','style.css?v=13','app.js?v=13','tools.js?v=13','nameplate.js?v=13','scan.js?v=13','vendor/fb-catalog.js','vendor/fb-charge.js','vendor/firebase.js','vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tesseract/core/tesseract-core-lstm.wasm.js','vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js','vendor/tesseract/lang/eng.traineddata.gz','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))))});
// Pages from older caches can't reload themselves, so the first v8 activation reloads them once.
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(async k=>{const legacy=k.some(x=>/^hvac-v([1-7]|7t)$/.test(x));await Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)));await self.clients.claim();
 if(legacy)for(const w of await self.clients.matchAll({type:'window'}))w.navigate(w.url).catch(()=>{})}))});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
// Firestore / Google requests (other origins) go straight to the network.
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET'||new URL(q.url).origin!==self.location.origin)return;
 e.respondWith(fetch(q,{cache:'no-cache'}).then(n=>{if(n.ok){const cp=n.clone();caches.open(C).then(c=>c.put(q,cp))}return n})
  .catch(()=>caches.match(q).then(r=>r||caches.match(q,{ignoreSearch:true})).then(r=>r||(q.mode==='navigate'?caches.match('index.html'):Response.error()))))});
