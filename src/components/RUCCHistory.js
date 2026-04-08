import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

const RUCC_COLORS = {
  1: '#991b1b', 2: '#b91c1c', 3: '#dc2626',
  4: '#d97706', 5: '#f59e0b', 6: '#fbbf24',
  7: '#16a34a', 8: '#15803d', 9: '#166534'
};

const RUCC_SHORT = {
  1: 'Metro 1M+', 2: 'Metro 250K–1M', 3: 'Metro <250K',
  4: 'Nonmetro 20K+ adj', 5: 'Nonmetro 20K+', 6: 'Nonmetro 5K–20K adj',
  7: 'Nonmetro 5K–20K', 8: 'Rural adj', 9: 'Rural remote'
};

const VINTAGES = ['1974', '1983', '1993', '2003', '2013', '2023'];

let _histData = null;
let _histPromise = null;

function loadHistoricalData() {
  if (_histData) return Promise.resolve(_histData);
  if (_histPromise) return _histPromise;
  _histPromise = fetch(`${process.env.PUBLIC_URL}/data/rucc_historical.json`)
    .then(r => {
      if (!r.ok) throw new Error('Failed to load historical RUCC data');
      return r.json();
    })
    .then(d => { _histData = d; _histPromise = null; return d; });
  return _histPromise;
}

function getTrend(codes) {
  const available = VINTAGES.filter(v => codes[v] != null);
  if (available.length < 2) return null;
  const first = codes[available[0]];
  const last = codes[available[available.length - 1]];
  if (last > first) return 'ruralizing';
  if (last < first) return 'urbanizing';
  return 'stable';
}

export default function RUCCHistory({ fips }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    setError(false);
    loadHistoricalData()
      .then(data => {
        const key = String(fips).padStart(5, '0');
        setHistory(data[key] || null);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [fips]);

  if (!fips || loading) return null;
  if (error || !history) return null;

  const availableVintages = VINTAGES.filter(v => history[v] != null);
  if (availableVintages.length === 0) return null;

  const trend = getTrend(history);
  const TrendIcon = trend === 'urbanizing' ? TrendingDown
    : trend === 'ruralizing' ? TrendingUp
    : Minus;
  const trendLabel = trend === 'urbanizing' ? 'Urbanizing'
    : trend === 'ruralizing' ? 'Becoming more rural'
    : 'Stable';
  const trendColor = trend === 'urbanizing' ? 'text-red-600'
    : trend === 'ruralizing' ? 'text-green-600'
    : 'text-slate-500';

  // Detect big 2013→2023 jump that's likely methodology, not real change
  const methodNote = history['2013'] != null && history['2023'] != null
    && Math.abs(history['2023'] - history['2013']) >= 2;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
          RUCC History (1974–2023)
        </h3>
        {trend && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            {trendLabel}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto">
        <div className="flex items-end gap-1 min-w-[400px]" style={{ height: '160px' }}>
          {VINTAGES.map((yr, i) => {
            const code = history[yr];
            if (code == null) {
              return (
                <div key={yr} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t-md bg-slate-100 dark:bg-slate-700" style={{ height: '20px' }} />
                  <div className="text-xs text-slate-400 mt-2 font-medium">{yr}</div>
                  <div className="text-[10px] text-slate-300">N/A</div>
                </div>
              );
            }

            // Bar height proportional to RUCC code (1=short, 9=tall)
            const barHeight = 20 + (code / 9) * 100;
            const prevCode = i > 0 ? history[VINTAGES[i - 1]] : null;
            const changed = prevCode != null && prevCode !== code;

            return (
              <div key={yr} className="flex-1 flex flex-col items-center justify-end group relative">
                {/* Tooltip on hover */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                  RUCC {code}: {RUCC_SHORT[code]}
                </div>

                {/* Change arrow */}
                {changed && (
                  <div className={`text-[10px] font-bold mb-1 ${code > prevCode ? 'text-green-600' : 'text-red-600'}`}>
                    {code > prevCode ? '\u2191' : '\u2193'}{Math.abs(code - prevCode)}
                  </div>
                )}

                {/* Bar */}
                <div
                  className="w-full rounded-t-md transition-all duration-300 flex items-center justify-center"
                  style={{
                    height: `${barHeight}px`,
                    backgroundColor: RUCC_COLORS[code],
                    opacity: 0.85,
                    border: changed ? '2px solid #1e293b' : 'none'
                  }}
                >
                  <span className="text-white text-sm font-bold drop-shadow-sm">{code}</span>
                </div>

                {/* Year label */}
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium">{yr}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend row */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>1–3 = Metro</span>
        <span>4–5 = Nonmetro urban</span>
        <span>6–7 = Nonmetro town</span>
        <span>8–9 = Rural</span>
      </div>

      {/* Methodology note */}
      {methodNote && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            The 2023 RUCC raised the urban population threshold from 2,500 to 5,000.
            Large shifts between 2013 and 2023 may reflect this methodology change
            rather than actual urbanization or ruralization.
          </span>
        </div>
      )}

      {/* Source */}
      <div className="mt-3 text-[10px] text-slate-400">
        Source: USDA Economic Research Service Rural-Urban Continuum Codes, via NCI SEER.
        Code 0 (central metro, used 1974–1993) recoded to 1.
      </div>
    </div>
  );
}
