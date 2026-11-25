/* StrongCAD Viewer – Bedienung nach Entwurf A "Bühne" (teil-a.html), mit echtem 3D.
   Abläufe: 1 Start · 2 Ansicht · 3 Ebenen · 4 Bauteil · 5 Hineingehen · 6 Fotos · 7 AR (nur iPhone/iPad). */
import { erzeugeBuehne, glbKopf, KeinHaus } from "./buehne.js";
import * as Speicher from "./speicher.js";
import { istIOS, baueUsdz, oeffneQuickLook } from "./ar.js";

const Q = new URLSearchParams(location.search);
const app = document.getElementById("app");

/* Gerät: Handy / Tablet / Rechner (für Prüfbilder per ?geraet= erzwingbar) */
const beruehrung = (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
const kurz = Math.min(screen.width || 0, screen.height || 0) || Math.min(innerWidth, innerHeight);
const GERAET = ["handy", "tablet", "rechner"].includes(Q.get("geraet")) ? Q.get("geraet") : !beruehrung ? "rechner" : kurz < 600 ? "handy" : kurz < 1100 ? "tablet" : "rechner";
const T = GERAET !== "rechner", HY = GERAET === "handy";
const AR = istIOS();
const MESSEN = Q.get("messen");
app.dataset.geraet = GERAET;
/* Schmales Fenster (z. B. Browser am Rechner halb breit): Handy-Anordnung, damit nichts abgeschnitten wird */
const breite = () => app.classList.toggle("schmal", GERAET !== "handy" && app.clientWidth < 700);
breite();
try { new ResizeObserver(breite).observe(app); } catch (f) { addEventListener("resize", breite); }

/* Hell/Dunkel nach dem Gerät */
try {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const thema = () => app.classList.toggle("dk", mq.matches);
  thema(); mq.addEventListener ? mq.addEventListener("change", thema) : mq.addListener(thema);
} catch (f) { /* hell */ }

const I = (p) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>";
const IC = {
  zur: I('<path d="m15 5-7 7 7 7"/>'), vor: I('<path d="m9 5 7 7-7 7"/>'), x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  eb: I('<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>'),
  tuer: I('<path d="M6 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><path d="M13.5 12.5h.01" stroke-width="2.6"/>'),
  cam: I('<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6 9.7 4h4.6l1.2 2"/>'),
  ar: I('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  sich: I('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
};
const HINT = {
  modell: T ? "Ein Finger dreht, zwei Finger zoomen" : "Maus ziehen dreht, Rad zoomt",
  innen: T ? "Ziehen = umsehen · Antippen = dorthin gehen" : "Maus ziehen = umsehen · Klick = dorthin gehen · Pfeiltasten = gehen",
  foto: T ? "Ziehen = umsehen" : "Maus ziehen = umsehen",
};
const ANS = [["aussen", "Außen", "Außen"], ["oben", "Von oben", "Oben"], ["offen", "Erdgeschoss offen", "EG offen"]];   /* lang, kurz (Handy/schmal) */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.innerHTML =
  '<div class="w" data-modus="start">' +
  '<div class="buehne"></div><div class="messprobe"></div>' +
  '<div class="marke" hidden></div><div class="ring" hidden></div>' +
  '<div class="karte" hidden role="dialog" aria-label="Bauteil"></div>' +
  '<section class="start" aria-label="Start"><h1>StrongCAD Viewer</h1><p class="sub">Haus ansehen, hineingehen, im Raum zeigen.</p>' +
  '<button class="gross" type="button" data-a="waehlen">Haus öffnen</button>' +
  '<input class="datei" type="file" accept=".glb,model/gltf-binary" hidden>' +
  (T ? '<p class="shint">Aus WhatsApp oder Mail: Teilen › In Dateien sichern, dann hier öffnen.</p>'
     : '<button class="ablage" type="button" data-a="waehlen">Datei hierher ziehen</button>') +
  '<div class="laden" hidden><div class="lt"></div><div class="balken"><i></i></div></div>' +
  '<div class="fehler" role="alert" hidden></div>' +
  '<div class="zl" hidden>Zuletzt geöffnet</div><div class="zliste"></div></section>' +
  '<div class="kopf" data-k="modell" hidden><button class="pille" type="button" data-a="start">' + IC.zur + "<span>Haus wechseln</span></button>" +
  '<span class="pille titel"></span>' +
  '<div class="seg" role="group" aria-label="Ansicht">' + ANS.map((a) => '<button type="button" data-a="ans:' + a[0] + '"><span class="lang">' + a[1] + '</span><span class="kurz">' + a[2] + "</span></button>").join("") + "</div></div>" +
  '<div class="kopf" data-k="innen" hidden><button class="pille" type="button" data-a="draussen">' + IC.zur + "<span>Nach draußen</span></button></div>" +
  '<div class="kopf" data-k="foto" hidden><button class="pille" type="button" data-a="zumodell">' + IC.zur + "<span>Zurück zum Modell</span></button>" +
  '<button class="pille rechts" type="button" data-a="speichern">' + IC.sich + "<span>Bild speichern</span></button></div>" +
  '<div class="hinweis" hidden><span class="ht"></span><button class="x" type="button" data-a="hint" aria-label="Hinweis schließen">' + IC.x + "</button></div>" +
  '<div class="leiste" data-k="modell" hidden>' +
  '<button class="lk" type="button" data-a="blatt:ebenen" aria-pressed="false">' + IC.eb + "<span>Ebenen</span></button>" +
  '<button class="lk" type="button" data-a="innen">' + IC.tuer + "<span>Hineingehen</span></button>" +
  '<button class="lk" type="button" data-a="blatt:fotos" aria-pressed="false">' + IC.cam + "<span>Fotos</span></button>" +
  (AR ? '<button class="lk" type="button" data-a="blatt:ar" aria-pressed="false">' + IC.ar + "<span>AR</span></button>" : "") + "</div>" +
  '<div class="leiste fuss" data-k="foto" hidden></div>' +
  '<div class="blatt" data-b="ebenen" role="dialog" aria-label="Ebenen"><div class="bk"><div class="bt">Ebenen</div><button class="x" type="button" data-a="zu" aria-label="Schließen">' + IC.x + '</button></div><div class="chips"></div></div>' +
  '<div class="blatt" data-b="fotos" role="dialog" aria-label="Fotos"><div class="bk"><div class="bt">Fotos</div><button class="x" type="button" data-a="zu" aria-label="Schließen">' + IC.x + '</button></div><div class="fliste"></div></div>' +
  '<div class="blatt" data-b="ar" role="dialog" aria-label="Im Raum ansehen"><div class="bk"><div class="bt">Im Raum ansehen</div><button class="x" type="button" data-a="zu" aria-label="Schließen">' + IC.x + "</button></div>" +
  '<p class="artext">Öffnet die Kamera. Das Haus steht zuerst klein auf dem Tisch, mit zwei Fingern bis 1:1 vergrößern. Ohne Garten und Möbel.</p>' +
  '<button class="gross" type="button" data-a="kamera">Kamera öffnen</button></div>' +
  '<div class="toast" hidden role="status"></div></div>';

const $ = (s) => app.querySelector(s), $$ = (s) => Array.from(app.querySelectorAll(s));
const w = $(".w"), bue = $(".buehne"), marke = $(".marke"), ring = $(".ring"), karte = $(".karte"), hint = $(".hinweis"), ht = $(".ht"),
  toastEl = $(".toast"), start = $(".start"), dateiFeld = $(".datei"), laden = $(".laden"), fehlerEl = $(".fehler"), probe = $(".messprobe");

const B = erzeugeBuehne(bue, { mobil: T, schatten: MESSEN === "brille" || MESSEN === "handy" ? 2048 : MESSEN === "rechner" ? 4096 : undefined });
const st = { modus: "start", ans: "aussen", blatt: "", sel: null, hint: false, foto: 0, name: "", eintrag: null, fotos: {}, raeume: [], vorher: null, usdz: null, beschaeftigt: false };
window.scv = { B, st };   /* nur für die eigene Prüfung (kopfloser Edge) */

/* ---------- Hilfen ---------- */
let W = 0, H = 0, RAND = { oben: 0, unten: 0 };
function mess() {
  W = bue.clientWidth; H = bue.clientHeight;
  const cs = getComputedStyle(probe);
  RAND = { oben: parseFloat(cs.paddingTop) || 0, unten: parseFloat(cs.paddingBottom) || 0 };
}
const klemme = (v, a, b) => Math.max(a, Math.min(b, v));
let tt = 0;
function toast(t, dauer = 2800) {
  toastEl.textContent = t; toastEl.hidden = false; clearTimeout(tt);
  tt = setTimeout(() => { toastEl.hidden = true; }, dauer);
}
const mm = (x) => String(Math.round(+x || 0));
const m2 = (x) => ((+x || 0) / 1000).toFixed(2).replace(".", ",");
const groesseText = (b) => (b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB");
const datumText = (t) => { try { return new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (f) { return ""; } };

/* ---------- Zustand anzeigen ---------- */
function gehe(m) {
  const seen = Speicher.merker("hint:" + m);
  st.modus = m; st.hint = m !== "start" && !seen && !MESSEN;
  if (st.hint) Speicher.merker("hint:" + m, 1);
  st.blatt = ""; waehleAb(); ring.hidden = true;
}
function render() {
  w.dataset.modus = st.modus;
  w.classList.toggle("leer", !B.haus && !!bue.style.backgroundImage);
  start.hidden = st.modus !== "start";
  $$("[data-k]").forEach((e) => { e.hidden = e.dataset.k !== st.modus; });
  hint.hidden = !(st.hint && st.modus !== "start"); ht.textContent = HINT[st.modus] || "";
  $$(".blatt").forEach((b) => b.classList.toggle("offen", st.modus === "modell" && st.blatt === b.dataset.b));
  $$(".leiste .lk[data-a^='blatt:']").forEach((b) => b.setAttribute("aria-pressed", String(st.blatt === b.dataset.a.split(":")[1])));
  $$(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.a === "ans:" + st.ans));
  $$(".chip").forEach((c) => {
    const e = B.ebenen.find((x) => x.name === c.dataset.e); if (!e) return;
    c.setAttribute("aria-pressed", String(e.an));
    c.setAttribute("aria-disabled", String(!!e.eltern && !e.eltern.an));
  });
  $$(".fuss .lk").forEach((b) => b.classList.toggle("on", b.dataset.a === "foto:" + st.foto));
  const titel = $(".pille.titel"); if (titel) titel.textContent = st.name;
  const zeigeKarte = st.modus === "modell" && !!st.sel;
  karte.hidden = !zeigeKarte; marke.hidden = !zeigeKarte;
  if (zeigeKarte) ort();
}
/* Karte und Markierung an der Tippstelle; folgt beim Zoomen */
function ort() {
  if (!st.sel) return;
  mess();
  const p = B.aufBild(st.sel.punkt);
  if (!p) { marke.hidden = true; return; }
  st.sel.x = p.x; st.sel.y = p.y;
  const cw = karte.offsetWidth, ch = karte.offsetHeight;
  const l = klemme(p.x - cw / 2, 12, W - 12 - cw);
  let t = p.y > H * 0.5 ? p.y - ch - 28 : p.y + 28;
  t = klemme(t, RAND.oben + 64, H - RAND.unten - 100 - ch);
  karte.style.left = l + "px"; karte.style.top = t + "px";
  marke.style.left = p.x + "px"; marke.style.top = p.y + "px";
  marke.hidden = p.x < 0 || p.y < 0 || p.x > W || p.y > H;
}
B.onBild = () => { if (st.sel && st.modus === "modell") ort(); };

/* ---------- 4. Bauteil ---------- */
function waehleAb() { st.sel = null; B.hebeAuf(); }
function bauteilKarte(z) {
  const bt = B.haus.bauteile, T_ = bt.texte, art = bt.arten[z[3]] || "";
  const name = T_[z[1]] || "Bauteil", gruppe = T_[z[2]] || "", material = T_[z[7]] || "";
  const ebHaus = (B.haus.ebenen || [])[z[8]], eb = ebHaus ? (B.ebenen.find((e) => e.name === ebHaus.name) || { anzeige: ebHaus.name }).anzeige : "";
  const b = z[4], h = z[5], l = z[6];
  let km = "";
  if (art === "Stab") km = mm(b) + " × " + mm(h) + " mm <small>· " + m2(l) + " m</small>";
  else if (art === "Platte") km = mm(h) + " mm <small>· " + m2(l) + " × " + m2(b) + " m</small>";
  else if (art === "Fenster") km = m2(b) + " × " + m2(h) + " m <small>· B × H</small>";
  const zeilen = [["Material", material], ["Ebene", eb]];
  if (art === "Stab" || art === "Platte") zeilen.push(["Bearbeitungen", String(z[9] || 0)]);
  karte.innerHTML = '<button class="x" type="button" data-a="karte" aria-label="Schließen">' + IC.x + "</button>" +
    '<div class="kn">' + esc(name) + "</div>" + (gruppe ? '<div class="kg">' + esc(gruppe) + "</div>" : "") +
    (km ? '<div class="km">' + km + "</div>" : '<div style="height:10px"></div>') +
    '<dl class="kz">' + zeilen.filter((r) => r[1]).map((r) => "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>").join("") + "</dl>";
}
function tippeBauteil(x, y) {
  const t = B.bauteilAn(x, y);
  const z = t && B.zeile(t.nr);
  if (!z) { waehleAb(); render(); return; }
  bauteilKarte(z);
  st.sel = { nr: t.nr, punkt: t.punkt, x, y }; st.blatt = "";
  B.hebeHervor(t.nr, t.netz);
  render();
}

/* ---------- 3. Ebenen ---------- */
function baueEbenen() {
  const liste = B.ebenen.map((e, i) => ({ e, i })).sort((a, b) => {
    const ha = a.e.eltern ? a.e.eltern.hoehe : a.e.hoehe, hb = b.e.eltern ? b.e.eltern.hoehe : b.e.hoehe;
    return hb - ha || a.i - b.i;
  });
  $(".chips").innerHTML = liste.map(({ e }) => '<button class="chip" type="button" data-a="eb" data-e="' + esc(e.name) + '" aria-pressed="true"><span>' + esc(e.anzeige) + '</span><i class="sw"></i></button>').join("");
}
function ansSetzen(p) {
  if (p === "aussen") B.allesUeberEGAn();
  if (p === "offen") B.egOffen();
  st.ans = p; waehleAb();
  B.ansicht(p);
}

/* ---------- 6. Fotos ---------- */
function baueRaeume() {
  const sps = (B.haus && B.haus.standpunkte) || [], gesehen = new Set();
  st.raeume = [];
  for (const s of sps) { const r = s.raum || s.name; if (gesehen.has(r)) continue; gesehen.add(r); st.raeume.push(s); }
  const kurzName = (s) => { const e = B.ebeneVon(s), r = s.raum || s.name; return e && r.startsWith(e.name + " ") ? r.slice(e.name.length + 1) : r; };
  $(".fliste").innerHTML = st.raeume.length ? st.raeume.map((s, i) => {
    const e = B.ebeneVon(s);
    return '<button class="frow" type="button" data-a="foto:' + i + '"><span class="th" data-raum="' + esc(s.raum) + '"></span><span class="ft"><b>' + esc(kurzName(s)) + "</b><i>" + esc(e ? e.anzeige : "") + " · Rundum-Blick</i></span>" + IC.vor + "</button>";
  }).join("") : '<p class="artext">In diesem Haus sind keine Standpunkte gespeichert.</p>';
  $(".fuss").innerHTML = st.raeume.map((s, i) => '<button class="lk" type="button" data-a="foto:' + i + '"><span>' + esc(kurzName(s)) + "</span></button>").join("");
  zeigeFotoVorschau();
}
function zeigeFotoVorschau() {
  $$(".fliste .th").forEach((th) => { const u = st.fotos[th.dataset.raum]; th.style.backgroundImage = u ? "url(" + u + ")" : ""; });
}
let fotosLaufen = false;
function fotosImHintergrund() {
  if (fotosLaufen) return;
  const offen = st.raeume.filter((s) => !st.fotos[s.raum]);
  if (!offen.length) return;
  fotosLaufen = true;
  const name = st.name;
  const eins = () => {
    if (st.name !== name || st.modus !== "modell") { fotosLaufen = false; return; }
    const s = offen.shift();
    if (!s) {
      fotosLaufen = false;
      Speicher.ergaenze(name, { fotos: st.fotos });
      return;
    }
    const a = B.augeVon(s);
    st.fotos[s.raum] = B.schnappschuss(a, [s.ziel[0], a[1], s.ziel[2]], 176, 112, 62, true);
    zeigeFotoVorschau();
    requestAnimationFrame(() => setTimeout(eins, 30));
  };
  requestAnimationFrame(() => setTimeout(eins, 60));
}
function zeigeFoto(i) {
  const s = st.raeume[i]; if (!s) return;
  if (st.modus !== "foto") { merkeEbenen(); gehe("foto"); }
  st.foto = i; B.alleAn(); B.foto(s);
  render();
  const b = $$(".fuss .lk")[i]; if (b) try { b.scrollIntoView({ inline: "center", block: "nearest" }); } catch (f) { /* alt */ }
}
function merkeEbenen() { if (!st.vorher) st.vorher = B.ebenenZustand(); }
function zurueckZumModell() {
  if (st.vorher) { B.ebenenSetzen(st.vorher); st.vorher = null; }
  gehe("modell"); B.ansicht(st.ans);
  render();
}
async function bildSpeichern() {
  const blob = await B.bildBlob(); if (!blob) { toast("Bild ließ sich nicht erzeugen"); return; }
  const s = st.raeume[st.foto], name = (st.name + " · " + (s ? s.raum : "Blick")).replace(/[\\/:*?"<>|]+/g, "-") + ".jpg";
  let datei = null; try { datei = new File([blob], name, { type: "image/jpeg" }); } catch (f) { /* altes Safari */ }
  if (T && datei && navigator.canShare && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: name }); return; } catch (f) { if (f && f.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast("Bild gespeichert");
}

/* ---------- 5. Hineingehen ---------- */
function hineingehen() {
  merkeEbenen(); gehe("innen"); B.alleAn(); B.innen(B.startpunkt()); render();
}
function zielring(x, y) {
  ring.hidden = false; ring.style.left = x + "px"; ring.style.top = y + "px";
  ring.style.animation = "none"; void ring.offsetWidth; ring.style.animation = "";
}
ring.addEventListener("animationend", () => { ring.hidden = true; });

/* ---------- 7. AR ---------- */
async function kamera(knopf) {
  if (st.beschaeftigt) return;
  st.beschaeftigt = true; knopf.setAttribute("aria-busy", "true"); knopf.textContent = "Wird vorbereitet …";
  try {
    if (!st.usdz) st.usdz = await baueUsdz(B);
    oeffneQuickLook(st.usdz, st.name);
  } catch (f) { console.error(f); toast("AR ließ sich nicht vorbereiten: " + (f.message || f)); }
  finally { st.beschaeftigt = false; knopf.removeAttribute("aria-busy"); knopf.textContent = "Kamera öffnen"; }
}

/* ---------- 1. Start: öffnen, zuletzt geöffnet ---------- */
function zeigeLaden(anteil, text) {
  laden.hidden = anteil === null; fehlerEl.hidden = true;
  if (anteil !== null) { $(".laden .lt").textContent = text || ""; $(".balken i").style.width = Math.round(anteil * 100) + "%"; }
  $$(".start .gross, .ablage").forEach((b) => { b.disabled = anteil !== null; });
}
function zeigeFehler(t) { zeigeLaden(null); fehlerEl.textContent = t; fehlerEl.hidden = false; }
const pause = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function oeffne(quelle) {
  /* quelle: {blob, eintrag?} */
  if (st.beschaeftigt) return;
  st.beschaeftigt = true;
  try {
    zeigeLaden(0.1, "Datei wird gelesen …"); await pause();
    const puffer = await quelle.blob.arrayBuffer();
    const kopf = glbKopf(puffer);
    zeigeLaden(0.25, "Haus wird entpackt …"); await pause();
    st.sel = null;
    await B.lade(puffer, (a, t) => zeigeLaden(0.2 + a * 0.75, t));
    st.name = kopf.name; st.usdz = null; st.vorher = null; st.ans = "aussen"; st.foto = 0;
    const jetzt = Date.now();
    let eintrag = quelle.eintrag;
    if (eintrag) { st.fotos = eintrag.fotos || {}; Speicher.ergaenze(eintrag.name, { geoeffnet: jetzt }); }
    else {
      st.fotos = {};
      eintrag = { name: kopf.name, datei: quelle.blob, groesse: quelle.blob.size, datum: quelle.blob.lastModified || jetzt, geoeffnet: jetzt, vorschau: null, fotos: {} };
      await Speicher.speichere(eintrag);
    }
    st.eintrag = eintrag;
    baueEbenen(); baueRaeume();
    zeigeLaden(null);
    gehe("modell"); mess(); B.groesse(W, H); B.ansicht("aussen", true);
    render();
    if (!eintrag.vorschau) {
      await pause(); await pause();
      const v = B.aussenBlick();
      const bild = B.schnappschuss(v.auge, v.ziel, 640, 480, 40, true);
      eintrag.vorschau = bild; Speicher.ergaenze(eintrag.name, { vorschau: bild });
    }
    zeigeListe();
  } catch (f) {
    if (f instanceof KeinHaus) console.warn(f.message); else console.error(f);
    gehe("start"); render();
    zeigeFehler(f instanceof KeinHaus ? f.message : "Das Haus ließ sich nicht öffnen: " + (f && f.message ? f.message : f));
  } finally { st.beschaeftigt = false; }
}

async function zeigeListe() {
  const liste = await Speicher.liste();
  const box = $(".zliste");
  $(".zl").hidden = !liste.length;
  /* Start ohne geladenes Haus: großes Vorschaubild des zuletzt geöffneten Hauses */
  if (!B.haus) { const v = liste.find((e) => e.vorschau); bue.style.backgroundImage = v ? "url(" + v.vorschau + ")" : ""; render(); }
  box.innerHTML = liste.map((e) =>
    '<div class="zrow" data-name="' + esc(e.name) + '"><button class="zo" type="button" data-a="zuletzt"><span class="th"' +
    (e.vorschau ? ' style="background-image:url(' + e.vorschau + ')"' : "") + '></span><span class="ft"><b>' + esc(e.name) + "</b><i>" +
    esc(datumText(e.datum) + " · " + groesseText(e.groesse || 0)) + "</i></span></button>" +
    '<button class="x" type="button" data-a="entfernen" aria-label="Aus der Liste entfernen">' + IC.x + "</button></div>").join("");
}
async function entferneEintrag(name, zeile) {
  if (zeile) { zeile.style.transform = "translateX(-110%)"; zeile.style.opacity = "0"; }
  await Speicher.entferne(name);
  setTimeout(zeigeListe, 200);
}
/* Wischen nach links entfernt einen Eintrag */
let wisch = null;
start.addEventListener("pointerdown", (ev) => {
  const z = ev.target.closest(".zrow"); if (!z) return;
  wisch = { z, x: ev.clientX, y: ev.clientY, dx: 0, an: false };
});
start.addEventListener("pointermove", (ev) => {
  if (!wisch) return;
  const dx = ev.clientX - wisch.x, dy = ev.clientY - wisch.y;
  if (!wisch.an && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { wisch.an = true; wisch.z.classList.add("zieht"); }
  if (wisch.an) { wisch.dx = Math.min(0, dx); wisch.z.style.transform = "translateX(" + wisch.dx + "px)"; }
});
const wischEnde = () => {
  if (!wisch) return;
  const { z, dx, an } = wisch; wisch = null;
  z.classList.remove("zieht");
  if (an) {
    z.dataset.gewischt = "1"; setTimeout(() => { delete z.dataset.gewischt; }, 50);
    if (dx < -Math.min(120, z.offsetWidth * 0.35)) entferneEintrag(z.dataset.name, z); else z.style.transform = "";
  }
};
start.addEventListener("pointerup", wischEnde);
start.addEventListener("pointercancel", wischEnde);

dateiFeld.addEventListener("change", () => {
  const f = dateiFeld.files && dateiFeld.files[0];
  dateiFeld.value = "";
  if (f) oeffne({ blob: f });
});
/* Rechner: Datei hineinziehen (überall) */
if (!T) {
  let tiefe = 0;
  window.addEventListener("dragenter", (ev) => { ev.preventDefault(); tiefe++; app.classList.add("ziehen"); });
  window.addEventListener("dragleave", () => { if (--tiefe <= 0) { tiefe = 0; app.classList.remove("ziehen"); } });
  window.addEventListener("dragover", (ev) => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("drop", (ev) => {
    ev.preventDefault(); tiefe = 0; app.classList.remove("ziehen");
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) { if (st.modus !== "start") { gehe("start"); render(); } oeffne({ blob: f }); }
  });
}

/* ---------- Klicks auf Knöpfe ---------- */
app.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-a]"); if (!b || !app.contains(b)) return;
  const a = b.dataset.a.split(":"), p = a[1];
  switch (a[0]) {
    case "waehlen": fehlerEl.hidden = true; dateiFeld.click(); return;
    case "zuletzt": {
      const z = b.closest(".zrow"); if (z.dataset.gewischt) return;
      Speicher.hole(z.dataset.name).then((e) => {
        if (e && e.datei) oeffne({ blob: e.datei, eintrag: e });
        else zeigeFehler("Dieses Haus ist nicht mehr im Gerät gespeichert. Bitte die Datei neu öffnen.");
      });
      return;
    }
    case "entfernen": entferneEintrag(b.closest(".zrow").dataset.name, b.closest(".zrow")); return;
    case "start": if (st.vorher) { B.ebenenSetzen(st.vorher); st.vorher = null; } gehe("start"); zeigeListe(); break;
    case "ans": ansSetzen(p); break;
    case "blatt":
      st.blatt = st.blatt === p ? "" : p; waehleAb();
      if (st.blatt === "fotos") fotosImHintergrund();
      break;
    case "zu": st.blatt = ""; break;
    case "eb": {
      const e = B.ebenen.find((x) => x.name === b.dataset.e); if (!e) return;
      B.setzeEbene(e.name, !e.an); waehleAb();
      if (st.ans !== "oben") st.ans = B.istOffen() ? "offen" : "aussen";
      break;
    }
    case "innen": hineingehen(); return;
    case "draussen": case "zumodell": zurueckZumModell(); return;
    case "foto": zeigeFoto(+p); return;
    case "speichern": bildSpeichern(); return;
    case "hint": st.hint = false; break;
    case "kamera": kamera(b); return;
    case "karte": waehleAb(); break;
    default: return;
  }
  render();
});

/* ---------- Ziehen und Tippen auf der Bühne ---------- */
const finger = new Map();
let d = null;
bue.addEventListener("pointerdown", (ev) => {
  if (st.modus === "start") return;
  finger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (finger.size > 1) { if (d) d.mehr = true; return; }
  d = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, m: false, mehr: false };
  if (st.modus !== "modell") try { bue.setPointerCapture(ev.pointerId); } catch (f) { /* egal */ }
});
bue.addEventListener("pointermove", (ev) => {
  if (!d || !finger.has(ev.pointerId)) return;
  finger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!d.m && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) {
    d.m = true;
    if (st.hint) { st.hint = false; hint.hidden = true; }
    if (st.blatt) { st.blatt = ""; render(); }
    if (st.sel && finger.size === 1 && st.modus === "modell") { waehleAb(); render(); }
  }
  if (d.m && !d.mehr && st.modus !== "modell") B.umsehen(ev.clientX - d.lx, ev.clientY - d.ly);
  d.lx = ev.clientX; d.ly = ev.clientY;
});
const loslassen = (ev) => {
  finger.delete(ev.pointerId);
  if (!d || finger.size) return;
  const war = d.m || d.mehr; d = null;
  if (war || ev.type === "pointercancel") return;
  const r = bue.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  if (st.hint) st.hint = false;
  if (st.modus === "modell") {
    if (st.blatt) st.blatt = "";
    else if (st.sel) waehleAb();
    else { tippeBauteil(x, y); return; }
  } else if (st.modus === "innen") {
    const z = B.geheZu(x, y);
    if (z.ziel) zielring(x, y); else toast(z.grund, 1600);
  }
  render();
};
bue.addEventListener("pointerup", loslassen);
bue.addEventListener("pointercancel", loslassen);
bue.addEventListener("wheel", () => { if (st.hint) { st.hint = false; hint.hidden = true; } }, { passive: true });

/* ---------- Tasten: Esc = einen Schritt zurück, Pfeile/WASD = gehen ---------- */
const GEHEN = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (st.blatt) st.blatt = "";
    else if (st.sel) waehleAb();
    else if (!hint.hidden) st.hint = false;
    else if (st.modus === "foto" || st.modus === "innen") { zurueckZumModell(); return; }
    else return;
    render(); return;
  }
  if (st.modus === "innen" && GEHEN.has(ev.code) && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault(); B.taste(ev.code, true);
    if (st.hint) { st.hint = false; hint.hidden = true; }
  }
});
document.addEventListener("keyup", (ev) => { if (GEHEN.has(ev.code)) B.taste(ev.code, false); });
window.addEventListener("blur", () => { for (const c of GEHEN) B.taste(c, false); });

/* ---------- Größe ---------- */
try { new ResizeObserver(() => { mess(); B.groesse(W, H); render(); }).observe(bue); } catch (f) { window.addEventListener("resize", () => { mess(); B.groesse(W, H); render(); }); }
mess(); B.groesse(W, H);

/* ---------- Start ---------- */
async function holeAdresse(url) {
  zeigeLaden(0.02, "Haus wird geladen …");
  const r = await fetch(url);
  if (!r.ok) throw new Error("Datei nicht gefunden (" + r.status + ")");
  const gesamt = +r.headers.get("Content-Length") || 0;
  if (!r.body || !gesamt) return new Blob([await r.arrayBuffer()]);
  const leser = r.body.getReader(), teile = []; let n = 0;
  for (;;) {
    const { done, value } = await leser.read(); if (done) break;
    teile.push(value); n += value.length;
    zeigeLaden(0.02 + 0.18 * n / gesamt, "Haus wird geladen … " + Math.round(n / 1e6) + " von " + Math.round(gesamt / 1e6) + " MB");
  }
  return new Blob(teile);
}

if (MESSEN) {
  const pre = document.createElement("pre"); pre.className = "messung"; pre.textContent = "Messung " + MESSEN + " …"; w.appendChild(pre);
  (async () => {
    try {
      const blob = await holeAdresse(Q.get("datei") || "haeuser/entwurf7.glb");
      await B.lade(await blob.arrayBuffer(), (a, t) => { pre.textContent = "Messung " + MESSEN + ": " + t; });
      st.name = B.haus.name; gehe("modell"); render();
      start.hidden = true; $$("[data-k]").forEach((e) => { e.hidden = true; });
      const { messe } = await import("./messen.js");
      const erg = await messe(B, MESSEN, (t) => { pre.textContent = t; });
      pre.textContent = JSON.stringify(erg, null, 1);
      window.__messErgebnis = erg;
    } catch (f) { console.error(f); pre.textContent = "Messung fehlgeschlagen: " + (f.message || f); window.__messErgebnis = { fehler: String(f.message || f) }; }
  })();
} else {
  render(); zeigeListe();
  if (Q.get("datei")) {
    holeAdresse(Q.get("datei")).then((blob) => oeffne({ blob })).catch((f) => zeigeFehler("Das Haus ließ sich nicht laden: " + f.message));
  }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    /* erst wenn die Seite steht, damit das Laden nicht gebremst wird */
    setTimeout(() => navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Speicher */ }), 4000);
  }
}
