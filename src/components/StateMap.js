import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { ChevronDown, RotateCcw } from 'lucide-react';

// Field-guide palette for the 9 RUCC codes — graduated along the
// metro → nonmetro → rural continuum using the app's earth-tones.
const RUCC_COLORS = {
  1: '#991b1b', 2: '#b45309', 3: '#c97a2a',
  4: '#d4a843', 5: '#b7992e',
  6: '#7a9e87', 7: '#4a7c59',
  8: '#2d5a3d', 9: '#1a3a2a',
};

const RUCC_LABELS = {
  1: 'Metro 1M+',              2: 'Metro 250K\u20131M',         3: 'Metro <250K',
  4: 'Nonmetro 20K+, adj.',    5: 'Nonmetro 20K+, nonadj.',     6: 'Nonmetro 2.5K\u201320K, adj.',
  7: 'Nonmetro 2.5K\u201320K, nonadj.', 8: 'Nonmetro <2.5K, adj.', 9: 'Nonmetro <2.5K, nonadj.',
};

const RUCC_TIERS = [
  { range: '1\u20133', label: 'Metropolitan',     color: '#991b1b' },
  { range: '4\u20135', label: 'Nonmetro Urban',   color: '#d4a843' },
  { range: '6\u20137', label: 'Nonmetro Town',    color: '#4a7c59' },
  { range: '8\u20139', label: 'Rural',            color: '#1a3a2a' },
];

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
  { fips: '54', name: 'West Virginia' }, { fips: '55', name: 'Wisconsin' }, { fips: '56', name: 'Wyoming' },
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
          fetch(`${process.env.PUBLIC_URL}/data/county_names.json`),
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

  const counties = useMemo(() => {
    if (!geoData || !ruccData || !countyNames) return [];
    return geoData.features.map((f) => {
      const fips = String(f.id).padStart(5, '0');
      const rucc = ruccData[fips];
      const name = countyNames[fips] || f.properties?.name || fips;
      return { ...f, properties: { ...f.properties, fips, rucc, countyName: name } };
    });
  }, [geoData, ruccData, countyNames]);

  const filteredCounties = useMemo(() => {
    if (!counties.length) return [];
    if (!selectedState) return counties;
    return counties.filter((f) => f.properties.fips.startsWith(selectedState));
  }, [counties, selectedState]);

  const backgroundCounties = useMemo(() => {
    if (!selectedState || !counties.length) return [];
    return counties.filter((f) => !f.properties.fips.startsWith(selectedState));
  }, [counties, selectedState]);

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

  const viewBox = useMemo(() => {
    if (!selectedState || !filteredCounties.length || !pathGenerator) {
      return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    filteredCounties.forEach((f) => {
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
      // Include state so Nominatim doesn't resolve to a same-named
      // county in another state (e.g., "Grant County" → Grant, WI).
      const stateFips = String(f.properties.fips).slice(0, 2);
      const stateName = US_STATES.find(s => s.fips === stateFips)?.name;
      const query = stateName
        ? `${f.properties.countyName} County, ${stateName}`
        : `${f.properties.countyName} County`;
      onLocationSearch(query);
    }
  }, [onLocationSearch]);

  const EmptyState = ({ spin, message, error: isError }) => (
    <div className="rounded-lg border px-8 py-16 text-center"
         style={{ backgroundColor: 'var(--color-cream)', borderColor: 'var(--color-rule)' }}>
      {spin && (
        <div className="animate-spin w-8 h-8 rounded-full mx-auto mb-5"
             style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: 'var(--color-rule)', borderTopColor: 'var(--color-wheat)' }} />
      )}
      <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
        § County Plate
      </div>
      <p className="fg-display text-lg sm:text-xl italic" style={{ color: isError ? '#991b1b' : 'var(--color-ink)' }}>
        {message}
      </p>
    </div>
  );

  if (loading) return <div className="space-y-6"><EmptyState spin message="Loading county boundaries…" /></div>;
  if (error)   return <div className="space-y-6"><EmptyState message={error} error /></div>;

  const selectedStateName = selectedState ? US_STATES.find((s) => s.fips === selectedState)?.name : null;
  const countyCount = filteredCounties.length;

  return (
    <div className="space-y-10 sm:space-y-12 pb-8">
      {/* ── Editorial masthead ─────────────────────────────────────── */}
      <header className="topo-bg rounded-2xl border px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
              style={{ backgroundColor: 'var(--color-parchment)', borderColor: 'var(--color-rule)' }}>
        <div className="fg-rule mb-8">
          <span>§ North America</span>
          <span className="hidden sm:inline">County Plate &middot; RUCC 2023</span>
          <span>3,235 counties</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8">
            <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
              Every U.S. county, <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>colored</em> by RUCC.
            </h2>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed"
               style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
              USDA Rural-Urban Continuum Codes (2023). Darker hues read as more rural, with
              red tones for metropolitan counties and deep forest greens for the most remote.
              Click any county to open its field report.
            </p>
          </div>
          <aside className="lg:col-span-4">
            <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
              <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                Focus a State
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="appearance-none w-full border text-sm rounded-md pl-3 pr-9 py-2 cursor-pointer outline-none"
                    style={{
                      backgroundColor: 'var(--color-cream)',
                      borderColor: 'var(--color-rule)',
                      color: 'var(--color-ink)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    <option value="">All States</option>
                    {US_STATES.map((s) => (
                      <option key={s.fips} value={s.fips}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-ink-muted)' }} />
                </div>
                {selectedState && (
                  <button
                    onClick={() => setSelectedState('')}
                    className="flex items-center gap-1 px-3 py-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono rounded-md border transition-colors"
                    style={{ borderColor: 'var(--color-ink-muted)', color: 'var(--color-ink-muted)' }}
                    title="Reset to all states"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
              {selectedState && (
                <div className="mt-3 text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  Zoomed &middot; {selectedStateName} &middot; {countyCount} counties
                </div>
              )}
            </div>
          </aside>
        </div>
      </header>

      {/* ── The Map Plate ─────────────────────────────────────────── */}
      <section>
        <div className="fg-rule mb-4">
          <span>The Plate:</span>
          <span>Click a county to open</span>
        </div>

        <div className="rounded-lg overflow-hidden border"
             style={{ backgroundColor: 'var(--color-cream)', borderColor: 'var(--color-rule)' }}>
          <div
            ref={svgContainerRef}
            className="relative"
            onMouseMove={handleMouseMove}
            style={{ minHeight: '420px', backgroundColor: 'var(--color-cream)' }}
          >
            <svg
              viewBox={viewBox}
              className="w-full h-auto"
              style={{ maxHeight: '640px', display: 'block' }}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Background (dimmed) counties when a state is selected */}
              {backgroundCounties.map((f) => {
                const d = pathGenerator(f);
                if (!d) return null;
                return (
                  <path
                    key={`bg-${f.properties.fips}`}
                    d={d}
                    fill="var(--color-rule-soft)"
                    stroke="var(--color-rule)"
                    strokeWidth={0.2}
                    opacity={0.5}
                  />
                );
              })}

              {/* Active counties */}
              {filteredCounties.map((f) => {
                const d = pathGenerator(f);
                if (!d) return null;
                const isHovered = hovered?.fips === f.properties.fips;
                const rucc = f.properties.rucc;
                return (
                  <path
                    key={f.properties.fips}
                    d={d}
                    fill={rucc ? RUCC_COLORS[rucc] : 'var(--color-rule-soft)'}
                    stroke={isHovered ? '#faf8f4' : 'rgba(250,248,244,0.35)'}
                    strokeWidth={isHovered ? 1.5 : 0.3}
                    opacity={isHovered ? 1 : 0.92}
                    style={{ cursor: 'pointer', transition: 'opacity 0.15s, stroke 0.15s' }}
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
                className="absolute rounded-md shadow-lg p-3 z-10 border text-sm pointer-events-none"
                style={{
                  left: Math.min(mousePos.x + 12, (svgContainerRef.current?.offsetWidth || 600) - 240),
                  top: mousePos.y - 10,
                  backgroundColor: 'var(--color-cream)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                }}
              >
                <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-1" style={{ color: 'var(--color-ink-muted)' }}>
                  Location
                </div>
                <div className="fg-display text-base leading-tight" style={{ color: 'var(--color-ink)' }}>
                  {hovered.countyName}
                </div>
                {hovered.rucc ? (
                  <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.2em] font-mono"
                       style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink-muted)' }}>
                    <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: RUCC_COLORS[hovered.rucc] }} />
                    RUCC {hovered.rucc} &middot; {RUCC_LABELS[hovered.rucc]}
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-dashed text-[0.7rem] uppercase tracking-[0.2em] font-mono italic"
                       style={{ borderColor: 'var(--color-rule)', color: 'var(--color-ink-muted)' }}>
                    No RUCC data
                  </div>
                )}
              </div>
            )}

            {/* (Overlay hint removed — rule header above the plate handles this) */}
          </div>
        </div>
      </section>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <section>
        <div className="fg-rule mb-4">
          <span>Legend:</span>
          <span>RUCC 2023 &middot; Nine codes &middot; Four tiers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-0 rounded-lg overflow-hidden border"
             style={{ borderColor: 'var(--color-rule)', backgroundColor: 'var(--color-cream)' }}>
          {RUCC_TIERS.map(({ range, label, color }, i, arr) => (
            <div key={label}
                 className={`px-4 py-3 flex items-start gap-3 ${i !== arr.length - 1 ? 'sm:border-r border-b sm:border-b-0' : ''}`}
                 style={{ borderColor: 'var(--color-rule)' }}>
              <span className="w-3 h-3 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: color }} />
              <div>
                <div className="fg-display text-lg leading-tight" style={{ color: 'var(--color-ink)' }}>{label}</div>
                <div className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                  Codes {range}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Full nine-code breakdown */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono"
             style={{ color: 'var(--color-ink-muted)' }}>
          {Object.entries(RUCC_LABELS).map(([code, label]) => (
            <span key={code} className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: RUCC_COLORS[code] }} />
              {code} &middot; {label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
