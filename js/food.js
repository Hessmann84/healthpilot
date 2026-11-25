// HealthPilot – Ernährung: Zutaten, Rezepte, Allergenprüfung, Speiseplan, Einkaufsliste, Assistent (ohne KI)
import * as L from './logic.js';

/* ======================= Allergen- und Abneigungsprüfung ======================= */
// Verbindlich: Erdnuss, Avocado. Abneigung: Nüsse und Nussöle. Die Prüfung ist bewusst streng.
const FORBIDDEN = [
  /erdn[uü]ss/i, /peanut/i, /avocado/i, /guacamole/i, /haseln[uü]ss/i, /waln[uü]ss/i, /cashew/i, /mandel/i, /pistazie/i, /macadamia/i,
  /pekan/i, /paran[uü]ss/i, /pinienkern/i, /marzipan/i, /nougat/i, /krokant/i, /praline/i, /satay|saté|sate-/i,
  /(^|[^a-zäöüß])n[uü]ss/i, /n[uü]ss(öl|mus|creme|mischung|kern|brot)/i, /\bnuts?\b/i, /almond/i, /hazelnut/i,
];
// Begriffe, bei denen im Restaurant/auf dem Etikett nachgefragt bzw. geprüft werden muss
const CAUTION = [
  [/pesto/i, 'Pesto enthält oft Pinienkerne oder Cashews'],
  [/thai|indonesi|asiatisch|wok|gado|bami|nasi/i, 'Asiatische Küche: Erdnüsse/Erdnussöl häufig – ausdrücklich nachfragen'],
  [/curry|korma|tikka|masala/i, 'Currys/Saucen enthalten oft Cashews, Mandeln oder Erdnüsse – nachfragen'],
  [/dressing|marinade|sauce|soße|dip/i, 'Saucen und Dressings: Zusammensetzung unbekannt – nachfragen'],
  [/bowl|poke|sushi|california|salat.*kern|wrap/i, 'Bowls, Poke, Sushi-Rollen und Wraps enthalten oft Avocado – nachfragen'],
  [/m[uü]esli|granola|crunch|riegel|brownie|kuchen|torte|dessert|eis\b|baklava|cookie/i, 'Süßes/Müsli: häufig Nüsse oder Spuren'],
  [/romesco|dukkah|mole|chimichurri/i, 'Sauce/Würzmischung enthält häufig Nüsse'],
];
export function allergenHits(text) {
  const s = String(text || '');
  return FORBIDDEN.filter((r) => r.test(s)).map((r) => (s.match(r) || [''])[0].trim()).filter(Boolean);
}
export function cautionHits(text) {
  const s = String(text || '');
  return CAUTION.filter(([r]) => r.test(s)).map(([, msg]) => msg);
}

/* ======================= Zutatenkatalog ======================= */
export const SECTIONS = ['Obst und Gemüse', 'Kühlregal', 'Fleisch und Fisch', 'Backwaren', 'Tiefkühlprodukte', 'Konserven und Trockenprodukte', 'Getränke', 'Sonstiges'];
// unit = Einheit in Rezepten; pack = Inhalt einer handelsüblichen Packung in dieser Einheit; price = geschätzter Preis in € (Edeka/Rewe, Eigenmarke)
// check = Etikett muss auf Allergene geprüft werden (verarbeitetes Produkt)
const I = (k, name, sec, unit, pack, packLabel, price, opts = {}) => ({ k, name, sec, unit, pack, packLabel, price, ...opts });
export const INGREDIENTS = Object.fromEntries([
  I('haferflocken', 'Haferflocken (Vollkorn)', 'Konserven und Trockenprodukte', 'g', 500, '500-g-Packung', 0.89, { staple: true }),
  I('leinsamen', 'Leinsamen, geschrotet', 'Konserven und Trockenprodukte', 'EL', 25, '250-g-Packung', 1.29, { staple: true }),
  I('skyr', 'Skyr natur', 'Kühlregal', 'g', 450, '450-g-Becher', 1.49, { perishable: true }),
  I('magerquark', 'Magerquark', 'Kühlregal', 'g', 500, '500-g-Becher', 1.29, { perishable: true }),
  I('joghurt', 'Naturjoghurt 1,5 %', 'Kühlregal', 'g', 500, '500-g-Becher', 0.89, { perishable: true }),
  I('huettenkaese', 'Hüttenkäse', 'Kühlregal', 'g', 200, '200-g-Becher', 0.99, { perishable: true }),
  I('frischkaese', 'Frischkäse light', 'Kühlregal', 'g', 200, '200-g-Packung', 0.99, { perishable: true }),
  I('milch', 'Milch 1,5 %', 'Kühlregal', 'ml', 1000, '1-l-Packung', 1.09, { perishable: true }),
  I('eier', 'Eier', 'Kühlregal', 'Stk', 10, '10er-Packung', 2.99),
  I('eier_gekocht', 'Gekochte Eier (geschält oder gefärbt)', 'Kühlregal', 'Stk', 6, '6er-Packung', 1.99, { perishable: true }),
  I('feta', 'Feta', 'Kühlregal', 'g', 200, '200-g-Packung', 1.79, { perishable: true }),
  I('mozzarella', 'Mozzarella light', 'Kühlregal', 'g', 125, '125-g-Packung', 0.99, { perishable: true }),
  I('reibekaese', 'Reibekäse light', 'Kühlregal', 'g', 200, '200-g-Beutel', 1.99, { perishable: true }),
  I('hummus', 'Hummus natur', 'Kühlregal', 'g', 200, '200-g-Becher', 1.49, { perishable: true, check: 'Hummus: Zutatenliste prüfen (normal Sesam, selten Nüsse).' }),
  I('fertigsalat', 'Fertigsalat-Bowl mit Protein (z. B. Hähnchen, Ei, Bohnen)', 'Kühlregal', 'Stk', 1, 'Schale', 3.49, { perishable: true, convenience: true, check: 'Fertigsalat: auf Avocado, Nüsse und Kerne im Topping/Dressing prüfen. Kriterien: ≥ 20 g Protein, ≤ 2 g Salz pro Packung.' }),
  I('linsensuppe', 'Linsen- oder Erbsensuppe (Dose/Kühlregal)', 'Konserven und Trockenprodukte', 'g', 400, '400-g-Dose', 1.49, { convenience: true, check: 'Fertigsuppe: Zutatenliste prüfen. Kriterien: ≥ 6 g Protein und ≤ 0,8 g Salz pro 100 g.' }),
  I('haehnchen_gegart', 'Hähnchenbrust gegart, Streifen (Kühlregal)', 'Fleisch und Fisch', 'g', 150, '150-g-Packung', 2.79, { perishable: true, check: 'Gegarte Hähnchenstreifen: Marinade prüfen (selten Erdnussöl).' }),
  I('haehnchenbrust', 'Hähnchenbrustfilet', 'Fleisch und Fisch', 'g', 400, '400-g-Packung', 4.99, { perishable: true }),
  I('rinderhack', 'Rinderhackfleisch mager (≤ 10 % Fett)', 'Fleisch und Fisch', 'g', 400, '400-g-Packung', 4.49, { perishable: true }),
  I('putenaufschnitt', 'Putenbrust-Aufschnitt', 'Fleisch und Fisch', 'g', 100, '100-g-Packung', 1.49, { perishable: true }),
  I('lachs_tk', 'Lachsfilet, tiefgekühlt (2 Stück)', 'Tiefkühlprodukte', 'Stk', 2, '250-g-Packung', 3.99),
  I('thunfisch', 'Thunfisch im eigenen Saft', 'Konserven und Trockenprodukte', 'Dose', 1, 'Dose (ca. 110 g abgetropft)', 1.59),
  I('kidney', 'Kidneybohnen', 'Konserven und Trockenprodukte', 'Dose', 1, '400-g-Dose', 0.79),
  I('kichererbsen', 'Kichererbsen', 'Konserven und Trockenprodukte', 'Dose', 1, '400-g-Dose', 0.79),
  I('linsen', 'Linsen, vorgegart', 'Konserven und Trockenprodukte', 'Dose', 1, '400-g-Dose', 0.99),
  I('mais', 'Mais', 'Konserven und Trockenprodukte', 'Dose', 1, '285-g-Dose', 0.79),
  I('passierte_tomaten', 'Passierte Tomaten', 'Konserven und Trockenprodukte', 'g', 500, '500-g-Packung', 0.59),
  I('tomaten_dose', 'Gehackte Tomaten', 'Konserven und Trockenprodukte', 'g', 400, '400-g-Dose', 0.59),
  I('reis_express', 'Vollkornreis, Express-Beutel (vorgegart)', 'Konserven und Trockenprodukte', 'g', 250, '250-g-Beutel', 1.49),
  I('nudeln', 'Vollkornnudeln', 'Konserven und Trockenprodukte', 'g', 500, '500-g-Packung', 0.99),
  I('sojasauce', 'Sojasauce (salzreduziert)', 'Konserven und Trockenprodukte', 'EL', 16, '250-ml-Flasche', 1.99, { staple: true }),
  I('wraps', 'Vollkorn-Wraps', 'Backwaren', 'Stk', 6, '6er-Packung', 1.79, { check: 'Wraps: Zutatenliste kurz prüfen.' }),
  I('vollkornbrot', 'Vollkornbrot, geschnitten', 'Backwaren', 'Scheibe', 10, '500-g-Packung', 1.69, { check: 'Brot: kein Nuss- oder Walnussbrot wählen; Zutatenliste prüfen.' }),
  I('knaecke', 'Vollkorn-Knäckebrot', 'Backwaren', 'Scheibe', 20, '250-g-Packung', 1.29),
  I('tk_gemuese', 'Gemüsemischung, tiefgekühlt (ohne Sauce)', 'Tiefkühlprodukte', 'g', 750, '750-g-Beutel', 1.79),
  I('tk_brokkoli', 'Brokkoli, tiefgekühlt', 'Tiefkühlprodukte', 'g', 450, '450-g-Beutel', 1.49),
  I('tk_spinat', 'Blattspinat, tiefgekühlt (Portionen)', 'Tiefkühlprodukte', 'g', 450, '450-g-Packung', 1.29),
  I('tk_beeren', 'Beerenmischung, tiefgekühlt', 'Tiefkühlprodukte', 'g', 500, '500-g-Beutel', 2.49),
  I('tk_kraeuter', 'Kräuter, tiefgekühlt (z. B. 8-Kräuter)', 'Tiefkühlprodukte', 'EL', 15, '50-g-Becher', 1.29, { staple: true }),
  I('tk_pfanne', 'Pfannengericht, tiefgekühlt (z. B. Hähnchen-Gemüse-Reis)', 'Tiefkühlprodukte', 'g', 500, '500-g-Beutel (2 Portionen)', 2.99, { convenience: true, check: 'TK-Pfannengericht: keine Erdnuss-/Satay-/Asia-Sauce mit Nüssen; Kriterien: ≥ 7 g Protein und ≤ 1 g Salz pro 100 g.' }),
  I('tk_pizza', 'Pizza Margherita, tiefgekühlt', 'Tiefkühlprodukte', 'Stk', 1, 'Stück', 2.49, { convenience: true, check: 'TK-Pizza: Zutatenliste prüfen (Pesto-Varianten meiden).' }),
  I('kartoffeln', 'Kartoffeln, festkochend', 'Obst und Gemüse', 'g', 1500, '1,5-kg-Netz', 1.99),
  I('paprika', 'Paprika', 'Obst und Gemüse', 'Stk', 3, '3er-Pack', 1.99, { perishable: true }),
  I('gurke', 'Salatgurke', 'Obst und Gemüse', 'Stk', 1, 'Stück', 0.79, { perishable: true }),
  I('cherrytomaten', 'Cherrytomaten', 'Obst und Gemüse', 'g', 250, '250-g-Schale', 1.49, { perishable: true }),
  I('salat', 'Salatmix, verzehrfertig', 'Obst und Gemüse', 'g', 125, '125-g-Beutel', 1.29, { perishable: true }),
  I('zwiebel', 'Zwiebeln', 'Obst und Gemüse', 'Stk', 8, '1-kg-Netz', 1.29),
  I('knoblauch', 'Knoblauch', 'Obst und Gemüse', 'Zehe', 10, 'Knolle', 0.49),
  I('karotten', 'Karotten', 'Obst und Gemüse', 'g', 1000, '1-kg-Beutel', 0.99),
  I('banane', 'Bananen', 'Obst und Gemüse', 'Stk', 5, 'Bund (ca. 5 Stück)', 1.49, { perishable: true }),
  I('apfel', 'Äpfel', 'Obst und Gemüse', 'Stk', 6, '6er-Beutel', 2.49),
  I('oel', 'Raps- oder Olivenöl', 'Sonstiges', 'EL', 33, '500-ml-Flasche', 2.99, { staple: true }),
  I('essig', 'Essig (z. B. Kräuter- oder Balsamico)', 'Sonstiges', 'EL', 33, '500-ml-Flasche', 1.29, { staple: true }),
  I('gewuerze', 'Gewürze: Salz, Pfeffer, Paprikapulver, Currypulver, Kreuzkümmel, Oregano', 'Sonstiges', 'Pr', 1000, 'Grundvorrat', 0, { staple: true, check: 'Gewürzmischungen: nur Einzelgewürze oder geprüfte Mischungen (Currypaste meiden – oft Erdnüsse).' }),
].map((x) => [x.k, x]));

/* ======================= Rezepte ======================= */
// slots: frueh | mittag | abend | snack · strategy: kochen | convenience | ohne
// Nährwerte je Portion = Schätzung aus Standard-Nährwerttabellen, gerundet.
const R = (o) => ({ servings: 1, equip: [], office: false, prepEvening: false, safety: [], tags: [], ...o });
const SAFE_CHICKEN = 'Hähnchen vollständig durchgaren (innen nicht mehr rosa, Kerntemperatur ≥ 75 °C). Für rohes Geflügel eigenes Brett verwenden, danach Hände waschen.';
const SAFE_LEFTOVER = 'Reste innerhalb von 2 Stunden abkühlen lassen, abgedeckt in den Kühlschrank und innerhalb von 1–2 Tagen essen. Reis besonders zügig kühlen.';
const SAFE_REHEAT = 'Aufwärmen, bis es durchgehend dampfend heiß ist (Mikrowelle: zwischendurch umrühren).';
export const RECIPES = [
  // ---------- Frühstück ----------
  R({ id: 'b_overnight', name: 'Overnight Oats mit Skyr und Beeren', slots: ['frueh', 'snack'], strategy: 'ohne', active: 4, total: 4, prepEvening: true, office: true, equip: ['Schraubglas oder Dose'],
    ing: [['haferflocken', 50], ['skyr', 150], ['milch', 100], ['tk_beeren', 100], ['leinsamen', 1]],
    steps: [{ t: 'Am Vorabend 50 g Haferflocken, 1 EL Leinsamen, 150 g Skyr und 100 ml Milch in ein Schraubglas geben und gut verrühren.' }, { t: '100 g gefrorene Beeren obendrauf geben – sie tauen über Nacht auf.' }, { t: 'Verschlossen in den Kühlschrank stellen. Morgens umrühren und essen oder mit ins Büro nehmen.' }],
    kcal: 430, p: 27, fib: 9, veg: true, prot: true, whole: true, cost: 1.3, tags: ['protein'] }),
  R({ id: 'b_quark_banane', name: 'Quark-Bowl mit Banane und Haferflocken', slots: ['frueh', 'snack'], strategy: 'ohne', active: 3, total: 3, equip: ['Schüssel'],
    ing: [['magerquark', 200], ['milch', 50], ['banane', 1], ['haferflocken', 30]],
    steps: [{ t: '200 g Magerquark mit 50 ml Milch in einer Schüssel cremig rühren.' }, { t: '1 Banane in Scheiben schneiden und darauflegen.' }, { t: '30 g Haferflocken darüberstreuen.' }],
    kcal: 400, p: 33, fib: 5, veg: true, prot: true, whole: true, cost: 1.0, tags: ['protein', 'training'] }),
  R({ id: 'b_eierbrot', name: 'Rührei auf Vollkornbrot mit Tomaten', slots: ['frueh', 'abend'], strategy: 'kochen', active: 8, total: 8, equip: ['Pfanne', 'Herd'],
    ing: [['eier', 2], ['vollkornbrot', 2], ['cherrytomaten', 100], ['oel', 0.5], ['gewuerze', 1]],
    steps: [{ t: '2 Eier in einer Tasse mit einer Prise Salz und Pfeffer verquirlen.' }, { t: '½ EL Öl in einer beschichteten Pfanne bei mittlerer Hitze (Stufe 5–6 von 9) erwärmen.' }, { t: 'Eier hineingeben und mit einem Pfannenwender langsam zusammenschieben, bis sie gerade fest sind (ca. 2–3 Minuten).', timer: 150 }, { t: 'Auf 2 Scheiben Vollkornbrot geben, 100 g Cherrytomaten halbieren und dazu essen.' }],
    kcal: 430, p: 22, fib: 7, veg: true, prot: true, whole: true, cost: 1.1, safety: ['Eier vollständig stocken lassen.'] }),
  R({ id: 'b_huettenbrot', name: 'Vollkornbrot mit Hüttenkäse, Pute und Gurke', slots: ['frueh', 'abend', 'mittag'], strategy: 'ohne', active: 4, total: 4, office: true, equip: ['Messer', 'Brett'],
    ing: [['vollkornbrot', 2], ['huettenkaese', 100], ['putenaufschnitt', 50], ['gurke', 0.5], ['gewuerze', 1]],
    steps: [{ t: '2 Scheiben Vollkornbrot mit je 50 g Hüttenkäse bestreichen.' }, { t: 'Mit 50 g Putenbrust belegen, mit Pfeffer würzen.' }, { t: 'Eine halbe Gurke in Scheiben oder Sticks schneiden und dazu essen.' }],
    kcal: 380, p: 32, fib: 7, veg: true, prot: true, whole: true, cost: 1.6, tags: ['protein'] }),
  R({ id: 'b_skyr_apfel', name: 'Skyr mit Apfel, Haferflocken und Leinsamen', slots: ['frueh', 'snack'], strategy: 'ohne', active: 3, total: 3, office: true, equip: ['Schüssel', 'Messer'],
    ing: [['skyr', 150], ['joghurt', 100], ['apfel', 1], ['haferflocken', 40], ['leinsamen', 1]],
    steps: [{ t: '150 g Skyr und 100 g Joghurt in einer Schüssel verrühren.' }, { t: '1 Apfel mit Schale in kleine Würfel schneiden (Kerngehäuse entfernen) und unterheben.' }, { t: '40 g Haferflocken und 1 EL Leinsamen darüberstreuen.' }],
    kcal: 420, p: 25, fib: 9, veg: true, prot: true, whole: true, cost: 1.1, tags: ['protein'] }),
  R({ id: 'b_knaecke', name: 'Knäckebrot mit Frischkäse, Ei und Paprika', slots: ['frueh', 'mittag', 'snack'], strategy: 'ohne', active: 4, total: 4, office: true, equip: ['Messer'],
    ing: [['knaecke', 3], ['frischkaese', 30], ['eier_gekocht', 2], ['paprika', 0.5]],
    steps: [{ t: '3 Scheiben Knäckebrot dünn mit insgesamt 30 g Frischkäse bestreichen.' }, { t: '2 gekochte Eier schälen, in Scheiben schneiden und darauflegen.' }, { t: 'Eine halbe Paprika in Streifen schneiden und dazu essen.' }],
    kcal: 390, p: 21, fib: 8, veg: true, prot: true, whole: true, cost: 1.3 }),
  // ---------- Mittag (Büro) ----------
  R({ id: 'l_wrap', name: 'Hähnchen-Wrap mit Hummus und Salat', slots: ['mittag', 'abend'], strategy: 'ohne', active: 6, total: 6, office: true, prepEvening: true, equip: ['Messer', 'Brett', 'Frischhaltedose'],
    ing: [['wraps', 2], ['haehnchen_gegart', 100], ['hummus', 40], ['salat', 40], ['paprika', 0.5]],
    steps: [{ t: '2 Wraps nebeneinanderlegen und jeweils mit 20 g Hummus bestreichen.' }, { t: 'Eine halbe Paprika in feine Streifen schneiden.' }, { t: 'Je 20 g Salat, die Paprika und 50 g gegarte Hähnchenstreifen in die Mitte legen.' }, { t: 'Unten einschlagen, seitlich fest aufrollen, halbieren. Für das Büro in Frischhaltefolie oder eine Dose packen und kühl lagern.' }],
    kcal: 560, p: 38, fib: 9, veg: true, prot: true, whole: true, cost: 3.1, tags: ['protein'], safety: ['Bis zum Essen gekühlt lagern (Büro-Kühlschrank).'] }),
  R({ id: 'l_bohnensalat', name: 'Bohnen-Mais-Salat mit Thunfisch', slots: ['mittag', 'abend'], strategy: 'ohne', active: 8, total: 8, office: true, prepEvening: true, servings: 2, equip: ['Sieb', 'Schüssel', 'Dose'],
    ing: [['kidney', 1], ['mais', 1], ['thunfisch', 2], ['gurke', 1], ['paprika', 1], ['oel', 2], ['essig', 2], ['gewuerze', 1]],
    steps: [{ t: '1 Dose Kidneybohnen und 1 Dose Mais in ein Sieb geben und kalt abspülen, abtropfen lassen.' }, { t: '2 Dosen Thunfisch abgießen und mit einer Gabel zerpflücken.' }, { t: '1 Gurke und 1 Paprika in kleine Würfel schneiden.' }, { t: 'Alles in einer Schüssel mit 2 EL Öl, 2 EL Essig, Salz und Pfeffer mischen.' }, { t: 'Die Hälfte in eine Dose für morgen füllen – hält gekühlt 2 Tage.' }],
    kcal: 480, p: 40, fib: 12, veg: true, prot: true, whole: true, cost: 2.4, tags: ['protein'] }),
  R({ id: 'l_suppe', name: 'Linsensuppe aufgepeppt mit Spinat und Brot', slots: ['mittag', 'abend'], strategy: 'convenience', active: 3, total: 7, office: true, equip: ['Mikrowelle oder Topf', 'Schüssel'],
    ing: [['linsensuppe', 400], ['tk_spinat', 100], ['vollkornbrot', 1], ['joghurt', 50]],
    steps: [{ t: '400 g Linsensuppe und 100 g gefrorenen Spinat (2 Portionsstücke) in eine mikrowellengeeignete Schüssel geben.' }, { t: 'Abgedeckt 3 Minuten bei 800 W erhitzen.', timer: 180 }, { t: 'Umrühren und weitere 2 Minuten erhitzen, bis alles durchgehend dampfend heiß ist.', timer: 120 }, { t: 'Mit 50 g Joghurt als Klecks und 1 Scheibe Vollkornbrot essen.' }],
    kcal: 480, p: 26, fib: 15, veg: true, prot: true, whole: true, cost: 2.1, safety: [SAFE_REHEAT] }),
  R({ id: 'l_fertigsalat', name: 'Fertigsalat-Bowl mit Extra-Gemüse', slots: ['mittag', 'abend'], strategy: 'convenience', active: 3, total: 3, office: true, equip: ['Messer'],
    ing: [['fertigsalat', 1], ['cherrytomaten', 100], ['vollkornbrot', 1]],
    steps: [{ t: 'Beim Einkauf eine Salat-Bowl mit Proteinquelle wählen (Kriterien: ≥ 20 g Protein, ≤ 2 g Salz, keine Avocado/Nüsse/Kerne laut Zutatenliste).' }, { t: '100 g Cherrytomaten halbieren und untermischen.' }, { t: 'Dressing nur zur Hälfte verwenden. Mit 1 Scheibe Vollkornbrot essen.' }],
    kcal: 500, p: 26, fib: 7, veg: true, prot: true, whole: true, cost: 4.0, estimated: true }),
  R({ id: 'l_tkpfanne', name: 'TK-Pfannengericht mit Extra-Brokkoli', slots: ['mittag', 'abend'], strategy: 'convenience', active: 4, total: 10, office: true, equip: ['Pfanne und Herd oder Mikrowelle'],
    ing: [['tk_pfanne', 250], ['tk_brokkoli', 150]],
    steps: [{ t: 'Die halbe Packung (250 g) Pfannengericht und 150 g gefrorenen Brokkoli in eine Pfanne geben.' }, { t: 'Bei mittlerer bis hoher Hitze 8–10 Minuten unter gelegentlichem Rühren braten, bis alles heiß ist. Alternativ Mikrowelle: abgedeckt 4 Min. bei 800 W, umrühren, weitere 3 Min.', timer: 540 }, { t: 'Die zweite Hälfte der Packung zurück ins Gefrierfach legen (Beutel gut verschließen).' }],
    kcal: 450, p: 25, fib: 8, veg: true, prot: true, whole: false, cost: 2.0, estimated: true, safety: [SAFE_REHEAT] }),
  R({ id: 'l_kichererbsen', name: 'Kichererbsen-Salat mit Feta und Ei', slots: ['mittag', 'abend'], strategy: 'ohne', active: 7, total: 7, office: true, prepEvening: true, equip: ['Sieb', 'Schüssel'],
    ing: [['kichererbsen', 0.5], ['feta', 50], ['eier_gekocht', 2], ['gurke', 0.5], ['cherrytomaten', 100], ['oel', 1], ['essig', 1], ['gewuerze', 1]],
    steps: [{ t: 'Eine halbe Dose Kichererbsen abgießen und abspülen (Rest abgedeckt im Kühlschrank 2 Tage haltbar).' }, { t: 'Eine halbe Gurke würfeln, 100 g Cherrytomaten halbieren, 50 g Feta zerbröseln.' }, { t: '2 gekochte Eier schälen und vierteln.' }, { t: 'Alles mit 1 EL Öl, 1 EL Essig, Salz, Pfeffer und etwas Oregano mischen.' }],
    kcal: 540, p: 32, fib: 10, veg: true, prot: true, whole: true, cost: 2.3, tags: ['protein'] }),
  // ---------- Abend: kochen (2 Portionen → Rest am nächsten Mittag) ----------
  R({ id: 'd_haehnchenreis', name: 'Hähnchen-Gemüse-Reis-Pfanne', slots: ['abend', 'mittag'], strategy: 'kochen', servings: 2, active: 15, total: 18, equip: ['Große Pfanne', 'Herd', 'Brett', 'Messer'],
    ing: [['haehnchenbrust', 300], ['tk_gemuese', 400], ['reis_express', 250], ['sojasauce', 2], ['oel', 1], ['gewuerze', 1]],
    steps: [{ t: '300 g Hähnchenbrust auf einem eigenen Brett in mundgerechte Würfel schneiden.' }, { t: '1 EL Öl in einer großen Pfanne bei hoher Hitze (Stufe 7–8 von 9) erhitzen.' }, { t: 'Hähnchen darin 5–6 Minuten rundum anbraten, bis es innen nicht mehr rosa ist.', timer: 330 }, { t: '400 g gefrorenes Gemüse dazugeben und 5 Minuten mitbraten.', timer: 300 }, { t: '250 g Express-Reis (Beutel vorher durchkneten) und 2 EL Sojasauce dazugeben, 2–3 Minuten unter Rühren erhitzen. Mit Pfeffer und Paprikapulver abschmecken.', timer: 150 }, { t: 'Die Hälfte für morgen Mittag in eine Dose füllen.' }],
    kcal: 560, p: 45, fib: 8, veg: true, prot: true, whole: true, cost: 3.0, tags: ['protein', 'training'], safety: [SAFE_CHICKEN, SAFE_LEFTOVER] }),
  R({ id: 'd_lachs', name: 'Ofenlachs mit Kartoffeln und Brokkoli', slots: ['abend'], strategy: 'kochen', servings: 2, active: 10, total: 35, equip: ['Backofen', 'Backblech', 'Backpapier'],
    ing: [['lachs_tk', 2], ['kartoffeln', 500], ['tk_brokkoli', 300], ['oel', 1], ['gewuerze', 1]],
    steps: [{ t: 'Backofen auf 200 °C Ober-/Unterhitze (180 °C Umluft) vorheizen. Blech mit Backpapier belegen.' }, { t: '500 g Kartoffeln waschen, mit Schale vierteln, mit 1 EL Öl, Salz und Paprikapulver auf dem Blech mischen.' }, { t: 'Kartoffeln 15 Minuten backen.', timer: 900 }, { t: '2 gefrorene Lachsfilets und 300 g gefrorenen Brokkoli dazulegen, salzen und pfeffern.' }, { t: 'Weitere 18–20 Minuten backen, bis der Lachs innen nicht mehr glasig ist und sich leicht zerteilen lässt.', timer: 1140 }, { t: 'Eine Portion für morgen in eine Dose geben.' }],
    kcal: 580, p: 34, fib: 9, veg: true, prot: true, whole: false, cost: 3.6, tags: ['protein'], safety: ['Fisch vollständig garen.', SAFE_LEFTOVER] }),
  R({ id: 'd_chili', name: 'Schnelles Chili con Carne', slots: ['abend', 'mittag'], strategy: 'kochen', servings: 2, active: 12, total: 25, equip: ['Topf', 'Herd', 'Brett'],
    ing: [['rinderhack', 300], ['zwiebel', 1], ['kidney', 1], ['mais', 1], ['tomaten_dose', 400], ['oel', 1], ['gewuerze', 1]],
    steps: [{ t: '1 Zwiebel schälen und fein würfeln. Kidneybohnen und Mais abgießen und abspülen.' }, { t: '1 EL Öl im Topf bei hoher Hitze erhitzen, 300 g Hackfleisch darin 5 Minuten krümelig braten, bis es nicht mehr rosa ist.', timer: 300 }, { t: 'Zwiebel dazugeben und 2 Minuten mitbraten.', timer: 120 }, { t: '400 g gehackte Tomaten, Bohnen und Mais dazugeben. Mit 1 TL Paprikapulver, 1 TL Kreuzkümmel, Salz, Pfeffer und nach Geschmack Chili würzen.' }, { t: 'Bei kleiner Hitze 10 Minuten köcheln lassen, gelegentlich umrühren.', timer: 600 }, { t: 'Die Hälfte für morgen abfüllen. Im Büro in der Mikrowelle durchgehend heiß machen.' }],
    kcal: 520, p: 42, fib: 14, veg: true, prot: true, whole: true, cost: 3.4, tags: ['protein', 'training'], safety: ['Hackfleisch vollständig durchgaren.', SAFE_LEFTOVER] }),
  R({ id: 'd_nudeln', name: 'Vollkornnudeln mit Tomaten-Thunfisch-Sauce und Spinat', slots: ['abend', 'mittag'], strategy: 'kochen', servings: 2, active: 12, total: 20, equip: ['Topf', 'Pfanne oder zweiter Topf', 'Herd', 'Sieb'],
    ing: [['nudeln', 200], ['passierte_tomaten', 500], ['thunfisch', 2], ['tk_spinat', 200], ['zwiebel', 1], ['knoblauch', 1], ['oel', 1], ['gewuerze', 1]],
    steps: [{ t: 'Reichlich Wasser mit Salz in einem Topf zum Kochen bringen. 200 g Vollkornnudeln nach Packungsangabe kochen (meist 10–12 Minuten).', timer: 660 }, { t: 'Inzwischen 1 Zwiebel und 1 Knoblauchzehe fein würfeln und in 1 EL Öl bei mittlerer Hitze 3 Minuten anschwitzen.', timer: 180 }, { t: '500 g passierte Tomaten und 200 g gefrorenen Spinat dazugeben, 6 Minuten köcheln lassen.', timer: 360 }, { t: '2 Dosen Thunfisch abgießen, unterrühren, mit Salz, Pfeffer und Oregano abschmecken.' }, { t: 'Nudeln abgießen und mit der Sauce mischen. Die Hälfte für morgen abfüllen.' }],
    kcal: 590, p: 42, fib: 11, veg: true, prot: true, whole: true, cost: 2.8, tags: ['protein'], safety: [SAFE_LEFTOVER] }),
  R({ id: 'd_linsencurry', name: 'Linsen-Spinat-Curry mit Reis', slots: ['abend', 'mittag'], strategy: 'kochen', servings: 2, active: 10, total: 20, equip: ['Topf', 'Herd'],
    ing: [['linsen', 1], ['tomaten_dose', 400], ['tk_spinat', 200], ['zwiebel', 1], ['reis_express', 250], ['joghurt', 150], ['oel', 1], ['gewuerze', 1]],
    steps: [{ t: '1 Zwiebel würfeln und in 1 EL Öl bei mittlerer Hitze 3 Minuten anschwitzen.', timer: 180 }, { t: '2 TL Currypulver (Pulver, keine Paste) und ½ TL Kreuzkümmel 30 Sekunden mitrösten.' }, { t: '400 g gehackte Tomaten, die abgespülten Linsen und 200 g gefrorenen Spinat dazugeben. 10 Minuten köcheln lassen.', timer: 600 }, { t: 'Express-Reis nach Packungsangabe erhitzen (Mikrowelle ca. 2 Minuten).', timer: 120 }, { t: 'Curry mit Salz abschmecken, mit je 75 g Joghurt servieren. Hälfte für morgen abfüllen.' }],
    kcal: 520, p: 24, fib: 15, veg: true, prot: true, whole: true, cost: 2.2, safety: [SAFE_LEFTOVER, 'Fertige Currypasten enthalten oft Erdnüsse – nur Currypulver verwenden.'] }),
  R({ id: 'd_blech', name: 'Blech-Hähnchen mit Kartoffeln und Paprika', slots: ['abend', 'mittag'], strategy: 'kochen', servings: 2, active: 12, total: 40, equip: ['Backofen', 'Backblech', 'Brett'],
    ing: [['haehnchenbrust', 300], ['kartoffeln', 600], ['paprika', 2], ['zwiebel', 1], ['oel', 2], ['gewuerze', 1], ['joghurt', 100]],
    steps: [{ t: 'Backofen auf 200 °C Ober-/Unterhitze (180 °C Umluft) vorheizen.' }, { t: '600 g Kartoffeln mit Schale in 2-cm-Würfel, 2 Paprika in Streifen, 1 Zwiebel in Spalten schneiden. Mit 1 EL Öl, Salz und Paprikapulver auf dem Blech mischen.' }, { t: '20 Minuten backen.', timer: 1200 }, { t: 'Inzwischen 300 g Hähnchenbrust (eigenes Brett) in Streifen schneiden, mit 1 EL Öl, Salz, Pfeffer und Paprikapulver mischen.' }, { t: 'Hähnchen auf das Blech geben und weitere 15–18 Minuten backen, bis es innen nicht mehr rosa ist.', timer: 1020 }, { t: 'Mit Joghurt als Dip servieren. Hälfte für morgen abfüllen.' }],
    kcal: 560, p: 42, fib: 8, veg: true, prot: true, whole: false, cost: 3.6, tags: ['protein', 'training'], safety: [SAFE_CHICKEN, SAFE_LEFTOVER] }),
  R({ id: 'd_omelett', name: 'Spinat-Feta-Omelett mit Vollkornbrot', slots: ['abend', 'frueh'], strategy: 'kochen', active: 10, total: 10, equip: ['Pfanne', 'Herd'],
    ing: [['eier', 3], ['tk_spinat', 100], ['feta', 30], ['cherrytomaten', 100], ['vollkornbrot', 1], ['oel', 0.5], ['gewuerze', 1]],
    steps: [{ t: '100 g gefrorenen Spinat in der Pfanne mit ½ EL Öl bei mittlerer Hitze 3 Minuten auftauen lassen, bis die Flüssigkeit verdampft ist.', timer: 180 }, { t: '3 Eier mit Salz und Pfeffer verquirlen und über den Spinat gießen.' }, { t: '30 g Feta darüberbröseln. Deckel auflegen und bei kleiner bis mittlerer Hitze 4–5 Minuten stocken lassen.', timer: 270 }, { t: 'Mit 100 g Cherrytomaten und 1 Scheibe Vollkornbrot essen.' }],
    kcal: 480, p: 31, fib: 7, veg: true, prot: true, whole: true, cost: 1.8, tags: ['protein'], safety: ['Eier vollständig stocken lassen.'] }),
  R({ id: 'd_pellkartoffeln', name: 'Pellkartoffeln mit Kräuterquark und Gurke', slots: ['abend'], strategy: 'kochen', active: 6, total: 25, equip: ['Topf', 'Herd'],
    ing: [['kartoffeln', 400], ['magerquark', 200], ['milch', 50], ['tk_kraeuter', 2], ['gurke', 0.5], ['gewuerze', 1]],
    steps: [{ t: '400 g Kartoffeln waschen, mit Schale in einen Topf geben, mit Wasser bedecken und zum Kochen bringen.' }, { t: 'Bei mittlerer Hitze 20 Minuten kochen, bis eine Gabel leicht hineingleitet.', timer: 1200 }, { t: 'Inzwischen 200 g Magerquark mit 50 ml Milch, 2 EL TK-Kräutern, Salz und Pfeffer verrühren.' }, { t: 'Eine halbe Gurke in Scheiben schneiden. Kartoffeln abgießen und mit Quark und Gurke essen.' }],
    kcal: 470, p: 33, fib: 8, veg: true, prot: true, whole: false, cost: 1.4, tags: ['protein', 'leicht'] }),
  R({ id: 'd_ofenwrap', name: 'Ofen-Wraps mit Bohnen, Mais, Hähnchen und Käse', slots: ['abend'], strategy: 'kochen', active: 8, total: 16, equip: ['Backofen', 'Backblech'],
    ing: [['wraps', 2], ['kidney', 0.5], ['mais', 0.5], ['haehnchen_gegart', 100], ['reibekaese', 40], ['salat', 40]],
    steps: [{ t: 'Backofen auf 200 °C Ober-/Unterhitze vorheizen.' }, { t: 'Eine halbe Dose Kidneybohnen und eine halbe Dose Mais abgießen und abspülen (Reste abgedeckt kühlen).' }, { t: 'Bohnen, Mais und 100 g Hähnchenstreifen auf 2 Wraps verteilen, mit 40 g Reibekäse bestreuen, zusammenklappen.' }, { t: 'Auf dem Blech 8 Minuten backen, bis der Käse geschmolzen ist.', timer: 480 }, { t: 'Mit 40 g Salat servieren.' }],
    kcal: 680, p: 50, fib: 14, veg: true, prot: true, whole: true, cost: 3.2, tags: ['protein', 'training'] }),
  // ---------- Abend: Convenience / ohne Kochen ----------
  R({ id: 'd_pizza', name: 'Halbe TK-Pizza mit großem Salat', slots: ['abend'], strategy: 'convenience', active: 5, total: 18, equip: ['Backofen'],
    ing: [['tk_pizza', 0.5], ['salat', 125], ['cherrytomaten', 100], ['huettenkaese', 100], ['oel', 1], ['essig', 1]],
    steps: [{ t: 'Backofen nach Packungsangabe vorheizen (meist 220 °C) und die Pizza laut Packung backen (ca. 12–15 Minuten).', timer: 780 }, { t: 'Inzwischen 125 g Salat, 100 g halbierte Cherrytomaten und 100 g Hüttenkäse mit 1 EL Öl und 1 EL Essig anmachen.' }, { t: 'Die Hälfte der Pizza mit dem Salat essen, die andere Hälfte abgekühlt in Folie in den Kühlschrank (morgen kalt oder aufgebacken).' }],
    kcal: 560, p: 26, fib: 6, veg: true, prot: true, whole: false, cost: 2.8, estimated: true, tags: ['genuss'] }),
  R({ id: 'd_abendbrot', name: 'Proteinreiches Abendbrot mit Rohkost', slots: ['abend', 'mittag'], strategy: 'ohne', active: 5, total: 5, office: true, equip: ['Messer', 'Brett'],
    ing: [['vollkornbrot', 2], ['putenaufschnitt', 50], ['mozzarella', 60], ['cherrytomaten', 100], ['karotten', 100], ['gewuerze', 1]],
    steps: [{ t: '2 Scheiben Vollkornbrot mit 50 g Putenbrust und 60 g Mozzarella in Scheiben belegen.' }, { t: '100 g Cherrytomaten und 100 g Karotten (geschält, in Sticks) dazu essen.' }],
    kcal: 450, p: 32, fib: 10, veg: true, prot: true, whole: true, cost: 1.9, tags: ['leicht'] }),
  // ---------- Snacks ----------
  R({ id: 's_skyr', name: 'Skyr mit Beeren', slots: ['snack'], strategy: 'ohne', active: 2, total: 2, office: true, ing: [['skyr', 150], ['tk_beeren', 80]],
    steps: [{ t: '80 g gefrorene Beeren morgens in eine Dose geben – bis zum Nachmittag sind sie aufgetaut.' }, { t: 'Mit 150 g Skyr verrühren.' }], kcal: 180, p: 17, fib: 3, veg: true, prot: true, whole: false, cost: 0.9, tags: ['protein', 'training'] }),
  R({ id: 's_huetten', name: 'Hüttenkäse mit Gurke', slots: ['snack'], strategy: 'ohne', active: 2, total: 2, office: true, ing: [['huettenkaese', 200], ['gurke', 0.5], ['gewuerze', 1]],
    steps: [{ t: 'Eine halbe Gurke würfeln, unter 200 g Hüttenkäse mischen, mit Pfeffer würzen.' }], kcal: 200, p: 24, fib: 1, veg: true, prot: true, whole: false, cost: 1.4, tags: ['protein'] }),
  R({ id: 's_knaecke_hummus', name: 'Knäckebrot mit Hummus und Karotten', slots: ['snack'], strategy: 'ohne', active: 3, total: 3, office: true, ing: [['knaecke', 2], ['hummus', 40], ['karotten', 100]],
    steps: [{ t: '2 Scheiben Knäckebrot mit 40 g Hummus bestreichen, dazu 100 g Karottensticks.' }], kcal: 240, p: 8, fib: 8, veg: true, prot: false, whole: true, cost: 0.6 }),
  R({ id: 's_banane_milch', name: 'Banane und ein Glas Milch (nach dem Training)', slots: ['snack'], strategy: 'ohne', active: 1, total: 1, ing: [['banane', 1], ['milch', 300]],
    steps: [{ t: '1 Banane essen und 300 ml Milch trinken – gut innerhalb von 1–2 Stunden nach dem Training.' }], kcal: 250, p: 11, fib: 3, veg: true, prot: true, whole: false, cost: 0.6, tags: ['training'] }),
];
export const RECIPE = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const SLOT_LABEL = { frueh: 'Frühstück', mittag: 'Mittag', abend: 'Abend', snack: 'Snack' };
export const STRATEGY_LABEL = { kochen: 'Einfach kochen', convenience: 'Convenience', ohne: 'Ohne Kochen', bestellen: 'Bestellen', restaurant: 'Restaurant', ki: 'KI-Vorschlag', eigen: 'Eigenes Gericht' };

export function recipeText(r) {
  return [r.name, ...(r.ing || []).map(([k]) => INGREDIENTS[k]?.name || k)].join(' ');
}
export function recipeLabelChecks(r) {
  return [...new Set((r.ing || []).map(([k]) => INGREDIENTS[k]?.check).filter(Boolean))];
}
export function fmtQty(k, qty) {
  const ing = INGREDIENTS[k]; if (!ing) return String(qty);
  const q = Math.round(qty * 100) / 100;
  const f = q === 0.5 ? '½' : q === 0.25 ? '¼' : q === 1.5 ? '1½' : L.fmtNum(q, q % 1 ? 1 : 0);
  const u = ing.unit === 'Stk' ? '' : ing.unit === 'Pr' ? '' : ` ${ing.unit}`;
  return ing.unit === 'Pr' ? 'nach Geschmack' : `${f}${u}`;
}

/* ======================= Ernährungsziele (Schätzung) ======================= */
export function nutritionTargets(profile, goals = {}, weight) {
  const w = L.parseNum(weight ?? profile.weight); const h = L.parseNum(profile.height); const a = L.parseNum(profile.age);
  if (!w || !h || !a) return null;
  const bmr = 10 * w + 6.25 * h - 5 * a + (profile.sex === 'weiblich' ? -161 : 5); // Mifflin-St Jeor
  const pal = 1.5; // überwiegend sitzend + Training/Alltagsbewegung
  const tdee = bmr * pal;
  const reduce = /moderat/.test(goals.weightMode || '') ? 400 : 0;
  const kcal = Math.round((tdee - reduce) / 50) * 50;
  return {
    kcal, kcalMaintain: Math.round(tdee / 50) * 50, protein: Math.round(w * 1.4), fiber: 30, vegPortions: 5,
    note: `Schätzung: Grundumsatz ${L.fmtNum(bmr)} kcal (Mifflin-St-Jeor) × Aktivitätsfaktor ${L.fmtNum(pal, 1)}${reduce ? ` − ${reduce} kcal für moderate Gewichtsabnahme` : ''}. Protein 1,4 g/kg zum Muskelerhalt bei Training, Ballaststoffe ≥ 30 g (DGE).`,
  };
}

/* ======================= Speiseplan ======================= */
function seeded(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function ratingScore(rt) {
  if (!rt) return 0;
  let s = 0;
  if (rt.never) return -99;
  s += (rt.liked || 0) * 1.5 + (rt.again || 0) * 2 + (rt.easy || 0) * 0.5 + (rt.full || 0) * 0.5 - (rt.tooMuch || 0) * 2 - (rt.disliked || 0) * 3;
  s += Math.min(2, (rt.eaten || 0) * 0.3) - Math.min(2, (rt.skipped || 0) * 0.5);
  return s;
}
function blocked(r, profile) {
  const extra = String(profile?.dislikesExtra || '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const txt = recipeText(r).toLowerCase();
  return allergenHits(txt).length > 0 || extra.some((x) => x.length > 2 && txt.includes(x));
}
const COOK_PER_WEEK = { kaum: 1, '1–2× pro Woche': 2, '3–4× pro Woche': 4, 'fast täglich': 6 };

// setup: { weekStart, officeDays:[wd], cookDays: n, restaurantDays:[date], orderDays:[date], trainingDays:[date], pantry:[k], ratings, recent:[recipeId] }
export function planMeals(setup, profile = {}, goals = {}) {
  const days = L.range(setup.weekStart, 7);
  const rnd = seeded(setup.weekStart + (setup.variant || ''));
  const ratings = setup.ratings || {};
  const usable = RECIPES.filter((r) => !blocked(r, profile));
  const items = [];
  const usedCount = {};
  (setup.recent || []).forEach((id) => { usedCount[id] = (usedCount[id] || 0) + 0.5; });
  const weekIng = new Set();
  let cooks = setup.cookDays ?? COOK_PER_WEEK[profile.cookWilling] ?? 2;
  const tgt = nutritionTargets(profile, goals) || { kcal: 2200, protein: 110 };
  const pick = (slot, filter, ctx = {}) => {
    const cands = usable.filter((r) => r.slots.includes(slot) && filter(r));
    if (!cands.length) return null;
    let best = null; let bestS = -Infinity;
    for (const r of cands) {
      let s = ratingScore(ratings[r.id]);
      if (s <= -50) continue;
      s -= (usedCount[r.id] || 0) * 2.5;
      const perish = r.ing.filter(([k]) => INGREDIENTS[k]?.perishable).map(([k]) => k);
      s += perish.filter((k) => weekIng.has(k)).length * 0.8; // Zutaten wiederverwenden
      if (ctx.training && (r.tags.includes('training') || r.p >= 35)) s += 1.5;
      if (ctx.light && r.tags.includes('leicht')) s += 1;
      if (r.active <= 5) s += 0.3;
      if (ratings[r.id]?.tooMuch && r.active > 10) s -= 2;
      s += rnd() * 1.2;
      if (s > bestS) { bestS = s; best = r; }
    }
    if (best) { usedCount[best.id] = (usedCount[best.id] || 0) + 1; best.ing.forEach(([k]) => weekIng.add(k)); }
    return best;
  };
  const mk = (date, slot, r, extra = {}) => items.push({
    id: `meal-${date}-${slot}`, week: setup.weekStart, date, area: 'essen', kind: 'meal', slot,
    recipeId: r ? r.id : null, portions: 1, status: null, ...extra,
  });
  let leftover = null; // {recipeId, from}
  for (const date of days) {
    const wd = L.weekday(date);
    const office = (setup.officeDays || [1, 2, 3, 4, 5]).map(Number).includes(wd);
    const training = (setup.trainingDays || []).includes(date);
    const restaurant = (setup.restaurantDays || []).includes(date);
    const order = (setup.orderDays || []).includes(date);
    // Frühstück
    const fr = pick('frueh', (r) => (office ? r.active <= 5 || r.prepEvening : true));
    mk(date, 'frueh', fr);
    // Mittag
    if (leftover && office) { mk(date, 'mittag', RECIPE[leftover.recipeId], { leftoverFrom: leftover.from }); leftover = null; } else {
      leftover = null;
      const mi = pick('mittag', (r) => (office ? r.office && r.servings === 1 : r.servings === 1 || r.strategy !== 'kochen'));
      mk(date, 'mittag', mi);
    }
    // Abend
    if (restaurant) mk(date, 'abend', null, { placeholder: 'restaurant' });
    else if (order) mk(date, 'abend', null, { placeholder: 'bestellen' });
    else {
      const nextOffice = (setup.officeDays || [1, 2, 3, 4, 5]).map(Number).includes(L.weekday(L.addDays(date, 1))) && date !== days[6];
      const canCook = cooks > 0 && !(setup.busyDays || []).includes(date);
      let ab = null;
      if (canCook) ab = pick('abend', (r) => r.strategy === 'kochen' && (nextOffice ? r.servings === 2 && r.slots.includes('mittag') : true), { training });
      if (ab) { cooks--; if (ab.servings === 2 && nextOffice) leftover = { recipeId: ab.id, from: date }; }
      else ab = pick('abend', (r) => r.strategy !== 'kochen' || r.active <= 10, { training, light: false });
      mk(date, 'abend', ab, ab && ab.servings === 2 && !leftover ? { note: 'Ergibt 2 Portionen – die zweite einfrieren oder am Folgetag essen.' } : {});
    }
    // Snack: an Trainingstagen und wenn das Tagesziel deutlich unterschritten wird
    const dayItems = items.filter((i) => i.date === date && i.recipeId);
    const kcalDay = dayItems.reduce((a, i) => a + (RECIPE[i.recipeId]?.kcal || 0), 0) + (restaurant || order ? 750 : 0);
    if (training || kcalDay < tgt.kcal - 350) {
      const sn = pick('snack', (r) => r.slots.includes('snack') && !dayItems.some((i) => i.recipeId === r.id), { training });
      if (sn) mk(date, 'snack', sn);
    }
    // Portionen anpassen, wenn das Ziel noch deutlich verfehlt wird
    const all = items.filter((i) => i.date === date && i.recipeId);
    const total = all.reduce((a, i) => a + (RECIPE[i.recipeId]?.kcal || 0), 0) + (restaurant || order ? 750 : 0);
    if (total < tgt.kcal - 300) {
      const f = Math.min(1.5, Math.round(((tgt.kcal - 150) / total) * 4) / 4);
      for (const i of all.filter((x) => x.slot === 'mittag' || x.slot === 'abend')) if (!i.leftoverFrom && !RECIPE[i.recipeId]?.tags.includes('genuss')) i.portions = Math.max(1, f);
    }
  }
  return items;
}

export function mealNutrition(item, customs = {}) {
  const r = item.recipeId ? RECIPE[item.recipeId] : item.custom || customs[item.customId];
  if (!r) return null;
  const f = item.portions || 1;
  return { kcal: Math.round((r.kcal || 0) * f), p: Math.round((r.p || 0) * f), fib: Math.round((r.fib || 0) * f), veg: !!r.veg, prot: !!r.prot, whole: !!r.whole, estimated: true };
}

/* ======================= Einkaufsliste ======================= */
// items: Speiseplan-Einträge; pantry: { k: true } vorhanden; extras: [{name, sec}]
export function shoppingList(items, { pantry = {}, fromDate = null, extras = [] } = {}) {
  const need = {}; const uses = {}; const first = {};
  for (const it of items) {
    if (fromDate && it.date < fromDate) continue;
    if (it.status === 'gegessen' || it.status === 'ausgelassen') continue;
    if (!it.recipeId || it.leftoverFrom) continue;
    const r = RECIPE[it.recipeId]; if (!r) continue;
    const f = (it.portions || 1);
    for (const [k, q] of r.ing) {
      need[k] = (need[k] || 0) + q * f;
      if (!first[k] || it.date < first[k]) first[k] = it.date;
      (uses[k] ||= []).push(`${L.WD_SHORT[L.weekday(it.date)]} ${r.name}`);
    }
  }
  const rows = [];
  for (const [k, qty] of Object.entries(need)) {
    const ing = INGREDIENTS[k];
    if (!ing) continue;
    const packs = ing.pack ? Math.max(1, Math.ceil(qty / ing.pack - 0.02)) : 1;
    rows.push({
      k, name: ing.name, sec: ing.sec, qty, unit: ing.unit, packs, packLabel: ing.packLabel, cost: Math.round(packs * ing.price * 100) / 100,
      staple: !!ing.staple, inPantry: !!pantry[k], check: ing.check || null, uses: [...new Set(uses[k])], firstDate: first[k], perishable: !!ing.perishable,
    });
  }
  for (const e of extras) rows.push({ k: `x-${e.name}`, name: e.name, sec: e.sec || 'Sonstiges', extra: true, packs: 1, cost: 0, uses: [] });
  rows.sort((a, b) => SECTIONS.indexOf(a.sec) - SECTIONS.indexOf(b.sec) || a.name.localeCompare(b.name, 'de'));
  const toBuy = rows.filter((r) => !r.inPantry && !(r.staple && pantry[r.k] !== false));
  return { rows, toBuy, cost: Math.round(toBuy.reduce((a, r) => a + (r.cost || 0), 0) * 100) / 100 };
}

/* ======================= Assistent ohne KI ======================= */
export function suggest({ situation, slot = 'abend', minutes = null, have = [], profile = {}, ratings = {}, exclude = [] }) {
  let list = RECIPES.filter((r) => !blocked(r, profile) && !exclude.includes(r.id) && ratingScore(ratings[r.id]) > -50);
  const bySlot = (s) => list.filter((r) => r.slots.includes(s));
  let out = [];
  switch (situation) {
    case 'keinKochen': out = bySlot(slot).filter((r) => r.strategy !== 'kochen' || r.active <= 5); break;
    case 'zeit': out = bySlot(slot).filter((r) => r.active <= (minutes || 10)).sort((a, b) => a.active - b.active); break;
    case 'training': out = list.filter((r) => (r.slots.includes(slot) || r.slots.includes('snack')) && (r.tags.includes('training') || r.p >= 30)).sort((a, b) => b.p - a.p); break;
    case 'vielGegessen': out = bySlot(slot).filter((r) => r.kcal <= 480 && r.veg && r.prot).sort((a, b) => a.kcal - b.kcal); break;
    case 'vorrat': {
      const hv = have.map((h) => h.toLowerCase());
      const match = (k) => { const n = (INGREDIENTS[k]?.name || k).toLowerCase(); return hv.some((h) => h.length > 2 && (n.includes(h) || k.includes(h))); };
      out = list.map((r) => {
        const core = r.ing.filter(([k]) => !INGREDIENTS[k]?.staple);
        const hit = core.filter(([k]) => match(k)).length;
        return { r, hit, share: core.length ? hit / core.length : 0 };
      }).filter((x) => x.hit > 0).sort((a, b) => b.share - a.share || b.hit - a.hit).map((x) => ({ ...x.r, _match: Math.round(x.share * 100) }));
      break;
    }
    default: out = bySlot(slot);
  }
  return out.sort((a, b) => ratingScore(ratings[b.id]) - ratingScore(ratings[a.id])).slice(0, 5);
}

export const ORDER_TIPS = {
  Pizza: ['Dünner Boden, Belag mit Gemüse plus Hähnchen, Thunfisch oder Schinken.', 'Pizza teilen oder Hälfte für morgen aufheben; dazu Salat bestellen.', 'Pesto-Pizza meiden (Pinienkerne/Cashews).'],
  Döner: ['Dürüm oder Döner mit viel Salat, Joghurtsauce statt Cocktailsauce.', 'Alternativ Dönerteller mit Salat statt Pommes.', 'Saucen: Zusammensetzung erfragen.'],
  Asiatisch: ['Erdnüsse und Erdnussöl sind häufig – bei der Bestellung ausdrücklich Erdnussallergie angeben.', 'Gerichte mit Satay, Erdnusssauce, Cashew-Hähnchen meiden.', 'Gedämpftes oder gebratenes Gemüse mit Hähnchen/Tofu und Reis; Sauce extra.'],
  Sushi: ['Viele Rollen (California, Inside-Out) enthalten Avocado – explizit ohne Avocado bestellen oder Nigiri/Maki mit Lachs/Thunfisch/Gurke wählen.', 'Dazu Edamame oder Misosuppe.', 'Sojasauce sparsam (Salz).'],
  Indisch: ['Korma, Tikka Masala und viele Saucen enthalten Cashews oder Mandeln – nachfragen.', 'Tandoori-Hähnchen, Dal und Raita sind oft gute Optionen.', 'Naan in Maßen, lieber Reis und Gemüse.'],
  Burger: ['Ein Burger mit Salat statt Pommes oder kleine Pommes teilen.', 'Hähnchen- oder Rindfleisch-Patty, Extra-Gemüse.', 'Saucen und Bun-Zutaten erfragen (manche Buns mit Kernen).'],
  Italienisch: ['Pasta mit Tomatensauce, Meeresfrüchten oder Hähnchen; Sahnesaucen seltener.', 'Pesto-Gerichte meiden.', 'Vorspeisensalat statt Brotkorb.'],
};
export const RESTAURANT_TIPS = [
  'Allergie beim Bestellen immer aktiv ansprechen: „Ich habe eine Erdnuss- und Avocadoallergie – bitte auch Öl und Saucen prüfen.“',
  'Notfallset dabeihaben.',
  'Ein Gericht mit Proteinquelle und Gemüse wählen; Beilage Kartoffeln/Reis statt Frittiertem, wenn es passt.',
  'Alkohol: vorher festlegen, wie viel (z. B. ein Getränk), und zwischendurch Wasser bestellen.',
  'Am Rest des Tages normal essen – kein „Vorhungern“ und kein Ausgleichsfasten.',
];

/* Speisekartentext ohne KI analysieren */
const POS = [/gegrillt|grill|gedämpft|gedünstet|ofen|gebacken|salat|gemüse|hähnchen|pute|fisch|lachs|thunfisch|forelle|linsen|bohnen|kichererbsen|vollkorn|tomaten/i];
const NEG = [/frittiert|paniert|backteig|pommes|sahne|käsesoße|käsesauce|carbonara|creme|gratin|cordon|schnitzel|nuggets|bacon|speck|doppelt|xxl|mayo/i];
export function analyzeMenu(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 3).slice(0, 200);
  return lines.map((l) => {
    const hits = allergenHits(l); const caution = cautionHits(l);
    let score = 0; POS.forEach((r) => { score += (l.match(new RegExp(r, 'gi')) || []).length; }); NEG.forEach((r) => { score -= (l.match(new RegExp(r, 'gi')) || []).length * 1.5; });
    return { line: l, hits, caution, score, ok: !hits.length };
  }).sort((a, b) => (b.ok - a.ok) || b.score - a.score);
}

/* Open Food Facts: Bewertung eines Produkts */
export function evaluateProduct(p, profile = {}) {
  const n = p.nutriments || {};
  const v = (k) => (n[`${k}_100g`] !== undefined ? Number(n[`${k}_100g`]) : null);
  const text = [p.product_name, p.ingredients_text_de, p.ingredients_text].filter(Boolean).join(' ');
  const tags = [...(p.allergens_tags || [])].join(' ');
  const traces = [...(p.traces_tags || [])].join(' ');
  const issues = []; const good = [];
  const contains = allergenHits(text);
  if (/peanuts/.test(tags) || contains.some((x) => /erdn/i.test(x))) issues.push({ level: 'stop', text: 'Enthält laut Datenbank Erdnüsse – nicht geeignet.' });
  if (/avocado/i.test(text)) issues.push({ level: 'stop', text: 'Enthält laut Zutatenliste Avocado – nicht geeignet.' });
  if (/\bnuts\b|en:nuts/.test(tags) || contains.some((x) => !/erdn/i.test(x) && !/avocado/i.test(x))) issues.push({ level: 'warn', text: 'Enthält Nüsse (Abneigung).' });
  if (/peanuts/.test(traces)) issues.push({ level: profile.tracesOk ? 'info' : 'warn', text: `Kann Spuren von Erdnüssen enthalten${profile.tracesOk ? ' – laut deinem Profil für dich in Ordnung' : ''}.` });
  if (!text) issues.push({ level: 'warn', text: 'Keine Zutatenliste in der Datenbank – Allergene unbekannt.' });
  const prot = v('proteins'), sugar = v('sugars'), salt = v('salt'), sat = v('saturated-fat'), fib = v('fiber'), kcal = v('energy-kcal');
  if (prot !== null && prot >= 10) good.push(`Proteinreich (${L.fmtNum(prot, 1)} g/100 g)`);
  if (fib !== null && fib >= 6) good.push(`Ballaststoffreich (${L.fmtNum(fib, 1)} g/100 g)`);
  if (sugar !== null && sugar > 12.5) issues.push({ level: 'info', text: `Viel Zucker (${L.fmtNum(sugar, 1)} g/100 g).` });
  if (salt !== null && salt > 1.5) issues.push({ level: 'info', text: `Viel Salz (${L.fmtNum(salt, 1)} g/100 g).` });
  if (sat !== null && sat > 5) issues.push({ level: 'info', text: `Viele gesättigte Fettsäuren (${L.fmtNum(sat, 1)} g/100 g).` });
  return { name: p.product_name || 'Unbekanntes Produkt', brand: p.brands || '', kcal, prot, sugar, salt, sat, fib, issues, good, nutriscore: p.nutriscore_grade || null };
}
