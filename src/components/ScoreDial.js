import React, { useEffect, useState } from 'react';

const SWEEP_DEG = 270;
const START_DEG = 225;

const polar = (cx, cy, r, clockDeg) => {
  const rad = (clockDeg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

const scoreToAngle = (s) => START_DEG + (s / 100) * SWEEP_DEG;

const arcPath = (cx, cy, r, fromScore, toScore) => {
  const start = polar(cx, cy, r, scoreToAngle(fromScore));
  const end   = polar(cx, cy, r, scoreToAngle(toScore));
  const sweep = (toScore - fromScore) / 100 * SWEEP_DEG;
  const large = sweep > 180 ? 1 : 0;
  return `M ${start[0]} ${start[1]} A ${r} ${r} 0 ${large} 1 ${end[0]} ${end[1]}`;
};

const tierColor = (s) => {
  if (s < 20) return '#991b1b';
  if (s < 40) return '#b45309';
  if (s < 60) return '#a17321';
  if (s < 80) return '#4a7c59';
  return '#1a5c2e';
};

const tierLabel = (s) => {
  if (s < 20) return 'Urban';
  if (s < 40) return 'Suburban';
  if (s < 60) return 'Mixed';
  if (s < 80) return 'Rural';
  return 'Very Rural';
};

const TIERS = [
  { from: 0,  to: 20, label: 'URBAN'      },
  { from: 20, to: 40, label: 'SUBURBAN'   },
  { from: 40, to: 60, label: 'MIXED'      },
  { from: 60, to: 80, label: 'RURAL'      },
  { from: 80, to: 100, label: 'VERY RURAL' },
];

const ScoreDial = ({ score = 0, size = 280, showLabel = true, confidence = '' }) => {
  const target = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf, startT;
    const duration = 950;
    const from = 0;
    const animate = (t) => {
      if (!startT) startT = t;
      const p = Math.min(1, (t - startT) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const cx = 150;
  const cy = 150;
  // Layout — from outside in, concentric zones:
  //   138 ─┬─ outer decorative ring
  //   130 ─┤   dashed inner ring
  //   117 ─┤   arc outer edge  ─┐
  //   110 ─┤   arc center       │  strokeWidth 14
  //   103 ─┤   arc inner edge  ─┘
  //    95 ─┤   tick marks (extend inward from outside arc to here for major)
  //    90 ─┤   numeral labels (0, 20, 40, 60, 80, 100)
  //    82 ─┤   tier labels (URBAN, SUBURBAN, ...)
  //    72 ─┤   needle tip
  //    64 ─┤   needle base
  //    62 ─┤   center plate edge
  //     0 ─┴─ center (score numeral + "RURALITY/100" label inside plate)
  const rOuter   = 138;
  const rRing    = 130;
  const rTrack   = 110;
  const rTickOut = 118;
  const rTickInS = 111;
  const rTickInL = 100;
  const rNumeralTick = 90;
  const rTierLbl     = 82;

  // Needle geometry — sits between center plate and tier labels
  const needleInner = 64;
  const needleOuter = 73;
  const needleAngle = scoreToAngle(display);
  const baseHalfDeg = 3;
  const [nx,  ny ] = polar(cx, cy, needleOuter, needleAngle);
  const [tx1, ty1] = polar(cx, cy, needleInner, needleAngle - baseHalfDeg);
  const [tx2, ty2] = polar(cx, cy, needleInner, needleAngle + baseHalfDeg);
  const [bx,  by ] = polar(cx, cy, needleInner, needleAngle);

  // Generate ticks (every 5 units; labels every 20)
  const ticks = [];
  for (let s = 0; s <= 100; s += 5) {
    const isMajor = s % 20 === 0;
    const [x1, y1] = polar(cx, cy, rTickOut, scoreToAngle(s));
    const [x2, y2] = polar(cx, cy, isMajor ? rTickInL : rTickInS, scoreToAngle(s));
    ticks.push({ s, x1, y1, x2, y2, isMajor });
  }

  // Numeral labels every 20
  const numerals = [0, 20, 40, 60, 80, 100].map((s) => {
    const [x, y] = polar(cx, cy, rNumeralTick, scoreToAngle(s));
    return { s, x, y };
  });

  // Tier labels (at midpoint of each tier band, slightly inside the ring)
  const tierLabels = TIERS.map((t) => {
    const mid = (t.from + t.to) / 2;
    const [x, y] = polar(cx, cy, rTierLbl, scoreToAngle(mid));
    return { ...t, x, y };
  });

  const fillColor = tierColor(target);
  const currentTier = tierLabel(target);

  // Confidence dashes (1-3)
  // Confidence has three buckets in code: high / medium-high / medium.
  // Test 'medium-high' before 'high' since both contain "high".
  const confLevel =
    /medium-high/i.test(confidence) ? 2 :
    /high/i.test(confidence)        ? 3 :
    /medium/i.test(confidence)      ? 1 :
                                      0;

  return (
    <div className="inline-flex flex-col items-center" style={{ width: size }}>
      <svg
        viewBox="0 0 300 300"
        width={size}
        height={size}
        role="img"
        aria-label={`Rurality index ${target} out of 100, ${currentTier}`}
        style={{ overflow: 'visible' }}
      >
        {/* Decorative outer double ring */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(26,58,42,0.22)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={rRing}  fill="none" stroke="rgba(26,58,42,0.14)" strokeWidth="1" strokeDasharray="1 3" />

        {/* Dial face */}
        <circle cx={cx} cy={cy} r={rRing - 2} fill="var(--color-cream)" />

        {/* Track (muted background arc) */}
        <path
          d={arcPath(cx, cy, rTrack, 0, 100)}
          fill="none"
          stroke="rgba(26,58,42,0.10)"
          strokeWidth="14"
          strokeLinecap="butt"
        />

        {/* Filled arc up to target — animated via display */}
        {display > 0 && (
          <path
            d={arcPath(cx, cy, rTrack, 0, Math.max(0.5, display))}
            fill="none"
            stroke={fillColor}
            strokeWidth="14"
            strokeLinecap="butt"
            style={{ transition: 'stroke 0.4s' }}
          />
        )}

        {/* Tier band marks — thin colored nubs on outside of track */}
        {TIERS.map((t, i) => {
          const c = tierColor((t.from + t.to) / 2);
          return (
            <path
              key={i}
              d={arcPath(cx, cy, rTrack + 10, t.from + 0.8, t.to - 0.8)}
              fill="none"
              stroke={c}
              strokeWidth="2"
              opacity="0.6"
            />
          );
        })}

        {/* Ticks */}
        {ticks.map(({ s, x1, y1, x2, y2, isMajor }) => (
          <line
            key={s}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isMajor ? 'rgba(26,58,42,0.7)' : 'rgba(26,58,42,0.3)'}
            strokeWidth={isMajor ? 1.5 : 0.8}
            strokeLinecap="round"
          />
        ))}

        {/* Numeral labels (every 20) */}
        {numerals.map(({ s, x, y }) => (
          <text
            key={s}
            x={x} y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: '0.1em',
              fill: 'var(--color-ink)',
              opacity: 0.75,
            }}
          >
            {s}
          </text>
        ))}

        {/* Tier labels on inner ring — long labels stack onto two lines so they don't crash the center plate */}
        {tierLabels.map(({ label, x, y, from, to }, i) => {
          const isActive = target >= from && (target < to || (to === 100 && target === 100));
          const style = {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 7.5,
            letterSpacing: '0.22em',
            fontWeight: isActive ? 700 : 400,
            fill: isActive ? fillColor : 'var(--color-sage)',
            opacity: isActive ? 1 : 0.55,
            transition: 'fill 0.4s, opacity 0.4s',
          };
          const words = label.includes(' ') ? label.split(' ') : null;
          if (words) {
            // Stack each word on its own line, centered vertically on (x, y)
            const lineHeight = 8;
            const offsetY = -((words.length - 1) * lineHeight) / 2;
            return (
              <g key={i}>
                {words.map((w, j) => (
                  <text key={j}
                        x={x} y={y + offsetY + j * lineHeight}
                        textAnchor="middle" dominantBaseline="middle"
                        style={style}>
                    {w}
                  </text>
                ))}
              </g>
            );
          }
          return (
            <text key={i}
                  x={x} y={y}
                  textAnchor="middle" dominantBaseline="middle"
                  style={style}>
              {label}
            </text>
          );
        })}

        {/* Center plate */}
        <circle cx={cx} cy={cy} r="62" fill="var(--color-parchment)" stroke="rgba(26,58,42,0.12)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="58" fill="none" stroke="rgba(26,58,42,0.08)" strokeWidth="1" strokeDasharray="2 3" />

        {/* "RURALITY / 100" label — sits above the numeral, under the needle ring */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 7,
            letterSpacing: '0.3em',
            fill: 'var(--color-ink-muted)',
          }}
        >
          RURALITY / 100
        </text>

        {/* Central numeral — below center so it reads as "under" the needle */}
        <text
          x={cx} y={cy + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontSize: 54,
            fontWeight: 400,
            fontVariantNumeric: 'oldstyle-nums',
            fill: fillColor,
            letterSpacing: '-0.04em',
          }}
        >
          {Math.round(display)}
        </text>

        {/* Confidence dashes */}
        {confLevel > 0 && (
          <g>
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={cx - 10 + i * 7}
                y={cy + 46}
                width={5}
                height={1.5}
                fill="var(--color-ink-muted)"
                opacity={i < confLevel ? 0.95 : 0.2}
                rx={0.5}
              />
            ))}
          </g>
        )}

        {/* Needle — floats in the ring, does not cross the center numeral */}
        <g>
          <polygon
            points={`${tx1},${ty1} ${nx},${ny} ${tx2},${ty2}`}
            fill="var(--color-ink)"
            stroke="var(--color-ink)"
            strokeLinejoin="round"
          />
          <circle cx={bx} cy={by} r="3" fill="var(--color-wheat)" stroke="var(--color-ink)" strokeWidth="1" />
        </g>
      </svg>

      {showLabel && (
        <div className="-mt-3 text-center">
          <div
            className="inline-block px-3 py-1 rounded-full text-[0.65rem] uppercase tracking-[0.28em] font-mono border"
            style={{
              color: fillColor,
              borderColor: fillColor,
              backgroundColor: 'var(--color-cream)',
            }}
          >
            {currentTier}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreDial;
