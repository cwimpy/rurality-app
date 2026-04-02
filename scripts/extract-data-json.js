#!/usr/bin/env node
/**
 * scripts/extract-data-json.js
 *
 * Extracts the RUCA and RUCC lookup objects from the generated JS data files
 * and writes them as compact JSON into public/data/ for lazy-loading at runtime.
 *
 * Run with: node scripts/extract-data-json.js
 * Or via:   npm run extract-data
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function extractPairs(content) {
  const obj = {};
  for (const [, key, val] of content.matchAll(/"(\d{5})": (\d+)/g)) {
    obj[key] = parseInt(val, 10);
  }
  return obj;
}

fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });

const rucaContent = fs.readFileSync(path.join(ROOT, 'src/data/rucaZcta.js'), 'utf8');
const rucaData    = extractPairs(rucaContent);
fs.writeFileSync(path.join(ROOT, 'public/data/ruca.json'), JSON.stringify(rucaData));
console.log(`RUCA: ${Object.keys(rucaData).length} ZCTAs → public/data/ruca.json`);

const ruccContent = fs.readFileSync(path.join(ROOT, 'src/data/ruralUrbanCodes.js'), 'utf8');
const ruccData    = extractPairs(ruccContent);
fs.writeFileSync(path.join(ROOT, 'public/data/rucc.json'), JSON.stringify(ruccData));
console.log(`RUCC: ${Object.keys(ruccData).length} counties → public/data/rucc.json`);
