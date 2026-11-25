// HealthPilot – KI-Coach (optional). Anfragen gehen direkt vom iPhone an die Anthropic-API.
// Der API-Schlüssel wird nur lokal auf dem Gerät gespeichert und nie in den Programmcode geschrieben.
import { allergenHits } from './food.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 – empfohlen'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 – günstiger, etwas einfacher'],
];
export const DEFAULT_SETTINGS = {
  apiKey: '', model: 'claude-sonnet-5-5', shareHealth: false, preview: true, monthlyBudgetUsd: 10,
  // Preise in US-$ pro 1 Mio. Tokens – bitte mit platform.claude.com/docs (Pricing) abgleichen und hier anpassen
  priceIn: 3, priceOut: 15,
};

export const MODULES = {
  heute: { label: 'Tagescoach', intro: 'Ich kenne deinen heutigen Plan und deine letzten Tage.', quick: ['Was ist heute am wichtigsten?', 'Ich habe heute wenig Energie – was soll ich anpassen?', 'Mein Tag ist anders gelaufen als geplant. Wie rette ich den Rest?'] },
  ernaehrung: { label: 'Ernährungscoach', intro: 'Ich kenne deinen Speiseplan, Vorräte, Allergien und bisherige Mahlzeiten.', quick: ['Was soll ich heute Abend essen?', 'Ich habe heute keine Lust zu kochen.', 'Ich bin gerade bei Rewe – was soll ich mitnehmen?', 'Ich habe heute Mittag sehr viel gegessen.', 'Ich habe noch Hähnchen, Reis und Tomaten im Kühlschrank.', 'Ich möchte am Wochenende grillen.', 'Ist dieses Fertiggericht für meine Ziele geeignet?', 'Welches Gericht dieser Speisekarte empfiehlst du mir?'] },
  fitness: { label: 'Fitnesscoach', intro: 'Ich kenne deinen Wochenplan, deine Umsetzung und deine Watch-Daten.', quick: ['Ich habe heute nur 15 Minuten.', 'Mein Personal Training ist ausgefallen.', 'Ich bin unterwegs im Hotel – was kann ich machen?', 'Wie steigere ich meine Ausdauer in den nächsten Wochen?', 'Mein Rücken zwickt – was geht trotzdem?'] },
  alkohol: { label: 'Alkohol-Coach', intro: 'Ich kenne deinen Konsum der letzten Wochen und deine Ziele.', quick: ['Ich gehe heute Abend feiern – wie halte ich mein Ziel?', 'Wie realistisch ist mein aktuelles Wochenziel?', 'Welche alkoholfreien Alternativen passen zu mir?'] },
  rauchen: { label: 'Rauchstopp-Coach', intro: 'Ich kenne deinen Verlauf, deine Auslöser und deinen Reduktionsplan.', quick: ['Was kann ich bei meinem häufigsten Auslöser tun?', 'Ich habe einen Rückschlag gehabt.', 'Bin ich bereit für einen Rauchstopp-Termin?', 'Welche Hilfen zum Aufhören gibt es?'] },
  schlaf: { label: 'Schlaf-Coach', intro: 'Ich kenne deine Schlafdaten, Belastung und Abende mit Alkohol.', quick: ['Warum schlafe ich schlecht?', 'Wie verbessere ich meinen Schlaf diese Woche?', 'Soll ich heute trotz schlechter Nacht trainieren?'] },
  auswertung: { label: 'Auswertungs-Coach', intro: 'Ich kenne deine Entwicklung seit Beginn.', quick: ['Fasse meine letzte Woche ehrlich zusammen.', 'Welche drei Dinge bringen mir jetzt am meisten?', 'Wo scheitere ich regelmäßig – und warum?', 'Hinterfrage meine aktuellen Ziele.'] },
};

export function systemPrompt(moduleKey, today) {
  const m = MODULES[moduleKey] || MODULES.heute;
  return `Du bist der ${m.label} in der App „HealthPilot“, einem persönlichen Gesundheits- und Gewohnheitscoach für einen erwachsenen Mann in Chemnitz (Deutschland). Heute ist ${today}.

Haltung und Stil:
- Antworte auf Deutsch, knapp und für einen iPhone-Bildschirm geeignet (meist 4–10 Sätze oder eine kurze Liste). Metrische Einheiten, deutsche Datumsformate.
- Sachlich, konstruktiv, bei Bedarf kritisch. Kein ständiges Loben, nicht nach dem Mund reden. Ziele hinterfragen, Überforderung ansprechen, Prioritäten setzen. Rückschläge ohne Schuldzuweisung behandeln.
- Trenne erkennbar zwischen „Fakt:“ (aus den Daten), „Schluss:“ (Ableitung) und „Vermutung:“ (unsicher), wenn das die Aussage klarer macht. Wenn Daten fehlen oder eine Empfehlung unsicher ist, sage es ausdrücklich. Erfinde keine Messwerte, Produkte, Restaurants oder Quellen.
- Konkret und sofort umsetzbar: Mengen, Zeiten, Dauer, Alternativen. Alltagstauglich, wenig Aufwand, Convenience-Produkte sind erlaubt und werden nach Nährwerten beurteilt, nicht pauschal.

Sicherheitsregeln (haben Vorrang):
- Keine Diagnosen, keine Medikamentenempfehlungen oder -dosierungen. Bei Warnzeichen (Brustschmerz, Atemnot, Ohnmacht, Herzrasen, starke Schmerzen, sehr hoher Blutdruck) sofort ärztliche Abklärung bzw. Notruf 112 empfehlen.
- Allergien: Erdnuss und Avocado (echte Allergie, Notfallset vorhanden) – niemals einplanen, auch nicht als Öl, Sauce, Topping. Nüsse und Nussöle (Abneigung) ebenfalls nie einplanen. „Kann Spuren von Erdnüssen enthalten“ ist für ihn in Ordnung. Bei Restaurantgerichten, Fertigprodukten, Fotos und Speisekarten gelten Allergene immer als NICHT bestätigt: weise auf Nachfragen bzw. Etikett-Prüfung hin. Besonders riskant: asiatische Küche, Currys, Pesto, Saucen, Dressings, Bowls/Sushi (Avocado).
- Keine Crash-Diäten, kein Ausgleichsfasten nach üppigen Mahlzeiten, keine unnötigen Nahrungsergänzungsmittel.
- Alkohol: keine Menge als risikofrei darstellen. Bei Hinweisen auf Abhängigkeit oder Entzugssymptome ärztliche Begleitung empfehlen.
- Rauchen: evidenzbasierte Hilfen nennen, wenn passend (Nikotinersatz nach ärztlicher/pharmazeutischer Beratung, Verhaltensprogramme, Rauchfrei-Telefon 0800 8 31 31 31).
- Apple-Watch-Werte sind Orientierung, keine Diagnostik. Zusammenhänge sind Korrelationen, keine bewiesenen Ursachen.

Vorschläge zum Übernehmen:
Wenn du konkrete Mahlzeiten, Trainingseinheiten oder Einkaufsartikel vorschlägst, die der Nutzer mit einem Tipp übernehmen kann, hänge GANZ AM ENDE genau einen Codeblock an:
\`\`\`aktionen
[ ...JSON-Liste... ]
\`\`\`
Erlaubte Einträge:
{"typ":"rezept","rezept_id":"<ID aus der Rezeptbibliothek>","datum":"JJJJ-MM-TT","slot":"frueh|mittag|abend|snack"}
{"typ":"mahlzeit","datum":"JJJJ-MM-TT","slot":"frueh|mittag|abend|snack","titel":"…","strategie":"kochen|convenience|ohne|bestellen|restaurant","zutaten":[{"name":"…","menge":"…"}],"schritte":["…"],"aktiv_min":0,"gesamt_min":0,"kcal":0,"protein_g":0,"ballaststoffe_g":0,"gemuese":true,"vollkorn":false,"allergen_hinweis":"…"}
{"typ":"training","datum":"JJJJ-MM-TT","titel":"…","dauer_min":0,"intensitaet":"…","schritte":["…"]}
{"typ":"einkauf","artikel":["…"]}
Bevorzuge Rezepte aus der Bibliothek (per rezept_id). Nährwerte sind Schätzungen. Ohne konkrete Vorschläge keinen Aktionsblock.`;
}

export function parseActions(text) {
  const m = String(text || '').match(/```aktionen\s*([\s\S]*?)```/);
  const clean = String(text || '').replace(/```aktionen[\s\S]*?(```|$)/, '').trim();
  if (!m) return { clean, actions: [], error: null };
  try {
    const arr = JSON.parse(m[1].trim());
    return { clean, actions: Array.isArray(arr) ? arr.slice(0, 10) : [], error: null };
  } catch { return { clean, actions: [], error: 'Die Vorschläge der KI konnten nicht gelesen werden.' }; }
}

// Prüft einen Vorschlag; Allergenfunde blockieren die Übernahme
export function checkAction(a, { recipeIds = [], today } = {}) {
  const warn = []; let ok = true;
  const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  if (!a || typeof a !== 'object') return { ok: false, warn: ['Ungültiger Vorschlag'] };
  if (['rezept', 'mahlzeit', 'training'].includes(a.typ) && !dateOk(a.datum)) { a.datum = today; warn.push('Kein gültiges Datum – heute angenommen.'); }
  if (a.typ === 'rezept') {
    if (!recipeIds.includes(a.rezept_id)) return { ok: false, warn: ['Unbekanntes Rezept'] };
  } else if (a.typ === 'mahlzeit') {
    const txt = [a.titel, ...(a.zutaten || []).map((z) => `${z.name}`), ...(a.schritte || [])].join(' ');
    const hits = allergenHits(txt);
    if (hits.length) { ok = false; warn.push(`Enthält laut Text: ${[...new Set(hits)].join(', ')} – wird aus Sicherheitsgründen nicht übernommen.`); }
    warn.push('KI-Vorschlag: Nährwerte geschätzt, Allergenfreiheit nicht verifiziert – Zutaten/Etiketten prüfen.');
    if (!['frueh', 'mittag', 'abend', 'snack'].includes(a.slot)) a.slot = 'abend';
  } else if (a.typ === 'training') {
    if (!(a.dauer_min > 0 && a.dauer_min <= 180)) a.dauer_min = 20;
  } else if (a.typ === 'einkauf') {
    const hits = (a.artikel || []).flatMap((x) => allergenHits(x));
    if (hits.length) { warn.push(`Enthält ${[...new Set(hits)].join(', ')} – diese Artikel werden nicht übernommen.`); a.artikel = (a.artikel || []).filter((x) => !allergenHits(x).length); }
  } else return { ok: false, warn: ['Unbekannter Vorschlagstyp'] };
  return { ok, warn };
}

export function costUsd(usage, s) {
  if (!usage) return 0;
  return ((usage.input_tokens || 0) * (s.priceIn || 3) + (usage.output_tokens || 0) * (s.priceOut || 15)) / 1e6;
}

export async function callApi({ apiKey, model, system, messages, maxTokens = 1400, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt.');
  let res;
  try {
    res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
  } catch {
    throw new Error('Keine Verbindung zur KI. Bist du online? Die Funktionen ohne KI stehen weiter zur Verfügung.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) {
    const msg = data?.error?.message || '';
    if (res.status === 401) throw new Error('Der API-Schlüssel wird nicht akzeptiert. Bitte im Profil prüfen.');
    if (res.status === 400 && /credit|balance/i.test(msg)) throw new Error('Das Guthaben im Anthropic-Konto ist aufgebraucht.');
    if (res.status === 404 || /model/i.test(msg)) throw new Error(`Modell nicht verfügbar (${model}). Bitte im Profil ein anderes Modell wählen.`);
    if (res.status === 429) throw new Error('Zu viele Anfragen in kurzer Zeit – bitte gleich nochmal versuchen.');
    if (res.status >= 500) throw new Error('Der KI-Dienst ist gerade überlastet – bitte später erneut versuchen.');
    throw new Error(`KI-Fehler ${res.status}${msg ? ': ' + msg : ''}`);
  }
  const text = (data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  return { text, usage: data?.usage || null, stop: data?.stop_reason };
}

// Bild verkleinern (spart Kosten) und als Base64-JPEG liefern
export function imageToBase64(file, maxSide = 1400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.8);
      resolve({ base64: data.split(',')[1], preview: data, media_type: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}
