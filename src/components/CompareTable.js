import React from 'react';
import { X, Loader } from 'lucide-react';

const RUCC_COLORS = {
  1: '#991b1b', 2: '#b91c1c', 3: '#dc2626',
  4: '#d97706', 5: '#f59e0b', 6: '#fbbf24',
  7: '#16a34a', 8: '#15803d', 9: '#166534'
};

function ScoreBar({ score, label }) {
  if (score == null) return <span className="text-slate-300">--</span>;
  const color = score >= 60 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2 min-w-[60px]">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 w-8 text-right">{score}</span>
    </div>
  );
}

function RuccBadge({ code }) {
  if (!code) return <span className="text-slate-300 text-sm">N/A</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-white"
      style={{ backgroundColor: RUCC_COLORS[code] || '#94a3b8' }}
    >
      {code}
    </span>
  );
}

export default function CompareTable({ items, onRemove, getRuralityLevel }) {
  if (!items || items.length === 0) return null;


  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        Location Comparison
      </h3>

      {/* Card layout for 1-2 items, table for 3+ */}
      {items.length <= 2 ? (
        <div className={`grid gap-4 ${items.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {items.map((item) => {
            const level = item.score != null
              ? getRuralityLevel(item.score)
              : { level: item.level || '...', color: 'text-slate-600 bg-slate-100 border-slate-200' };

            return (
              <div key={item.name} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 border border-slate-200 dark:border-slate-600 relative">
                <button
                  onClick={() => onRemove(item.name)}
                  className="absolute top-3 right-3 p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {item.loading ? (
                  <div className="flex items-center gap-2 py-8 justify-center">
                    <Loader className="w-5 h-5 animate-spin text-slate-400" />
                    <span className="text-slate-500">Loading...</span>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="mb-4">
                      <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 pr-6">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${level.color}`}>
                          {level.level}
                        </span>
                        {item.rucc && <RuccBadge code={item.rucc} />}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-forest)' }}>
                        {item.score ?? '--'}
                      </span>
                      <span className="text-sm text-slate-500">/100</span>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-3">
                      {item.rucc != null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">RUCC</span>
                          <RuccBadge code={item.rucc} />
                        </div>
                      )}
                      {item.densityScore != null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">Density</span>
                          <ScoreBar score={item.densityScore} />
                        </div>
                      )}
                      {item.distanceScore != null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">Metro Distance</span>
                          <ScoreBar score={item.distanceScore} />
                        </div>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-600 grid grid-cols-2 gap-3 text-sm">
                      {item.density != null && (
                        <div>
                          <div className="text-slate-400 text-xs">Density</div>
                          <div className="font-semibold text-slate-700 dark:text-slate-200">{item.density.toFixed(1)}/sq mi</div>
                        </div>
                      )}
                      {item.distanceToMetro != null && (
                        <div>
                          <div className="text-slate-400 text-xs">Nearest Metro</div>
                          <div className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(item.distanceToMetro)} mi</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Table layout for 3+ items */
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 pr-4 text-slate-500 font-medium">Location</th>
                <th className="text-center py-2 px-2 text-slate-500 font-medium">Score</th>
                <th className="text-center py-2 px-2 text-slate-500 font-medium">RUCC</th>
                <th className="text-center py-2 px-2 text-slate-500 font-medium">Class</th>
                <th className="text-right py-2 px-2 text-slate-500 font-medium">Density</th>
                <th className="text-right py-2 px-2 text-slate-500 font-medium">Metro Dist.</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const level = item.score != null
                  ? getRuralityLevel(item.score)
                  : { level: item.level || '...', color: 'text-slate-600 bg-slate-100 border-slate-200' };

                return (
                  <tr key={item.name} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-100">{item.name}</td>
                    <td className="py-3 px-2 text-center">
                      {item.loading ? (
                        <Loader className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                      ) : (
                        <span className="text-lg font-bold" style={{ color: 'var(--color-forest)' }}>
                          {item.score ?? '--'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center"><RuccBadge code={item.rucc} /></td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${level.color}`}>
                        {item.loading ? '...' : level.level}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                      {item.density != null ? `${item.density.toFixed(1)}` : '--'}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                      {item.distanceToMetro != null ? `${Math.round(item.distanceToMetro)} mi` : '--'}
                    </td>
                    <td className="py-3 pl-2">
                      <button
                        onClick={() => onRemove(item.name)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
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
