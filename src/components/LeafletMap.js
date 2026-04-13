import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue with Webpack/CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Recenter the map when coordinates change
function MapUpdater({ center, zoom }) {
  const map = useMap();
  const prevCenter = useRef(center);

  useEffect(() => {
    if (
      center &&
      (center[0] !== prevCenter.current?.[0] || center[1] !== prevCenter.current?.[1])
    ) {
      map.flyTo(center, zoom, { duration: 1 });
      prevCenter.current = center;
    }
  }, [center, zoom, map]);

  return null;
}

// Handle click events on the map
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

const tierColor = (score) => {
  if (score == null) return '#1a3a2a';
  if (score >= 80) return '#1a5c2e';
  if (score >= 60) return '#4a7c59';
  if (score >= 40) return '#a17321';
  if (score >= 20) return '#b45309';
  return '#991b1b';
};

export default function LeafletMap({ coordinates, locationName, score, onMapClick, loading }) {
  const center = coordinates
    ? [coordinates.lat, coordinates.lng]
    : [39.8283, -98.5795]; // Center of U.S.
  const zoom = coordinates ? 10 : 4;
  const scoreColor = tierColor(score);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center} zoom={zoom} />
        <ClickHandler onMapClick={onMapClick} />

        {coordinates && (
          <Marker position={[coordinates.lat, coordinates.lng]}>
            <Popup>
              <div style={{ textAlign: 'center', minWidth: 140 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase',
                  color: '#4a7c59', marginBottom: 4,
                }}>
                  Current Pin
                </div>
                <div style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 16, color: '#1a3a2a', lineHeight: 1.2,
                }}>
                  {locationName || 'Selected location'}
                </div>
                {score !== null && score !== undefined && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(26,58,42,0.2)' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase',
                      color: '#4a7c59', marginRight: 6,
                    }}>RRI</span>
                    <span style={{
                      fontFamily: "'Source Serif 4', Georgia, serif",
                      fontVariantNumeric: 'oldstyle-nums',
                      fontSize: 22, color: scoreColor, letterSpacing: '-0.03em',
                    }}>{score}</span>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Location badge — bottom-left, field-guide style */}
      {locationName && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-md shadow-lg backdrop-blur-sm px-3 py-2 border"
             style={{
               backgroundColor: 'rgba(250,248,244,0.94)',
               borderColor: 'rgba(26,58,42,0.2)',
             }}>
          <div className="text-[0.6rem] uppercase tracking-[0.28em] font-mono" style={{ color: '#4a7c59' }}>
            Current Pin
          </div>
          <div className="flex items-baseline gap-2.5 mt-0.5">
            <span style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontSize: 15, color: '#1a3a2a', lineHeight: 1.15,
            }}>
              {locationName}
            </span>
            {score !== null && score !== undefined && (
              <span className="flex items-baseline gap-1.5 pl-2 border-l" style={{ borderColor: 'rgba(26,58,42,0.2)' }}>
                <span className="text-[0.6rem] uppercase tracking-[0.22em] font-mono" style={{ color: '#4a7c59' }}>RRI</span>
                <span style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontVariantNumeric: 'oldstyle-nums',
                  fontSize: 18, color: scoreColor, letterSpacing: '-0.03em',
                }}>{score}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Click hint — top-right, parchment pill */}
      {!loading && (
        <div className="absolute top-4 right-4 z-[1000] px-3 py-1.5 rounded-md backdrop-blur-sm border text-[0.6rem] uppercase tracking-[0.24em] font-mono"
             style={{
               backgroundColor: 'rgba(250,248,244,0.9)',
               borderColor: 'rgba(26,58,42,0.2)',
               color: '#4a7c59',
             }}>
          Click map to analyze
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center"
             style={{ backgroundColor: 'rgba(250,248,244,0.72)' }}>
          <div className="rounded-md border shadow-lg px-6 py-4 flex items-center gap-3"
               style={{
                 backgroundColor: '#faf8f4',
                 borderColor: 'rgba(26,58,42,0.2)',
               }}>
            <div className="animate-spin w-4 h-4 rounded-full"
                 style={{
                   borderWidth: '2px', borderStyle: 'solid',
                   borderColor: 'rgba(26,58,42,0.15)', borderTopColor: '#d4a843',
                 }} />
            <span className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: '#4a7c59' }}>
              Analyzing Location…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
