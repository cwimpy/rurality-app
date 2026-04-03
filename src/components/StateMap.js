import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { Loader } from 'lucide-react';

const RUCC_COLORS = {
  1: '#991b1b', 2: '#b91c1c', 3: '#dc2626',
  4: '#d97706', 5: '#f59e0b', 6: '#fbbf24',
  7: '#16a34a', 8: '#15803d', 9: '#166534'
};

const RUCC_LABELS = {
  1: 'Metro 1M+', 2: 'Metro 250K–1M', 3: 'Metro <250K',
  4: 'Nonmetro 20K+, adj', 5: 'Nonmetro 20K+, nonadj', 6: 'Nonmetro 2.5K–20K, adj',
  7: 'Nonmetro 2.5K–20K, nonadj', 8: 'Nonmetro <2.5K, adj', 9: 'Nonmetro <2.5K, nonadj'
};

export default function StateMap({ onLocationSearch }) {
  const [geoData, setGeoData] = useState(null);
  const [ruccData, setRuccData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [geoRes, ruccRes] = await Promise.all([
          fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'),
          fetch(`${process.env.PUBLIC_URL}/data/rucc.json`)
        ]);
        if (!geoRes.ok) throw new Error('Failed to load county boundaries');
        const topo = await geoRes.json();
        const rucc = await ruccRes.json();

        // Convert TopoJSON to GeoJSON
        const { feature } = await import('topojson-client');
        const geo = feature(topo, topo.objects.counties);

        if (!cancelled) {
          setGeoData(geo);
          setRuccData(rucc);
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

  const styledGeo = useMemo(() => {
    if (!geoData || !ruccData) return null;
    return {
      ...geoData,
      features: geoData.features.map(f => {
        const fips = String(f.id).padStart(5, '0');
        const rucc = ruccData[fips];
        return { ...f, properties: { ...f.properties, fips, rucc } };
      })
    };
  }, [geoData, ruccData]);

  function styleFeature(feature) {
    const rucc = feature.properties.rucc;
    return {
      fillColor: rucc ? RUCC_COLORS[rucc] : '#e2e8f0',
      weight: 0.3,
      color: '#94a3b8',
      fillOpacity: 0.75
    };
  }

  function onEachFeature(feature, layer) {
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 2, color: '#1e293b', fillOpacity: 0.9 });
        e.target.bringToFront();
        setHovered({
          fips: feature.properties.fips,
          rucc: feature.properties.rucc,
          name: feature.properties.name || `FIPS ${feature.properties.fips}`
        });
      },
      mouseout: (e) => {
        e.target.setStyle(styleFeature(feature));
        setHovered(null);
      },
      click: () => {
        if (onLocationSearch && feature.properties.name) {
          onLocationSearch(feature.properties.name + ' County');
        }
      }
    });
  }

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
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
            U.S. Counties by RUCC
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            USDA Rural-Urban Continuum Codes (2023). Click a county to analyze it.
          </p>
        </div>

        <div className="relative" style={{ height: '500px' }}>
          <MapContainer
            center={[39.8, -98.6]}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              opacity={0.3}
            />
            {styledGeo && (
              <GeoJSON
                data={styledGeo}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            )}
          </MapContainer>

          {/* Hover tooltip */}
          {hovered && (
            <div className="absolute top-3 right-3 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3 z-[1000] border border-slate-200 dark:border-slate-600 text-sm">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{hovered.name}</div>
              {hovered.rucc ? (
                <div className="text-slate-600 dark:text-slate-300 mt-1">
                  <span className="inline-block w-3 h-3 rounded-sm mr-1.5" style={{ backgroundColor: RUCC_COLORS[hovered.rucc] }} />
                  RUCC {hovered.rucc}: {RUCC_LABELS[hovered.rucc]}
                </div>
              ) : (
                <div className="text-slate-400">No RUCC data</div>
              )}
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
