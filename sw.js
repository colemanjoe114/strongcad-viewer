/* Offline-Speicher: App und Bausteine liegen im Gerät. Erst aus dem Netz (immer der neueste Stand), ohne Netz aus dem Speicher.
   Häuser (.glb) kommen per Datei und werden hier nie gespeichert. */
const STAND = "scv-1";
const DATEIEN = [
  "./", "index.html", "app.js", "buehne.js", "speicher.js", "ar.js", "messen.js", "stil.css", "manifest.webmanifest",
  "symbol.svg", "symbol-180.png", "symbol-512.png",
  "lib/three/build/three.module.js",
  "lib/three/examples/jsm/controls/OrbitControls.js",
  "lib/three/examples/jsm/exporters/USDZExporter.js",
  "lib/three/examples/jsm/libs/basis/basis_transcoder.js",
  "lib/three/examples/jsm/libs/basis/basis_transcoder.wasm",
  "lib/three/examples/jsm/libs/fflate.module.js",
  "lib/three/examples/jsm/libs/ktx-parse.module.js",
  "lib/three/examples/jsm/libs/zstddec.module.js",
  "lib/three/examples/jsm/loaders/GLTFLoader.js",
  "lib/three/examples/jsm/loaders/KTX2Loader.js",
  "lib/three/examples/jsm/math/ColorSpaces.js",
  "lib/three/examples/jsm/objects/Sky.js",
  "lib/three/examples/jsm/utils/BufferGeometryUtils.js",
  "lib/three/examples/jsm/utils/WorkerPool.js",
  "lib/meshoptimizer/meshopt_decoder.mjs",
  "lib/three-mesh-bvh/build/index.module.js",
];

self.addEventListener("install", (ev) => {
  /* nacheinander laden – schont kleine Server und schwaches Netz */
  ev.waitUntil(caches.open(STAND).then(async (c) => { for (const d of DATEIEN) await c.add(d); }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  /* ältere Stände dieser App freigeben */
  ev.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n.startsWith("scv-") && n !== STAND).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (ev) => {
  const r = ev.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith("/haeuser/") || u.pathname.endsWith(".glb")) return;
  /* bei abgewiesener Verbindung zweimal kurz neu versuchen, dann aus dem Speicher */
  const hole = (n) => fetch(r).catch((f) => (n > 0 ? new Promise((ok) => setTimeout(ok, 150)).then(() => hole(n - 1)) : Promise.reject(f)));
  ev.respondWith(
    hole(2).then((antwort) => {
      if (antwort && antwort.ok && antwort.type === "basic") {
        const kopie = antwort.clone();
        caches.open(STAND).then((c) => c.put(u.pathname === "/" ? "./" : r, kopie)).catch(() => {});
      }
      return antwort;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then((t) => t || caches.match("index.html")))
  );
});
