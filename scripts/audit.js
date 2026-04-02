#!/usr/bin/env node
/**
 * Data integrity and spot-check audit for rurality-app
 * Run: node scripts/audit.js
 */

const ruca = require('../public/data/ruca.json');
const rucc = require('../public/data/rucc.json');

const rucaKeys = Object.keys(ruca);
const ruccKeys = Object.keys(rucc);
const rucaVals = Object.values(ruca);
const ruccVals = Object.values(rucc);

let errors = 0;

function check(label, pass, detail = '') {
  if (pass) {
    console.log('  ✓', label, detail ? `(${detail})` : '');
  } else {
    console.log('  ✗ FAIL', label, detail ? `(${detail})` : '');
    errors++;
  }
}

// ── 1. Counts ──────────────────────────────────────────────────────────────
console.log('\n── COUNTS ─────────────────────────────────────');
check('RUCA has 41,146 ZCTAs', rucaKeys.length === 41146, `got ${rucaKeys.length}`);
check('RUCC has 3,233 counties', ruccKeys.length === 3233, `got ${ruccKeys.length}`);

// ── 2. Value ranges ─────────────────────────────────────────────────────────
console.log('\n── VALUE RANGES ────────────────────────────────');
const rucaMin = Math.min(...rucaVals), rucaMax = Math.max(...rucaVals);
const ruccMin = Math.min(...ruccVals), ruccMax = Math.max(...ruccVals);
check('RUCA min is 1',  rucaMin === 1,  `got ${rucaMin}`);
check('RUCA max is 10', rucaMax === 10, `got ${rucaMax}`);
check('RUCC min is 1',  ruccMin === 1,  `got ${ruccMin}`);
check('RUCC max is 9',  ruccMax === 9,  `got ${ruccMax}`);
check('All RUCA values are integers 1-10',
  rucaVals.every(v => Number.isInteger(v) && v >= 1 && v <= 10), '');
check('All RUCC values are integers 1-9',
  ruccVals.every(v => Number.isInteger(v) && v >= 1 && v <= 9), '');

// ── 3. Key format ────────────────────────────────────────────────────────────
console.log('\n── KEY FORMAT (all must be 5-digit strings) ────');
const fiveDigit = /^\d{5}$/;
const badRuca = rucaKeys.filter(k => !fiveDigit.test(k));
const badRucc = ruccKeys.filter(k => !fiveDigit.test(k));
check('No malformed RUCA keys', badRuca.length === 0, `${badRuca.length} bad: ${badRuca.slice(0,3).join(', ')}`);
check('No malformed RUCC keys', badRucc.length === 0, `${badRucc.length} bad: ${badRucc.slice(0,3).join(', ')}`);

// ── 4. Duplicate keys ────────────────────────────────────────────────────────
console.log('\n── DUPLICATES ──────────────────────────────────');
const rucaUniq = new Set(rucaKeys);
const ruccUniq = new Set(ruccKeys);
check('No duplicate RUCA keys', rucaUniq.size === rucaKeys.length);
check('No duplicate RUCC keys', ruccUniq.size === ruccKeys.length);

// ── 5. RUCA spot checks ─────────────────────────────────────────────────────
console.log('\n── RUCA SPOT CHECKS (ZIP → code) ───────────────');
const rucaSpot = [
  // Metro areas (should be 1–3)
  { zip: '72401', place: 'Jonesboro AR (downtown)',     exp: 1  },
  { zip: '10001', place: 'Midtown Manhattan NY',        exp: 1  },
  { zip: '90210', place: 'Beverly Hills CA',            exp: 1  },
  { zip: '60601', place: 'Chicago Loop IL',             exp: 1  },
  { zip: '98101', place: 'Seattle WA',                  exp: 1  },
  // Micropolitan/small town (2020 RUCA: Harrison now code 5, Missoula now metro code 1)
  { zip: '72601', place: 'Harrison AR',                 exp: 5  },
  { zip: '59801', place: 'Missoula MT',                 exp: 1  },
  // Rural
  { zip: '72632', place: 'Eureka Springs AR',           exp: 10 },
  { zip: '99901', place: 'Ketchikan AK',                exp: 4  },
  // Puerto Rico / territories (should exist or be absent)
  { zip: '00601', place: 'Adjuntas PR',                 exp: null, note: 'PR included; value can be anything 1-10' },
];
rucaSpot.forEach(({ zip, place, exp, note }) => {
  const actual = ruca[zip];
  if (exp === null) {
    // Just confirm it exists and is in range
    const valid = actual !== undefined && actual >= 1 && actual <= 10;
    check(`${zip} ${place}`, valid, note || `got ${actual}`);
  } else {
    check(`${zip} ${place}`, actual === exp, `got ${actual}, expected ${exp}`);
  }
});

// ── 6. RUCC spot checks ─────────────────────────────────────────────────────
console.log('\n── RUCC SPOT CHECKS (5-digit FIPS → code) ─────');
const ruccSpot = [
  // Large metros (1)
  { fips: '06037', place: 'Los Angeles County CA',       exp: 1 },
  { fips: '17031', place: 'Cook County IL (Chicago)',    exp: 1 },
  { fips: '48113', place: 'Dallas County TX',            exp: 1 },
  { fips: '06059', place: 'Orange County CA',            exp: 1 },
  { fips: '48453', place: 'Travis County TX (Austin)',   exp: 1 },
  // Medium metros (2–3)
  { fips: '05031', place: 'Craighead County AR (Jonesboro)', exp: 3 },
  { fips: '30111', place: 'Yellowstone County MT (Billings)', exp: 3 },
  { fips: '19169', place: 'Story County IA (Ames)',      exp: 3 },
  // Nonmetro (2023 RUCC: Izard now code 6 — adjacent to redefined metro area)
  { fips: '05075', place: 'Izard County AR',             exp: 6 },
  { fips: '05101', place: 'Newton County AR (Jasper)',   exp: 9 },
  // Alaska — 2023 RUCC code 2
  { fips: '02020', place: 'Anchorage Borough AK',        exp: 2 },
];
ruccSpot.forEach(({ fips, place, exp }) => {
  const actual = rucc[fips];
  check(`${fips} ${place}`, actual === exp, `got ${actual}, expected ${exp}`);
});

// ── 7. RUCA distribution sanity ─────────────────────────────────────────────
console.log('\n── RUCA DISTRIBUTION ───────────────────────────');
const rucaDist = {};
rucaVals.forEach(v => { rucaDist[v] = (rucaDist[v] || 0) + 1; });
Object.keys(rucaDist).sort((a, b) => +a - +b).forEach(k => {
  const pct = ((rucaDist[k] / rucaVals.length) * 100).toFixed(1);
  console.log(`  Code ${k.padStart(2)}: ${String(rucaDist[k]).padStart(5)} ZCTAs (${pct}%)`);
});

// ── 8. RUCC distribution sanity ─────────────────────────────────────────────
console.log('\n── RUCC DISTRIBUTION ───────────────────────────');
const ruccDist = {};
ruccVals.forEach(v => { ruccDist[v] = (ruccDist[v] || 0) + 1; });
Object.keys(ruccDist).sort((a, b) => +a - +b).forEach(k => {
  const pct = ((ruccDist[k] / ruccVals.length) * 100).toFixed(1);
  console.log(`  Code ${k}: ${String(ruccDist[k]).padStart(4)} counties (${pct}%)`);
});

// ── 9. Score calculation spot-check ─────────────────────────────────────────
console.log('\n── SCORE CALCULATION ───────────────────────────');
function rucaToScore(ruca) {
  const map = { 1:8, 2:15, 3:24, 4:38, 5:48, 6:56, 7:68, 8:76, 9:84, 10:95 };
  return map[ruca] ?? null;
}
function densityScore(density) {
  if (density <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, 100 - Math.log10(density) * 25)));
}
// Jonesboro AR: RUCA=1, ~950 pop/sq mi (Craighead County ~400K pop / ~713 sq mi)
const jRuca = 1, jDensity = 560;
const jRucaScore = rucaToScore(jRuca);
const jDensScore = densityScore(jDensity);
const jComposite = Math.round(jRucaScore * 0.55 + jDensScore * 0.25);
console.log(`  Jonesboro AR: RUCA=${jRuca}→score ${jRucaScore}, density=${jDensity}→score ${jDensScore}`);
console.log(`  Composite (RUCA+density only, no distance): ${jComposite}`);
check('Jonesboro composite < 30 (it is metro)', jComposite < 30, `got ${jComposite}`);

// Very rural: RUCA=10, 2 pop/sq mi
const vRuca = 10, vDensity = 2;
const vComposite = Math.round(rucaToScore(vRuca) * 0.55 + densityScore(vDensity) * 0.25);
console.log(`  Very rural: RUCA=10→score 95, density=2→score ${densityScore(vDensity)}, composite ${vComposite}`);
check('Very rural composite > 70', vComposite > 70, `got ${vComposite}`);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n── SUMMARY ─────────────────────────────────────');
if (errors === 0) {
  console.log('  All checks passed.\n');
} else {
  console.log(`  ${errors} check(s) FAILED — review above.\n`);
}
process.exit(errors > 0 ? 1 : 0);
