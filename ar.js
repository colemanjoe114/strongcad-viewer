/* AR am iPhone/iPad: im Gerät eine USDZ erzeugen und AR Quick Look öffnen.
   Mit Möbeln; Garten nur direkt ums Haus (Terrasse, Pflaster, Stufen, Gelände am Haus); ohne Nebengebäude und Bäume.
   USDZExporter kann kein KTX2 → einfache Materialien: je Material die mittlere Farbe; Netze mit Farbe je Punkt werden
   nach Farbe in Gruppen geteilt (je Gruppe ein Netz). Punkte in Gleitkomma, Weltlage, Maßstab 1:1. */
import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

export const istIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);

const OHNE = /nebengebäude/i;                          /* ganz weg */
const RAND = /garten|gelände|landschaft|außenanlage/i;  /* nur ums Haus */
export const GARTEN_RAND = 4;                          /* m um das Haus (waagerecht) */
const STUFEN = 24;                                     /* Farbstufen je Kanal bei Farbe je Punkt */

/** mittlere Farbe (linear) eines Materials */
function mittelfarbe(mat, geo) {
  const u = mat.userData || {};
  if (Array.isArray(u.mittelfarbe)) return new THREE.Color().setRGB(u.mittelfarbe[0], u.mittelfarbe[1], u.mittelfarbe[2]);
  const c = geo && geo.attributes.color;
  if (c) {
    let r = 0, g = 0, b = 0; const n = c.count, schritt = Math.max(1, Math.floor(n / 4000)); let k = 0;
    for (let i = 0; i < n; i += schritt) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); k++; }
    if (k) return new THREE.Color(r / k, g / k, b / k);
  }
  return mat.color ? mat.color.clone() : new THREE.Color(0.7, 0.7, 0.7);
}

/** Hausgröße wie in der Bühne: ohne Garten, Gelände, Nebengebäude, Möbel; Ebenen über 120 m sind Gelände-Boden */
export function hausBoxAus(ebenen) {
  const box = new THREE.Box3(), eb = new THREE.Box3(), s = new THREE.Vector3();
  for (const e of ebenen) {
    if (e.eltern || /garten|gelände|landschaft|neben|möbel/i.test(e.name)) continue;
    eb.makeEmpty();
    for (const n of e.netze) { n.updateWorldMatrix(true, false); eb.expandByObject(n); }
    if (eb.isEmpty()) continue;
    eb.getSize(s);
    if (Math.max(s.x, s.z) > 120) continue;
    box.union(eb);
  }
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 8, 10));
  return box;
}

/* sRGB-Stufe eines linearen Kanals → zurück linear (Stufen gleichmäßig fürs Auge) */
const stufe = (lin) => {
  const s = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(Math.max(0, lin), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * (STUFEN - 1));
};
const linear = (k) => { const s = k / (STUFEN - 1); return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };

/* Kurze Zahlen: der Exporter schreibt jede Zahl mit 7 Stellen (1.600000) als Text in die USDZ. Lage auf 1 mm und Richtungen
   auf 3 Stellen reichen für AR und machen die Datei gut ein Drittel kleiner. Der Exporter ruft getX/getY/getZ und darauf
   toPrecision() auf – dafür ein Zahl-Ersatz, der schon den kurzen Text liefert. */
class KurzZahl { constructor(t) { this.t = t; } toPrecision() { return this.t; } toString() { return this.t; } }
function kurzAttribut(arr, stellen) {
  const f = (v) => new KurzZahl(String(+v.toFixed(stellen)));
  return { count: arr.length / 3, itemSize: 3, getX: (i) => f(arr[i * 3]), getY: (i) => f(arr[i * 3 + 1]), getZ: (i) => f(arr[i * 3 + 2]) };
}

/** USDZ aus der Bühne bauen → Blob. B: {wurzel, ebenen[{name, anzeige, netze}], hausBox?}; opt.rand = Garten-Rand in m */
export async function baueUsdz(B, fortschritt = () => {}, opt = {}) {
  const rand = opt.rand ?? GARTEN_RAND;
  B.wurzel.updateMatrixWorld(true);
  const hb = B.hausBox && !B.hausBox.isEmpty() ? B.hausBox : hausBoxAus(B.ebenen);
  const x0 = hb.min.x - rand, x1 = hb.max.x + rand, z0 = hb.min.z - rand, z1 = hb.max.z + rand;
  const gruppen = new Map();
  const gruppe = (schl, neu) => { let g = gruppen.get(schl); if (!g) { g = Object.assign(neu(), { pos: [], nor: [], idx: [] }); gruppen.set(schl, g); } return g; };
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), farbe = new THREE.Color();
  let dreiecke = 0;
  for (const e of B.ebenen) {
    if (OHNE.test(e.name) || OHNE.test(e.anzeige || "")) continue;
    const nurRand = RAND.test(e.name) || RAND.test(e.anzeige || "");
    for (const n of e.netze) {
      const m = n.material, g = n.geometry, p = g.attributes.position, no = g.attributes.normal, col = g.attributes.color;
      const glas = !!(m.userData && m.userData.glas), proPunkt = !glas && !!col && !!(m.userData && m.userData.punktfarben);
      /* Weltlage einmal je Netz */
      const pw = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld); pw[i * 3] = v.x; pw[i * 3 + 1] = v.y; pw[i * 3 + 2] = v.z; }
      let nw = null;
      if (no) {
        nm.getNormalMatrix(n.matrixWorld); nw = new Float32Array(no.count * 3);
        for (let i = 0; i < no.count; i++) { v.fromBufferAttribute(no, i).applyMatrix3(nm).normalize(); nw[i * 3] = v.x; nw[i * 3 + 1] = v.y; nw[i * 3 + 2] = v.z; }
      }
      const ia = g.index ? g.index.array : null, anz = ia ? g.index.count : p.count;
      const basis = glas ? "glas" : (m.name || m.uuid);
      const neuVon = (f) => () => ({ glas, farbe: f, rau: m.roughness ?? 0.8, metall: m.metalness ?? 0 });
      const fest = proPunkt ? null : gruppe(basis, neuVon(glas ? new THREE.Color(0.8, 0.9, 0.95) : mittelfarbe(m, g)));
      const umbau = new Map();   /* Gruppe → Punktnummer alt → neu (je Netz) */
      for (let t = 0; t < anz; t += 3) {
        const a = ia ? ia[t] : t, b = ia ? ia[t + 1] : t + 1, c = ia ? ia[t + 2] : t + 2;
        if (nurRand) {
          const mx = (pw[a * 3] + pw[b * 3] + pw[c * 3]) / 3, mz = (pw[a * 3 + 2] + pw[b * 3 + 2] + pw[c * 3 + 2]) / 3;
          if (mx < x0 || mx > x1 || mz < z0 || mz > z1) continue;
        }
        let gr = fest;
        if (!gr) {
          farbe.setRGB(col.getX(a), col.getY(a), col.getZ(a)); if (m.color) farbe.multiply(m.color);
          const r = stufe(farbe.r), gg = stufe(farbe.g), bb = stufe(farbe.b);
          gr = gruppe(basis + "|" + r + "," + gg + "," + bb, neuVon(new THREE.Color().setRGB(linear(r), linear(gg), linear(bb))));
        }
        let karte = umbau.get(gr);
        if (!karte) { karte = new Int32Array(p.count).fill(-1); umbau.set(gr, karte); }
        for (const k of [a, b, c]) {
          if (karte[k] < 0) {
            karte[k] = gr.pos.length / 3;
            gr.pos.push(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2]);
            if (nw) gr.nor.push(nw[k * 3], nw[k * 3 + 1], nw[k * 3 + 2]);
          }
          gr.idx.push(karte[k]);
        }
        dreiecke++;
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  fortschritt(0.4);
  const szene = new THREE.Scene();
  let nr = 0;
  for (const [schl, gr] of gruppen) {
    if (!gr.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gr.pos), 3));
    if (gr.nor.length === gr.pos.length) geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(gr.nor), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(gr.idx), 1));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    gr.pos = gr.nor = gr.idx = null;
    geo.attributes.position = kurzAttribut(geo.attributes.position.array, 3);
    geo.attributes.normal = kurzAttribut(geo.attributes.normal.array, 3);
    /* USDZ kennt nur einseitige Flächen (Quick Look zeigt die Außenseite) */
    const mat = new THREE.MeshStandardMaterial({ color: gr.farbe, roughness: gr.rau, metalness: gr.metall });
    if (gr.glas) { mat.transparent = true; mat.opacity = 0.3; }
    const netz = new THREE.Mesh(geo, mat); netz.name = "Teil" + (++nr) + "_" + String(schl).replace(/\W+/g, "_").slice(0, 40);
    szene.add(netz);
  }
  fortschritt(0.6);
  const daten = await new USDZExporter().parseAsync(szene, { quickLookCompatible: true, ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "horizontal" } } });
  const info = { netze: nr, dreiecke };
  szene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  fortschritt(1);
  const blob = new Blob([daten], { type: "model/vnd.usdz+zip" });
  blob.info = info;
  return blob;
}

/** AR Quick Look öffnen: <a rel="ar" href="blob:…"><img></a> antippen */
export function oeffneQuickLook(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.rel = "ar"; a.href = url; a.download = (name || "Haus").replace(/[^\wäöüÄÖÜß -]+/g, "") + ".usdz";
  a.appendChild(document.createElement("img"));
  a.style.display = "none"; document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); }, 1000);
  return url;
}
