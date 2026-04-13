import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

const RUCC_TIER_COLOR = (code) => {
  if (!code) return 'var(--color-sage)';
  if (code <= 3) return '#991b1b';
  if (code <= 5) return '#b45309';
  if (code <= 7) return '#4a7c59';
  return '#1a5c2e';
};

const RUCC_SHORT = {
  1: 'Metro 1M+', 2: 'Metro 250K–1M', 3: 'Metro <250K',
  4: 'Nonmetro 20K+ adj', 5: 'Nonmetro 20K+', 6: 'Nonmetro 5K–20K adj',
  7: 'Nonmetro 5K–20K', 8: 'Rural adj', 9: 'Rural remote',
};

const VINTAGES = ['1974', '1983', '1993', '2003', '2013', '2023'];

let _histData = null;
let _histPromise = null;

function loadHistoricalData() {
  if (_histData) return Promise.resolve(_histData);
  if (_histPromise) return _histPromise;
  _histPromise = fetch(`${process.env.PUBLIC_URL}/data/rucc_historical.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Failed to load historical RUCC data');
      return r.json();
    })
    .then((d) => {
      _histData = d;
      _histPromise = null;
      return d;
    });
  return _histPromise;
}

function getTrend(codes) {
  const available = VINTAGES.filter((v) => codes[v] != null);
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
      .then((data) => {
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

  const availableVintages = VINTAGES.filter((v) => history[v] != null);
  if (availableVintages.length === 0) return null;

  const trend = getTrend(history);
  const TrendIcon = trend === 'urbanizing' ? TrendingDown
    : trend === 'ruralizing' ? TrendingUp
    : Minus;
  const trendLabel = trend === 'urbanizing' ? 'Urbanizing'
    : trend === 'ruralizing' ? 'Becoming more rural'
    : 'Stable';
  const trendColor = trend === 'urbanizing' ? '#b45309'
    : trend === 'ruralizing' ? '#4a7c59'
    : 'var(--color-sage)';

  const methodNote =
    history['2013'] != null && history['2023'] != null &&
    Math.abs(history['2023'] - history['2013']) >= 2;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-[rgba(26,58,42,0.1)] dark:border-slate-700">
      <div className="fg-rule mb-5">
        <span>Exhibit C</span>
        <span>RUCC History &mdash; 1974 / 2023</span>
      </div>

      <div className="flex items-end justify-between mb-5 gap-4">
        <div>
          <h3 className="fg-display text-3xl leading-tight" style={{ color: 'var(--color-ink)' }}>
            Classification over <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>time</em>
          </h3>
          <p className="mt-1 text-[0.7rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
            Six decennial revisions &middot; USDA ERS / NCI SEER
          </p>
        </div>
        {trend && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border"
               style={{ borderColor: trendColor, color: trendColor }}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span className="text-[0.65rem] uppercase tracking-wider font-mono">{trendLabel}</span>
          </div>
        )}
      </div>

      {/* Timeline — field-guide bars */}
      <div className="overflow-x-auto">
        <div className="flex items-end gap-2 min-w-[440px]" style={{ height: '180px' }}>
          {VINTAGES.map((yr, i) => {
            const code = history[yr];
            if (code == null) {
              return (
                <div key={yr} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t-sm" style={{ height: '18px', backgroundColor: 'var(--color-rule-soft)' }} />
                  <div className="mt-2 text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>{yr}</div>
                  <div className="text-[0.6rem] font-mono" style={{ color: 'var(--color-ink-subtle)' }}>n/a</div>
                </div>
              );
            }
            const barHeight = 28 + (code / 9) * 110;
            const prevCode = i > 0 ? history[VINTAGES[i - 1]] : null;
            const changed = prevCode != null && prevCode !== code;
            const color = RUCC_TIER_COLOR(code);

            return (
              <div key={yr} className="flex-1 flex flex-col items-center justify-end group relative">
                {/* Tooltip */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[0.7rem] rounded-md px-2 py-1 whitespace-nowrap z-10 pointer-events-none"
                     style={{ backgroundColor: 'var(--color-forest)' }}>
                  RUCC {code} &middot; {RUCC_SHORT[code]}
                </div>

                {/* Change indicator */}
                {changed && (
                  <div className="text-[0.6rem] font-mono mb-1 uppercase tracking-wider"
                       style={{ color: code > prevCode ? '#4a7c59' : '#b45309' }}>
                    {code > prevCode ? '\u2191' : '\u2193'}{Math.abs(code - prevCode)}
                  </div>
                )}

                {/* Bar with inset numeral */}
                <div
                  className="w-full rounded-t-sm transition-all duration-300 flex items-end justify-center pb-1"
                  style={{
                    height: `${barHeight}px`,
                    backgroundColor: color,
                    outline: changed ? '1.5px dashed rgba(26,58,42,0.55)' : 'none',
                    outlineOffset: changed ? '2px' : 0,
                  }}
                >
                  <span className="fg-numeral text-xl text-white" style={{ opacity: 0.95 }}>{code}</span>
                </div>

                <div className="mt-2 text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>{yr}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-5 pt-4 border-t border-dashed border-[rgba(26,58,42,0.18)] dark:border-[rgba(255,255,255,0.1)] flex flex-wrap gap-x-5 gap-y-2 text-[0.65rem] uppercase tracking-[0.22em] font-mono"
           style={{ color: 'var(--color-ink-muted)' }}>
        {[
          ['1–3', 'Metro',          '#991b1b'],
          ['4–5', 'Nonmetro urban', '#b45309'],
          ['6–7', 'Nonmetro town',  '#4a7c59'],
          ['8–9', 'Rural',          '#1a5c2e'],
        ].map(([range, label, c]) => (
          <span key={label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
            {range} · {label}
          </span>
        ))}
      </div>

      {/* Methodology note */}
      {methodNote && (
        <div className="mt-4 rounded-md border-l-4 px-4 py-3 text-sm flex items-start gap-2"
             style={{ borderColor: 'var(--color-wheat)', backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-wheat)' }} />
          <span>
            <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-1.5" style={{ color: 'var(--color-ink-muted)' }}>Note</span>
            The 2023 RUCC raised the urban population threshold from 2,500 to 5,000. Large shifts
            between 2013 and 2023 may reflect this methodology change rather than actual
            urbanization or ruralization.
          </span>
        </div>
      )}

      {/* Source */}
      <div className="mt-3 text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)', opacity: 0.7 }}>
        Source &mdash; USDA ERS Rural-Urban Continuum Codes via NCI SEER · Code 0 (1974–1993) recoded to 1
      </div>
    </div>
  );
}
