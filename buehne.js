/* Bühne: three.js-Szene mit Haus, Himmel, Sonne und Schatten. Zeichnet nur, wenn sich etwas bewegt.
   Licht wie im ersten, von Hand gebauten Betrachter (v13g), Sonne aus der Datei. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { MeshoptDecoder } from "./lib/meshoptimizer/meshopt_decoder.mjs";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const AUGE = 1.6;                       /* Augenhöhe über dem Fußboden */
const ANZEIGE = { EG: "Erdgeschoss", OG: "Obergeschoss", DG: "Dachgeschoss", KG: "Keller", UG: "Untergeschoss", SB: "Spitzboden" };
const klemme = (v, a, b) => Math.max(a, Math.min(b, v));
const weich = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Kein Haus aus StrongCAD: Fehler mit Text für den Nutzer */
export class KeinHaus extends Error {}

/** Kopf einer .glb lesen (ohne alles zu entpacken): Hausname und Prüfung, ob es ein Haus ist. */
export function glbKopf(puffer) {
  const dv = new DataView(puffer);
  if (puffer.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new KeinHaus("Diese Datei ist kein 3D-Modell (.glb). Bitte die Datei aus StrongCAD wählen.");
  const jl = dv.getUint32(12, true);
  let j;
  try { j = JSON.parse(new TextDecoder().decode(new Uint8Array(puffer, 20, jl))); } catch (f) { throw new KeinHaus("Die Datei ist beschädigt oder unvollständig. Bitte noch einmal aus StrongCAD ausgeben."); }
  const haus = j.scenes && j.scenes[0] && j.scenes[0].extras && j.scenes[0].extras.haus;
  if (!haus || !haus.bauteile || !haus.ebenen) throw new KeinHaus("Diese Datei ist ein 3D-Modell, aber kein Haus aus StrongCAD. Bitte die Datei aus StrongCAD wählen.");
  return { name: String(haus.name || "Haus"), haus };
}

export function erzeugeBuehne(host, opt = {}) {
  const mobil = !!opt.mobil;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobil ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;           /* Schattenkarte nur nach Laden und Ebenen-Wechsel */
  host.prepend(renderer.domElement);

  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  kamera.rotation.order = "YXZ";
  const steuer = new OrbitControls(kamera, renderer.domElement);
  /* keine Winkelgrenze (im Dachraum darf man nach oben sehen), dafür nie unter den Boden – siehe Schleife */
  steuer.enableDamping = true; steuer.dampingFactor = 0.1;
  steuer.minDistance = 1.5; steuer.maxDistance = 400; steuer.screenSpacePanning = true; steuer.zoomToCursor = !mobil;
  steuer.rotateSpeed = 0.8;
  kamera.position.set(0, 1.6, 0); steuer.target.set(0, 7, -20); steuer.update();   /* vor dem ersten Haus: Blick in den Himmel */

  /* Himmel, Umgebungslicht, Sonne */
  const himmel = new Sky(); himmel.scale.setScalar(10000); himmel.name = "Himmel";
  const hu = himmel.material.uniforms;
  hu.turbidity.value = 3.2; hu.rayleigh.value = 2.4; hu.mieCoefficient.value = 0.003; hu.mieDirectionalG.value = 0.8;
  szene.add(himmel);
  szene.environmentIntensity = 0.5;
  szene.fog = new THREE.Fog(0xbfd0de, 220, 1100);
  const sonne = new THREE.DirectionalLight(0xffe6c8, 2.5);
  sonne.castShadow = true;
  const schattenGroesse = opt.schatten || (mobil ? 2048 : 4096);
  sonne.shadow.mapSize.set(schattenGroesse, schattenGroesse);
  sonne.shadow.bias = -0.0004; sonne.shadow.normalBias = 0.025; sonne.shadow.radius = 3;
  szene.add(sonne, sonne.target);
  szene.add(new THREE.HemisphereLight(0xdfe9f2, 0x6d7458, 0.25));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let umgebung = null;
  function setzeSonne(hoehe, richtung) {
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - hoehe), THREE.MathUtils.degToRad(180 - richtung));
    hu.sunPosition.value.copy(dir);
    const s = new THREE.Scene(), h2 = new Sky(); h2.scale.setScalar(10000);
    for (const k of Object.keys(hu)) h2.material.uniforms[k].value = hu[k].value;
    s.add(h2);
    if (umgebung) umgebung.dispose();
    umgebung = pmrem.fromScene(s, 0.02); szene.environment = umgebung.texture;
    h2.geometry.dispose(); h2.material.dispose();
    return dir;
  }
  let sonnenDir = setzeSonne(28, 245);

  /* Lader */
  const lader = new GLTFLoader();
  lader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader().setTranscoderPath("lib/three/examples/jsm/libs/basis/").detectSupport(renderer);
  lader.setKTX2Loader(ktx2);

  /* Zustand */
  const B = {
    renderer, szene, kamera, steuer, sonne, himmel,
    haus: null, wurzel: null, ebenen: [], eg: null, netze: [], hausBox: new THREE.Box3(), hausKugel: new THREE.Sphere(),
    modus: "modell", onBild: null, schmutzig: true, bvhFertig: false,
  };
  let fahrt = null, gang = null, hilfsnetz = null;
  const blick = { yaw: 0, pitch: 0 };
  const tasten = new Set();
  const raycaster = new THREE.Raycaster(); raycaster.firstHitOnly = true;

  B.neuZeichnen = () => { B.schmutzig = true; };
  steuer.addEventListener("change", B.neuZeichnen);
  steuer.addEventListener("start", () => { fahrt = null; });

  /* ---------- Größe ---------- */
  B.groesse = (b, h) => {
    if (!b || !h) return;
    renderer.setSize(b, h, false);
    kamera.aspect = b / h; kamera.updateProjectionMatrix();
    if (B.modus !== "modell" && B.sichtwinkel) setzeSichtwinkel(B.sichtwinkel);
    B.schmutzig = true;
  };

  /* ---------- Laden ---------- */
  function wegraeumen() {
    if (!B.wurzel) return;
    szene.remove(B.wurzel);
    const mats = new Set(), texs = new Set();
    B.wurzel.traverse((o) => {
      if (o.geometry) { if (o.geometry.boundsTree) o.geometry.disposeBoundsTree(); o.geometry.dispose(); }
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
      if (o.isInstancedMesh) o.dispose();
    });
    for (const m of mats) { for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) texs.add(m[k]); m.dispose(); }
    for (const t of texs) t.dispose();
    hebeAuf();
    B.wurzel = null; B.netze = []; B.ebenen = []; B.haus = null; B.bvhFertig = false;
  }

  B.lade = async (puffer, fortschritt = () => {}) => {
    glbKopf(puffer);
    wegraeumen();
    fortschritt(0.35, "Haus wird entpackt …");
    let gltf;
    try { gltf = await lader.parseAsync(puffer, ""); }
    catch (f) { console.error(f); throw new KeinHaus("Die Datei ließ sich nicht öffnen (" + (f && f.message ? f.message : "unbekannter Fehler") + ")."); }
    const wurzel = gltf.scene, haus = wurzel.userData.haus;
    if (!haus) throw new KeinHaus("Diese Datei ist kein Haus aus StrongCAD.");
    fortschritt(0.7, "Haus wird aufgebaut …");
    B.haus = haus; B.wurzel = wurzel;

    /* Ebenen = oberste Knoten */
    const nachName = {};
    for (const knoten of wurzel.children) {
      const name = knoten.userData.ebene || knoten.name;
      const info = (haus.ebenen || []).find((e) => e.name === name) || { name, hoehe: 0, fussboden: 0 };
      const e = { name, anzeige: ANZEIGE[name] || name, hoehe: +info.hoehe || 0, fussboden: +info.fussboden || 0, knoten, an: true, eltern: null, netze: [], box: new THREE.Box3() };
      nachName[name] = e; B.ebenen.push(e);
    }
    for (const e of B.ebenen) {
      const m = /^Möbel\s+(.+)$/i.exec(e.name);
      if (m && nachName[m[1]]) e.eltern = nachName[m[1]];
    }
    const geschosse = B.ebenen.filter((e) => !e.eltern);
    B.eg = B.ebenen.find((e) => /^(EG|Erdgeschoss)$/i.test(e.name)) ||
      geschosse.slice().sort((a, b) => Math.abs(a.hoehe) - Math.abs(b.hoehe))[0] || null;

    /* Materialien und Netze vorbereiten */
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    wurzel.updateMatrixWorld(true);
    for (const e of B.ebenen) {
      e.knoten.traverse((o) => {
        if (!o.isMesh) return;
        const mat = o.material, glas = !!(mat.userData && mat.userData.glas);
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"]) if (mat[k]) mat[k].anisotropy = aniso;
        if (glas) {
          mat.transparent = true; mat.depthWrite = false; mat.forceSinglePass = true;   /* doppelseitiges Glas sonst 2 Zeichenaufrufe */
          mat.envMapIntensity = 1.4; o.renderOrder = 2;
        }
        o.castShadow = !glas; o.receiveShadow = !glas;
        o.userData.ebene = e;
        if (!o.isInstancedMesh) { e.netze.push(o); B.netze.push(o); }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      });
      e.box.setFromObject(e.knoten);
    }
    /* Hausgröße: nur das Haus selbst (ohne Garten, Gelände, Nebengebäude; Ebenen über 120 m sind Gelände-Boden) */
    B.hausBox.makeEmpty();
    for (const e of B.ebenen) {
      if (e.box.isEmpty() || e.eltern || /garten|gelände|landschaft|neben|möbel/i.test(e.name)) continue;
      const s = e.box.getSize(new THREE.Vector3());
      if (Math.max(s.x, s.z) > 120) continue;
      B.hausBox.union(e.box);
    }
    if (B.hausBox.isEmpty()) B.hausBox.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 8, 10));
    B.hausBox.getBoundingSphere(B.hausKugel);

    /* Sonne aus der Datei, Schattenbereich ums Haus */
    const so = haus.sonne || {};
    sonnenDir = setzeSonne(+so.hoehe || 28, so.richtung === undefined ? 245 : +so.richtung);
    const c = B.hausKugel.center, R = B.hausKugel.radius;
    sonne.position.copy(sonnenDir).multiplyScalar(R * 3 + 20).add(c); sonne.target.position.copy(c);
    const ext = R * 1.25 + 6;
    Object.assign(sonne.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: R * 6 + 60 });
    sonne.shadow.camera.updateProjectionMatrix();
    sonne.target.updateMatrixWorld();
    steuer.maxDistance = Math.max(60, R * 8);

    szene.add(wurzel);
    sichtbarkeit();
    fortschritt(0.85, "Darstellung wird vorbereitet …");
    try { await renderer.compileAsync(szene, kamera); } catch (f) { /* ältere Geräte: beim ersten Bild */ }
    renderer.shadowMap.needsUpdate = true;
    B.schmutzig = true;
    baueBvhImHintergrund();
    fortschritt(1, "Fertig");
    return haus;
  };

  /* BVH je Netz einmal, in kleinen Stücken (ein Netz je Leerlauf), damit nichts ruckelt */
  function baueBvhImHintergrund() {
    const liste = B.netze.slice().sort((a, b) => a.geometry.index.count - b.geometry.index.count);
    const wurzel = B.wurzel;
    const naechstes = () => {
      if (B.wurzel !== wurzel) return;
      const n = liste.shift();
      if (!n) { B.bvhFertig = true; return; }
      try { if (!n.geometry.boundsTree) n.geometry.computeBoundsTree(); } catch (f) { console.warn("BVH", n.name, f); }
      planen(naechstes);
    };
    planen(naechstes);
  }
  const planen = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 200 }) : setTimeout(f, 16));

  /* ---------- Ebenen ---------- */
  function sichtbarkeit() {
    for (const e of B.ebenen) e.knoten.visible = e.an && (!e.eltern || e.eltern.an);
    renderer.shadowMap.needsUpdate = true; B.schmutzig = true;
  }
  B.setzeEbene = (name, an) => { const e = B.ebenen.find((x) => x.name === name); if (e) { e.an = an; sichtbarkeit(); } };
  B.ebenenZustand = () => Object.fromEntries(B.ebenen.map((e) => [e.name, e.an]));
  B.ebenenSetzen = (z) => { for (const e of B.ebenen) if (z && e.name in z) e.an = z[e.name]; sichtbarkeit(); };
  B.alleAn = () => { for (const e of B.ebenen) e.an = true; sichtbarkeit(); };
  const geschossHoehe = (e) => (e.eltern ? e.eltern.hoehe : e.hoehe);
  B.ueberEG = (e) => !!B.eg && geschossHoehe(e) > B.eg.hoehe + 0.01;
  B.egOffen = () => { for (const e of B.ebenen) if (B.ueberEG(e)) e.an = false; sichtbarkeit(); };
  B.allesUeberEGAn = () => { for (const e of B.ebenen) if (B.ueberEG(e)) e.an = true; sichtbarkeit(); };
  B.istOffen = () => B.ebenen.some((e) => B.ueberEG(e) && !e.an);
  /** sichtbare Netze (für Strahl) */
  const sichtbareNetze = () => B.netze.filter((n) => n.userData.ebene.knoten.visible);

  /* ---------- Ansichten ---------- */
  function abstandFuer(radius) {
    const v = THREE.MathUtils.degToRad(kamera.fov) / 2;
    const h = Math.atan(Math.tan(v) * kamera.aspect);
    return radius / Math.sin(Math.min(v, h));
  }
  B.ansicht = (art, sofort) => {
    setzeModell();
    const box = B.hausBox, c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    let ziel, pos;
    if (art === "oben") {
      ziel = new THREE.Vector3(c.x, Math.max(box.min.y, 0), c.z);
      const d = abstandFuer(0.5 * Math.hypot(s.x, s.z)) * 1.05;
      pos = ziel.clone().add(new THREE.Vector3(0, d, 0.001));
    } else if (art === "offen") {
      const egH = B.eg ? B.eg.hoehe : 0;
      ziel = new THREE.Vector3(c.x, egH + 1.0, c.z);
      const d = abstandFuer(0.5 * Math.hypot(s.x, s.z, 3)) * 1.02;
      pos = ziel.clone().add(new THREE.Vector3(-0.42, 0.78, 0.46).normalize().multiplyScalar(d));
    } else {
      ziel = new THREE.Vector3(c.x, box.min.y + Math.max(0, -box.min.y) + s.y * 0.28, c.z);
      const d = abstandFuer(0.5 * Math.hypot(s.x, s.z, s.y * 0.8)) * 0.88;
      pos = ziel.clone().add(new THREE.Vector3(-0.58, 0.36, 0.73).normalize().multiplyScalar(d));
    }
    fahre(pos, ziel, sofort ? 0 : 0.6);
  };
  function fahre(pos, ziel, dauer) {
    if (!dauer) { kamera.position.copy(pos); steuer.target.copy(ziel); steuer.update(); fahrt = null; B.schmutzig = true; return; }
    fahrt = { t0: performance.now(), dauer: dauer * 1000, p0: kamera.position.clone(), z0: steuer.target.clone(), p1: pos, z1: ziel };
  }

  /* ---------- Modi ---------- */
  function setzeModell() {
    if (B.modus !== "modell") { B.modus = "modell"; kamera.fov = 45; kamera.updateProjectionMatrix(); B.sichtwinkel = 0; }
    steuer.enabled = true; gang = null; tasten.clear();
  }
  B.modell = () => { setzeModell(); B.schmutzig = true; };
  function setzeSichtwinkel(w) {
    B.sichtwinkel = w;
    const h = THREE.MathUtils.degToRad(w);
    let v = kamera.aspect >= 1 ? 2 * Math.atan(Math.tan(h / 2) / kamera.aspect) : Math.min(h * 1.1, THREE.MathUtils.degToRad(82));
    kamera.fov = THREE.MathUtils.radToDeg(v); kamera.updateProjectionMatrix();
  }
  function stelleBlick(auge, ziel) {
    kamera.position.set(auge[0], auge[1], auge[2]);
    const dx = ziel[0] - auge[0], dy = ziel[1] - auge[1], dz = ziel[2] - auge[2];
    blick.yaw = Math.atan2(-dx, -dz); blick.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    kamera.rotation.set(blick.pitch, blick.yaw, 0, "YXZ");
  }
  /** Ebene eines Standpunkts (Raum "EG …" → EG), sonst nach Höhe */
  B.ebeneVon = (sp) => {
    const kopf = String(sp.raum || sp.name || "").split(/\s+/)[0];
    const g = B.ebenen.filter((e) => !e.eltern);
    return g.find((e) => e.name === kopf) ||
      g.slice().sort((a, b) => Math.abs(a.hoehe + a.fussboden + AUGE - sp.auge[1]) - Math.abs(b.hoehe + b.fussboden + AUGE - sp.auge[1]))[0] || B.eg;
  };
  /** Augenhöhe: 1,60 m über dem Fußboden der Ebene */
  B.augeVon = (sp) => {
    const e = B.ebeneVon(sp), y = e ? e.hoehe + e.fussboden + AUGE : sp.auge[1];
    return [sp.auge[0], y, sp.auge[2]];
  };
  B.innen = (sp) => {
    B.modus = "innen"; steuer.enabled = false; fahrt = null; gang = null;
    setzeSichtwinkel(sp.sichtwinkel || 74);
    const a = B.augeVon(sp); stelleBlick(a, [sp.ziel[0], a[1], sp.ziel[2]]);
    B.schmutzig = true;
  };
  B.foto = (sp) => { B.innen(sp); B.modus = "foto"; };
  /** Startpunkt fürs Hineingehen: erster Standpunkt im EG, bevorzugt Essen, dann Wohnen; sonst Mitte des EG */
  B.startpunkt = () => {
    const sps = (B.haus && B.haus.standpunkte) || [];
    const imEG = sps.filter((s) => B.ebeneVon(s) === B.eg);
    const sp = imEG.find((s) => /essen/i.test(s.raum)) || imEG.find((s) => /wohnen/i.test(s.raum)) || imEG[0];
    if (sp) return sp;
    const c = B.hausBox.getCenter(new THREE.Vector3()), y = (B.eg ? B.eg.hoehe + B.eg.fussboden : 0) + AUGE;
    return { name: "Erdgeschoss", raum: "EG", auge: [c.x, y, c.z], ziel: [c.x, y, c.z - 1], sichtwinkel: 74 };
  };
  B.umsehen = (dx, dy) => {
    const k = THREE.MathUtils.degToRad(kamera.fov) / Math.max(200, renderer.domElement.clientHeight);
    blick.yaw += dx * k; blick.pitch = klemme(blick.pitch + dy * k, -1.35, 1.35);
    kamera.rotation.set(blick.pitch, blick.yaw, 0, "YXZ"); B.schmutzig = true;
  };

  /* ---------- Strahl ---------- */
  const ndc = new THREE.Vector2();
  function strahlBild(x, y) {
    const el = renderer.domElement;
    ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, kamera);
    raycaster.near = 0; raycaster.far = Infinity;
    const t = raycaster.intersectObjects(sichtbareNetze(), false);
    return t[0] || null;
  }
  function strahl(von, richtung, weit) {
    raycaster.set(von, richtung); raycaster.near = 0; raycaster.far = weit;
    const t = raycaster.intersectObjects(sichtbareNetze(), false);
    raycaster.far = Infinity;
    return t[0] || null;
  }
  /* Normale in Weltlage – Normalenmatrix, weil gepackte Netze ungleich skaliert sind */
  const nmat = new THREE.Matrix3();
  const weltNormale = (t) => t.face ? t.face.normal.clone().applyMatrix3(nmat.getNormalMatrix(t.object.matrixWorld)).normalize() : new THREE.Vector3(0, 1, 0);

  /** Bauteil unter dem Finger: {nr, punkt} oder null */
  B.bauteilAn = (x, y) => {
    const t = strahlBild(x, y);
    if (!t || !t.face) return null;
    const attr = t.object.geometry.attributes._bauteil;
    const nr = attr ? Math.round(attr.getX(t.face.a)) : 0;
    return { nr, punkt: t.point.clone(), netz: t.object };
  };
  /** Bauteil-Zeile zur Nummer (Zeile nr − 1) */
  B.zeile = (nr) => (B.haus && nr > 0 ? B.haus.bauteile.zeilen[nr - 1] || null : null);

  /* Hervorheben: nur dieses Bauteil als eigenes leuchtendes Hilfsnetz */
  const hilfsMat = new THREE.MeshBasicMaterial({ color: 0x5fd39a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false, fog: false });
  function hebeAuf() { if (hilfsnetz) { szene.remove(hilfsnetz); hilfsnetz.geometry.dispose(); hilfsnetz = null; B.schmutzig = true; } }
  B.hebeAuf = hebeAuf;
  B.hebeHervor = (nr, netz) => {
    hebeAuf();
    if (!nr) return;
    const e = netz.userData.ebene, quelle = e ? e.netze : [netz];
    const pos = [], v = new THREE.Vector3();
    for (const n of quelle) {
      const g = n.geometry, bt = g.attributes._bauteil; if (!bt) continue;
      const idx = g.index, p = g.attributes.position, mw = n.matrixWorld;
      const ia = idx ? idx.array : null, cnt = idx ? idx.count : p.count;
      /* _bauteil liegt oft verschränkt (Schrittweite 4 Byte bei 2-Byte-Zahl) → über data.stride lesen */
      const ba = bt.isInterleavedBufferAttribute ? bt.data.array : bt.array;
      const sch = bt.isInterleavedBufferAttribute ? bt.data.stride : bt.itemSize, ab = bt.offset || 0;
      const nrVon = bt.normalized ? (i) => Math.round(bt.getX(i)) : (i) => ba[i * sch + ab];
      for (let i = 0; i < cnt; i += 3) {
        const a = ia ? ia[i] : i;
        if (nrVon(a) !== nr) continue;
        for (let k = 0; k < 3; k++) {
          const j = ia ? ia[i + k] : i + k;
          v.fromBufferAttribute(p, j).applyMatrix4(mw); pos.push(v.x, v.y, v.z);
        }
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    hilfsnetz = new THREE.Mesh(geo, hilfsMat); hilfsnetz.renderOrder = 5; hilfsnetz.name = "Markierung";
    szene.add(hilfsnetz); B.schmutzig = true;
  };

  /* ---------- Hineingehen ---------- */
  const unten = new THREE.Vector3(0, -1, 0);
  function bodenUnter(p, max = 2.6) {
    const t = strahl(new THREE.Vector3(p.x, p.y, p.z), unten, max);
    return t && weltNormale(t).y > 0.7 ? t.point.y : null;
  }
  /** Antippen drinnen: Ziel nur auf waagerechtem Boden derselben Höhe; Weg vor der ersten Wand kürzen.
      Rückgabe: {ziel: Vector3} | {grund: "text"} */
  B.geheZu = (x, y) => {
    const t = strahlBild(x, y);
    if (!t) return { grund: "Zum Gehen auf den Boden tippen" };
    const n = weltNormale(t);
    const boden = kamera.position.y - AUGE;
    if (n.y < 0.85 || Math.abs(t.point.y - boden) > 0.45) return { grund: "Zum Gehen auf den Boden tippen" };
    const start = kamera.position.clone();
    const ziel = new THREE.Vector3(t.point.x, t.point.y + AUGE, t.point.z);
    const flach = new THREE.Vector3(ziel.x - start.x, 0, ziel.z - start.z);
    let weit = flach.length();
    if (weit < 0.05) return { ziel: t.point.clone() };
    flach.normalize();
    /* Wand in Hüfthöhe-plus (1,1 m über Boden): über Tischen, unter Türstürzen */
    const h = strahl(new THREE.Vector3(start.x, boden + 1.1, start.z), flach, weit + 0.4);
    if (h) weit = Math.max(0, Math.min(weit, h.distance - 0.4));
    const ende = start.clone().addScaledVector(flach, weit); ende.y = t.point.y + AUGE;
    gang = { t0: performance.now(), dauer: klemme(weit / 1.8, 0.35, 3) * 1000, von: start, nach: ende };
    return { ziel: t.point.clone() };
  };
  B.taste = (code, gedrueckt) => { if (gedrueckt) tasten.add(code); else tasten.delete(code); };
  const vor = new THREE.Vector3(), seit = new THREE.Vector3();
  function tastenSchritt(dt) {
    if (B.modus !== "innen" || !tasten.size) return false;
    let f = 0, s = 0, d = 0;
    if (tasten.has("ArrowUp") || tasten.has("KeyW")) f += 1;
    if (tasten.has("ArrowDown") || tasten.has("KeyS")) f -= 1;
    if (tasten.has("KeyA")) s -= 1;
    if (tasten.has("KeyD")) s += 1;
    if (tasten.has("ArrowLeft") || tasten.has("KeyQ")) d += 1;
    if (tasten.has("ArrowRight") || tasten.has("KeyE")) d -= 1;
    if (d) { blick.yaw += d * 1.6 * dt; kamera.rotation.set(blick.pitch, blick.yaw, 0, "YXZ"); }
    if (f || s) {
      gang = null;
      vor.set(-Math.sin(blick.yaw), 0, -Math.cos(blick.yaw));
      seit.set(Math.cos(blick.yaw), 0, -Math.sin(blick.yaw));
      const r = vor.multiplyScalar(f).addScaledVector(seit, s).normalize(), weg = 1.6 * dt;
      const boden = kamera.position.y - AUGE;
      const h = strahl(new THREE.Vector3(kamera.position.x, boden + 1.1, kamera.position.z), r, weg + 0.35);
      if (!h) {
        kamera.position.addScaledVector(r, weg);
        const b = bodenUnter(kamera.position.clone().setY(kamera.position.y - AUGE + 0.4), 1.0);
        if (b !== null) kamera.position.y = b + AUGE;
      }
    }
    return true;
  }

  /* Kamera nie unter den Boden: außerhalb des Hauses 0,3 m über Gelände, im Haus über der untersten Ebene */
  function bodenGrenze() {
    const p = kamera.position, hb = B.hausBox;
    const imHaus = !hb.isEmpty() && p.x > hb.min.x && p.x < hb.max.x && p.z > hb.min.z && p.z < hb.max.z;
    const min = imHaus ? hb.min.y + 0.3 : 0.3;
    let anders = false;
    if (p.y < min) { p.y = min; anders = true; }
    if (steuer.target.y < min - 3) { steuer.target.y = min - 3; anders = true; }
    if (anders) kamera.lookAt(steuer.target);
    return anders;
  }

  /* ---------- Schleife: nur zeichnen, wenn sich etwas bewegt ---------- */
  let letzte = performance.now(), laeuft = true;
  B.zeichnen = () => {
    renderer.render(szene, kamera);
    if (B.onBild) B.onBild();
  };
  function schleife(jetzt) {
    if (!laeuft) return;
    requestAnimationFrame(schleife);
    const dt = Math.min(0.1, (jetzt - letzte) / 1000); letzte = jetzt;
    let bewegt = false;
    if (fahrt) {
      const t = klemme((jetzt - fahrt.t0) / fahrt.dauer, 0, 1), w = weich(t);
      kamera.position.lerpVectors(fahrt.p0, fahrt.p1, w); steuer.target.lerpVectors(fahrt.z0, fahrt.z1, w);
      kamera.lookAt(steuer.target);
      if (t >= 1) { fahrt = null; steuer.update(); }
      bewegt = true;
    } else if (B.modus === "modell" && steuer.enabled) {
      if (steuer.update()) bewegt = true;
      if (bodenGrenze()) bewegt = true;
    }
    if (gang) {
      const t = klemme((jetzt - gang.t0) / gang.dauer, 0, 1);
      kamera.position.lerpVectors(gang.von, gang.nach, weich(t));
      if (t >= 1) gang = null;
      bewegt = true;
    }
    if (tastenSchritt(dt)) bewegt = true;
    if (bewegt || B.schmutzig) { B.schmutzig = false; B.zeichnen(); }
  }
  requestAnimationFrame(schleife);
  B.anhalten = () => { laeuft = false; };

  /* ---------- Bilder ---------- */
  /** kleines Bild einer Kamera (für Vorschau/Fotos): im selben Ablauf in eine Ecke zeichnen, abgreifen, Hauptbild neu zeichnen */
  B.schnappschuss = (auge, ziel, b, h, fov = 60, alleAn = false) => {
    const el = renderer.domElement, pr = renderer.getPixelRatio();
    const cw = el.width / pr, ch = el.height / pr;
    const f = Math.min(1, cw / b, ch / h), w = Math.floor(b * f), hh = Math.floor(h * f);
    const k = new THREE.PerspectiveCamera(fov, w / hh, 0.1, 3000);
    k.position.set(...auge); k.lookAt(new THREE.Vector3(...ziel));
    const vorher = alleAn ? B.ebenenZustand() : null;
    if (alleAn) B.alleAn();
    if (hilfsnetz) hilfsnetz.visible = false;
    renderer.setScissorTest(true); renderer.setViewport(0, 0, w, hh); renderer.setScissor(0, 0, w, hh);
    renderer.render(szene, k);
    const c = document.createElement("canvas"); c.width = Math.round(w * pr); c.height = Math.round(hh * pr);
    c.getContext("2d").drawImage(el, 0, el.height - c.height, c.width, c.height, 0, 0, c.width, c.height);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, cw, ch);
    if (hilfsnetz) hilfsnetz.visible = true;
    if (vorher) B.ebenenSetzen(vorher);
    B.zeichnen();
    return c.toDataURL("image/jpeg", 0.8);
  };
  /** aktuelles Bild als JPG */
  B.bildBlob = () => new Promise((ok) => {
    B.zeichnen();
    renderer.domElement.toBlob((b) => ok(b), "image/jpeg", 0.92);
  });
  B.aussenBlick = () => {
    const box = B.hausBox, c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const ziel = new THREE.Vector3(c.x, Math.max(box.min.y, 0) + s.y * 0.28, c.z);
    const d = (0.5 * Math.hypot(s.x, s.z, s.y * 0.8)) / Math.sin(THREE.MathUtils.degToRad(22));
    const pos = ziel.clone().add(new THREE.Vector3(-0.58, 0.36, 0.73).normalize().multiplyScalar(d));
    return { auge: pos.toArray(), ziel: ziel.toArray() };
  };
  /** Welt → Bildschirm (CSS-Pixel), null wenn hinter der Kamera */
  const pv = new THREE.Vector3();
  B.aufBild = (p) => {
    pv.copy(p).project(kamera);
    if (pv.z > 1) return null;
    const el = renderer.domElement;
    return { x: (pv.x + 1) / 2 * el.clientWidth, y: (1 - pv.y) / 2 * el.clientHeight };
  };
  return B;
}
