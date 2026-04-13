import React from 'react';
import { X, Loader } from 'lucide-react';

const tierColor = (score) =>
  score == null ? 'var(--color-sage)' :
  score >= 80 ? '#1a5c2e' :
  score >= 60 ? '#4a7c59' :
  score >= 40 ? '#a17321' :
  score >= 20 ? '#b45309' :
                '#991b1b';

const ruccTierColor = (code) => {
  if (!code) return 'var(--color-sage)';
  if (code <= 3) return '#991b1b';
  if (code <= 5) return '#b45309';
  if (code <= 7) return '#4a7c59';
  return '#1a5c2e';
};

function ScoreBar({ score }) {
  if (score == null) return <span className="text-slate-300 font-mono text-xs">—</span>;
  const color = tierColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full min-w-[60px]" style={{ backgroundColor: 'var(--color-rule-soft)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="fg-numeral text-base w-7 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

function RuccBadge({ code }) {
  if (!code) return <span className="text-slate-300 text-xs font-mono">N/A</span>;
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-sm text-[0.7rem] font-mono font-semibold text-white"
      style={{ backgroundColor: ruccTierColor(code) }}
    >
      {code}
    </span>
  );
}

function TierPill({ score, level }) {
  const color = tierColor(score);
  return (
    <span className="inline-block text-[0.6rem] uppercase tracking-[0.24em] font-mono px-2 py-0.5 rounded border"
          style={{ color, borderColor: color }}>
      {level}
    </span>
  );
}

export default function CompareTable({ items, onRemove, getRuralityLevel }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-[rgba(26,58,42,0.1)] dark:border-slate-700">
      <div className="fg-rule mb-5">
        <span>Exhibit D</span>
        <span>Location Comparison</span>
      </div>
      <h3 className="fg-display text-3xl leading-tight mb-6" style={{ color: 'var(--color-ink)' }}>
        Side-by-<em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>side</em>.
      </h3>

      {/* Card layout for 1-2 items, table for 3+ */}
      {items.length <= 2 ? (
        <div className={`grid gap-4 ${items.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {items.map((item, idx) => {
            const level = item.score != null
              ? getRuralityLevel(item.score)
              : { level: item.level || '…', color: '' };
            const color = tierColor(item.score);

            return (
              <div key={item.name} className="fg-plate rounded-lg p-5 relative">
                <button
                  onClick={() => onRemove(item.name)}
                  className="absolute top-3 right-3 p-1 rounded transition-colors"
                  style={{ color: 'var(--color-ink-muted)' }}
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="w-4 h-4" />
                </button>

                {item.loading ? (
                  <div className="flex items-center gap-2 py-8 justify-center">
                    <Loader className="w-4 h-4 animate-spin" style={{ color: 'var(--color-ink-muted)' }} />
                    <span className="text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>Loading…</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.24em] font-mono mb-3 pr-8"
                         style={{ color: 'var(--color-ink-muted)' }}>
                      <span>Entry № {String(idx + 1).padStart(2, '0')}</span>
                      <TierPill score={item.score} level={level.level} />
                    </div>

                    <h4 className="fg-display text-2xl leading-tight mb-3" style={{ color: 'var(--color-ink)' }}>
                      {item.name}
                    </h4>

                    <div className="flex items-baseline gap-3 mb-5">
                      <span className="fg-numeral text-[4.5rem] leading-none" style={{ color }}>
                        {item.score ?? '—'}
                      </span>
                      <span className="text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                        out of 100
                      </span>
                    </div>

                    {/* Breakdown rows */}
                    <div className="space-y-3 pt-4 border-t border-dashed border-[rgba(26,58,42,0.2)] dark:border-[rgba(255,255,255,0.12)]">
                      {item.rucc != null && (
                        <div className="flex justify-between items-center">
                          <span className="text-[0.65rem] uppercase tracking-[0.22em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>RUCC</span>
                          <RuccBadge code={item.rucc} />
                        </div>
                      )}
                      {item.densityScore != null && (
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-[0.65rem] uppercase tracking-[0.22em] font-mono flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>Density</span>
                          <ScoreBar score={item.densityScore} />
                        </div>
                      )}
                      {item.distanceScore != null && (
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-[0.65rem] uppercase tracking-[0.22em] font-mono flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>Metro Distance</span>
                          <ScoreBar score={item.distanceScore} />
                        </div>
                      )}
                    </div>

                    {/* Stats footer */}
                    {(item.density != null || item.distanceToMetro != null) && (
                      <div className="mt-4 pt-3 grid grid-cols-2 gap-3 border-t border-dashed border-[rgba(26,58,42,0.2)] dark:border-[rgba(255,255,255,0.12)]">
                        {item.density != null && (
                          <div>
                            <div className="text-[0.6rem] uppercase tracking-[0.24em] font-mono mb-0.5" style={{ color: 'var(--color-ink-muted)' }}>Density</div>
                            <div className="fg-numeral text-lg" style={{ color: 'var(--color-ink)' }}>{item.density.toFixed(1)}<span className="text-xs ml-1 font-mono" style={{ color: 'var(--color-ink-muted)' }}>/sq mi</span></div>
                          </div>
                        )}
                        {item.distanceToMetro != null && (
                          <div>
                            <div className="text-[0.6rem] uppercase tracking-[0.24em] font-mono mb-0.5" style={{ color: 'var(--color-ink-muted)' }}>Nearest Metro</div>
                            <div className="fg-numeral text-lg" style={{ color: 'var(--color-ink)' }}>{Math.round(item.distanceToMetro)}<span className="text-xs ml-1 font-mono" style={{ color: 'var(--color-ink-muted)' }}>mi</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Table layout for 3+ items */
        <div className="overflow-x-auto rounded-lg border border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]"
             style={{ backgroundColor: 'var(--color-cream)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(26,58,42,0.15)] dark:border-[rgba(255,255,255,0.1)]">
                {['Location', 'Score', 'RUCC', 'Class', 'Density', 'Metro Dist.', ''].map((h) => (
                  <th key={h}
                      className={`py-2.5 px-3 text-[0.65rem] uppercase tracking-[0.22em] font-mono font-normal ${h === 'Location' ? 'text-left' : h === '' ? 'w-8' : h === 'Density' || h === 'Metro Dist.' ? 'text-right' : 'text-center'}`}
                      style={{ color: 'var(--color-ink-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const level = item.score != null
                  ? getRuralityLevel(item.score)
                  : { level: item.level || '…', color: '' };

                return (
                  <tr key={item.name} className="border-b border-dashed border-[rgba(26,58,42,0.12)] dark:border-[rgba(255,255,255,0.08)] last:border-0">
                    <td className="py-3 px-3 fg-display text-base" style={{ color: 'var(--color-ink)' }}>
                      {item.name}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.loading ? (
                        <Loader className="w-4 h-4 animate-spin mx-auto" style={{ color: 'var(--color-ink-muted)' }} />
                      ) : (
                        <span className="fg-numeral text-2xl" style={{ color: tierColor(item.score) }}>
                          {item.score ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center"><RuccBadge code={item.rucc} /></td>
                    <td className="py-3 px-3 text-center">
                      <TierPill score={item.score} level={item.loading ? '…' : level.level} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs" style={{ color: 'var(--color-ink)' }}>
                      {item.density != null ? item.density.toFixed(1) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs" style={{ color: 'var(--color-ink)' }}>
                      {item.distanceToMetro != null ? `${Math.round(item.distanceToMetro)} mi` : '—'}
                    </td>
                    <td className="py-3 pl-2 pr-3">
                      <button
                        onClick={() => onRemove(item.name)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--color-ink-muted)' }}
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
