/* Messmodus ?messen=brille|rechner|handy: Kamerafahrt rund ums Haus (120 Bilder) und innen (60 Bilder).
   Je Bild Zeichenaufrufe (beide Augen summiert), Dreiecke und Zeit bis die Grafikkarte fertig ist (1 Bildpunkt zurücklesen).
   Brille: 1680 × 1760 je Auge, Augenabstand 64 mm, Schatten 2048 einmal, keine Nachbearbeitung. */
import * as THREE from "three";

export const PROFILE = {
  brille: { b: 1680, h: 1760, augen: 2, fovAussen: 96, fovInnen: 96 },
  rechner: { b: 1920, h: 1080, augen: 1, fovAussen: 45, fovInnen: 60 },
  handy: { b: 585, h: 1266, augen: 1, fovAussen: 45, fovInnen: 70 },
};

const warte = () => new Promise((r) => setTimeout(r, 0));
const auswerten = (liste, k) => {
  const w = liste.map((x) => x[k]);
  return { mittel: +(w.reduce((a, b) => a + b, 0) / w.length).toFixed(2), max: +Math.max(...w).toFixed(2), min: +Math.min(...w).toFixed(2) };
};

export async function messe(B, art, zeige = () => {}) {
  const P = PROFILE[art];
  if (!P) throw new Error("unbekannte Messung " + art);
  const r = B.renderer, gl = r.getContext();
  B.anhalten();
  r.setPixelRatio(1); r.setSize(P.b * P.augen, P.h, false);
  B.alleAn(); B.hebeAuf();
  r.info.autoReset = false;

  const links = new THREE.PerspectiveCamera(P.fovAussen, P.b / P.h, 0.1, 3000), rechts = links.clone();
  const mitte = new THREE.Object3D();
  const px = new Uint8Array(4);

  function bild(auge, ziel, fov) {
    mitte.position.copy(auge); mitte.lookAt(ziel); mitte.updateMatrixWorld();
    const kams = P.augen === 2 ? [[links, -0.032], [rechts, 0.032]] : [[links, 0]];
    r.info.reset();
    const t0 = performance.now();
    for (let i = 0; i < kams.length; i++) {
      const [k, versatz] = kams[i];
      k.fov = fov; k.aspect = P.b / P.h; k.updateProjectionMatrix();
      k.position.copy(auge); k.quaternion.copy(mitte.quaternion);
      k.translateX(versatz); k.updateMatrixWorld();
      r.setScissorTest(true); r.setViewport(i * P.b, 0, P.b, P.h); r.setScissor(i * P.b, 0, P.b, P.h);
      r.render(B.szene, k);
    }
    r.setScissorTest(false);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = performance.now() - t0;
    return { aufrufe: r.info.render.calls, dreiecke: r.info.render.triangles, ms };
  }

  /* Aufwärmen: Schattenkarte einmal (2048 bei der Brille), Programme übersetzen */
  r.shadowMap.needsUpdate = true;
  const box = B.hausBox, c = box.getCenter(new THREE.Vector3()), R = B.hausKugel.radius;
  bild(new THREE.Vector3(c.x, 1.7, c.z + R * 1.5), c, P.fovAussen);
  bild(new THREE.Vector3(c.x, 1.7, c.z + R * 1.5), c, P.fovAussen);

  /* Fahrt 1: rund ums Haus, Augenhöhe im Garten */
  const aussen = [];
  const radius = Math.max(R * 1.35, R + 6);
  const blickZiel = new THREE.Vector3(c.x, Math.max(0, box.min.y) + 3, c.z);
  for (let i = 0; i < 120; i++) {
    const w = (i / 120) * Math.PI * 2;
    const auge = new THREE.Vector3(c.x + Math.sin(w) * radius, 1.7, c.z + Math.cos(w) * radius);
    aussen.push(bild(auge, blickZiel, P.fovAussen));
    if (i % 10 === 9) { zeige(`${art}: außen ${i + 1}/120`); await warte(); }
  }

  /* Fahrt 2: innen durchs Erdgeschoss von Standpunkt zu Standpunkt */
  const sps = ((B.haus && B.haus.standpunkte) || []).filter((s) => B.ebeneVon(s) === B.eg);
  const punkte = sps.length >= 2 ? sps.map((s) => new THREE.Vector3(...B.augeVon(s))) : (() => {
    const s = B.startpunkt(), a = new THREE.Vector3(...B.augeVon(s));
    return [a, a.clone().add(new THREE.Vector3(2, 0, 0))];
  })();
  const innen = [];
  for (let i = 0; i < 60; i++) {
    const t = (i / 59) * (punkte.length - 1), k = Math.min(punkte.length - 2, Math.floor(t)), f = t - k;
    const auge = punkte[k].clone().lerp(punkte[k + 1], f);
    let dir = punkte[k + 1].clone().sub(punkte[k]); dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i / 6) * 0.6);
    innen.push(bild(auge, auge.clone().add(dir), P.fovInnen));
    if (i % 10 === 9) { zeige(`${art}: innen ${i + 1}/60`); await warte(); }
  }

  const ergebnis = {
    art, datum: new Date().toISOString(), haus: B.haus && B.haus.name,
    bild: { breite: P.b, hoehe: P.h, augen: P.augen, augenabstand_mm: P.augen === 2 ? 64 : 0, schatten: B.sonne.shadow.mapSize.x, nachbearbeitung: false },
    netze: B.netze.length, programme: r.info.programs ? r.info.programs.length : null,
    grafikkarte: (() => { try { const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (f) { return "?"; } })(),
    aussen: { bilder: aussen.length, aufrufe: auswerten(aussen, "aufrufe"), dreiecke: auswerten(aussen, "dreiecke"), ms: auswerten(aussen, "ms") },
    innen: { bilder: innen.length, aufrufe: auswerten(innen, "aufrufe"), dreiecke: auswerten(innen, "dreiecke"), ms: auswerten(innen, "ms") },
  };
  ergebnis.ziel = art === "brille" ? { aufrufe_unter: 200, erreicht: ergebnis.aussen.aufrufe.max < 200 && ergebnis.innen.aufrufe.max < 200 } : null;
  try { await fetch("ergebnis?name=" + encodeURIComponent(art), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ergebnis, null, 1) }); }
  catch (f) { ergebnis.senden = "fehlgeschlagen: " + f.message; }
  return ergebnis;
}
