// JobProof – service worker web appky (offline spustenie na stavbe bez signálu).
//
// Šablóna: VERZIU a zoznam súborov doplní po `flutter build web` skript
// tool/web/po_builde.py (bez neho appka offline nefunguje – web.yml ho spúšťa vždy).
//
// Stratégia:
// - inštalácia: stiahne „jadro“ appky (index, bootstrap, main.dart.js, CanvasKit, assets)
//   do cache jobproof-app-<verzia>; nová verzia appky = nový obsah tohto súboru →
//   iOS/prehliadač nainštaluje nový service worker a starú cache zmaže
// - navigácia: vždy index.html z cache (rýchly štart aj bez siete), sieť len ako záloha
// - ostatné súbory appky: z cache, inak zo siete (a uložia sa)
// - písma z fonts.gstatic.com (Flutter si ich sťahuje sám): po prvom stiahnutí z cache
// - všetko ostatné (Supabase API, Storage, Edge Functions) ide vždy na sieť, nič sa
//   necachuje – dáta appky drží lokálna databáza, nie service worker
const VERZIA = '43444ea8c9b926dd';
const JADRO = ["assets/AssetManifest.bin", "assets/AssetManifest.bin.json", "assets/FontManifest.json", "assets/fonts/MaterialIcons-Regular.otf", "assets/fonts/fallback/Roboto-Regular.ttf", "assets/shaders/ink_sparkle.frag", "assets/shaders/stretch_effect.frag", "canvaskit/canvaskit.js", "canvaskit/canvaskit.wasm", "favicon.png", "flutter.js", "flutter_bootstrap.js", "icons/Icon-192.png", "icons/Icon-512.png", "icons/Icon-maskable-192.png", "icons/Icon-maskable-512.png", "icons/apple-touch-icon.png", "index.html", "main.dart.js", "manifest.json", "version.json"];
const CACHE = 'jobproof-app-' + VERZIA;
const PISMA = 'jobproof-pisma';
const ROZSAH = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(JADRO.map((p) => new Request(new URL(p, ROZSAH), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('jobproof-app-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function zCacheAleboSiet(request, nazovCache) {
  const cache = await caches.open(nazovCache);
  const hit = await cache.match(request, { ignoreSearch: nazovCache === CACHE });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === ROZSAH.origin && url.pathname.startsWith(ROZSAH.pathname)) {
    if (req.mode === 'navigate') {
      event.respondWith(
        caches.open(CACHE)
          .then((c) => c.match(new URL('index.html', ROZSAH)))
          .then((hit) => hit || fetch(req)),
      );
      return;
    }
    event.respondWith(zCacheAleboSiet(req, CACHE));
    return;
  }

  if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(zCacheAleboSiet(req, PISMA));
  }
  // ostatné požiadavky (Supabase) service worker nespracúva → priamo na sieť
});
