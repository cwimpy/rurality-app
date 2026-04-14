#!/usr/bin/env node
// Exports src/data/metroAreas.js to public/data/metros.json so the R
// package's build_county_data.R reads the same metro list the web app uses.
// Run after editing metroAreas.js:
//   node scripts/export-metros.js

const path = require('path');
const fs = require('fs');
const m = require('../src/data/metroAreas.js');

const out = {
  large: m.LARGE_METROS,
  medium: m.MEDIUM_METROS,
  small: m.SMALL_METROS,
};

const outPath = path.join(__dirname, '..', 'public', 'data', 'metros.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(
  `Wrote ${outPath} — large:${out.large.length} medium:${out.medium.length} small:${out.small.length}`
);
