# Rurality.app — Project Context

## What This Is

A web app and research tool for rurality classification of U.S. locations. Deployed at [rurality.app](https://rurality.app), with companion R and Stata packages.

**Owner:** Cameron Wimpy, Arkansas State University
**Stack:** React 19, Tailwind CSS, Leaflet, lucide-react, Netlify
**Repos:**
- Web app: `cwimpy/rurality-app`
- R package: `cwimpy/rurality` — `install.packages("https://github.com/cwimpy/rurality/archive/refs/heads/main.tar.gz", repos = NULL, type = "source")`
- Stata package: `cwimpy/rurality-stata` — `net install rurality, from("https://raw.githubusercontent.com/cwimpy/rurality-stata/main/")`

## Architecture

- `src/App.js` — main component (~2100 lines), contains all views inline except new features
- `src/components/` — BatchLookup, StateMap, PlacesLikeThis, DarkModeToggle, EmbedWidget, LeafletMap, ErrorBoundary
- `src/services/ruralityCalculator.js` — core scoring algorithm
- `src/utils/apiUtils.js` — geocoding, Census API, rate limiting, caching
- `src/data/` — RUCA, RUCC, metro area lookup tables
- `public/data/` — ruca.json, rucc.json, county_rurality.csv (bulk download)

## Scoring Methodology

Composite score (0-100) from weighted components:
- RUCA code: 50% (or 0% if unavailable, weights redistribute)
- Population density: 25%
- Distance to metro: 15%
- Broadband: 10% (not yet live — weight redistributes)

Without RUCA: density 55%, distance 30%, broadband 15%
County-level CSV uses RUCC-based weights: RUCC 55%, density 28%, distance 17%

Classifications: Urban (0-19), Suburban (20-39), Mixed (40-59), Rural (60-79), Very Rural (80-100)

## Key Data Sources

- USDA ERS RUCA 2020 (41,146 ZCTAs)
- USDA ERS RUCC 2023 (3,235 counties)
- Census ACS 2022 5-year estimates
- Census TIGER/Line 2020 (county boundaries, land area)
- Census Geocoder + FCC Area API (for live lookups)
- Nominatim/OpenStreetMap (geocoding, rate-limited 1/sec)
- Census API (rate-limited 50/min)

## Current Features

- [x] Rurality score calculator with dashboard
- [x] Interactive Leaflet map (click to analyze)
- [x] US county choropleth colored by RUCC (topojson)
- [x] Batch lookup (CSV upload or paste, up to 100 locations)
- [x] Places Like This (similar counties by RUCC)
- [x] Multi-year Census trends tab
- [x] Dark mode with localStorage persistence (default: light)
- [x] PWA with service worker (network-first for app, cache-first for data)
- [x] Hamburger menu for mobile
- [x] Recent searches (localStorage, replaces default quick-picks)
- [x] Print report (formatted HTML, opens print dialog)
- [x] Embed widget (iframe code generator on For Researchers page)
- [x] CSV download + R/Stata package links on For Researchers page
- [x] Code copy buttons on all code blocks
- [x] Skip-to-content link and aria labels
- [x] Methodology page with weight tables
- [x] For Researchers page with citation, replication code, data sources

## TODO — Next Features

### Research (High Priority)
- [ ] Validated rurality index — move from composite score to a validated measurement instrument using factor analysis, convergent/discriminant validity testing against RUCC/RUCA/NCHS, and criterion validation against substantive outcomes (health access, election administration, broadband). This is the academic contribution that distinguishes the index from existing classifications.
- [ ] Academic paper — methodology paper documenting the index construction, validation, and comparison with existing measures. Target journals: Political Analysis, Social Science Quarterly, or a methods-focused journal. Structure: motivation (existing measures weren't built for election admin / policy), index construction, validation, application.
- [ ] API endpoint — REST API (Netlify Function) returning JSON rurality scores by FIPS or location
- [ ] EAVS integration — merge rurality scores with LEO Dashboard data
- [ ] Data dictionary/codebook page — downloadable documentation of all variables
- [ ] Broadband data integration — FCC/NTIA data to fill the 10% weight gap

### App Improvements
- [ ] Social card image — generate a proper 1200x630 PNG for OG/Twitter previews (current logo512.png is square)
- [ ] Compare mode enhancement — more prominent side-by-side comparison UI
- [ ] State filter on choropleth — zoom to a single state
- [ ] Historical RUCC comparison — show how a county's classification changed across RUCC vintages
- [ ] Performance — code-split large views (StateMap, BatchLookup) with React.lazy

### R Package
- [ ] Tests (testthat)
- [ ] pkgdown documentation site
- [ ] Vignette with usage examples
- [ ] CRAN submission prep (R CMD check, DESCRIPTION cleanup)
- [ ] Add NCHS Urban-Rural Classification Scheme data

### Stata Package
- [ ] Help file for rurality_install
- [ ] SSC submission
- [ ] Add RUCA lookup by ZIP (currently county-only)

### Infrastructure
- [ ] CI/CD — GitHub Actions for R CMD check on rurality package
- [ ] Automated data updates — script to refresh when new RUCC/ACS vintages release
- [ ] Analytics — basic usage tracking (privacy-respecting)

## Development Notes

- `npm run build` requires `NODE_OPTIONS=--no-experimental-webstorage` (already in package.json)
- Local dev server shows a `localStorage` SecurityError — this is a Node version issue, not a code bug. The app serves fine (HTTP 200).
- ESLint warnings about unused imports should be cleaned up before any PR
- The service worker uses network-first for everything except `/data/` files (cache-first)
- Dark mode uses Tailwind `class` strategy with CSS variable overrides in index.css
- App.js is large (~2100 lines); new features should be separate components in `src/components/`
