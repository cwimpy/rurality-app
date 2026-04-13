import React, { useRef, useState } from 'react';
import { Download, X } from 'lucide-react';

const TIER = (s) => {
  if (s >= 80) return { label: 'Very Rural', color: '#1a5c2e' };
  if (s >= 60) return { label: 'Rural',      color: '#4a7c59' };
  if (s >= 40) return { label: 'Mixed',      color: '#a17321' };
  if (s >= 20) return { label: 'Suburban',   color: '#b45309' };
  return        { label: 'Urban',      color: '#991b1b' };
};

// Confidence has three buckets in code: high / medium-high / medium.
// Test 'medium-high' before 'high' since both contain "high".
const confidenceBars = (conf) => {
  if (!conf) return 0;
  if (/medium-high/i.test(conf)) return 2;
  if (/high/i.test(conf))        return 3;
  if (/medium/i.test(conf))      return 1;
  return 0;
};

// Truncate long description text to fit within an indicator card (180px wide)
const clampDesc = (s, max = 30) => {
  if (!s) return '';
  const clean = String(s).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
};

// Simplified static dial for the specimen card
const StaticDial = ({ cx, cy, score }) => {
  const SWEEP = 270;
  const START = 225;
  const polar = (r, clockDeg) => {
    const rad = (clockDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const toAngle = (s) => START + (s / 100) * SWEEP;
  const arcPath = (r, fromS, toS) => {
    const [x1, y1] = polar(r, toAngle(fromS));
    const [x2, y2] = polar(r, toAngle(toS));
    const sweep = (toS - fromS) / 100 * SWEEP;
    const large = sweep > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const rOuter   = 150;
  const rRing    = 142;
  const rTrack   = 120;
  const rTickOut = 128;
  const rTickInL = 110;
  const rTickInS = 119;
  const rNum     = 102;
  const tier = TIER(score);

  const ticks = [];
  for (let s = 0; s <= 100; s += 5) {
    const isMajor = s % 20 === 0;
    const [x1, y1] = polar(rTickOut, toAngle(s));
    const [x2, y2] = polar(isMajor ? rTickInL : rTickInS, toAngle(s));
    ticks.push({ s, x1, y1, x2, y2, isMajor });
  }
  const numerals = [0, 20, 40, 60, 80, 100].map((s) => {
    const [x, y] = polar(rNum, toAngle(s));
    return { s, x, y };
  });

  const needleAngle = toAngle(Math.max(0, Math.min(100, score)));
  const needleInner = 74;
  const needleOuter = 108;
  const baseHalfDeg = 3;
  const [nx, ny]   = polar(needleOuter, needleAngle);
  const [tx1, ty1] = polar(needleInner, needleAngle - baseHalfDeg);
  const [tx2, ty2] = polar(needleInner, needleAngle + baseHalfDeg);
  const [bx, by]   = polar(needleInner, needleAngle);

  return (
    <g>
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(26,58,42,0.22)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={rRing}  fill="none" stroke="rgba(26,58,42,0.14)" strokeWidth="1" strokeDasharray="1 3" />
      <circle cx={cx} cy={cy} r={rRing - 2} fill="#faf8f4" />

      <path d={arcPath(rTrack, 0, 100)} fill="none" stroke="rgba(26,58,42,0.12)" strokeWidth="16" />
      {score > 0 && (
        <path d={arcPath(rTrack, 0, Math.max(0.5, score))} fill="none" stroke={tier.color} strokeWidth="16" />
      )}

      {ticks.map(({ s, x1, y1, x2, y2, isMajor }) => (
        <line key={s} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isMajor ? 'rgba(26,58,42,0.75)' : 'rgba(26,58,42,0.3)'}
              strokeWidth={isMajor ? 1.5 : 0.8} strokeLinecap="round" />
      ))}

      {numerals.map(({ s, x, y }) => (
        <text key={s} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#1a3a2a" opacity="0.75">
          {s}
        </text>
      ))}

      <circle cx={cx} cy={cy} r="68" fill="#f3f0e8" stroke="rgba(26,58,42,0.12)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="64" fill="none" stroke="rgba(26,58,42,0.08)" strokeWidth="1" strokeDasharray="2 3" />

      <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle"
            fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="2.4" fill="#4a7c59">
        RURALITY / 100
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" dominantBaseline="middle"
            fontFamily="Source Serif 4, Georgia, serif" fontSize="64" fontWeight="400"
            fill={tier.color} letterSpacing="-2.4">
        {Math.round(score)}
      </text>

      <polygon points={`${tx1},${ty1} ${nx},${ny} ${tx2},${ty2}`}
               fill="#1a3a2a" stroke="#1a3a2a" strokeLinejoin="round" />
      <circle cx={bx} cy={by} r="3.5" fill="#d4a843" stroke="#1a3a2a" strokeWidth="1" />
    </g>
  );
};

const SpecimenCardSVG = React.forwardRef(({ location, score, confidence, classifications, density, coordinates, population }, ref) => {
  const tier = TIER(score);
  const conf = confidenceBars(confidence);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
  const cardNum = String(Math.floor(Math.random() * 9000) + 1000);
  const rucc = classifications?.rucc?.code;
  const ruca = classifications?.ruca?.code;
  const omb = classifications?.omb?.label;

  // Coordinates formatting
  const coords = coordinates
    ? `${coordinates.lat.toFixed(3)}° N · ${Math.abs(coordinates.lng).toFixed(3)}° W`
    : null;

  // Break long location into lines for display
  const parts = (location || '').split(',');
  const primary = parts[0]?.trim() || '—';
  const secondary = parts.slice(1).join(',').trim();
  // Scale primary font size so long names don't crash into the dial
  const primaryFont =
    primary.length <= 12 ? 72 :
    primary.length <= 18 ? 60 :
    primary.length <= 24 ? 50 : 42;

  return (
    <svg ref={ref} viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" width="1200" height="630"
         style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <pattern id="topo-sc" x="0" y="0" width="1200" height="630" patternUnits="userSpaceOnUse">
          <path d="M0 500 Q 300 460 600 490 T 1200 475" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0 430 Q 300 390 600 420 T 1200 405" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0 360 Q 300 320 600 350 T 1200 335" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0 290 Q 300 250 600 280 T 1200 265" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0 220 Q 300 180 600 210 T 1200 195" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0 150 Q 300 110 600 140 T 1200 125" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
          <path d="M0  80 Q 300  40 600  70 T 1200  55" fill="none" stroke="#1a3a2a" strokeOpacity="0.06" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Base cream */}
      <rect x="0" y="0" width="1200" height="630" fill="#faf8f4" />
      {/* Topo overlay */}
      <rect x="0" y="0" width="1200" height="630" fill="url(#topo-sc)" />
      {/* Outer solid frame */}
      <rect x="20" y="20" width="1160" height="590" fill="none" stroke="rgba(26,58,42,0.25)" strokeWidth="1.5" />
      {/* Inner dashed frame */}
      <rect x="32" y="32" width="1136" height="566" fill="none" stroke="rgba(26,58,42,0.2)" strokeWidth="1" strokeDasharray="3 4" />

      {/* Masthead rule — № xxxx / RURALITY FIELD SPECIMEN / EDITION 2026 */}
      <g fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="3.2" fill="#4a7c59">
        <text x="72"   y="78" textAnchor="start">№ {cardNum}</text>
        <line x1="170" y1="74" x2="430" y2="74" stroke="#4a7c59" strokeOpacity="0.4" strokeWidth="1" />
        <text x="600"  y="78" textAnchor="middle">RURALITY · FIELD CARD</text>
        <line x1="770" y1="74" x2="1000" y2="74" stroke="#4a7c59" strokeOpacity="0.4" strokeWidth="1" />
        <text x="1128" y="78" textAnchor="end">EDITION 2026</text>
      </g>

      {/* LEFT COLUMN: place name + meta + indicators */}
      <g>
        {/* Meta kicker */}
        <text x="72" y="140" fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="3.2" fill="#4a7c59">
          A FIELD REPORT ON
        </text>

        {/* Primary place name — big display serif (size adapts to length) */}
        <text x="72" y="210" fontFamily="Source Serif 4, Georgia, serif" fontSize={primaryFont} fontWeight="400"
              fill="#1a3a2a" letterSpacing="-2">
          {primary}
        </text>
        {secondary && (
          <text x="72" y="250" fontFamily="Source Serif 4, Georgia, serif" fontSize="22" fontStyle="italic" fill="#4a7c59">
            {secondary}
          </text>
        )}

        {/* Tier stamp block — width computed from actual tracking (char ~8.4px + letter-spacing 3.6px) + padding */}
        {(() => {
          const label = tier.label.toUpperCase();
          const stampW = Math.round(label.length * 13 + 42);
          return (
            <g transform="translate(72, 282)">
              <rect x="0" y="0" width={stampW} height="40" fill="none"
                    stroke={tier.color} strokeWidth="2" rx="3" />
              <text x={stampW / 2} y="26" textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="14" letterSpacing="3.6"
                    fill={tier.color} fontWeight="500">
                {label}
              </text>
            </g>
          );
        })()}

        {/* Coordinate + confidence meta */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="2.4" fill="#4a7c59">
          {coords && (
            <text x="72" y="348">COORDINATES &nbsp;·&nbsp; {coords}</text>
          )}
          <text x="72" y="368">
            CONFIDENCE &nbsp;·&nbsp;
            <tspan fontFamily="Source Serif 4, Georgia, serif" fontStyle="italic" fontSize="13" fill="#1a3a2a" letterSpacing="0">
              {confidence || 'n/a'}
            </tspan>
          </text>
          {population > 0 && (
            <text x="72" y="388">COUNTY POP. &nbsp;·&nbsp;
              <tspan fontFamily="Source Serif 4, Georgia, serif" fontVariantNumeric="oldstyle-nums" fontSize="15" fill="#1a3a2a" letterSpacing="0">
                {' '}{population.toLocaleString()}
              </tspan>
            </text>
          )}
        </g>

        {/* Three indicators — RUCC / RUCA / Density */}
        <g transform="translate(72, 418)">
          {[
            { label: 'RUCC 2023',  value: rucc ?? '—',                                       sub: rucc ? clampDesc(classifications?.rucc?.description) : 'not available' },
            { label: 'RUCA 2020',  value: ruca ?? '—',                                       sub: ruca ? clampDesc(classifications?.ruca?.description) : 'not available' },
            { label: 'DENSITY',    value: density != null ? density.toFixed(1) : '—',        sub: density != null ? 'per sq. mile' : 'not available' },
          ].map((m, i) => (
            <g key={m.label} transform={`translate(${i * 200}, 0)`}>
              <rect x="0" y="0" width="180" height="110" fill="#faf8f4"
                    stroke="rgba(26,58,42,0.2)" strokeWidth="1" rx="3" />
              <rect x="4" y="4" width="172" height="102" fill="none"
                    stroke="rgba(26,58,42,0.15)" strokeWidth="1" strokeDasharray="2 3" rx="2" />
              <text x="16" y="28" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing="2.8" fill="#4a7c59">
                {m.label}
              </text>
              <text x="16" y="78" fontFamily="Source Serif 4, Georgia, serif" fontSize="44" fontWeight="400"
                    fill={tier.color} fontVariantNumeric="oldstyle-nums" letterSpacing="-1.5">
                {m.value}
              </text>
              {m.sub && (
                <text x="16" y="98" fontFamily="Source Serif 4, Georgia, serif" fontSize="11" fontStyle="italic" fill="#4a7c59">
                  {m.sub}
                </text>
              )}
            </g>
          ))}
        </g>
      </g>

      {/* RIGHT COLUMN: static dial */}
      <g>
        <StaticDial cx={940} cy={290} score={score} />

        {/* OMB badge below dial — width sized to fit the longest label ("METROPOLITAN") */}
        {omb && (() => {
          const label = `OMB · ${omb.toUpperCase()}`;
          const badgeW = Math.round(label.length * 11 + 40);
          return (
            <g transform="translate(940, 470)">
              <rect x={-badgeW / 2} y="0" width={badgeW} height="34" fill="none"
                    stroke={tier.color} strokeWidth="1.5" rx="3" />
              <text x="0" y="22" textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="2.6"
                    fill={tier.color} fontWeight="500">
                {label}
              </text>
            </g>
          );
        })()}

        {/* Confidence dashes */}
        {conf > 0 && (
          <g transform="translate(940, 520)">
            <text x="0" y="-2" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2.4" fill="#4a7c59">
              CONFIDENCE
            </text>
            {[0, 1, 2].map((i) => (
              <rect key={i} x={-14 + i * 10} y="6" width="8" height="3"
                    fill="#4a7c59" opacity={i < conf ? 0.95 : 0.2} rx="0.5" />
            ))}
          </g>
        )}
      </g>

      {/* Colophon footer */}
      <g>
        <line x1="72" y1="555" x2="1128" y2="555" stroke="#d4a843" strokeWidth="1.5" />
        <text x="72" y="582" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing="2.8" fill="#4a7c59">
          RURALITY.APP · {today} · A FIELD GUIDE TO RURAL AMERICA
        </text>
        <text x="1128" y="582" textAnchor="end" fontFamily="Source Serif 4, Georgia, serif" fontSize="12" fontStyle="italic" fill="#1a3a2a">
          Institute for Rural Initiatives · Arkansas State University
        </text>
      </g>
    </svg>
  );
});

SpecimenCardSVG.displayName = 'SpecimenCardSVG';

export default function SpecimenCard({
  location, score, confidence, classifications, density, coordinates, population,
  onClose,
}) {
  const svgRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPNG = async () => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const svgEl = svgRef.current;
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(svgEl);
      // Ensure xmlns for data URL
      if (!svgStr.match(/xmlns=/)) {
        svgStr = svgStr.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      const scale = 2; // 2x for retina
      canvas.width = 1200 * scale;
      canvas.height = 630 * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 1200, 630);
      URL.revokeObjectURL(url);

      const safeName = (location || 'specimen').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const link = document.createElement('a');
      link.download = `rurality-field-card-${safeName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      /* quietly fail */
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Field card preview"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 overflow-auto"
      style={{ backgroundColor: 'rgba(10, 20, 14, 0.82)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-wheat)' }}>
            Field Card &middot; Preview
          </div>
          <button onClick={onClose}
                  className="text-white/70 hover:text-white p-1.5 rounded"
                  aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-lg overflow-hidden shadow-2xl"
             style={{ backgroundColor: '#faf8f4', border: '1px solid rgba(212,168,67,0.35)' }}>
          <SpecimenCardSVG
            ref={svgRef}
            location={location}
            score={score}
            confidence={confidence}
            classifications={classifications}
            density={density}
            coordinates={coordinates}
            population={population}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[0.65rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'rgba(255,255,255,0.55)' }}>
            1200 &times; 630 &middot; PNG download &middot; social-card aspect
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-4 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono border transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.75)' }}>
              Close
            </button>
            <button onClick={downloadPNG} disabled={downloading}
                    className="flex items-center gap-2 px-5 py-2 rounded-md text-[0.7rem] uppercase tracking-wider font-mono"
                    style={{ backgroundColor: 'var(--color-wheat)', color: '#1a3a2a' }}>
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Preparing…' : 'Download PNG'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
