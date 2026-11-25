// HealthPilot – Benutzeroberfläche
import * as L from './logic.js';
import * as DB from './db.js';
import * as F from './food.js';
import * as AI from './ai.js';

/* ======================= Zustand ======================= */
const S = {
  tab: 'heute', profile: {}, goals: {}, settings: {}, baseline: null, onboarding: null, cigPlan: null, fitness: null,
  entries: [], plan: [], days: {}, weekSetups: {}, habits: {}, period: 'woche', weekOffset: 0, logDrinkKind: 'wasser',
  planView: 'bewegung', ratings: {}, ai: { ...AI.DEFAULT_SETTINGS }, aiUsage: {}, customRecipes: {}, restaurants: [], pantry: {}, mealDefaults: {}, coach: { module: 'heute', history: {} },
};
const today = () => L.isoDate();
const nowIso = () => new Date().toISOString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const N = L.fmtNum;
const isDemo = () => DB.getMode() === 'demo';

async function load() {
  const [profile, goals, settings, baseline, onboarding, cigPlan, fitness] = await Promise.all(
    ['profile', 'goals', 'settings', 'baseline', 'onboarding', 'cigPlan', 'fitness'].map((k) => DB.kvGet(k)),
  );
  Object.assign(S, {
    profile: profile || {}, goals: goals || {}, settings: settings || {}, baseline, onboarding, cigPlan, fitness: fitness || { level: 0 },
  });
  const [ratings, ai, aiUsage, customRecipes, restaurants, pantry, mealDefaults, aiHistory] = await Promise.all(
    ['ratings', 'ai', 'aiUsage', 'customRecipes', 'restaurants', 'pantry', 'mealDefaults', 'aiHistory'].map((k) => DB.kvGet(k)),
  );
  Object.assign(S, { ratings: ratings || {}, ai: { ...AI.DEFAULT_SETTINGS, ...(ai || {}) }, aiUsage: aiUsage || {}, customRecipes: customRecipes || {}, restaurants: restaurants || [], pantry: pantry || {}, mealDefaults: mealDefaults || {} });
  S.coach.history = aiHistory || {};
  S.entries = await DB.allEntries();
  S.plan = await DB.allPlan();
  recompute();
}
function recompute() { S.days = L.aggregateDays(S.entries); }
const day = (d) => S.days[d] || L.emptyDay(d);
async function saveKv(key, val) { S[key] = val; await DB.kvSet(key, val); }

/* ======================= Einträge ======================= */
async function addEntry(o, { silent = false, label } = {}) {
  const e = { id: DB.uid(), date: today(), ts: nowIso(), source: 'manuell', ...o };
  await DB.putEntry(e);
  S.entries.push(e); recompute(); render();
  if (!silent) toast(label || 'Gespeichert', async () => { await removeEntry(e.id); });
  return e;
}
async function removeEntry(id) {
  await DB.deleteEntry(id);
  S.entries = S.entries.filter((x) => x.id !== id); recompute(); render();
}

/* ======================= UI-Bausteine ======================= */
let toastTimer;
function toast(msg, undo, extraHtml = '') {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.innerHTML = `<div class="toast" role="status"><div class="grow">${esc(msg)}${extraHtml}</div>${undo ? '<button class="btn" data-a="undo">Rückgängig</button>' : ''}</div>`;
  ACT.undo = async () => { t.innerHTML = ''; if (undo) await undo(); toast('Rückgängig gemacht'); };
  toastTimer = setTimeout(() => { t.innerHTML = ''; }, extraHtml ? 7000 : 4000);
}
function openSheet(title, html, onMount) {
  $('#sheet').innerHTML = `<div class="sheet-bg" data-a="sheetBg"><div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="grab"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="btn ghost" data-a="closeSheet">Schließen</button></div><div id="sheetBody">${html}</div></div></div>`;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount($('#sheetBody'));
}
function closeSheet() { $('#sheet').innerHTML = ''; document.body.style.overflow = ''; }
const badge = (src) => {
  if (!src) return '';
  const map = { import: ['import', 'importiert'], manuell: ['manuell', 'manuell'], geschaetzt: ['geschaetzt', 'geschätzt'], gemessen: ['import', 'gemessen'] };
  const [c, t] = map[src] || ['', src];
  return `<span class="badge ${c}">${t}</span>`;
};
function trendHtml(cur, prev, higherBetter = true, digits = 0, unit = '') {
  if (cur === null || prev === null || cur === undefined || prev === undefined) return '<span class="trend flat">– kein Vergleich</span>';
  const diff = cur - prev;
  const rel = prev ? Math.abs(diff / prev) : Math.abs(diff);
  if (rel < 0.02) return '<span class="trend flat">→ stabil</span>';
  const good = higherBetter === null ? null : (diff > 0) === higherBetter;
  return `<span class="trend ${good === null ? 'flat' : good ? 'up' : 'down'}">${diff > 0 ? '↑' : '↓'} ${diff > 0 ? '+' : ''}${N(diff, digits)}${unit} zur Vorwoche</span>`;
}
function ring(value, size = 92) {
  const r = 40, c = 2 * Math.PI * r;
  const v = value === null ? 0 : value;
  const color = value === null ? 'var(--line)' : v >= 70 ? 'var(--good)' : v >= 45 ? 'var(--warn)' : 'var(--bad)';
  return `<svg class="ring" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Score ${value ?? 'ohne Daten'}">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--card2)" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 50 50)"/>
    <text x="50" y="57" text-anchor="middle" font-size="26">${value === null ? '–' : value}</text></svg>`;
}
function scaleInput(name, value, labels = ['1', '2', '3', '4', '5']) {
  return `<div class="scale" data-scale="${name}">${labels.map((l, i) => `<button type="button" class="${+value === i + 1 ? 'on' : ''}" data-a="scalePick" data-name="${name}" data-v="${i + 1}">${l}</button>`).join('')}
    <input type="hidden" name="${name}" value="${value ?? ''}"></div>`;
}
function chipsInput(name, options, selected = []) {
  return `<div class="chips" data-chips="${name}">${options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<button type="button" class="chip ${selected.map(String).includes(String(v)) ? 'on' : ''}" data-a="chipToggle" data-v="${esc(v)}">${esc(l)}</button>`;
  }).join('')}</div>`;
}
function readChips(root, name) { return [...root.querySelectorAll(`[data-chips="${name}"] .chip.on`)].map((b) => b.dataset.v); }

// Einfache Diagramme (SVG)
function lineChart(points, { ma = false, goal = null, digits = 0, unit = '', height = 140 } = {}) {
  const pts = points.filter((p) => p.value !== null && p.value !== undefined);
  if (pts.length < 2) return '<p class="small">Für ein Diagramm werden mindestens zwei Messwerte benötigt.</p>';
  const W = 340, Hh = height, pl = 36, pr = 8, pt = 10, pb = 22;
  const dates = points.map((p) => p.date);
  const x0 = dates[0], span = Math.max(1, L.daysBetween(x0, dates[dates.length - 1]));
  const vals = pts.map((p) => p.value).concat(goal !== null ? [goal] : []);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const padv = (max - min) * 0.1; min -= padv; max += padv;
  const X = (d) => pl + (L.daysBetween(x0, d) / span) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - min) / (max - min)) * (Hh - pt - pb);
  const path = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  let s = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img">`;
  for (const v of [min + padv, (min + max) / 2, max - padv]) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 4}" y="${Y(v) + 4}" text-anchor="end">${N(v, digits)}</text>`;
  if (goal !== null) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--good)" stroke-dasharray="4 4"/>`;
  s += `<path d="${path(pts)}" fill="none" stroke="var(--accent)" stroke-width="${ma ? 1 : 2}" opacity="${ma ? 0.45 : 1}"/>`;
  if (pts.length <= 40) s += pts.map((p) => `<circle cx="${X(p.date)}" cy="${Y(p.value)}" r="${ma ? 1.8 : 2.5}" fill="var(--accent)" opacity="${ma ? 0.5 : 1}"/>`).join('');
  if (ma) { const m = L.movingAverage(pts, 7).filter((p) => p.value !== null); s += `<path d="${path(m)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`; }
  s += `<text x="${pl}" y="${Hh - 4}">${L.fmtDate(dates[0], false)}</text><text x="${W - pr}" y="${Hh - 4}" text-anchor="end">${L.fmtDate(dates[dates.length - 1], false)}</text></svg>`;
  return s + (unit ? `<div class="small">${ma ? 'Dünne Linie: Tageswerte · dicke Linie: gleitender 7-Tage-Durchschnitt · ' : ''}Einheit: ${unit}${goal !== null ? ' · gestrichelt: Ziel' : ''}</div>` : '');
}
function barChart(values, labels, { color = 'var(--accent)', height = 120, digits = 0 } = {}) {
  const W = 340, Hh = height, pb = 18, pt = 14;
  const max = Math.max(1, ...values.map((v) => v || 0));
  const bw = (W - 8) / values.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img">`;
  values.forEach((v, i) => {
    const h = ((v || 0) / max) * (Hh - pb - pt);
    s += `<rect x="${4 + i * bw + bw * 0.15}" y="${Hh - pb - h}" width="${bw * 0.7}" height="${h}" rx="3" fill="${color}"/>`;
    if (v) s += `<text x="${4 + i * bw + bw / 2}" y="${Hh - pb - h - 3}" text-anchor="middle">${N(v, digits)}</text>`;
    if (labels[i] !== '') s += `<text x="${4 + i * bw + bw / 2}" y="${Hh - 4}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return s + '</svg>';
}

/* ======================= Ziele & Hilfsberechnungen ======================= */
function fluidGoalFor(date) {
  const base = L.parseNum(S.goals.fluidMl) || 2000;
  if (S.profile.fluidRestriction) return base;
  const training = S.plan.some((p) => p.date === date && p.area === 'fitness' && ['pt', 'walk', 'strength'].includes(p.kind) && !p.skipped);
  return base + (training ? 500 : 0);
}
const cigTargetToday = (d = today()) => (S.profile.smoker ? L.cigTarget(S.cigPlan, d) : null);
function scoreFor(d) { return L.computeScore(S.days, S.profile, S.goals, d); }
function lastMetric(key, before = today(), maxAge = 60) {
  for (let i = 0; i <= maxAge; i++) {
    const d = L.addDays(before, -i);
    const v = S.days[d]?.metrics?.[key];
    if (v !== undefined) return { value: v, date: d, source: S.days[d].sources[key] };
  }
  return null;
}
function avgMetric(fn, end, n) {
  const vals = L.range(L.addDays(end, -(n - 1)), n).map((d) => fn(day(d), d)).filter((v) => v !== null && v !== undefined);
  return vals.length ? L.mean(vals) : null;
}
const isOfficeDay = (d) => (S.profile.officeDays || [1, 2, 3, 4, 5]).map(Number).includes(L.weekday(d));
function readiness() {
  const t = today(); const y = L.addDays(t, -1);
  const reasons = [];
  const ci = day(y).checkin || day(t).checkin;
  const sl = day(t).metrics.sleepH;
  if (sl !== undefined && sl < 5.5) reasons.push(`nur ${N(sl, 1)} h Schlaf`);
  if (ci && ci.energy && ci.energy <= 2) reasons.push('niedriges Energielevel');
  const rb = L.parseNum(S.baseline?.rhr); const r = day(t).metrics.rhr ?? day(y).metrics.rhr;
  if (rb && r && r - rb >= 8) reasons.push(`Ruhepuls ${N(r - rb)} über Ausgangswert`);
  return reasons;
}
const habitsKey = (d) => `habits-${d}`;
async function getHabits(d) { if (!(d in S.habits)) S.habits[d] = await DB.kvGet(habitsKey(d), {}); return S.habits[d]; }

/* ======================= Navigation ======================= */
const ICONS = {
  heute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  erfassen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  erfolge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};
const TABS = [['heute', 'Heute'], ['plan', 'Wochenplan'], ['erfassen', 'Erfassen'], ['erfolge', 'Erfolge'], ['profil', 'Profil']];
function renderTabs() {
  const nav = $('#tabs');
  nav.hidden = !S.onboarding?.done;
  nav.innerHTML = TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-tab="${k}" aria-label="${l}">${ICONS[k]}<span>${l}</span></button>`).join('');
}

function render() {
  renderTabs();
  const v = $('#view');
  if (!S.onboarding?.done) { v.innerHTML = renderOnboarding(); return; }
  const banner = (isDemo() ? '<div class="demo-banner">DEMOMODUS – alle Werte sind Testdaten</div>' : '') + standaloneWarning();
  const html = { heute: renderHeute, plan: renderPlan, erfassen: renderErfassen, erfolge: renderErfolge, profil: renderProfil }[S.tab]();
  v.innerHTML = banner + html;
}
function standaloneWarning() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone) return '';
  return '<div class="card flag hinweis"><b>Du nutzt HealthPilot gerade in Safari.</b><p class="sub">Daten in Safari und in der App auf dem Home-Bildschirm werden getrennt gespeichert. Füge die App über „Teilen → Zum Home-Bildschirm“ hinzu und nutze nur noch das App-Symbol.</p></div>';
}

/* ======================= Onboarding ======================= */
const WD_OPTS = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const SECTIONS = [
  { id: 'koerper', title: 'Körper', intro: 'Grunddaten für Berechnungen wie BMI und Trinkziel. Vorausgefüllte Werte stammen aus deinem Auftrag – bitte prüfen.', fields: [
    { k: 'sex', label: 'Geschlecht', type: 'select', opts: ['männlich', 'weiblich'] },
    { k: 'age', label: 'Alter', type: 'number', unit: 'Jahre', min: 16, max: 100 },
    { k: 'height', label: 'Körpergröße', type: 'number', unit: 'cm', min: 120, max: 230 },
    { k: 'weight', label: 'Körpergewicht', type: 'number', unit: 'kg', min: 35, max: 300, step: 0.1 },
    { k: 'waist', label: 'Bauchumfang (optional)', type: 'number', unit: 'cm', min: 50, max: 200, hint: 'Maßband in Höhe des Bauchnabels, morgens, entspannt ausatmen.' },
  ] },
  { id: 'gesundheit', title: 'Gesundheit', intro: 'Diese Angaben bleiben auf deinem iPhone. Sie dienen dazu, Empfehlungen sicher zu machen – nicht für Diagnosen.', fields: [
    { k: 'conditions', label: 'Vorerkrankungen / gesundheitliche Einschränkungen', type: 'textarea' },
    { k: 'meds', label: 'Regelmäßige Medikamente', type: 'textarea' },
    { k: 'betaBlocker', label: 'Nimmst du pulssenkende Medikamente (z. B. Betablocker)?', type: 'select', opts: ['nein', 'ja', 'weiß nicht'], hint: 'Wenn ja, plant HealthPilot nach Belastungsempfinden statt nach Puls.' },
    { k: 'complaints', label: 'Verletzungen oder Beschwerden (z. B. Rücken, Knie)', type: 'textarea' },
    { k: 'fluidRestriction', label: 'Hat dir ein Arzt eine Trinkmenge vorgegeben oder begrenzt?', type: 'yesno' },
    { k: 'fluidRestrictionMl', label: 'Wenn ja: vorgegebene Trinkmenge', type: 'number', unit: 'ml/Tag', min: 500, max: 5000 },
    { k: 'bpSys', label: 'Blutdruck systolisch (optional)', type: 'number', unit: 'mmHg', min: 70, max: 250 },
    { k: 'bpDia', label: 'Blutdruck diastolisch (optional)', type: 'number', unit: 'mmHg', min: 40, max: 150 },
    { k: 'rhr', label: 'Ruhepuls (optional)', type: 'number', unit: 'Schläge/min', min: 30, max: 130, hint: 'Health-App → Herz → Ruhefrequenz. Wird später per Kurzbefehl automatisch übernommen.' },
    { k: 'vo2', label: 'VO₂max / Cardiofitness (optional)', type: 'number', unit: 'ml/kg/min', min: 10, max: 90, step: 0.1, hint: 'Health-App → Herz → Cardiofitness.' },
    { k: 'allergies', label: 'Allergien', type: 'text' },
    { k: 'emergencyKit', label: 'Notfallset vorhanden', type: 'yesno' },
    { k: 'tracesOk', label: 'Produkte mit „Kann Spuren von Erdnüssen enthalten“ sind für mich in Ordnung', type: 'yesno' },
    { k: 'dislikes', label: 'Abneigungen (werden nie eingeplant)', type: 'text' },
  ] },
  { id: 'alltag', title: 'Alltag & Bewegung', intro: 'Damit die Pläne in deinen echten Alltag passen.', fields: [
    { k: 'workStart', label: 'Arbeitsbeginn', type: 'time' },
    { k: 'workEnd', label: 'Arbeitsende', type: 'time' },
    { k: 'officeDays', label: 'Bürotage', type: 'chips', opts: WD_OPTS },
    { k: 'baseSteps', label: 'Durchschnittliche Schritte pro Tag (falls bekannt)', type: 'number', min: 0, max: 50000, hint: 'Health-App → Schritte → „M“ (Monat) zeigt den Durchschnitt. Leer lassen, wenn unbekannt – der Import ergänzt das.' },
    { k: 'sportExp', label: 'Sportliche Erfahrung', type: 'select', opts: ['kaum / lange her', 'früher regelmäßig', 'aktuell gelegentlich', 'aktuell regelmäßig'] },
    { k: 'trainingOptions', label: 'Verfügbare Trainingsmöglichkeiten', type: 'chips', opts: ['Zuhause ohne Geräte', 'Kurzhanteln zuhause', 'Fitnessstudio', 'Draußen gehen/laufen', 'Fahrrad', 'Schwimmbad'] },
    { k: 'ptWindow', label: 'Personal Training', type: 'text', hint: 'Der Wochentag wird jede Woche bei der Wochenplanung abgefragt.' },
    { k: 'extraTimeMin', label: 'Zusätzliche Zeit für Bewegung pro Woche (realistisch)', type: 'number', unit: 'min', min: 0, max: 1200 },
  ] },
  { id: 'schlaf', title: 'Schlaf', intro: 'Grobe Angaben genügen; die Apple Watch liefert später die Messwerte.', fields: [
    { k: 'sleepH', label: 'Durchschnittliche Schlafdauer', type: 'number', unit: 'Stunden', min: 2, max: 14, step: 0.25 },
    { k: 'sleepQ', label: 'Schlafqualität (1 = schlecht, 5 = sehr gut)', type: 'scale' },
    { k: 'bedTime', label: 'Typische Zubettgehzeit', type: 'time' },
    { k: 'wakeTime', label: 'Typische Aufstehzeit', type: 'time' },
  ] },
  { id: 'ernaehrung', title: 'Ernährung & Trinken', intro: 'Die vollständige Ernährungsplanung folgt in Stufe 2 – diese Angaben werden dafür schon gespeichert.', fields: [
    { k: 'breakfastTime', label: 'Frühstück um', type: 'time' },
    { k: 'lunchTime', label: 'Mittagessen um', type: 'time' },
    { k: 'dinnerTime', label: 'Abendessen um', type: 'time' },
    { k: 'kitchenHome', label: 'Küchengeräte zuhause', type: 'chips', opts: ['Herd', 'Backofen', 'Kühlschrank', 'Tiefkühltruhe', 'Mikrowelle', 'Heißluftfritteuse', 'Wasserkocher', 'Mixer'] },
    { k: 'kitchenOffice', label: 'Ausstattung im Büro', type: 'chips', opts: ['Herd', 'Mikrowelle', 'Backofen', 'Kühlschrank', 'Wasserkocher'] },
    { k: 'shops', label: 'Supermärkte', type: 'chips', opts: ['Edeka', 'Rewe', 'Kaufland', 'Lidl', 'Aldi', 'Netto', 'Penny'] },
    { k: 'dislikesExtra', label: 'Weitere Lebensmittel, die du nicht magst (mit Komma getrennt)', type: 'text', hint: 'Werden nie eingeplant, z. B. „Thunfisch, Pilze“.' },
    { k: 'cookWilling', label: 'Wie oft bist du bereit, selbst (einfach) zu kochen?', type: 'select', opts: ['kaum', '1–2× pro Woche', '3–4× pro Woche', 'fast täglich'] },
    { k: 'convenienceShare', label: 'Anteil Convenience Food aktuell', type: 'select', opts: ['gering', 'etwa die Hälfte', 'überwiegend'] },
    { k: 'fluidNow', label: 'Geschätzte Trinkmenge pro Tag aktuell (ohne Alkohol)', type: 'number', unit: 'ml', min: 0, max: 8000 },
  ] },
  { id: 'alkohol', title: 'Alkohol', intro: 'Ehrliche Angaben helfen dir am meisten. Hier wird nichts bewertet. Die ersten drei Fragen sind der anerkannte Kurztest AUDIT-C. Ein Standardgetränk ≈ 0,33 l Bier, 0,125 l Wein oder 4 cl Schnaps.', fields: [
    { k: 'audit1', label: 'Wie oft trinkst du Alkohol?', type: 'select', num: true, opts: [[0, 'nie'], [1, 'einmal im Monat oder seltener'], [2, '2–4 × im Monat'], [3, '2–3 × pro Woche'], [4, '4 × pro Woche oder öfter']] },
    { k: 'audit2', label: 'Wie viele Standardgetränke trinkst du an einem typischen Trinktag?', type: 'select', num: true, opts: [[0, '1–2'], [1, '3–4'], [2, '5–6'], [3, '7–9'], [4, '10 oder mehr']] },
    { k: 'audit3', label: 'Wie oft trinkst du 6 oder mehr Standardgetränke bei einer Gelegenheit?', type: 'select', num: true, opts: [[0, 'nie'], [1, 'seltener als einmal im Monat'], [2, 'jeden Monat'], [3, 'jede Woche'], [4, 'täglich oder fast täglich']] },
    { k: 'alcDrinksWeek', label: 'Wie viele Getränke etwa pro Woche?', type: 'number', min: 0, max: 200 },
    { k: 'alcTypical', label: 'Typisches Getränk', type: 'select', opts: L.ALCOHOL_PRESETS.filter((p) => p.abv > 1).map((p) => [p.id, p.label]) },
    { k: 'morningDrink', label: 'Hattest du in den letzten 12 Monaten morgens Zittern, Schwitzen oder Unruhe, die durch Alkohol besser wurden?', type: 'yesno' },
  ] },
  { id: 'rauchen', title: 'Rauchen', intro: 'Ausgangswerte für die schrittweise Reduktion. Ohne Wertung.', fields: [
    { k: 'smoker', label: 'Ich rauche derzeit', type: 'yesno' },
    { k: 'cigsPerDay', label: 'Zigaretten pro Tag (Durchschnitt)', type: 'number', min: 0, max: 100 },
    { k: 'minutesToFirst', label: 'Wann rauchst du nach dem Aufstehen die erste?', type: 'select', num: true, opts: [[5, 'innerhalb von 5 Minuten'], [30, 'nach 6–30 Minuten'], [60, 'nach 31–60 Minuten'], [61, 'nach mehr als 60 Minuten']] },
    { k: 'packPrice', label: 'Preis pro Packung', type: 'number', unit: '€', min: 1, max: 30, step: 0.01 },
    { k: 'packSize', label: 'Zigaretten pro Packung', type: 'number', min: 1, max: 60 },
    { k: 'smokeSituations', label: 'Typische Situationen', type: 'chips', opts: ['Nach dem Aufstehen', 'Zum Kaffee', 'Arbeitspause', 'Stress', 'Nach dem Essen', 'Im Auto', 'Mit Alkohol', 'In Gesellschaft', 'Langeweile', 'Abends entspannen'] },
    { k: 'quitAttempts', label: 'Bisherige Aufhörversuche (was hat geholfen, was nicht?)', type: 'textarea' },
    { k: 'readiness', label: 'Wo stehst du gerade?', type: 'select', opts: ['erst einmal reduzieren', 'Rauchstopp in den nächsten 30 Tagen', 'Rauchstopp in den nächsten 6 Monaten', 'noch unentschlossen'] },
  ] },
  { id: 'motivation', title: 'Motivation & Ziele', intro: 'Wofür machst du das? Das hilft an schwierigen Tagen.', fields: [
    { k: 'motivation', label: 'Meine persönliche Motivation', type: 'textarea' },
    { k: 'priorities', label: 'Was ist dir gerade am wichtigsten? (max. 3)', type: 'chips', opts: ['Fitness', 'Ausdauer', 'Muskulatur', 'Ernährung', 'Trinken', 'Weniger Alkohol', 'Weniger rauchen', 'Schlaf', 'Gewicht', 'Wohlbefinden'] },
    { k: 'weightGoal', label: 'Gewicht', type: 'select', opts: ['halten', 'moderat reduzieren (0,25–0,5 kg pro Woche)', 'noch offen'] },
  ] },
];
const PREFILL = {
  sex: 'männlich', age: 42, height: 178, weight: 83, workStart: '08:15', workEnd: '17:00', officeDays: ['1', '2', '3', '4', '5'],
  allergies: 'Erdnüsse, Avocado', emergencyKit: true, tracesOk: true, dislikes: 'Nüsse, Nussöle', smoker: true,
  kitchenHome: ['Herd', 'Backofen', 'Kühlschrank', 'Tiefkühltruhe'], kitchenOffice: ['Herd', 'Mikrowelle', 'Backofen', 'Kühlschrank'],
  shops: ['Edeka', 'Rewe'], ptWindow: '1 × pro Woche, 60 min, Beginn zwischen 16 und 19 Uhr', betaBlocker: 'nein', packSize: 20,
};

function fieldHtml(f, v) {
  const hint = f.hint ? `<div class="small">${esc(f.hint)}</div>` : '';
  const unit = f.unit ? ` (${esc(f.unit)})` : '';
  switch (f.type) {
    case 'number': return `<label class="f"><span>${esc(f.label)}${unit}</span><input type="text" inputmode="decimal" name="${f.k}" value="${v ?? ''}" placeholder="leer = unbekannt">${hint}</label>`;
    case 'text': return `<label class="f"><span>${esc(f.label)}</span><input type="text" name="${f.k}" value="${esc(v ?? '')}">${hint}</label>`;
    case 'textarea': return `<label class="f"><span>${esc(f.label)}</span><textarea name="${f.k}">${esc(v ?? '')}</textarea>${hint}</label>`;
    case 'time': return `<label class="f"><span>${esc(f.label)}</span><input type="time" name="${f.k}" value="${esc(v ?? '')}">${hint}</label>`;
    case 'select': return `<label class="f"><span>${esc(f.label)}</span><select name="${f.k}"><option value="">– bitte wählen –</option>${f.opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>${hint}</label>`;
    case 'yesno': return `<label class="f"><span>${esc(f.label)}</span><select name="${f.k}"><option value="">– bitte wählen –</option><option value="ja" ${v === true ? 'selected' : ''}>ja</option><option value="nein" ${v === false ? 'selected' : ''}>nein</option></select>${hint}</label>`;
    case 'scale': return `<div class="f"><span class="small">${esc(f.label)}</span>${scaleInput(f.k, v)}</div>`;
    case 'chips': return `<div class="f"><span class="small">${esc(f.label)}</span>${chipsInput(f.k, f.opts, v || [])}${hint}</div>`;
    default: return '';
  }
}
function sectionForm(sec, values) {
  return `<form id="secForm" data-sec="${sec.id}" novalidate>${sec.fields.map((f) => fieldHtml(f, values[f.k])).join('')}<div id="formErr" class="small" style="color:var(--bad)"></div></form>`;
}
function readSection(sec, form) {
  const out = {}; const errs = [];
  for (const f of sec.fields) {
    if (f.type === 'chips') { out[f.k] = readChips(form, f.k); continue; }
    const raw = form.elements[f.k]?.value ?? '';
    if (f.type === 'number') {
      if (raw.trim() === '') { out[f.k] = null; continue; }
      const n = L.parseNum(raw);
      if (n === null) { errs.push(`${f.label}: keine gültige Zahl`); continue; }
      if (f.k === 'height' && n < 3) { errs.push('Körpergröße bitte in cm angeben (z. B. 178)'); continue; }
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) { errs.push(`${f.label}: Wert außerhalb ${f.min}–${f.max}`); continue; }
      out[f.k] = n;
    } else if (f.type === 'yesno') out[f.k] = raw === 'ja' ? true : raw === 'nein' ? false : null;
    else if (f.type === 'scale') out[f.k] = raw ? Number(raw) : null;
    else if (f.type === 'select' && f.num) out[f.k] = raw === '' ? null : Number(raw);
    else out[f.k] = raw.trim() === '' ? null : raw.trim();
  }
  if (sec.id === 'koerper' && out.waist && out.height && out.waist > out.height) errs.push('Bauchumfang größer als Körpergröße – bitte prüfen.');
  if (sec.id === 'rauchen' && out.smoker === false && out.cigsPerDay > 0) errs.push('Widerspruch: „rauche nicht“, aber Zigaretten pro Tag > 0.');
  if (sec.id === 'gesundheit' && out.bpSys && out.bpDia && out.bpDia >= out.bpSys) errs.push('Diastolischer Wert muss kleiner als der systolische sein.');
  if (sec.id === 'motivation' && out.priorities?.length > 3) errs.push('Bitte höchstens 3 Prioritäten wählen.');
  return { out, errs };
}

function renderOnboarding() {
  const ob = S.onboarding || { step: -1 };
  const step = ob.step ?? -1;
  if (step < 0) {
    return `<h1>HealthPilot</h1><p class="sub">Dein persönlicher Gesundheits- und Gewohnheitscoach.</p>
      <div class="card"><h3>So funktioniert die Einrichtung</h3><p>${SECTIONS.length} kurze Abschnitte, zusammen etwa 8–10 Minuten. Jeder Abschnitt kann übersprungen und später im Profil ergänzt werden. Unbekannte Werte lässt du einfach leer – HealthPilot erfindet keine Werte.</p></div>
      <div class="card"><h3>Datenschutz</h3><p class="sub">Alle Angaben werden ausschließlich auf diesem iPhone gespeichert. Es gibt kein Konto und keinen Server. Weil Browserdaten verloren gehen können, erinnert dich die App regelmäßig an eine Sicherung.</p></div>
      <div class="card"><h3>Wichtig</h3><p class="sub">HealthPilot dient der Gesundheitsförderung und ersetzt keine ärztliche Diagnose oder Behandlung. Der Lifestyle-Score ist ein persönlicher Gewohnheitsindikator, kein medizinischer Wert.</p></div>
      <button class="btn block big" data-a="obStart">Einrichtung starten</button>
      <button class="btn ghost block" data-a="demoOn" style="margin-top:8px">Erst ansehen: Demomodus mit Testdaten</button>`;
  }
  const sec = SECTIONS[step];
  const values = { ...PREFILL, ...S.profile };
  return `<div class="small">Schritt ${step + 1} von ${SECTIONS.length}</div><div class="bar" style="margin:6px 0 4px"><i style="width:${((step + 1) / SECTIONS.length) * 100}%"></i></div>
    <h1>${esc(sec.title)}</h1><p class="sub">${esc(sec.intro)}</p><div class="card">${sectionForm(sec, values)}</div>
    <div class="grid2"><button class="btn secondary" data-a="obBack">${step === 0 ? 'Zurück' : 'Zurück'}</button><button class="btn" data-a="obNext">${step === SECTIONS.length - 1 ? 'Abschließen' : 'Weiter'}</button></div>
    <button class="btn ghost block" data-a="obSkip" style="margin-top:8px">Abschnitt überspringen</button>`;
}

async function obSaveCurrent() {
  const step = S.onboarding.step; const sec = SECTIONS[step]; const form = $('#secForm');
  const { out, errs } = readSection(sec, form);
  if (errs.length) { $('#formErr').innerHTML = errs.map(esc).join('<br>'); return false; }
  const merged = { ...S.profile };
  for (const [k, v] of Object.entries(out)) merged[k] = v;
  merged.officeDays = (merged.officeDays || []).map(Number);
  await saveKv('profile', merged);
  return true;
}
async function finishOnboarding() {
  const p = S.profile;
  const preset = L.ALCOHOL_PRESETS.find((x) => x.id === p.alcTypical) || L.ALCOHOL_PRESETS[0];
  const alcW = p.alcDrinksWeek !== null && p.alcDrinksWeek !== undefined ? Math.round(p.alcDrinksWeek * L.alcoholGrams(preset.ml, preset.abv)) : null;
  const baseline = {
    date: today(), source: 'Selbstangabe im Onboarding',
    weight: p.weight ?? null, waist: p.waist ?? null, bmi: L.bmi(p.weight, p.height), rhr: p.rhr ?? null, vo2: p.vo2 ?? null,
    bpSys: p.bpSys ?? null, bpDia: p.bpDia ?? null, steps: p.baseSteps ?? null, sleepH: p.sleepH ?? null,
    cigsPerDay: p.smoker ? (p.cigsPerDay ?? null) : 0, alcoholGWeek: alcW, alcoholEstimated: true, fluidMl: p.fluidNow ?? null,
  };
  await saveKv('baseline', baseline);
  const hs = L.hydrationSuggestion(p);
  const steps = p.baseSteps ? Math.min(10000, Math.round((p.baseSteps + 1000) / 500) * 500) : 7000;
  await saveKv('goals', {
    fluidMl: hs.ml || 2000, steps, afDays: 4, alcMaxGWeek: alcW ? Math.round((alcW * 0.75) / 10) * 10 : null,
    weightMode: p.weightGoal || 'noch offen', ...S.goals,
  });
  if (p.smoker && !S.cigPlan) await saveKv('cigPlan', { start: today(), base: p.cigsPerDay ?? null, stepPerWeek: 1, floor: 0, quitDate: null });
  const lvl = ['aktuell regelmäßig'].includes(p.sportExp) ? 1 : 0;
  await saveKv('fitness', { level: lvl, start: today() });
  await saveKv('onboarding', { done: true, finishedAt: nowIso() });
  await DB.requestPersist();
  S.tab = 'heute'; render();
  const warn = [];
  if (p.morningDrink || L.auditC(p.audit1, p.audit2, p.audit3)?.high) warn.push('Deine Angaben zum Alkohol sprechen dafür, eine Reduktion ärztlich begleiten zu lassen. Bitte sprich vor einer starken Reduktion mit deiner Hausärztin oder deinem Hausarzt.');
  if (warn.length) openSheet('Wichtiger Hinweis', `<div class="card flag dringend"><p>${warn.map(esc).join('</p><p>')}</p></div><button class="btn block" data-a="closeSheet">Verstanden</button>`);
}

/* ======================= HEUTE ======================= */
function renderHeute() {
  const t = today(); const d = day(t); const h = new Date().getHours();
  const sc = scoreFor(t); const scPrev = scoreFor(L.addDays(t, -7));
  const greet = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  const name = S.profile.name ? `, ${esc(S.profile.name)}` : '';
  let html = `<div class="small">${L.WEEKDAYS[L.weekday(t)]}, ${L.fmtDate(t)}</div><h1>${greet}${name}</h1>`;

  for (const f of L.healthFlags(S.days, S.profile, t)) html += `<div class="card flag ${f.level}"><span class="tag">${f.level === 'dringend' ? 'Wichtig' : 'Hinweis'}</span>${esc(f.text)}</div>`;

  // Hinweise zu Import und Backup
  const lastImp = S.settings.lastImport; const lastBak = S.settings.lastBackup;
  if (!lastImp || L.daysBetween(lastImp.slice(0, 10), t) >= 2) html += `<div class="card flag"><b>Apple-Health-Daten importieren</b><p class="sub">${lastImp ? `Letzter Import am ${L.fmtDate(lastImp.slice(0, 10))}.` : 'Noch kein Import.'} Kurzbefehl „HealthPilot Export“ ausführen, dann hier einfügen.</p><button class="btn secondary" data-a="importClipboard">Aus Zwischenablage importieren</button></div>`;
  if (!lastBak || L.daysBetween(lastBak.slice(0, 10), t) >= 7) html += `<div class="card flag hinweis"><b>Datensicherung fällig</b><p class="sub">${lastBak ? `Letzte Sicherung am ${L.fmtDate(lastBak.slice(0, 10))}.` : 'Noch keine Sicherung vorhanden.'} Dauert 20 Sekunden.</p><button class="btn secondary" data-a="backup">Jetzt sichern</button></div>`;
  const ws = L.mondayOf(t);
  if (!S.plan.some((p) => p.week === ws)) html += `<div class="card flag"><b>Diese Woche ist noch nicht geplant</b><p class="sub">Wochen-Check-in, etwa 2 Minuten.</p><button class="btn secondary" data-a="planWeek" data-week="${ws}">Woche planen</button></div>`;

  // Score
  html += `<div class="card" data-a="scoreInfo" role="button"><div class="score">${ring(sc.total)}<div class="grow"><h3>Lifestyle-Score</h3>
    <div class="sub">${sc.total === null ? 'Noch zu wenige Daten – erfasse ein paar Tage, dann erscheint der Score.' : `7-Tage-Bewertung · ${scPrev.total !== null ? (sc.total - scPrev.total >= 0 ? '+' : '') + (sc.total - scPrev.total) + ' zur Vorwoche' : 'kein Vorwochenwert'}`}</div>
    <div class="small">Datenvollständigkeit ${sc.completeness} %${sc.total !== null && sc.completeness < 40 ? ' · <b>vorläufig</b> (wenige Daten)' : ''} · Tippen für Erklärung</div></div><span class="chev">›</span></div></div>`;

  // Größter Handlungsbedarf
  const focus = topActions(sc, 1)[0];
  if (focus) html += `<div class="card"><span class="tag">Größter Hebel gerade</span><h3>${esc(focus.title)}</h3><p class="sub">${esc(focus.text)}</p></div>`;

  // Heute zu tun
  const items = S.plan.filter((p) => p.date === t && p.area !== 'essen').sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const ready = readiness();
  html += '<h2>Heute zu tun</h2><div class="list">';
  for (const it of items) html += planItemRow(it, ready);
  const fg = fluidGoalFor(t);
  html += `<div class="item"><span class="dot" style="background:var(--c-fluid)"></span><div class="grow"><div class="t">Trinken: ${N(d.fluidMl)} / ${N(fg)} ml</div>
    <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (d.fluidMl / fg) * 100)}%;background:var(--c-fluid)"></i></div>
    <div class="small">${hydrationHint(d.fluidMl, fg)}</div></div><button class="btn secondary" data-a="drinkQuick" data-ml="250">+250</button></div>`;
  if (S.profile.smoker) {
    const ct = cigTargetToday();
    html += `<div class="item"><span class="dot" style="background:var(--c-tob)"></span><div class="grow"><div class="t">Zigaretten: ${d.cigs}${ct !== null ? ` / Ziel max. ${ct}` : ''}</div><div class="small">${ct !== null && d.cigs > ct ? 'Tagesziel überschritten – kein Grund aufzugeben, jede nicht gerauchte zählt.' : 'Jede Zigarette mit einem Tipp erfassen.'}</div></div><button class="btn secondary" data-a="cig">+1</button></div>`;
  }
  const af = S.plan.find((p) => p.date === t && p.kind === 'af');
  html += `<div class="item"><span class="dot" style="background:var(--c-alc)"></span><div class="grow"><div class="t">Alkohol: ${d.alcoholG ? N(d.alcoholG, 0) + ' g' : 'bisher keiner'}</div><div class="small">${af ? (d.alcoholG > 0 ? 'Geplant war ein alkoholfreier Tag. Kein Grund zum Ausgleichen – der nächste geplante Tag zählt.' : 'Heute ist ein geplanter alkoholfreier Tag.') : 'Kein fester alkoholfreier Tag – weniger ist trotzdem besser.'}</div></div><button class="btn ghost" data-a="tab" data-tab="erfassen">Erfassen</button></div>`;
  if (isOfficeDay(t)) html += movementBreaksRow(t);
  html += '</div>';
  html += todayMealsHtml(t);
  html += `<button class="btn secondary block" data-a="coach" data-m="heute" style="margin-top:10px">Tagescoach fragen</button>`;

  // Abend
  if (h >= 18 || d.checkin) {
    html += d.checkin ? daySummary(t) : `<div class="card"><h3>Abend-Check-in</h3><p class="sub">Fünf Fragen, unter einer Minute. Damit werden Lücken nicht als Misserfolg gezählt.</p><button class="btn block" data-a="checkin">Check-in starten</button></div>`;
  } else html += '<button class="btn secondary block" data-a="checkin" style="margin-top:6px">Abend-Check-in (ab jetzt möglich)</button>';

  // Kennzahlen
  html += '<h2>Kennzahlen</h2>' + kpiGrid();
  return html;
}
function hydrationHint(ml, goal) {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const exp = Math.round(goal * L.hydrationExpectedShare(h) / 50) * 50;
  if (ml >= goal) return 'Tagesziel erreicht.';
  if (ml + 100 >= exp) return `Im Plan (Soll bis jetzt ca. ${N(exp)} ml).`;
  return `Etwas hinter dem Tagesverlauf (Soll bis jetzt ca. ${N(exp)} ml) – ein Glas Wasser jetzt hilft.`;
}
function movementBreaksRow(t) {
  const hb = S.habits[t] || {}; const times = ['10:00', '11:30', '14:00', '15:30'];
  if (!(t in S.habits)) getHabits(t).then(() => render());
  const done = (hb.breaks || []).filter(Boolean).length;
  return `<div class="item"><span class="dot" style="background:var(--c-move)"></span><div class="grow"><div class="t">Bewegungspausen im Büro: ${done}/4</div><div class="small">2 Minuten: aufstehen, Treppe, Schultern kreisen, Wade dehnen</div>
    <div class="chips">${times.map((tm, i) => `<button class="chip ${hb.breaks?.[i] ? 'on' : ''}" data-a="breakToggle" data-i="${i}">${tm}</button>`).join('')}</div></div></div>`;
}
function planItemRow(it, ready = []) {
  const color = { pt: 'var(--c-move)', walk: 'var(--c-move)', strength: 'var(--c-move)', mobility: 'var(--c-move)', easy: 'var(--c-move)', af: 'var(--c-alc)' }[it.kind] || 'var(--accent)';
  if (it.kind === 'af') {
    const st = afStatus(it.date);
    return `<div class="item"><span class="dot" style="background:${color}"></span><div class="grow"><div class="t">Alkoholfreier Tag</div><div class="small">${st.text}</div></div><span>${st.icon}</span></div>`;
  }
  const light = ready.length && it.date === today() && ['walk', 'strength'].includes(it.kind) && !it.done;
  return `<div class="item ${it.done ? 'done' : ''} ${it.skipped ? 'skipped' : ''}"><button class="tick ${it.done ? 'on' : ''}" data-a="planToggle" data-id="${it.id}" aria-label="erledigt">${it.done ? '✓' : ''}</button>
    <div class="grow" data-a="planDetail" data-id="${it.id}" role="button"><div class="t">${esc(it.title)}</div><div class="small">${it.time ? esc(it.time) + ' Uhr · ' : ''}${it.skipped ? 'übersprungen' : it.movedFrom ? `verschoben vom ${L.fmtDate(it.movedFrom, false)}` : 'Details antippen'}${light ? ` · <b>Heute lieber locker</b> (${esc(ready.join(', '))})` : ''}</div></div><span class="chev">›</span></div>`;
}
function afStatus(date) {
  const d = day(date);
  if (d.alcoholG > 0) return { icon: '–', text: `${N(d.alcoholG)} g Alkohol erfasst – nicht schlimm, nächster Versuch.` };
  if (date < today() || d.checkin) return L.consumptionTracked(d) ? { icon: '✓', text: 'Geschafft.' } : { icon: '?', text: 'Nicht bestätigt (kein Check-in).' };
  return { icon: '', text: 'Wird beim Abend-Check-in automatisch bestätigt.' };
}
function daySummary(t) {
  const d = day(t); const items = S.plan.filter((p) => p.date === t && p.kind !== 'af' && p.area !== 'essen');
  const done = items.filter((i) => i.done).length; const fg = fluidGoalFor(t); const ct = cigTargetToday(t);
  const pts = [];
  pts.push(`Getränke: ${N(d.fluidMl)} von ${N(fg)} ml${d.fluidMl >= fg ? ' ✓' : ''}`);
  if (S.profile.smoker) pts.push(`Zigaretten: ${d.cigs}${ct !== null ? ` (Ziel max. ${ct})${d.cigs <= ct ? ' ✓' : ''}` : ''}`);
  pts.push(`Alkohol: ${d.alcoholG ? N(d.alcoholG) + ' g' : 'alkoholfrei ✓'}`);
  if (items.length) pts.push(`Geplante Einheiten: ${done} von ${items.length}`);
  return `<div class="card"><h3>Tageszusammenfassung</h3><ul class="steps">${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="small">Check-in erledigt. Energie ${d.checkin.energy ?? '–'}/5 · Stress ${d.checkin.stress ?? '–'}/5</p><button class="btn ghost" data-a="checkin">Check-in bearbeiten</button></div>`;
}

function kpiGrid() {
  const t = today(); const y = L.addDays(t, -1);
  const cur = (fn) => avgMetric(fn, y, 7); const prev = (fn) => avgMetric(fn, L.addDays(y, -7), 7);
  const m = (k) => (dd) => dd.metrics[k];
  const tracked = (fn) => (dd) => (L.consumptionTracked(dd) ? fn(dd) : null);
  const defs = [
    ['Gewicht', lastMetric('weight'), 'kg', 1, null, null],
    ['BMI', (() => { const w = lastMetric('weight'); return w ? { value: L.bmi(w.value, S.profile.height), date: w.date, source: 'geschaetzt' } : null; })(), '', 1, null, null],
    ['Bauchumfang', lastMetric('waist'), 'cm', 0, null, null],
    ['Ruhepuls Ø7', { value: cur(m('rhr')) }, 'bpm', 0, prev(m('rhr')), false],
    ['HRV Ø7', { value: cur(m('hrv')) }, 'ms', 0, prev(m('hrv')), true],
    ['VO₂max', lastMetric('vo2'), '', 1, null, null],
    ['Schritte Ø7', { value: cur(m('steps')) }, '', 0, prev(m('steps')), true],
    ['Training/Woche', { value: (() => { const v = L.range(L.addDays(y, -6), 7).map((dd) => L.trainingMinutes(day(dd))); return v.some((x) => x !== null) ? v.reduce((a, b) => a + (b || 0), 0) : null; })() }, 'min', 0, null, null],
    ['Schlaf Ø7', { value: cur(m('sleepH')) }, 'h', 1, prev(m('sleepH')), true],
    ['Schlafqualität Ø7', { value: cur((dd) => dd.checkin?.sleepQ) }, '/5', 1, prev((dd) => dd.checkin?.sleepQ), true],
    ['Trinken Ø7', { value: cur(tracked((dd) => dd.fluidMl)) }, 'ml', 0, prev(tracked((dd) => dd.fluidMl)), true],
    ['Alkohol Ø7', { value: cur(tracked((dd) => dd.alcoholG)) }, 'g/Tag', 0, prev(tracked((dd) => dd.alcoholG)), false],
    ['Alkoholfreie Tage', { value: (() => { const v = L.range(L.addDays(y, -6), 7).map(day).filter(L.consumptionTracked); return v.length ? v.filter((dd) => dd.alcoholG === 0).length : null; })() }, '/7', 0, null, null],
    ...(S.profile.smoker ? [['Zigaretten Ø7', { value: cur(tracked((dd) => dd.cigs)) }, '/Tag', 1, prev(tracked((dd) => dd.cigs)), false]] : []),
    ['Energie Ø7', { value: cur((dd) => dd.checkin?.energy) }, '/5', 1, prev((dd) => dd.checkin?.energy), true],
    ['Stress Ø7', { value: cur((dd) => dd.checkin?.stress) }, '/5', 1, prev((dd) => dd.checkin?.stress), false],
    ['Stimmung Ø7', { value: cur((dd) => dd.checkin?.mood) }, '/5', 1, prev((dd) => dd.checkin?.mood), true],
  ];
  const shown = defs.filter(([, v]) => v && v.value !== null && v.value !== undefined);
  const missing = defs.length - shown.length;
  return `<div class="grid2">${shown.map(([l, v, unit, dg, pv, hb]) => `<div class="kpi"><div class="l">${esc(l)} ${v.source ? badge(v.source) : ''}</div><div class="v">${N(v.value, dg)}<span class="small"> ${esc(unit)}</span></div>
    ${pv !== null && pv !== undefined ? trendHtml(v.value, pv, hb, dg) : v.date ? `<span class="small">${L.fmtDate(v.date, false)}</span>` : ''}</div>`).join('')}</div>
    <p class="small">${missing ? `${missing} Kennzahlen haben noch keine Daten und werden ausgeblendet. ` : ''}„Ø7“ = Mittel der letzten 7 vollständigen Tage. Kalorien und Protein folgen mit der Ernährungsplanung (Stufe 2).</p>`;
}

/* ---------- Score-Erklärung & Maßnahmen ---------- */
const ACTIONS_BY_CAT = {
  bewegung: { title: 'Mehr Bewegung im Alltag', text: 'Zwei feste Einheiten „zügig gehen“ (25–30 min) zusätzlich zum Personal Training und die vier Bewegungspausen im Büro. Das ist der realistischste Weg zu 150 Minuten pro Woche.' },
  tabak: { title: 'Nächste Reduktionsstufe halten', text: 'Die erste Zigarette des Tages so weit wie möglich nach hinten schieben und bei Verlangen „SOS“ nutzen – das Verlangen klingt meist nach wenigen Minuten ab.' },
  ernaehrung: { title: 'Gemüse zu jeder Hauptmahlzeit', text: 'Eine Handvoll Tiefkühl- oder Rohkostgemüse zu jedem Fertiggericht hebt die Qualität sofort – ohne Kochaufwand.' },
  schlaf: { title: 'Feste Aufstehzeit, auch am Wochenende', text: 'Regelmäßigkeit verbessert den Schlaf oft stärker als frühes Zubettgehen. Alkohol am Abend verschlechtert ihn messbar.' },
  alkohol: { title: 'Feste alkoholfreie Tage', text: 'Lege die alkoholfreien Tage zu Wochenbeginn fest (Wochenplan) und habe ein alkoholfreies Lieblingsgetränk im Kühlschrank.' },
  trinken: { title: 'Wasserflasche auf den Schreibtisch', text: 'Morgens eine 1-l-Flasche füllen und bis zur Mittagspause leeren. Das deckt fast die Hälfte des Tagesziels.' },
};
function topActions(sc, n = 3) {
  return sc.categories.filter((c) => c.score !== null && c.score < 85)
    .map((c) => ({ ...ACTIONS_BY_CAT[c.key], key: c.key, gain: (100 - c.score) * c.weight }))
    .sort((a, b) => b.gain - a.gain).slice(0, n);
}
function scoreInfoHtml() {
  const t = today(); const sc = scoreFor(t); const y = scoreFor(L.addDays(t, -1)); const w = scoreFor(L.addDays(t, -7));
  const ch = L.explainScoreChange(sc, y); const chw = L.explainScoreChange(sc, w);
  let h = `<div class="card flat"><p class="small">Der Score bewertet die letzten 7 Tage (gleitend), damit einzelne schlechte Tage ihn nicht einbrechen lassen. Bereiche ohne Daten werden nicht als Misserfolg gezählt, sondern weggelassen – die übrigen Gewichte werden hochgerechnet. Er ist ein persönlicher Gewohnheits- und Fortschrittsindikator, <b>kein medizinisch validierter Gesundheitswert</b>.</p></div>`;
  h += `<div class="list">${sc.categories.map((c) => `<div class="item"><div class="grow"><div class="row between"><span class="t">${esc(c.label)}</span><b>${c.score === null ? '–' : c.score}</b></div>
    <div class="small">Gewicht ${c.weight} % · ${esc(c.detail)} · Daten an ${Math.round(c.coverage * 7)}/7 Tagen</div>
    <div class="bar" style="margin-top:6px"><i style="width:${c.score ?? 0}%"></i></div></div></div>`).join('')}</div>`;
  h += `<p class="small">Gesamt ${sc.total ?? '–'} · Bereiche mit Daten decken ${sc.weightCovered} % der Gewichtung ab · Datenvollständigkeit ${sc.completeness} %</p>`;
  const exp = (arr, lbl) => (arr.length ? `<h3>${lbl}</h3><ul class="steps">${arr.slice(0, 4).map((c) => `<li><b>${esc(c.label)} ${c.diff > 0 ? '+' : ''}${c.diff}</b> (wirkt ${c.impact > 0 ? '+' : ''}${N(c.impact, 1)} auf den Gesamtscore): ${esc(c.detail)}</li>`).join('')}</ul>` : '');
  h += exp(ch, 'Veränderung seit gestern') || '<p class="small">Seit gestern keine nennenswerte Veränderung.</p>';
  h += exp(chw, 'Veränderung zur Vorwoche');
  h += `<h3>Gewichtung</h3><p class="small">Bewegung 25 %, Tabak 20 %, Ernährung 20 %, Schlaf 15 %, Alkohol 15 %, Flüssigkeit 5 %. Gegenüber deinem Vorschlag ist Tabak höher und Flüssigkeit niedriger gewichtet: Rauchen ist der größte einzelne vermeidbare Risikofaktor, während die Trinkmenge bei gesunden Erwachsenen einen vergleichsweise geringen Einfluss hat.</p>`;
  return h;
}

/* ======================= WOCHENPLAN ======================= */
function renderPlan() {
  const ws = L.addDays(L.mondayOf(today()), 7 * S.weekOffset);
  const days = L.range(ws, 7);
  const allItems = S.plan.filter((p) => p.week === ws);
  let html = `<h1>Wochenplan</h1><div class="seg" style="margin:8px 0">${[-1, 0, 1].map((o) => `<button class="${S.weekOffset === o ? 'on' : ''}" data-a="weekOffset" data-o="${o}">${o === -1 ? 'Letzte' : o === 0 ? 'Diese' : 'Nächste'} Woche</button>`).join('')}</div>
    <div class="small">${L.fmtDate(ws)} – ${L.fmtDate(days[6])}</div>
    <div class="seg" style="margin:10px 0">${[['bewegung', 'Bewegung'], ['essen', 'Ernährung'], ['einkauf', 'Einkauf']].map(([k, l]) => `<button class="${S.planView === k ? 'on' : ''}" data-a="planView" data-v="${k}">${l}</button>`).join('')}</div>
    <button class="btn secondary block" data-a="coach" data-m="${S.planView === 'bewegung' ? 'fitness' : 'ernaehrung'}">${S.planView === 'bewegung' ? 'Fitness-Assistent' : 'Ernährungs-Assistent'}</button>`;
  if (S.planView === 'essen') return html + renderEssen(ws);
  if (S.planView === 'einkauf') return html + renderEinkauf(ws);
  const items = allItems.filter((i) => i.area !== 'essen');
  if (!items.length) {
    const prevWs = L.addDays(ws, -7);
    html += `<div class="card"><h3>Noch kein Plan für diese Woche</h3><p class="sub">Der Wochen-Check-in fragt kurz nach Training, Terminen und Verfassung und erstellt daraus einen realistischen Plan.</p>
      ${S.weekOffset >= 0 ? `<button class="btn block" data-a="planWeek" data-week="${ws}">Woche planen</button>` : ''}</div>`;
    if (S.plan.some((p) => p.week === prevWs)) html += weekReview(prevWs);
  } else {
    const fit = items.filter((i) => i.area === 'fitness');
    const done = fit.filter((i) => i.done).length;
    const mins = fit.filter((i) => i.done).reduce((a, i) => a + (i.duration || 0), 0);
    html += `<div class="card"><div class="row between"><b>Umsetzung</b><span>${done}/${fit.length} Einheiten · ${mins} min</span></div><div class="bar" style="margin-top:8px"><i style="width:${fit.length ? (done / fit.length) * 100 : 0}%;background:var(--good)"></i></div>
      <div class="small" style="margin-top:6px">Stufe ${S.fitness.level + 1} von 3 · Orientierung WHO: 150 min moderate Bewegung pro Woche plus 2 × Kräftigung</div></div>`;
    for (const d of days) {
      const its = items.filter((i) => i.date === d).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      html += `<h2 style="margin-top:18px">${L.WEEKDAYS[L.weekday(d)]} <span class="small">${L.fmtDate(d, false)}${d === today() ? ' · heute' : ''}</span></h2>`;
      html += its.length ? `<div class="list">${its.map((i) => planItemRow(i, d === today() ? readiness() : [])).join('')}</div>` : '<p class="small">Frei – Alltagsbewegung genügt.</p>';
    }
    html += `<button class="btn secondary block" data-a="planWeek" data-week="${ws}" style="margin-top:16px">Woche neu planen</button>`;
  }
  return html;
}
function weekReview(ws) {
  const its = S.plan.filter((p) => p.week === ws && p.area === 'fitness');
  if (!its.length) return '';
  const done = its.filter((i) => i.done).length;
  const skippedKinds = {};
  its.filter((i) => !i.done).forEach((i) => { skippedKinds[i.title] = (skippedKinds[i.title] || 0) + 1; });
  const end = L.addDays(ws, 6);
  const sc = scoreFor(end), sp = scoreFor(L.addDays(end, -7));
  return `<div class="card"><h3>Rückblick Vorwoche</h3><p>${done} von ${its.length} Einheiten erledigt (${Math.round((done / its.length) * 100)} %).</p>
    ${Object.keys(skippedKinds).length ? `<p class="small">Nicht umgesetzt: ${esc(Object.entries(skippedKinds).map(([k, v]) => `${k}${v > 1 ? ` (${v}×)` : ''}`).join(', '))}</p>` : ''}
    <p class="small">Score ${sc.total ?? '–'}${sp.total !== null && sc.total !== null ? ` (${sc.total - sp.total >= 0 ? '+' : ''}${sc.total - sp.total})` : ''}</p>
    <p class="small"><span class="tag">Schlussfolgerung</span>${done / its.length >= 0.8 ? 'Gute Umsetzung – der neue Plan wird leicht gesteigert.' : done / its.length < 0.5 ? 'Der Plan war zu viel. Der neue Plan wird bewusst kleiner, damit er klappt.' : 'Solide. Der Umfang bleibt gleich.'}</p></div>`;
}
function weekSetupForm(ws) {
  const days = L.range(ws, 7);
  const dayOpts = days.map((d) => [d, `${L.WD_SHORT[L.weekday(d)]} ${L.fmtDate(d, false)}`]);
  const prev = S.plan.filter((p) => p.week === L.addDays(ws, -7) && p.area === 'fitness');
  const compl = prev.length ? prev.filter((p) => p.done).length / prev.length : null;
  return `${S.plan.some((p) => p.week === L.addDays(ws, -7)) ? weekReview(L.addDays(ws, -7)) : ''}
    <form id="weekForm"><label class="f"><span>An welchem Tag ist diese Woche Personal Training?</span><select name="ptDate"><option value="">kein Termin / weiß noch nicht</option>${dayOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="f"><span>Uhrzeit Personal Training</span><input type="time" name="ptTime" value="17:30"></label>
    <div class="f"><span class="small">Tage mit vollem Terminkalender, Überstunden oder Reise (dort plane ich kein Training)</span>${chipsInput('busy', dayOpts)}</div>
    <div class="f"><span class="small">Restaurantbesuche, Feiern oder Treffen mit Freunden</span>${chipsInput('social', dayOpts)}</div>
    <label class="f"><span>Alkoholfreie Tage, die du diese Woche schaffen willst</span><select name="afDays">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === (S.goals.afDays ?? 4) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="f"><span class="small">Motivation diese Woche</span>${scaleInput('motivation', 3, ['sehr niedrig', 'niedrig', 'mittel', 'gut', 'hoch'])}</div>
    <div class="f"><span class="small">Körperliche Verfassung</span>${scaleInput('condition', 3, ['krank', 'angeschlagen', 'ok', 'gut', 'sehr gut'])}</div>
    <hr><h3>Essen diese Woche</h3>
    <div class="f"><span class="small">An welchen Tagen willst du Essen bestellen?</span>${chipsInput('order', dayOpts, [])}</div>
    <label class="f"><span>Wie oft willst du abends selbst (einfach) kochen?</span><select name="cookDays">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option ${n === (S.mealDefaults.cookDays ?? ({ kaum: 1, '1–2× pro Woche': 2, '3–4× pro Woche': 4, 'fast täglich': 6 }[S.profile.cookWilling] ?? 2)) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p class="small">Gekochte Abendessen ergeben 2 Portionen – die zweite ist dein Mittagessen am nächsten Bürotag. Restaurant- und Feiertage oben werden als „Essen auswärts“ eingeplant.</p>
    <label class="check"><input type="checkbox" name="makeMeals" checked> Ernährungsplan und Einkaufsliste erstellen</label>
    <label class="check"><input type="checkbox" name="saveDefaults"> Essens-Einstellungen als Standard speichern</label>
    <p class="small">${compl !== null ? `Umsetzung Vorwoche: ${Math.round(compl * 100)} % → Belastungsstufe wird ${L.nextLevel(S.fitness.level, compl) > S.fitness.level ? 'gesteigert' : L.nextLevel(S.fitness.level, compl) < S.fitness.level ? 'reduziert' : 'beibehalten'}.` : 'Erste Woche: Start mit einer bewusst gut machbaren Belastung.'}</p>
    <button type="button" class="btn block" data-a="planWeekSave" data-week="${ws}">Plan erstellen</button></form>`;
}
async function createWeekPlan(ws) {
  const f = $('#weekForm');
  const ptDate = f.elements.ptDate.value || null;
  const busy = readChips(f, 'busy'); const social = readChips(f, 'social');
  const motivation = Number(f.elements.motivation.value || 3); const condition = Number(f.elements.condition.value || 3);
  const afWanted = Number(f.elements.afDays.value);
  // Progression anhand der Vorwoche
  const prev = S.plan.filter((p) => p.week === L.addDays(ws, -7) && p.area === 'fitness');
  let level = S.fitness.level ?? 0;
  if (prev.length && !S.fitness.levelSetFor?.includes?.(ws)) level = L.nextLevel(level, prev.filter((p) => p.done).length / prev.length);
  const lowEnergy = condition <= 2 || motivation <= 1;
  const fitItems = L.generateFitnessWeek({ weekStart: ws, ptDay: ptDate ? L.weekday(ptDate) : null, ptTime: f.elements.ptTime.value, profile: S.profile, level: condition <= 1 ? 0 : level, busyDays: busy, lowEnergy })
    .filter((it) => !(condition <= 1 && it.kind !== 'mobility' && it.kind !== 'pt'));
  // Alkoholfreie Tage: bevorzugt Mo–Do, nicht an Feier-/Restauranttagen
  const order = [1, 2, 3, 4, 0, 5, 6];
  const afDays = L.range(ws, 7).filter((d) => !social.includes(d)).sort((a, b) => order.indexOf(L.weekday(a)) - order.indexOf(L.weekday(b))).slice(0, afWanted);
  const afItems = afDays.map((d) => ({ id: `af-${d}`, date: d, kind: 'af', area: 'alkohol', title: 'Alkoholfreier Tag', done: false, skipped: false }));
  const all = [...fitItems, ...afItems].map((i) => ({ ...i, week: ws }));
  // Speiseplan
  const orderDays = readChips(f, 'order'); const cookDays = Number(f.elements.cookDays.value);
  const makeMeals = f.elements.makeMeals.checked;
  if (f.elements.saveDefaults.checked) await saveKv('mealDefaults', { cookDays });
  const existingMeals = S.plan.filter((p) => p.week === ws && p.area === 'essen');
  if (makeMeals) {
    const recent = S.plan.filter((p) => p.area === 'essen' && p.recipeId && p.date >= L.addDays(ws, -14) && p.date < ws).map((p) => p.recipeId);
    const meals = F.planMeals({
      weekStart: ws, officeDays: S.profile.officeDays || [1, 2, 3, 4, 5], cookDays, restaurantDays: social, orderDays, busyDays: busy,
      trainingDays: fitItems.filter((i) => ['pt', 'walk', 'strength'].includes(i.kind)).map((i) => i.date), ratings: S.ratings, recent, variant: String(Date.now()),
    }, S.profile, S.goals);
    for (const m of meals) {
      const old = existingMeals.find((e) => e.id === m.id && (e.status || e.date < today()));
      all.push(old || { ...m, week: ws });
    }
  } else all.push(...existingMeals);
  // Bereits erledigte Einheiten der Woche behalten
  const existing = S.plan.filter((p) => p.week === ws);
  const keepDone = existing.filter((p) => p.done && p.area === 'fitness');
  const remove = existing.filter((p) => !keepDone.includes(p)).map((p) => p.id);
  const fresh = all.filter((n) => !keepDone.some((k) => k.date === n.date && k.kind === n.kind));
  await DB.deletePlanItems(remove);
  await DB.putPlanItems(fresh);
  S.plan = S.plan.filter((p) => !remove.includes(p.id)).concat(fresh);
  await saveKv('fitness', { ...S.fitness, level, levelSetFor: [...(S.fitness.levelSetFor || []), ws].slice(-10) });
  await DB.kvSet(`week-${ws}`, { ptDate, busy, social, order: orderDays, motivation, condition, afWanted, createdAt: nowIso() });
  await saveKv('goals', { ...S.goals, afDays: afWanted });
  closeSheet(); S.tab = 'plan'; render();
  toast(lowEnergy ? 'Plan erstellt – bewusst leichter wegen Verfassung/Motivation' : 'Wochenplan erstellt');
}
function planDetailHtml(it) {
  const det = it.details || L.sessionDetails(it.kind, S.fitness.level ?? 0, S.profile);
  const days = L.range(it.week, 7);
  let h = `<p class="sub">${L.WEEKDAYS[L.weekday(it.date)]}, ${L.fmtDate(it.date)}${it.time ? ' · ' + esc(it.time) + ' Uhr' : ''} · ${it.duration || '–'} min</p>`;
  if (det) {
    h += `<div class="card"><p><span class="tag">Ziel</span>${esc(det.goal)}</p><p><span class="tag">Intensität</span>${esc(det.intensity)}</p><ol class="steps">${det.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="small"><span class="tag">Regeneration</span>${esc(det.recovery)}</p><p class="small"><span class="tag">Alternative</span>${esc(det.alt)}</p></div>
      <div class="card flat small">Bei Brustschmerz, ungewöhnlicher Atemnot, Schwindel oder Herzstolpern: sofort abbrechen und ärztlich abklären lassen (Notfall: 112).</div>`;
  }
  if (it.kind === 'pt') h += `<label class="f"><span>Uhrzeit</span><input type="time" id="ptTimeEdit" value="${esc(it.time || '')}"></label><button class="btn secondary block" data-a="planSetTime" data-id="${it.id}">Uhrzeit speichern</button>`;
  h += `<div class="grid2" style="margin-top:12px"><button class="btn" data-a="planToggle" data-id="${it.id}" data-close="1">${it.done ? 'Nicht erledigt' : 'Erledigt'}</button>
    <button class="btn secondary" data-a="planSkip" data-id="${it.id}">${it.skipped ? 'Wieder aufnehmen' : 'Überspringen'}</button></div>
    <label class="f"><span>Verschieben / nachholen am</span><select id="moveTo">${days.map((d) => `<option value="${d}" ${d === it.date ? 'selected' : ''}>${L.WD_SHORT[L.weekday(d)]} ${L.fmtDate(d, false)}</option>`).join('')}</select></label>
    <button class="btn secondary block" data-a="planMove" data-id="${it.id}">Verschieben</button>`;
  if (['walk', 'strength'].includes(it.kind)) h += `<button class="btn ghost block" data-a="planSwap" data-id="${it.id}" style="margin-top:8px">Gegen kürzere, leichte Variante tauschen</button>`;
  return h;
}
async function updatePlanItem(id, patch) {
  const it = S.plan.find((p) => p.id === id); if (!it) return;
  Object.assign(it, patch);
  await DB.putPlanItems([it]); render();
}

/* ======================= ERFASSEN ======================= */
function renderErfassen() {
  const t = today(); const d = day(t);
  let html = '<h1>Erfassen</h1><p class="sub">Ein Tipp pro Eintrag. Fehler lassen sich direkt rückgängig machen.</p>';
  // Trinken
  html += `<div class="card"><div class="row between"><h3 class="mb0">Trinken</h3><span class="sub">${N(d.fluidMl)} / ${N(fluidGoalFor(t))} ml</span></div>
    <div class="seg" style="margin:10px 0">${L.DRINK_KINDS.map((k) => `<button class="${S.logDrinkKind === k.id ? 'on' : ''}" data-a="drinkKind" data-k="${k.id}">${k.label}</button>`).join('')}</div>
    <div class="grid4">${[150, 250, 330, 500].map((ml) => `<button class="btn secondary" data-a="drink" data-ml="${ml}">+${ml}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input type="text" inputmode="numeric" id="drinkCustom" placeholder="eigene Menge in ml" class="grow"><button class="btn secondary" data-a="drinkCustom">+</button></div>
    <p class="small">Alkoholische Getränke bitte unten unter „Alkohol“ erfassen – sie zählen nicht zum Trinkziel.</p></div>`;
  // Zigaretten
  if (S.profile.smoker !== false) {
    const ct = cigTargetToday();
    html += `<div class="card"><div class="row between"><h3 class="mb0">Zigaretten</h3><span class="sub">heute ${d.cigs}${ct !== null ? ` · Ziel max. ${ct}` : ''}</span></div>
      <button class="btn big block" data-a="cig" style="margin-top:10px;background:var(--c-tob)">+1 Zigarette</button>
      <button class="btn secondary block" data-a="sos" style="margin-top:8px">SOS: Ich habe gerade Verlangen</button></div>`;
  }
  // Alkohol
  html += `<div class="card"><div class="row between"><h3 class="mb0">Alkohol</h3><span class="sub">heute ${N(d.alcoholG, 0)} g</span></div>
    <div class="grid2" style="margin-top:10px">${L.ALCOHOL_PRESETS.map((p) => `<button class="btn secondary" data-a="alc" data-id="${p.id}">${esc(p.label)}</button>`).join('')}</div>
    <button class="btn ghost block" data-a="alcCustom" style="margin-top:6px">Eigenes Getränk (Menge und %)</button>
    <p class="small">Berechnung: Menge × Alkoholgehalt × 0,8 g/ml. Keine Alkoholmenge ist gesundheitlich risikofrei.</p></div>`;
  html += `<div class="grid2"><button class="btn secondary" data-a="coach" data-m="alkohol">Alkohol-Coach</button><button class="btn secondary" data-a="coach" data-m="rauchen">Rauchstopp-Coach</button></div>`;
  // Produktcheck
  html += `<div class="card"><h3>Produkt prüfen</h3><p class="small">Barcode-Nummer (EAN) eingeben – Tipp: In der Kamera-App auf die Zahlen unter dem Strichcode zeigen und „Text erkennen“ nutzen, dann kopieren. Daten von Open Food Facts (Community-Datenbank, nicht verifiziert).</p>
    <div class="row"><input type="text" inputmode="numeric" id="eanInput" placeholder="z. B. 4001234567890" class="grow"><button class="btn secondary" data-a="productCheck">Prüfen</button></div>
    <button class="btn ghost block" data-a="coachPhoto" data-m="ernaehrung" data-q="Ist dieses Produkt für meine Ziele geeignet? Bitte Allergene prüfen.">Oder: Foto der Verpackung an KI-Coach</button></div>`;
  // Mahlzeit
  html += `<div class="card"><h3>Mahlzeit schnell bewerten</h3><p class="small">Kein Abwiegen nötig – drei Fragen genügen für die Ernährungsauswertung.</p><button class="btn secondary block" data-a="meal">Mahlzeit erfassen</button></div>`;
  // Messwerte
  html += `<div class="card"><h3>Körper & Messwerte</h3><div class="grid2">
    ${[['weight', 'Gewicht'], ['waist', 'Bauchumfang'], ['bp', 'Blutdruck'], ['rhr', 'Ruhepuls'], ['sleepH', 'Schlaf'], ['workout', 'Training'], ['steps', 'Schritte']].map(([k, l]) => `<button class="btn secondary" data-a="metric" data-k="${k}">${l}</button>`).join('')}
    <button class="btn secondary" data-a="checkin">Befinden</button></div>
    <p class="small">Manuelle Werte haben Vorrang vor importierten Werten desselben Tages.</p></div>`;
  // Import
  html += `<div class="card"><h3>Apple Health / Apple Watch</h3><p class="small">${S.settings.lastImport ? `Letzter Import: ${L.fmtDate(S.settings.lastImport.slice(0, 10))}` : 'Noch kein Import'} · Daten bleiben auf dem Gerät.</p>
    <button class="btn block" data-a="importClipboard">Aus Zwischenablage importieren</button>
    <div class="grid2" style="margin-top:8px"><button class="btn secondary" data-a="importPaste">Text einfügen</button><label class="btn secondary">Datei wählen<input type="file" accept=".json,.txt,application/json,text/plain" data-change="importFile" hidden></label></div>
    <button class="btn ghost block" data-a="shortcutHelp" style="margin-top:6px">Wie richte ich den Kurzbefehl ein?</button></div>`;
  // Heute erfasst
  const list = S.entries.filter((e) => e.date === t && e.type !== 'metric' || (e.date === t && e.source === 'manuell')).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  html += `<h2>Heute erfasst</h2>${list.length ? `<div class="list">${list.slice(0, 40).map(entryRow).join('')}</div>` : '<p class="small">Noch nichts.</p>'}`;
  return html;
}
function entryLabel(e) {
  switch (e.type) {
    case 'drink': return `${L.DRINK_KINDS.find((k) => k.id === e.sub)?.label || 'Getränk'} ${N(e.value)} ml`;
    case 'alcohol': return `${e.meta?.label || e.sub} · ${N(e.meta?.grams, 1)} g Alkohol`;
    case 'cig': return `Zigarette${e.meta?.trigger ? ' · ' + e.meta.trigger : ''}`;
    case 'urge': return `Verlangen widerstanden${e.meta?.trigger ? ' · ' + e.meta.trigger : ''}`;
    case 'meal': return `${e.meta?.slot || 'Mahlzeit'} · ${e.meta?.how || ''}${e.meta?.note ? ' · ' + e.meta.note : ''}`;
    case 'checkin': return 'Abend-Check-in';
    case 'workout': return `Training ${N(e.value)} min${e.meta?.kind ? ' · ' + e.meta.kind : ''}`;
    case 'metric': { const def = L.IMPORT_METRICS[e.sub]; return `${L.MANUAL_METRICS[e.sub] || def?.label || e.sub}: ${N(e.value, def?.digits ?? 1)} ${def?.unit || (e.sub === 'waist' ? 'cm' : e.sub.startsWith('bp') ? 'mmHg' : '')}`; }
    default: return e.type;
  }
}
function entryRow(e) {
  const time = e.ts ? new Date(e.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="item"><div class="grow"><div class="t">${esc(entryLabel(e))}</div><div class="small">${time} ${badge(e.source)}</div></div><button class="btn ghost" data-a="delEntry" data-id="${e.id}" aria-label="löschen">Löschen</button></div>`;
}
const TRIGGERS = ['Kaffee', 'Stress', 'Pause', 'Nach dem Essen', 'Alkohol', 'Gesellschaft', 'Langeweile', 'Auto', 'Gewohnheit'];

function metricForm(k) {
  const t = today();
  const dateField = `<label class="f"><span>Datum</span><input type="date" name="date" value="${t}" max="${t}"></label>`;
  if (k === 'bp') return `<form id="mForm">${dateField}<div class="grid2"><label class="f"><span>Systolisch (mmHg)</span><input name="bpSys" inputmode="numeric"></label><label class="f"><span>Diastolisch (mmHg)</span><input name="bpDia" inputmode="numeric"></label></div><p class="small">Im Sitzen nach 5 Minuten Ruhe messen.</p><div id="formErr" class="small" style="color:var(--bad)"></div><button type="button" class="btn block" data-a="metricSave" data-k="bp">Speichern</button></form>`;
  if (k === 'workout') return `<form id="mForm">${dateField}<label class="f"><span>Dauer (min)</span><input name="value" inputmode="numeric"></label><label class="f"><span>Art</span><select name="kind"><option>Personal Training</option><option>Zügig gehen</option><option>Krafttraining</option><option>Radfahren</option><option>Laufen</option><option>Mobilität</option><option>Sonstiges</option></select></label><p class="small">Nur Trainings erfassen, die die Apple Watch nicht aufgezeichnet hat – sonst wird doppelt gezählt. Pro Tag zählt der höhere Wert aus Watch und manueller Angabe.</p><div id="formErr" class="small" style="color:var(--bad)"></div><button type="button" class="btn block" data-a="metricSave" data-k="workout">Speichern</button></form>`;
  const meta = { weight: ['Gewicht', 'kg', 35, 300], waist: ['Bauchumfang', 'cm', 50, 200], rhr: ['Ruhepuls', 'Schläge/min', 30, 130], sleepH: ['Schlafdauer letzte Nacht', 'Stunden', 0, 16], steps: ['Schritte', '', 0, 100000] }[k];
  return `<form id="mForm">${dateField}<label class="f"><span>${meta[0]}${meta[1] ? ` (${meta[1]})` : ''}</span><input name="value" inputmode="decimal" autofocus></label>
    ${k === 'weight' ? '<p class="small">Am besten morgens nach dem Toilettengang, vor dem Frühstück. Tagesschwankungen von 1–2 kg sind normal; aussagekräftig ist der 7-Tage-Durchschnitt.</p>' : ''}
    <div id="formErr" class="small" style="color:var(--bad)"></div><button type="button" class="btn block" data-a="metricSave" data-k="${k}" data-min="${meta[2]}" data-max="${meta[3]}">Speichern</button></form>`;
}

function mealForm() {
  const h = new Date().getHours();
  const slot = h < 10 ? 'Frühstück' : h < 15 ? 'Mittag' : h < 21 ? 'Abend' : 'Snack';
  return `<form id="mealForm"><div class="f"><span class="small">Mahlzeit</span>${chipsInput('slot', ['Frühstück', 'Mittag', 'Abend', 'Snack'], [slot])}</div>
    <div class="f"><span class="small">Art</span>${chipsInput('how', ['Selbst gekocht', 'Convenience', 'Bestellt', 'Restaurant', 'Ohne Kochen'], [])}</div>
    <label class="check"><input type="checkbox" name="veg"> Gemüse oder Obst dabei (mind. eine Handvoll)</label>
    <label class="check"><input type="checkbox" name="protein"> Proteinquelle dabei (Fleisch, Fisch, Ei, Milchprodukt, Hülsenfrüchte)</label>
    <label class="check"><input type="checkbox" name="whole"> Vollkorn oder Hülsenfrüchte statt Weißmehl</label>
    <div class="f"><span class="small">Sättigung</span>${scaleInput('full', null, ['kaum', 'wenig', 'ok', 'gut', 'sehr'])}</div>
    <label class="f"><span>Was gab es? (optional)</span><input type="text" name="note" placeholder="z. B. Hähnchen-Reis-Pfanne TK"></label>
    <button type="button" class="btn block" data-a="mealSave">Speichern</button></form>`;
}
function checkinForm(date) {
  const c = day(date).checkin || {};
  return `<form id="ciForm"><p class="small">Für ${date === today() ? 'heute' : L.fmtDate(date)}</p>
    <div class="f"><span class="small">Energie</span>${scaleInput('energy', c.energy, ['sehr niedrig', 'niedrig', 'mittel', 'gut', 'hoch'])}</div>
    <div class="f"><span class="small">Stimmung / Wohlbefinden</span>${scaleInput('mood', c.mood)}</div>
    <div class="f"><span class="small">Stress</span>${scaleInput('stress', c.stress, ['kaum', 'wenig', 'mittel', 'hoch', 'sehr hoch'])}</div>
    <div class="f"><span class="small">Schlafqualität letzte Nacht</span>${scaleInput('sleepQ', c.sleepQ)}</div>
    <div class="f"><span class="small">Wie ausgewogen hast du heute gegessen?</span>${scaleInput('food', c.food, ['wenig', 'teils', 'gut'])}</div>
    <label class="check"><input type="checkbox" name="complete" ${c.complete === false ? '' : 'checked'}> Getränke, Alkohol und Zigaretten sind für diesen Tag vollständig erfasst</label>
    <p class="small">Nur vollständig erfasste Tage zählen als „alkoholfrei“ oder „rauchfrei“. Unvollständige Tage werden nicht negativ bewertet, sondern ausgelassen.</p>
    <label class="f"><span>Notiz (optional)</span><input type="text" name="note" value="${esc(c.note || '')}"></label>
    <button type="button" class="btn block" data-a="checkinSave" data-date="${date}">Speichern</button></form>`;
}
function sosHtml() {
  return `<div class="card"><h3>Das Verlangen geht vorbei</h3><p>Ein akutes Rauchverlangen klingt meist nach wenigen Minuten wieder ab. Überbrücke die nächsten 3 Minuten:</p>
    <ol class="steps"><li>Ein großes Glas Wasser trinken.</li><li>4 Sekunden ein-, 6 Sekunden ausatmen – 10 Atemzüge.</li><li>Ort wechseln: kurz raus, Treppe, Hände beschäftigen.</li><li>Erinnere dich: ${esc(S.profile.motivation || 'Warum willst du weniger rauchen?')}</li></ol>
    <div id="sosTimer" class="center" style="font-size:40px;font-weight:700;margin:10px 0">3:00</div><button class="btn secondary block" data-a="sosStart">3-Minuten-Timer starten</button></div>
    <div class="f"><span class="small">Was war der Auslöser?</span>${chipsInput('trig', TRIGGERS)}</div>
    <div class="grid2"><button class="btn" data-a="urgeResisted">Widerstanden</button><button class="btn secondary" data-a="urgeSmoked">Doch geraucht</button></div>
    <p class="small">Rückschläge gehören dazu. Wichtig ist der Trend über Wochen, nicht ein einzelner Moment.</p>`;
}

/* ---------- Apple-Health-Import ---------- */
async function startImport(text) {
  const parsed = L.parseHealthImport(text, today());
  const rows = L.diffImport(parsed, S.days);
  S.pendingImport = parsed;
  const changed = rows.filter((r) => r.status !== 'unverändert');
  openSheet('Import prüfen', `${parsed.warnings.length ? `<div class="card flag hinweis">${parsed.warnings.map((w) => `<p class="small">${esc(w)}</p>`).join('')}</div>` : ''}
    ${rows.length ? `<div class="list">${rows.map((r) => { const def = L.IMPORT_METRICS[r.metric]; return `<div class="item"><div class="grow"><div class="t">${def.label}: ${N(r.value, def.digits)} ${def.unit}</div><div class="small">${L.fmtDate(r.date)} · ${r.status}${r.status === 'aktualisiert' ? ` (vorher ${N(r.existing, def.digits)})` : ''}${r.status === 'manuell vorhanden' ? ' – dein manueller Wert hat Vorrang' : ''}</div></div></div>`; }).join('')}</div>
    <button class="btn block" data-a="importConfirm" ${changed.length ? '' : 'disabled'}>${changed.length ? `${changed.length} Werte übernehmen` : 'Alles bereits vorhanden'}</button>` : '<p>Keine Werte zum Übernehmen.</p>'}
    <p class="small">Doppelte Importe sind unbedenklich: Pro Tag und Messwert wird nur ein Wert gespeichert; ein erneuter Import korrigiert ihn.</p>`);
}
async function confirmImport() {
  const p = S.pendingImport; if (!p) return;
  const list = [];
  for (const d of p.days) for (const [k, v] of Object.entries(d.values)) list.push({ id: `imp-${d.date}-${k}`, type: 'metric', sub: k, value: v, date: d.date, ts: nowIso(), source: 'import' });
  await DB.putEntries(list);
  const ids = new Set(list.map((x) => x.id));
  S.entries = S.entries.filter((e) => !ids.has(e.id)).concat(list); recompute();
  await saveKv('settings', { ...S.settings, lastImport: nowIso() });
  S.pendingImport = null; closeSheet(); render();
  toast(`${list.length} Werte importiert`);
}

/* ======================= ERFOLGE ======================= */
const PERIODS = { woche: [7, 'Woche'], monat: [30, 'Monat'], quartal: [91, 'Quartal'], jahr: [365, 'Jahr'] };
function periodStats(end, n) {
  const ds = L.range(L.addDays(end, -(n - 1)), n).map(day);
  const tr = ds.filter(L.consumptionTracked);
  const mv = (k) => L.mean(ds.map((d) => d.metrics[k]).filter((v) => v !== undefined));
  const tm = ds.map(L.trainingMinutes);
  return {
    weight: mv('weight'), waist: mv('waist'), steps: mv('steps'), sleepH: mv('sleepH'), rhr: mv('rhr'), hrv: mv('hrv'), vo2: mv('vo2'),
    trainWeek: tm.some((v) => v !== null) ? (tm.reduce((a, b) => a + (b || 0), 0) / n) * 7 : null,
    fluid: tr.length ? L.mean(tr.map((d) => d.fluidMl)) : null,
    alcWeek: tr.length ? (tr.reduce((a, d) => a + d.alcoholG, 0) / tr.length) * 7 : null,
    afShare: tr.length ? tr.filter((d) => d.alcoholG === 0).length / tr.length : null,
    cigs: tr.length ? L.mean(tr.map((d) => d.cigs)) : null,
    energy: L.mean(ds.map((d) => d.checkin?.energy).filter(Boolean)), stress: L.mean(ds.map((d) => d.checkin?.stress).filter(Boolean)),
    mood: L.mean(ds.map((d) => d.checkin?.mood).filter(Boolean)),
    trackedDays: tr.length, n,
  };
}
const STAT_DEFS = [
  ['weight', 'Gewicht', 'kg', 1, null, 'weight'], ['waist', 'Bauchumfang', 'cm', 0, false, 'waist'], ['steps', 'Schritte/Tag', '', 0, true, 'steps'],
  ['trainWeek', 'Training/Woche', 'min', 0, true, null], ['sleepH', 'Schlaf', 'h', 1, true, 'sleepH'], ['rhr', 'Ruhepuls', 'bpm', 0, false, 'rhr'],
  ['hrv', 'HRV', 'ms', 0, true, null], ['vo2', 'VO₂max', '', 1, true, 'vo2'], ['fluid', 'Trinken/Tag', 'ml', 0, true, 'fluidMl'],
  ['alcWeek', 'Alkohol/Woche', 'g', 0, false, 'alcoholGWeek'], ['afShare', 'Alkoholfreie Tage', '%', 0, true, null], ['cigs', 'Zigaretten/Tag', '', 1, false, 'cigsPerDay'],
  ['energy', 'Energie', '/5', 1, true, null], ['stress', 'Stress', '/5', 1, false, null], ['mood', 'Wohlbefinden', '/5', 1, true, null],
];
function renderErfolge() {
  const t = today(); const end = L.addDays(t, -1);
  const [n, label] = PERIODS[S.period];
  const cur = periodStats(end, n); const prev = periodStats(L.addDays(end, -n), n);
  const b = S.baseline || {};
  let html = `<h1>Erfolge</h1><div class="seg" style="margin:8px 0">${Object.entries(PERIODS).map(([k, [, l]]) => `<button class="${S.period === k ? 'on' : ''}" data-a="period" data-p="${k}">${l}</button>`).join('')}</div>
    <div class="small">${L.fmtDate(L.addDays(end, -(n - 1)))} – ${L.fmtDate(end)} · vollständig erfasste Tage: ${cur.trackedDays}/${n}</div>`;

  // Interpretation
  const better = [], worse = [];
  for (const [k, l, u, dg, hb] of STAT_DEFS) {
    if (hb === null || cur[k] === null || prev[k] === null) continue;
    const diff = cur[k] - prev[k]; const rel = prev[k] ? Math.abs(diff / prev[k]) : Math.abs(diff);
    if (rel < 0.05) continue;
    const txt = `${l}: ${k === 'afShare' ? Math.round(cur[k] * 100) + ' %' : N(cur[k], dg) + (u ? ' ' + u : '')} (${diff > 0 ? '+' : ''}${k === 'afShare' ? Math.round(diff * 100) + ' Prozentpunkte' : N(diff, dg)})`;
    ((diff > 0) === hb ? better : worse).push(txt);
  }
  const sc = scoreFor(end);
  const acts = topActions(sc, 3);
  html += `<div class="card"><h3>Einordnung</h3>
    <p><span class="tag">Fakt</span>${better.length ? 'Verbessert gegenüber dem vorherigen Zeitraum: ' + esc(better.join('; ')) : 'Keine deutliche Verbesserung gegenüber dem vorherigen Zeitraum (oder zu wenige Daten).'}</p>
    <p><span class="tag">Fakt</span>${worse.length ? 'Verschlechtert: ' + esc(worse.join('; ')) : 'Keine deutliche Verschlechterung.'}</p>
    ${failPatterns()}
    ${acts.length ? `<p><span class="tag">Empfehlung</span>Die drei Maßnahmen mit dem aktuell größten Nutzen:</p><ol class="steps">${acts.map((a) => `<li><b>${esc(a.title)}</b> – ${esc(a.text)}</li>`).join('')}</ol>` : ''}
    <p class="small">Datenlage: ${cur.trackedDays < n / 2 ? 'lückenhaft – Aussagen sind unsicher.' : 'ausreichend für eine Einschätzung.'}</p></div>`;

  // Kennzahlen mit Vergleich
  html += '<h2>Vergleich</h2><div class="list">';
  for (const [k, l, u, dg, hb, bk] of STAT_DEFS) {
    if (cur[k] === null) continue;
    const fmt = (v) => (k === 'afShare' ? `${Math.round(v * 100)} %` : `${N(v, dg)} ${u}`);
    const bv = bk ? b[bk] : null;
    html += `<div class="item"><div class="grow"><div class="row between"><span class="t">${l}</span><b>${fmt(cur[k])}</b></div>
      <div class="small">Vorher ${prev[k] !== null ? fmt(prev[k]) : '–'}${bv !== null && bv !== undefined ? ` · Ausgangswert ${fmt(bv)}${bk === 'alcoholGWeek' ? ' (geschätzt)' : ''}` : ''}</div></div></div>`;
  }
  html += '</div>';

  // Diagramme
  const rangeDays = L.range(L.addDays(end, -(n - 1)), n);
  const series = (fn) => rangeDays.map((d) => ({ date: d, value: fn(day(d)) ?? null }));
  const scorePts = rangeDays.filter((_, i) => n <= 30 || i % 7 === 6).map((d) => ({ date: d, value: scoreFor(d).total }));
  html += `<h2>Verläufe</h2><div class="card"><h3>Lifestyle-Score</h3>${lineChart(scorePts, { unit: 'Punkte' })}</div>`;
  html += `<div class="card"><h3>Gewicht</h3>${lineChart(series((d) => d.metrics.weight), { ma: true, digits: 1, unit: 'kg' })}${weightNote()}</div>`;
  html += `<div class="card"><h3>Schritte</h3>${lineChart(series((d) => d.metrics.steps), { ma: true, goal: L.parseNum(S.goals.steps), unit: 'Schritte' })}</div>`;
  html += `<div class="card"><h3>Schlafdauer</h3>${lineChart(series((d) => d.metrics.sleepH), { ma: true, digits: 1, unit: 'Stunden', goal: 7 })}</div>`;
  html += `<div class="card"><h3>Ruhepuls</h3>${lineChart(series((d) => d.metrics.rhr), { ma: true, unit: 'Schläge/min' })}</div>`;
  html += `<div class="card"><h3>Trinkmenge</h3>${lineChart(series((d) => (L.consumptionTracked(d) || d.drinks ? d.fluidMl : null)), { ma: true, goal: L.parseNum(S.goals.fluidMl), unit: 'ml' })}</div>`;
  html += nutritionReport(end, n) + alcoholSection(end, n) + smokingSection(end, n) + correlations(end) + milestones(end);
  html += `<button class="btn secondary block" data-a="coach" data-m="auswertung" style="margin-top:14px">Auswertungs-Coach: ehrliche Einschätzung</button>`;
  return html;
}
function weightNote() {
  const r = L.weightRange(S.profile.height); const w = lastMetric('weight');
  if (!r || !w) return '';
  const bm = L.bmi(w.value, S.profile.height);
  return `<p class="small">BMI ${N(bm, 1)} (nur Orientierung – sagt nichts über Muskel- vs. Fettanteil). Normalgewichtsbereich nach BMI bei deiner Größe: ${N(r.min, 0)}–${N(r.max, 0)} kg. Aussagekräftiger ist der Bauchumfang${S.profile.waist || lastMetric('waist') ? `: zuletzt ${N((lastMetric('waist') || { value: S.profile.waist }).value)} cm – ${L.waistRisk((lastMetric('waist') || { value: S.profile.waist }).value)} (Männer: ab 94 cm erhöht)` : ' – bitte gelegentlich messen'}. Ziel: ${esc(S.goals.weightMode || 'noch offen')}.</p>`;
}
function failPatterns() {
  const past = S.plan.filter((p) => p.area === 'fitness' && p.date < today());
  if (past.length < 6) return '';
  const byKind = {}; const byWd = {};
  for (const p of past) {
    const k = p.kind; byKind[k] ||= [0, 0]; byKind[k][1]++; if (p.done) byKind[k][0]++;
    const w = L.weekday(p.date); byWd[w] ||= [0, 0]; byWd[w][1]++; if (p.done) byWd[w][0]++;
  }
  const names = { pt: 'Personal Training', walk: 'Zügig gehen', strength: 'Kraft zuhause', mobility: 'Mobilität', easy: 'Lockerer Spaziergang' };
  const rate = ([a, b]) => a / b;
  const kinds = Object.entries(byKind).filter(([, v]) => v[1] >= 2).sort((a, b) => rate(b[1]) - rate(a[1]));
  const wds = Object.entries(byWd).filter(([, v]) => v[1] >= 3).sort((a, b) => rate(a[1]) - rate(b[1]));
  let h = '';
  if (kinds.length) h += `<p><span class="tag">Fakt</span>Am zuverlässigsten umgesetzt: ${esc(names[kinds[0][0]])} (${Math.round(rate(kinds[0][1]) * 100)} %).${kinds.length > 1 ? ` Am seltensten: ${esc(names[kinds[kinds.length - 1][0]])} (${Math.round(rate(kinds[kinds.length - 1][1]) * 100)} %).` : ''}</p>`;
  if (wds.length && rate(wds[0][1]) < 0.5) h += `<p><span class="tag">Vermutung</span>${L.WEEKDAYS[wds[0][0]]}e scheinen schwierig (${Math.round(rate(wds[0][1]) * 100)} % umgesetzt). Bei der nächsten Wochenplanung diesen Tag als „voll“ markieren.</p>`;
  return h;
}
function alcoholSection(end, n) {
  const weeks = Math.max(1, Math.min(12, Math.ceil(n / 7)));
  const vals = []; const labels = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const we = L.addDays(end, -7 * i); const ds = L.range(L.addDays(we, -6), 7).map(day);
    const tr = ds.filter((d) => L.consumptionTracked(d) || d.alcoholG > 0);
    vals.push(tr.length ? Math.round(tr.reduce((a, d) => a + d.alcoholG, 0)) : 0); labels.push(L.fmtDate(L.addDays(we, -6), false).slice(0, 5));
  }
  const st = periodStats(end, n); const b = L.parseNum(S.baseline?.alcoholGWeek);
  const saved = b !== null && st.alcWeek !== null ? ((b - st.alcWeek) * n) / 7 : null;
  return `<div class="card"><h3>Alkohol pro Woche (g)</h3>${barChart(vals, labels, { color: 'var(--c-alc)' })}
    <p class="small">${st.afShare !== null ? `${Math.round(st.afShare * 100)} % der vollständig erfassten Tage alkoholfrei. ` : ''}${saved !== null ? `${saved >= 0 ? 'Eingespart' : 'Mehr als Ausgangswert'}: ca. ${N(Math.abs(saved))} g Alkohol ≈ ${N(L.alcoholKcal(Math.abs(saved)))} kcal (Ausgangswert ist eine Schätzung aus dem Onboarding).` : ''}
    ${S.goals.alcMaxGWeek ? ` Wochenziel: max. ${N(S.goals.alcMaxGWeek)} g.` : ''}</p></div>`;
}
function smokingSection(end, n) {
  if (!S.profile.smoker && !S.entries.some((e) => e.type === 'cig')) return '';
  const ds = L.range(L.addDays(end, -(n - 1)), n).map(day);
  const hours = Array(24).fill(0); const trig = {}; const wd = Array(7).fill(0); const wdN = Array(7).fill(0);
  for (const d of ds) {
    d.cigHours.forEach((c) => { hours[c.hour] += c.n; if (c.trigger) trig[c.trigger] = (trig[c.trigger] || 0) + c.n; });
    if (L.consumptionTracked(d)) { wd[L.weekday(d.date)] += d.cigs; wdN[L.weekday(d.date)]++; }
  }
  const tr = ds.filter(L.consumptionTracked);
  const base = L.parseNum(S.cigPlan?.base ?? S.baseline?.cigsPerDay);
  const savedCigs = base !== null && tr.length ? tr.reduce((a, d) => a + (base - d.cigs), 0) : null;
  const price = L.parseNum(S.profile.packPrice), size = L.parseNum(S.profile.packSize) || 20;
  const alcDays = tr.filter((d) => d.alcoholG > 0), dryDays = tr.filter((d) => d.alcoholG === 0);
  const topTrig = Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return `<div class="card"><h3>Rauchen nach Tageszeit</h3>${barChart(hours.slice(5, 24), hours.slice(5, 24).map((_, i) => ((i + 5) % 3 === 0 ? String(i + 5) : '')), { color: 'var(--c-tob)' })}
    <p class="small">Durchschnitt nach Wochentag: ${[1, 2, 3, 4, 5, 6, 0].map((w) => `${L.WD_SHORT[w]} ${wdN[w] ? N(wd[w] / wdN[w], 1) : '–'}`).join(' · ')}</p>
    ${topTrig.length ? `<p class="small">Häufigste Auslöser: ${esc(topTrig.map(([k, v]) => `${k} (${v})`).join(', '))}</p>` : ''}
    ${alcDays.length >= 3 && dryDays.length >= 3 ? `<p class="small"><span class="tag">Fakt</span>An Tagen mit Alkohol Ø ${N(L.mean(alcDays.map((d) => d.cigs)), 1)} Zigaretten, ohne Alkohol Ø ${N(L.mean(dryDays.map((d) => d.cigs)), 1)}.</p>` : ''}
    ${savedCigs !== null ? `<p><b>${savedCigs >= 0 ? 'Eingespart' : 'Mehr geraucht'}: ${N(Math.abs(savedCigs))} Zigaretten${price ? ` ≈ ${N((Math.abs(savedCigs) / size) * price, 2)} €` : ''}</b> <span class="small">(gegenüber Ausgangswert ${N(base)} / Tag, nur vollständig erfasste Tage)</span></p>` : ''}
    <p class="small">Unterstützung beim Aufhören: Rauchfrei-Telefon des BIÖG 0800 8 31 31 31 (kostenfrei) und rauchfrei-info.de. Nikotinersatz und ärztliche Beratung erhöhen die Erfolgschancen nachweislich – sprich deine Hausarztpraxis an, wenn du bereit bist.</p></div>`;
}
function correlations(end) {
  const pairs = (fy) => {
    const out = [];
    for (const d of L.range(L.addDays(end, -89), 90)) {
      const a = day(d); const nxt = day(L.addDays(d, 1));
      if (!(L.consumptionTracked(a) || a.alcoholG > 0)) continue;
      const y = fy(nxt); if (y === undefined || y === null) continue;
      out.push([a.alcoholG, y]);
    }
    return out;
  };
  const rows = [['Schlafdauer in der Nacht danach', (d) => d.metrics.sleepH], ['Ruhepuls am Folgetag', (d) => d.metrics.rhr], ['HRV am Folgetag', (d) => d.metrics.hrv], ['Energie am Folgetag', (d) => d.checkin?.energy]];
  const res = rows.map(([l, f]) => { const p = pairs(f); return { l, n: p.length, r: p.length >= 14 && p.some((x) => x[0] > 0) ? L.pearson(p) : null }; });
  return `<div class="card"><h3>Zusammenhänge mit Alkohol</h3>${res.map((x) => `<p class="small"><b>${x.l}:</b> ${x.n < 14 ? `zu wenige Datenpaare (${x.n}/14)` : esc(L.describeCorrelation(x.r, x.n))}</p>`).join('')}
    <p class="small"><span class="tag">Hinweis</span>Das sind statistische Zusammenhänge in deinen eigenen Daten (letzte 90 Tage), keine nachgewiesene Ursache. Andere Faktoren wie Wochenende, Stress oder späte Mahlzeiten können mitwirken.</p></div>`;
}
function milestones(end) {
  const streak = (pred) => { let s = 0; for (let i = 0; i < 400; i++) { const d = day(L.addDays(end, -i)); if (!pred(d)) break; s++; } return s; };
  const smokeFree = S.profile.smoker ? streak((d) => L.consumptionTracked(d) && d.cigs === 0) : null;
  const stepGoal = L.parseNum(S.goals.steps) || 8000;
  const stepStreak = streak((d) => (d.metrics.steps ?? -1) >= stepGoal);
  const all = Object.values(S.days);
  const maxSteps = Math.max(0, ...all.map((d) => d.metrics.steps || 0));
  const bestVo2 = Math.max(0, ...all.map((d) => d.metrics.vo2 || 0));
  const afTotal = all.filter((d) => L.consumptionTracked(d) && d.alcoholG === 0).length;
  const sfTotal = S.profile.smoker ? all.filter((d) => L.consumptionTracked(d) && d.cigs === 0).length : 0;
  const weeksPlanned = [...new Set(S.plan.map((p) => p.week))].filter((w) => { const f = S.plan.filter((p) => p.week === w && p.area === 'fitness'); return f.length && f.filter((p) => p.done).length / f.length >= 0.8; }).length;
  const items = [
    smokeFree !== null && [`${smokeFree} ${smokeFree === 1 ? 'Tag' : 'Tage'}`, 'rauchfrei in Folge'], S.profile.smoker && [`${sfTotal}`, 'rauchfreie Tage insgesamt'],
    [`${afTotal}`, 'alkoholfreie Tage insgesamt'], [`${stepStreak} ${stepStreak === 1 ? 'Tag' : 'Tage'}`, `Schrittziel (${N(stepGoal)}) in Folge`],
    maxSteps && [N(maxSteps), 'meiste Schritte an einem Tag'], bestVo2 && [N(bestVo2, 1), 'beste VO₂max'], [`${weeksPlanned}`, 'Wochen mit ≥ 80 % Planumsetzung'],
  ].filter(Boolean);
  return `<h2>Meilensteine & Bestwerte</h2><div class="grid2">${items.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>`;
}

/* ======================= PROFIL ======================= */
function renderProfil() {
  const p = S.profile; const g = S.goals;
  const hs = L.hydrationSuggestion(p);
  const audit = L.auditC(p.audit1, p.audit2, p.audit3); const hsiV = p.smoker ? L.hsi(p.minutesToFirst, p.cigsPerDay) : null;
  let html = `<h1>Profil</h1><p class="sub">${esc(p.sex || '')}${p.age ? ', ' + p.age + ' Jahre' : ''}${p.height ? ', ' + p.height + ' cm' : ''}${p.weight ? ', ' + N(p.weight, 1) + ' kg (Onboarding)' : ''}</p>`;
  html += `<h2>Profil bearbeiten</h2><div class="list">${SECTIONS.map((s) => `<div class="item" data-a="editSection" data-id="${s.id}" role="button"><div class="grow t">${esc(s.title)}</div><span class="chev">›</span></div>`).join('')}</div>`;
  if (audit || hsiV) html += `<div class="card"><h3>Einordnung deiner Angaben</h3>${audit ? `<p class="small">AUDIT-C: ${audit.score}/12 Punkte – ${audit.flag ? 'auffällig (für Männer ab 4 Punkten). Das ist keine Diagnose, aber ein Hinweis, dass sich eine Reduktion lohnt.' : 'unauffällig.'}${audit.high || p.morningDrink ? ' <b>Bitte eine Reduktion ärztlich begleiten lassen.</b>' : ''}</p>` : ''}
    ${hsiV ? `<p class="small">Abhängigkeitsindex Rauchen (Heaviness of Smoking Index): ${hsiV.score}/6 – ${hsiV.level}. Bei mittlerer bis hoher Abhängigkeit ist Nikotinersatz besonders hilfreich.</p>` : ''}</div>`;
  html += `<h2>Ziele</h2><div class="card"><form id="goalForm">
    <label class="f"><span>Trinkziel (ml/Tag, ohne Alkohol)</span><input name="fluidMl" inputmode="numeric" value="${g.fluidMl ?? ''}"></label><p class="small">Vorschlag: ${N(hs.ml)} ml. ${esc(hs.reason)}</p>
    <label class="f"><span>Schrittziel pro Tag</span><input name="steps" inputmode="numeric" value="${g.steps ?? ''}"></label>
    <label class="f"><span>Alkoholfreie Tage pro Woche</span><input name="afDays" inputmode="numeric" value="${g.afDays ?? ''}"></label>
    <label class="f"><span>Höchstens Gramm Alkohol pro Woche (Zwischenziel)</span><input name="alcMaxGWeek" inputmode="numeric" value="${g.alcMaxGWeek ?? ''}"></label>
    <p class="small">Zur Orientierung: 0,5 l Bier ≈ 20 g, 0,2 l Wein ≈ 19 g. Weniger ist immer besser; eine risikofreie Menge gibt es nicht.</p>
    <label class="f"><span>Gewicht</span><select name="weightMode">${['halten', 'moderat reduzieren (0,25–0,5 kg pro Woche)', 'noch offen'].map((o) => `<option ${g.weightMode === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    ${p.height ? `<p class="small">BMI-Normalbereich bei ${p.height} cm: ${N(L.weightRange(p.height).min, 0)}–${N(L.weightRange(p.height).max, 0)} kg. Ein realistisches erstes Ziel sind 5 % weniger in 3–6 Monaten, ein Bauchumfang unter 94 cm ist das gesundheitlich relevantere Ziel.</p>` : ''}
    ${p.smoker ? `<hr><h3>Rauchen: Reduktionsplan</h3>
    <label class="f"><span>Ausgangswert (Zigaretten/Tag)</span><input name="cigBase" inputmode="numeric" value="${S.cigPlan?.base ?? ''}"></label>
    <label class="f"><span>Reduktion pro Woche um</span><input name="cigStep" inputmode="numeric" value="${S.cigPlan?.stepPerWeek ?? 1}"></label>
    <label class="f"><span>Rauchstopp-Datum (optional)</span><input type="date" name="quitDate" value="${S.cigPlan?.quitDate ?? ''}"></label>
    <p class="small">Aktuelles Tagesziel: ${cigTargetToday() ?? '–'}. Ein fester Rauchstopp-Tag ist nach Studienlage meist erfolgreicher als endloses Reduzieren – die Reduktion ist ein guter Weg dorthin.</p>` : ''}
    <div id="formErr" class="small" style="color:var(--bad)"></div><button type="button" class="btn block" data-a="goalsSave">Ziele speichern</button></form></div>`;

  // Daten & Sicherung
  html += `<h2>Daten & Sicherung</h2><div class="card"><p class="small">Letzte Sicherung: ${S.settings.lastBackup ? L.fmtDate(S.settings.lastBackup.slice(0, 10)) : 'noch nie'}</p>
    <button class="btn block" data-a="backup">Sicherung erstellen</button>
    <label class="btn secondary block" style="margin-top:8px">Sicherung wiederherstellen<input type="file" accept=".json,application/json" data-change="restoreFile" hidden></label>
    <p class="small">Tipp: Beim Sichern „In Dateien sichern“ → iCloud Drive wählen. Bei Verlust des iPhones oder versehentlichem Löschen der App kannst du so alles wiederherstellen.</p>
    <div id="storageInfo" class="small"></div><button class="btn ghost" data-a="persist">Dauerhafte Speicherung anfordern</button></div>`;
  html += `<div class="card"><h3>Erinnerungen</h3><p class="small">iOS erlaubt Web-Apps keine zeitgesteuerten Mitteilungen ohne eigenen Server. Deshalb laufen Erinnerungen über persönliche Automationen in der Kurzbefehle-App – zuverlässig, ohne Server und jederzeit dort änderbar oder abschaltbar. Die empfohlenen Zeiten stehen in der Anleitung.</p><button class="btn secondary block" data-a="remindersHelp">Empfohlene Erinnerungen anzeigen</button></div>`;
  html += `<div class="card"><h3>Demomodus</h3><p class="small">${isDemo() ? 'Aktiv. Du siehst Testdaten in einer getrennten Datenbank. Deine echten Daten sind unberührt.' : 'Zeigt die App mit 60 Tagen Testdaten – in einer getrennten Datenbank, deine Daten bleiben unberührt.'}</p>
    <button class="btn secondary block" data-a="${isDemo() ? 'demoOff' : 'demoOn'}">${isDemo() ? 'Demomodus beenden' : 'Demomodus starten'}</button></div>`;
  html += `<div class="card"><h3>Ausgangswerte</h3>${baselineHtml()}</div>`;
  html += `<div class="card"><h3>Quellen & Stand</h3><ul class="small steps">
    <li>Bewegung: WHO-Leitlinie zu körperlicher Aktivität (2020): 150–300 min moderate Ausdaueraktivität pro Woche und Muskelkräftigung an ≥ 2 Tagen.</li>
    <li>Alkohol: DGE-Positionspapier (2024): Es gibt keine gesundheitlich unbedenkliche Alkoholmenge; Empfehlung ist, auf Alkohol zu verzichten. AUDIT-C nach WHO-AUDIT.</li>
    <li>Getränke: DGE-Orientierungswert ca. 1,5 l Getränke pro Tag für Erwachsene, mehr bei Hitze und körperlicher Aktivität.</li>
    <li>Bauchumfang: WHO-Grenzwerte (Männer ≥ 94 cm erhöht, ≥ 102 cm deutlich erhöht).</li>
    <li>Rauchstopp: BIÖG-Angebote (rauchfrei-info.de, Telefon 0800 8 31 31 31); S3-Leitlinie Rauchen und Tabakabhängigkeit (AWMF).</li>
    <li>Maximalpuls-Schätzung: Tanaka-Formel 208 − 0,7 × Alter (Schätzung, individuell abweichend).</li></ul>
    <p class="small">Stand der Inhalte: November 2026. HealthPilot ${L.VERSION} – dient der Gesundheitsförderung und ersetzt keine ärztliche Diagnose oder Behandlung.</p></div>`;
  html += aiSettingsHtml();
  html += `<div class="card"><h3>Lieblingsrestaurants & Lieferdienste</h3><p class="small">${S.restaurants.length} gespeichert.</p><button class="btn secondary block" data-a="restaurants">Verwalten</button></div>`;
  html += `<button class="btn danger block" data-a="wipe" style="margin:20px 0">Alle Daten auf diesem Gerät löschen</button>`;
  setTimeout(async () => { const i = await DB.storageInfo(); const el = $('#storageInfo'); if (el) el.textContent = `Dauerhafter Speicher: ${i.persisted === null ? 'unbekannt' : i.persisted ? 'aktiv' : 'nicht bestätigt'}${i.usage !== null ? ` · belegt ca. ${N(i.usage / 1024 / 1024, 1)} MB` : ''}`; }, 0);
  return html;
}
function baselineHtml() {
  const b = S.baseline; if (!b) return '<p class="small">Noch keine.</p>';
  const rows = [['Gewicht', b.weight, 'kg', 1], ['Bauchumfang', b.waist, 'cm', 0], ['BMI', b.bmi, '', 1], ['Ruhepuls', b.rhr, 'bpm', 0], ['VO₂max', b.vo2, '', 1], ['Schritte/Tag', b.steps, '', 0], ['Schlaf', b.sleepH, 'h', 1], ['Zigaretten/Tag', b.cigsPerDay, '', 0], ['Alkohol/Woche (geschätzt)', b.alcoholGWeek, 'g', 0], ['Trinkmenge', b.fluidMl, 'ml', 0]];
  return `<p class="small">Erfasst am ${L.fmtDate(b.date.slice(0, 10))} · Quelle: ${esc(b.source)}</p><div class="small">${rows.map(([l, v, u, d]) => `${l}: ${v === null || v === undefined ? 'unbekannt' : N(v, d) + ' ' + u}`).join(' · ')}</div>
    <button class="btn ghost" data-a="baselineReset">Ausgangswerte aus aktuellem Profil neu setzen</button>`;
}
function remindersHtml() {
  const p = S.profile;
  const rows = [
    ['07:00 täglich', 'Kurzbefehl „HealthPilot Export“ ausführen und Mitteilung „Daten bereit – HealthPilot öffnen und importieren“'],
    ['10:00, 12:30, 15:00 werktags', 'Mitteilung „Ein Glas Wasser“'],
    [`${p.workStart || '08:15'}–${p.workEnd || '17:00'}, alle 90 min`, 'Mitteilung „Bewegungspause: 2 min aufstehen“ (als einzelne Automationen 10:00, 11:30, 14:00, 15:30)'],
    ['17:15 an Trainingstagen', 'Mitteilung „Heute geplant: Training – Details in HealthPilot“'],
    ['21:30 täglich', 'Mitteilung „Abend-Check-in (60 Sekunden)“'],
    ['Sonntag 18:00', 'Mitteilung „Wochenrückblick und Planung der neuen Woche“'],
  ];
  return `<p class="small">Einrichtung je Erinnerung: Kurzbefehle-App → Automation → + → Tageszeit → Uhrzeit und Wochentage wählen → „Sofort ausführen“ → Aktion „Mitteilung anzeigen“ mit dem Text. Abschalten: Automation antippen → deaktivieren.</p>
    <div class="list">${rows.map(([a, b]) => `<div class="item"><div class="grow"><div class="t">${esc(a)}</div><div class="small">${esc(b)}</div></div></div>`).join('')}</div>`;
}
function shortcutHelpHtml() {
  return `<p class="small">Die vollständige, bebilderte Schritt-für-Schritt-Anleitung steht in der Datei ANLEITUNG.md im Paket. Kurzfassung:</p>
    <ol class="steps small"><li>Kurzbefehle-App → + → Name „HealthPilot Export“.</li><li>Für jeden Messwert: „Health-Samples suchen“ (Typ, Startdatum „ist gestern“) → „Statistik berechnen“ (Summe oder Durchschnitt).</li>
    <li>Aktion „Wörterbuch“ mit den Schlüsseln datum, schritte, strecke_km, aktive_kcal, ruhe_kcal, trainingsminuten, ruhepuls, hrv, vo2max, gewicht, schlaf_min und den Ergebnissen als Zahl.</li>
    <li>Aktion „In Zwischenablage kopieren“ mit dem Wörterbuch.</li><li>HealthPilot öffnen → Erfassen → „Aus Zwischenablage importieren“ → prüfen → übernehmen.</li></ol>
    <p class="small">Beispiel für gültigen Inhalt:</p><pre class="code">{"datum":"${L.addDays(today(), -1)}","schritte":8234,"strecke_km":5.9,"aktive_kcal":512,"ruhe_kcal":1790,"trainingsminuten":34,"ruhepuls":61,"hrv":42,"vo2max":38.4,"gewicht":82.6,"schlaf_min":421}</pre>
    <p class="small">Fehlende Werte einfach weglassen oder 0 übertragen – 0 bei Ruhepuls, HRV, VO₂max und Gewicht wird als „kein Messwert“ behandelt. Schlaf wird dem Aufwachtag (Tag nach „datum“) zugeordnet.</p>`;
}

/* ======================= Backup ======================= */
async function doBackup() {
  const data = await DB.exportAll();
  const json = JSON.stringify(data);
  const name = `HealthPilot-${isDemo() ? 'DEMO-' : ''}Sicherung-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let ok = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); ok = true; }
  } catch (e) { if (e.name === 'AbortError') { toast('Sicherung abgebrochen'); return; } }
  if (!ok) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  await saveKv('settings', { ...S.settings, lastBackup: nowIso() });
  render(); toast(`Sicherung erstellt (${N(S.entries.length)} Einträge)`);
}
async function restoreFromText(text) {
  let data;
  try { data = JSON.parse(text); } catch { toast('Datei ist keine gültige Sicherung'); return; }
  const err = DB.validateBackup(data);
  if (err) { toast(err); return; }
  S.pendingRestore = data;
  openSheet('Sicherung wiederherstellen', `<div class="card"><p>Sicherung vom <b>${L.fmtDate(data.exported.slice(0, 10))}</b> mit ${N(data.entries.length)} Einträgen und ${N(data.plan.length)} Planeinträgen${data.mode === 'demo' ? ' <b>(Demodaten!)</b>' : ''}.</p>
    <p class="small">Alle aktuellen Daten auf diesem Gerät werden ersetzt. Der aktuelle Stand wird vorher automatisch als Schnappschuss gespeichert.</p></div>
    <button class="btn block" data-a="restoreConfirm">Wiederherstellen</button>`);
}

/* ======================= ERNÄHRUNG (Stufe 2) ======================= */
const SLOT_ORDER = ['frueh', 'mittag', 'snack', 'abend'];
const mealsOf = (pred) => S.plan.filter((p) => p.area === 'essen' && pred(p));
function recipeOf(it) { return it.recipeId ? F.RECIPE[it.recipeId] : it.customId ? S.customRecipes[it.customId] : null; }
function mealTitle(it) {
  if (it.placeholder === 'restaurant') return 'Essen auswärts (Restaurant/Feier)';
  if (it.placeholder === 'bestellen') return 'Essen bestellen';
  const r = recipeOf(it); if (!r) return it.otherText || 'Frei';
  return `${it.leftoverFrom ? 'Rest: ' : ''}${r.name}${it.portions > 1 ? ` (${N(it.portions, 2)} Portionen)` : ''}`;
}
function mealRow(it) {
  const r = recipeOf(it); const st = it.status; const nu = F.mealNutrition(it, S.customRecipes);
  const meta = it.placeholder ? (it.placeholder === 'restaurant' ? 'Tipps und Speisekarte prüfen' : 'Bestell-Tipps und Lieblingsrestaurants')
    : r ? `${it.leftoverFrom ? 'aufwärmen · ' : `${r.active} min aktiv · `}ca. ${N(nu?.kcal)} kcal · ${N(nu?.p)} g Protein${r.source === 'ki' ? ' · KI-Vorschlag' : ''}` : '';
  return `<div class="item ${st === 'gegessen' ? 'done' : ''} ${st === 'ausgelassen' ? 'skipped' : ''}"><button class="tick ${st === 'gegessen' ? 'on' : ''}" data-a="mealEaten" data-id="${it.id}" aria-label="gegessen">${st === 'gegessen' ? '✓' : ''}</button>
    <div class="grow" data-a="mealDetail" data-id="${it.id}" role="button"><div class="small">${F.SLOT_LABEL[it.slot]}${st === 'ersetzt' ? ' · ersetzt' : st === 'ausgelassen' ? ' · ausgelassen' : ''}</div><div class="t">${esc(mealTitle(it))}</div><div class="small">${meta}</div></div><span class="chev">›</span></div>`;
}
function dayNutrition(d) {
  const es = S.entries.filter((e) => e.type === 'meal' && e.date === d);
  const sum = (k) => es.reduce((a, e) => a + (L.parseNum(e.meta?.[k]) || 0), 0);
  return { kcal: sum('kcal'), p: sum('p'), fib: sum('fib'), n: es.length, withNut: es.filter((e) => e.meta?.kcal).length };
}
function todayMealsHtml(t) {
  const ms = mealsOf((p) => p.date === t).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  if (!ms.length) return '';
  const tgt = F.nutritionTargets(S.profile, S.goals); const sum = dayNutrition(t);
  return `<h2>Heute essen</h2><div class="list">${ms.map(mealRow).join('')}</div>
    <p class="small">Bisher ca. ${N(sum.kcal)} kcal · ${N(sum.p)} g Protein · ${N(sum.fib)} g Ballaststoffe${tgt ? ` (Orientierung: ${N(tgt.kcal)} kcal, ${tgt.protein} g Protein, ${tgt.fiber} g Ballaststoffe)` : ''} – Schätzwerte. Kreis antippen = wie geplant gegessen.</p>
    <button class="btn secondary block" data-a="coach" data-m="ernaehrung">Ernährungs-Assistent</button>`;
}
function renderEssen(ws) {
  const items = mealsOf((p) => p.week === ws);
  const tgt = F.nutritionTargets(S.profile, S.goals);
  if (!items.length) return `<div class="card"><h3>Noch kein Ernährungsplan</h3><p class="sub">Der Wochen-Check-in erstellt Speiseplan und Einkaufsliste – passend zu Bürotagen, Training, Restaurantbesuchen und deiner Kochbereitschaft.</p><button class="btn block" data-a="planWeek" data-week="${ws}">Woche planen</button></div>`;
  let h = tgt ? `<div class="card flat small">Tagesorientierung: ca. ${N(tgt.kcal)} kcal, ${tgt.protein} g Protein, ≥ ${tgt.fiber} g Ballaststoffe. ${esc(tgt.note)}</div>` : '';
  for (const d of L.range(ws, 7)) {
    const its = items.filter((i) => i.date === d).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const kc = its.reduce((a, i) => a + (F.mealNutrition(i, S.customRecipes)?.kcal || (i.placeholder ? 750 : 0)), 0);
    const pr = its.reduce((a, i) => a + (F.mealNutrition(i, S.customRecipes)?.p || (i.placeholder ? 30 : 0)), 0);
    h += `<h2 style="margin-top:18px">${L.WEEKDAYS[L.weekday(d)]} <span class="small">${L.fmtDate(d, false)}${d === today() ? ' · heute' : ''} · ca. ${N(kc)} kcal, ${N(pr)} g Protein</span></h2><div class="list">${its.map(mealRow).join('')}</div>`;
  }
  h += `<button class="btn secondary block" data-a="mealsRegenerate" data-week="${ws}" style="margin-top:14px">Offene Mahlzeiten neu vorschlagen</button>
    <p class="small">Bereits gegessene und vergangene Mahlzeiten bleiben erhalten. Deine Bewertungen fließen in die Auswahl ein.</p>`;
  return h;
}
async function getShopState(ws) {
  S.shop ||= {};
  if (!S.shop[ws]) S.shop[ws] = { checked: await DB.kvGet(`shop-${ws}`, {}), extras: await DB.kvGet(`shopx-${ws}`, []) };
  return S.shop[ws];
}
function renderEinkauf(ws) {
  if (!S.shop?.[ws]) { getShopState(ws).then(render); return '<p class="small">Lade …</p>'; }
  const st = S.shop[ws];
  const items = mealsOf((p) => p.week === ws);
  const from = ws <= today() && today() <= L.addDays(ws, 6) ? today() : null;
  const list = F.shoppingList(items, { pantry: S.pantry, fromDate: from, extras: st.extras });
  const thu = L.addDays(ws, 3);
  const second = list.toBuy.filter((r) => r.perishable && r.firstDate && r.firstDate >= thu);
  const first = list.toBuy.filter((r) => !second.includes(r));
  const open = list.toBuy.filter((r) => !st.checked[r.k]).length;
  const rowH = (r) => `<div class="item ${st.checked[r.k] ? 'done' : ''}"><button class="tick ${st.checked[r.k] ? 'on' : ''}" data-a="shopToggle" data-k="${esc(r.k)}" data-week="${ws}">${st.checked[r.k] ? '✓' : ''}</button>
    <div class="grow"><div class="t">${esc(r.name)}</div><div class="small">${r.extra ? 'eigener Eintrag' : `${r.packs} × ${esc(r.packLabel)} · ca. ${N(r.cost, 2)} €`}${r.uses.length ? ` · für ${esc(r.uses.slice(0, 3).join(', '))}${r.uses.length > 3 ? ' …' : ''}` : ''}</div>${r.check ? `<div class="small" style="color:var(--warn)">⚠ ${esc(r.check)}</div>` : ''}</div></div>`;
  const group = (rows) => F.SECTIONS.map((sec) => { const rs = rows.filter((r) => r.sec === sec); return rs.length ? `<h3 style="margin:16px 0 6px">${sec}</h3><div class="list">${rs.map(rowH).join('')}</div>` : ''; }).join('');
  let h = `<div class="card"><div class="row between"><b>${open} von ${list.toBuy.length} offen</b><span class="sub">ca. ${N(list.cost, 2)} €</span></div><p class="small">${from ? 'Ab heute benötigt. ' : ''}Mengen auf handelsübliche Packungen gerundet; Preise grob geschätzt (Eigenmarken Edeka/Rewe). Grundvorrat (Öl, Gewürze, Haferflocken …) ist ausgeblendet – unter „Vorräte“ änderbar.</p>
    <div class="grid2"><button class="btn secondary" data-a="pantry">Vorräte</button><button class="btn secondary" data-a="coach" data-m="ernaehrung" data-q="Ich bin gerade im Supermarkt. Was sollte ich zusätzlich oder statt der Liste mitnehmen?">Bin im Laden</button></div></div>`;
  if (!list.toBuy.length) h += '<p class="small">Nichts zu kaufen – entweder ist noch kein Plan erstellt oder alles ist vorrätig.</p>';
  h += `<h2>Wocheneinkauf</h2>${group(first)}`;
  if (second.length) h += `<h2>Ergänzungseinkauf ab Donnerstag</h2><p class="small">Frische Zutaten, die erst ab Donnerstag gebraucht werden.</p>${group(second)}`;
  h += `<h2>Eigener Artikel</h2><div class="row"><input type="text" id="shopExtra" class="grow" placeholder="z. B. Mineralwasser"><button class="btn secondary" data-a="shopAdd" data-week="${ws}">+</button></div>`;
  return h;
}
function ingredientLines(it) {
  const r = recipeOf(it); if (!r) return [];
  if (r.ingText) return r.ingText.map((z) => `${z.menge ? z.menge + ' ' : ''}${z.name}`);
  const f = it.portions || 1;
  return r.ing.map(([k, q]) => `${F.fmtQty(k, q * f)} ${F.INGREDIENTS[k].name}`);
}
function recipeSteps(r) { return r.stepsText ? r.stepsText.map((t) => ({ t })) : r.steps; }
function mealDetailHtml(it) {
  if (it.placeholder) return placeholderHtml(it);
  const r = recipeOf(it);
  if (!r) return `<p>${esc(it.otherText || 'Kein Gericht geplant.')}</p>${mealActionsHtml(it)}`;
  const nu = F.mealNutrition(it, S.customRecipes);
  const checks = r.ingText ? [r.allergenNote || 'KI-Vorschlag: Allergene nicht verifiziert – alle Zutaten und Etiketten prüfen.'] : F.recipeLabelChecks(r);
  const f = it.portions || 1;
  let h = `<p class="sub">${L.WEEKDAYS[L.weekday(it.date)]}, ${L.fmtDate(it.date)} · ${F.SLOT_LABEL[it.slot]} · ${F.STRATEGY_LABEL[r.strategy] || ''}</p>`;
  if (it.leftoverFrom) h += `<div class="card flat small">Das ist die zweite Portion vom ${L.WEEKDAYS[L.weekday(it.leftoverFrom)]}. ${esc('Im Büro: abgedeckt 2–3 Minuten bei 800 W, umrühren, weitere 1–2 Minuten, bis alles durchgehend dampfend heiß ist.')}</div>`;
  h += `<div class="grid3"><div class="kpi"><div class="v">${r.active}</div><div class="l">min aktiv</div></div><div class="kpi"><div class="v">${r.total}</div><div class="l">min gesamt</div></div><div class="kpi"><div class="v">${it.leftoverFrom ? 1 : N((r.servings || 1) * f, 1)}</div><div class="l">Portion(en)</div></div></div>
    <div class="card"><b>Nährwerte pro Portion (geschätzt)</b><p class="small">ca. ${N(nu.kcal)} kcal · ${N(nu.p)} g Protein · ${N(nu.fib)} g Ballaststoffe${r.veg ? ' · mit Gemüse/Obst' : ''}${r.whole ? ' · Vollkorn/Hülsenfrüchte' : ''}</p></div>`;
  if (checks.length) h += `<div class="card flag hinweis"><b>Allergene prüfen</b>${checks.map((c) => `<p class="small">${esc(c)}</p>`).join('')}<p class="small">Rezepturen von Fertigprodukten können sich ändern – das Etikett beim Kauf ist maßgeblich.</p></div>`;
  if (!it.leftoverFrom) {
    h += `<h3>Zutaten${f > 1 ? ` (für ${N(f, 2)} Portionen)` : ''}</h3><ul class="steps">${ingredientLines(it).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    if (r.equip?.length) h += `<p class="small">Geräte: ${esc(r.equip.join(', '))}</p>`;
    h += `<h3>Zubereitung</h3><ol class="steps">${recipeSteps(r).map((s) => `<li>${esc(s.t)}</li>`).join('')}</ol>`;
    if (f > 1) h += '<p class="small">Mengenangaben in den Schritten gelten für die Grundmenge – mit den Zutatenmengen oben arbeiten.</p>';
  }
  if (r.safety?.length) h += `<div class="card flat small"><b>Sichere Zubereitung</b>${r.safety.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`;
  if (!it.leftoverFrom) h += `<button class="btn block big" data-a="cookMode" data-id="${it.id}" style="margin:8px 0">Kochmodus starten</button>`;
  return h + mealActionsHtml(it);
}
function mealActionsHtml(it) {
  const rt = S.ratings[it.recipeId] || {};
  return `<div class="grid2" style="margin-top:8px"><button class="btn" data-a="mealEaten" data-id="${it.id}" data-close="1">${it.status === 'gegessen' ? 'Doch nicht gegessen' : 'Gegessen'}</button>
    <button class="btn secondary" data-a="mealSwap" data-id="${it.id}">Tauschen</button>
    <button class="btn secondary" data-a="mealOther" data-id="${it.id}">Etwas anderes gegessen</button>
    <button class="btn secondary" data-a="mealSkip" data-id="${it.id}">${it.status === 'ausgelassen' ? 'Wieder einplanen' : 'Auslassen'}</button></div>
    ${it.recipeId ? `<h3 style="margin-top:16px">Bewerten</h3>${chipsInput('rate', [['liked', 'Hat geschmeckt'], ['easy', 'War einfach'], ['full', 'Hat satt gemacht'], ['again', 'Möchte ich wieder'], ['tooMuch', 'Zu aufwendig'], ['disliked', 'Nicht mehr vorschlagen']], Object.keys(rt).filter((k) => rt[k] > 0 && k !== 'eaten' && k !== 'skipped'))}<button class="btn ghost" data-a="mealRate" data-id="${it.id}">Bewertung speichern</button>` : ''}`;
}
function placeholderHtml(it) {
  const order = it.placeholder === 'bestellen';
  let h = `<p class="sub">${L.WEEKDAYS[L.weekday(it.date)]}, ${L.fmtDate(it.date)} · ${order ? 'Bestellung' : 'Restaurant / Feier'}</p>`;
  h += `<div class="card"><h3>So gelingt es</h3><ul class="steps small">${F.RESTAURANT_TIPS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  h += `<div class="f"><span class="small">Tipps nach Küche</span>${chipsInput('cuisine', Object.keys(F.ORDER_TIPS))}</div><button class="btn secondary block" data-a="orderTips">Tipps anzeigen</button><div id="orderTipsOut"></div>`;
  if (S.restaurants.length) h += `<h3 style="margin-top:14px">Deine Restaurants</h3><div class="list">${S.restaurants.map(restaurantRow).join('')}</div>`;
  h += `<h3 style="margin-top:14px">Speisekarte prüfen</h3><p class="small">Text der Speisekarte einfügen (z. B. von der Lieferdienst-Seite kopiert). HealthPilot markiert Allergenrisiken und sortiert nach Ausgewogenheit. Grobe Stichwortanalyse – ersetzt nie das Nachfragen.</p>
    <textarea id="menuText" placeholder="Gerichte, je Zeile eines"></textarea><button class="btn secondary block" data-a="menuAnalyze" style="margin-top:6px">Ohne KI prüfen</button><div id="menuOut"></div>
    <button class="btn ghost block" data-a="coachPhoto" data-m="ernaehrung" data-q="Welches Gericht dieser Speisekarte empfiehlst du mir? Achte streng auf Erdnuss, Avocado und Nüsse und sag, wo ich nachfragen muss.">Screenshot der Speisekarte an KI-Coach</button>`;
  return h + mealActionsHtml(it);
}
function restaurantRow(r) {
  return `<div class="item"><div class="grow"><div class="t">${esc(r.name)}</div><div class="small">${esc(r.cuisine || '')}${r.dishes ? ' · Bewährt: ' + esc(r.dishes) : ''}</div></div>${r.url ? `<a class="btn ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Öffnen</a>` : ''}</div>`;
}
function restaurantsHtml() {
  return `<p class="small">Hinterlege Restaurants und Lieferdienst-Seiten, die bei dir am Kaßberg liefern, mit deinen bewährten Gerichten. HealthPilot löst niemals selbst eine Bestellung aus – „Öffnen“ führt zur Bestellseite.</p>
    ${S.restaurants.length ? `<div class="list">${S.restaurants.map((r, i) => `<div class="item"><div class="grow"><div class="t">${esc(r.name)}</div><div class="small">${esc(r.cuisine || '')}${r.dishes ? ' · ' + esc(r.dishes) : ''}</div></div>${r.url ? `<a class="btn ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Öffnen</a>` : ''}<button class="btn ghost" data-a="restaurantDel" data-i="${i}">Löschen</button></div>`).join('')}</div>` : ''}
    <form id="restForm"><label class="f"><span>Name</span><input name="name"></label><label class="f"><span>Küche</span><select name="cuisine">${['', ...Object.keys(F.ORDER_TIPS), 'Sonstiges'].map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label class="f"><span>Link (Lieferando, Wolt, Uber Eats oder Website)</span><input name="url" inputmode="url" placeholder="https://…"></label><label class="f"><span>Bewährte Gerichte / Hinweise</span><input name="dishes" placeholder="z. B. Hähnchen-Teller ohne Sauce, Allergie bekannt"></label>
    <button type="button" class="btn block" data-a="restaurantAdd">Hinzufügen</button></form>`;
}
function pantryHtml() {
  const all = Object.values(F.INGREDIENTS).sort((a, b) => F.SECTIONS.indexOf(a.sec) - F.SECTIONS.indexOf(b.sec) || a.name.localeCompare(b.name, 'de'));
  return `<p class="small">Markierte Produkte hast du zu Hause – sie erscheinen nicht auf der Einkaufsliste. Grundvorrat (★) gilt als vorhanden, bis du ihn abwählst.</p>
    ${F.SECTIONS.map((sec) => { const xs = all.filter((x) => x.sec === sec); return xs.length ? `<h3 style="margin:14px 0 4px">${sec}</h3><div class="chips">${xs.map((x) => { const on = x.staple ? S.pantry[x.k] !== false : !!S.pantry[x.k]; return `<button class="chip ${on ? 'on' : ''}" data-a="pantryToggle" data-k="${x.k}">${x.staple ? '★ ' : ''}${esc(x.name.split(',')[0])}</button>`; }).join('')}</div>` : ''; }).join('')}`;
}
async function setMealSlot(date, slot, patch) {
  const id = `meal-${date}-${slot}`;
  const ex = S.plan.find((p) => p.id === id);
  const it = { id, week: L.mondayOf(date), date, area: 'essen', kind: 'meal', slot, recipeId: null, customId: null, placeholder: null, portions: 1, status: null, leftoverFrom: null, ...(ex ? { replaced: ex.recipeId || ex.customId || ex.placeholder } : {}), ...patch };
  await DB.putPlanItems([it]);
  S.plan = S.plan.filter((p) => p.id !== id).concat(it);
  render();
  return it;
}
async function toggleMealEaten(id) {
  const it = S.plan.find((p) => p.id === id); if (!it) return;
  if (it.status === 'gegessen') {
    const e = S.entries.find((x) => x.type === 'meal' && x.meta?.planId === id);
    if (e) await removeEntry(e.id);
    await updatePlanItem(id, { status: null });
    return;
  }
  if (it.placeholder) { openSheet('Was hast du gegessen?', mealForm()); S.pendingPlanId = id; return; }
  const r = recipeOf(it); const nu = F.mealNutrition(it, S.customRecipes);
  const meta = { slot: F.SLOT_LABEL[it.slot], how: F.STRATEGY_LABEL[r?.strategy] || 'Geplant', veg: !!nu?.veg, protein: !!nu?.prot, whole: !!nu?.whole, kcal: nu?.kcal, p: nu?.p, fib: nu?.fib, recipeId: it.recipeId, customId: it.customId, planId: id, note: r?.name, active: it.leftoverFrom ? 3 : r?.active, cost: r?.cost ? r.cost * (it.portions || 1) / (r.servings || 1) : null };
  await addEntry({ type: 'meal', date: it.date, meta, source: 'geschaetzt' }, { silent: true });
  await updatePlanItem(id, { status: 'gegessen' });
  if (it.recipeId) { const rt = S.ratings[it.recipeId] ||= {}; rt.eaten = (rt.eaten || 0) + 1; await DB.kvSet('ratings', S.ratings); }
  toast(`${r ? r.name : 'Mahlzeit'} als gegessen erfasst`, async () => toggleMealEaten(id));
}

/* ---------- Kochmodus ---------- */
let cook = null;
function cookHtml() {
  const s = cook.steps[cook.i];
  return `<div class="small">Schritt ${cook.i + 1} von ${cook.steps.length}</div><div class="bar" style="margin:6px 0 14px"><i style="width:${((cook.i + 1) / cook.steps.length) * 100}%"></i></div>
    <p class="cook">${esc(s.t)}</p>
    ${s.timer ? `<div id="cookTimer" class="center" style="font-size:44px;font-weight:700;margin:16px 0">${fmtTimer(cook.left ?? s.timer)}</div><button class="btn secondary block" data-a="cookTimer">${cook.running ? 'Timer läuft …' : `Timer ${fmtTimer(s.timer)} starten`}</button>` : ''}
    <div class="grid2" style="margin-top:16px"><button class="btn secondary big" data-a="cookPrev" ${cook.i === 0 ? 'disabled' : ''}>Zurück</button><button class="btn big" data-a="cookNext">${cook.i === cook.steps.length - 1 ? 'Fertig' : 'Weiter'}</button></div>
    <details style="margin-top:16px"><summary class="small">Zutaten anzeigen</summary><ul class="steps small">${cook.ing.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
}
const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.4, 0.8].forEach((t) => { const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.25); }); } catch { /* kein Ton */ } }
async function startCook(it) {
  const r = recipeOf(it);
  cook = { id: it.id, i: 0, steps: recipeSteps(r), ing: ingredientLines(it), running: false, left: null };
  try { cook.lock = await navigator.wakeLock?.request('screen'); } catch { /* nicht verfügbar */ }
  openSheet(`Kochmodus: ${r.name}`, cookHtml());
}
function rerenderCook() { const b = $('#sheetBody'); if (b && cook) b.innerHTML = cookHtml(); }
function stopCookTimer() { clearInterval(cook?.timer); if (cook) { cook.running = false; cook.left = null; } }

/* ---------- Assistenten ohne KI ---------- */
const NUTRI_SITUATIONS = [
  ['keinKochen', 'Keine Lust zu kochen'], ['zeit5', 'Nur 5 Minuten'], ['zeit10', 'Nur 10 Minuten'], ['training', 'Habe trainiert'],
  ['vielGegessen', 'Mittags schon viel gegessen'], ['vorrat', 'Was mache ich aus meinen Vorräten?'], ['supermarkt', 'Bin gerade im Supermarkt'],
  ['bestellen', 'Ich möchte Essen bestellen'], ['restaurant', 'Ich gehe ins Restaurant'], ['ungesund', 'Heute etwas Ungesundes'], ['grillen', 'Am Wochenende grillen'],
];
function nutritionAssistantHtml() {
  return `<p class="small">Funktioniert ohne Internet und ohne KI – Vorschläge aus deiner geprüften Rezeptbibliothek.</p>
    <label class="f"><span>Für welche Mahlzeit?</span><select id="asSlot">${Object.entries(F.SLOT_LABEL).map(([k, l]) => `<option value="${k}" ${k === defaultSlot() ? 'selected' : ''}>${l} (heute)</option>`).join('')}</select></label>
    <div class="chips">${NUTRI_SITUATIONS.map(([k, l]) => `<button class="chip" data-a="assist" data-s="${k}">${l}</button>`).join('')}</div><div id="assistOut"></div>`;
}
function defaultSlot() { const h = new Date().getHours(); return h < 10 ? 'frueh' : h < 14 ? 'mittag' : h < 17 ? 'snack' : 'abend'; }
function suggestionCards(list, slot) {
  if (!list.length) return '<p class="small">Keine passenden Rezepte gefunden.</p>';
  return `<div class="list">${list.map((r) => `<div class="item"><div class="grow"><div class="t">${esc(r.name)}</div><div class="small">${r.active} min aktiv · ca. ${N(r.kcal)} kcal · ${N(r.p)} g Protein · ${F.STRATEGY_LABEL[r.strategy]}${r._match ? ` · ${r._match} % der Zutaten vorhanden` : ''}</div></div><button class="btn secondary" data-a="assistPick" data-r="${r.id}" data-slot="${slot}">Übernehmen</button></div>`).join('')}</div>`;
}
function assistOutput(sit, slot) {
  const base = { profile: S.profile, ratings: S.ratings, slot };
  switch (sit) {
    case 'keinKochen': return `<p class="small">Ohne Kochen oder mit maximal 5 Minuten:</p>${suggestionCards(F.suggest({ ...base, situation: 'keinKochen' }), slot)}`;
    case 'zeit5': return suggestionCards(F.suggest({ ...base, situation: 'zeit', minutes: 5 }), slot);
    case 'zeit10': return suggestionCards(F.suggest({ ...base, situation: 'zeit', minutes: 10 }), slot);
    case 'training': return `<p class="small">Nach dem Training: eine Mahlzeit mit 30–40 g Protein innerhalb der nächsten Stunden, dazu Kohlenhydrate. Nahrungsergänzung ist dafür nicht nötig.</p>${suggestionCards(F.suggest({ ...base, situation: 'training' }), slot)}`;
    case 'vielGegessen': return `<p class="small">Kein Ausgleichsfasten – iss eine leichtere, eiweiß- und gemüsereiche Mahlzeit. Ein üppiges Essen fällt über die Woche kaum ins Gewicht.</p>${suggestionCards(F.suggest({ ...base, situation: 'vielGegessen' }), slot)}`;
    case 'vorrat': return `<label class="f"><span>Was hast du da? (mit Komma getrennt)</span><input id="haveInput" placeholder="z. B. Hähnchen, Reis, Tomaten"></label><button class="btn secondary block" data-a="assistVorrat" data-slot="${slot}">Rezepte finden</button><div id="vorratOut"></div>`;
    case 'supermarkt': {
      const ws = L.mondayOf(today());
      return `<p class="small">Gute schnelle Griffe, wenn du spontan einkaufst:</p><ul class="steps small"><li>Kühlregal: Skyr, Magerquark, Hüttenkäse, gegarte Hähnchenstreifen, gekochte Eier</li><li>TK: Gemüsemischungen ohne Sauce, Brokkoli, Spinat, Beeren, Lachsfilets</li><li>Konserven: Bohnen, Kichererbsen, Linsen, Thunfisch im eigenen Saft, Express-Vollkornreis</li><li>Fertiggerichte: ≥ 20 g Protein und ≤ 2 g Salz pro Packung, Zutatenliste auf Erdnuss/Nüsse/Avocado prüfen</li></ul><button class="btn secondary block" data-a="planViewGo" data-v="einkauf" data-week="${ws}">Meine Einkaufsliste öffnen</button>`;
    }
    case 'bestellen': return `<div class="f"><span class="small">Was möchtest du bestellen?</span>${chipsInput('cuisine', Object.keys(F.ORDER_TIPS))}</div><button class="btn secondary block" data-a="orderTips">Tipps anzeigen</button><div id="orderTipsOut"></div>
      ${S.restaurants.length ? `<h3 style="margin-top:12px">Deine Restaurants</h3><div class="list">${S.restaurants.map(restaurantRow).join('')}</div>` : ''}<button class="btn ghost block" data-a="assistPlaceholder" data-p="bestellen" data-slot="${slot}">Als „Bestellung“ in den Plan</button>`;
    case 'restaurant': return `<ul class="steps small">${F.RESTAURANT_TIPS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><button class="btn ghost block" data-a="assistPlaceholder" data-p="restaurant" data-slot="${slot}">Als „Restaurant“ in den Plan</button>`;
    case 'ungesund': return `<p class="small">Völlig in Ordnung – plane es bewusst ein, statt es zu verbieten: eine normale Portion, dazu Gemüse oder Salat, langsam essen. Die übrigen Mahlzeiten heute ganz normal, ohne Ausgleich. Entscheidend ist der Wochenschnitt.</p>${suggestionCards(F.RECIPES.filter((r) => r.tags.includes('genuss')), slot)}`;
    case 'grillen': return `<ul class="steps small"><li>Hähnchen-, Puten- oder Fischspieße und mageres Fleisch statt vieler Würste; 1–2 Würste sind okay.</li><li>Gemüse direkt mitgrillen: Paprika, Zucchini, Maiskolben, Champignons.</li><li>Beilagen: Kartoffeln, Vollkornbrot, Bohnen- oder Kichererbsensalat statt Mayo-Salaten.</li><li>Marinaden und Grillsaucen auf Erdnuss/Nüsse prüfen; Pesto meiden.</li><li>Fleisch durchgaren (Geflügel ≥ 75 °C innen), rohes Fleisch und Grillgut getrennt halten.</li><li>Alkohol: Menge vorher festlegen, alkoholfreies Bier als Alternative kalt stellen.</li></ul><button class="btn ghost block" data-a="shopAddMany" data-items="Hähnchenbrust für Spieße|Paprika|Zucchini|Maiskolben|Kartoffeln">Grillzutaten auf die Einkaufsliste</button>`;
    default: return '';
  }
}
const FIT_SITUATIONS = [['kurz', 'Nur 15 Minuten'], ['ptAus', 'PT ist ausgefallen'], ['hotel', 'Unterwegs / Hotel'], ['regen', 'Es regnet'], ['muede', 'Müde oder angeschlagen'], ['ruecken', 'Rücken/Knie zwickt']];
function fitSession(k) {
  const lvl = S.fitness.level ?? 0;
  switch (k) {
    case 'kurz': return { title: 'Kraft-Express (15 min)', duration: 15, details: { goal: 'Ganzkörperkraft in kurzer Zeit', intensity: 'zügig, aber saubere Technik', steps: ['2 min Aufwärmen: Marschieren, Armkreisen', `3 Runden ohne lange Pause: Kniebeugen ${[10, 12, 15][lvl]}, Liegestütze erhöht ${[8, 10, 12][lvl]}, Hüftbrücke 15, Unterarmstütz ${['20 s', '30 s', '40 s'][lvl]}`, '60 s Pause zwischen den Runden'], recovery: 'Morgen keine Krafteinheit mit denselben Übungen.', alt: 'Nur 5 Minuten: eine Runde.' } };
    case 'ptAus': return { title: 'Ersatz für das Personal Training', duration: 30, details: { ...L.sessionDetails('strength', Math.min(2, lvl + 1), S.profile), goal: 'Ersatzeinheit Ganzkörperkraft' } };
    case 'hotel': return { title: 'Hotelzimmer-Workout (20 min)', duration: 20, details: { goal: 'Kraft und Kreislauf ohne Geräte', intensity: 'mittel', steps: ['3 min Aufwärmen auf der Stelle', '3 Runden: 12 Kniebeugen, 10 Liegestütze am Bett/Tisch, 8 Ausfallschritte pro Bein, 15 Hüftbrücken, 30 s Unterarmstütz', 'Danach 10 min zügig um den Block oder Treppen statt Aufzug'], recovery: '–', alt: 'Zügiger Spaziergang 30 min durch die Stadt.' } };
    case 'regen': return { title: 'Indoor-Ausdauer (20 min)', duration: 20, details: { ...L.sessionDetails('walk', lvl, S.profile), goal: 'Ausdauer bei schlechtem Wetter', steps: ['Treppenhaus: 5 min locker gehen', '6 × (1 min zügig Treppe hoch, 1 min locker runter/gehen)', 'Alternativ: Ergometer oder Laufband im Fitnessstudio 20 min zügig', '3 min locker auslaufen'] } };
    case 'muede': return { title: 'Lockere Bewegung (20 min)', duration: 20, details: { ...L.sessionDetails('easy', lvl, S.profile), steps: ['20 min ruhiger Spaziergang an der frischen Luft', 'Danach 5 min Mobilität: Katze-Kuh, Hüftbeuger-Dehnung, Brustöffner'], recovery: 'Bei Fieber, Infekt oder Gliederschmerzen: kein Training, Pause bis zur Besserung.' } };
    case 'ruecken': return { title: 'Schonende Bewegung bei Beschwerden (20 min)', duration: 20, details: { goal: 'In Bewegung bleiben, ohne zu reizen', intensity: 'sanft, schmerzfrei', steps: ['15 min lockeres Gehen – Bewegung hilft bei unspezifischen Rückenbeschwerden meist mehr als Schonung', 'Katze-Kuh 8 ×, Hüftbrücke 2 × 10 langsam, Hüftbeuger-Dehnung 30 s pro Seite', 'Nichts machen, was den Schmerz deutlich verstärkt; heute keine schweren Lasten und keine Kniebeugen bei Kniebeschwerden'], recovery: 'Bei Taubheit, Lähmungserscheinungen, Problemen beim Wasserlassen oder Stuhlgang, Fieber oder Schmerzen nach einem Unfall: sofort ärztlich abklären. Halten Beschwerden länger als 1–2 Wochen an: Hausarzt oder Physiotherapie.', alt: 'Dem Personal Coach Bescheid geben, damit er die Einheit anpasst.' } };
    default: return null;
  }
}
function fitnessAssistantHtml() {
  return `<p class="small">Ohne KI: passende Einheit für die Situation, mit einem Tipp in den heutigen Plan.</p><div class="chips">${FIT_SITUATIONS.map(([k, l]) => `<button class="chip" data-a="fitAssist" data-s="${k}">${l}</button>`).join('')}</div><div id="fitOut"></div>`;
}
function offlineCoachHtml(m) {
  if (m === 'ernaehrung') return nutritionAssistantHtml();
  if (m === 'fitness') return fitnessAssistantHtml();
  if (m === 'alkohol') return `<ul class="steps small"><li>Vor dem Abend festlegen: wie viele Getränke, welches Ende (z. B. 23 Uhr).</li><li>Vorher normal essen; nach jedem alkoholischen Getränk ein Glas Wasser.</li><li>Alkoholfreies Bier oder Schorle als „zweites“ Getränk; kleine Gläser wählen.</li><li>Wer fragt: „Ich fahre morgen früh“ oder „Ich trainiere morgen“ reicht als Antwort.</li><li>Jedes Getränk sofort in HealthPilot erfassen – das allein senkt die Menge messbar.</li></ul>`;
  if (m === 'rauchen') return `<button class="btn block" data-a="sos">SOS: Ich habe gerade Verlangen</button><ul class="steps small"><li>Häufigsten Auslöser umbauen (siehe Erfolge → Rauchen): z. B. Kaffee an einem anderen Ort trinken.</li><li>Die erste Zigarette des Tages jede Woche 15 Minuten später.</li><li>Rauchfrei-Telefon 0800 8 31 31 31 (kostenfrei) und rauchfrei-info.de; Nikotinersatz nach Beratung in Apotheke oder Hausarztpraxis.</li></ul>`;
  if (m === 'schlaf') return `<ul class="steps small"><li>Feste Aufstehzeit, auch am Wochenende (± 30 min).</li><li>Alkohol und große Mahlzeiten in den 3 Stunden vor dem Schlafen meiden.</li><li>Intensives Training eher nicht direkt vor dem Zubettgehen.</li><li>Letzte Stunde: Bildschirm dimmen, Raum kühl und dunkel.</li><li>Bei anhaltender Tagesmüdigkeit oder lautem Schnarchen mit Atemaussetzern: ärztlich abklären.</li></ul>`;
  const acts = topActions(scoreFor(today()), 3);
  return `${acts.length ? `<ol class="steps small">${acts.map((a) => `<li><b>${esc(a.title)}</b> – ${esc(a.text)}</li>`).join('')}</ol>` : '<p class="small">Noch zu wenige Daten.</p>'}<button class="btn secondary block" data-a="scoreInfo">Score-Erklärung</button>`;
}

/* ---------- KI-Coach ---------- */
function weekLines(ws, area) {
  return S.plan.filter((p) => p.week === ws && (area ? p.area === area : true)).sort((a, b) => (a.date + (SLOT_ORDER.indexOf(a.slot) + 1 || 0)).localeCompare(b.date + (SLOT_ORDER.indexOf(b.slot) + 1 || 0)))
    .map((p) => `${L.WD_SHORT[L.weekday(p.date)]} ${L.fmtDate(p.date, false)} ${p.area === 'essen' ? F.SLOT_LABEL[p.slot] + ': ' + mealTitle(p) : p.title}${p.done || p.status === 'gegessen' ? ' [erledigt]' : p.skipped || p.status === 'ausgelassen' ? ' [ausgelassen]' : p.status ? ` [${p.status}]` : ''}`);
}
function buildCoachContext(m) {
  const t = today(); const y = L.addDays(t, -1); const p = S.profile; const g = S.goals;
  const st = periodStats(y, 7); const pv = periodStats(L.addDays(y, -7), 7);
  const f = (v, d = 0) => (v === null || v === undefined ? 'keine Daten' : N(v, d));
  const lines = [];
  lines.push(`Person: ${p.sex || 'unbekannt'}, ${p.age ?? '?'} Jahre, ${p.height ?? '?'} cm; Gewicht zuletzt ${f(lastMetric('weight')?.value ?? p.weight, 1)} kg; Bauchumfang ${f(lastMetric('waist')?.value ?? p.waist)} cm. Bürojob Mo–Fr ${p.workStart || '08:15'}–${p.workEnd || '17:00'}, Personal Training 1×/Woche (Beginn 16–19 Uhr, Tag variabel). Lebt allein, kauft bei ${(p.shops || ['Edeka', 'Rewe']).join('/')} ein. Küche zuhause: ${(p.kitchenHome || []).join(', ') || 'unbekannt'}; Büro: ${(p.kitchenOffice || []).join(', ') || 'unbekannt'}.`);
  lines.push(`Allergien: ${p.allergies || 'Erdnüsse, Avocado'} (Notfallset: ${p.emergencyKit === false ? 'nein' : 'ja'}). Abneigung: ${p.dislikes || 'Nüsse, Nussöle'}${p.dislikesExtra ? ', ' + p.dislikesExtra : ''}. Spuren von Erdnüssen: ${p.tracesOk === false ? 'NICHT ok' : 'ok'}.`);
  lines.push(`Ziele: Trinken ${f(g.fluidMl)} ml/Tag, Schritte ${f(g.steps)}/Tag, ${f(g.afDays)} alkoholfreie Tage/Woche, Alkohol max. ${f(g.alcMaxGWeek)} g/Woche, Gewicht: ${g.weightMode || 'offen'}${p.smoker ? `, Zigaretten-Tagesziel heute ${f(cigTargetToday())}` : ''}. Prioritäten: ${(p.priorities || []).join(', ') || 'keine angegeben'}.`);
  if (S.ai.shareHealth) lines.push(`Gesundheit (vom Nutzer freigegeben): Vorerkrankungen: ${p.conditions || 'keine Angabe'}; Medikamente: ${p.meds || 'keine Angabe'}; pulssenkende Medikamente: ${p.betaBlocker || 'keine Angabe'}; Beschwerden/Verletzungen: ${p.complaints || 'keine Angabe'}.`);
  else lines.push('Gesundheitsdetails (Vorerkrankungen, Medikamente, Beschwerden) wurden vom Nutzer NICHT freigegeben – nicht danach spekulieren; bei Bedarf allgemein auf ärztliche Rücksprache verweisen.');
  lines.push(`Letzte 7 Tage (Vorwoche in Klammern): Schritte Ø ${f(st.steps)} (${f(pv.steps)}); Training ${f(st.trainWeek)} min/Woche (${f(pv.trainWeek)}); Schlaf Ø ${f(st.sleepH, 1)} h (${f(pv.sleepH, 1)}); Ruhepuls Ø ${f(st.rhr)} (${f(pv.rhr)}); HRV Ø ${f(st.hrv)} ms (${f(pv.hrv)}); Trinken Ø ${f(st.fluid)} ml (${f(pv.fluid)}); Alkohol ${f(st.alcWeek)} g/Woche (${f(pv.alcWeek)}), alkoholfreie Tage ${st.afShare === null ? 'keine Daten' : Math.round(st.afShare * 100) + ' %'}; ${p.smoker ? `Zigaretten Ø ${f(st.cigs, 1)}/Tag (${f(pv.cigs, 1)}); ` : ''}Energie ${f(st.energy, 1)}/5, Stress ${f(st.stress, 1)}/5, Stimmung ${f(st.mood, 1)}/5. Vollständig dokumentierte Tage: ${st.trackedDays}/7.`);
  const sc = scoreFor(t);
  lines.push(`Lifestyle-Score: ${sc.total ?? 'keine Daten'} (Vollständigkeit ${sc.completeness} %): ${sc.categories.map((c) => `${c.label} ${c.score ?? '–'}`).join(', ')}.`);
  const d = day(t); const ready = readiness();
  lines.push(`Heute (${L.WEEKDAYS[L.weekday(t)]}, ${L.fmtDate(t)}, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr): getrunken ${N(d.fluidMl)} ml, Alkohol ${N(d.alcoholG)} g${p.smoker ? `, Zigaretten ${d.cigs}` : ''}; gegessen ca. ${N(dayNutrition(t).kcal)} kcal / ${N(dayNutrition(t).p)} g Protein (Schätzung).${ready.length ? ` Tagesform-Hinweise: ${ready.join(', ')}.` : ''}`);
  const today_ = S.plan.filter((x) => x.date === t);
  if (today_.length) lines.push(`Plan heute: ${weekLines(L.mondayOf(t)).filter((l) => l.includes(L.fmtDate(t, false))).join(' | ')}`);
  const ws = L.mondayOf(t);
  if (m === 'ernaehrung') {
    const tgt = F.nutritionTargets(p, g);
    if (tgt) lines.push(`Ernährungsorientierung (Schätzung): ${tgt.kcal} kcal/Tag, ${tgt.protein} g Protein, ≥ ${tgt.fiber} g Ballaststoffe. Kochbereitschaft: ${p.cookWilling || 'unbekannt'}.`);
    lines.push(`Speiseplan dieser Woche:\n${weekLines(ws, 'essen').join('\n') || 'keiner'}`);
    const pantry = Object.values(F.INGREDIENTS).filter((x) => (x.staple ? S.pantry[x.k] !== false : S.pantry[x.k])).map((x) => x.name.split(',')[0]);
    lines.push(`Vorräte laut App: ${pantry.join(', ') || 'keine Angabe'}.`);
    const liked = Object.entries(S.ratings).filter(([, r]) => r.liked || r.again).map(([id]) => F.RECIPE[id]?.name).filter(Boolean);
    const disliked = Object.entries(S.ratings).filter(([, r]) => r.disliked || r.tooMuch).map(([id]) => F.RECIPE[id]?.name).filter(Boolean);
    lines.push(`Mag: ${liked.join(', ') || 'noch keine Bewertungen'}. Mag nicht / zu aufwendig: ${disliked.join(', ') || '–'}.`);
    if (S.restaurants.length) lines.push(`Gespeicherte Restaurants: ${S.restaurants.map((r) => `${r.name} (${r.cuisine || '?'}${r.dishes ? ', bewährt: ' + r.dishes : ''})`).join('; ')}.`);
    lines.push(`Rezeptbibliothek (allergengeprüft; rezept_id: Name | Mahlzeiten | aktiv min | kcal | Protein g):\n${F.RECIPES.map((r) => `${r.id}: ${r.name} | ${r.slots.join('/')} | ${r.active} | ${r.kcal} | ${r.p}`).join('\n')}`);
  }
  if (m === 'fitness' || m === 'heute') {
    lines.push(`Bewegungsplan dieser Woche (Stufe ${(S.fitness.level ?? 0) + 1} von 3):\n${weekLines(ws, 'fitness').join('\n') || 'keiner'}`);
    lines.push(`VO₂max zuletzt ${f(lastMetric('vo2')?.value, 1)}; Ruhepuls Ausgangswert ${f(S.baseline?.rhr)}. Sporterfahrung: ${p.sportExp || 'unbekannt'}; Möglichkeiten: ${(p.trainingOptions || []).join(', ') || 'unbekannt'}.`);
  }
  if (m === 'alkohol') {
    const wk = []; for (let i = 5; i >= 0; i--) { const e = L.addDays(y, -7 * i); const s2 = periodStats(e, 7); wk.push(`Woche bis ${L.fmtDate(e, false)}: ${f(s2.alcWeek)} g, alkoholfrei ${s2.afShare === null ? '?' : Math.round(s2.afShare * 100) + ' %'}`); }
    const a = L.auditC(p.audit1, p.audit2, p.audit3);
    lines.push(`Alkohol-Verlauf:\n${wk.join('\n')}\nAusgangswert (Schätzung): ${f(S.baseline?.alcoholGWeek)} g/Woche. AUDIT-C: ${a ? a.score + '/12' : 'nicht ausgefüllt'}${p.morningDrink ? '; morgendliche Entzugszeichen angegeben' : ''}.`);
  }
  if (m === 'rauchen') {
    const ds = L.range(L.addDays(y, -27), 28).map(day); const trig = {}; const hours = Array(24).fill(0);
    ds.forEach((dd) => dd.cigHours.forEach((c) => { hours[c.hour] += c.n; if (c.trigger) trig[c.trigger] = (trig[c.trigger] || 0) + c.n; }));
    const urges = S.entries.filter((e) => e.type === 'urge' && e.date >= L.addDays(y, -27)).length;
    const peak = hours.map((v, i) => [i, v]).sort((a2, b2) => b2[1] - a2[1]).slice(0, 3).filter((x) => x[1]).map((x) => `${x[0]} Uhr`);
    const h = L.hsi(p.minutesToFirst, p.cigsPerDay);
    lines.push(`Rauchen: Ausgangswert ${f(S.cigPlan?.base ?? p.cigsPerDay)}/Tag, Reduktion ${f(S.cigPlan?.stepPerWeek)}/Woche, Rauchstopp-Datum ${S.cigPlan?.quitDate ? L.fmtDate(S.cigPlan.quitDate) : 'keins'}. Letzte 4 Wochen: häufigste Auslöser ${Object.entries(trig).sort((a2, b2) => b2[1] - a2[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(', ') || 'nicht erfasst'}; Spitzenzeiten ${peak.join(', ') || '–'}; widerstandenes Verlangen ${urges}×. Bereitschaft: ${p.readiness || 'unbekannt'}. Abhängigkeitsindex (HSI): ${h ? h.score + '/6' : 'unbekannt'}.`);
  }
  if (m === 'schlaf') {
    const ds = L.range(L.addDays(t, -13), 14);
    lines.push(`Schlaf letzte 14 Nächte (Datum = Aufwachtag: Stunden | Qualität | Alkohol am Vorabend g | Training Vortag min):\n${ds.map((dd) => `${L.fmtDate(dd, false)}: ${f(day(dd).metrics.sleepH, 1)} | ${day(dd).checkin?.sleepQ ?? '–'} | ${N(day(L.addDays(dd, -1)).alcoholG)} | ${f(L.trainingMinutes(day(L.addDays(dd, -1))))}`).join('\n')}\nTypische Zeiten: ins Bett ${p.bedTime || '?'}, auf ${p.wakeTime || '?'}.`);
  }
  if (m === 'auswertung') {
    const s28 = periodStats(y, 28); const b = S.baseline || {};
    lines.push(`Letzte 4 Wochen: Schritte ${f(s28.steps)}, Training ${f(s28.trainWeek)} min/Woche, Schlaf ${f(s28.sleepH, 1)} h, Ruhepuls ${f(s28.rhr)}, Gewicht ${f(s28.weight, 1)} kg, Alkohol ${f(s28.alcWeek)} g/Woche, ${p.smoker ? `Zigaretten ${f(s28.cigs, 1)}/Tag, ` : ''}Trinken ${f(s28.fluid)} ml.`);
    lines.push(`Ausgangswerte (${b.date ? L.fmtDate(b.date.slice(0, 10)) : '?'}): Gewicht ${f(b.weight, 1)}, Ruhepuls ${f(b.rhr)}, Schritte ${f(b.steps)}, Schlaf ${f(b.sleepH, 1)}, Zigaretten ${f(b.cigsPerDay)}, Alkohol ${f(b.alcoholGWeek)} g/Woche (geschätzt).`);
    const past = S.plan.filter((x) => x.area === 'fitness' && x.date < t && x.date >= L.addDays(t, -28));
    const meals = S.plan.filter((x) => x.area === 'essen' && x.date < t && x.date >= L.addDays(t, -28));
    lines.push(`Planumsetzung 4 Wochen: Bewegung ${past.filter((x) => x.done).length}/${past.length} Einheiten; Mahlzeiten wie geplant ${meals.filter((x) => x.status === 'gegessen').length}/${meals.length}.`);
  }
  return lines.join('\n');
}
function coachHistory(m) { return (S.coach.history[m] ||= []); }
function coachHtml(m) {
  const mod = AI.MODULES[m];
  const chips = `<div class="seg" style="margin-bottom:10px">${Object.entries(AI.MODULES).map(([k, v]) => `<button class="${k === m ? 'on' : ''}" data-a="coachModule" data-m="${k}">${{ heute: 'Tag', ernaehrung: 'Ernährung', fitness: 'Fitness', alkohol: 'Alkohol', rauchen: 'Rauchen', schlaf: 'Schlaf', auswertung: 'Auswertung' }[k]}</button>`).join('')}</div>`;
  const hasKey = !!S.ai.apiKey;
  let h = chips;
  if (!hasKey) {
    return h + `<div class="card flat small">${esc(mod.intro)} Der KI-Coach ist noch nicht eingerichtet – Profil → KI-Coach. Bis dahin hilft dir der Assistent ohne KI:</div>${offlineCoachHtml(m)}<button class="btn ghost block" data-a="aiSetup" style="margin-top:12px">KI-Coach einrichten</button>`;
  }
  const hist = coachHistory(m).slice(-12);
  h += `<p class="small">${esc(mod.intro)} Antworten können Fehler enthalten und ersetzen keine ärztliche Beratung.</p>`;
  h += hist.map((x, idx) => x.role === 'user'
    ? `<div class="card flat" style="margin-left:40px"><div class="small">Du</div>${esc(x.text)}${x.image ? ' <span class="badge">Foto</span>' : ''}</div>`
    : `<div class="card" style="margin-right:20px"><div class="small">Coach</div><div>${fmtAnswer(x.text)}</div>${(x.actions || []).map((a, ai) => actionHtml(a, m, coachHistory(m).length - hist.length + idx, ai)).join('')}${x.cost ? `<div class="small">ca. ${N(x.cost * 100, 1)} Cent</div>` : ''}</div>`).join('');
  h += `<div class="chips">${mod.quick.map((q) => `<button class="chip" data-a="coachQuick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <textarea id="coachInput" placeholder="Deine Frage …" style="min-height:70px">${esc(S.coach.draft || '')}</textarea>
    <div id="coachImgPrev">${S.coach.image ? `<img src="${S.coach.image.preview}" style="max-width:120px;border-radius:8px;margin-top:6px"> <button class="btn ghost" data-a="coachImgRemove">Foto entfernen</button>` : ''}</div>
    <div class="grid2" style="margin-top:8px"><label class="btn secondary">Foto<input type="file" accept="image/*" data-change="coachImage" hidden></label><button class="btn" data-a="coachSend">Senden</button></div>
    <details style="margin-top:12px"><summary class="small">Ohne KI: Assistent für diesen Bereich</summary>${offlineCoachHtml(m)}</details>
    <p class="small">Diesen Monat: ca. ${N(monthUsage().usd, 2)} $ von ${N(S.ai.monthlyBudgetUsd, 0)} $ Budget · <button class="btn ghost" data-a="coachClear" style="min-height:30px;padding:0">Verlauf löschen</button></p>`;
  return h;
}
function fmtAnswer(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^(Fakt|Schluss|Vermutung):/gm, '<span class="tag">$1</span>').replace(/^[-•] /gm, '• ').replace(/\n/g, '<br>');
}
function actionHtml(a, m, hIdx, aIdx) {
  const chk = AI.checkAction(JSON.parse(JSON.stringify(a)), { recipeIds: F.RECIPES.map((r) => r.id), today: today() });
  let label = '';
  if (a.typ === 'rezept') label = `${F.RECIPE[a.rezept_id]?.name || a.rezept_id} → ${F.SLOT_LABEL[a.slot] || ''} ${a.datum ? L.fmtDate(a.datum, false) : ''}`;
  if (a.typ === 'mahlzeit') label = `${a.titel} → ${F.SLOT_LABEL[a.slot] || 'Abend'} ${a.datum ? L.fmtDate(a.datum, false) : ''} (ca. ${N(a.kcal)} kcal, ${N(a.protein_g)} g Protein)`;
  if (a.typ === 'training') label = `Training: ${a.titel} (${a.dauer_min} min) ${a.datum ? L.fmtDate(a.datum, false) : ''}`;
  if (a.typ === 'einkauf') label = `Einkaufsliste: ${(a.artikel || []).join(', ')}`;
  return `<div class="card flat" style="margin:8px 0 0"><div class="small"><b>Vorschlag:</b> ${esc(label)}</div>${chk.warn.map((w) => `<div class="small" style="color:var(--warn)">⚠ ${esc(w)}</div>`).join('')}
    ${a.applied ? '<div class="small">✓ übernommen</div>' : chk.ok ? `<button class="btn secondary" data-a="aiAction" data-m="${m}" data-h="${hIdx}" data-i="${aIdx}" style="margin-top:6px">Übernehmen</button>` : ''}</div>`;
}
function monthUsage() { const k = today().slice(0, 7); return S.aiUsage[k] || { usd: 0, inTok: 0, outTok: 0, calls: 0 }; }
async function addUsage(usage) {
  const k = today().slice(0, 7); const u = monthUsage();
  const cost = AI.costUsd(usage, S.ai);
  S.aiUsage[k] = { usd: u.usd + cost, inTok: u.inTok + (usage?.input_tokens || 0), outTok: u.outTok + (usage?.output_tokens || 0), calls: u.calls + 1 };
  await DB.kvSet('aiUsage', S.aiUsage);
  return cost;
}
function openCoach(m, { q = null, photo = false } = {}) {
  S.coach.module = m; if (q !== null) S.coach.draft = q;
  openSheet(AI.MODULES[m].label, coachHtml(m), (b) => { const ta = b.querySelector('#coachInput'); if (ta) ta.addEventListener('input', () => { S.coach.draft = ta.value; }); if (photo && S.ai.apiKey) b.querySelector('input[data-change=coachImage]')?.click(); });
}
function coachRerender() { if ($('#sheetBody')) { const m = S.coach.module; $('#sheetBody').innerHTML = coachHtml(m); const ta = $('#coachInput'); if (ta) ta.addEventListener('input', () => { S.coach.draft = ta.value; }); } }
async function coachPrepare() {
  const m = S.coach.module; const q = ($('#coachInput')?.value || '').trim();
  if (!q && !S.coach.image) { toast('Bitte eine Frage eingeben'); return; }
  S.coach.draft = q;
  const ctx = buildCoachContext(m);
  S.coach.pending = { m, q: q || 'Bitte bewerte das Foto.', ctx, image: S.coach.image };
  if (monthUsage().usd >= (L.parseNum(S.ai.monthlyBudgetUsd) || 10) && !confirm('Das Monatsbudget für den KI-Coach ist erreicht. Trotzdem senden?')) return;
  if (S.ai.preview) {
    $('#sheetBody').innerHTML = `<div class="card flag"><b>Das wird an Anthropic gesendet</b><p class="small">Verschlüsselt direkt von deinem iPhone an api.anthropic.com. Kein Name. Löschung bei Anthropic laut deren Richtlinien in der Regel innerhalb von 30 Tagen; keine Nutzung zum Training.</p></div>
      <div class="card"><div class="small"><b>Deine Frage:</b> ${esc(S.coach.pending.q)}</div>${S.coach.image ? `<img src="${S.coach.image.preview}" style="max-width:140px;border-radius:8px;margin-top:6px">` : ''}${coachHistory(m).length ? `<p class="small">Dazu die letzten ${Math.min(6, coachHistory(m).length)} Nachrichten dieses Gesprächs (nur Text).</p>` : ''}</div>
      <details open><summary class="small"><b>Kontext aus der App</b> (${N(ctx.length)} Zeichen)</summary><pre class="code">${esc(ctx)}</pre></details>
      <p class="small">Gesundheitsdetails: ${S.ai.shareHealth ? 'freigegeben' : 'nicht freigegeben'} (Profil → KI-Coach).</p>
      <div class="grid2"><button class="btn secondary" data-a="coachBack">Abbrechen</button><button class="btn" data-a="coachConfirmSend">Jetzt senden</button></div>`;
    $('.sheet').scrollTop = 0;
  } else await coachSend();
}
async function coachSend() {
  const P = S.coach.pending; if (!P) return;
  const hist = coachHistory(P.m);
  const prior = hist.slice(-6).map((x) => ({ role: x.role, content: x.text }));
  while (prior.length && prior[0].role !== 'user') prior.shift();
  const content = [];
  if (P.image) content.push({ type: 'image', source: { type: 'base64', media_type: P.image.media_type, data: P.image.base64 } });
  content.push({ type: 'text', text: `KONTEXT AUS DER APP (Stand ${L.fmtDate(today())}):\n${P.ctx}\n\nFRAGE:\n${P.q}` });
  $('#sheetBody').innerHTML = '<div class="center" style="padding:40px 0"><p>Der Coach denkt nach …</p></div>';
  try {
    const res = await AI.callApi({ apiKey: S.ai.apiKey, model: S.ai.model, system: AI.systemPrompt(P.m, `${L.WEEKDAYS[L.weekday(today())]}, ${L.fmtDate(today())}`), messages: [...prior, { role: 'user', content }] });
    const cost = await addUsage(res.usage);
    const parsed = AI.parseActions(res.text);
    hist.push({ role: 'user', text: P.q, image: !!P.image, ts: nowIso() });
    hist.push({ role: 'assistant', text: parsed.clean + (parsed.error ? `\n\n(${parsed.error})` : '') + (res.stop === 'max_tokens' ? '\n\n(Antwort gekürzt)' : ''), actions: parsed.actions, cost, ts: nowIso() });
    S.coach.history[P.m] = hist.slice(-30);
    await DB.kvSet('aiHistory', S.coach.history);
    S.coach.draft = ''; S.coach.image = null; S.coach.pending = null;
  } catch (e) {
    toast(e.message);
  }
  coachRerender();
}
async function applyAiAction(m, hIdx, aIdx) {
  const msg = coachHistory(m)[hIdx]; const a = msg?.actions?.[aIdx]; if (!a || a.applied) return;
  const chk = AI.checkAction(a, { recipeIds: F.RECIPES.map((r) => r.id), today: today() });
  if (!chk.ok) { toast(chk.warn[0]); return; }
  const ws = L.mondayOf(a.datum || today());
  if (a.typ === 'rezept') await setMealSlot(a.datum, a.slot, { recipeId: a.rezept_id });
  if (a.typ === 'mahlzeit') {
    const id = `ki-${DB.uid()}`;
    S.customRecipes[id] = { id, source: 'ki', name: a.titel, strategy: a.strategie || 'kochen', servings: 1, active: Number(a.aktiv_min) || 10, total: Number(a.gesamt_min || a.aktiv_min) || 10, kcal: Number(a.kcal) || 0, p: Number(a.protein_g) || 0, fib: Number(a.ballaststoffe_g) || 0, veg: !!a.gemuese, prot: (Number(a.protein_g) || 0) >= 20, whole: !!a.vollkorn, ingText: (a.zutaten || []).slice(0, 20), stepsText: (a.schritte || []).slice(0, 15), allergenNote: `KI-Vorschlag – Allergenfreiheit nicht verifiziert. ${a.allergen_hinweis || ''}`.trim(), slots: [a.slot] };
    await DB.kvSet('customRecipes', S.customRecipes);
    await setMealSlot(a.datum, a.slot, { customId: id });
    const st = await getShopState(ws);
    for (const z of a.zutaten || []) if (!F.allergenHits(z.name).length) st.extras.push({ name: `${z.name}${z.menge ? ' (' + z.menge + ')' : ''} – für ${a.titel}`, sec: 'Sonstiges' });
    await DB.kvSet(`shopx-${ws}`, st.extras);
  }
  if (a.typ === 'training') {
    const it = { id: `fit-ki-${DB.uid()}`, week: ws, date: a.datum, area: 'fitness', kind: 'custom', title: a.titel, duration: Number(a.dauer_min) || 20, done: false, skipped: false, details: { goal: 'Vorschlag des KI-Coaches', intensity: a.intensitaet || '–', steps: (a.schritte || []).slice(0, 15), recovery: '–', alt: '–' } };
    await DB.putPlanItems([it]); S.plan.push(it);
  }
  if (a.typ === 'einkauf') {
    const st = await getShopState(L.mondayOf(today()));
    (a.artikel || []).forEach((x) => st.extras.push({ name: x, sec: 'Sonstiges' }));
    await DB.kvSet(`shopx-${L.mondayOf(today())}`, st.extras);
  }
  a.applied = true; await DB.kvSet('aiHistory', S.coach.history);
  render(); coachRerender(); toast('Übernommen – Plan und Einkaufsliste sind aktualisiert');
}
function aiSettingsHtml() {
  const a = S.ai; const u = monthUsage();
  return `<h2>KI-Coach</h2><div class="card"><p class="small">Optional. Die Anfragen gehen direkt und verschlüsselt von diesem iPhone an Anthropic (api.anthropic.com). Benötigt ein eigenes API-Konto auf platform.claude.com mit Guthaben – dein Claude-Abo gilt dafür nicht. Ohne Schlüssel funktionieren alle Assistenten weiter, nur ohne freie Fragen und Fotoanalyse.</p>
    <form id="aiForm"><label class="f"><span>API-Schlüssel ${a.apiKey ? '(hinterlegt: …' + esc(a.apiKey.slice(-4)) + ')' : ''}</span><input type="password" name="apiKey" autocomplete="off" placeholder="${a.apiKey ? 'unverändert lassen' : 'sk-ant-…'}"></label>
    <label class="f"><span>Modell</span><select name="model">${AI.MODELS.map(([v, l]) => `<option value="${v}" ${a.model === v ? 'selected' : ''}>${l}</option>`).join('')}${AI.MODELS.some(([v]) => v === a.model) ? '' : `<option selected>${esc(a.model)}</option>`}</select></label>
    <label class="f"><span>Eigene Modell-ID (optional, falls sich die Namen ändern)</span><input name="modelCustom" placeholder="z. B. claude-sonnet-5-5"></label>
    <label class="check"><input type="checkbox" name="shareHealth" ${a.shareHealth ? 'checked' : ''}> Vorerkrankungen, Medikamente und Beschwerden mitsenden</label>
    <label class="check"><input type="checkbox" name="preview" ${a.preview ? 'checked' : ''}> Vor jedem Senden anzeigen, was übertragen wird</label>
    <label class="f"><span>Monatsbudget (US-$) – darüber fragt die App nach</span><input name="budget" inputmode="decimal" value="${a.monthlyBudgetUsd}"></label>
    <div class="grid2"><label class="f"><span>Eingabe $/Mio. Tok.</span><input name="pin" inputmode="decimal" value="${a.priceIn}"></label><label class="f"><span>Ausgabe $/Mio. Tok.</span><input name="pout" inputmode="decimal" value="${a.priceOut}"></label></div>
    <p class="small">Preise bitte mit der aktuellen Preisliste auf platform.claude.com abgleichen – sie dienen nur der Kostenschätzung in der App. Das harte Limit legst du im Anthropic-Konto fest (Prepaid-Guthaben).</p>
    <button type="button" class="btn block" data-a="aiSave">Speichern</button></form>
    <div class="grid2" style="margin-top:8px"><button class="btn secondary" data-a="aiTest" ${a.apiKey ? '' : 'disabled'}>Verbindung testen</button><button class="btn danger" data-a="aiKeyDelete" ${a.apiKey ? '' : 'disabled'}>Schlüssel löschen</button></div>
    <p class="small">Diesen Monat: ${u.calls} Anfragen, ca. ${N(u.usd, 2)} $ (geschätzt).</p></div>`;
}

/* ---------- Ernährungsreport ---------- */
function nutritionReport(end, n) {
  const start = L.addDays(end, -(n - 1));
  const meals = S.entries.filter((e) => e.type === 'meal' && e.date >= start && e.date <= end);
  if (!meals.length && !S.plan.some((p) => p.area === 'essen' && p.date >= start && p.date <= end)) return '';
  const byDay = {}; meals.forEach((e) => (byDay[e.date] ||= []).push(e));
  const fullDays = Object.values(byDay).filter((ms) => ms.length >= 3 && ms.every((x) => x.meta?.kcal));
  const avg = (k) => (fullDays.length ? L.mean(fullDays.map((ms) => ms.reduce((a, x) => a + (L.parseNum(x.meta[k]) || 0), 0))) : null);
  const kcal = avg('kcal'), prot = avg('p'), fib = avg('fib');
  const share = (k) => (meals.length ? meals.filter((x) => x.meta?.[k]).length / meals.length : null);
  const planned = S.plan.filter((p) => p.area === 'essen' && p.date >= start && p.date <= end && !p.placeholder);
  const eaten = planned.filter((p) => p.status === 'gegessen');
  const how = {}; meals.forEach((x) => { const k = x.meta?.how || 'ohne Angabe'; how[k] = (how[k] || 0) + 1; });
  const acts = meals.map((x) => L.parseNum(x.meta?.active)).filter((v) => v !== null);
  const cost = meals.reduce((a, x) => a + (L.parseNum(x.meta?.cost) || 0), 0);
  const allRecipes = new Set(meals.map((x) => x.meta?.recipeId || x.meta?.note).filter(Boolean));
  const tgt = F.nutritionTargets(S.profile, S.goals);
  const tips = [];
  if (share('veg') !== null && share('veg') < 0.6) tips.push('Gemüse: Nur ' + Math.round(share('veg') * 100) + ' % der Mahlzeiten enthielten Gemüse/Obst. Eine Handvoll TK-Gemüse oder Rohkost zu jeder Hauptmahlzeit ist der einfachste Hebel.');
  if (prot !== null && tgt && prot < tgt.protein * 0.85) tips.push(`Protein: Ø ${N(prot)} g statt ~${tgt.protein} g. Skyr, Quark, Hüttenkäse oder Hähnchenstreifen als Snack schließen die Lücke ohne Kochen.`);
  if (fib !== null && fib < 25) tips.push(`Ballaststoffe: Ø ${N(fib)} g. Vollkornbrot, Haferflocken und Hülsenfrüchte (Dose) bringen am meisten.`);
  if (planned.length >= 7 && eaten.length / planned.length < 0.5) tips.push('Plan-Umsetzung unter 50 %: Der Plan passt nicht zum Alltag. Bewerte Gerichte als „zu aufwendig“ und setze im Wochen-Check-in weniger Kochtage – der Plan wird dann einfacher.');
  if ((how.Bestellen || 0) + (how.Bestellt || 0) > n / 7 * 3) tips.push('Häufige Bestellungen: Lege 2–3 bewährte Gerichte bei deinen Lieblingsrestaurants fest, dann ist auch Bestellen planbar.');
  return `<div class="card"><h3>Ernährungsreport</h3>
    <p class="small">Datenlage: ${meals.length} erfasste Mahlzeiten, ${fullDays.length} Tage vollständig mit Nährwerten. Alle Nährwerte sind Schätzungen aus Rezepten bzw. KI-Angaben.</p>
    <div class="grid2">${[['Energie Ø/Tag', kcal, 'kcal', 0], ['Protein Ø/Tag', prot, 'g', 0], ['Ballaststoffe Ø/Tag', fib, 'g', 0], ['Mit Gemüse/Obst', share('veg') === null ? null : share('veg') * 100, '%', 0], ['Vollkorn/Hülsenfr.', share('whole') === null ? null : share('whole') * 100, '%', 0], ['Plan umgesetzt', planned.length ? (eaten.length / planned.length) * 100 : null, '%', 0], ['Ø aktive Zubereitung', acts.length ? L.mean(acts) : null, 'min', 0], ['Verschiedene Gerichte', allRecipes.size, '', 0], ['Kosten geplanter Gerichte', cost || null, '€', 2]].filter(([, v]) => v !== null && v !== undefined).map(([l, v, u, d]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${N(v, d)}<span class="small"> ${u}</span></div></div>`).join('')}</div>
    <p class="small">Zubereitung: ${Object.entries(how).map(([k, v]) => `${esc(k)} ${v}×`).join(' · ') || '–'}</p>
    ${tips.length ? `<p><span class="tag">Empfehlung</span>Maximal drei Verbesserungen für die nächste Woche:</p><ol class="steps small">${tips.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>`;
}

/* ---------- Produktprüfung (Open Food Facts) ---------- */
async function productCheck(ean) {
  if (!/^\d{8}$|^\d{12,14}$/.test(ean)) { toast('Bitte eine gültige Barcode-Nummer (8 oder 13 Ziffern) eingeben'); return; }
  if (!S.settings.offConsent) {
    if (!confirm('Für die Produktprüfung wird nur die Barcode-Nummer an Open Food Facts (gemeinnützige Lebensmitteldatenbank) gesendet – keine Gesundheitsdaten. Einverstanden?')) return;
    await saveKv('settings', { ...S.settings, offConsent: true });
  }
  openSheet('Produkt prüfen', '<p class="center">Suche …</p>');
  let p;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,brands,nutriments,allergens_tags,traces_tags,ingredients_text_de,ingredients_text,nutriscore_grade,quantity`);
    const d = await r.json(); if (d.status !== 1 || !d.product) throw new Error('nicht gefunden');
    p = d.product;
  } catch (e) {
    $('#sheetBody').innerHTML = `<p>${e.message === 'nicht gefunden' ? 'Produkt nicht in der Datenbank gefunden.' : 'Keine Verbindung zu Open Food Facts.'}</p><button class="btn secondary block" data-a="coachPhoto" data-m="ernaehrung" data-q="Ist dieses Produkt für meine Ziele geeignet? Bitte Allergene prüfen.">Stattdessen Foto an KI-Coach</button>`; return;
  }
  const ev = F.evaluateProduct(p, S.profile);
  const col = { stop: 'var(--bad)', warn: 'var(--warn)', info: 'var(--muted)' };
  $('#sheetBody').innerHTML = `<h3>${esc(ev.name)}</h3><p class="small">${esc(ev.brand)}${p.quantity ? ' · ' + esc(p.quantity) : ''} · Quelle: Open Food Facts (nicht verifiziert)</p>
    ${ev.issues.map((i) => `<p style="color:${col[i.level]}">${i.level === 'stop' ? '⛔' : i.level === 'warn' ? '⚠' : 'ℹ'} ${esc(i.text)}</p>`).join('')}
    ${ev.good.map((g) => `<p style="color:var(--good)">✓ ${esc(g)}</p>`).join('')}
    <div class="grid3">${[['kcal', ev.kcal, 0], ['Protein g', ev.prot, 1], ['Zucker g', ev.sugar, 1], ['Salz g', ev.salt, 2], ['ges. Fett g', ev.sat, 1], ['Ballast. g', ev.fib, 1]].map(([l, v, d]) => `<div class="kpi"><div class="v">${v === null ? '–' : N(v, d)}</div><div class="l">${l} /100 g</div></div>`).join('')}</div>
    <div class="card flag hinweis small">Die Datenbank wird von Freiwilligen gepflegt und kann veraltet sein. Bei deiner Erdnuss- und Avocadoallergie ist immer das Etikett auf der Packung maßgeblich.</div>`;
}

/* ======================= Aktionen ======================= */
const ACT = {
  tab: (d) => { S.tab = d.tab; closeSheet(); render(); window.scrollTo(0, 0); },
  sheetBg: (d, el, e) => { if (e.target === el) closeSheet(); },
  closeSheet: () => closeSheet(),
  scalePick: (d, el) => { const box = el.closest('.scale'); box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); box.querySelector('input').value = d.v; },
  chipToggle: (d, el) => el.classList.toggle('on'),
  // Onboarding
  obStart: async () => { const pf = { ...PREFILL, ...S.profile }; pf.officeDays = (pf.officeDays || []).map(Number); await saveKv('profile', pf); await saveKv('onboarding', { step: 0 }); render(); },
  obNext: async () => {
    if (!(await obSaveCurrent())) return;
    const step = S.onboarding.step;
    if (step >= SECTIONS.length - 1) { await finishOnboarding(); return; }
    await saveKv('onboarding', { step: step + 1 }); render(); window.scrollTo(0, 0);
  },
  obBack: async () => { await saveKv('onboarding', { step: Math.max(-1, S.onboarding.step - 1) }); render(); window.scrollTo(0, 0); },
  obSkip: async () => {
    const step = S.onboarding.step;
    if (step >= SECTIONS.length - 1) { await finishOnboarding(); return; }
    await saveKv('onboarding', { step: step + 1 }); render(); window.scrollTo(0, 0);
  },
  editSection: (d) => {
    const sec = SECTIONS.find((s) => s.id === d.id);
    openSheet(sec.title, `<p class="sub">${esc(sec.intro)}</p>${sectionForm(sec, { ...PREFILL, ...S.profile })}<button class="btn block" data-a="sectionSave" data-id="${sec.id}">Speichern</button>`);
  },
  sectionSave: async (d) => {
    const sec = SECTIONS.find((s) => s.id === d.id);
    const { out, errs } = readSection(sec, $('#secForm'));
    if (errs.length) { $('#formErr').innerHTML = errs.map(esc).join('<br>'); return; }
    const merged = { ...S.profile, ...out }; merged.officeDays = (merged.officeDays || []).map(Number);
    await saveKv('profile', merged);
    if (sec.id === 'rauchen' && merged.smoker && !S.cigPlan) await saveKv('cigPlan', { start: today(), base: merged.cigsPerDay ?? null, stepPerWeek: 1, floor: 0, quitDate: null });
    closeSheet(); render(); toast('Profil gespeichert');
  },
  // Heute
  scoreInfo: () => openSheet('Lifestyle-Score', scoreInfoHtml()),
  checkin: () => { const h = new Date().getHours(); const date = h < 4 ? L.addDays(today(), -1) : today(); openSheet('Abend-Check-in', checkinForm(date)); },
  checkinSave: async (d) => {
    const f = $('#ciForm'); const v = (k) => (f.elements[k].value ? Number(f.elements[k].value) : null);
    const meta = { energy: v('energy'), mood: v('mood'), stress: v('stress'), sleepQ: v('sleepQ'), food: v('food'), complete: f.elements.complete.checked, note: f.elements.note.value.trim() || null };
    const old = S.entries.find((e) => e.type === 'checkin' && e.date === d.date);
    const e = { id: old?.id || `ci-${d.date}`, type: 'checkin', date: d.date, ts: nowIso(), source: 'manuell', meta };
    await DB.putEntry(e); S.entries = S.entries.filter((x) => x.id !== e.id).concat(e); recompute();
    closeSheet(); render(); toast('Check-in gespeichert');
  },
  breakToggle: async (d) => {
    const t = today(); const hb = await getHabits(t); hb.breaks ||= [false, false, false, false];
    hb.breaks[+d.i] = !hb.breaks[+d.i]; await DB.kvSet(habitsKey(t), hb); render();
  },
  // Plan
  weekOffset: (d) => { S.weekOffset = +d.o; render(); },
  planWeek: (d) => openSheet('Wochen-Check-in', weekSetupForm(d.week)),
  planWeekSave: (d) => createWeekPlan(d.week),
  planToggle: async (d) => { const it = S.plan.find((p) => p.id === d.id); if (!it) return; await updatePlanItem(d.id, { done: !it.done, skipped: false, doneAt: !it.done ? nowIso() : null }); if (d.close) closeSheet(); },
  planDetail: (d) => { const it = S.plan.find((p) => p.id === d.id); if (it) openSheet(it.title, planDetailHtml(it)); },
  planSkip: async (d) => { const it = S.plan.find((p) => p.id === d.id); await updatePlanItem(d.id, { skipped: !it.skipped, done: false }); closeSheet(); },
  planMove: async (d) => { const it = S.plan.find((p) => p.id === d.id); const to = $('#moveTo').value; if (to === it.date) { closeSheet(); return; } await updatePlanItem(d.id, { movedFrom: it.movedFrom || it.date, date: to, skipped: false }); closeSheet(); toast(`Verschoben auf ${L.WEEKDAYS[L.weekday(to)]}`); },
  planSwap: async (d) => { const it = S.plan.find((p) => p.id === d.id); await updatePlanItem(d.id, { kind: 'easy', title: 'Lockerer Spaziergang (15 min)', duration: 15, swappedFrom: it.kind }); closeSheet(); toast('Gegen leichte Variante getauscht'); },
  planSetTime: async (d) => { await updatePlanItem(d.id, { time: $('#ptTimeEdit').value }); closeSheet(); },
  // Erfassen
  drinkKind: (d) => { S.logDrinkKind = d.k; render(); },
  drink: (d) => addEntry({ type: 'drink', sub: S.logDrinkKind, value: +d.ml }, { label: `+${d.ml} ml ${L.DRINK_KINDS.find((k) => k.id === S.logDrinkKind).label}` }),
  drinkQuick: (d) => addEntry({ type: 'drink', sub: 'wasser', value: +d.ml }, { label: `+${d.ml} ml Wasser` }),
  drinkCustom: () => {
    const v = L.parseNum($('#drinkCustom').value);
    if (!v || v <= 0 || v > 3000) { toast('Bitte eine Menge zwischen 1 und 3.000 ml eingeben'); return; }
    addEntry({ type: 'drink', sub: S.logDrinkKind, value: Math.round(v) }, { label: `+${N(v)} ml` });
  },
  cig: async () => {
    const e = await addEntry({ type: 'cig', value: 1 }, { silent: true });
    const ct = cigTargetToday(); const n = day(today()).cigs;
    toast(`Zigarette erfasst (${n}${ct !== null ? ` von max. ${ct}` : ''})`, async () => removeEntry(e.id),
      `<div class="chips" style="margin-top:6px">${['Kaffee', 'Stress', 'Pause', 'Nach dem Essen', 'Alkohol', 'Gewohnheit'].map((t) => `<button class="chip" data-a="cigTrigger" data-id="${e.id}" data-t="${t}" style="min-height:32px;font-size:13px;color:#1c1c1e">${t}</button>`).join('')}</div>`);
  },
  cigTrigger: async (d) => {
    const e = S.entries.find((x) => x.id === d.id); if (!e) return;
    e.meta = { ...(e.meta || {}), trigger: d.t }; await DB.putEntry(e); recompute(); $('#toast').innerHTML = ''; render(); toast(`Auslöser „${d.t}“ gespeichert`);
  },
  sos: () => openSheet('SOS Rauchverlangen', sosHtml()),
  sosStart: () => {
    let s = 180; const el = $('#sosTimer');
    clearInterval(ACT._sos); ACT._sos = setInterval(() => { s--; if (!$('#sosTimer')) { clearInterval(ACT._sos); return; } el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s <= 0) { clearInterval(ACT._sos); el.textContent = 'Geschafft?'; } }, 1000);
  },
  urgeResisted: async () => { const t = readChips($('#sheetBody'), 'trig')[0] || null; closeSheet(); await addEntry({ type: 'urge', value: 1, meta: { trigger: t } }, { label: 'Stark! Verlangen widerstanden.' }); },
  urgeSmoked: async () => { const t = readChips($('#sheetBody'), 'trig')[0] || null; closeSheet(); await addEntry({ type: 'cig', value: 1, meta: { trigger: t } }, { label: 'Erfasst. Kein Drama – weiter geht’s.' }); },
  alc: (d) => {
    const p = L.ALCOHOL_PRESETS.find((x) => x.id === d.id); const g = L.alcoholGrams(p.ml, p.abv);
    addEntry({ type: 'alcohol', sub: p.kind, value: p.ml, meta: { abv: p.abv, grams: g, label: p.label }, source: p.estimated ? 'geschaetzt' : 'manuell' }, { label: `${p.label}: ${N(g, 1)} g Alkohol` });
  },
  alcCustom: () => openSheet('Eigenes Getränk', `<form id="alcForm"><label class="f"><span>Bezeichnung</span><input name="label" value="Getränk"></label>
    <div class="grid2"><label class="f"><span>Menge (ml)</span><input name="ml" inputmode="numeric"></label><label class="f"><span>Alkohol (% vol)</span><input name="abv" inputmode="decimal"></label></div>
    <div id="formErr" class="small" style="color:var(--bad)"></div><button type="button" class="btn block" data-a="alcCustomSave">Speichern</button></form>`),
  alcCustomSave: async () => {
    const f = $('#alcForm'); const ml = L.parseNum(f.elements.ml.value); const abv = L.parseNum(f.elements.abv.value);
    if (!ml || ml <= 0 || ml > 3000 || abv === null || abv < 0 || abv > 80) { $('#formErr').textContent = 'Bitte Menge (1–3.000 ml) und Alkoholgehalt (0–80 %) angeben.'; return; }
    const g = L.alcoholGrams(ml, abv); closeSheet();
    await addEntry({ type: 'alcohol', sub: 'Individuell', value: ml, meta: { abv, grams: g, label: f.elements.label.value || 'Getränk' } }, { label: `${N(g, 1)} g Alkohol erfasst` });
  },
  meal: () => openSheet('Mahlzeit', mealForm()),
  mealSave: async () => {
    const f = $('#mealForm'); const root = $('#sheetBody');
    const meta = { slot: readChips(root, 'slot')[0] || 'Mahlzeit', how: readChips(root, 'how')[0] || '', veg: f.elements.veg.checked, protein: f.elements.protein.checked, whole: f.elements.whole.checked, full: f.elements.full.value ? +f.elements.full.value : null, note: f.elements.note.value.trim() || null };
    const pid = S.pendingPlanId; S.pendingPlanId = null;
    if (pid) {
      const it = S.plan.find((x) => x.id === pid);
      meta.planId = pid;
      closeSheet(); await addEntry({ type: 'meal', date: it?.date || today(), meta }, { label: 'Mahlzeit gespeichert' });
      if (it) {
        await updatePlanItem(pid, { status: it.placeholder ? 'gegessen' : 'ersetzt', otherText: meta.note || meta.how || 'anderes Gericht' });
        if (it.recipeId && !it.placeholder) { const rt = S.ratings[it.recipeId] ||= {}; rt.skipped = (rt.skipped || 0) + 1; await DB.kvSet('ratings', S.ratings); }
      }
      return;
    }
    closeSheet(); await addEntry({ type: 'meal', meta }, { label: 'Mahlzeit gespeichert' });
  },
  metric: (d) => openSheet({ weight: 'Gewicht', waist: 'Bauchumfang', bp: 'Blutdruck', rhr: 'Ruhepuls', sleepH: 'Schlaf', workout: 'Training', steps: 'Schritte' }[d.k], metricForm(d.k)),
  metricSave: async (d) => {
    const f = $('#mForm'); const date = f.elements.date.value || today();
    if (date > today()) { $('#formErr').textContent = 'Datum liegt in der Zukunft.'; return; }
    if (d.k === 'bp') {
      const s = L.parseNum(f.elements.bpSys.value), di = L.parseNum(f.elements.bpDia.value);
      if (!s || !di || s < 70 || s > 260 || di < 40 || di > 160 || di >= s) { $('#formErr').textContent = 'Bitte plausible Werte eingeben (systolisch > diastolisch).'; return; }
      closeSheet();
      await DB.putEntries([{ id: DB.uid(), type: 'metric', sub: 'bpSys', value: s, date, ts: nowIso(), source: 'manuell' }, { id: DB.uid(), type: 'metric', sub: 'bpDia', value: di, date, ts: nowIso(), source: 'manuell' }]);
      S.entries = await DB.allEntries(); recompute(); render(); toast(`Blutdruck ${s}/${di} gespeichert`); return;
    }
    const v = L.parseNum(f.elements.value.value);
    if (d.k === 'workout') {
      if (!v || v <= 0 || v > 600) { $('#formErr').textContent = 'Bitte Dauer zwischen 1 und 600 Minuten eingeben.'; return; }
      closeSheet(); await addEntry({ type: 'workout', value: v, date, meta: { kind: f.elements.kind.value } }, { label: 'Training gespeichert' }); return;
    }
    if (v === null || v < +d.min || v > +d.max) { $('#formErr').textContent = `Bitte einen Wert zwischen ${d.min} und ${N(+d.max)} eingeben.`; return; }
    const prevW = d.k === 'weight' ? lastMetric('weight', date, 14) : null;
    closeSheet();
    await addEntry({ type: 'metric', sub: d.k, value: v, date }, { label: 'Gespeichert' });
    if (prevW && Math.abs(prevW.value - v) > 3) toast(`Hinweis: ${N(Math.abs(prevW.value - v), 1)} kg Unterschied zum letzten Wert – Tippfehler?`);
  },
  delEntry: async (d) => {
    const e = S.entries.find((x) => x.id === d.id); if (!e) return;
    await DB.deleteEntry(e.id); S.entries = S.entries.filter((x) => x.id !== e.id); recompute(); render();
    toast('Eintrag gelöscht', async () => { await DB.putEntry(e); S.entries.push(e); recompute(); render(); });
  },
  importClipboard: async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast('Zwischenablage ist leer – Kurzbefehl zuerst ausführen'); return; }
      startImport(text);
    } catch { ACT.importPaste(); }
  },
  importPaste: () => openSheet('Import: Text einfügen', '<p class="small">Lange auf das Feld tippen → „Einsetzen“.</p><textarea id="pasteBox" style="min-height:160px"></textarea><button class="btn block" data-a="importPasteGo" style="margin-top:8px">Prüfen</button>'),
  importPasteGo: () => { const t = $('#pasteBox').value; closeSheet(); startImport(t); },
  importConfirm: () => confirmImport(),
  shortcutHelp: () => openSheet('Kurzbefehl einrichten', shortcutHelpHtml()),
  remindersHelp: () => openSheet('Erinnerungen per Kurzbefehle', remindersHtml()),
  // Erfolge
  period: (d) => { S.period = d.p; render(); },
  // Profil
  goalsSave: async () => {
    const f = $('#goalForm'); const n = (k) => L.parseNum(f.elements[k]?.value);
    const errs = [];
    const fluid = n('fluidMl'); if (fluid !== null && (fluid < 500 || fluid > 6000)) errs.push('Trinkziel 500–6.000 ml');
    const steps = n('steps'); if (steps !== null && (steps < 1000 || steps > 40000)) errs.push('Schrittziel 1.000–40.000');
    const af = n('afDays'); if (af !== null && (af < 0 || af > 7)) errs.push('Alkoholfreie Tage 0–7');
    if (errs.length) { $('#formErr').textContent = errs.join(' · '); return; }
    await saveKv('goals', { ...S.goals, fluidMl: fluid, steps, afDays: af, alcMaxGWeek: n('alcMaxGWeek'), weightMode: f.elements.weightMode.value });
    if (S.profile.smoker) await saveKv('cigPlan', { ...(S.cigPlan || { start: today(), floor: 0 }), base: n('cigBase'), stepPerWeek: n('cigStep') ?? 1, quitDate: f.elements.quitDate.value || null });
    render(); toast('Ziele gespeichert');
  },
  backup: () => doBackup(),
  restoreConfirm: async () => {
    const keepKey = S.ai.apiKey;
    try { await DB.restoreAll(S.pendingRestore); } catch (e) { toast(e.message); return; }
    if (keepKey) { const ai = await DB.kvGet('ai', {}); await DB.kvSet('ai', { ...ai, apiKey: keepKey }); }
    closeSheet(); S.habits = {}; await load(); render(); toast('Sicherung wiederhergestellt');
  },
  persist: async () => { const ok = await DB.requestPersist(); toast(ok ? 'Dauerhafte Speicherung aktiv' : 'Nicht bestätigt – regelmäßige Sicherungen sind umso wichtiger'); render(); },
  baselineReset: async () => { if (!confirm('Ausgangswerte neu setzen? Vergleiche beziehen sich danach auf die neuen Werte.')) return; await finishOnboardingBaselineOnly(); render(); toast('Ausgangswerte aktualisiert'); },
  demoOn: async () => { DB.setMode('demo'); DB.resetConnection(); await seedDemoIfEmpty(); location.reload(); },
  demoOff: () => { DB.setMode('echt'); DB.resetConnection(); location.reload(); },
  wipe: async () => {
    if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.')) return;
    if (prompt('Zur Bestätigung bitte LÖSCHEN eingeben') !== 'LÖSCHEN') { toast('Abgebrochen'); return; }
    await DB.wipeAll(); location.reload();
  },
  undo: () => {},
  // ---------- Stufe 2 ----------
  planView: (d) => { S.planView = d.v; render(); },
  planViewGo: (d) => { closeSheet(); S.tab = 'plan'; S.planView = d.v; S.weekOffset = 0; render(); window.scrollTo(0, 0); },
  mealEaten: async (d) => { await toggleMealEaten(d.id); if (d.close) closeSheet(); },
  mealDetail: (d) => { const it = S.plan.find((p) => p.id === d.id); if (it) openSheet(mealTitle(it), mealDetailHtml(it)); },
  mealSkip: async (d) => {
    const it = S.plan.find((p) => p.id === d.id);
    await updatePlanItem(d.id, { status: it.status === 'ausgelassen' ? null : 'ausgelassen' });
    if (it.recipeId && it.status === 'ausgelassen') { const rt = S.ratings[it.recipeId] ||= {}; rt.skipped = (rt.skipped || 0) + 1; await DB.kvSet('ratings', S.ratings); }
    closeSheet();
  },
  mealOther: (d) => { S.pendingPlanId = d.id; openSheet('Was hast du stattdessen gegessen?', mealForm()); },
  mealSwap: (d) => {
    const it = S.plan.find((p) => p.id === d.id);
    const office = isOfficeDay(it.date) && it.slot === 'mittag';
    const list = F.RECIPES.filter((r) => r.slots.includes(it.slot) && r.id !== it.recipeId && (!office || r.office) && F.allergenHits(F.recipeText(r)).length === 0 && F.ratingScore(S.ratings[r.id]) > -50)
      .sort((a, b) => F.ratingScore(S.ratings[b.id]) - F.ratingScore(S.ratings[a.id]) || a.active - b.active).slice(0, 8);
    openSheet('Gericht tauschen', `<p class="small">${office ? 'Nur bürotaugliche Gerichte. ' : ''}Die Einkaufsliste passt sich automatisch an.</p>${list.map((r) => `<div class="item card" style="margin:6px 0"><div class="grow"><div class="t">${esc(r.name)}</div><div class="small">${r.active} min · ca. ${r.kcal} kcal · ${r.p} g Protein · ${F.STRATEGY_LABEL[r.strategy]}</div></div><button class="btn secondary" data-a="mealSwapPick" data-id="${it.id}" data-r="${r.id}">Wählen</button></div>`).join('')}
      <div class="grid2" style="margin-top:10px"><button class="btn secondary" data-a="mealSetPlaceholder" data-id="${it.id}" data-p="bestellen">Bestellen</button><button class="btn secondary" data-a="mealSetPlaceholder" data-id="${it.id}" data-p="restaurant">Restaurant</button></div>
      <button class="btn ghost block" data-a="coach" data-m="ernaehrung" data-q="Schlag mir eine Alternative für ${esc(F.SLOT_LABEL[it.slot])} am ${L.fmtDate(it.date)} vor (statt ${esc(mealTitle(it))}).">KI-Coach nach Alternative fragen</button>`);
  },
  mealSwapPick: async (d) => { const it = S.plan.find((p) => p.id === d.id); closeSheet(); await setMealSlot(it.date, it.slot, { recipeId: d.r, portions: it.portions || 1 }); toast('Getauscht – Einkaufsliste aktualisiert'); },
  mealSetPlaceholder: async (d) => { const it = S.plan.find((p) => p.id === d.id); closeSheet(); await setMealSlot(it.date, it.slot, { placeholder: d.p }); },
  mealRate: async (d) => {
    const it = S.plan.find((p) => p.id === d.id); const sel = readChips($('#sheetBody'), 'rate');
    const rt = S.ratings[it.recipeId] ||= {};
    for (const k of ['liked', 'easy', 'full', 'again', 'tooMuch', 'disliked']) rt[k] = sel.includes(k) ? 1 : 0;
    await DB.kvSet('ratings', S.ratings); closeSheet(); toast(sel.includes('disliked') ? 'Wird nicht mehr vorgeschlagen' : 'Bewertung gespeichert – fließt in künftige Pläne ein');
  },
  mealsRegenerate: async (d) => {
    const ws = d.week; const setup = await DB.kvGet(`week-${ws}`, {});
    const recent = S.plan.filter((p) => p.area === 'essen' && p.recipeId && p.date >= L.addDays(ws, -14) && p.date < ws).map((p) => p.recipeId);
    const fit = S.plan.filter((p) => p.week === ws && p.area === 'fitness' && ['pt', 'walk', 'strength'].includes(p.kind)).map((p) => p.date);
    const meals = F.planMeals({ weekStart: ws, officeDays: S.profile.officeDays || [1, 2, 3, 4, 5], cookDays: S.mealDefaults.cookDays ?? 2, restaurantDays: setup.social || [], orderDays: setup.order || [], busyDays: setup.busy || [], trainingDays: fit, ratings: S.ratings, recent, variant: String(Date.now()) }, S.profile, S.goals);
    const keep = S.plan.filter((p) => p.week === ws && p.area === 'essen' && (p.status || p.date < today()));
    const fresh = meals.filter((m) => !keep.some((k) => k.id === m.id) && m.date >= today()).map((m) => ({ ...m, week: ws }));
    const rm = S.plan.filter((p) => p.week === ws && p.area === 'essen' && !keep.includes(p)).map((p) => p.id);
    await DB.deletePlanItems(rm); await DB.putPlanItems(fresh);
    S.plan = S.plan.filter((p) => !rm.includes(p.id)).concat(fresh); render(); toast('Neue Vorschläge erstellt');
  },
  cookMode: (d) => { const it = S.plan.find((p) => p.id === d.id); if (it) startCook(it); },
  cookNext: async () => { stopCookTimer(); if (cook.i < cook.steps.length - 1) { cook.i++; rerenderCook(); } else { const id = cook.id; try { await cook.lock?.release(); } catch { /* */ } cook = null; closeSheet(); const it = S.plan.find((p) => p.id === id); if (it && it.status !== 'gegessen') { await toggleMealEaten(id); } } },
  cookPrev: () => { stopCookTimer(); if (cook.i > 0) { cook.i--; rerenderCook(); } },
  cookTimer: () => {
    const s = cook.steps[cook.i]; if (!s.timer || cook.running) return;
    cook.running = true; cook.left = s.timer; rerenderCook();
    cook.timer = setInterval(() => { if (!cook) return; cook.left--; const el = $('#cookTimer'); if (el) el.textContent = fmtTimer(Math.max(0, cook.left)); if (cook.left <= 0) { clearInterval(cook.timer); cook.running = false; beep(); if (el) el.textContent = 'Fertig!'; } }, 1000);
  },
  shopToggle: async (d) => { const st = await getShopState(d.week); st.checked[d.k] = !st.checked[d.k]; await DB.kvSet(`shop-${d.week}`, st.checked); render(); },
  shopAdd: async (d) => { const v = $('#shopExtra').value.trim(); if (!v) return; const st = await getShopState(d.week); st.extras.push({ name: v, sec: 'Sonstiges' }); await DB.kvSet(`shopx-${d.week}`, st.extras); render(); },
  shopAddMany: async (d) => { const ws = L.mondayOf(today()); const st = await getShopState(ws); d.items.split('|').forEach((n) => st.extras.push({ name: n, sec: 'Sonstiges' })); await DB.kvSet(`shopx-${ws}`, st.extras); toast('Auf die Einkaufsliste gesetzt'); },
  pantry: () => openSheet('Vorräte', pantryHtml()),
  pantryToggle: async (d, el) => {
    const ing = F.INGREDIENTS[d.k];
    if (ing.staple) S.pantry[d.k] = S.pantry[d.k] === false ? true : false; else S.pantry[d.k] = !S.pantry[d.k];
    await DB.kvSet('pantry', S.pantry); el.classList.toggle('on'); render();
  },
  restaurants: () => openSheet('Restaurants & Lieferdienste', restaurantsHtml()),
  restaurantAdd: async () => {
    const f = $('#restForm'); const name = f.elements.name.value.trim(); let url = f.elements.url.value.trim();
    if (!name) { toast('Bitte einen Namen eingeben'); return; }
    if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    S.restaurants.push({ name, url, cuisine: f.elements.cuisine.value, dishes: f.elements.dishes.value.trim() });
    await saveKv('restaurants', S.restaurants); $('#sheetBody').innerHTML = restaurantsHtml(); render();
  },
  restaurantDel: async (d) => { S.restaurants.splice(+d.i, 1); await saveKv('restaurants', S.restaurants); $('#sheetBody').innerHTML = restaurantsHtml(); render(); },
  orderTips: () => {
    const c = readChips($('#sheetBody'), 'cuisine'); const out = $('#orderTipsOut');
    out.innerHTML = c.length ? c.map((k) => `<div class="card"><b>${esc(k)}</b><ul class="steps small">${F.ORDER_TIPS[k].map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('') : '<p class="small">Bitte eine Küche wählen.</p>';
  },
  menuAnalyze: () => {
    const res = F.analyzeMenu($('#menuText').value);
    $('#menuOut').innerHTML = res.length ? `<div class="list">${res.slice(0, 25).map((r) => `<div class="item"><div class="grow"><div class="t" style="${r.ok ? '' : 'color:var(--bad)'}">${r.ok ? (r.score > 0 ? '✓ ' : '') : '⛔ '}${esc(r.line)}</div>${r.hits.length ? `<div class="small" style="color:var(--bad)">Enthält: ${esc(r.hits.join(', '))}</div>` : ''}${r.caution.map((c) => `<div class="small" style="color:var(--warn)">⚠ ${esc(c)}</div>`).join('')}</div></div>`).join('')}</div><p class="small">Grobe Stichwortanalyse. Allergene sind nie bestätigt – beim Bestellen immer auf die Allergie hinweisen.</p>` : '<p class="small">Kein Text erkannt.</p>';
  },
  assist: (d) => { const slot = $('#asSlot')?.value || defaultSlot(); $('#assistOut').innerHTML = assistOutput(d.s, slot); },
  assistVorrat: (d) => { const have = $('#haveInput').value.split(/[,;]/).map((x) => x.trim()).filter(Boolean); $('#vorratOut').innerHTML = suggestionCards(F.suggest({ situation: 'vorrat', have, profile: S.profile, ratings: S.ratings, slot: d.slot }), d.slot); },
  assistPick: async (d) => { closeSheet(); await setMealSlot(today(), d.slot, { recipeId: d.r }); toast(`${F.RECIPE[d.r].name} für ${F.SLOT_LABEL[d.slot]} eingeplant – Einkaufsliste aktualisiert`); },
  assistPlaceholder: async (d) => { closeSheet(); await setMealSlot(today(), d.slot, { placeholder: d.p }); },
  fitAssist: (d) => {
    const s = fitSession(d.s); S.pendingFit = s;
    $('#fitOut').innerHTML = `<div class="card"><h3>${esc(s.title)}</h3><p class="small"><span class="tag">Ziel</span>${esc(s.details.goal)} · <span class="tag">Intensität</span>${esc(s.details.intensity)}</p><ol class="steps small">${s.details.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="small">${esc(s.details.recovery)}</p><button class="btn block" data-a="fitPick">In den heutigen Plan</button></div>`;
  },
  fitPick: async () => {
    const s = S.pendingFit; if (!s) return;
    const it = { id: `fit-x-${DB.uid()}`, week: L.mondayOf(today()), date: today(), area: 'fitness', kind: 'custom', title: s.title, duration: s.duration, details: s.details, done: false, skipped: false, time: '' };
    await DB.putPlanItems([it]); S.plan.push(it); closeSheet(); render(); toast('In den heutigen Plan übernommen');
  },
  productCheck: () => productCheck(($('#eanInput').value || '').replace(/\s/g, '')),
  // KI-Coach
  coach: (d) => openCoach(d.m || 'heute', { q: d.q ?? null }),
  coachPhoto: (d) => openCoach(d.m || 'ernaehrung', { q: d.q ?? '', photo: true }),
  coachModule: (d) => { S.coach.module = d.m; coachRerender(); },
  coachQuick: (d) => { S.coach.draft = d.q; const ta = $('#coachInput'); if (ta) ta.value = d.q; },
  coachSend: () => coachPrepare(),
  coachConfirmSend: () => coachSend(),
  coachBack: () => { S.coach.pending = null; coachRerender(); },
  coachImgRemove: () => { S.coach.image = null; coachRerender(); },
  coachClear: async () => { if (!confirm('Verlauf dieses Bereichs löschen?')) return; S.coach.history[S.coach.module] = []; await DB.kvSet('aiHistory', S.coach.history); coachRerender(); },
  aiAction: (d) => applyAiAction(d.m, +d.h, +d.i),
  aiSetup: () => { closeSheet(); S.tab = 'profil'; render(); setTimeout(() => $('#aiForm')?.scrollIntoView({ behavior: 'smooth' }), 50); },
  aiSave: async () => {
    const f = $('#aiForm'); const key = f.elements.apiKey.value.trim();
    if (key && !/^sk-ant-/.test(key)) { toast('Der Schlüssel beginnt normalerweise mit „sk-ant-“ – bitte prüfen'); return; }
    const model = f.elements.modelCustom.value.trim() || f.elements.model.value;
    await saveKv('ai', { ...S.ai, apiKey: key || S.ai.apiKey, model, shareHealth: f.elements.shareHealth.checked, preview: f.elements.preview.checked,
      monthlyBudgetUsd: L.parseNum(f.elements.budget.value) || 10, priceIn: L.parseNum(f.elements.pin.value) || 3, priceOut: L.parseNum(f.elements.pout.value) || 15 });
    render(); toast('KI-Einstellungen gespeichert');
  },
  aiTest: async () => {
    toast('Teste Verbindung …');
    try { const r = await AI.callApi({ apiKey: S.ai.apiKey, model: S.ai.model, system: 'Antworte nur mit: OK', messages: [{ role: 'user', content: 'Test' }], maxTokens: 5 }); await addUsage(r.usage); toast(`Verbindung funktioniert (${S.ai.model})`); render(); } catch (e) { toast(e.message); }
  },
  aiKeyDelete: async () => { if (!confirm('API-Schlüssel von diesem Gerät löschen?')) return; await saveKv('ai', { ...S.ai, apiKey: '' }); render(); toast('Schlüssel gelöscht'); },
};
async function finishOnboardingBaselineOnly() {
  const keepGoals = S.goals, keepPlan = S.cigPlan;
  const p = S.profile;
  const preset = L.ALCOHOL_PRESETS.find((x) => x.id === p.alcTypical) || L.ALCOHOL_PRESETS[0];
  await saveKv('baseline', {
    date: today(), source: 'Profil (manuell neu gesetzt)', weight: lastMetric('weight')?.value ?? p.weight ?? null, waist: lastMetric('waist')?.value ?? p.waist ?? null,
    bmi: L.bmi(lastMetric('weight')?.value ?? p.weight, p.height), rhr: avgMetric((d) => d.metrics.rhr, today(), 14) ?? p.rhr ?? null, vo2: lastMetric('vo2')?.value ?? p.vo2 ?? null,
    steps: avgMetric((d) => d.metrics.steps, today(), 14) ?? p.baseSteps ?? null, sleepH: avgMetric((d) => d.metrics.sleepH, today(), 14) ?? p.sleepH ?? null,
    cigsPerDay: p.smoker ? p.cigsPerDay ?? null : 0, alcoholGWeek: p.alcDrinksWeek != null ? Math.round(p.alcDrinksWeek * L.alcoholGrams(preset.ml, preset.abv)) : null, fluidMl: p.fluidNow ?? null,
  });
  S.goals = keepGoals; S.cigPlan = keepPlan;
}
async function seedDemoIfEmpty() {
  const done = await DB.kvGet('onboarding');
  if (done?.done) return;
  const { buildDemo } = await import('./demo.js');
  const demo = buildDemo(today());
  await DB.putEntries(demo.entries);
  for (const [k, v] of Object.entries(demo.kv)) await DB.kvSet(k, v);
  // Demo-Wochenpläne für die letzten Wochen
  const items = [];
  for (let w = -6; w <= 0; w++) {
    const ws = L.addDays(L.mondayOf(today()), 7 * w);
    const its = L.generateFitnessWeek({ weekStart: ws, ptDay: 3, ptTime: '17:30', profile: demo.kv.profile, level: w < -3 ? 0 : 1 })
      .map((it, i) => ({ ...it, week: ws, done: it.date < today() && (i % 4 !== 3) }));
    items.push(...its);
  }
  const ws0 = L.mondayOf(today());
  const fitNow = items.filter((i) => i.week === ws0 && ['pt', 'walk', 'strength'].includes(i.kind)).map((i) => i.date);
  const meals = F.planMeals({ weekStart: ws0, officeDays: [1, 2, 3, 4, 5], cookDays: 3, restaurantDays: [L.addDays(ws0, 5)], trainingDays: fitNow }, demo.kv.profile, demo.kv.goals)
    .map((m) => ({ ...m, week: ws0, status: m.date < today() ? 'gegessen' : null }));
  items.push(...meals);
  await DB.putPlanItems(items);
}

/* ======================= Start ======================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = ACT[el.dataset.a];
  if (fn) { if (el.tagName === 'BUTTON' || el.tagName === 'A') e.preventDefault(); Promise.resolve(fn({ ...el.dataset }, el, e)).catch(showError); }
});
document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || !el.files?.[0]) return;
  if (el.dataset.change === 'coachImage') {
    try { S.coach.image = await AI.imageToBase64(el.files[0]); } catch (err) { toast(err.message); }
    el.value = ''; coachRerender(); return;
  }
  const text = await el.files[0].text(); el.value = '';
  if (el.dataset.change === 'importFile') startImport(text);
  if (el.dataset.change === 'restoreFile') restoreFromText(text);
});
function showError(err) { console.error(err); toast(`Fehler: ${err?.message || err}`); }
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version verfügbar', null, '<div><button class="btn" data-a="applyUpdate" style="color:#7fd6e6">Jetzt aktualisieren</button></div>');
          ACT.applyUpdate = () => { nw.postMessage('skipWaiting'); };
        }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  } catch (e) { console.warn('Service Worker nicht registriert', e); }
}

(async function init() {
  try {
    if (isDemo()) await seedDemoIfEmpty();
    await load();
    render();
    registerSW();
    // Beim Zurückkehren in die App (z. B. nach Mitternacht) neu zeichnen
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  } catch (e) {
    $('#view').innerHTML = `<h1>HealthPilot</h1><div class="card flag dringend"><p>Die Datenbank konnte nicht geöffnet werden: ${esc(e.message)}</p><p class="small">Mögliche Ursache: privater Modus in Safari oder voller Speicher.</p></div>`;
  }
})();

// Für automatisierte Tests
window.__hp = { S, L, DB };
