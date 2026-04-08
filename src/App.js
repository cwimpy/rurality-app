import React, { useState, useEffect } from 'react';
import {
  Search, MapPin, TrendingUp, BarChart3, Plus, X, Menu, Globe, FileSpreadsheet, Printer,
  Navigation, Info, Download, Share2, Zap, Wifi,
  Building2, Tractor, Heart, DollarSign, AlertCircle,
  BookOpen, FlaskConical, Users, ExternalLink, Scale, Database, Calculator
} from 'lucide-react';

import LeafletMap from './components/LeafletMap';
import DarkModeToggle from './components/DarkModeToggle';
import BatchLookup from './components/BatchLookup';
import StateMap from './components/StateMap';
import PlacesLikeThis from './components/PlacesLikeThis';
import EmbedWidget from './components/EmbedWidget';
import RUCCHistory from './components/RUCCHistory';
import CompareTable from './components/CompareTable';

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

  const distanceMiles = Math.round(components.distance.nearestSmallMetro);

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
      agriculturalLand: {
        value: agLand,
        score: agLand,
        label: 'Agricultural Land Use (%)',
        icon: Tractor
      },
      internetAccess: {
        value: internetAccess,
        score: Math.round(100 - internetAccess),
        label: 'Broadband Access (%)',
        icon: Wifi
      },
      healthcareDensity: {
        value: healthcareDensity,
        score: Math.round((1 - healthcareDensity / 8) * 100),
        label: 'Healthcare Facilities (per 1000)',
        icon: Heart
      },
      economicDiversity: {
        value: economicDiversity,
        score: Math.round((1 - economicDiversity / 10) * 100),
        label: 'Economic Diversity Index',
        icon: DollarSign
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
      const ruca = geoData.postcode ? getRUCAForZcta(geoData.postcode) : null;
      const calcResult = calculateRuralityScore({ lat: geoData.lat, lng: geoData.lng, populationDensity, ruca });

      setLoadingStep('Building analysis…');
      // Ensure lookup tables are loaded (no-op if already in memory)
      await Promise.all([loadRucaData(), loadRuccData()]);

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
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        )
          .then((r) => r.json())
          .then((data) => {
            const name =
              data.address?.city ||
              data.address?.town ||
              data.address?.county ||
              'Current Location';
            return handleLocationSearch(name).catch(() => {});
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
              distanceToMetro: components.distance.nearestSmallMetro,
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
    const text = `${currentLocation} has a Rural Index score of ${ruralityData.overallScore}/100 (${getRuralityLevel(ruralityData.overallScore).level})`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Rurality.app', text, url: shareUrl }); }
      catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(`${text} — ${shareUrl}`);
      alert('Link copied to clipboard!');
    }
  };

  const exportData = () => {
    if (!ruralityData) return;
    const rows = [
      ['Metric', 'Value', 'Score'],
      ['Location', currentLocation, ''],
      ['Overall Rural Index', ruralityData.overallScore, ruralityData.overallScore],
      ['Classification', getRuralityLevel(ruralityData.overallScore).level, ''],
      ['Confidence', ruralityData.confidence, ''],
      ['', '', ''],
      ...Object.entries(ruralityData.metrics).map(([, m]) => [m.label, m.value, m.score]),
      ['', '', ''],
      ['Population', ruralityData.demographics?.population ?? 'N/A', ''],
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
    const metrics = Object.entries(ruralityData.metrics)
      .map(([, m]) => `<tr><td style="padding:4px 12px 4px 0">${m.label}</td><td style="text-align:right;padding:4px 0">${m.value}</td></tr>`)
      .join('');
    const demo = ruralityData.demographics;
    const html = `<!DOCTYPE html><html><head><title>Rurality Report: ${currentLocation}</title>
      <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#1e293b;line-height:1.6}
      h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
      .score{font-size:48px;font-weight:bold;margin:16px 0}.meta{color:#64748b;font-size:13px}
      table{border-collapse:collapse;width:100%}td{padding:6px 12px 6px 0;border-bottom:1px solid #f1f5f9;font-size:14px}
      .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
      @media print{body{margin:20px}}</style></head><body>
      <h1>${currentLocation}</h1>
      <p class="meta">Rurality Report generated ${new Date().toLocaleDateString()} via rurality.app</p>
      <div class="score">${ruralityData.overallScore}<span style="font-size:16px;color:#64748b"> / 100</span></div>
      <p><strong>${level.level}</strong> (Confidence: ${ruralityData.confidence})</p>
      <h2>Metrics</h2><table>${metrics}</table>
      <h2>Demographics</h2><table>
      <tr><td>Population</td><td style="text-align:right">${demo?.population?.toLocaleString() ?? 'N/A'}</td></tr>
      <tr><td>Median Income</td><td style="text-align:right">${demo?.medianIncome ? '$' + demo.medianIncome.toLocaleString() : 'N/A'}</td></tr>
      <tr><td>Median Age</td><td style="text-align:right">${demo?.medianAge ?? 'N/A'}</td></tr>
      <tr><td>Unemployment Rate</td><td style="text-align:right">${demo?.unemploymentRate ? demo.unemploymentRate + '%' : 'N/A'}</td></tr>
      </table>
      <div class="footer">Source: rurality.app | USDA ERS RUCC 2023, RUCA 2020 | Census ACS 2022<br/>
      Cameron Wimpy, Institute for Rural Initiatives, Arkansas State University</div>
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

    const ScoreBar = ({ score, max = 100 }) => (
      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
        <div
          className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full"
          style={{ width: `${Math.round((score / max) * 100)}%` }}
        />
      </div>
    );

    const IndexCard = ({ title, badge, badgeColor, code, description, score, footnote }) => (
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
          {badge && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        {code !== null && code !== undefined ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{code}</span>
              {score !== null && score !== undefined && (
                <span className="text-xs text-slate-500 dark:text-slate-400">score {score}/100</span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">{description}</p>
            {score !== null && score !== undefined && <ScoreBar score={score} />}
          </>
        ) : (
          <p className="text-sm text-slate-400 italic">Not available for this location</p>
        )}
        {footnote && <p className="text-xs text-slate-400">{footnote}</p>}
      </div>
    );

    // Composite RRI bar
    const compositeColor = compositeScore >= 80 ? 'text-green-800 bg-green-200 border-green-300'
      : compositeScore >= 60 ? 'text-green-700 bg-green-100 border-green-300'
      : compositeScore >= 40 ? 'text-yellow-700 bg-yellow-100 border-yellow-300'
      : compositeScore >= 20 ? 'text-orange-700 bg-orange-100 border-orange-300'
      : 'text-red-700 bg-red-100 border-red-300';

    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Official Rurality Classifications</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {countyName ? `${countyName} County` : ''}
              {postcode ? ` · ZIP ${postcode}` : ''}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${compositeColor}`}>
            RRI {compositeScore}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <IndexCard
            title="RUCC 2023"
            badge={rucc?.code !== null && rucc?.code !== undefined ? `Code ${rucc.code}` : 'N/A'}
            badgeColor={rucc?.color ?? 'text-slate-500 bg-slate-100 border-slate-200'}
            code={rucc?.code ?? null}
            description={rucc?.description ?? ''}
            score={rucc?.score ?? null}
            footnote="USDA Rural-Urban Continuum Code — county level (1–9)"
          />
          <IndexCard
            title="RUCA 2020"
            badge={ruca?.code !== null && ruca?.code !== undefined ? `Code ${ruca.code}` : 'N/A'}
            badgeColor={ruca?.color ?? 'text-slate-500 bg-slate-100 border-slate-200'}
            code={ruca?.code ?? null}
            description={ruca?.description ?? ''}
            score={ruca?.score ?? null}
            footnote="USDA Rural-Urban Commuting Area Code — ZIP/ZCTA level (1–10)"
          />
          <IndexCard
            title="OMB Designation"
            badge={omb?.label ?? 'N/A'}
            badgeColor={omb?.color ?? 'text-slate-500 bg-slate-100 border-slate-200'}
            code={null}
            description={
              omb?.label === 'Metropolitan'   ? 'Core-based statistical area with urban core ≥50,000' :
              omb?.label === 'Micropolitan'   ? 'Core-based statistical area with urban core 10,000–49,999' :
              omb?.label === 'Nonmetro'       ? 'Outside any metropolitan or micropolitan statistical area' :
              'Unable to determine from RUCC'
            }
            score={null}
            footnote="Office of Management & Budget metro/nonmetro classification"
          />
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-200 dark:border-slate-600 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Composite RRI</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${compositeColor}`}>
                {confidence}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{compositeScore}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/ 100</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
              Weighted hybrid index combining RUCA, population density, distance to metro, and broadband access.
            </p>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
              <div
                className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full"
                style={{ width: `${compositeScore}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">Rurality.app composite methodology v2.0</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          <strong>Note:</strong> RUCC codes 1–3 = Metropolitan, 4–5 = Micropolitan, 6–9 = Nonmetro.
          RUCA codes 1–3 = Metropolitan, 4–6 = Micropolitan, 7–10 = Rural/Small town.
          OMB designation is derived from RUCC. The composite RRI reflects confidence level{' '}
          <em>{confidence}</em> based on available data.
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
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Interactive Map</h3>
        <p className="text-sm text-slate-500 mt-1">Click anywhere on the map to analyze that location's rurality.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 overflow-hidden">
        <div className="h-[28rem] sm:h-[32rem]">
          <LeafletMap
            coordinates={ruralityData?.coordinates || null}
            locationName={currentLocation}
            score={ruralityData?.overallScore ?? null}
            onMapClick={handleMapClick}
            loading={loading}
          />
        </div>
        <div className="p-4 bg-green-50 border-t border-green-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[['3,143', 'US Counties'], ['RUCA 2020', 'Classification'], ['6+', 'Data Sources'], ['Free', 'Open Access']].map(([val, lbl]) => (
              <div key={lbl}>
                <div className="text-lg font-bold text-green-700">{val}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const TrendsView = () => {
    // Helper: renders a simple bar chart for any numeric series
    const MiniBarChart = ({ data, valueKey, color, formatVal, maxOverride }) => {
      const vals = data.map(d => d[valueKey]);
      const max = maxOverride ?? Math.max(...vals);
      const min = Math.min(...vals);
      const range = max - min || 1;
      return (
        <div className="flex items-end justify-between gap-1 h-24">
          {data.map(d => {
            const pct = Math.max(4, Math.round(((d[valueKey] - min) / range) * 100));
            return (
              <div key={d.year} className="flex flex-col items-center flex-1 gap-1">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatVal(d[valueKey])}</div>
                <div
                  className={`w-full rounded-t-md ${color}`}
                  style={{ height: `${pct}%`, minHeight: '4px' }}
                />
                <div className="text-xs text-slate-400">{d.year}</div>
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
      return `${sign}${fmt(diff)} since ${data[0].year}`;
    };

    if (!locationMeta) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-12 text-center">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Search for a location to view historical trends</p>
        </div>
      );
    }

    if (trendsLoading) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading 2018–2022 Census ACS data…</p>
        </div>
      );
    }

    if (!trendsData || trendsData.length === 0) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-12 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Could not load historical data for this county.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">County Trends — {currentLocation}</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                US Census Bureau ACS 5-Year Estimates · {trendsData[0].year}–{trendsData[trendsData.length - 1].year}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportData}
                className="flex items-center space-x-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                title="Download as CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={printReport}
                className="flex items-center space-x-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                title="Print report"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print</span>
              </button>
              <button
                onClick={shareResults}
                className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                title="Share result"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Three metric charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Population */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-slate-700">Population</h4>
              <Building2 className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              {trendsData[trendsData.length - 1].population.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mb-4">
              {deltaLabel(trendsData, 'population', v => Math.abs(v).toLocaleString())}
            </div>
            <MiniBarChart
              data={trendsData}
              valueKey="population"
              color="bg-green-400"
              formatVal={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
            />
          </div>

          {/* Median Income */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-slate-700">Median Household Income</h4>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              ${trendsData[trendsData.length - 1].medianIncome.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mb-4">
              {deltaLabel(trendsData, 'medianIncome', v => `$${Math.abs(v).toLocaleString()}`)}
            </div>
            <MiniBarChart
              data={trendsData}
              valueKey="medianIncome"
              color="bg-blue-400"
              formatVal={v => `$${(v / 1000).toFixed(0)}K`}
            />
          </div>

          {/* Unemployment */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-slate-700">Unemployment Rate</h4>
              <Zap className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              {trendsData[trendsData.length - 1].unemploymentRate}%
            </div>
            <div className="text-xs text-slate-500 mb-4">
              {deltaLabel(trendsData, 'unemploymentRate', v => `${Math.abs(v).toFixed(1)}pp`)}
            </div>
            <MiniBarChart
              data={trendsData}
              valueKey="unemploymentRate"
              color="bg-orange-400"
              formatVal={v => `${v}%`}
            />
          </div>
        </div>

        {/* Raw data table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">Annual Data Table</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-4 text-slate-600 dark:text-slate-400 font-semibold">Year</th>
                  <th className="text-right py-2 px-4 text-slate-600 dark:text-slate-400 font-semibold">Population</th>
                  <th className="text-right py-2 px-4 text-slate-600 dark:text-slate-400 font-semibold">Median Income</th>
                  <th className="text-right py-2 pl-4 text-slate-600 dark:text-slate-400 font-semibold">Unemployment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trendsData.map(row => (
                  <tr key={row.year} className="text-slate-700">
                    <td className="py-2 pr-4 font-semibold">{row.year}</td>
                    <td className="py-2 px-4 text-right">{row.population.toLocaleString()}</td>
                    <td className="py-2 px-4 text-right">${row.medianIncome.toLocaleString()}</td>
                    <td className="py-2 pl-4 text-right">{row.unemploymentRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Source: US Census Bureau American Community Survey 5-Year Estimates (ACS5), county level.
            2020 figures use experimental estimates due to COVID-19 data collection disruptions.
          </p>
        </div>
      </div>
    );
  };

  // ── About View ─────────────────────────────────────────────────────────────
  const AboutView = () => (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-8">
        <div className="flex items-center space-x-4 mb-6">
          <img
            src={`${process.env.PUBLIC_URL}/logo.svg`}
            alt="Rurality.app logo"
            className="w-14 h-14 flex-shrink-0"
          />
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">About Rurality.app</h2>
            <p className="text-slate-500 text-sm mt-0.5">Rural classification · Real government data · Open access</p>
          </div>
        </div>
        <p className="text-slate-700 leading-relaxed mb-4">
          Rurality.app is a research tool for measuring and communicating the ruralness of any US location.
          Every score is calculated from real, publicly available government datasets — no simulated or
          estimated values. The app is designed to serve researchers, policymakers, journalists, and
          anyone curious about rural America.
        </p>
        <p className="text-slate-700 leading-relaxed">
          The tool was created to support work at the{' '}
          <strong>Institute for Rural Initiatives at Arkansas State University</strong>, where ongoing
          research examines how rurality shapes election administration, civic engagement, public health
          access, and economic opportunity. The composite Rural Index draws on methods from the USDA
          Economic Research Service, the US Census Bureau, and the peer-reviewed literature on rural
          classification.
        </p>
      </div>

      {/* Author */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Users className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Author</h3>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-2xl">C</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cameron Wimpy</div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Associate Professor &amp; Department Chair, Government, Law &amp; Policy<br />
              Director, Institute for Rural Initiatives<br />
              Arkansas State University
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Cameron's research focuses on election administration, political methodology, and rural
              public policy. His current work examines how rurality affects outcomes in election
              administration and the voter experience.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              <a
                href="https://github.com/cwimpy/rurality-app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>GitHub Repository</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Data sources */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Database className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Data Sources</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              name: 'USDA ERS Rural-Urban Commuting Area Codes (RUCA)',
              detail: '2020 · ZIP/ZCTA level · 41,146 ZIP Code Tabulation Areas · Primary classification',
              url: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/'
            },
            {
              name: 'USDA ERS Rural-Urban Continuum Codes (RUCC)',
              detail: '2023 · County level · 3,233 US counties · Nonmetro/metro continuum',
              url: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/'
            },
            {
              name: 'US Census Bureau ACS 5-Year Estimates',
              detail: '2022 vintage · Population, income, unemployment, median age · County level',
              url: 'https://www.census.gov/programs-surveys/acs'
            },
            {
              name: 'Census Geocoder API',
              detail: 'Coordinate → county FIPS + land area (AREALAND) · Used for density calculation',
              url: 'https://geocoding.geo.census.gov/'
            },
            {
              name: 'OpenStreetMap / Nominatim',
              detail: 'Forward and reverse geocoding · Place name → lat/lng → ZIP code',
              url: 'https://nominatim.openstreetmap.org/'
            },
            {
              name: 'FCC Census Area API',
              detail: 'Fallback county FIPS lookup when Census Geocoder is unavailable',
              url: 'https://geo.fcc.gov/api/census/'
            }
          ].map(({ name, detail, url }) => (
            <div key={name} className="bg-green-50 rounded-xl p-4 border border-green-100">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start space-x-2 group"
              >
                <ExternalLink className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0 group-hover:text-green-800" />
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-green-800">{name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{detail}</div>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Open source / limitations */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Scale className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Limitations &amp; Caveats</h3>
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          {[
            'RUCA codes are from 2020 and RUCC codes from 2023, based on 2020 Census data. Rural character can change; scores may not reflect the most recent development.',
            'Population density is calculated from 2022 ACS county totals divided by land area — it does not capture within-county variation.',
            'The composite Rural Index is a research tool, not an official federal designation. It should complement, not replace, official classifications for regulatory or funding purposes.',
            'RUCA is only available for ZIPs that appear in the USDA ZCTA file. Some ZIP codes (PO boxes, unique ZIPs) are not included.',
            'Distance-to-metro scores use a fixed list of large, medium, and small metro areas. Commuting patterns in border regions may not be fully captured.',
            'Broadband data is not yet incorporated in the live scoring; the weight redistributes to density and distance when broadband data is unavailable.'
          ].map((text, i) => (
            <li key={i} className="flex items-start space-x-2">
              <span className="text-green-500 font-bold flex-shrink-0 mt-0.5">·</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // ── Methodology View ────────────────────────────────────────────────────────
  const MethodologyView = () => (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-8">
        <div className="flex items-center space-x-3 mb-4">
          <FlaskConical className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Methodology</h2>
        </div>
        <p className="text-slate-700 leading-relaxed mb-4">
          The <strong>Rurality Index (RRI)</strong> is a composite 0–100 score where higher values
          indicate greater rurality. It combines up to four components drawn from authoritative federal
          datasets. Weights adapt based on data availability, with RUCA serving as the anchor when
          a ZIP code can be matched to the USDA dataset.
        </p>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100 text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-800 dark:text-slate-100">Interpretation:</strong> A score of 0 represents maximum
          urban density; 100 represents maximum remoteness. Classifications are:
          Very Rural (≥80) · Rural (≥60) · Mixed (≥40) · Suburban (≥20) · Urban (&lt;20).
        </div>
      </div>

      {/* Weights */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Calculator className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Component Weights</h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Weights shift depending on which data are available for a given location.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 pr-4 text-slate-700 font-semibold">Scenario</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">RUCA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">Pop. Density</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">Distance</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">Broadband</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['RUCA + Broadband available', '50%', '25%', '15%', '10%', 'High'],
                ['RUCA only',                  '55%', '25%', '20%',  '—',  'Medium-high'],
                ['No RUCA, broadband available','—',   '50%', '25%', '25%', 'Medium'],
                ['Density + Distance only',     '—',   '55%', '30%',  '—',  'Medium'],
              ].map(([scenario, ...cols]) => (
                <tr key={scenario} className="text-slate-700">
                  <td className="py-2 pr-4 font-medium">{scenario}</td>
                  {cols.map((v, i) => (
                    <td key={i} className={`text-center py-2 px-3 ${v === '—' ? 'text-slate-300' : ''}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RUCA */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">1. RUCA Code (ZIP level)</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            The USDA Rural-Urban Commuting Area (RUCA) code is the gold standard for ZIP-level
            rural classification. It uses Census commuting flow data to categorize ZIP Code
            Tabulation Areas (ZCTAs) by their integration with urban cores.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-1 pr-2 text-slate-600 dark:text-slate-300">Code</th>
                  <th className="text-left py-1 pr-2 text-slate-600 dark:text-slate-300">Description</th>
                  <th className="text-center py-1 text-slate-600 dark:text-slate-300">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
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
                ].map(([code, desc, score]) => (
                  <tr key={code} className="text-slate-600 dark:text-slate-300">
                    <td className="py-1 pr-2 font-mono font-semibold">{code}</td>
                    <td className="py-1 pr-2">{desc}</td>
                    <td className="py-1 text-center text-green-700 font-semibold">{score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RUCC */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">2. RUCC Code (County level)</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            The USDA Rural-Urban Continuum Code (RUCC) classifies US counties on a 1–9 scale.
            It is the basis for the OMB Metropolitan/Micropolitan/Nonmetro designation shown in
            the classifications panel. RUCC is displayed for reference and OMB derivation; it
            does not enter the composite score directly.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-1 pr-2 text-slate-600 dark:text-slate-300">Code</th>
                  <th className="text-left py-1 pr-2 text-slate-600 dark:text-slate-300">Description</th>
                  <th className="text-center py-1 text-slate-600 dark:text-slate-300">OMB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  [1,'Metro ≥1M population','Metro'],
                  [2,'Metro 250K–1M','Metro'],
                  [3,'Metro &lt;250K','Metro'],
                  [4,'Nonmetro urban 20K+, adjacent','Micro'],
                  [5,'Nonmetro urban 20K+, not adjacent','Micro'],
                  [6,'Nonmetro urban 2.5–20K, adjacent','Nonmetro'],
                  [7,'Nonmetro urban 2.5–20K, not adj.','Nonmetro'],
                  [8,'Completely rural, adjacent','Nonmetro'],
                  [9,'Completely rural, not adjacent','Nonmetro'],
                ].map(([code, desc, omb]) => (
                  <tr key={code} className="text-slate-600 dark:text-slate-300">
                    <td className="py-1 pr-2 font-mono font-semibold">{code}</td>
                    <td className="py-1 pr-2" dangerouslySetInnerHTML={{ __html: desc }} />
                    <td className={`py-1 text-center text-xs font-semibold ${
                      omb === 'Metro' ? 'text-red-600' : omb === 'Micro' ? 'text-yellow-600' : 'text-green-700'
                    }`}>{omb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Population density */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">3. Population Density</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            County population (ACS 2022) divided by land area in square miles (Census TIGER via
            Census Geocoder). The score is log-transformed so that extremely dense urban cores
            don't compress variation across rural and suburban areas.
          </p>
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 font-mono text-xs text-slate-700 dark:text-slate-300">
            score = 100 − log₁₀(density) × 25<br />
            <span className="text-slate-400">clamped to [0, 100]</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center text-slate-600 dark:text-slate-300">
            {[['1/sq mi','≈100'],['100/sq mi','≈70'],['1,000/sq mi','≈45'],['10,000/sq mi','≈20'],['27,000/sq mi','0']].map(([d,s])=>(
              <div key={d} className="bg-green-50 rounded p-2 border border-green-100">
                <div className="font-semibold text-slate-700">{s}</div>
                <div className="text-slate-500 dark:text-slate-400">{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Distance */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">4. Distance to Metro</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Haversine distance from the queried coordinates to the nearest metro area in each of
            three size tiers (large ≥1M, medium 250K–1M, small 50K–250K). The three distances
            are combined into a single score with differential weights.
          </p>
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 font-mono text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <div>large  = min(100, distance_mi / 2) &nbsp;&nbsp;× 0.50</div>
            <div>medium = min(100, distance_mi / 1.5) × 0.30</div>
            <div>small  = min(100, distance_mi) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;× 0.20</div>
            <div className="text-slate-400">score = sum of above, clamped to [0, 100]</div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Large-metro distance dominates (50%) because proximity to a major city is the strongest
            single determinant of rural isolation in the literature.
          </p>
        </div>
      </div>

      {/* References */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <BookOpen className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Key References</h3>
        </div>
        <ul className="space-y-3 text-sm text-slate-700">
          {[
            {
              citation: 'USDA Economic Research Service. (2023). Rural-Urban Continuum Codes.',
              url: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/'
            },
            {
              citation: 'USDA Economic Research Service. (2020). Rural-Urban Commuting Area Codes.',
              url: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/'
            },
            {
              citation: 'Cromartie, J., & Bucholtz, S. (2008). Defining the "rural" in rural America. Amber Waves, 6(3), 28–34. USDA ERS.',
              url: null
            },
            {
              citation: 'Hart, L. G., Larson, E. H., & Lishner, D. M. (2005). Rural definitions for health policy and research. American Journal of Public Health, 95(7), 1149–1155.',
              url: null
            },
            {
              citation: 'US Office of Management and Budget. (2023). OMB Bulletin No. 23-01: Revised delineations of metropolitan statistical areas, micropolitan statistical areas, and combined statistical areas.',
              url: null
            },
          ].map(({ citation, url }) => (
            <li key={citation} className="flex items-start space-x-2">
              <span className="text-green-500 font-bold flex-shrink-0 mt-0.5">·</span>
              <span>
                {citation}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center space-x-0.5 text-green-700 hover:text-green-900"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

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

    return (
      <div className="space-y-6">

        {/* Hero */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-8">
          <div className="flex items-center space-x-3 mb-3">
            <BookOpen className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">For Researchers</h2>
          </div>
          <p className="text-slate-600 leading-relaxed max-w-3xl">
            Rurality.app is built on publicly available federal datasets and a transparent
            composite methodology. This page provides everything you need to cite the tool,
            replicate the scores in R, and access the underlying data directly for your
            own analysis.
          </p>
        </div>

        {/* Citation */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Scale className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">How to Cite</h3>
          </div>
          <p className="text-sm text-slate-500 mb-3">APA 7th edition</p>
          <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
            <p className="flex-1 text-sm text-slate-700 font-mono leading-relaxed">{citation}</p>
            <button
              onClick={copyCitation}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
            >
              {citationCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            If you use the composite Rural Index methodology in published work, please also cite
            the underlying USDA ERS data sources listed below.
          </p>
        </div>

        {/* Suggested uses */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Suggested Uses</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'Survey research', desc: 'Classify respondents by rurality using their ZIP code. Merge RUCA codes onto survey microdata for subgroup analysis.' },
              { title: 'Election administration', desc: 'Identify rural jurisdictions for comparative analysis of polling place access, wait times, and mail ballot use.' },
              { title: 'Public health', desc: 'Stratify health outcomes by RUCC or composite RRI. Examine rural–urban gradients in access, mortality, or utilization.' },
              { title: 'Policy evaluation', desc: 'Define treatment and control groups using OMB metro/nonmetro or RUCA thresholds. Consistent with USDA program eligibility rules.' },
              { title: 'Education research', desc: 'Classify school districts or counties by rurality. Link to NCES locale codes for cross-framework comparison.' },
              { title: 'Grant proposals', desc: 'Document the rurality of your study area with official USDA and OMB classifications to satisfy NSF, NIH, and USDA program requirements.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start space-x-3 p-4 bg-green-50 rounded-xl border border-green-100">
                <span className="text-green-500 font-bold flex-shrink-0 mt-0.5">·</span>
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* R replication */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <Calculator className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Replicating the Score in R</h3>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            The composite Rural Index can be replicated entirely in R using the same USDA and
            Census data this app uses. The snippets below walk through each step.
          </p>

          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">1 — Load USDA RUCA and RUCC data</p>
              <CodeBlock code={`
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
              `} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">2 — Define classification helpers</p>
              <CodeBlock code={`
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
              `} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">3 — Merge onto your county-level data</p>
              <CodeBlock code={`
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
              `} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">4 — Merge RUCA onto ZIP-level data</p>
              <CodeBlock code={`
# Assumes your data has a 5-digit ZIP or ZCTA column called "zip"

your_zip_data <- your_zip_data |>
  mutate(zcta = str_pad(as.character(zip), 5, pad = "0")) |>
  left_join(ruca, by = "zcta") |>
  mutate(
    ruca_score = ruca_to_score(ruca_code),
    rural_ruca = is_rural_ruca(ruca_code)
  )
              `} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">5 — Compute composite Rural Index (RUCA + density only)</p>
              <CodeBlock code={`
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
              `} />
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <strong>Note:</strong> The full composite score also incorporates distance to the nearest
            metro area (Haversine distance to a fixed list of US metros). Omitting this component
            shifts weight to RUCA and density, which is appropriate for most county- or ZIP-level
            analyses. See the <button
              onClick={() => { setActiveView('methodology'); window.scrollTo(0, 0); }}
              className="underline font-medium"
            >Methodology page</button> for complete weight tables.
          </div>
        </div>

        {/* Download data for analysis */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <Download className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Download Data</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            Pre-computed rurality scores for all 3,235 U.S. counties, ready to merge into your analysis by FIPS code.
            Includes RUCC 2023, population density, distance to metro areas, composite score, and ACS demographics.
          </p>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">County Rurality Dataset (CSV)</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">3,235 counties, 24 variables, ~500KB</p>
              </div>
              <a href={`${process.env.PUBLIC_URL}/data/county_rurality.csv`}
                download="county_rurality.csv"
                className="flex-shrink-0 flex items-center space-x-2 px-4 py-2 text-white rounded-lg text-sm transition-colors"
                style={{ backgroundColor: 'var(--color-forest)' }}>
                <Download className="w-4 h-4" />
                <span>Download CSV</span>
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">R Package</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                  <code>devtools::install_github("cwimpy/rurality")</code>
                  <button onClick={() => { navigator.clipboard.writeText('devtools::install_github("cwimpy/rurality")'); }} className="text-green-600 hover:text-green-800 text-[10px] underline">copy</button>
                </p>
              </div>
              <a href="https://github.com/cwimpy/rurality" target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors">
                <ExternalLink className="w-3 h-3" />
                <span>GitHub</span>
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Stata Package</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                  <code>net install rurality, from("https://raw.githubusercontent.com/cwimpy/rurality-stata/main/")</code>
                  <button onClick={() => { navigator.clipboard.writeText('net install rurality, from("https://raw.githubusercontent.com/cwimpy/rurality-stata/main/")'); }} className="text-green-600 hover:text-green-800 text-[10px] underline">copy</button>
                </p>
              </div>
              <a href="https://github.com/cwimpy/rurality-stata" target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors">
                <ExternalLink className="w-3 h-3" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>

        {/* REST API */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <Zap className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">REST API</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            Query rurality scores programmatically. No authentication required. Returns JSON with RUCC codes,
            composite scores, demographics, and score components for all 3,235 U.S. counties.
          </p>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Endpoints</p>
              <div className="space-y-2">
                {[
                  { label: 'Single county by FIPS', url: '/api/score?fips=05031' },
                  { label: 'All counties in a state', url: '/api/score?state=AR' },
                  { label: 'Search by county name', url: '/api/score?q=Craighead&limit=10' },
                ].map(({ label, url }) => (
                  <div key={url} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <span className="text-xs text-slate-500 dark:text-slate-400 sm:w-44 flex-shrink-0">{label}</span>
                    <code className="text-xs text-green-700 dark:text-green-400 font-mono break-all">
                      https://rurality.app{url}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Example in R</p>
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
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Example response</p>
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

            <p className="text-xs text-slate-400">
              The API serves pre-computed county-level data. For ZIP-level RUCA lookups,
              use the R or Stata packages above.
            </p>
          </div>
        </div>

        {/* Data sources with download links */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Database className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Data Sources &amp; Downloads</h3>
          </div>
          <div className="space-y-3">
            {[
              {
                name: 'USDA ERS Rural-Urban Commuting Area Codes (RUCA) 2020',
                desc: 'ZIP/ZCTA level · 41,146 areas · Primary RUCA code 1–10',
                page: 'https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/',
                file: 'https://www.ers.usda.gov/media/5442/2020-rural-urban-commuting-area-codes-zip-codes.xlsx',
                fileLabel: 'Download XLSX'
              },
              {
                name: 'USDA ERS Rural-Urban Continuum Codes (RUCC) 2023',
                desc: 'County level · 3,233 US counties · RUCC code 1–9',
                page: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/',
                file: 'https://www.ers.usda.gov/media/5767/2023-rural-urban-continuum-codes.xlsx',
                fileLabel: 'Download XLSX'
              },
              {
                name: 'US Census Bureau ACS 5-Year Estimates',
                desc: '2018–2022 vintages · Population, income, unemployment · County level',
                page: 'https://www.census.gov/programs-surveys/acs',
                file: 'https://api.census.gov/data/2022/acs/acs5/variables.html',
                fileLabel: 'Variable list'
              },
              {
                name: 'US Census Bureau Geocoder API',
                desc: 'Coordinate → county FIPS + land area · Used for density calculation',
                page: 'https://geocoding.geo.census.gov/geocoder/',
                file: null,
                fileLabel: null
              },
            ].map(({ name, desc, page, file, fileLabel }) => (
              <div key={name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
                <div>
                  <a href={page} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1">
                    {name} <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
                {file && (
                  <a href={file} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors whitespace-nowrap">
                    {fileLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Embed widget */}
        <EmbedWidget />

        {/* Collaboration */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Collaboration &amp; Feedback</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            If you use Rurality.app in published research, we would love to hear about it.
            Bug reports, methodology suggestions, and data quality issues are tracked on GitHub.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="https://github.com/cwimpy/rurality-app/issues"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm transition-colors">
              <ExternalLink className="w-4 h-4" />
              <span>Open a GitHub Issue</span>
            </a>
            <a href="https://github.com/cwimpy/rurality-app"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-lg text-sm transition-colors">
              <ExternalLink className="w-4 h-4" />
              <span>View Source on GitHub</span>
            </a>
          </div>
        </div>

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
      <header className="sticky top-0 z-50" style={{ backgroundColor: 'var(--color-forest)' }}>
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
              <h1 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Rurality.app
              </h1>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex space-x-0.5">
              {[
                { id: 'dashboard',    label: 'Dashboard',       icon: BarChart3 },
                { id: 'map',          label: 'Map',             icon: MapPin },
                { id: 'statemap',     label: 'US Counties',     icon: Globe },
                { id: 'batch',        label: 'Batch',           icon: FileSpreadsheet },
                { id: 'trends',       label: 'Trends',          icon: TrendingUp },
                { id: 'methodology',  label: 'Methodology',     icon: FlaskConical },
                { id: 'researchers',  label: 'For Researchers',  icon: BookOpen },
                { id: 'about',        label: 'About',           icon: Info }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    setActiveView(id);
                    if (id === 'trends' && locationMeta && !trendsData && !trendsLoading) {
                      setTrendsLoading(true);
                      fetchMultiYearCensusData(locationMeta.stateFips, locationMeta.countyFips)
                        .then(data => { setTrendsData(data); setTrendsLoading(false); })
                        .catch(() => setTrendsLoading(false));
                    }
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Research tool in development.</strong> The composite Rural Index score is a working draft and has not yet been peer reviewed or formally validated. It should not be cited as a finalized measure. The underlying USDA RUCA codes, RUCC codes, and Census data are official federal datasets and may be used independently. We welcome <a href="https://github.com/cwimpy/rurality-app/issues" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-200">feedback</a>.
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search — hidden on static pages */}
        <div className={`mb-6 ${['about', 'methodology', 'researchers', 'batch', 'statemap'].includes(activeView) ? 'hidden' : ''}`}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Enter city, county, or ZIP code…"
                  aria-label="Search for a location"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch(searchQuery).catch(() => {})}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-xl focus:ring-2 focus:border-transparent outline-none transition-shadow"
                  style={{ '--tw-ring-color': 'var(--color-sage)' }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={getCurrentLocation}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Navigation className="w-4 h-4" />
                  <span className="hidden sm:inline">GPS</span>
                </button>
                <button
                  onClick={() => handleLocationSearch(searchQuery).catch(() => {})}
                  disabled={loading || !searchQuery.trim()}
                  className="flex items-center space-x-2 px-6 py-3 text-white rounded-xl transition-colors disabled:opacity-50"
                  style={{ backgroundColor: loading ? 'var(--color-sage)' : 'var(--color-forest)' }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin-slow w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                      </svg>
                      <span className="hidden sm:inline">{loadingStep || 'Analyzing…'}</span>
                      <span className="sm:hidden">…</span>
                    </>
                  ) : 'Analyze'}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {(recentSearches.length > 0
                ? recentSearches.map(r => r.query)
                : ['Jonesboro, AR', 'Jasper, AR', 'Billings, MT', 'Orange County, CA', 'Travis County, TX', 'Story County, IA']
              ).map((place) => (
                <button
                  key={place}
                  onClick={() => { setSearchQuery(place); handleLocationSearch(place).catch(() => {}); }}
                  disabled={loading}
                  className="px-3 py-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-full transition-colors border border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  {place}
                </button>
              ))}
            </div>
            {recentSearches.length > 0 && (
              <div className="mt-1 text-right">
                <button
                  onClick={() => { setRecentSearches([]); try { localStorage.removeItem('rurality-recent'); } catch {} }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Clear recent
                </button>
              </div>
            )}
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2" style={{ fontFamily: 'var(--font-display)' }}>{currentLocation}</h2>
                  <div className="flex items-center space-x-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getRuralityLevel(ruralityData.overallScore).color}`}>
                      {getRuralityLevel(ruralityData.overallScore).level}
                    </div>
                    {ruralityData.demographics?.population > 0 && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Population: {ruralityData.demographics.population.toLocaleString()}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 italic">
                      Confidence: {ruralityData.confidence}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-forest)' }}>
                    {ruralityData.overallScore}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Rural Index Score</div>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {Object.entries(ruralityData.metrics).map(([key, metric]) => {
                  const Icon = metric.icon;
                  return (
                    <div key={key} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm">
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-parchment)' }}>
                          <Icon className="w-4 h-4" style={{ color: 'var(--color-sage)' }} />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-slate-700">{metric.label}</h4>
                          <div className="text-xs font-medium" style={{ color: 'var(--color-sage)' }}>{metric.score}/100</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                        {typeof metric.value === 'number' && metric.value % 1 !== 0
                          ? metric.value.toFixed(1) : metric.value}
                      </div>
                      <div className="w-full bg-green-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-red-400 via-yellow-400 to-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${metric.score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Demographics */}
              {ruralityData.demographics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
                  {[
                    { value: ruralityData.demographics.medianAge, label: 'Median Age' },
                    { value: ruralityData.demographics.medianIncome
                        ? `$${(ruralityData.demographics.medianIncome / 1000).toFixed(0)}K`
                        : 'N/A', label: 'Median Income' },
                    { value: ruralityData.demographics.unemploymentRate
                        ? `${ruralityData.demographics.unemploymentRate}%`
                        : 'N/A', label: 'Unemployment' },
                    { value: ruralityData.overallScore, label: 'Rural Score', highlight: true }
                  ].map(({ value, label, highlight }) => (
                    <div key={label} className="text-center">
                      <div className={`text-lg font-bold ${highlight ? 'text-green-600' : 'text-slate-800'}`}>{value}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Data sources note */}
              {ruralityData.methodology && (
                <div className="mt-4 text-xs text-slate-400">
                  Sources: {ruralityData.methodology.sources.join(' • ')}
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 pt-6 border-t border-green-100 flex justify-between items-center">
                <button
                  onClick={() => addComparison(currentLocation, ruralityData.overallScore)}
                  disabled={comparisonData.some(d => d.name === currentLocation) || comparisonData.length >= 5}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Comparison ({comparisonData.length}/5)</span>
                </button>
                <button
                  onClick={shareResults}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
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

        {/* Welcome hero */}
        {!ruralityData && !loading && activeView === 'dashboard' && (
          <div className="space-y-6">
            {/* Hero */}
            <div className="rounded-2xl shadow-md overflow-hidden" style={{ backgroundColor: 'var(--color-forest)' }}>
              <div className="px-8 py-12 sm:py-16 text-center">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  Really, how rural are you?
                </h2>
                <p className="text-white/70 max-w-xl mx-auto text-lg leading-relaxed">
                  We use real data including USDA RUCA codes, Census demographics,
                  and distance to metro areas to build a composite rurality score
                  for any location in the United States.
                </p>
              </div>
            </div>

            {/* Example comparison cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { place: 'Jasper, AR',           score: 87, level: 'Very Rural', emoji: '\uD83C\uDF3E', color: '#1a5c2e' },
                { place: 'Jonesboro, AR',        score: 24, level: 'Suburban',   emoji: '\uD83C\uDFD8\uFE0F', color: '#b45309' },
                { place: 'Orange County, CA',    score: 8,  level: 'Urban',      emoji: '\uD83C\uDFD9\uFE0F', color: '#991b1b' },
              ].map(({ place, score, level, emoji, color }) => (
                <button
                  key={place}
                  onClick={() => { setSearchQuery(place); handleLocationSearch(place).catch(() => {}); }}
                  className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 text-left hover:shadow-md transition-shadow group cursor-pointer border border-transparent hover:border-slate-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{emoji}</span>
                    <span className="text-3xl font-bold" style={{ color, fontFamily: 'var(--font-display)' }}>{score}</span>
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-slate-900">{place}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{level}</div>
                </button>
              ))}
            </div>

            {/* Value props */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: Database, title: 'Real Data', desc: 'USDA RUCA/RUCC codes and US Census Bureau ACS' },
                { icon: Calculator, title: 'Composite Score', desc: 'Weighted index combining 6 rurality indicators' },
                { icon: BookOpen, title: 'For Researchers', desc: 'Replication code in R, downloadable data, open methodology' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start space-x-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-parchment)' }}>
                  <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-sage)' }} />
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <img
                src={`${process.env.PUBLIC_URL}/logo.svg`}
                alt="Rurality.app logo"
                className="w-12 h-12"
              />
              <div>
                <div className="text-sm font-medium text-slate-700">Built by Cameron Wimpy</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Powered by US Census Bureau, USDA ERS, and FCC data</div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
              <button
                onClick={() => { setActiveView('about'); window.scrollTo(0, 0); }}
                className="hover:text-slate-900 transition-colors"
              >About</button>
              <button
                onClick={() => { setActiveView('researchers'); window.scrollTo(0, 0); }}
                className="hover:text-slate-900 transition-colors"
              >For Researchers</button>
              <button
                onClick={() => { setActiveView('methodology'); window.scrollTo(0, 0); }}
                className="hover:text-slate-900 transition-colors"
              >Methodology</button>
              <a
                href="https://github.com/cwimpy/rurality-app/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 transition-colors"
              >Contact</a>
              <a
                href="https://github.com/cwimpy/rurality-app"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 transition-colors"
              >GitHub</a>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-green-100 text-center text-xs text-slate-500 dark:text-slate-400">
            <p>© 2026 Rurality.app • Data from US Census Bureau ACS, USDA ERS RUCA, and USDA ERS RUCC • Not for regulatory use</p>
          </div>
        </div>
      </footer>

      {/* Info panel — toggleable */}
      <div className="fixed bottom-4 right-4 z-40">
        {showDataSources ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 p-4 max-w-xs">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-sage)' }} />
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
            <Info className="w-5 h-5" style={{ color: 'var(--color-sage)' }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default RuralityApp;
