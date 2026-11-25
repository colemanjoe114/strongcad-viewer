/* AR am iPhone/iPad: im Gerät eine USDZ erzeugen (ohne Garten, Möbel, Nebengebäude) und AR Quick Look öffnen.
   USDZExporter kann kein KTX2 → einfache Materialien mit der mittleren Farbe; Punkte in Gleitkomma; je Material ein Netz; 1:1. */
import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const istIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);

const OHNE = /garten|gelände|landschaft|möbel|einrichtung|nebengebäude/i;

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

/** Geometrie in Weltkoordinaten, nur Punkte + Normalen als Float32 */
function alsFloat(netz) {
  const g = netz.geometry, p = g.attributes.position, n = g.attributes.normal;
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(netz.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (n) {
    const nm = new THREE.Matrix3().getNormalMatrix(netz.matrixWorld), nor = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  }
  const idx = g.index;
  out.setIndex(idx ? new THREE.BufferAttribute(new Uint32Array(idx.array), 1) : null);
  if (!n) out.computeVertexNormals();
  return out;
}

/** USDZ aus der Bühne bauen → Blob */
export async function baueUsdz(B, fortschritt = () => {}) {
  const gruppen = new Map();
  B.wurzel.updateMatrixWorld(true);
  for (const e of B.ebenen) {
    if (OHNE.test(e.name) || OHNE.test(e.anzeige)) continue;
    for (const n of e.netze) {
      const m = n.material, glas = !!(m.userData && m.userData.glas);
      const schl = glas ? "glas" : (m.name || m.uuid);
      if (!gruppen.has(schl)) gruppen.set(schl, { glas, farbe: glas ? new THREE.Color(0.8, 0.9, 0.95) : mittelfarbe(m, n.geometry), rau: m.roughness ?? 0.8, metall: m.metalness ?? 0, geos: [] });
      gruppen.get(schl).geos.push(alsFloat(n));
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  fortschritt(0.4);
  const szene = new THREE.Scene();
  for (const [schl, gr] of gruppen) {
    const geo = gr.geos.length === 1 ? gr.geos[0] : mergeGeometries(gr.geos, false);
    if (!geo) continue;
    /* USDZ kennt nur einseitige Flächen (Quick Look zeigt die Außenseite) */
    const mat = new THREE.MeshStandardMaterial({ color: gr.farbe, roughness: gr.rau, metalness: gr.metall });
    if (gr.glas) { mat.transparent = true; mat.opacity = 0.3; }
    const netz = new THREE.Mesh(geo, mat); netz.name = schl;
    szene.add(netz);
  }
  fortschritt(0.6);
  const daten = await new USDZExporter().parseAsync(szene, { quickLookCompatible: true, ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "horizontal" } } });
  szene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  fortschritt(1);
  return new Blob([daten], { type: "model/vnd.usdz+zip" });
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
