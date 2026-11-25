// HealthPilot – Berechnungslogik (ohne DOM, testbar mit Node)
// Alle Funktionen sind rein: Eingabe -> Ausgabe, keine Seiteneffekte.

export const VERSION = '2.0.0';

/* ---------------- Datum ---------------- */
const pad = (n) => String(n).padStart(2, '0');
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // Mittag: robust gegen Sommerzeit
}
export function addDays(s, n) {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function daysBetween(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / 86400000);
}
export function fmtDate(s, withYear = true) {
  if (!s) return '–';
  const [y, m, d] = s.split('-');
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`;
}
export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function weekday(s) { return parseIso(s).getDay(); }
export function mondayOf(s) {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}
export function range(start, n) {
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

/* ---------------- Zahlenformat (deutsch) ---------------- */
export function fmtNum(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 8.234 -> 8234
  else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------- Alkohol ---------------- */
// Dichte von Ethanol ~0,8 g/ml; 7 kcal pro g Alkohol
export const ALCOHOL_PRESETS = [
  { id: 'bier05', label: 'Bier 0,5 l', kind: 'Bier', ml: 500, abv: 5 },
  { id: 'bier033', label: 'Bier 0,33 l', kind: 'Bier', ml: 330, abv: 5 },
  { id: 'wein', label: 'Wein 0,2 l', kind: 'Wein', ml: 200, abv: 12 },
  { id: 'sekt', label: 'Sekt 0,1 l', kind: 'Sekt', ml: 100, abv: 11 },
  { id: 'cocktail', label: 'Cocktail', kind: 'Cocktail', ml: 250, abv: 10, estimated: true },
  { id: 'schnaps', label: 'Spirituose 2 cl', kind: 'Spirituose', ml: 20, abv: 40 },
  { id: 'alkfrei', label: 'Alkoholfreies Bier 0,5 l', kind: 'Bier alkoholfrei', ml: 500, abv: 0.5 },
];
export function alcoholGrams(ml, abv) {
  const m = parseNum(ml), a = parseNum(abv);
  if (m === null || a === null || m < 0 || a < 0 || a > 100) return null;
  return Math.round(m * (a / 100) * 0.8 * 10) / 10;
}
export const alcoholKcal = (g) => Math.round(g * 7);

/* AUDIT-C (3 Fragen, je 0–4). Für Männer gilt ab 4 Punkten ein auffälliges Ergebnis. */
export function auditC(a1, a2, a3) {
  if ([a1, a2, a3].some((x) => x === null || x === undefined)) return null;
  const score = a1 + a2 + a3;
  return { score, flag: score >= 4, high: score >= 8 };
}

/* Heaviness of Smoking Index (0–6) aus Zeit bis zur ersten Zigarette und Zigaretten/Tag */
export function hsi(minutesToFirst, cigsPerDay) {
  if (minutesToFirst === null || minutesToFirst === undefined || cigsPerDay === null || cigsPerDay === undefined) return null;
  const t = minutesToFirst <= 5 ? 3 : minutesToFirst <= 30 ? 2 : minutesToFirst <= 60 ? 1 : 0;
  const c = cigsPerDay >= 31 ? 3 : cigsPerDay >= 21 ? 2 : cigsPerDay >= 11 ? 1 : 0;
  const score = t + c;
  return { score, level: score >= 5 ? 'hoch' : score >= 3 ? 'mittel' : 'gering' };
}

/* ---------------- Trinken ---------------- */
export const DRINK_KINDS = [
  { id: 'wasser', label: 'Wasser', counts: true },
  { id: 'tee', label: 'Tee', counts: true },
  { id: 'kaffee', label: 'Kaffee', counts: true },
  { id: 'softdrink', label: 'Softdrink/Saft', counts: true },
  { id: 'sonstiges', label: 'Sonstiges', counts: true },
];
// Vorschlag fürs Trinkziel (Getränke, ohne Wasser aus Lebensmitteln).
// Orientierung: DGE ca. 1,5 l Getränke/Tag für Erwachsene, mehr bei Hitze/Bewegung.
export function hydrationSuggestion(profile = {}) {
  if (profile.fluidRestriction) {
    return { ml: parseNum(profile.fluidRestrictionMl) || null, reason: 'Ärztlich festgelegte Trinkmenge – HealthPilot übernimmt nur diesen Wert.' };
  }
  const w = parseNum(profile.weight);
  let ml = 1500;
  const parts = ['Grundwert 1,5 l (Orientierung DGE)'];
  if (w && w > 60) {
    const add = Math.min(700, Math.round(((w - 60) * 25) / 50) * 50);
    if (add > 0) { ml += add; parts.push(`+${fmtNum(add)} ml für ${fmtNum(w)} kg Körpergewicht`); }
  }
  return { ml, trainingExtra: 500, reason: parts.join(', ') + '. An Trainingstagen +500 ml. Du kannst den Wert jederzeit anpassen.' };
}
// Anteil des Tagesziels, der bis zu einer Uhrzeit erreicht sein sollte (07–21 Uhr)
export function hydrationExpectedShare(hour) {
  if (hour <= 7) return 0;
  if (hour >= 21) return 1;
  return (hour - 7) / 14;
}

/* ---------------- Gewicht ---------------- */
export function bmi(weight, heightCm) {
  const w = parseNum(weight), h = parseNum(heightCm);
  if (!w || !h) return null;
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10;
}
export function weightRange(heightCm) {
  const h = parseNum(heightCm) / 100;
  if (!h) return null;
  return { min: Math.round(18.5 * h * h * 10) / 10, max: Math.round(24.9 * h * h * 10) / 10 };
}
// Bauchumfang Männer: ab 94 cm erhöht, ab 102 cm deutlich erhöht (WHO-Grenzwerte)
export function waistRisk(cm) {
  const c = parseNum(cm);
  if (!c) return null;
  return c >= 102 ? 'deutlich erhöht' : c >= 94 ? 'erhöht' : 'unauffällig';
}

/* ---------------- Tagesaggregation ---------------- */
// Ein Eintrag: { id, type, date, ts, value, unit, source, sub, meta }
// source: 'manuell' | 'import' | 'gemessen' | 'geschaetzt' | 'plan'
export const IMPORT_METRICS = {
  steps: { label: 'Schritte', unit: '', min: 0, max: 100000, digits: 0, agg: 'sum' },
  distance: { label: 'Strecke', unit: 'km', min: 0, max: 150, digits: 1, agg: 'sum' },
  activeKcal: { label: 'Aktive Energie', unit: 'kcal', min: 0, max: 8000, digits: 0, agg: 'sum' },
  restingKcal: { label: 'Ruheenergie', unit: 'kcal', min: 500, max: 5000, digits: 0, agg: 'sum' },
  exerciseMin: { label: 'Trainingsminuten', unit: 'min', min: 0, max: 720, digits: 0, agg: 'sum' },
  rhr: { label: 'Ruhepuls', unit: 'bpm', min: 30, max: 130, digits: 0, agg: 'avg' },
  hrv: { label: 'HRV', unit: 'ms', min: 5, max: 300, digits: 0, agg: 'avg' },
  vo2: { label: 'VO₂max', unit: 'ml/kg/min', min: 10, max: 90, digits: 1, agg: 'avg' },
  weight: { label: 'Gewicht', unit: 'kg', min: 30, max: 300, digits: 1, agg: 'last' },
  sleepH: { label: 'Schlafdauer', unit: 'h', min: 0, max: 16, digits: 1, agg: 'sum' },
  deepH: { label: 'Tiefschlaf', unit: 'h', min: 0, max: 8, digits: 1, agg: 'sum' },
  remH: { label: 'REM-Schlaf', unit: 'h', min: 0, max: 8, digits: 1, agg: 'sum' },
};
export const MANUAL_METRICS = {
  weight: 'Gewicht', waist: 'Bauchumfang', bpSys: 'Blutdruck systolisch', bpDia: 'Blutdruck diastolisch',
  rhr: 'Ruhepuls', sleepH: 'Schlafdauer', steps: 'Schritte', exerciseMin: 'Trainingsminuten',
};

export function emptyDay(date) {
  return {
    date, fluidMl: 0, drinks: 0, softMl: 0, alcoholG: 0, alcoholDrinks: 0, cigs: 0, cigHours: [],
    meals: [], checkin: null, metrics: {}, sources: {}, workoutMin: 0,
  };
}

// metrics: Priorität manuell > import (manuelle Korrektur schlägt Import)
export function aggregateDays(entries) {
  const days = {};
  const get = (d) => (days[d] ||= emptyDay(d));
  const sorted = [...entries].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  for (const e of sorted) {
    if (!e || !e.date || e.deleted) continue;
    const day = get(e.date);
    switch (e.type) {
      case 'drink': {
        const ml = parseNum(e.value) || 0;
        day.fluidMl += ml; day.drinks += 1;
        if (e.sub === 'softdrink') day.softMl += ml;
        break;
      }
      case 'alcohol': {
        day.alcoholG += parseNum(e.meta?.grams) || 0; day.alcoholDrinks += 1;
        break;
      }
      case 'cig': {
        const n = parseNum(e.value) || 1;
        day.cigs += n;
        if (e.ts) day.cigHours.push({ hour: new Date(e.ts).getHours(), trigger: e.meta?.trigger || null, n });
        break;
      }
      case 'meal': day.meals.push(e); break;
      case 'checkin': day.checkin = e.meta; break;
      case 'workout': day.workoutMin += parseNum(e.value) || 0; break;
      case 'metric': {
        const k = e.sub; const v = parseNum(e.value);
        if (v === null) break;
        const prev = day.sources[k];
        // manuelle Werte überschreiben Importe desselben Tages
        if (prev === 'manuell' && e.source === 'import') break;
        day.metrics[k] = v; day.sources[k] = e.source;
        break;
      }
      default: break;
    }
  }
  for (const d of Object.values(days)) {
    d.fluidMl = Math.round(d.fluidMl);
    d.alcoholG = Math.round(d.alcoholG * 10) / 10;
  }
  return days;
}

// Ist der Konsum (Getränke/Alkohol/Zigaretten) für einen Tag vollständig dokumentiert?
export function consumptionTracked(day) {
  if (!day) return false;
  return !!(day.checkin && day.checkin.complete);
}
export function trainingMinutes(day) {
  if (!day) return null;
  const imp = day.metrics.exerciseMin;
  const own = day.workoutMin || 0;
  if (imp === undefined && !own) return null;
  return Math.max(imp || 0, own); // nicht doppelt zählen: Watch erfasst Trainings meist selbst
}

/* ---------------- Statistik ---------------- */
export function mean(arr) {
  const v = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export function movingAverage(points, window = 7) {
  // points: [{date, value}] sortiert; Mittel über Kalendertage
  return points.map((p) => {
    const from = addDays(p.date, -(window - 1));
    const vals = points.filter((q) => q.date >= from && q.date <= p.date).map((q) => q.value);
    return { date: p.date, value: mean(vals) };
  });
}
export function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
export function describeCorrelation(r, n) {
  if (r === null) return 'nicht berechenbar';
  const a = Math.abs(r);
  const s = a >= 0.5 ? 'deutlicher' : a >= 0.3 ? 'mäßiger' : a >= 0.1 ? 'schwacher' : 'kein erkennbarer';
  return `${s} ${a >= 0.1 ? (r > 0 ? 'gleichläufiger' : 'gegenläufiger') : ''} Zusammenhang (r = ${fmtNum(r, 2)}, n = ${n})`.replace('  ', ' ');
}

/* ---------------- Lifestyle-Score ---------------- */
export const SCORE_WEIGHTS = {
  bewegung: { label: 'Bewegung & Fitness', w: 25 },
  tabak: { label: 'Tabak', w: 20 },
  ernaehrung: { label: 'Ernährung', w: 20 },
  schlaf: { label: 'Schlaf & Regeneration', w: 15 },
  alkohol: { label: 'Alkohol', w: 15 },
  trinken: { label: 'Flüssigkeit', w: 5 },
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function sleepPoints(h) {
  if (h === null || h === undefined) return null;
  if (h >= 7 && h <= 9) return 100;
  if (h < 7) return Math.max(0, 100 - (7 - h) * 25);
  return Math.max(50, 100 - (h - 9) * 20);
}
export function mealPoints(meal) {
  const m = meal.meta || {};
  return (m.veg ? 40 : 0) + (m.protein ? 35 : 0) + (m.whole ? 25 : 0);
}

export function computeScore(days, profile, goals, endDate) {
  const win = range(addDays(endDate, -6), 7).map((d) => days[d] || emptyDay(d));
  const cats = {};

  // Bewegung: Schritte (Ø vs. Ziel) + Trainingsminuten (Woche vs. 150 min WHO)
  {
    const stepVals = win.map((d) => d.metrics.steps).filter((v) => v !== undefined);
    const tm = win.map(trainingMinutes);
    const tmDays = tm.filter((v) => v !== null).length;
    const stepGoal = parseNum(goals.steps) || 8000;
    const parts = []; const details = [];
    if (stepVals.length) {
      const avg = mean(stepVals);
      parts.push(clamp01(avg / stepGoal));
      details.push(`Ø ${fmtNum(avg)} Schritte (Ziel ${fmtNum(stepGoal)})`);
    }
    const weekMin = tm.reduce((a, b) => a + (b || 0), 0);
    const anyActivityData = tmDays > 0 || stepVals.length > 0;
    if (anyActivityData) {
      parts.push(clamp01(weekMin / 150));
      details.push(`${fmtNum(weekMin)} Trainingsminuten in 7 Tagen (WHO-Orientierung ≥ 150)`);
    }
    cats.bewegung = parts.length
      ? { score: Math.round(mean(parts) * 100), detail: details.join(' · '), coverage: Math.max(stepVals.length, tmDays) / 7 }
      : { score: null, detail: 'Noch keine Schritt- oder Trainingsdaten', coverage: 0 };
  }

  // Tabak
  {
    const tracked = win.filter((d) => consumptionTracked(d) || d.cigs > 0);
    const base = parseNum(profile.cigsPerDay);
    if (!profile.smoker) {
      cats.tabak = { score: tracked.some((d) => d.cigs > 0) ? 60 : 100, detail: 'Nichtraucher', coverage: 1 };
    } else if (!tracked.length) {
      cats.tabak = { score: null, detail: 'Keine vollständig erfassten Tage', coverage: 0 };
    } else {
      const avg = mean(tracked.map((d) => d.cigs));
      const free = tracked.filter((d) => d.cigs === 0).length;
      let s;
      if (base && base > 0) s = Math.max(0, 20 + 80 * (1 - avg / base));
      else s = avg === 0 ? 100 : Math.max(0, 100 - avg * 5);
      cats.tabak = {
        score: Math.round(s),
        detail: `Ø ${fmtNum(avg, 1)} Zigaretten/Tag${base ? ` (Ausgangswert ${fmtNum(base)})` : ''}, ${free} rauchfreie Tage`,
        coverage: tracked.length / 7,
      };
    }
  }

  // Ernährung (Stufe 1: Schnellbewertung der Mahlzeiten bzw. Abend-Check-in)
  {
    const dayScores = [];
    for (const d of win) {
      if (d.meals.length) dayScores.push(mean(d.meals.map(mealPoints)));
      else if (d.checkin && d.checkin.food) dayScores.push({ 1: 25, 2: 60, 3: 90 }[d.checkin.food] ?? null);
    }
    const v = dayScores.filter((x) => x !== null);
    cats.ernaehrung = v.length
      ? { score: Math.round(mean(v)), detail: `${v.length} bewertete Tage (Gemüse/Obst, Protein, Vollkorn)`, coverage: v.length / 7 }
      : { score: null, detail: 'Noch keine Mahlzeiten bewertet', coverage: 0 };
  }

  // Schlaf
  {
    const hs = win.map((d) => d.metrics.sleepH).filter((v) => v !== undefined);
    const qs = win.map((d) => d.checkin?.sleepQ).filter((v) => v);
    const parts = []; const det = [];
    if (hs.length) { const a = mean(hs); parts.push([sleepPoints(a), 0.7]); det.push(`Ø ${fmtNum(a, 1)} h Schlaf`); }
    if (qs.length) { const q = mean(qs); parts.push([((q - 1) / 4) * 100, hs.length ? 0.3 : 1]); det.push(`Schlafqualität Ø ${fmtNum(q, 1)}/5`); }
    if (parts.length) {
      const wsum = parts.reduce((a, p) => a + p[1], 0);
      cats.schlaf = { score: Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum), detail: det.join(' · '), coverage: Math.max(hs.length, qs.length) / 7 };
    } else cats.schlaf = { score: null, detail: 'Noch keine Schlafdaten', coverage: 0 };
  }

  // Alkohol
  {
    const tracked = win.filter((d) => consumptionTracked(d) || d.alcoholG > 0);
    if (!tracked.length) cats.alkohol = { score: null, detail: 'Keine vollständig erfassten Tage', coverage: 0 };
    else {
      const free = tracked.filter((d) => d.alcoholG === 0).length;
      const avg = mean(tracked.map((d) => d.alcoholG));
      const s = 50 * (free / tracked.length) + 50 * Math.max(0, 1 - avg / 30);
      cats.alkohol = {
        score: Math.round(s),
        detail: `${free} von ${tracked.length} erfassten Tagen alkoholfrei, Ø ${fmtNum(avg, 1)} g/Tag`,
        coverage: tracked.length / 7,
      };
    }
  }

  // Flüssigkeit
  {
    const tracked = win.filter((d) => consumptionTracked(d) || d.drinks > 0);
    const target = parseNum(goals.fluidMl) || 2000;
    if (!tracked.length) cats.trinken = { score: null, detail: 'Noch keine Getränke erfasst', coverage: 0 };
    else {
      const s = mean(tracked.map((d) => clamp01(d.fluidMl / target)));
      cats.trinken = { score: Math.round(s * 100), detail: `Ø ${fmtNum(mean(tracked.map((d) => d.fluidMl)))} ml/Tag (Ziel ${fmtNum(target)} ml)`, coverage: tracked.length / 7 };
    }
  }

  let wsum = 0, ssum = 0, completeness = 0;
  const list = Object.entries(SCORE_WEIGHTS).map(([key, { label, w }]) => {
    const c = cats[key];
    if (c.score !== null) { wsum += w; ssum += w * c.score; }
    completeness += w * Math.min(1, c.coverage);
    return { key, label, weight: w, ...c };
  });
  return {
    date: endDate,
    // Unter 15 % Datenvollständigkeit wäre ein Score irreführend
    total: wsum && completeness >= 15 ? Math.round(ssum / wsum) : null,
    weightCovered: wsum, // Anteil der Gewichte mit Daten (0–100)
    completeness: Math.round(completeness),
    categories: list,
  };
}

export function explainScoreChange(now, before) {
  if (!now || !before || now.total === null || before.total === null) return [];
  const out = [];
  for (const c of now.categories) {
    const b = before.categories.find((x) => x.key === c.key);
    if (c.score === null || !b || b.score === null) continue;
    const diff = c.score - b.score;
    const impact = Math.round((diff * c.weight) / 100 * 10) / 10;
    if (Math.abs(diff) >= 3) out.push({ key: c.key, label: c.label, diff, impact, detail: c.detail });
  }
  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/* ---------------- Ziele / Reduktionspläne ---------------- */
// Schrittweise Reduktion: Tagesziel für Zigaretten in Woche w seit Start
export function cigTarget(plan, date) {
  if (!plan || !plan.start) return null;
  const base = parseNum(plan.base);
  if (base === null) return null;
  const weeks = Math.max(0, Math.floor(daysBetween(plan.start, date) / 7));
  if (plan.quitDate && date >= plan.quitDate) return 0;
  const step = parseNum(plan.stepPerWeek) ?? 1;
  return Math.max(plan.quitDate ? 0 : parseNum(plan.floor) ?? 0, Math.round(base - weeks * step));
}

/* ---------------- Fitness-Wochenplan ---------------- */
export function estHrMax(age) { return Math.round(208 - 0.7 * age); } // Tanaka-Formel (Schätzung)
export function hrZone(age, lo, hi) {
  const m = estHrMax(age);
  return { lo: Math.round(m * lo), hi: Math.round(m * hi), max: m };
}

const STRENGTH_EXERCISES = [
  { name: 'Kniebeugen (zum Stuhl)', reps: [10, 12, 15], note: 'Po nach hinten, Knie folgen den Fußspitzen, kurz den Stuhl antippen.' },
  { name: 'Liegestütze erhöht (Tisch/Arbeitsplatte)', reps: [8, 10, 12], note: 'Körper gerade wie ein Brett, Brust zur Kante.' },
  { name: 'Hüftbrücke', reps: [12, 15, 15], note: 'Rückenlage, Fersen nah am Po, Hüfte anheben, 1 s halten.' },
  { name: 'Rudern einarmig mit Wasserkasten oder Rucksack', reps: [10, 12, 12], note: 'Pro Seite. Rücken gerade, Ellbogen nah am Körper nach hinten ziehen.' },
  { name: 'Unterarmstütz (Plank)', reps: ['20 s', '30 s', '40 s'], note: 'Bauch und Po fest, nicht durchhängen.' },
  { name: 'Ausfallschritt rückwärts', reps: [6, 8, 10], note: 'Pro Bein. Oberkörper aufrecht, hinteres Knie Richtung Boden.' },
];
const MOBILITY = [
  'Katze-Kuh im Vierfüßlerstand – 8 langsame Wiederholungen',
  'Hüftbeuger-Dehnung im Halbkniestand – 30 s pro Seite',
  'Brustwirbelsäulen-Rotation im Vierfüßlerstand – 6 pro Seite',
  'Hamstring-Dehnung im Stand (Ferse auf Stufe) – 30 s pro Seite',
  'Schulterkreisen und Brustöffner an der Türzarge – 30 s pro Seite',
  'Wadendehnung an der Wand – 30 s pro Seite',
];

export function sessionDetails(kind, level, profile) {
  const age = parseNum(profile.age) || 40;
  const useHr = !profile.betaBlocker;
  const z2 = hrZone(age, 0.6, 0.7);
  const L = Math.max(0, Math.min(2, level));
  switch (kind) {
    case 'pt': return {
      goal: 'Ganzkörperkraft mit deinem Personal Coach', intensity: 'nach Absprache mit dem Coach',
      steps: ['Fester Termin – Uhrzeit hier eintragen, damit der Tag passend geplant wird.', 'Danach: 500 ml trinken und eine proteinreiche Mahlzeit einplanen.'],
      recovery: 'Am Folgetag nur lockere Bewegung (Spaziergang).', alt: 'Fällt der Termin aus: Krafteinheit „Zuhause“ aus diesem Plan.',
    };
    case 'walk': return {
      goal: 'Ausdauer und Herz-Kreislauf (Grundlagenausdauer)',
      intensity: `zügig – sprechen geht, singen nicht (Anstrengung 4–5 von 10)${useHr ? `; Orientierung ca. ${z2.lo}–${z2.hi} Schläge/min (geschätzt aus Alter)` : '; nach Belastungsempfinden, nicht nach Puls (Medikament)'}`,
      steps: ['5 min locker einlaufen', 'Hauptteil zügig gehen, gern mit leichten Steigungen', '3 min locker auslaufen', 'Apple Watch: Training „Gehen (draußen)“ starten – dann wird es automatisch importiert'],
      recovery: 'Keine besondere Regeneration nötig.', alt: 'Bei schlechtem Wetter: Treppenhaus, Laufband oder Ergometer gleich lang.',
    };
    case 'strength': {
      const ex = STRENGTH_EXERCISES.slice(0, L === 0 ? 4 : L === 1 ? 5 : 6);
      const sets = L === 0 ? 2 : 3;
      return {
        goal: 'Muskelerhalt und -aufbau ohne Geräte', intensity: 'die letzten 2 Wiederholungen sind anstrengend, aber sauber',
        steps: ['3 min Aufwärmen: Marschieren auf der Stelle, Armkreisen',
          ...ex.map((e) => `${e.name}: ${sets} × ${e.reps[L]} – ${e.note}`),
          `Pause zwischen den Sätzen 60–90 s`],
        recovery: 'Mindestens 48 h bis zur nächsten Kraftbelastung derselben Muskeln.', alt: 'Keine Zeit: nur Kniebeugen, Liegestütze, Hüftbrücke à 2 Sätze (ca. 8 min).',
      };
    }
    case 'mobility': return {
      goal: 'Beweglichkeit, Ausgleich zum Sitzen', intensity: 'sanft, keine Schmerzen',
      steps: MOBILITY, recovery: '–', alt: 'Im Büro: nur Hüftbeuger, Brustöffner und Wade (4 min).',
    };
    case 'easy': return {
      goal: 'Aktive Regeneration', intensity: 'locker (Anstrengung 2–3 von 10)',
      steps: ['Spaziergang, gern an der frischen Luft', 'Ziel ist Durchblutung, nicht Leistung'], recovery: '–', alt: 'Radfahren in gemütlichem Tempo.',
    };
    default: return null;
  }
}

// Erzeugt sieben Tage. ptDay: 0–6 (Sonntag=0) oder null; level 0–2; completion: Anteil erledigter Einheiten letzte Woche
export function generateFitnessWeek({ weekStart, ptDay, ptTime, profile, level = 0, busyDays = [], lowEnergy = false }) {
  const days = range(weekStart, 7);
  const items = [];
  const walkMin = [25, 30, 40][level];
  const walkCount = lowEnergy ? 1 : [2, 2, 3][level];
  const strengthCount = lowEnergy ? 0 : level >= 1 ? 1 : 1;
  const ptIdx = ptDay === null || ptDay === undefined ? -1 : days.findIndex((d) => weekday(d) === ptDay);
  const free = (i) => i !== ptIdx && !busyDays.includes(days[i]);
  const add = (i, kind, title, duration, time) => items.push({
    id: `fit-${days[i]}-${kind}-${items.length}`, date: days[i], kind, area: 'fitness', title, duration, time, done: false, skipped: false,
  });
  if (ptIdx >= 0) add(ptIdx, 'pt', 'Personal Training', 60, ptTime || '');
  // Krafteinheit möglichst weit vom PT entfernt
  const order = [3, 1, 5, 2, 6, 4, 0].map((o) => (ptIdx >= 0 ? (ptIdx + o) % 7 : o));
  let s = 0;
  for (const i of order) {
    if (s >= strengthCount) break;
    if (free(i) && i !== (ptIdx + 1) % 7) { add(i, 'strength', 'Kraft zuhause (20 min)', 20, weekday(days[i]) % 6 === 0 ? '10:00' : '18:00'); s++; }
  }
  // Zügiges Gehen: bevorzugt Wochenende + Wochenmitte
  // Reihenfolge nach Wochentag: Sa, So, Mi, Di, Do, Mo, Fr
  const walkOrder = [6, 0, 3, 2, 4, 1, 5].map((wd) => days.findIndex((d) => weekday(d) === wd));
  let w = 0;
  for (const i of walkOrder) {
    if (w >= walkCount) break;
    if (i < 0 || !free(i) || items.some((it) => it.date === days[i] && (it.kind === 'walk' || it.kind === 'strength'))) continue;
    const we = weekday(days[i]) === 0 || weekday(days[i]) === 6;
    add(i, 'walk', `Zügig gehen (${we ? walkMin + 10 : walkMin} min)`, we ? walkMin + 10 : walkMin, we ? '10:30' : '17:30');
    w++;
  }
  // Regeneration nach PT
  if (ptIdx >= 0 && ptIdx < 6) add(ptIdx + 1, 'easy', 'Lockerer Spaziergang (15 min)', 15, '12:30');
  // Mobilität an zwei Tagen
  let m = 0;
  for (const i of [1, 4, 6, 3]) { if (m >= 2) break; if (!items.some((it) => it.date === days[i] && it.kind === 'mobility')) { add(i, 'mobility', 'Mobilität (10 min)', 10, '21:00'); m++; } }
  return items;
}

// Progression aus der Umsetzungsquote der Vorwoche
export function nextLevel(level, completion) {
  if (completion === null || completion === undefined) return level;
  if (completion >= 0.8) return Math.min(2, level + 1);
  if (completion < 0.5) return Math.max(0, level - 1);
  return level;
}

/* ---------------- Apple-Health-Import ---------------- */
const KEY_MAP = {
  datum: 'date', date: 'date', tag: 'date',
  schritte: 'steps', steps: 'steps',
  strecke: 'distance', strecke_km: 'distance', distanz_km: 'distance', distance_km: 'distance', distance: 'distance',
  aktive_energie: 'activeKcal', aktive_kcal: 'activeKcal', active_kcal: 'activeKcal', active_energy: 'activeKcal',
  ruheenergie: 'restingKcal', ruhe_kcal: 'restingKcal', resting_kcal: 'restingKcal',
  trainingsminuten: 'exerciseMin', training_min: 'exerciseMin', exercise_min: 'exerciseMin',
  ruhepuls: 'rhr', ruheherzfrequenz: 'rhr', resting_hr: 'rhr',
  hrv: 'hrv', hrv_ms: 'hrv', herzfrequenzvariabilitaet: 'hrv',
  vo2max: 'vo2', cardiofitness: 'vo2', vo2: 'vo2',
  gewicht: 'weight', gewicht_kg: 'weight', weight: 'weight', weight_kg: 'weight',
  schlaf: 'sleepH', schlaf_h: 'sleepH', schlaf_stunden: 'sleepH', schlaf_min: 'sleepMin', schlaf_minuten: 'sleepMin', sleep_h: 'sleepH',
  tiefschlaf_min: 'deepMin', rem_min: 'remMin', tiefschlaf_h: 'deepH', rem_h: 'remH',
  schlaf_datum: 'sleepDate', aufwachdatum: 'sleepDate', sleep_date: 'sleepDate',
};
function normKey(k) {
  return String(k).trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/₂/g, '2').replace(/[\s\-]+/g, '_');
}
function normDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  return null;
}
// Text aus Zwischenablage/Datei -> { days: [{date, values:{metric:value}}], warnings:[] }
export function parseHealthImport(text, today = isoDate()) {
  const warnings = [];
  let data;
  try { data = JSON.parse(String(text).trim().replace(/^﻿/, '')); } catch {
    return { days: [], warnings: ['Der Inhalt ist kein gültiges JSON. Bitte den Kurzbefehl erneut ausführen.'] };
  }
  let records = Array.isArray(data) ? data : Array.isArray(data?.tage) ? data.tage : Array.isArray(data?.days) ? data.days : [data];
  const out = new Map();
  const put = (date, metric, val) => {
    if (!out.has(date)) out.set(date, {});
    out.get(date)[metric] = val;
  };
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    const r = {};
    for (const [k, v] of Object.entries(rec)) {
      const key = KEY_MAP[normKey(k)];
      if (key) r[key] = v; else if (!['format', 'version', 'quelle', 'source', 'exportiert'].includes(normKey(k))) warnings.push(`Unbekanntes Feld „${k}“ ignoriert.`);
    }
    const date = normDate(r.date);
    if (!date) { warnings.push('Datensatz ohne gültiges Datum übersprungen.'); continue; }
    if (date > today) { warnings.push(`Datum ${fmtDate(date)} liegt in der Zukunft – übersprungen.`); continue; }
    const sleepDate = normDate(r.sleepDate) || addDays(date, 1);
    // Schlaf: Minuten/Sekunden erkennen
    let sleepH = parseNum(r.sleepH);
    if (sleepH === null && parseNum(r.sleepMin) !== null) sleepH = parseNum(r.sleepMin) / 60;
    if (sleepH !== null && sleepH > 24 && sleepH <= 1440) { sleepH = sleepH / 60; warnings.push('Schlafdauer wurde als Minuten erkannt und umgerechnet.'); }
    else if (sleepH !== null && sleepH > 1440) { sleepH = sleepH / 3600; warnings.push('Schlafdauer wurde als Sekunden erkannt und umgerechnet.'); }
    const deep = parseNum(r.deepH) ?? (parseNum(r.deepMin) !== null ? parseNum(r.deepMin) / 60 : null);
    const rem = parseNum(r.remH) ?? (parseNum(r.remMin) !== null ? parseNum(r.remMin) / 60 : null);
    let dist = parseNum(r.distance);
    if (dist !== null && dist > 150) { dist = dist / 1000; warnings.push('Strecke wurde als Meter erkannt und in km umgerechnet.'); }
    const vals = {
      steps: parseNum(r.steps), distance: dist, activeKcal: parseNum(r.activeKcal), restingKcal: parseNum(r.restingKcal),
      exerciseMin: parseNum(r.exerciseMin), rhr: parseNum(r.rhr), hrv: parseNum(r.hrv), vo2: parseNum(r.vo2), weight: parseNum(r.weight),
    };
    for (const [k, v] of Object.entries(vals)) {
      if (v === null) continue;
      const def = IMPORT_METRICS[k];
      // 0 bei Ruhepuls/HRV/VO2/Gewicht/Ruheenergie = kein Messwert
      if (v === 0 && ['rhr', 'hrv', 'vo2', 'weight', 'restingKcal'].includes(k)) continue;
      if (v < def.min || v > def.max) { warnings.push(`${def.label} ${fmtNum(v, def.digits)} am ${fmtDate(date)} ist unplausibel – nicht übernommen.`); continue; }
      put(date, k, Math.round(v * 10) / 10);
    }
    for (const [k, v] of [['sleepH', sleepH], ['deepH', deep], ['remH', rem]]) {
      if (v === null) continue;
      if (v === 0) continue; // 0 h = vermutlich keine Aufzeichnung
      if (v > IMPORT_METRICS[k].max) { warnings.push(`${IMPORT_METRICS[k].label} unplausibel – nicht übernommen.`); continue; }
      if (sleepDate > today) continue;
      put(sleepDate, k, Math.round(v * 100) / 100);
    }
  }
  const days = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, values]) => ({ date, values }));
  if (!days.length && !warnings.length) warnings.push('Keine verwertbaren Werte gefunden.');
  return { days, warnings: [...new Set(warnings)] };
}

// Vergleicht Import mit vorhandenen Werten: neu / gleich / geändert
export function diffImport(parsed, days) {
  const rows = [];
  for (const d of parsed.days) {
    for (const [k, v] of Object.entries(d.values)) {
      const ex = days[d.date]?.metrics?.[k];
      const src = days[d.date]?.sources?.[k];
      rows.push({ date: d.date, metric: k, value: v, existing: ex, status: ex === undefined ? 'neu' : ex === v ? 'unverändert' : src === 'manuell' ? 'manuell vorhanden' : 'aktualisiert' });
    }
  }
  return rows;
}

/* ---------------- Sicherheitsprüfungen ---------------- */
export function healthFlags(days, profile, today) {
  const flags = [];
  const last = range(addDays(today, -6), 7).map((d) => days[d]).filter(Boolean);
  const rhrBase = parseNum(profile.baseline?.rhr);
  const rhrRecent = mean(last.map((d) => d.metrics.rhr).filter((v) => v !== undefined));
  if (rhrBase && rhrRecent && rhrRecent - rhrBase >= 8) flags.push({ level: 'hinweis', text: `Dein Ruhepuls liegt im 7-Tage-Mittel ${fmtNum(rhrRecent - rhrBase)} Schläge über deinem Ausgangswert. Häufige Ursachen: Infekt, Schlafmangel, Alkohol, Stress. Training heute locker halten; hält das an oder kommen Beschwerden dazu, ärztlich abklären lassen.` });
  const bp = [...last].reverse().find((d) => d.metrics.bpSys);
  if (bp && (bp.metrics.bpSys >= 180 || bp.metrics.bpDia >= 110)) flags.push({ level: 'dringend', text: 'Dein zuletzt eingetragener Blutdruck ist sehr hoch. Bitte zeitnah ärztlich abklären lassen – bei Brustschmerz, Atemnot, Sehstörungen oder starken Kopfschmerzen sofort 112.' });
  else if (bp && (bp.metrics.bpSys >= 140 || bp.metrics.bpDia >= 90)) flags.push({ level: 'hinweis', text: 'Dein Blutdruck lag zuletzt im erhöhten Bereich (≥ 140/90). Ein einzelner Wert ist keine Diagnose – wiederholt erhöhte Werte bitte hausärztlich besprechen.' });
  const sleep = last.map((d) => d.metrics.sleepH).filter((v) => v !== undefined);
  if (sleep.length >= 5 && mean(sleep) < 6) flags.push({ level: 'info', text: `Du schläfst seit Tagen im Schnitt unter 6 Stunden (Ø ${fmtNum(mean(sleep), 1)} h). Intensives Training heute lieber durch lockere Bewegung ersetzen.` });
  const alc = last.filter((d) => d.alcoholG > 0);
  if (alc.length >= 6 && mean(alc.map((d) => d.alcoholG)) >= 40) flags.push({ level: 'hinweis', text: 'Du hast an fast allen Tagen der letzten Woche größere Mengen Alkohol getrunken. Wenn du stark reduzieren willst, sprich vorher mit deiner Hausärztin oder deinem Hausarzt – ein abruptes Absetzen kann bei regelmäßigem Konsum Entzugssymptome auslösen.' });
  return flags;
}
