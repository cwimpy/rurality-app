import React, { useState, useRef } from 'react';
import { Upload, Download, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { geocodeWithCache, fetchCensusData, getCountyFromCoordinates } from '../utils/apiUtils';
import { calculateRuralityScore } from '../services/ruralityCalculator';
import { getRUCAForZcta } from '../data/rucaZcta';
import { getRUCC } from '../data/ruralUrbanCodes';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const locCol = header.findIndex(h =>
    ['location', 'address', 'place', 'city', 'zip', 'zipcode', 'zip_code', 'name'].includes(h)
  );
  if (locCol === -1) return null;
  return lines.slice(1)
    .map(line => line.split(',').map(c => c.trim().replace(/"/g, '')))
    .filter(cols => cols[locCol]?.trim())
    .map(cols => cols[locCol].trim());
}

function exportResultsCSV(results) {
  const headers = ['location', 'score', 'classification', 'confidence', 'county', 'state_fips', 'county_fips', 'rucc', 'population_density', 'distance_to_metro_mi', 'status'];
  const rows = results.map(r => {
    if (r.error) return [r.location, '', '', '', '', '', '', '', '', '', r.error];
    const d = r.data;
    return [
      r.location, d.overallScore, d.classification?.label || '', d.confidence || '',
      d.countyName || '', d.stateFips || '', d.countyFips || '',
      d.rucc ?? '', d.density ?? '', d.distanceMi ?? '', 'OK'
    ];
  });
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rurality_batch_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchLookup() {
  const [locations, setLocations] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [textInput, setTextInput] = useState('');
  const fileRef = useRef();
  const abortRef = useRef(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if (parsed === null) {
        setError('CSV must have a column named "location", "address", "place", "city", or "zip".');
        return;
      }
      if (parsed.length === 0) {
        setError('No locations found in file.');
        return;
      }
      if (parsed.length > 100) {
        setError('Maximum 100 locations per batch. Your file has ' + parsed.length + '.');
        return;
      }
      setLocations(parsed);
      setResults([]);
    };
    reader.readAsText(file);
  }

  function handleTextSubmit() {
    const locs = textInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (locs.length === 0) return;
    if (locs.length > 100) {
      setError('Maximum 100 locations per batch.');
      return;
    }
    setLocations(locs);
    setResults([]);
    setError('');
  }

  async function processLocations() {
    setProcessing(true);
    setProgress(0);
    abortRef.current = false;
    const out = [];

    for (let i = 0; i < locations.length; i++) {
      if (abortRef.current) break;
      const loc = locations[i];
      try {
        const geo = await geocodeWithCache(loc);
        if (!geo?.lat) throw new Error('Could not geocode');

        const county = await getCountyFromCoordinates(geo.lat, geo.lng);
        const census = await fetchCensusData(county.stateFips, county.countyFips);
        const zip = geo.postcode?.slice(0, 5);
        const ruca = zip ? await getRUCAForZcta(zip) : null;
        const rucc = getRUCC(county.stateFips, county.countyFips);

        const calc = calculateRuralityScore({
          latitude: geo.lat,
          longitude: geo.lng,
          populationDensity: census.totalPopulation / county.areaSqMiles,
          rucaCode: ruca,
          broadbandAccess: null
        });

        out.push({
          location: loc,
          data: {
            overallScore: calc.overallScore,
            classification: calc.classification,
            confidence: calc.confidence,
            countyName: county.countyName,
            stateFips: county.stateFips,
            countyFips: county.countyFips,
            rucc,
            density: Math.round(census.totalPopulation / county.areaSqMiles),
            distanceMi: Math.round(calc.components.distance.nearestSmallMetro)
          }
        });
      } catch (err) {
        out.push({ location: loc, error: err.message || 'Failed' });
      }
      setResults([...out]);
      setProgress(((i + 1) / locations.length) * 100);
      // Rate limit: wait 1.1s between requests (Nominatim policy)
      if (i < locations.length - 1) await sleep(1100);
    }

    setProcessing(false);
  }

  function handleCancel() {
    abortRef.current = true;
  }

  function handleClear() {
    setLocations([]);
    setResults([]);
    setProgress(0);
    setError('');
    setTextInput('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Batch Lookup
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Upload a CSV or paste a list of locations to calculate rurality scores in bulk. Maximum 100 locations per batch.
        </p>

        {locations.length === 0 ? (
          <div className="space-y-4">
            {/* File upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400 font-medium">Drop a CSV file or click to upload</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Must have a column named "location", "address", "city", or "zip"</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>

            {/* Or paste text */}
            <div className="text-center text-sm text-slate-400">or paste locations below (one per line)</div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={5}
              placeholder={"Jonesboro, AR\nJasper, AR\n72401\nTravis County, TX"}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleTextSubmit}
              disabled={!textInput.trim()}
              className="px-6 py-2.5 text-white rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-forest)' }}
            >
              Load Locations
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {locations.length} location{locations.length !== 1 ? 's' : ''} loaded
              </span>
              <div className="flex gap-2">
                {!processing && results.length === 0 && (
                  <button onClick={processLocations} className="px-5 py-2 text-white rounded-xl text-sm" style={{ backgroundColor: 'var(--color-forest)' }}>
                    Start Processing
                  </button>
                )}
                {processing && (
                  <button onClick={handleCancel} className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">
                    Cancel
                  </button>
                )}
                <button onClick={handleClear} className="px-5 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm hover:bg-slate-300 dark:hover:bg-slate-500">
                  Clear
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {(processing || results.length > 0) && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>{results.length} / {locations.length} processed</span>
                  <span>{successCount} OK{errorCount > 0 ? `, ${errorCount} failed` : ''}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, backgroundColor: 'var(--color-sage)' }}
                  />
                </div>
              </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-600 text-left text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3">Location</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Classification</th>
                      <th className="py-2 pr-3">County</th>
                      <th className="py-2 pr-3">RUCC</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{r.location}</td>
                        {r.error ? (
                          <>
                            <td colSpan={4} className="py-2 pr-3 text-red-600 dark:text-red-400 text-xs">{r.error}</td>
                            <td className="py-2"><AlertCircle className="w-4 h-4 text-red-500" /></td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-3 font-bold text-slate-800 dark:text-slate-100">{r.data.overallScore}</td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.data.classification?.label}</td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.data.countyName}</td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.data.rucc ?? '—'}</td>
                            <td className="py-2"><CheckCircle className="w-4 h-4 text-green-600" /></td>
                          </>
                        )}
                      </tr>
                    ))}
                    {processing && results.length < locations.length && (
                      <tr>
                        <td className="py-2 pr-3 text-slate-400 dark:text-slate-500">{locations[results.length]}</td>
                        <td colSpan={5} className="py-2"><Loader className="w-4 h-4 animate-spin text-slate-400" /></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Download button */}
            {results.length > 0 && !processing && (
              <button
                onClick={() => exportResultsCSV(results)}
                className="flex items-center space-x-2 px-5 py-2.5 text-white rounded-xl text-sm"
                style={{ backgroundColor: 'var(--color-forest)' }}
              >
                <Download className="w-4 h-4" />
                <span>Download Results CSV</span>
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
