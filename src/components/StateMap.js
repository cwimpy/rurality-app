import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { Loader, ChevronDown, RotateCcw } from 'lucide-react';

const RUCC_COLORS = {
  1: '#991b1b', 2: '#b91c1c', 3: '#dc2626',
  4: '#d97706', 5: '#f59e0b', 6: '#fbbf24',
  7: '#16a34a', 8: '#15803d', 9: '#166534'
};

const RUCC_LABELS = {
  1: 'Metro 1M+', 2: 'Metro 250K\u20131M', 3: 'Metro <250K',
  4: 'Nonmetro 20K+, adj', 5: 'Nonmetro 20K+, nonadj', 6: 'Nonmetro 2.5K\u201320K, adj',
  7: 'Nonmetro 2.5K\u201320K, nonadj', 8: 'Nonmetro <2.5K, adj', 9: 'Nonmetro <2.5K, nonadj'
};

const US_STATES = [
  { fips: '01', name: 'Alabama' }, { fips: '02', name: 'Alaska' }, { fips: '04', name: 'Arizona' },
  { fips: '05', name: 'Arkansas' }, { fips: '06', name: 'California' }, { fips: '08', name: 'Colorado' },
  { fips: '09', name: 'Connecticut' }, { fips: '10', name: 'Delaware' }, { fips: '11', name: 'District of Columbia' },
  { fips: '12', name: 'Florida' }, { fips: '13', name: 'Georgia' }, { fips: '15', name: 'Hawaii' },
  { fips: '16', name: 'Idaho' }, { fips: '17', name: 'Illinois' }, { fips: '18', name: 'Indiana' },
  { fips: '19', name: 'Iowa' }, { fips: '20', name: 'Kansas' }, { fips: '21', name: 'Kentucky' },
  { fips: '22', name: 'Louisiana' }, { fips: '23', name: 'Maine' }, { fips: '24', name: 'Maryland' },
  { fips: '25', name: 'Massachusetts' }, { fips: '26', name: 'Michigan' }, { fips: '27', name: 'Minnesota' },
  { fips: '28', name: 'Mississippi' }, { fips: '29', name: 'Missouri' }, { fips: '30', name: 'Montana' },
  { fips: '31', name: 'Nebraska' }, { fips: '32', name: 'Nevada' }, { fips: '33', name: 'New Hampshire' },
  { fips: '34', name: 'New Jersey' }, { fips: '35', name: 'New Mexico' }, { fips: '36', name: 'New York' },
  { fips: '37', name: 'North Carolina' }, { fips: '38', name: 'North Dakota' }, { fips: '39', name: 'Ohio' },
  { fips: '40', name: 'Oklahoma' }, { fips: '41', name: 'Oregon' }, { fips: '42', name: 'Pennsylvania' },
  { fips: '44', name: 'Rhode Island' }, { fips: '45', name: 'South Carolina' }, { fips: '46', name: 'South Dakota' },
  { fips: '47', name: 'Tennessee' }, { fips: '48', name: 'Texas' }, { fips: '49', name: 'Utah' },
  { fips: '50', name: 'Vermont' }, { fips: '51', name: 'Virginia' }, { fips: '53', name: 'Washington' },
  { fips: '54', name: 'West Virginia' }, { fips: '55', name: 'Wisconsin' }, { fips: '56', name: 'Wyoming' }
];

const MAP_WIDTH = 975;
const MAP_HEIGHT = 610;

export default function StateMap({ onLocationSearch }) {
  const [geoData, setGeoData] = useState(null);
  const [ruccData, setRuccData] = useState(null);
  const [countyNames, setCountyNames] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [error, setError] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const svgContainerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [geoRes, ruccRes, namesRes] = await Promise.all([
          fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'),
          fetch(`${process.env.PUBLIC_URL}/data/rucc.json`),
          fetch(`${process.env.PUBLIC_URL}/data/county_names.json`)
        ]);
        if (!geoRes.ok) throw new Error('Failed to load county boundaries');
        const topo = await geoRes.json();
        const rucc = await ruccRes.json();
        const names = await namesRes.json();

        const { feature } = await import('topojson-client');
        const geo = feature(topo, topo.objects.counties);

        if (!cancelled) {
          setGeoData(geo);
          setRuccData(rucc);
          setCountyNames(names);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Enrich features with RUCC + name
  const counties = useMemo(() => {
    if (!geoData || !ruccData || !countyNames) return [];
    return geoData.features.map(f => {
      const fips = String(f.id).padStart(5, '0');
      const rucc = ruccData[fips];
      const name = countyNames[fips] || f.properties?.name || fips;
      return { ...f, properties: { ...f.properties, fips, rucc, countyName: name } };
    });
  }, [geoData, ruccData, countyNames]);

  // Filter by state
  const filteredCounties = useMemo(() => {
    if (!counties.length) return [];
    if (!selectedState) return counties;
    return counties.filter(f => f.properties.fips.startsWith(selectedState));
  }, [counties, selectedState]);

  // Background counties (dimmed) when state selected
  const backgroundCounties = useMemo(() => {
    if (!selectedState || !counties.length) return [];
    return counties.filter(f => !f.properties.fips.startsWith(selectedState));
  }, [counties, selectedState]);

  // Fixed projection for all counties; zoom via viewBox
  const projection = useMemo(() => {
    if (!counties.length) return null;
    return geoAlbersUsa().fitSize(
      [MAP_WIDTH, MAP_HEIGHT],
      { type: 'FeatureCollection', features: counties }
    );
  }, [counties]);

  const pathGenerator = useMemo(() => {
    if (!projection) return null;
    return geoPath(projection);
  }, [projection]);

  // Compute viewBox: zoomed to state or full US
  const viewBox = useMemo(() => {
    if (!selectedState || !filteredCounties.length || !pathGenerator) {
      return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    filteredCounties.forEach(f => {
      const bounds = pathGenerator.bounds(f);
      if (!bounds || !isFinite(bounds[0][0])) return;
      if (bounds[0][0] < minX) minX = bounds[0][0];
      if (bounds[0][1] < minY) minY = bounds[0][1];
      if (bounds[1][0] > maxX) maxX = bounds[1][0];
      if (bounds[1][1] > maxY) maxY = bounds[1][1];
    });
    if (!isFinite(minX)) return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
    const pad = 20;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [selectedState, filteredCounties, pathGenerator]);

  const handleMouseMove = useCallback((e) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleCountyClick = useCallback((f) => {
    if (onLocationSearch && f.properties.countyName) {
      onLocationSearch(f.properties.countyName + ' County');
    }
  }, [onLocationSearch]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-12 text-center">
        <Loader className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-3" />
        <p className="text-slate-500 dark:text-slate-400">Loading county boundaries...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-8 text-center">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md overflow-hidden">
        {/* Header + state filter */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
                U.S. Counties by RUCC
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                USDA Rural-Urban Continuum Codes (2023). Click a county to analyze it.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="appearance-none bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 cursor-pointer"
                >
                  <option value="">All States</option>
                  {US_STATES.map(s => (
                    <option key={s.fips} value={s.fips}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {selectedState && (
                <button
                  onClick={() => setSelectedState('')}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                  title="Reset to all states"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* SVG map */}
        <div
          ref={svgContainerRef}
          className="relative bg-slate-50 dark:bg-slate-900"
          onMouseMove={handleMouseMove}
          style={{ minHeight: '400px' }}
        >
          <svg
            viewBox={viewBox}
            className="w-full h-auto"
            style={{ maxHeight: '600px', display: 'block' }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Background (dimmed) counties when state is selected */}
            {backgroundCounties.map(f => {
              const d = pathGenerator(f);
              if (!d) return null;
              return (
                <path
                  key={`bg-${f.properties.fips}`}
                  d={d}
                  fill="#e2e8f0"
                  stroke="#cbd5e1"
                  strokeWidth={0.2}
                  opacity={0.3}
                />
              );
            })}

            {/* Active counties */}
            {filteredCounties.map(f => {
              const d = pathGenerator(f);
              if (!d) return null;
              const isHovered = hovered?.fips === f.properties.fips;
              const rucc = f.properties.rucc;
              return (
                <path
                  key={f.properties.fips}
                  d={d}
                  fill={rucc ? RUCC_COLORS[rucc] : '#e2e8f0'}
                  stroke={isHovered ? '#1e293b' : '#94a3b8'}
                  strokeWidth={isHovered ? 1.5 : 0.3}
                  opacity={isHovered ? 1 : 0.8}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={() => setHovered(f.properties)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleCountyClick(f)}
                />
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hovered && (
            <div
              className="absolute bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3 z-10 border border-slate-200 dark:border-slate-600 text-sm pointer-events-none"
              style={{
                left: Math.min(mousePos.x + 12, (svgContainerRef.current?.offsetWidth || 600) - 220),
                top: mousePos.y - 10
              }}
            >
              <div className="font-semibold text-slate-800 dark:text-slate-100">{hovered.countyName}</div>
              {hovered.rucc ? (
                <div className="text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: RUCC_COLORS[hovered.rucc] }} />
                  RUCC {hovered.rucc}: {RUCC_LABELS[hovered.rucc]}
                </div>
              ) : (
                <div className="text-slate-400">No RUCC data</div>
              )}
            </div>
          )}

          {/* Click hint */}
          {!hovered && !selectedState && (
            <div className="absolute bottom-3 left-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
              Click a county to analyze it \u2022 Use the dropdown to zoom to a state
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            {Object.entries(RUCC_LABELS).map(([code, label]) => (
              <div key={code} className="flex items-center space-x-1.5">
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: RUCC_COLORS[code] }} />
                <span>{code}: {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
