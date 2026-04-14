import React, { useState, useEffect } from 'react';
import {
  Search, MapPin, TrendingUp, BarChart3, Plus, X, Menu, Globe, FileSpreadsheet, Printer,
  Navigation, Info, Download, Share2, Zap, Wifi,
  Building2, Tractor, Heart, DollarSign, AlertCircle,
  BookOpen, FlaskConical, ExternalLink, Database, Calculator
} from 'lucide-react';

import LeafletMap from './components/LeafletMap';
import DarkModeToggle from './components/DarkModeToggle';
import BatchLookup from './components/BatchLookup';
import StateMap from './components/StateMap';
import PlacesLikeThis from './components/PlacesLikeThis';
import EmbedWidget from './components/EmbedWidget';
import RUCCHistory from './components/RUCCHistory';
import CompareTable from './components/CompareTable';
import ScoreDial from './components/ScoreDial';
import SpecimenCard from './components/SpecimenCard';

import {
  geocodeWithCache,
  fetchCensusData,
  getCountyFromCoordinates,
  fetchMultiYearCensusData
} from './utils/apiUtils';

import { calculateRuralityScore } from './services/ruralityCalculator';
import { loadRucaData, getRUCAForZcta, getRUCADescription, rucaToScore } from './data/rucaZcta';
import { loadRuccData, getRUCC, getRUCCDescription, ruccToScore } from './data/ruralUrbanCodes';

// ── Official classification helpers ──────────────────────────────────────────
function getOMBDesignation(rucc) {
  if (rucc === null || rucc === undefined) return null;
  if (rucc <= 3) return { label: 'Metropolitan',   color: 'text-red-700 bg-red-100 border-red-300' };
  if (rucc <= 5) return { label: 'Micropolitan',   color: 'text-yellow-700 bg-yellow-100 border-yellow-300' };
  return              { label: 'Nonmetro',         color: 'text-green-700 bg-green-100 border-green-300' };
}

function getRUCCColor(code) {
  if (!code) return 'text-slate-500 bg-slate-100 border-slate-200';
  if (code <= 3) return 'text-red-700 bg-red-100 border-red-300';
  if (code <= 5) return 'text-yellow-700 bg-yellow-100 border-yellow-300';
  return 'text-green-700 bg-green-100 border-green-300';
}

function getRUCAColor(code) {
  if (!code) return 'text-slate-500 bg-slate-100 border-slate-200';
  if (code <= 3) return 'text-red-700 bg-red-100 border-red-300';
  if (code <= 6) return 'text-yellow-700 bg-yellow-100 border-yellow-300';
  return 'text-green-700 bg-green-100 border-green-300';
}

// ── Map calculator output + Census data → UI shape ──────────────────────────
function buildRuralityDataForUI(calcResult, censusData) {
  const { overallScore, classification, components, confidence, methodology } = calcResult;
  const popDensity = components.populationDensity.value;
  const rucaCode = components.ruca?.code ?? null;

  // Agricultural land: estimated from RUCA code; fallback from score
  const agLand = rucaCode !== null
    ? Math.round(Math.max(5, Math.min(85, 50 + (rucaCode - 5) * 5)))
    : Math.round(Math.max(5, Math.min(85, overallScore * 0.8)));

  // Internet access: inversely correlated with rurality
  const internetAccess = rucaCode !== null
    ? Math.round(Math.max(40, Math.min(95, 77 - (rucaCode - 1) * 5)))
    : Math.round(Math.max(40, Math.min(95, 92 - overallScore * 0.4)));

  // Healthcare density: rough proxy from population density
  const healthcareDensity = parseFloat(
    Math.max(0.3, Math.min(8, popDensity / 500)).toFixed(1)
  );

  // Economic diversity: based on unemployment rate
  const unemploymentRate = censusData.unemploymentRate || 4.5;
  const economicDiversity = parseFloat(
    Math.max(1, Math.min(10, 7 - (unemploymentRate - 4) * 0.3)).toFixed(1)
  );

  // Report distance to the nearest metro of any tier — otherwise a
  // location inside a medium/large metro (e.g., Fresno) would display the
  // distance to the nearest *small* metro, which can be hundreds of miles.
  const distanceMiles = Math.round(Math.min(
    components.distance.nearestLargeMetro,
    components.distance.nearestMediumMetro,
    components.distance.nearestSmallMetro
  ));

  return {
    overallScore,
    classification,
    confidence,
    metrics: {
      populationDensity: {
        value: Math.round(popDensity),
        score: components.populationDensity.score,
        label: 'Pop. Density (per sq mi)',
        icon: Building2
      },
      distanceToUrban: {
        value: distanceMiles,
        score: components.distance.score,
        label: 'Distance to Urban Center (mi)',
        icon: MapPin
      },
      // The four tiles below are model-derived proxies, not measurements:
      // ag-land and broadband are functions of the RUCA code; healthcare
      // density is a function of population density; economic diversity
      // is derived from the ACS unemployment rate. They're flagged
      // `estimated: true` so the UI can badge them and researchers don't
      // mistake them for FCC, USDA Census of Agriculture, or HRSA data.
      agriculturalLand: {
        value: agLand,
        score: agLand,
        label: 'Agricultural Land Use (est. %)',
        icon: Tractor,
        estimated: true
      },
      internetAccess: {
        value: internetAccess,
        score: Math.round(100 - internetAccess),
        label: 'Broadband Access (est. %)',
        icon: Wifi,
        estimated: true
      },
      healthcareDensity: {
        value: healthcareDensity,
        score: Math.round((1 - healthcareDensity / 8) * 100),
        label: 'Healthcare Facilities (est. per 1000)',
        icon: Heart,
        estimated: true
      },
      economicDiversity: {
        value: economicDiversity,
        score: Math.round((1 - economicDiversity / 10) * 100),
        label: 'Economic Diversity Index (est.)',
        icon: DollarSign,
        estimated: true
      }
    },
    demographics: {
      population: censusData.totalPopulation,
      medianAge: censusData.medianAge,
      medianIncome: censusData.medianIncome,
      unemploymentRate: censusData.unemploymentRate
    },
    methodology
  };
}

// ── Component ────────────────────────────────────────────────────────────────
const RuralityApp = () => {
  const [currentLocation, setCurrentLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState('dashboard');
  const [comparisonData, setComparisonData] = useState([]); // {name, score, level, loading}
  const [ruralityData, setRuralityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [locationMeta, setLocationMeta] = useState(null); // { stateFips, countyFips, areaSqMiles, lat, lng, ruca }
  const [trendsData, setTrendsData]     = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [specimenOpen, setSpecimenOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rurality-recent') || '[]'); }
    catch { return []; }
  });

  // Preload lookup tables in the background immediately on mount.
  useEffect(() => {
    loadRucaData().catch(() => {});
    loadRuccData().catch(() => {});
  }, []);



  // Fetch trends when switching to the tab OR when locationMeta arrives while on the tab
  useEffect(() => {
    if (activeView === 'trends' && locationMeta && !trendsData && !trendsLoading) {
      setTrendsLoading(true);
      fetchMultiYearCensusData(locationMeta.stateFips, locationMeta.countyFips)
        .then(data => { setTrendsData(data); setTrendsLoading(false); })
        .catch(() => setTrendsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, locationMeta]);

  // Auto-search from URL ?q= parameter on initial load
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const getRuralityLevel = (score) => {
    if (score >= 80) return { level: 'Very Rural', color: 'text-green-800 bg-green-200 border-green-300' };
    if (score >= 60) return { level: 'Rural',      color: 'text-green-700 bg-green-100 border-green-300' };
    if (score >= 40) return { level: 'Mixed',      color: 'text-yellow-700 bg-yellow-100 border-yellow-300' };
    if (score >= 20) return { level: 'Suburban',   color: 'text-orange-700 bg-orange-100 border-orange-300' };
    return               { level: 'Urban',     color: 'text-red-700 bg-red-100 border-red-300' };
  };

  // ── Location search ────────────────────────────────────────────────────────
  const handleLocationSearch = async (location) => {
    if (!location.trim()) return;
    setLoading(true);
    setError('');
    setTrendsData(null); // clear stale trends on new search

    try {
      setLoadingStep('Step 1/3: Geocoding location…');
      const geoData = await geocodeWithCache(location);

      setLoadingStep('Step 2/3: Looking up county…');
      const countyData = await getCountyFromCoordinates(geoData.lat, geoData.lng);

      setLoadingStep('Step 3/3: Fetching Census data…');
      const censusData = await fetchCensusData(countyData.stateFips, countyData.countyFips);

      const populationDensity = countyData.areaSqMiles > 0
        ? censusData.totalPopulation / countyData.areaSqMiles
        : 0;

      // Lookup tables must be loaded before getRUCAForZcta / getRUCC can
      // return a code (both are sync and silently return null if not loaded).
      await Promise.all([loadRucaData(), loadRuccData()]);

      const ruca = geoData.postcode ? getRUCAForZcta(geoData.postcode) : null;
      const calcResult = calculateRuralityScore({ lat: geoData.lat, lng: geoData.lng, populationDensity, ruca });

      setLoadingStep('Building analysis…');

      const uiData = buildRuralityDataForUI(calcResult, censusData);

      // Official classification codes
      const ruccCode = getRUCC(countyData.stateFips, countyData.countyFips);
      const rucaCode = ruca;
      const omb = getOMBDesignation(ruccCode);

      const classifications = {
        rucc: ruccCode !== null ? {
          code: ruccCode,
          description: getRUCCDescription(ruccCode),
          score: ruccToScore(ruccCode),
          color: getRUCCColor(ruccCode)
        } : null,
        ruca: rucaCode !== null ? {
          code: rucaCode,
          description: getRUCADescription(rucaCode),
          score: rucaToScore(rucaCode),
          color: getRUCAColor(rucaCode)
        } : null,
        omb,
        countyName: countyData.countyName,
        postcode: geoData.postcode
      };

      setLocationMeta({
        stateFips:   countyData.stateFips,
        countyFips:  countyData.countyFips,
        areaSqMiles: countyData.areaSqMiles,
        lat: geoData.lat,
        lng: geoData.lng,
        ruca
      });

      // Prefer the city/town name from the geocode address over the raw
      // first token of displayName, which may be a ZIP code.
      const resolvedName =
        geoData.address?.city ||
        geoData.address?.town ||
        geoData.address?.village ||
        geoData.address?.hamlet ||
        countyData.countyName ||
        geoData.displayName.split(',')[0];
      setCurrentLocation(resolvedName);

      // Save to recent searches
      setRecentSearches(prev => {
        const entry = { name: resolvedName, query: location, score: uiData.overallScore };
        const updated = [entry, ...prev.filter(r => r.query !== location)].slice(0, 8);
        try { localStorage.setItem('rurality-recent', JSON.stringify(updated)); } catch {}
        return updated;
      });

      setRuralityData({
        ...uiData,
        classifications,
        coordinates: { lat: geoData.lat, lng: geoData.lng }
      });
    } catch (err) {
      setError(err.message || 'Location lookup failed. Try a more specific search.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // ── Auto-search from URL on mount ──────────────────────────────────────────
  useEffect(() => {
    if (initialLoadDone) return;
    setInitialLoadDone(true);
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setSearchQuery(q);
      handleLocationSearch(q).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadDone]);

  // ── GPS location ───────────────────────────────────────────────────────────
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }
    setLoading(true);
    setLoadingStep('Getting GPS location…');

    // Use a plain (non-async) callback so geolocation never receives a
    // rejected Promise it can't handle — chain .catch() explicitly instead.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`
        )
          .then((r) => r.json())
          .then((data) => {
            const name =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.hamlet ||
              data.address?.county ||
              'Current Location';
            // Append state so same-named places don't resolve to another state
            // via the forward geocode inside handleLocationSearch.
            const state = data.address?.state;
            const query = state && name !== 'Current Location'
              ? `${name}, ${state}`
              : name;
            return handleLocationSearch(query).catch(() => {});
          })
          .catch(() => {
            setError('Failed to identify current location');
            setLoading(false);
            setLoadingStep('');
          });
      },
      (err) => {
        setError(`Location access denied: ${err.message}`);
        setLoading(false);
        setLoadingStep('');
      },
      { timeout: 10000 }
    );
  };

  // ── Comparison ─────────────────────────────────────────────────────────────
  const addComparison = async (locationName, knownScore = null) => {
    if (comparisonData.length >= 5) return;
    if (comparisonData.some(d => d.name === locationName)) return;

    // If we already have the score (adding current location), use current data
    if (knownScore !== null) {
      const level = getRuralityLevel(knownScore).level;
      const rucc = locationMeta ? getRUCC(locationMeta.stateFips, locationMeta.countyFips) : null;
      const density = ruralityData?.metrics?.populationDensity?.value ?? null;
      const distanceToMetro = ruralityData?.metrics?.distanceToUrban?.value ?? null;
      const ruccScore = rucc != null ? ruccToScore(rucc) : null;
      const densityScore = ruralityData?.metrics?.populationDensity?.score ?? null;
      const distanceScore = ruralityData?.metrics?.distanceToUrban?.score ?? null;
      setComparisonData(prev => [...prev, {
        name: locationName, score: knownScore, level, loading: false,
        rucc, density, distanceToMetro, ruccScore, densityScore, distanceScore
      }]);
      return;
    }

    // Otherwise fetch asynchronously; show loading row immediately
    setComparisonData(prev => [...prev, { name: locationName, score: null, level: null, loading: true }]);

    try {
      await loadRucaData();
      const geoData = await geocodeWithCache(locationName);
      const countyData = await getCountyFromCoordinates(geoData.lat, geoData.lng);
      const censusData = await fetchCensusData(countyData.stateFips, countyData.countyFips);
      const populationDensity = countyData.areaSqMiles > 0
        ? censusData.totalPopulation / countyData.areaSqMiles : 0;
      const ruca = geoData.postcode ? getRUCAForZcta(geoData.postcode) : null;
      const calcResult = calculateRuralityScore({ lat: geoData.lat, lng: geoData.lng, populationDensity, ruca });
      const { overallScore, classification, components } = calcResult;
      const rucc = getRUCC(countyData.stateFips, countyData.countyFips);
      setComparisonData(prev => prev.map(d =>
        d.name === locationName
          ? {
              name: locationName, score: overallScore, level: classification.label, loading: false,
              rucc,
              density: populationDensity,
              distanceToMetro: Math.min(
                components.distance.nearestLargeMetro,
                components.distance.nearestMediumMetro,
                components.distance.nearestSmallMetro
              ),
              ruccScore: components.ruca?.score ?? null,
              densityScore: components.populationDensity.score,
              distanceScore: components.distance.score
            }
          : d
      ));
    } catch {
      setComparisonData(prev => prev.map(d =>
        d.name === locationName
          ? { name: locationName, score: null, level: 'Error', loading: false }
          : d
      ));
    }
  };

  const removeComparison = (locationName) => {
    setComparisonData(prev => prev.filter(d => d.name !== locationName));
  };

  // ── Share / Export ─────────────────────────────────────────────────────────
  const shareResults = async () => {
    if (!ruralityData || !currentLocation) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(searchQuery || currentLocation)}`;
    const level = getRuralityLevel(ruralityData.overallScore).level;
    const cls = ruralityData.classifications || {};
    // Multi-line "field report" for clipboard / email / social
    const report = [
      `§ FIELD REPORT · RURALITY.APP`,
      `──────────────────────────────`,
      `${currentLocation}`,
      `Rurality Index  ${ruralityData.overallScore}/100  ·  ${level}`,
      `Confidence   ${ruralityData.confidence}`,
      cls.rucc?.code != null ? `RUCC 2023    ${cls.rucc.code} — ${cls.rucc.description || ''}`.trim() : null,
      cls.ruca?.code != null ? `RUCA 2020    ${cls.ruca.code} — ${cls.ruca.description || ''}`.trim() : null,
      cls.omb?.label         ? `OMB          ${cls.omb.label}` : null,
      `──────────────────────────────`,
      shareUrl,
    ].filter(Boolean).join('\n');

    // Always write the rich report to the clipboard first so the full format
    // is preserved regardless of what a downstream share sheet decides to copy.
    try { await navigator.clipboard.writeText(report); } catch {}

    // On platforms with a native share sheet (usually mobile), offer it too,
    // passing the FULL report as the text so paste targets get the same content.
    // Only offer share on touch devices — desktop Chrome's share sheet often
    // discards the text and copies only the URL.
    const isTouch = typeof window !== 'undefined' &&
                    (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: 'Rurality.app', text: report, url: shareUrl }); return; }
      catch { /* cancelled — clipboard still has the report */ }
    }
    alert('Field report copied to clipboard');
  };

  const exportData = () => {
    if (!ruralityData) return;
    const rows = [
      ['Metric', 'Value', 'Score'],
      ['Location', currentLocation, ''],
      ['Overall Rurality Index', ruralityData.overallScore, ruralityData.overallScore],
      ['Classification', getRuralityLevel(ruralityData.overallScore).level, ''],
      ['Confidence', ruralityData.confidence, ''],
      ['', '', ''],
      ...Object.entries(ruralityData.metrics).map(([, m]) => [m.label, m.value, m.score]),
      ['', '', ''],
      ['County Population', ruralityData.demographics?.population ?? 'N/A', ''],
      ['Median Age', ruralityData.demographics?.medianAge ?? 'N/A', ''],
      ['Median Income', ruralityData.demographics?.medianIncome
        ? `$${ruralityData.demographics.medianIncome.toLocaleString()}` : 'N/A', ''],
      ['Unemployment Rate', ruralityData.demographics?.unemploymentRate
        ? `${ruralityData.demographics.unemploymentRate}%` : 'N/A', '']
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rurality-${currentLocation.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printReport = () => {
    if (!ruralityData || !currentLocation) return;
    const level = getRuralityLevel(ruralityData.overallScore);
    const demo = ruralityData.demographics;
    const score = ruralityData.overallScore;
    const tierColor =
      score >= 80 ? '#1a5c2e' :
      score >= 60 ? '#4a7c59' :
      score >= 40 ? '#a17321' :
      score >= 20 ? '#b45309' :
                    '#991b1b';

    const metricsRows = Object.entries(ruralityData.metrics).map(([, m]) => {
      const mColor = m.score >= 80 ? '#1a5c2e' : m.score >= 60 ? '#4a7c59' : m.score >= 40 ? '#a17321' : m.score >= 20 ? '#b45309' : '#991b1b';
      const val = typeof m.value === 'number' && m.value % 1 !== 0 ? m.value.toFixed(1) : m.value;
      return `<tr>
        <td class="label">${m.label}</td>
        <td class="value">${val}</td>
        <td class="score-cell"><span class="score-num" style="color:${mColor}">${m.score}</span><span class="score-of">/100</span></td>
      </tr>`;
    }).join('');

    const demoRows = [
      ['County Population',  demo?.population?.toLocaleString() ?? 'N/A'],
      ['Median Income',      demo?.medianIncome ? '$' + demo.medianIncome.toLocaleString() : 'N/A'],
      ['Median Age',         demo?.medianAge ?? 'N/A'],
      ['Unemployment Rate',  demo?.unemploymentRate ? demo.unemploymentRate + '%' : 'N/A'],
    ].map(([k, v]) => `<tr><td class="label">${k}</td><td class="value" colspan="2">${v}</td></tr>`).join('');

    const classifications = ruralityData.classifications || {};
    const classificationsBlock = `
      <div class="cls-grid">
        <div class="cls-item">
          <div class="cls-title">RUCC 2023</div>
          <div class="cls-code" style="color:${tierColor}">${classifications.rucc?.code ?? '—'}</div>
          <div class="cls-desc">${classifications.rucc?.description ?? 'Not available'}</div>
        </div>
        <div class="cls-item">
          <div class="cls-title">RUCA 2020</div>
          <div class="cls-code" style="color:${tierColor}">${classifications.ruca?.code ?? '—'}</div>
          <div class="cls-desc">${classifications.ruca?.description ?? 'Not available'}</div>
        </div>
        <div class="cls-item">
          <div class="cls-title">OMB Designation</div>
          <div class="cls-badge" style="color:${tierColor};border-color:${tierColor}">${classifications.omb?.label ?? '—'}</div>
          <div class="cls-desc">Metro / Micro / Nonmetro</div>
        </div>
      </div>`;

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>Field Report — ${currentLocation}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --forest: #1a3a2a;
    --sage: #4a7c59;
    --wheat: #d4a843;
    --cream: #faf8f4;
    --parchment: #f3f0e8;
    --tier: ${tierColor};
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Source Serif 4', Georgia, serif;
    background: var(--cream);
    color: #1e293b;
    margin: 0;
    padding: 48px;
    line-height: 1.55;
  }
  .page {
    max-width: 760px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid rgba(26,58,42,0.18);
    padding: 44px 48px 36px;
    position: relative;
  }
  .page::before {
    content: '';
    position: absolute;
    inset: 8px;
    border: 1px dashed rgba(26,58,42,0.18);
    pointer-events: none;
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--sage);
    margin-bottom: 28px;
  }
  .rule::before, .rule::after {
    content: '';
    flex: 1;
    height: 1px;
    background: currentColor;
    opacity: 0.4;
  }
  .masthead { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: end; border-bottom: 1px solid rgba(26,58,42,0.2); padding-bottom: 24px; }
  h1 {
    font-family: 'Source Serif 4', Georgia, serif;
    font-size: 38px;
    line-height: 0.98;
    margin: 0 0 8px;
    color: var(--forest);
    font-weight: 400;
    letter-spacing: -0.01em;
  }
  .kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--sage);
    margin-bottom: 10px;
  }
  .meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--sage);
  }
  .stamp-block {
    text-align: center;
    border: 2px solid var(--tier);
    padding: 14px 22px;
    border-radius: 4px;
    min-width: 160px;
  }
  .stamp-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--sage);
    margin-bottom: 6px;
  }
  .stamp-score {
    font-family: 'Source Serif 4', Georgia, serif;
    font-size: 58px;
    line-height: 0.9;
    font-variant-numeric: oldstyle-nums;
    letter-spacing: -0.04em;
    color: var(--tier);
  }
  .stamp-tier {
    margin-top: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--tier);
    font-weight: 500;
  }
  h2 {
    font-family: 'Source Serif 4', serif;
    font-size: 16px;
    font-weight: 600;
    color: var(--forest);
    margin: 28px 0 10px;
  }
  .section-rule {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 26px 0 14px;
  }
  .section-rule .lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--sage);
    flex-shrink: 0;
  }
  .section-rule .ln { flex: 1; height: 1px; background: rgba(26,58,42,0.25); }
  table { border-collapse: collapse; width: 100%; }
  td {
    padding: 8px 0;
    border-bottom: 1px dashed rgba(26,58,42,0.18);
    font-size: 12.5px;
  }
  td.label {
    color: var(--sage);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    width: 40%;
  }
  td.value {
    font-family: 'Source Serif 4', serif;
    font-variant-numeric: oldstyle-nums;
    color: var(--forest);
    font-size: 18px;
  }
  td.score-cell {
    width: 22%;
    text-align: right;
    font-family: 'Source Serif 4', serif;
  }
  .score-num {
    font-size: 20px;
    font-variant-numeric: oldstyle-nums;
  }
  .score-of {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.18em;
    color: var(--sage);
    margin-left: 4px;
  }
  .cls-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .cls-item {
    background: var(--cream);
    border: 1px solid rgba(26,58,42,0.15);
    padding: 14px;
  }
  .cls-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--sage);
    margin-bottom: 6px;
  }
  .cls-code {
    font-family: 'Source Serif 4', serif;
    font-size: 42px;
    font-variant-numeric: oldstyle-nums;
    line-height: 1;
    letter-spacing: -0.04em;
    margin: 4px 0 6px;
  }
  .cls-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    padding: 3px 8px;
    border: 1px solid;
    border-radius: 3px;
    margin: 10px 0;
  }
  .cls-desc {
    font-size: 11px;
    color: #475569;
    line-height: 1.4;
  }
  .colophon {
    margin-top: 36px;
    padding-top: 18px;
    border-top: 2px solid var(--wheat);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--sage);
    line-height: 1.8;
  }
  .colophon .by {
    font-family: 'Source Serif 4', serif;
    font-style: italic;
    text-transform: none;
    font-size: 11.5px;
    letter-spacing: 0;
    color: var(--forest);
    margin-top: 8px;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .page { border: none; padding: 30px 40px; max-width: none; }
    .page::before { inset: 14px; }
    @page { margin: 18mm; }
  }
</style>
</head><body>
<div class="page">
  <div class="rule">
    <span>№ 01</span>
    <span>Field Report</span>
    <span>Rurality.app &middot; ${today}</span>
  </div>

  <div class="masthead">
    <div>
      <div class="kicker">A Rurality Index Report</div>
      <h1>${currentLocation}</h1>
      <div class="meta">Confidence &middot; <em style="font-family:'Source Serif 4',serif;font-style:italic;text-transform:none;letter-spacing:0;">${ruralityData.confidence}</em></div>
    </div>
    <div class="stamp-block">
      <div class="stamp-label">Rurality / 100</div>
      <div class="stamp-score">${score}</div>
      <div class="stamp-tier">${level.level}</div>
    </div>
  </div>

  <div class="section-rule"><span class="lbl">Exhibit A &middot; Indicators</span><span class="ln"></span></div>
  <table>${metricsRows}</table>

  <div class="section-rule"><span class="lbl">Exhibit B &middot; Demographics</span><span class="ln"></span></div>
  <table>${demoRows}</table>

  <div class="section-rule"><span class="lbl">Exhibit C &middot; Official Classifications</span><span class="ln"></span></div>
  ${classificationsBlock}

  <div class="colophon">
    Source &mdash; Rurality.app &middot; USDA ERS RUCC 2023 &middot; USDA ERS RUCA 2020 &middot; U.S. Census ACS 2022
    <div class="by">Cameron Wimpy &middot; Institute for Rural Initiatives, Arkansas State University</div>
  </div>
</div>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  // ── Classifications Panel ───────────────────────────────────────────────────
  const ClassificationsPanel = ({ classifications, compositeScore, confidence }) => {
    if (!classifications) return null;
    const { rucc, ruca, omb, countyName, postcode } = classifications;

    const scoreColor = (s) => s == null ? 'var(--color-sage)'
      : s >= 80 ? '#1a5c2e'
      : s >= 60 ? '#4a7c59'
      : s >= 40 ? '#a17321'
      : s >= 20 ? '#b45309'
      :           '#991b1b';

    const IndexCard = ({ title, code, badge, description, score, footnote }) => (
      <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] p-4 flex flex-col gap-3"
           style={{ backgroundColor: 'var(--color-cream)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>{title}</span>
          {badge && (
            <span className="text-[0.65rem] uppercase tracking-wider font-mono px-2 py-0.5 rounded border"
                  style={{ color: scoreColor(score), borderColor: scoreColor(score) }}>
              {badge}
            </span>
          )}
        </div>
        {code !== null && code !== undefined ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="fg-numeral text-5xl" style={{ color: scoreColor(score) }}>{code}</span>
              {score !== null && score !== undefined && (
                <span className="text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  score {score}/100
                </span>
              )}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{description}</p>
            {score !== null && score !== undefined && (
              <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
                <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
              </div>
            )}
          </>
        ) : badge && badge !== 'N/A' ? (
          // Label-only classification (e.g. OMB Metropolitan / Micropolitan / Nonmetro) —
          // no numeric code, so show the badge's description prominently.
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{description}</p>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--color-ink-muted)' }}>Not available for this location</p>
        )}
        {footnote && (
          <p className="text-[0.65rem] uppercase tracking-[0.22em] font-mono leading-relaxed" style={{ color: 'var(--color-ink-muted)', opacity: 0.7 }}>
            {footnote}
          </p>
        )}
      </div>
    );

    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-[rgba(26,58,42,0.1)] dark:border-slate-700">
        <div className="fg-rule mb-5">
          <span>Exhibit B</span>
          <span className="hidden sm:inline">Official Rurality Classifications</span>
          <span className="sm:hidden">Classifications</span>
        </div>
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h3 className="fg-display text-3xl leading-tight" style={{ color: 'var(--color-ink)' }}>
              Official Classifications
            </h3>
            {(countyName || postcode) && (
              <p className="mt-1 text-[0.7rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                {countyName ? `${countyName} County` : ''}
                {postcode ? ` · ZIP ${postcode}` : ''}
              </p>
            )}
          </div>
          <span className="inline-flex items-baseline gap-2 px-3 py-1.5 rounded border"
                style={{ borderColor: scoreColor(compositeScore), color: scoreColor(compositeScore) }}>
            <span className="text-[0.65rem] uppercase tracking-wider font-mono">RRI</span>
            <span className="fg-numeral text-2xl">{compositeScore}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <IndexCard
            title="RUCC 2023"
            code={rucc?.code ?? null}
            badge={rucc?.code !== null && rucc?.code !== undefined ? `Code ${rucc.code}` : 'N/A'}
            description={rucc?.description ?? ''}
            score={rucc?.score ?? null}
            footnote="USDA Rural-Urban Continuum — county level (1–9)"
          />
          <IndexCard
            title="RUCA 2020"
            code={ruca?.code ?? null}
            badge={ruca?.code !== null && ruca?.code !== undefined ? `Code ${ruca.code}` : 'N/A'}
            description={ruca?.description ?? ''}
            score={ruca?.score ?? null}
            footnote="USDA Rural-Urban Commuting Area — ZIP/ZCTA (1–10)"
          />
          <IndexCard
            title="OMB Designation"
            code={null}
            badge={omb?.label ?? 'N/A'}
            description={
              omb?.label === 'Metropolitan'   ? 'Core-based statistical area with urban core ≥50,000' :
              omb?.label === 'Micropolitan'   ? 'Core-based statistical area with urban core 10,000–49,999' :
              omb?.label === 'Nonmetro'       ? 'Outside any metropolitan or micropolitan statistical area' :
              'Unable to determine from RUCC'
            }
            score={null}
            footnote="OMB metro / micro / nonmetro classification"
          />
          <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] p-4 flex flex-col gap-3"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>Composite RRI</span>
              <span className="text-[0.65rem] uppercase tracking-wider font-mono px-2 py-0.5 rounded border italic"
                    style={{ color: scoreColor(compositeScore), borderColor: scoreColor(compositeScore) }}>
                {confidence}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="fg-numeral text-5xl" style={{ color: scoreColor(compositeScore) }}>{compositeScore}</span>
              <span className="text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>/ 100</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
              Weighted hybrid index combining RUCA, population density, distance to metro, and broadband access.
            </p>
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
              <div className="h-full rounded-full" style={{ width: `${compositeScore}%`, backgroundColor: scoreColor(compositeScore) }} />
            </div>
            <p className="text-[0.65rem] uppercase tracking-[0.22em] font-mono leading-relaxed" style={{ color: 'var(--color-ink-muted)', opacity: 0.7 }}>
              Rurality.app methodology v2.0
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-md border-l-4 px-4 py-3 text-sm"
             style={{ borderColor: 'var(--color-wheat)', backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
          <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-2" style={{ color: 'var(--color-ink-muted)' }}>Note</span>
          RUCC 1–3 = Metropolitan, 4–5 = Micropolitan, 6–9 = Nonmetro. RUCA 1–3 = Metropolitan,
          4–6 = Micropolitan, 7–10 = Rural/Small town. OMB designation is derived from RUCC. The
          composite RRI reflects confidence level <em>{confidence}</em> based on available data.
        </div>
      </div>
    );
  };

  // ── Sub-views ──────────────────────────────────────────────────────────────
  // Click-to-analyze: reverse-geocode the clicked coordinates, then run
  // the normal search flow with the resolved place name + state so the
  // forward geocode doesn't land in the wrong state.
  const handleMapClick = async (lat, lng) => {
    if (loading) return;
    setLoading(true);
    setLoadingStep('Identifying clicked location…');
    setError('');
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await resp.json();
      const place =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.hamlet ||
        data.address?.county ||
        '';
      const state = data.address?.state || '';
      // Include state to disambiguate (e.g. "Jonesboro, Arkansas" not just "Jonesboro")
      const query = place && state
        ? `${place}, ${state}`
        : place || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setSearchQuery(query);
      await handleLocationSearch(query);
    } catch (err) {
      setError('Could not analyze that location. Try clicking a populated area.');
      setLoading(false);
      setLoadingStep('');
    }
  };

  const MapView = () => (
    <div className="space-y-10 sm:space-y-12 pb-8">
      {/* ── Editorial masthead ─────────────────────────────────────── */}
      <header className="topo-bg rounded-2xl border px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
              style={{ backgroundColor: 'var(--color-parchment)', borderColor: 'var(--color-rule)' }}>
        <div className="fg-rule mb-8">
          <span>§ Interactive Map</span>
          <span className="hidden sm:inline">Click any location &middot; Open its report</span>
          <span>Continental U.S.</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8">
            <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
              Drop a <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>pin</em> anywhere.
            </h2>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed"
               style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
              Click anywhere on the map and the tool will reverse-geocode those coordinates,
              resolve the containing county, and open a full field report for the location.
            </p>
          </div>
          <aside className="lg:col-span-4">
            <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
              <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                Coverage
              </div>
              {[
                ['3,235', 'U.S. counties'],
                ['41,146', 'ZIP Code Tabulation Areas'],
                ['6+', 'federal data sources'],
              ].map(([n, l], i, arr) => (
                <div key={l} className={`flex items-baseline gap-3 ${i !== arr.length - 1 ? 'mb-2 pb-2 border-b border-dashed' : ''}`}
                     style={i !== arr.length - 1 ? { borderColor: 'var(--color-rule)' } : {}}>
                  <div className="fg-numeral text-2xl" style={{ color: 'var(--color-ink)' }}>{n}</div>
                  <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-ink-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </header>

      {/* ── The Map Plate ─────────────────────────────────────────── */}
      <section>
        <div className="fg-rule mb-5">
          <span>The Plate:</span>
          <span>Click to analyze &middot; Drag to pan &middot; Scroll to zoom</span>
        </div>
        <div className="rounded-lg overflow-hidden border"
             style={{ backgroundColor: 'var(--color-cream)', borderColor: 'var(--color-rule)' }}>
          <div className="relative h-[28rem] sm:h-[32rem]">
            <LeafletMap
              coordinates={ruralityData?.coordinates || null}
              locationName={currentLocation}
              score={ruralityData?.overallScore ?? null}
              onMapClick={handleMapClick}
              loading={loading}
            />
          </div>

          {/* Stat strip — like a catalog footer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-t" style={{ borderColor: 'var(--color-rule)' }}>
            {[
              ['3,235',     'U.S. counties'],
              ['RUCA 2020', 'Classification anchor'],
              ['6+',        'Federal data sources'],
              ['Free',      'Open access'],
            ].map(([val, lbl], i, arr) => (
              <div key={lbl}
                   className={`px-4 py-4 text-center ${i !== arr.length - 1 ? 'sm:border-r border-b sm:border-b-0' : ''}`}
                   style={{ borderColor: 'var(--color-rule)' }}>
                <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-1" style={{ color: 'var(--color-ink-muted)' }}>
                  {lbl}
                </div>
                <div className="fg-numeral text-xl" style={{ color: 'var(--color-ink)' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const TrendsView = () => {
    // Field-guide mini bar chart — SVG with mono tick labels
    const MiniBarChart = ({ data, valueKey, color, formatVal }) => {
      const vals = data.map(d => d[valueKey]);
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const range = max - min || 1;
      return (
        <div className="flex items-end justify-between gap-1.5 h-28">
          {data.map((d, i) => {
            const pct = Math.max(6, Math.round(((d[valueKey] - min) / range) * 100));
            const isLast = i === data.length - 1;
            return (
              <div key={d.year} className="flex flex-col items-center flex-1 gap-1.5">
                <div className="fg-numeral text-xs"
                     style={{ color: isLast ? color : 'var(--color-sage)', opacity: isLast ? 1 : 0.7 }}>
                  {formatVal(d[valueKey])}
                </div>
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${pct}%`,
                    minHeight: '4px',
                    backgroundColor: color,
                    opacity: isLast ? 1 : 0.65,
                  }}
                />
                <div className="text-[0.6rem] uppercase tracking-[0.2em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  {d.year}
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const deltaLabel = (data, key, fmt) => {
      if (!data || data.length < 2) return null;
      const first = data[0][key];
      const last  = data[data.length - 1][key];
      const diff  = last - first;
      const sign  = diff >= 0 ? '+' : '';
      return { text: `${sign}${fmt(diff)} since ${data[0].year}`, positive: diff >= 0, diff };
    };

    const EmptyState = ({ icon: Icon, message, spin = false }) => (
      <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] px-8 py-16 text-center"
           style={{ backgroundColor: 'var(--color-cream)' }}>
        {spin ? (
          <div className="animate-spin w-8 h-8 rounded-full mx-auto mb-5"
               style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: 'var(--color-rule)', borderTopColor: 'var(--color-wheat)' }} />
        ) : (
          <Icon className="w-10 h-10 mx-auto mb-5" style={{ color: 'var(--color-ink-muted)', opacity: 0.5 }} />
        )}
        <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
          Field Report &middot; Trends
        </div>
        <p className="fg-display text-lg sm:text-xl italic" style={{ color: 'var(--color-ink)' }}>
          {message}
        </p>
      </div>
    );

    if (!locationMeta) {
      return <EmptyState icon={TrendingUp} message="Search for a location to view historical trends." />;
    }
    if (trendsLoading) {
      return <EmptyState icon={TrendingUp} message="Loading 2018–2022 Census ACS data…" spin />;
    }
    if (!trendsData || trendsData.length === 0) {
      return <EmptyState icon={AlertCircle} message="Could not load historical data for this county." />;
    }

    const firstYr = trendsData[0].year;
    const lastYr  = trendsData[trendsData.length - 1].year;
    const popDelta = deltaLabel(trendsData, 'population',       v => Math.abs(v).toLocaleString());
    const incDelta = deltaLabel(trendsData, 'medianIncome',     v => `$${Math.abs(v).toLocaleString()}`);
    const uneDelta = deltaLabel(trendsData, 'unemploymentRate', v => `${Math.abs(v).toFixed(1)}pp`);

    const metricColor = (delta, positiveIsGood) => {
      if (!delta) return 'var(--color-sage)';
      const good = positiveIsGood ? delta.positive : !delta.positive;
      return good ? '#4a7c59' : '#b45309';
    };

    return (
      <div className="space-y-10 sm:space-y-12 pb-8">
        {/* ── Editorial header ─────────────────────────────────────── */}
        <header className="topo-bg rounded-2xl border border-[rgba(26,58,42,0.14)] dark:border-[rgba(255,255,255,0.08)] px-6 sm:px-10 pt-8 pb-8 sm:pt-10"
                style={{ backgroundColor: 'var(--color-parchment)' }}>
          <div className="fg-rule mb-6">
            <span>§ Trends</span>
            <span className="hidden sm:inline">Annual Census Readings</span>
            <span>{firstYr} &middot; {lastYr}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-end">
            <div>
              <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
                Field Report
              </div>
              <h2 className="fg-display text-4xl sm:text-5xl leading-[0.98]" style={{ color: 'var(--color-ink)' }}>
                {currentLocation} <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>through</em> the years.
              </h2>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" style={{ fontFamily: 'var(--font-display)' }}>
                U.S. Census Bureau ACS 5-Year Estimates &middot; county level
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportData}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-[0.65rem] uppercase tracking-[0.22em] font-mono border transition-colors"
                      style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                <Download className="w-3 h-3" />
                <span>CSV</span>
              </button>
              <button onClick={printReport}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-[0.65rem] uppercase tracking-[0.22em] font-mono border transition-colors"
                      style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
              <button onClick={shareResults}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-[0.65rem] uppercase tracking-[0.22em] font-mono"
                      style={{ backgroundColor: 'var(--color-forest)', color: 'var(--color-wheat)' }}>
                <Share2 className="w-3 h-3" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Three metric plates ──────────────────────────────────── */}
        <section>
          <div className="fg-rule mb-5">
            <span>Exhibit A</span>
            <span>Three indicators &middot; annual</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'population',       label: 'Population',              icon: Building2,  latest: trendsData[trendsData.length - 1].population.toLocaleString(),                                   delta: popDelta, color: '#4a7c59', valueKey: 'population', formatVal: v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v), positiveIsGood: true },
              { key: 'income',           label: 'Median Household Income', icon: DollarSign, latest: `$${trendsData[trendsData.length - 1].medianIncome.toLocaleString()}`,                         delta: incDelta, color: '#1a5c2e', valueKey: 'medianIncome', formatVal: v => `$${(v/1000).toFixed(0)}K`,                       positiveIsGood: true },
              { key: 'unemployment',     label: 'Unemployment Rate',       icon: Zap,        latest: `${trendsData[trendsData.length - 1].unemploymentRate}%`,                                     delta: uneDelta, color: '#b45309', valueKey: 'unemploymentRate', formatVal: v => `${v}%`,                                      positiveIsGood: false },
            ].map(({ key, label, icon: Icon, latest, delta, color, valueKey, formatVal, positiveIsGood }) => {
              const dcolor = metricColor(delta, positiveIsGood);
              return (
                <div key={key}
                     className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] p-5"
                     style={{ backgroundColor: 'var(--color-cream)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" style={{ color: 'var(--color-ink-muted)' }} />
                      <span className="text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                        {label}
                      </span>
                    </div>
                    <span className="text-[0.6rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)', opacity: 0.7 }}>
                      {lastYr}
                    </span>
                  </div>
                  <div className="fg-numeral text-4xl mb-1" style={{ color: 'var(--color-ink)' }}>{latest}</div>
                  {delta && (
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] font-mono mb-4 flex items-center gap-1.5" style={{ color: dcolor }}>
                      <span aria-hidden>{delta.positive ? '\u2191' : '\u2193'}</span>
                      <span>{delta.text}</span>
                    </div>
                  )}
                  <MiniBarChart data={trendsData} valueKey={valueKey} color={color} formatVal={formatVal} />
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Annual data table ────────────────────────────────────── */}
        <section>
          <div className="fg-rule mb-5">
            <span>Exhibit B</span>
            <span>Annual Data Table</span>
          </div>
          <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] overflow-hidden"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]">
                    {['Year', 'Population', 'Median Income', 'Unemployment'].map((h, i) => (
                      <th key={h}
                          className={`py-3 px-4 text-[0.65rem] uppercase tracking-[0.22em] font-mono font-normal ${i === 0 ? 'text-left' : 'text-right'}`}
                          style={{ color: 'var(--color-ink-muted)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trendsData.map((row) => (
                    <tr key={row.year} className="border-b border-dashed border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)] last:border-0">
                      <td className="py-3 px-4 font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>{row.year}</td>
                      <td className="py-3 px-4 text-right fg-numeral text-lg" style={{ color: 'var(--color-ink)' }}>
                        {row.population.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right fg-numeral text-lg" style={{ color: 'var(--color-ink)' }}>
                        ${row.medianIncome.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right fg-numeral text-lg" style={{ color: 'var(--color-ink)' }}>
                        {row.unemploymentRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-[0.65rem] uppercase tracking-[0.22em] font-mono leading-relaxed" style={{ color: 'var(--color-ink-muted)', opacity: 0.75 }}>
            Source &mdash; U.S. Census Bureau American Community Survey 5-Year Estimates (ACS5) · County level · 2020 figures use experimental estimates due to COVID-19 data collection disruptions.
          </p>
        </section>
      </div>
    );
  };

  // ── About View ─────────────────────────────────────────────────────────────
  const AboutView = () => {
    const dataSources = [
      { n: '01', name: 'USDA ERS Rural-Urban Commuting Area Codes (RUCA)', vintage: '2020', scale: '41,146 ZCTAs',     detail: 'Primary ZIP-level classification', url: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/' },
      { n: '02', name: 'USDA ERS Rural-Urban Continuum Codes (RUCC)',     vintage: '2023', scale: '3,233 counties',    detail: 'Nonmetro / metro continuum',       url: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/' },
      { n: '03', name: 'US Census Bureau ACS 5-Year Estimates',           vintage: '2022', scale: 'County level',      detail: 'Population · income · unemployment · median age', url: 'https://www.census.gov/programs-surveys/acs' },
      { n: '04', name: 'Census Geocoder API',                             vintage: 'live', scale: 'service',           detail: 'Coordinate → county FIPS + land area for density', url: 'https://geocoding.geo.census.gov/' },
      { n: '05', name: 'OpenStreetMap / Nominatim',                       vintage: 'live', scale: 'service',           detail: 'Forward/reverse geocoding, rate-limited',          url: 'https://nominatim.openstreetmap.org/' },
      { n: '06', name: 'FCC Census Area API',                             vintage: 'live', scale: 'fallback',          detail: 'County FIPS lookup when Census Geocoder is down',  url: 'https://geo.fcc.gov/api/census/' },
    ];

    const limitations = [
      'RUCA codes are from 2020 and RUCC codes from 2023, based on 2020 Census data. Rural character can change; scores may not reflect the most recent development.',
      'Population density is calculated from 2022 ACS county totals divided by land area — it does not capture within-county variation.',
      'The composite Rurality Index is a research tool, not an official federal designation. It should complement, not replace, official classifications for regulatory or funding purposes.',
      'RUCA is only available for ZIPs that appear in the USDA ZCTA file. Some ZIP codes (PO boxes, unique ZIPs) are not included.',
      'Distance-to-metro scores use a fixed list of large, medium, and small metro areas. Commuting patterns in border regions may not be fully captured.',
      'Broadband data is not yet incorporated in the live scoring; the weight redistributes to density and distance when broadband data is unavailable.',
      'County counts vary by source. USDA ERS RUCC 2023 covers 3,233 counties; the app\u2019s working total of 3,235 includes county-equivalent jurisdictions such as Louisiana parishes, Alaska boroughs and census areas, Virginia independent cities, and the District of Columbia. Census ACS vintages land near 3,143. Totals will not match every federal source exactly.',
    ];

    const Chapter = ({ num, kicker, title, children }) => (
      <section className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <div className="fg-numeral text-7xl sm:text-8xl leading-none" style={{ color: 'var(--color-wheat)' }}>{num}</div>
              <div className="mt-2 text-[0.7rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>{kicker}</div>
              <h3 className="fg-display text-3xl mt-2 leading-tight" style={{ color: 'var(--color-ink)' }}>{title}</h3>
            </div>
          </div>
          <div className="lg:col-span-9 space-y-5">{children}</div>
        </div>
      </section>
    );

    return (
      <div className="space-y-16 sm:space-y-20 pb-8">
        {/* ── Editorial opening ─────────────────────────────────────── */}
        <header className="topo-bg rounded-2xl border border-[rgba(26,58,42,0.14)] dark:border-[rgba(255,255,255,0.08)] px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
                style={{ backgroundColor: 'var(--color-parchment)' }}>
          <div className="fg-rule mb-8">
            <span>§ About</span>
            <span className="hidden sm:inline">The Project &amp; the People</span>
            <span>Est. 2026</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-4 mb-5">
                <img
                  src={`${process.env.PUBLIC_URL}/logo.svg`}
                  alt="Rurality.app logo"
                  className="w-12 h-12 flex-shrink-0"
                />
                <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  Rurality.app &middot; Open access &middot; Real data
                </div>
              </div>
              <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
                A research tool for <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>rural</em> America.
              </h2>
              <p className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300"
                 style={{ fontFamily: 'var(--font-display)' }}>
                Rurality.app measures and communicates the ruralness of any U.S. location. Every score
                is calculated from real, publicly available government datasets &mdash; no simulated
                or estimated values. Built to serve researchers, policymakers, journalists, and anyone
                curious about rural America.
              </p>
            </div>

            <aside className="lg:col-span-4">
              <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
                <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  The Workshop
                </div>
                <div className="fg-display text-lg leading-snug mb-2" style={{ color: 'var(--color-ink)' }}>
                  Institute for Rural Initiatives
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Arkansas State University. Ongoing research on election administration, civic
                  engagement, public health, and economic opportunity in rural contexts.
                </p>
              </div>
            </aside>
          </div>
        </header>

        {/* ── §1 The Author ─────────────────────────────────────────── */}
        <Chapter num="§1" kicker="The Author" title={<>Who built <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>this</em>.</>}>
          <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] p-5 sm:p-6 flex flex-col sm:flex-row gap-5"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            {/* Monogram plate */}
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-lg flex items-center justify-center"
                   style={{ backgroundColor: 'var(--color-forest)' }}>
                <div className="relative">
                  <span className="fg-display text-[3.25rem] leading-none" style={{ color: 'var(--color-wheat)', letterSpacing: '-0.12em' }}>
                    CW
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[0.6rem] uppercase tracking-[0.28em] font-mono text-center" style={{ color: 'var(--color-ink-muted)' }}>
                Plate №&nbsp;01
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-1" style={{ color: 'var(--color-ink-muted)' }}>
                Principal
              </div>
              <div className="fg-display text-2xl leading-tight" style={{ color: 'var(--color-ink)' }}>
                Cameron Wimpy
              </div>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed" style={{ fontFamily: 'var(--font-display)' }}>
                Associate Professor &amp; Department Chair, Government, Law &amp; Policy<br />
                Director, Institute for Rural Initiatives<br />
                Arkansas State University
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Cameron&rsquo;s research focuses on election administration, political methodology, and
                rural public policy. His current work examines how rurality affects outcomes in
                election administration and the voter experience.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="https://github.com/cwimpy/rurality-app" target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.24em] font-mono px-3 py-1.5 rounded border"
                   style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                  <ExternalLink className="w-3 h-3" />
                  <span>GitHub Repository</span>
                </a>
                <a href="https://github.com/cwimpy" target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.24em] font-mono px-3 py-1.5 rounded border"
                   style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                  <ExternalLink className="w-3 h-3" />
                  <span>More Projects</span>
                </a>
              </div>
            </div>
          </div>
        </Chapter>

        {/* ── §2 Background / motivation ────────────────────────────── */}
        <Chapter num="§2" kicker="The Motivation" title={<>Why <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>build</em> this.</>}>
          <p className="fg-display text-xl sm:text-2xl leading-snug italic max-w-3xl" style={{ color: 'var(--color-ink)' }}>
            Rurality shapes election administration, civic engagement, public health access, and
            economic opportunity, and yet most measures of it are categorical, outdated, or
            designed for purposes far removed from the research at hand.
          </p>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            The tool supports work at the{' '}
            <strong style={{ color: 'var(--color-ink)' }}>Institute for Rural Initiatives at Arkansas State University</strong>,
            where ongoing research examines how rurality interacts with the operations of American
            democracy. The composite Rurality Index draws on methods from the USDA Economic Research
            Service, the U.S. Census Bureau, and the peer-reviewed literature on rural classification.
          </p>
        </Chapter>

        {/* ── §3 Data sources ───────────────────────────────────────── */}
        <Chapter num="§3" kicker="The Foundations" title={<>Data <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>sources</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Every value shown in the app traces back to one of these public sources. No survey
            estimates are invented, no scores interpolated beyond what the underlying data support.
          </p>
          <ul className="divide-y divide-dashed divide-[rgba(26,58,42,0.18)] dark:divide-[rgba(255,255,255,0.1)] border-y border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)]">
            {dataSources.map(({ n, name, vintage, scale, detail, url }) => (
              <li key={n} className="grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-6 py-4 items-baseline">
                <span className="fg-numeral text-2xl sm:text-3xl w-10" style={{ color: 'var(--color-wheat)' }}>{n}</span>
                <div>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                     className="fg-display text-lg leading-tight inline-flex items-baseline gap-1.5 hover:underline"
                     style={{ color: 'var(--color-ink)' }}>
                    {name} <ExternalLink className="w-3 h-3 self-center" />
                  </a>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                    Vintage {vintage} &middot; {scale}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Chapter>

        {/* ── §4 Limitations ────────────────────────────────────────── */}
        <Chapter num="§4" kicker="The Fine Print" title={<>Limitations &amp; <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>caveats</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Every measurement tool has limitations, these are ours.
          </p>
          <ol className="space-y-4">
            {limitations.map((text, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-5 items-baseline">
                <span className="fg-numeral text-2xl w-10" style={{ color: 'var(--color-wheat)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-sm sm:text-[0.95rem] leading-relaxed text-slate-700 dark:text-slate-300"
                   style={{ fontFamily: 'var(--font-display)' }}>
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </Chapter>

        {/* ── Source & feedback ─────────────────────────────────────── */}
        <section className="border-t border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)] pt-10">
          <div className="fg-rule mb-6">
            <span>Source &amp; Feedback:</span>
            <span>Built in the open</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <p className="fg-display text-xl sm:text-2xl leading-snug italic max-w-2xl" style={{ color: 'var(--color-ink)' }}>
                Built with React, Tailwind, and Leaflet. Deployed on Netlify. Source on GitHub.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-3">
              <a href="https://github.com/cwimpy/rurality-app"
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center justify-between px-4 py-3 rounded-md text-sm uppercase tracking-wider font-mono"
                 style={{ backgroundColor: 'var(--color-forest)', color: '#fff' }}>
                <span>View Source</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a href="https://github.com/cwimpy/rurality-app/issues"
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center justify-between px-4 py-3 rounded-md text-sm uppercase tracking-wider font-mono border"
                 style={{ borderColor: 'var(--color-forest)', color: 'var(--color-ink)' }}>
                <span>Open an Issue</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  };

  // ── Methodology View ────────────────────────────────────────────────────────
  const MethodologyView = () => {
    // Helper: color a RUCA score along the urban → rural ramp
    const scoreColor = (s) => {
      if (s < 20) return '#991b1b';
      if (s < 40) return '#b45309';
      if (s < 60) return '#a17321';
      if (s < 80) return '#4a7c59';
      return '#1a5c2e';
    };
    const ombColor = (t) =>
      t === 'Metro'    ? '#991b1b' :
      t === 'Micro'    ? '#b45309' :
                         '#4a7c59';

    const weightScenarios = [
      { label: 'RUCA + Broadband',   confidence: 'High',        parts: [['RUCA', 50, '#1a3a2a'], ['Density', 25, '#4a7c59'], ['Distance', 15, '#a17321'], ['Broadband', 10, '#d4a843']] },
      { label: 'RUCA only',          confidence: 'Medium-high', parts: [['RUCA', 55, '#1a3a2a'], ['Density', 25, '#4a7c59'], ['Distance', 20, '#a17321']] },
      { label: 'Broadband, no RUCA', confidence: 'Medium',      parts: [['Density', 50, '#4a7c59'], ['Distance', 25, '#a17321'], ['Broadband', 25, '#d4a843']] },
      { label: 'Density + Distance', confidence: 'Medium',      parts: [['Density', 55, '#4a7c59'], ['Distance', 45, '#a17321']] },
    ];

    const rucaCodes = [
      [1,'Metropolitan area core',8],
      [2,'Metropolitan — high commuting',15],
      [3,'Metropolitan — low commuting',24],
      [4,'Micropolitan (small city) core',38],
      [5,'Micropolitan — high commuting',48],
      [6,'Micropolitan — low commuting',56],
      [7,'Small town core',68],
      [8,'Small town — high commuting',76],
      [9,'Small town — low commuting',84],
      [10,'Rural — no significant urban commuting',95],
    ];

    const ruccCodes = [
      [1,'Metro ≥1M population','Metro'],
      [2,'Metro 250K–1M','Metro'],
      [3,'Metro <250K','Metro'],
      [4,'Nonmetro urban 20K+, adjacent','Micro'],
      [5,'Nonmetro urban 20K+, not adjacent','Micro'],
      [6,'Nonmetro urban 2.5–20K, adjacent','Nonmetro'],
      [7,'Nonmetro urban 2.5–20K, not adj.','Nonmetro'],
      [8,'Completely rural, adjacent','Nonmetro'],
      [9,'Completely rural, not adjacent','Nonmetro'],
    ];

    const densitySamples = [
      ['1/sq mi','≈ 100'], ['100/sq mi','≈ 70'], ['1,000/sq mi','≈ 45'],
      ['10,000/sq mi','≈ 20'], ['27,000/sq mi','0'],
    ];

    const refs = [
      { n: '01', citation: 'USDA Economic Research Service. (2023). Rural-Urban Continuum Codes.', url: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/' },
      { n: '02', citation: 'USDA Economic Research Service. (2020). Rural-Urban Commuting Area Codes.', url: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/' },
      { n: '03', citation: 'Cromartie, J., & Bucholtz, S. (2008). Defining the “rural” in rural America. Amber Waves, 6(3), 28–34. USDA ERS.', url: null },
      { n: '04', citation: 'Hart, L. G., Larson, E. H., & Lishner, D. M. (2005). Rural definitions for health policy and research. American Journal of Public Health, 95(7), 1149–1155.', url: null },
      { n: '05', citation: 'US Office of Management and Budget. (2023). OMB Bulletin No. 23-01: Revised delineations of metropolitan, micropolitan, and combined statistical areas.', url: null },
    ];

    const Chapter = ({ num, kicker, title, children }) => (
      <section className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <div className="fg-numeral text-7xl sm:text-8xl leading-none" style={{ color: 'var(--color-wheat)' }}>
                {num}
              </div>
              <div className="mt-2 text-[0.7rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                {kicker}
              </div>
              <h3 className="fg-display text-3xl mt-2 leading-tight" style={{ color: 'var(--color-ink)' }}>
                {title}
              </h3>
            </div>
          </div>
          <div className="lg:col-span-9 space-y-5">{children}</div>
        </div>
      </section>
    );

    return (
      <div className="space-y-16 sm:space-y-20 pb-8">
        {/* ── Editorial opening ─────────────────────────────────────── */}
        <header className="topo-bg rounded-2xl border border-[rgba(26,58,42,0.14)] dark:border-[rgba(255,255,255,0.08)] px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
                style={{ backgroundColor: 'var(--color-parchment)' }}>
          <div className="fg-rule mb-8">
            <span>§ The Rurality Index</span>
            <span className="hidden sm:inline">A Working Methodology</span>
            <span>v. 2026</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8">
              <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
                How the <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>index</em> is built.
              </h2>
              <p className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300"
                 style={{ fontFamily: 'var(--font-display)' }}>
                The <strong>Rurality Index</strong> (RRI) is a continuous 0–100 score in which higher
                values indicate greater rurality. It draws on up to four components from authoritative
                federal datasets. Weights adapt to data availability, with the USDA&rsquo;s RUCA
                classification anchoring the score whenever a ZIP code can be matched.
              </p>
            </div>

            <aside className="lg:col-span-4">
              <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
                <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  Reading the Score
                </div>
                {[
                  ['80–100', 'Very Rural', '#1a5c2e'],
                  ['60–79',  'Rural',      '#4a7c59'],
                  ['40–59',  'Mixed',      '#a17321'],
                  ['20–39',  'Suburban',   '#b45309'],
                  ['0–19',   'Urban',      '#991b1b'],
                ].map(([range, label, c], i, arr) => (
                  <div key={label}
                       className={`flex items-center justify-between py-2 ${i !== arr.length - 1 ? 'border-b border-dashed border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]' : ''}`}>
                    <span className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                      <span className="font-mono text-xs tracking-wider" style={{ color: 'var(--color-ink)' }}>{range}</span>
                    </span>
                    <span className="text-sm uppercase tracking-wider" style={{ color: c, fontWeight: 600 }}>{label}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </header>

        {/* ── §1 Weights ────────────────────────────────────────────── */}
        <Chapter num="§1" kicker="The Weighting Scheme" title={<>How the pieces <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>combine</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Not every location has every input. When a ZIP can be matched to USDA RUCA, we lean on it.
            When it can&rsquo;t (say, for a county-level query), weight shifts to density and
            distance. The confidence label summarizes how strong the weighting is for that scenario.
          </p>

          <div className="space-y-5 mt-2">
            {weightScenarios.map(({ label, confidence, parts }) => (
              <div key={label}>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="flex items-baseline gap-3">
                    <span className="fg-display text-xl" style={{ color: 'var(--color-ink)' }}>{label}</span>
                    <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                      {confidence}
                    </span>
                  </div>
                </div>
                {/* stacked bar */}
                <div className="flex h-9 rounded-md overflow-hidden border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]">
                  {parts.map(([name, pct, color]) => (
                    <div key={name}
                         className="flex items-center justify-center text-[0.65rem] uppercase tracking-wider text-white font-mono"
                         style={{ width: `${pct}%`, backgroundColor: color, minWidth: 0 }}
                         title={`${name} ${pct}%`}>
                      <span className="truncate px-2">{pct >= 18 ? `${name} ${pct}%` : `${pct}%`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Chapter>

        {/* ── §2 Components — RUCA ──────────────────────────────────── */}
        <Chapter num="01" kicker="Component · ZIP-level" title={<>RUCA &mdash; <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>the anchor</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            The USDA Rural-Urban Commuting Area code is the gold standard for ZIP-level rural
            classification. It uses Census commuting-flow data to categorize ZIP Code Tabulation Areas
            by their integration with urban cores on a 1&ndash;10 scale.
          </p>

          <div className="mt-2 rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] overflow-hidden"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="px-4 py-2 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.28em] font-mono border-b border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)]"
                 style={{ color: 'var(--color-ink-muted)' }}>
              <span>Exhibit A · RUCA scoring</span>
              <span>Score out of 100</span>
            </div>
            <ul className="divide-y divide-dashed divide-[rgba(26,58,42,0.12)] dark:divide-[rgba(255,255,255,0.08)]">
              {rucaCodes.map(([code, desc, score]) => (
                <li key={code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold"
                        style={{ backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
                    {code}
                  </span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{desc}</span>
                  <div className="flex items-center gap-3 min-w-[160px]">
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
                      <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
                    </div>
                    <span className="fg-numeral text-xl w-8 text-right" style={{ color: scoreColor(score) }}>{score}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Source: USDA ERS RUCA 2020 · 41,146 ZCTAs · updated decennially with Census commuting data.
          </p>
        </Chapter>

        {/* ── §3 Components — RUCC ──────────────────────────────────── */}
        <Chapter num="02" kicker="Component · County-level" title={<>RUCC &amp; the <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>OMB</em> designation.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            The USDA Rural-Urban Continuum Code classifies U.S. counties on a 1&ndash;9 scale and is
            the basis for the OMB Metropolitan / Micropolitan / Nonmetro designation shown in the
            classifications panel. RUCC is displayed for reference and OMB derivation; it does not
            enter the composite score directly.
          </p>

          <div className="mt-2 rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] overflow-hidden"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="px-4 py-2 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.28em] font-mono border-b border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)]"
                 style={{ color: 'var(--color-ink-muted)' }}>
              <span>Exhibit B · RUCC → OMB</span>
              <span>9 tiers</span>
            </div>
            <ul className="divide-y divide-dashed divide-[rgba(26,58,42,0.12)] dark:divide-[rgba(255,255,255,0.08)]">
              {ruccCodes.map(([code, desc, omb]) => (
                <li key={code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold"
                        style={{ backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
                    {code}
                  </span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{desc}</span>
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] font-mono px-2 py-1 rounded"
                        style={{ color: ombColor(omb), backgroundColor: `${ombColor(omb)}1a` }}>
                    {omb}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Source: USDA ERS RUCC 2023 · 3,233 U.S. counties · updated on each decennial revision.
          </p>
        </Chapter>

        {/* ── §4 Components — Density ───────────────────────────────── */}
        <Chapter num="03" kicker="Component · Log-transformed" title={<>Population <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>density</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            County population (ACS 2022) divided by land area in square miles (Census TIGER via Census
            Geocoder). The score is log-transformed so extremely dense urban cores don&rsquo;t compress
            variation across rural and suburban areas.
          </p>

          <div className="rounded-lg overflow-hidden border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
               style={{ backgroundColor: 'var(--color-forest)' }}>
            <div className="px-4 py-2 text-[0.65rem] uppercase tracking-[0.28em] font-mono text-white/60 border-b border-white/10">
              The Formula
            </div>
            <div className="px-4 py-5 font-mono text-sm sm:text-base text-white">
              <span style={{ color: 'var(--color-wheat)' }}>score</span> = 100 &minus; log<sub>10</sub>(<em>density</em>) × 25
              <div className="text-xs text-white/50 mt-1">clamped to [0, 100]</div>
            </div>
          </div>

          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-2 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
              Reference Points
            </div>
            <div className="grid grid-cols-5 gap-2">
              {densitySamples.map(([d, s]) => {
                const val = parseInt(s.replace(/[^0-9]/g, '') || '0', 10);
                return (
                  <div key={d} className="rounded border border-dashed p-3 text-center border-[rgba(26,58,42,0.2)] dark:border-[rgba(255,255,255,0.12)]"
                       style={{ backgroundColor: 'var(--color-cream)' }}>
                    <div className="fg-numeral text-2xl" style={{ color: scoreColor(val) }}>{s}</div>
                    <div className="text-[0.65rem] uppercase tracking-wider mt-1 text-slate-500 dark:text-slate-400">{d}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Chapter>

        {/* ── §5 Components — Distance ──────────────────────────────── */}
        <Chapter num="04" kicker="Component · Three-tier" title={<>Distance to <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>metro</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Haversine distance from the queried coordinates to the nearest metro area in each of three
            size tiers. The three distances are combined into a single score with differential weights.
            Large-metro distance dominates because proximity to a major city is the strongest single
            determinant of rural isolation in the literature.
          </p>

          <div className="space-y-3">
            {[
              { tier: 'Large',  size: '≥ 1M pop.',       weight: 0.50, divisor: 2,   color: '#1a3a2a' },
              { tier: 'Medium', size: '250K–1M',         weight: 0.30, divisor: 1.5, color: '#4a7c59' },
              { tier: 'Small',  size: '50K–250K',        weight: 0.20, divisor: 1,   color: '#a17321' },
            ].map(({ tier, size, weight, divisor, color }) => (
              <div key={tier} className="flex items-center gap-4 rounded-lg px-4 py-3 border border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)]"
                   style={{ backgroundColor: 'var(--color-cream)' }}>
                <div className="w-3 h-12 rounded-sm" style={{ backgroundColor: color }} />
                <div className="flex-1">
                  <div className="flex items-baseline gap-3">
                    <span className="fg-display text-lg" style={{ color: 'var(--color-ink)' }}>{tier}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 italic">{size}</span>
                  </div>
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-400 mt-1">
                    min(100, dist<sub>mi</sub> / {divisor}) &nbsp;×&nbsp;
                    <span style={{ color }}>{weight.toFixed(2)}</span>
                  </div>
                </div>
                <div className="fg-numeral text-3xl" style={{ color }}>{`${Math.round(weight * 100)}%`}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Summed across tiers and clamped to [0, 100]. Coordinates resolved via Census Geocoder or Nominatim.
          </p>
        </Chapter>

        {/* ── References ────────────────────────────────────────────── */}
        <section className="border-t border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)] pt-10">
          <div className="fg-rule mb-6">
            <span>End-matter:</span>
            <span>Key References</span>
          </div>
          <ol className="space-y-5 max-w-4xl">
            {refs.map(({ n, citation, url }) => (
              <li key={n} className="grid grid-cols-[auto_1fr] gap-4 sm:gap-6 items-baseline">
                <span className="fg-numeral text-2xl sm:text-3xl" style={{ color: 'var(--color-wheat)' }}>{n}</span>
                <p className="text-sm sm:text-[0.95rem] leading-relaxed text-slate-700 dark:text-slate-300"
                   style={{ fontFamily: 'var(--font-display)' }}>
                  {citation}
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                       className="ml-1.5 inline-flex items-center gap-0.5 text-xs uppercase tracking-wider font-mono no-underline hover:underline"
                       style={{ color: 'var(--color-ink-muted)' }}>
                      <ExternalLink className="w-3 h-3" /> link
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  };

  // ── For Researchers View ────────────────────────────────────────────────────
  const ForResearchersView = () => {
    const [citationCopied, setCitationCopied] = React.useState(false);

    const citation =
      `Wimpy, C. (2026). Rurality.app [Web application]. ` +
      `Institute for Rural Initiatives, Arkansas State University. ` +
      `https://rurality.app`;

    const copyCitation = () => {
      navigator.clipboard.writeText(citation).then(() => {
        setCitationCopied(true);
        setTimeout(() => setCitationCopied(false), 2000);
      });
    };

    const CodeBlock = ({ code }) => {
      const [copied, setCopied] = React.useState(false);
      const handleCopy = () => {
        navigator.clipboard.writeText(code.trim()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      };
      return (
        <div className="relative group">
          <pre className="bg-slate-900 text-green-300 text-xs rounded-xl p-4 pr-16 overflow-x-auto leading-relaxed whitespace-pre">
            {code.trim()}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-xs rounded-md transition-all bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      );
    };

    const uses = [
      { title: 'Survey research',         desc: 'Classify respondents by rurality using their ZIP code. Merge RUCA codes onto survey microdata for subgroup analysis.' },
      { title: 'Election administration', desc: 'Identify rural jurisdictions for comparative analysis of polling place access, wait times, and mail ballot use.' },
      { title: 'Public health',           desc: 'Stratify health outcomes by RUCC or composite RRI. Examine rural–urban gradients in access, mortality, or utilization.' },
      { title: 'Policy evaluation',       desc: 'Define treatment and control groups using OMB metro/nonmetro or RUCA thresholds. Consistent with USDA program eligibility rules.' },
      { title: 'Education research',      desc: 'Classify school districts or counties by rurality. Link to NCES locale codes for cross-framework comparison.' },
      { title: 'Grant proposals',         desc: 'Document the rurality of your study area with official USDA and OMB classifications to satisfy NSF, NIH, and USDA program requirements.' },
    ];

    const steps = [
      { n: '01', title: 'Load USDA RUCA & RUCC', code: `
library(tidyverse)
library(readxl)

# Download from USDA ERS (links in the Data Sources section below)
ruca <- read_csv("ruca2020_zcta.csv") |>
  transmute(
    zcta      = str_pad(as.character(ZIPCode), 5, pad = "0"),
    ruca_code = as.integer(PrimaryRUCA)
  ) |>
  filter(!is.na(ruca_code), between(ruca_code, 1L, 10L))

rucc <- read_csv("rucc2023.csv") |>
  filter(Attribute == "RUCC_2023") |>
  transmute(
    fips      = str_pad(as.character(FIPS), 5, pad = "0"),
    rucc_code = as.integer(Value),
    state     = str_sub(fips, 1, 2),
    county    = str_sub(fips, 3, 5)
  ) |>
  filter(!is.na(rucc_code), between(rucc_code, 1L, 9L))
` },
      { n: '02', title: 'Define classification helpers', code: `
# RUCA → rurality score (0–100)
ruca_to_score <- function(code) {
  map <- c("1"=8,"2"=15,"3"=24,"4"=38,"5"=48,
           "6"=56,"7"=68,"8"=76,"9"=84,"10"=95)
  unname(map[as.character(code)])
}

# Population density → score (log-transformed, 0–100)
density_to_score <- function(density) {
  score <- 100 - log10(pmax(density, 0.01)) * 25
  pmax(0, pmin(100, round(score)))
}

# OMB designation from RUCC
omb_designation <- function(rucc) {
  case_when(
    rucc <= 3 ~ "Metropolitan",
    rucc <= 5 ~ "Micropolitan",
    TRUE      ~ "Nonmetro"
  )
}

# Rural flag (RUCA >= 4 or RUCC >= 4)
is_rural_ruca <- function(code) code >= 4
is_rural_rucc <- function(code) code >= 4
` },
      { n: '03', title: 'Merge onto your county-level data', code: `
# Assumes your data has a 5-digit county FIPS column called "fips"
# and population + land area columns to compute density

your_data <- your_data |>
  left_join(rucc, by = "fips") |>
  mutate(
    pop_density   = total_population / land_area_sq_mi,
    density_score = density_to_score(pop_density),
    omb           = omb_designation(rucc_code),
    rural_rucc    = is_rural_rucc(rucc_code)
  )
` },
      { n: '04', title: 'Merge RUCA onto ZIP-level data', code: `
# Assumes your data has a 5-digit ZIP or ZCTA column called "zip"

your_zip_data <- your_zip_data |>
  mutate(zcta = str_pad(as.character(zip), 5, pad = "0")) |>
  left_join(ruca, by = "zcta") |>
  mutate(
    ruca_score = ruca_to_score(ruca_code),
    rural_ruca = is_rural_ruca(ruca_code)
  )
` },
      { n: '05', title: 'Compute composite Rurality Index', code: `
# Weights when RUCA is available but broadband data is not:
#   RUCA 55%, Population density 25%, Distance to metro 20%
# This simplified version uses RUCA + density (omits distance to metro).

your_data <- your_data |>
  mutate(
    rri = case_when(
      !is.na(ruca_score) ~
        ruca_score * 0.55 + density_score * 0.25,
      TRUE ~
        density_score * 0.55   # fallback: density only
    ),
    rri = pmax(0, pmin(100, round(rri))),
    rri_class = case_when(
      rri >= 80 ~ "Very Rural",
      rri >= 60 ~ "Rural",
      rri >= 40 ~ "Mixed",
      rri >= 20 ~ "Suburban",
      TRUE      ~ "Urban"
    )
  )
` },
    ];

    const sources = [
      { n: '01', name: 'USDA ERS Rural-Urban Commuting Area Codes (RUCA)', vintage: '2020', size: '41,146 ZCTAs',
        desc: 'ZIP/ZCTA level · Primary RUCA code 1–10',
        page: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/',
        file: 'https://www.ers.usda.gov/media/5442/2020-rural-urban-commuting-area-codes-zip-codes.xlsx',
        fileLabel: 'XLSX' },
      { n: '02', name: 'USDA ERS Rural-Urban Continuum Codes (RUCC)', vintage: '2023', size: '3,233 counties',
        desc: 'County level · RUCC code 1–9',
        page: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/',
        file: 'https://www.ers.usda.gov/media/5767/2023-rural-urban-continuum-codes.xlsx',
        fileLabel: 'XLSX' },
      { n: '03', name: 'US Census Bureau ACS 5-Year Estimates', vintage: '2018–2022', size: 'County level',
        desc: 'Population, income, unemployment',
        page: 'https://www.census.gov/programs-surveys/acs',
        file: 'https://api.census.gov/data/2022/acs/acs5/variables.html',
        fileLabel: 'Variables' },
      { n: '04', name: 'US Census Bureau Geocoder API', vintage: 'live', size: 'service',
        desc: 'Coordinate → county FIPS + land area (density calc)',
        page: 'https://geocoding.geo.census.gov/geocoder/',
        file: null, fileLabel: null },
    ];

    const Chapter = ({ num, kicker, title, children }) => (
      <section className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <div className="fg-numeral text-7xl sm:text-8xl leading-none" style={{ color: 'var(--color-wheat)' }}>
                {num}
              </div>
              <div className="mt-2 text-[0.7rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                {kicker}
              </div>
              <h3 className="fg-display text-3xl mt-2 leading-tight" style={{ color: 'var(--color-ink)' }}>
                {title}
              </h3>
            </div>
          </div>
          <div className="lg:col-span-9 space-y-5">{children}</div>
        </div>
      </section>
    );

    const InstallRow = ({ name, cmd, href, note }) => {
      const [copied, setCopied] = React.useState(false);
      const handleCopy = () => {
        navigator.clipboard.writeText(cmd).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      };
      return (
        <div className="rounded-lg overflow-hidden border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
             style={{ backgroundColor: 'var(--color-cream)' }}>
          <div className="flex items-center justify-between px-4 py-2 text-[0.65rem] uppercase tracking-[0.28em] font-mono border-b border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)]"
               style={{ color: 'var(--color-ink-muted)' }}>
            <span>{name}</span>
            {note && <span className="text-slate-400 dark:text-slate-500 normal-case tracking-normal font-sans text-[0.7rem] italic">{note}</span>}
          </div>
          <div className="flex items-center gap-3 p-3">
            <code className="flex-1 text-xs sm:text-[0.78rem] font-mono break-all" style={{ color: 'var(--color-ink)' }}>$ {cmd}</code>
            <button onClick={handleCopy}
                    className="flex-shrink-0 px-2.5 py-1 text-[0.65rem] uppercase tracking-wider font-mono rounded border transition-colors"
                    style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="flex-shrink-0 text-[0.65rem] uppercase tracking-wider font-mono inline-flex items-center gap-1"
               style={{ color: 'var(--color-ink-muted)' }}>
              <ExternalLink className="w-3 h-3" /> Repo
            </a>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-16 sm:space-y-20 pb-8">
        {/* ── Editorial opening ─────────────────────────────────────── */}
        <header className="topo-bg rounded-2xl border border-[rgba(26,58,42,0.14)] dark:border-[rgba(255,255,255,0.08)] px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
                style={{ backgroundColor: 'var(--color-parchment)' }}>
          <div className="fg-rule mb-8">
            <span>§ The Data Pavilion</span>
            <span className="hidden sm:inline">For Researchers</span>
            <span>Open · Citable · Replicable</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-8">
              <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
                Take the <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>data</em>,
                the <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>code</em>,
                and go.
              </h2>
              <p className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300"
                 style={{ fontFamily: 'var(--font-display)' }}>
                Rurality.app is built on publicly available federal datasets and a transparent
                composite methodology. Everything you need to cite the tool, replicate the
                scores in R, and merge the underlying data into your own analysis.
              </p>
            </div>

            <aside className="lg:col-span-4">
              <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
                <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  At a glance
                </div>
                {[
                  ['3,235', 'counties, ready to merge'],
                  ['24',    'variables in the CSV'],
                  ['4',     'ways in: CSV · R · Stata · API'],
                ].map(([n, l], i, arr) => (
                  <div key={l} className={`flex items-baseline gap-3 ${i !== arr.length - 1 ? 'mb-2 pb-2 border-b border-dashed border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]' : ''}`}>
                    <div className="fg-numeral text-3xl" style={{ color: 'var(--color-ink)' }}>{n}</div>
                    <div className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">{l}</div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </header>

        {/* ── §1 Cite ───────────────────────────────────────────────── */}
        <Chapter num="§1" kicker="Credit the Tool" title={<>How to <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>cite</em>.</>}>
          <div className="rounded-lg border-2 border-dashed border-[rgba(26,58,42,0.22)] dark:border-[rgba(255,255,255,0.14)] p-5 sm:p-6"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-3"
                 style={{ color: 'var(--color-ink-muted)' }}>
              <span>Cite as &mdash; APA 7</span>
              <button onClick={copyCitation}
                      className="px-2.5 py-1 rounded border transition-colors"
                      style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                {citationCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-base sm:text-lg leading-relaxed"
               style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
              {citation}
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            If you use the composite Rurality Index methodology in published work, please also cite
            the underlying USDA ERS data sources listed in &sect;5.
          </p>
        </Chapter>

        {/* ── §2 Suggested uses ─────────────────────────────────────── */}
        <Chapter num="§2" kicker="Where it Fits" title={<>Suggested <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>uses</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            This is a sampling of the research designs the index and its inputs tend to serve.
            They are drawn from political science, public health, education, and grantwriting practice.
          </p>
          <ol className="divide-y divide-dashed divide-[rgba(26,58,42,0.18)] dark:divide-[rgba(255,255,255,0.1)] border-y border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)]">
            {uses.map(({ title, desc }, i) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-5 py-4">
                <span className="fg-numeral text-2xl sm:text-3xl w-10" style={{ color: 'var(--color-wheat)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="fg-display text-lg" style={{ color: 'var(--color-ink)' }}>{title}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </Chapter>

        {/* ── §3 Access — four ways in ──────────────────────────────── */}
        <Chapter num="§3" kicker="Four Ports of Entry" title={<>Get the <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>data</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Pre-computed rurality scores for all 3,235 U.S. counties, ready to merge by FIPS.
            Includes RUCC 2023, population density, distance to metro, composite score, and ACS
            demographics. Pick the route that fits your workflow.
          </p>

          {/* Primary CSV download — prominent */}
          <div className="rounded-lg p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5"
               style={{ backgroundColor: 'var(--color-forest)' }}>
            <div className="flex-1">
              <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-wheat)' }}>
                Primary artifact · № 01
              </div>
              <div className="fg-display text-2xl text-white">County Rurality Dataset</div>
              <div className="mt-3 space-y-1.5">
                {[
                  ['Format',    'CSV'],
                  ['Rows',      '3,235 counties'],
                  ['Variables', '24'],
                  ['Size',      '≈ 500 KB'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-3">
                    <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono flex-shrink-0 w-24"
                          style={{ color: 'var(--color-wheat)' }}>{k}</span>
                    <span className="text-sm text-white">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <a href={`${process.env.PUBLIC_URL}/data/county_rurality.csv`}
               download="county_rurality.csv"
               className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-wider font-mono border"
               style={{ backgroundColor: 'var(--color-wheat)', color: '#1a3a2a', borderColor: 'var(--color-wheat)' }}>
              <Download className="w-4 h-4" />
              <span>Download CSV</span>
            </a>
          </div>

          {/* Package installs */}
          <div className="grid grid-cols-1 gap-3">
            <InstallRow
              name="№ 02 · R Package (CRAN)"
              note="install from CRAN or GitHub"
              cmd='install.packages("rurality")'
              href="https://github.com/cwimpy/rurality"
            />
            <InstallRow
              name="№ 03 · Stata Package"
              note="via net install"
              cmd='net install rurality, from("https://raw.githubusercontent.com/cwimpy/rurality-stata/main/")'
              href="https://github.com/cwimpy/rurality-stata"
            />
          </div>
        </Chapter>

        {/* ── §4 REST API ───────────────────────────────────────────── */}
        <Chapter num="§4" kicker="Programmatic Access" title={<>The <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>endpoint</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            Query rurality scores programmatically. No authentication. Returns JSON with RUCC
            codes, composite scores, demographics, and score components for all 3,235 U.S. counties.
          </p>

          {/* Endpoints as terminal */}
          <div className="rounded-lg overflow-hidden border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
               style={{ backgroundColor: '#0f1a15' }}>
            <div className="px-4 py-2 flex items-center justify-between border-b border-white/10">
              <span className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-wheat)' }}>Endpoints</span>
              <span className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#5c6b62' }} />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7a8f82' }} />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-sage)' }} />
              </span>
            </div>
            <div className="px-4 py-3 font-mono text-xs sm:text-[0.78rem] text-white/85 space-y-2">
              {[
                ['Single county by FIPS',     '/api/score?fips=05031'],
                ['All counties in a state',   '/api/score?state=AR'],
                ['Search by county name',     '/api/score?q=Craighead&limit=10'],
              ].map(([label, url]) => (
                <div key={url} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                  <span className="text-white/40 sm:w-52 flex-shrink-0"># {label}</span>
                  <span>
                    <span className="text-white/50">GET </span>
                    <span style={{ color: 'var(--color-wheat)' }}>https://rurality.app</span>
                    <span className="text-white">{url}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-sage) ' }}>
              Example in R
            </div>
            <CodeBlock code={`library(httr2)
library(jsonlite)

# Get all Arkansas counties
resp <- request("https://rurality.app/api/score") |>
  req_url_query(state = "AR") |>
  req_perform()

ar <- fromJSON(resp_body_string(resp))$results

# Merge onto your data by FIPS
your_data <- your_data |>
  left_join(ar, by = "fips")`} />
          </div>

          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-sage) ' }}>
              Example response
            </div>
            <CodeBlock code={`{
  "count": 1,
  "results": [{
    "fips": "05031",
    "state": "AR",
    "county": "Craighead County",
    "population_2020": 114778,
    "rucc_2023": 3,
    "rurality_score": 40,
    "classification": "Mixed",
    "components": {
      "rucc_score": 28,
      "density_score": 46,
      "distance_score": 98
    }
  }]
}`} />
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            The API serves pre-computed county-level data. For ZIP-level RUCA lookups,
            use the R or Stata packages in &sect;3.
          </p>
        </Chapter>

        {/* ── §5 R replication walkthrough ──────────────────────────── */}
        <Chapter num="§5" kicker="Step-by-Step in R" title={<>Replicate the <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>score</em>.</>}>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-display)' }}>
            The composite Rurality Index can be replicated entirely in R using the same USDA and
            Census data this app uses. The five exhibits below walk through each step.
          </p>

          <ol className="space-y-6">
            {steps.map(({ n, title: t, code }, i) => (
              <li key={n} className="relative pl-6 sm:pl-8">
                <span className="absolute left-0 top-0 bottom-0 w-px" style={{ backgroundColor: 'rgba(26,58,42,0.15)' }} aria-hidden />
                <span className="absolute left-[-0.4rem] top-1 w-3 h-3 rounded-full"
                      style={{ backgroundColor: 'var(--color-wheat)', boxShadow: '0 0 0 4px var(--color-cream)' }} aria-hidden />
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="fg-numeral text-2xl" style={{ color: 'var(--color-wheat)' }}>{n}</span>
                  <span className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>Exhibit {n} of {String(steps.length).padStart(2, '0')}</span>
                </div>
                <h4 className="fg-display text-xl mb-3" style={{ color: 'var(--color-ink)' }}>{t}</h4>
                <CodeBlock code={code} />
              </li>
            ))}
          </ol>

          <div className="rounded-lg px-4 py-3 border-l-4 text-sm"
               style={{ borderColor: 'var(--color-wheat)', backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.24em] mr-2" style={{ color: 'var(--color-ink-muted)' }}>Note</span>
            The full composite score also incorporates distance to the nearest metro area.
            Omitting this component shifts weight to RUCA and density, which is appropriate for
            most county- or ZIP-level analyses. See the {' '}
            <button onClick={() => { setActiveView('methodology'); window.scrollTo(0, 0); }}
                    className="underline font-medium">
              Methodology page
            </button>{' '}
            for complete weight tables.
          </div>
        </Chapter>

        {/* ── §6 Data Sources ───────────────────────────────────────── */}
        <Chapter num="§6" kicker="The Catalogue" title={<>Source <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>datasets</em>.</>}>
          <ul className="divide-y divide-dashed divide-[rgba(26,58,42,0.18)] dark:divide-[rgba(255,255,255,0.1)] border-y border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)]">
            {sources.map(({ n, name, vintage, size, desc, page, file, fileLabel }) => (
              <li key={n} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 sm:gap-6 py-4 items-baseline">
                <span className="fg-numeral text-2xl sm:text-3xl w-10" style={{ color: 'var(--color-wheat)' }}>{n}</span>
                <div>
                  <a href={page} target="_blank" rel="noopener noreferrer"
                     className="fg-display text-lg leading-tight inline-flex items-baseline gap-1.5 hover:underline"
                     style={{ color: 'var(--color-ink)' }}>
                    {name} <ExternalLink className="w-3 h-3 self-center" />
                  </a>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{desc}</div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                    Vintage {vintage} &middot; {size}
                  </div>
                </div>
                {file && (
                  <a href={file} target="_blank" rel="noopener noreferrer"
                     className="self-baseline sm:self-center flex-shrink-0 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.2em] font-mono rounded border inline-flex items-center gap-1.5"
                     style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}>
                    <Download className="w-3 h-3" /> {fileLabel}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Chapter>

        {/* ── §7 Embed ──────────────────────────────────────────────── */}
        <Chapter num="§7" kicker="On Your Own Site" title={<>Embed the <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>widget</em>.</>}>
          <div className="rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] overflow-hidden"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <EmbedWidget />
          </div>
        </Chapter>

        {/* ── End-matter: collaboration ─────────────────────────────── */}
        <section className="border-t border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)] pt-10">
          <div className="fg-rule mb-6">
            <span>End-matter:</span>
            <span>Collaboration &amp; Feedback</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <p className="fg-display text-2xl sm:text-3xl leading-snug italic" style={{ color: 'var(--color-ink)' }}>
                If you use Rurality.app in published research, we would love to hear about it.
              </p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                Bug reports, methodology suggestions, and data quality issues are tracked on GitHub.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-3">
              <a href="https://github.com/cwimpy/rurality-app/issues"
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center justify-between px-4 py-3 rounded-md text-sm uppercase tracking-wider font-mono"
                 style={{ backgroundColor: 'var(--color-forest)', color: '#fff' }}>
                <span>Open a GitHub Issue</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a href="https://github.com/cwimpy/rurality-app"
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center justify-between px-4 py-3 rounded-md text-sm uppercase tracking-wider font-mono border"
                 style={{ borderColor: 'var(--color-forest)', color: 'var(--color-ink)' }}>
                <span>View Source</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen grain-bg" style={{ backgroundColor: 'var(--color-cream)' }}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-green-700 focus:rounded-lg focus:shadow-lg">
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: 'var(--color-forest)', borderColor: 'rgba(212,168,67,0.25)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => { setActiveView('dashboard'); setMenuOpen(false); setRuralityData(null); setSearchQuery(''); setCurrentLocation(''); setError(''); window.history.replaceState({}, '', window.location.pathname); window.scrollTo(0, 0); }}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <img
                src={`${process.env.PUBLIC_URL}/logo.svg`}
                alt="Rurality.app logo"
                className="w-7 h-7"
              />
              <div className="text-left">
                <h1 className="text-lg font-bold text-white tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                  Rurality.app
                </h1>
                <div className="hidden sm:block mt-1 text-[0.55rem] uppercase tracking-[0.28em] font-mono leading-tight" style={{ color: 'var(--color-wheat)' }}>
                  A Field Guide &middot; Ed. 2026
                </div>
              </div>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0">
              {[
                { id: 'dashboard',    label: 'Dashboard',       icon: BarChart3 },
                { id: 'map',          label: 'Map',             icon: MapPin },
                { id: 'statemap',     label: 'US Counties',     icon: Globe },
                { id: 'batch',        label: 'Batch',           icon: FileSpreadsheet },
                { id: 'trends',       label: 'Trends',          icon: TrendingUp },
                { id: 'methodology',  label: 'Methodology',     icon: FlaskConical },
                { id: 'researchers',  label: 'For Researchers',  icon: BookOpen },
                { id: 'about',        label: 'About',           icon: Info }
              ].map(({ id, label, icon: Icon }) => {
                const active = activeView === id;
                return (
                  <button
                    key={id}
                    title={label}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setActiveView(id);
                      if (id === 'trends' && locationMeta && !trendsData && !trendsLoading) {
                        setTrendsLoading(true);
                        fetchMultiYearCensusData(locationMeta.stateFips, locationMeta.countyFips)
                          .then(data => { setTrendsData(data); setTrendsLoading(false); })
                          .catch(() => setTrendsLoading(false));
                      }
                    }}
                    className="relative flex items-center gap-1.5 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.18em] font-mono transition-colors"
                    style={{ color: active ? 'var(--color-wheat)' : 'rgba(255,255,255,0.65)' }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {active && (
                      <span className="absolute left-3 right-3 -bottom-[1px] h-[2px]" style={{ backgroundColor: 'var(--color-wheat)' }} />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center space-x-1">
              <DarkModeToggle />
              {/* Hamburger button — mobile only */}
              <button
                className="md:hidden text-white/80 hover:text-white p-1.5"
              onClick={() => setMenuOpen(prev => !prev)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <nav className="md:hidden border-t border-white/10 px-4 pb-3 pt-2 space-y-1" style={{ backgroundColor: 'var(--color-forest)' }}>
            {[
              { id: 'dashboard',    label: 'Dashboard',       icon: BarChart3 },
              { id: 'map',          label: 'Map',             icon: MapPin },
              { id: 'trends',       label: 'Trends',          icon: TrendingUp },
              { id: 'methodology',  label: 'Methodology',     icon: FlaskConical },
              { id: 'researchers',  label: 'For Researchers',  icon: BookOpen },
              { id: 'about',        label: 'About',           icon: Info }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveView(id);
                  setMenuOpen(false);
                  window.scrollTo(0, 0);
                  if (id === 'trends' && locationMeta && !trendsData && !trendsLoading) {
                    setTrendsLoading(true);
                    fetchMultiYearCensusData(locationMeta.stateFips, locationMeta.countyFips)
                      .then(data => { setTrendsData(data); setTrendsLoading(false); })
                      .catch(() => setTrendsLoading(false));
                  }
                }}
                className={`flex items-center space-x-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeView === id
                    ? 'bg-white/20 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Development notice */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-start gap-3 rounded-md border-l-4 px-4 py-3 text-xs sm:text-[0.78rem] leading-relaxed"
             style={{ borderColor: 'var(--color-wheat)', backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-wheat)' }} />
          <div>
            <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-2" style={{ color: 'var(--color-ink-muted)' }}>Advisory</span>
            <strong>Research tool in development.</strong> The composite Rurality Index score is a working draft and has not yet been peer reviewed or formally validated. It should not be cited as a finalized measure. The underlying USDA RUCA codes, RUCC codes, and Census data are official federal datasets and may be used independently. We welcome <a href="https://github.com/cwimpy/rurality-app/issues" target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: 'var(--color-ink-muted)' }}>feedback</a>.
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search — hidden on static pages */}
        <div className={`mb-6 ${['about', 'methodology', 'researchers', 'batch', 'statemap'].includes(activeView) ? 'hidden' : ''}`}>
          <div className="rounded-lg border border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)] p-5 sm:p-6"
               style={{ backgroundColor: 'var(--color-cream)' }}>
            <div className="fg-rule mb-4">
              <span>Field Inquiry:</span>
              <span>City &middot; County &middot; ZIP</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-ink-muted)' }} />
                <input
                  type="text"
                  placeholder="Enter a city, county, or ZIP code…"
                  aria-label="Search for a location"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch(searchQuery).catch(() => {})}
                  className="w-full pl-10 pr-4 py-3 bg-transparent border-b-2 text-base outline-none transition-colors"
                  style={{
                    borderColor: 'var(--color-rule)',
                    color: 'var(--color-ink)',
                    fontFamily: 'var(--font-display)',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-wheat)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(26,58,42,0.22)'}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={getCurrentLocation}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-md text-xs uppercase tracking-wider font-mono border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">GPS</span>
                </button>
                <button
                  onClick={() => handleLocationSearch(searchQuery).catch(() => {})}
                  disabled={loading || !searchQuery.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-md text-xs uppercase tracking-wider font-mono transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: loading ? 'var(--color-sage)' : 'var(--color-forest)',
                    color: loading ? 'var(--color-parchment)' : 'var(--color-wheat)',
                  }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin-slow w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                      </svg>
                      <span className="hidden sm:inline">{loadingStep || 'Analyzing…'}</span>
                      <span className="sm:hidden">…</span>
                    </>
                  ) : (
                    <>
                      <span>Analyze</span>
                      <span aria-hidden>&rarr;</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-md border-l-4 px-4 py-3 text-sm"
                   style={{ borderColor: '#991b1b', backgroundColor: 'var(--color-parchment)', color: '#991b1b' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-1" style={{ color: '#991b1b' }}>Error</span>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-dashed border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)]">
              <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
                {recentSearches.length > 0 ? 'Recent' : 'Try an Example'}
              </div>
              <div className="flex flex-wrap gap-2">
                {(recentSearches.length > 0
                  ? recentSearches.map(r => r.query)
                  : ['Jonesboro, AR', 'Jasper, AR', 'Billings, MT', 'Orange County, CA', 'Travis County, TX', 'Story County, IA']
                ).map((place) => (
                  <button
                    key={place}
                    onClick={() => { setSearchQuery(place); handleLocationSearch(place).catch(() => {}); }}
                    disabled={loading}
                    className="px-3 py-1 text-xs uppercase tracking-wider font-mono rounded border transition-colors disabled:opacity-50"
                    style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-wheat)'; e.currentTarget.style.color = 'var(--color-wheat)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(26,58,42,0.2)'; e.currentTarget.style.color = 'var(--color-forest)'; }}
                  >
                    {place}
                  </button>
                ))}
              </div>
              {recentSearches.length > 0 && (
                <div className="mt-2 text-right">
                  <button
                    onClick={() => { setRecentSearches([]); try { localStorage.removeItem('rurality-recent'); } catch {} }}
                    className="text-[0.65rem] uppercase tracking-[0.22em] font-mono"
                    style={{ color: 'var(--color-ink-muted)' }}
                  >
                    Clear recent
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Views */}
        {activeView === 'map' && <MapView />}
        {activeView === 'statemap'     && <StateMap onLocationSearch={(place) => { setSearchQuery(place); setActiveView('dashboard'); handleLocationSearch(place).catch(() => {}); }} />}
        {activeView === 'batch'        && <BatchLookup />}
        {activeView === 'trends'       && <TrendsView />}
        {activeView === 'methodology'  && <MethodologyView />}
        {activeView === 'researchers'  && <ForResearchersView />}
        {activeView === 'about'        && <AboutView />}

        {/* Dashboard */}
        {ruralityData && activeView === 'dashboard' && (
          <div className="space-y-6">
            {/* Overview */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center mb-6">
                <div>
                  <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
                    Field Report
                  </div>
                  <h2 className="fg-display text-3xl sm:text-4xl mb-3 leading-tight" style={{ color: 'var(--color-ink)' }}>
                    {currentLocation}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    {ruralityData.demographics?.population > 0 && (
                      <div className="text-slate-600 dark:text-slate-400">
                        <span className="text-[0.65rem] uppercase tracking-wider font-mono mr-2" style={{ color: 'var(--color-ink-muted)' }}>County Pop.</span>
                        <span style={{ color: 'var(--color-ink)' }}>{ruralityData.demographics.population.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="text-[0.65rem] uppercase tracking-wider font-mono mr-2" style={{ color: 'var(--color-ink-muted)' }}>Confidence</span>
                      <span className="italic" style={{ color: 'var(--color-ink)' }}>{ruralityData.confidence}</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center md:justify-end">
                  <ScoreDial
                    score={ruralityData.overallScore}
                    confidence={ruralityData.confidence}
                    size={320}
                  />
                </div>
              </div>

              {/* Metrics grid — field-guide exhibit tiles */}
              <div className="fg-rule mb-4">
                <span>Exhibit A</span>
                <span>Indicators</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {Object.entries(ruralityData.metrics).map(([key, metric]) => {
                  const Icon = metric.icon;
                  const mColor = metric.score >= 80 ? '#1a5c2e'
                               : metric.score >= 60 ? '#4a7c59'
                               : metric.score >= 40 ? '#a17321'
                               : metric.score >= 20 ? '#b45309'
                               :                      '#991b1b';
                  return (
                    <div key={key} className="rounded-lg p-4 border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
                         style={{ backgroundColor: 'var(--color-cream)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--color-ink-muted)' }} />
                          <span
                            className="text-[0.65rem] uppercase tracking-[0.22em] font-mono"
                            style={{ color: 'var(--color-ink-muted)' }}
                            title={metric.estimated
                              ? 'Derived proxy, not a direct measurement. See Methodology.'
                              : undefined}
                          >
                            {metric.label}
                          </span>
                        </div>
                        <span className="text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: mColor }}>
                          {metric.score}/100
                        </span>
                      </div>
                      <div className="fg-numeral text-3xl mb-2" style={{ color: 'var(--color-ink)' }}>
                        {typeof metric.value === 'number' && metric.value % 1 !== 0
                          ? metric.value.toFixed(1) : metric.value}
                      </div>
                      <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                             style={{ width: `${metric.score}%`, backgroundColor: mColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Demographics — meta strip */}
              {ruralityData.demographics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-y border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]">
                  {[
                    { value: ruralityData.demographics.medianAge, label: 'Median Age' },
                    { value: ruralityData.demographics.medianIncome
                        ? `$${(ruralityData.demographics.medianIncome / 1000).toFixed(0)}K`
                        : 'N/A', label: 'Median Income' },
                    { value: ruralityData.demographics.unemploymentRate
                        ? `${ruralityData.demographics.unemploymentRate}%`
                        : 'N/A', label: 'Unemployment' },
                    { value: ruralityData.overallScore, label: 'Rurality Index' },
                  ].map(({ value, label }, i, arr) => (
                    <div key={label}
                         className={`py-4 px-3 text-center ${i !== arr.length - 1 ? 'md:border-r border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)]' : ''}`}>
                      <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-1" style={{ color: 'var(--color-ink-muted)' }}>
                        {label}
                      </div>
                      <div className="fg-numeral text-2xl" style={{ color: 'var(--color-ink)' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Data sources note */}
              {ruralityData.methodology && (
                <div className="mt-4 text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  Sources &mdash; {ruralityData.methodology.sources.join(' · ')}
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 pt-5 border-t border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)] flex flex-wrap justify-between items-center gap-3">
                <button
                  onClick={() => addComparison(currentLocation, ruralityData.overallScore)}
                  disabled={comparisonData.some(d => d.name === currentLocation) || comparisonData.length >= 5}
                  className="flex items-center space-x-2 px-4 py-2 rounded-md text-xs uppercase tracking-wider font-mono border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--color-sage)', color: 'var(--color-ink-muted)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Comparison &mdash; {comparisonData.length}/5</span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSpecimenOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-md text-xs uppercase tracking-wider font-mono border transition-colors"
                    style={{ borderColor: 'var(--color-wheat)', color: 'var(--color-wheat)' }}
                    title="Generate a shareable 1200×630 field card"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Field Card</span>
                  </button>
                  <button
                    onClick={shareResults}
                    className="flex items-center space-x-2 px-4 py-2 rounded-md text-xs uppercase tracking-wider font-mono border transition-colors"
                    style={{ borderColor: 'var(--color-forest)', backgroundColor: 'var(--color-forest)', color: '#fff' }}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Report</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Official Classifications */}
            {ruralityData.classifications && (
              <ClassificationsPanel
                classifications={ruralityData.classifications}
                compositeScore={ruralityData.overallScore}
                confidence={ruralityData.confidence}
              />
            )}

            {/* RUCC History */}
            {locationMeta && (
              <RUCCHistory fips={`${locationMeta.stateFips}${locationMeta.countyFips}`} />
            )}

            {/* Comparison */}
            <CompareTable
              items={comparisonData}
              onRemove={removeComparison}
              getRuralityLevel={getRuralityLevel}
            />

            {/* Places Like This */}
            {locationMeta && (
              <PlacesLikeThis
                currentFips={`${locationMeta.stateFips}${locationMeta.countyFips}`}
                currentRucc={getRUCC(locationMeta.stateFips, locationMeta.countyFips)}
                currentDensity={ruralityData?.metrics?.populationDensity?.value}
                onSearch={(place) => { setSearchQuery(place); window.scrollTo({ top: 0, behavior: 'smooth' }); handleLocationSearch(place).catch(() => {}); }}
              />
            )}
          </div>
        )}

        {/* Welcome hero — A Field Guide to Rural America */}
        {!ruralityData && !loading && activeView === 'dashboard' && (
          <div className="space-y-10 sm:space-y-14">
            {/* ── Editorial masthead ─────────────────────────────────── */}
            <section className="topo-bg rounded-2xl border border-[rgba(26,58,42,0.14)] dark:border-[rgba(255,255,255,0.08)] px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-14 overflow-hidden"
                     style={{ backgroundColor: 'var(--color-parchment)' }}>
              {/* plate number / edition bar */}
              <div className="fg-rule fg-rise fg-d1 mb-8 sm:mb-10">
                <span>№ 01</span>
                <span className="hidden sm:inline">A Field Guide to Rural America</span>
                <span className="sm:hidden">Field Guide</span>
                <span>Edition 2026</span>
              </div>

              {/* headline + scorecard meta */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end">
                <div className="lg:col-span-8 fg-rise fg-d2">
                  <h2 className="fg-display text-5xl sm:text-6xl lg:text-7xl" style={{ color: 'var(--color-ink)' }}>
                    Really, how
                    <br />
                    rural <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>are you</em>
                    <span style={{ color: 'var(--color-wheat)' }}>?</span>
                  </h2>
                  <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300"
                     style={{ fontFamily: 'var(--font-display)' }}>
                    A continuous rurality index for every county, ZIP, and
                    address in the United States. Data are assembled from USDA,
                    Census, and federal broadband data.
                  </p>
                </div>

                {/* scorecard stat slab */}
                <aside className="lg:col-span-4 fg-rise fg-d3 relative">
                  <div className="relative pl-5 sm:pl-6 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
                    <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-4 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                      The Index · At a Glance
                    </div>
                    {[
                      { n: '3,235',  l: 'U.S. counties covered' },
                      { n: '41,146', l: 'ZIP Code Tabulation Areas' },
                      { n: '4',      l: 'Weighted components, one score' },
                    ].map((s, i) => (
                      <div key={s.n} className={`flex items-baseline gap-3 ${i !== 2 ? 'mb-3 pb-3 border-b border-dashed border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]' : ''}`}>
                        <div className="fg-numeral text-3xl sm:text-4xl" style={{ color: 'var(--color-ink)' }}>{s.n}</div>
                        <div className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>

              {/* pull-quote */}
              <blockquote className="fg-rise fg-d4 mt-10 sm:mt-14 max-w-3xl mx-auto text-center px-2">
                <div className="fg-display text-2xl sm:text-3xl leading-snug italic"
                     style={{ color: 'var(--color-ink)' }}>
                  Rural is not a place on a map. It is a gradient
                  of distance, density, and access that no single metric can
                  capture alone. Behind every score is a community with
                  neighbors, schools, and polling places that people call home.
                </div>
              </blockquote>
            </section>

            {/* ── Example lookups ─────────────────────────────────────── */}
            <section>
              <div className="fg-rule fg-rise fg-d3 mb-6">
                <span>Try an Example:</span>
                <span>Tap a place to see its score</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {[
                  { num: '01', place: 'Jasper, AR',        region: 'Ozarks · Newton County',     score: 87, level: 'Very Rural', color: '#1a5c2e' },
                  { num: '02', place: 'Jonesboro, AR',     region: 'Delta · Craighead County',   score: 24, level: 'Suburban',   color: '#b45309' },
                  { num: '03', place: 'Orange County, CA', region: 'L.A. Basin · Pacific Coast', score: 8,  level: 'Urban',      color: '#991b1b' },
                ].map(({ num, place, region, score, level, color }, i) => (
                  <button
                    key={place}
                    onClick={() => { setSearchQuery(place); handleLocationSearch(place).catch(() => {}); }}
                    className={`fg-plate fg-rise fg-d${i + 2} rounded-lg p-5 text-left group`}
                    aria-label={`Look up ${place}, example score ${score}, ${level}`}
                  >
                    {/* top meta row */}
                    <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                      <span>Example № {num}</span>
                      <span>{level}</span>
                    </div>

                    {/* numeral + level */}
                    <div className="mt-3 flex items-end justify-between">
                      <div className="fg-numeral text-[5.5rem] sm:text-[6rem]" style={{ color }}>{score}</div>
                      <div className="pb-2 text-right">
                        <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">out of 100</div>
                        <div className="mt-1 text-xs uppercase tracking-widest font-semibold" style={{ color }}>Rurality</div>
                      </div>
                    </div>

                    {/* place */}
                    <div className="mt-4 pt-4 border-t border-dashed border-[rgba(26,58,42,0.2)] dark:border-[rgba(255,255,255,0.12)]">
                      <div className="fg-display text-2xl leading-tight" style={{ color: 'var(--color-ink)' }}>
                        {place}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">
                        {region}
                      </div>
                    </div>

                    {/* footer hint */}
                    <div className="mt-4 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] font-mono">
                      <span className="text-slate-400 dark:text-slate-500">Example</span>
                      <span className="transition-transform group-hover:translate-x-1" style={{ color: 'var(--color-ink-muted)' }}>
                        Look up &rarr;
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Value props as catalogued entries ───────────────────── */}
            <section>
              <div className="fg-rule fg-rise fg-d3 mb-6">
                <span>What's Inside:</span>
                <span>Built for research & reuse</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-t border-b border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]">
                {[
                  { icon: Database,   title: 'Federal Data',     desc: 'USDA ERS RUCA & RUCC codes, US Census Bureau ACS 5-year estimates, Census TIGER land area.' },
                  { icon: Calculator, title: 'Composite Score',  desc: 'Weighted index combining six indicators into a single 0&ndash;100 continuous rurality measure.' },
                  { icon: BookOpen,   title: 'For Researchers',  desc: 'R (CRAN) and Stata packages, bulk CSV, open methodology, REST API, replication-ready.' },
                ].map(({ icon: Icon, title, desc }, i) => (
                  <div key={title}
                       className={`fg-rise fg-d${i + 2} px-4 sm:px-6 py-6 sm:border-r last:border-r-0 border-b sm:border-b-0 border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-forest)' }}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                        № {String(i + 1).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="fg-display text-xl mb-1" style={{ color: 'var(--color-ink)' }}>{title}</div>
                    <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-400"
                         dangerouslySetInnerHTML={{ __html: desc }} />
                  </div>
                ))}
              </div>
            </section>

            {/* ── Source ticker ───────────────────────────────────────── */}
            <section className="fg-rise fg-d5 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden border-y border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
                     style={{ backgroundColor: 'var(--color-forest)' }}>
              <div className="fg-ticker-track flex whitespace-nowrap py-3 text-white/80 text-xs uppercase tracking-[0.3em] font-mono">
                {Array.from({ length: 2 }).map((_, dup) => (
                  <div key={dup} className="flex shrink-0" aria-hidden={dup === 1}>
                    {[
                      'Sources', 'USDA ERS RUCA 2020', 'USDA ERS RUCC 2023',
                      'US Census Bureau ACS 2022', 'Census TIGER/Line 2020',
                      'FCC Area API', 'OpenStreetMap · Nominatim',
                      'Updated continuously',
                    ].map((s, i) => (
                      <span key={`${dup}-${i}`} className="px-6 flex items-center gap-6">
                        {s}
                        <span aria-hidden="true" style={{ color: 'var(--color-wheat)' }}>§</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t-2" style={{ backgroundColor: 'var(--color-forest)', borderColor: 'var(--color-wheat)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Top row: brand meta + nav */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-5">
              <div className="flex items-start gap-4">
                <img src={`${process.env.PUBLIC_URL}/logo.svg`} alt="Rurality.app logo" className="w-12 h-12 flex-shrink-0" />
                <div>
                  <div className="fg-display text-2xl leading-tight" style={{ color: 'var(--color-wheat)' }}>
                    Rurality.app
                  </div>
                  <div className="mt-1 text-[0.6rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    A Field Guide to Rural America &middot; Ed. 2026
                  </div>
                  <p className="mt-3 text-sm italic leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-display)' }}>
                    Built by Cameron Wimpy for the Institute for Rural Initiatives, Arkansas State University.
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-4">
              <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-3" style={{ color: 'var(--color-wheat)' }}>
                Navigate
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-xs uppercase tracking-wider font-mono">
                {[
                  { label: 'Dashboard',     go: () => setActiveView('dashboard') },
                  { label: 'Methodology',   go: () => setActiveView('methodology') },
                  { label: 'Researchers',   go: () => setActiveView('researchers') },
                  { label: 'About',         go: () => setActiveView('about') },
                ].map(({ label, go }) => (
                  <button key={label}
                          onClick={() => { go(); window.scrollTo(0, 0); }}
                          className="text-left transition-colors"
                          style={{ color: 'rgba(255,255,255,0.7)' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-wheat)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                    {label} &rarr;
                  </button>
                ))}
                <a href="https://github.com/cwimpy/rurality-app/issues" target="_blank" rel="noopener noreferrer"
                   className="text-left transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}
                   onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-wheat)'}
                   onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                  Contact &rarr;
                </a>
                <a href="https://github.com/cwimpy/rurality-app" target="_blank" rel="noopener noreferrer"
                   className="text-left transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}
                   onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-wheat)'}
                   onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                  GitHub &rarr;
                </a>
              </div>
            </div>

            <div className="md:col-span-3">
              <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-3" style={{ color: 'var(--color-wheat)' }}>
                Sources
              </div>
              <ul className="space-y-1 text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <li>USDA ERS &middot; RUCA 2020</li>
                <li>USDA ERS &middot; RUCC 2023</li>
                <li>U.S. Census Bureau &middot; ACS 2022</li>
                <li>Census TIGER/Line &middot; FCC</li>
              </ul>
            </div>
          </div>

          {/* Bottom rule + colophon */}
          <div className="mt-8 pt-5 border-t border-dashed flex items-center justify-center gap-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono"
               style={{ borderColor: 'rgba(212,168,67,0.3)', color: 'rgba(255,255,255,0.5)' }}>
            <span>&copy; 2026 Rurality.app &middot; Not for regulatory use</span>
          </div>
        </div>
      </footer>

      {/* Specimen Card modal */}
      {specimenOpen && ruralityData && (
        <SpecimenCard
          location={currentLocation}
          score={ruralityData.overallScore}
          confidence={ruralityData.confidence}
          classifications={ruralityData.classifications}
          density={ruralityData.metrics?.populationDensity?.value ?? null}
          coordinates={ruralityData.coordinates}
          population={ruralityData.demographics?.population ?? 0}
          onClose={() => setSpecimenOpen(false)}
        />
      )}

      {/* Info panel — toggleable */}
      <div className="fixed bottom-4 right-4 z-40">
        {showDataSources ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 p-4 max-w-xs">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }} />
              <div className="text-sm flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium text-slate-800 dark:text-slate-100">Live Data Sources</div>
                  <button onClick={() => setShowDataSources(false)} className="text-slate-400 hover:text-slate-600 ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-slate-600 space-y-1 text-xs">
                  <div>• USDA ERS RUCA Codes</div>
                  <div>• US Census Bureau ACS 5-Year</div>
                  <div>• Census TIGER Land Area</div>
                  <div>• OpenStreetMap Geocoding</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDataSources(true)}
            className="bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Live Data Sources"
          >
            <Info className="w-5 h-5" style={{ color: 'var(--color-ink-muted)' }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default RuralityApp;
