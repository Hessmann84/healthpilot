// Testdaten – werden ausschließlich in der separaten Demo-Datenbank verwendet.
import * as L from './logic.js';

function rnd(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

export function buildDemo(today = L.isoDate()) {
  const r = rnd(42);
  const start = L.addDays(today, -59);
  const entries = [];
  let id = 0;
  const e = (o) => entries.push({ id: `demo-${id++}`, source: 'manuell', ...o });
  for (let i = 0; i < 60; i++) {
    const d = L.addDays(start, i);
    const p = i / 59; // Fortschritt über die Zeit
    const wd = L.weekday(d);
    const weekend = wd === 0 || wd === 6;
    if (d < today) {
      e({ type: 'metric', sub: 'steps', value: Math.round(5200 + p * 2600 + r() * 2500 + (weekend ? 1500 : 0)), date: d, source: 'import', ts: `${d}T23:00:00` });
      e({ type: 'metric', sub: 'rhr', value: Math.round(68 - p * 4 + r() * 3), date: d, source: 'import', ts: `${d}T23:00:00` });
      e({ type: 'metric', sub: 'hrv', value: Math.round(34 + p * 6 + r() * 8), date: d, source: 'import', ts: `${d}T23:00:00` });
      e({ type: 'metric', sub: 'exerciseMin', value: Math.round(r() < 0.45 + p * 0.2 ? 25 + r() * 35 : r() * 10), date: d, source: 'import', ts: `${d}T23:00:00` });
      if (i % 7 === 0) e({ type: 'metric', sub: 'vo2', value: Math.round((36 + p * 1.5) * 10) / 10, date: d, source: 'import', ts: `${d}T23:00:00` });
    }
    const alcDay = weekend ? r() < 0.8 - p * 0.3 : r() < 0.4 - p * 0.25;
    e({ type: 'metric', sub: 'sleepH', value: Math.round((6.4 + r() * 1.2 - (alcDay ? 0.4 : 0) + p * 0.3) * 100) / 100, date: d, source: 'import', ts: `${d}T07:00:00` });
    if (i % 3 === 0) e({ type: 'metric', sub: 'weight', value: Math.round((83 - p * 1.6 + r() * 0.8) * 10) / 10, date: d, source: 'import', ts: `${d}T07:00:00` });
    if (d === today) break;
    const cigs = Math.max(0, Math.round(14 - p * 6 + r() * 3 + (alcDay ? 3 : 0)));
    for (let c = 0; c < cigs; c++) {
      const h = 7 + Math.floor(r() * 15);
      e({ type: 'cig', value: 1, date: d, ts: `${d}T${String(h).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00`, meta: { trigger: ['Kaffee', 'Stress', 'Pause', 'Nach dem Essen', 'Alkohol'][Math.floor(r() * (alcDay ? 5 : 4))] } });
    }
    const drinks = Math.round(4 + p * 3 + r() * 2);
    for (let k = 0; k < drinks; k++) e({ type: 'drink', sub: ['wasser', 'wasser', 'kaffee', 'tee'][k % 4], value: 300, date: d, ts: `${d}T${String(8 + k * 2).padStart(2, '0')}:00:00` });
    if (alcDay) {
      const n = 1 + Math.floor(r() * (weekend ? 3 : 2));
      for (let k = 0; k < n; k++) e({ type: 'alcohol', sub: 'Bier', value: 500, date: d, ts: `${d}T${19 + k}:00:00`, meta: { abv: 5, grams: 20, label: 'Bier 0,5 l' } });
    }
    e({ type: 'meal', date: d, ts: `${d}T12:30:00`, meta: { slot: 'Mittag', how: 'Convenience', veg: r() < 0.4 + p * 0.4, protein: r() < 0.7, whole: r() < 0.3 + p * 0.3 } });
    e({ type: 'checkin', date: d, ts: `${d}T21:30:00`, meta: { complete: true, energy: 2 + Math.round(r() * 2 + p), mood: 3 + Math.round(r() * 1.5), stress: 2 + Math.round(r() * 2), sleepQ: 2 + Math.round(r() * 2 + p), food: 1 + Math.round(r() + p) } });
  }
  const profile = {
    sex: 'männlich', age: 42, height: 178, weight: 83, waist: 97, smoker: true, cigsPerDay: 15, packPrice: 9, packSize: 20,
    betaBlocker: 'nein', baseSteps: 5500, sleepH: 6.5, workStart: '08:15', workEnd: '17:00', officeDays: [1, 2, 3, 4, 5],
    allergies: 'Erdnüsse, Avocado', alcDrinksWeek: 8, alcTypical: 'bier05', audit1: 3, audit2: 1, audit3: 1,
  };
  return {
    entries,
    kv: {
      profile,
      baseline: { date: start, source: 'Demo', weight: 83, waist: 97, rhr: 68, steps: 5500, sleepH: 6.5, cigsPerDay: 15, alcoholGWeek: 160, fluidMl: 1400 },
      goals: { fluidMl: 2100, steps: 7000, afDays: 4, alcMaxGWeek: 120, weightMode: 'moderat' },
      cigPlan: { start, base: 15, stepPerWeek: 1, floor: 0, quitDate: null },
      fitness: { level: 1, start },
      onboarding: { done: true, finishedAt: start },
      settings: { lastBackup: null },
    },
  };
}
