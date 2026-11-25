/* "Zuletzt geöffnet": Häuser bleiben im Gerät (IndexedDB). Jeder Zugriff in try/catch – ohne Speicher geht die App trotzdem. */
const DB = "strongcad-viewer", ST = "haeuser", HOECHSTENS = 5;
let dbVersprechen = null;

function db() {
  if (!dbVersprechen) dbVersprechen = new Promise((ok, nein) => {
    let q;
    try { q = indexedDB.open(DB, 1); } catch (f) { nein(f); return; }
    q.onupgradeneeded = () => { try { q.result.createObjectStore(ST, { keyPath: "name" }); } catch (f) { /* schon da */ } };
    q.onsuccess = () => ok(q.result);
    q.onerror = () => nein(q.error);
    q.onblocked = () => nein(new Error("Speicher belegt"));
  }).catch((f) => { dbVersprechen = null; throw f; });
  return dbVersprechen;
}

function vorgang(modus, arbeit) {
  return db().then((d) => new Promise((ok, nein) => {
    let t, erg;
    try { t = d.transaction(ST, modus); erg = arbeit(t.objectStore(ST)); } catch (f) { nein(f); return; }
    t.oncomplete = () => ok(erg && "result" in erg ? erg.result : undefined);
    t.onerror = () => nein(t.error); t.onabort = () => nein(t.error);
  }));
}

/** Alle Einträge, neuestes zuerst (ohne Fehler: leere Liste). */
export async function liste() {
  try {
    const alle = (await vorgang("readonly", (s) => s.getAll())) || [];
    return alle.sort((a, b) => (b.geoeffnet || 0) - (a.geoeffnet || 0));
  } catch (f) { return []; }
}

/** Haus speichern; gleicher Hausname ersetzt den alten Eintrag; mehr als 5 → ältester fällt heraus. */
export async function speichere(eintrag) {
  try {
    await vorgang("readwrite", (s) => s.put(eintrag));
    const alle = await liste();
    for (const alt of alle.slice(HOECHSTENS)) await entferne(alt.name);
    return true;
  } catch (f) { return false; }
}

export async function hole(name) {
  try { return await vorgang("readonly", (s) => s.get(name)); } catch (f) { return null; }
}

export async function entferne(name) {
  try { await vorgang("readwrite", (s) => s.delete(name)); return true; } catch (f) { return false; }
}

/** Felder eines Eintrags ergänzen (Vorschaubild, Fotos, Zeitpunkt). */
export async function ergaenze(name, felder) {
  try {
    const e = await hole(name); if (!e) return false;
    Object.assign(e, felder);
    await vorgang("readwrite", (s) => s.put(e));
    return true;
  } catch (f) { return false; }
}

/** kleine Merker (Hinweis schon gesehen) – localStorage nur in try/catch */
export function merker(schluessel, wert) {
  try {
    if (wert === undefined) return localStorage.getItem("scv:" + schluessel);
    localStorage.setItem("scv:" + schluessel, String(wert));
  } catch (f) { /* ohne Speicher */ }
  return null;
}
