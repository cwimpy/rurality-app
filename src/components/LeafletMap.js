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

export default function LeafletMap({ coordinates, locationName, score, onMapClick, loading }) {
  const center = coordinates
    ? [coordinates.lat, coordinates.lng]
    : [39.8283, -98.5795]; // Center of US
  const zoom = coordinates ? 10 : 4;

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
              <div className="text-center">
                <div className="font-bold text-slate-800">{locationName || 'Selected Location'}</div>
                {score !== null && score !== undefined && (
                  <div className="text-sm mt-1">
                    Rural Index Score: <span className="font-semibold">{score}</span>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Location badge — bottom-left to avoid zoom controls */}
      {locationName && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg">
          {locationName}
          {score !== null && score !== undefined && (
            <span className="ml-2 bg-green-700 px-2 py-1 rounded text-xs">
              RRI: {score}
            </span>
          )}
        </div>
      )}

      {/* Click hint */}
      {!loading && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs text-slate-600 shadow-sm border border-green-100">
          Click map to analyze a location
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] bg-white/60 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-sm text-slate-700 font-medium">
            Analyzing location...
          </div>
        </div>
      )}
    </div>
  );
}
