import React, { useState, useRef } from 'react';
import { Upload, Download, AlertCircle, CheckCircle, Loader, X } from 'lucide-react';
import { geocodeWithCache, fetchCensusData, getCountyFromCoordinates } from '../utils/apiUtils';
import { calculateRuralityScore } from '../services/ruralityCalculator';
import { getRUCAForZcta, loadRucaData } from '../data/rucaZcta';
import { getRUCC } from '../data/ruralUrbanCodes';

const tierColor = (score) =>
  score == null ? 'var(--color-ink-muted)' :
  score >= 80 ? '#1a5c2e' :
  score >= 60 ? '#4a7c59' :
  score >= 40 ? '#a17321' :
  score >= 20 ? '#b45309' :
                '#991b1b';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Handles quoted fields with embedded commas ("Travis County, TX") and
// doubled-quote escapes (""") within a quoted field. Plain split(',') would
// truncate any row whose location string contains a comma.
function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const locCol = header.findIndex((h) =>
    ['location', 'address', 'place', 'city', 'zip', 'zipcode', 'zip_code', 'name'].includes(h)
  );
  if (locCol === -1) return null;
  return lines.slice(1)
    .map((line) => parseCSVLine(line).map((c) => c.trim()))
    .filter((cols) => cols[locCol]?.trim())
    .map((cols) => cols[locCol].trim());
}

function exportResultsCSV(results) {
  const headers = ['location', 'score', 'classification', 'confidence', 'county', 'state_fips', 'county_fips', 'rucc', 'population_density', 'distance_to_metro_mi', 'status'];
  const rows = results.map((r) => {
    if (r.error) return [r.location, '', '', '', '', '', '', '', '', '', r.error];
    const d = r.data;
    return [
      r.location, d.overallScore, d.classification?.label || '', d.confidence || '',
      d.countyName || '', d.stateFips || '', d.countyFips || '',
      d.rucc ?? '', d.density ?? '', d.distanceMi ?? '', 'OK',
    ];
  });
  // Double-quote any " in values so CSV consumers (Excel, R, pandas) parse
  // quoted fields correctly — error messages can contain quotes.
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
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
    const locs = textInput.split('\n').map((l) => l.trim()).filter(Boolean);
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

    // RUCA table must be loaded before getRUCAForZcta can return a code.
    await loadRucaData().catch(() => {});

    for (let i = 0; i < locations.length; i++) {
      if (abortRef.current) break;
      const loc = locations[i];
      try {
        const geo = await geocodeWithCache(loc);
        if (!geo?.lat) throw new Error('Could not geocode');

        const county = await getCountyFromCoordinates(geo.lat, geo.lng);
        const census = await fetchCensusData(county.stateFips, county.countyFips);
        const zip = geo.postcode?.slice(0, 5);
        const ruca = zip ? getRUCAForZcta(zip) : null;
        const rucc = getRUCC(county.stateFips, county.countyFips);

        const populationDensity = county.areaSqMiles > 0
          ? census.totalPopulation / county.areaSqMiles
          : 0;

        const calc = calculateRuralityScore({
          lat: geo.lat,
          lng: geo.lng,
          populationDensity,
          ruca,
          broadbandAccess: null,
        });

        const nearestMetroMi = Math.round(Math.min(
          calc.components.distance.nearestLargeMetro,
          calc.components.distance.nearestMediumMetro,
          calc.components.distance.nearestSmallMetro
        ));

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
            density: Math.round(populationDensity),
            distanceMi: nearestMetroMi,
          },
        });
      } catch (err) {
        out.push({ location: loc, error: err.message || 'Failed' });
      }
      setResults([...out]);
      setProgress(((i + 1) / locations.length) * 100);
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

  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  return (
    <div className="space-y-10 sm:space-y-12 pb-8">
      {/* ── Editorial masthead ─────────────────────────────────────── */}
      <header className="topo-bg rounded-2xl border px-6 sm:px-10 pt-8 pb-10 sm:pt-10 sm:pb-12"
              style={{ backgroundColor: 'var(--color-parchment)', borderColor: 'var(--color-rule)' }}>
        <div className="fg-rule mb-8">
          <span>§ Batch Inquiry</span>
          <span className="hidden sm:inline">Up to 100 locations per run</span>
          <span>CSV · Paste · Export</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8">
            <h2 className="fg-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95]" style={{ color: 'var(--color-ink)' }}>
              Run <em className="not-italic" style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>many</em> at once.
            </h2>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed"
               style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
              Upload a CSV or paste a list of locations and the tool will geocode each,
              pull Census + USDA data, and compute a rurality score for every row.
              Rate-limited to one lookup per second per Nominatim policy.
            </p>
          </div>
          <aside className="lg:col-span-4">
            <div className="pl-5 border-l-2" style={{ borderColor: 'var(--color-wheat)' }}>
              <div className="text-[0.65rem] uppercase tracking-[0.28em] mb-3 font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                The Ledger
              </div>
              {[
                ['100', 'locations per batch'],
                ['1.1s', 'rate-limited per lookup'],
                ['11', 'columns in the export'],
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

      {/* ── Input stage ───────────────────────────────────────────── */}
      {locations.length === 0 && (
        <section>
          <div className="fg-rule mb-5">
            <span>§ 1 · Load</span>
            <span>CSV or paste · max 100</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* File upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="rounded-lg p-8 text-center cursor-pointer transition-colors group"
              style={{
                backgroundColor: 'var(--color-cream)',
                border: '2px dashed var(--color-ink-muted)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-wheat)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-ink-muted)'}
            >
              <Upload className="w-7 h-7 mx-auto mb-4" style={{ color: 'var(--color-ink-muted)' }} />
              <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
                Upload CSV
              </div>
              <p className="fg-display text-lg" style={{ color: 'var(--color-ink)' }}>
                Drop a file or click to browse.
              </p>
              <p className="mt-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)', opacity: 0.8 }}>
                Column must be named: location · address · place · city · zip
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>

            {/* Paste */}
            <div className="rounded-lg p-5"
                 style={{ backgroundColor: 'var(--color-cream)', border: '1px solid var(--color-rule)' }}>
              <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
                Or Paste Locations
              </div>
              <p className="fg-display text-lg mb-3" style={{ color: 'var(--color-ink)' }}>
                One per <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>line</em>.
              </p>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={5}
                placeholder={'Jonesboro, AR\nJasper, AR\n72401\nTravis County, TX'}
                className="w-full p-3 text-sm resize-none outline-none transition-colors"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-rule)',
                  color: 'var(--color-ink)',
                  borderRadius: '4px',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-wheat)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-rule)'}
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim()}
                className="mt-3 flex items-center gap-2 px-5 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono transition-colors disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-forest)', color: 'var(--color-wheat)' }}
              >
                <span>Load Locations</span>
                <span aria-hidden>&rarr;</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Processing / Results stage ────────────────────────────── */}
      {locations.length > 0 && (
        <section>
          <div className="fg-rule mb-5">
            <span>§ 2 · {processing ? 'Processing' : results.length > 0 ? 'Results' : 'Ready'}</span>
            <span>{locations.length} location{locations.length !== 1 ? 's' : ''} loaded</span>
          </div>

          <div className="rounded-lg overflow-hidden border"
               style={{ backgroundColor: 'var(--color-cream)', borderColor: 'var(--color-rule)' }}>
            {/* Controls bar */}
            <div className="flex items-center justify-between px-5 py-4 border-b"
                 style={{ borderColor: 'var(--color-rule)' }}>
              <div className="flex items-center gap-4">
                <span className="fg-numeral text-3xl" style={{ color: 'var(--color-ink)' }}>
                  {locations.length}
                </span>
                <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  {processing
                    ? 'Analyzing…'
                    : results.length > 0
                      ? `${successCount} OK · ${errorCount} failed`
                      : 'Ready to process'}
                </span>
              </div>
              <div className="flex gap-2">
                {!processing && results.length === 0 && (
                  <button onClick={processLocations}
                          className="flex items-center gap-2 px-5 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono"
                          style={{ backgroundColor: 'var(--color-forest)', color: 'var(--color-wheat)' }}>
                    <span>Start</span>
                    <span aria-hidden>&rarr;</span>
                  </button>
                )}
                {processing && (
                  <button onClick={handleCancel}
                          className="flex items-center gap-2 px-4 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono border"
                          style={{ borderColor: '#991b1b', color: '#991b1b' }}>
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                )}
                <button onClick={handleClear}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono border"
                        style={{ borderColor: 'var(--color-ink-muted)', color: 'var(--color-ink-muted)' }}>
                  Clear
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {(processing || results.length > 0) && (
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-rule)' }}>
                <div className="flex items-baseline justify-between mb-2 text-[0.65rem] uppercase tracking-[0.24em] font-mono"
                     style={{ color: 'var(--color-ink-muted)' }}>
                  <span>
                    <span className="fg-numeral text-base mr-1.5" style={{ color: 'var(--color-ink)' }}>{results.length}</span>
                    / {locations.length} processed
                  </span>
                  <span>
                    <span style={{ color: '#4a7c59' }}>{successCount} ok</span>
                    {errorCount > 0 && (
                      <>
                        {' · '}<span style={{ color: '#991b1b' }}>{errorCount} failed</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                       style={{ width: `${progress}%`, backgroundColor: 'var(--color-wheat)' }} />
                </div>
              </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-rule)' }}>
                      {['#', 'Location', 'Score', 'Classification', 'County', 'RUCC', ''].map((h, i) => (
                        <th key={h || i}
                            className={`py-2.5 px-3 text-[0.65rem] uppercase tracking-[0.22em] font-mono font-normal ${i === 0 ? 'text-right w-12' : i === 2 ? 'text-center' : i === 5 ? 'text-center' : 'text-left'}`}
                            style={{ color: 'var(--color-ink-muted)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-dashed" style={{ borderColor: 'var(--color-rule-soft)' }}>
                        <td className="py-2.5 px-3 text-right font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 fg-display text-sm" style={{ color: 'var(--color-ink)' }}>
                          {r.location}
                        </td>
                        {r.error ? (
                          <>
                            <td colSpan={3} className="py-2.5 px-3 font-mono text-xs italic" style={{ color: '#991b1b' }}>
                              {r.error}
                            </td>
                            <td className="py-2.5 px-3 text-center">—</td>
                            <td className="py-2.5 px-3 text-center">
                              <AlertCircle className="w-4 h-4 mx-auto" style={{ color: '#991b1b' }} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3 text-center">
                              <span className="fg-numeral text-xl" style={{ color: tierColor(r.data.overallScore) }}>
                                {r.data.overallScore}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[0.65rem] uppercase tracking-[0.2em] font-mono"
                                style={{ color: tierColor(r.data.overallScore) }}>
                              {r.data.classification?.label}
                            </td>
                            <td className="py-2.5 px-3 text-sm" style={{ color: 'var(--color-ink)' }}>
                              {r.data.countyName}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-xs" style={{ color: 'var(--color-ink)' }}>
                              {r.data.rucc ?? '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <CheckCircle className="w-4 h-4 mx-auto" style={{ color: '#4a7c59' }} />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {processing && results.length < locations.length && (
                      <tr>
                        <td className="py-2.5 px-3 text-right font-mono text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                          {String(results.length + 1).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 italic" style={{ color: 'var(--color-ink-muted)', fontFamily: 'var(--font-display)' }}>
                          {locations[results.length]}
                        </td>
                        <td colSpan={5} className="py-2.5 px-3">
                          <span className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-wheat)' }}>
                            <Loader className="w-3.5 h-3.5 animate-spin" />
                            Analyzing…
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Export */}
            {results.length > 0 && !processing && (
              <div className="px-5 py-4 border-t flex items-center justify-between gap-3"
                   style={{ borderColor: 'var(--color-rule)' }}>
                <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                  Ready &mdash; 11 columns &middot; {results.length} rows
                </span>
                <button
                  onClick={() => exportResultsCSV(results)}
                  className="flex items-center gap-2 px-5 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono"
                  style={{ backgroundColor: 'var(--color-wheat)', color: '#1a3a2a' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Results CSV</span>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border-l-4 px-4 py-3 text-sm flex items-start gap-2"
             style={{ borderColor: '#991b1b', backgroundColor: 'var(--color-parchment)', color: '#991b1b' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-1.5">Error</span>
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
