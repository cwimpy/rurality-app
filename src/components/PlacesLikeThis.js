import React, { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { getRUCCDescription } from '../data/ruralUrbanCodes';

const STATE_NAMES = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY',
};

const ruccTierColor = (code) => {
  if (!code) return 'var(--color-sage)';
  if (code <= 3) return '#991b1b';
  if (code <= 5) return '#b45309';
  if (code <= 7) return '#4a7c59';
  return '#1a5c2e';
};

export default function PlacesLikeThis({ currentFips, currentRucc, currentDensity, onSearch }) {
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedForRucc, setLoadedForRucc] = useState(null);

  useEffect(() => {
    if (!currentFips || currentRucc === null || currentRucc === undefined) {
      setSimilar([]);
      setLoading(false);
      return;
    }
    if (loadedForRucc === currentRucc && similar.length > 0) {
      setLoading(false);
      return;
    }

    async function findSimilar() {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.PUBLIC_URL}/data/rucc.json`);
        const data = await res.json();
        const entries = Object.entries(data);

        const sameRucc = entries
          .filter(([fips, rucc]) => rucc === currentRucc && fips !== currentFips)
          .map(([fips, rucc]) => ({
            fips,
            rucc,
            stateFips: fips.slice(0, 2),
            countyFips: fips.slice(2),
            state: STATE_NAMES[fips.slice(0, 2)] || fips.slice(0, 2),
          }));

        const shuffled = sameRucc.sort(() => Math.random() - 0.5);
        const sample = shuffled.slice(0, 8);

        let namesData = {};
        try {
          const namesRes = await fetch(`${process.env.PUBLIC_URL}/data/county_names.json`);
          namesData = await namesRes.json();
        } catch { /* fall back to FIPS */ }

        const withNames = sample.map((item) => ({
          ...item,
          name: namesData[item.fips]
            ? `${namesData[item.fips]} County, ${item.state}`
            : `County (${item.state})`,
        }));

        setSimilar(withNames);
        setLoadedForRucc(currentRucc);
      } catch {
        setSimilar([]);
      }
      setLoading(false);
    }

    findSimilar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFips, currentRucc, currentDensity]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-[rgba(26,58,42,0.1)] dark:border-slate-700">
        <div className="fg-rule mb-4">
          <span>Exhibit E</span>
          <span>Places Like This</span>
        </div>
        <div className="flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" style={{ color: 'var(--color-ink-muted)' }} />
          <span className="text-[0.65rem] uppercase tracking-wider font-mono" style={{ color: 'var(--color-ink-muted)' }}>
            Finding similar places&hellip;
          </span>
        </div>
      </div>
    );
  }

  if (similar.length === 0) return null;

  const color = ruccTierColor(currentRucc);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-[rgba(26,58,42,0.1)] dark:border-slate-700">
      <div className="fg-rule mb-5">
        <span>Exhibit E</span>
        <span>Places Like This</span>
      </div>

      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h3 className="fg-display text-3xl leading-tight" style={{ color: 'var(--color-ink)' }}>
            Kindred <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>counties</em>.
          </h3>
          <p className="mt-1 text-[0.7rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
            Same RUCC classification &middot; {getRUCCDescription(currentRucc)}
          </p>
        </div>
        <span className="inline-flex items-baseline gap-2 px-3 py-1.5 rounded border flex-shrink-0"
              style={{ borderColor: color, color }}>
          <span className="text-[0.65rem] uppercase tracking-wider font-mono">RUCC</span>
          <span className="fg-numeral text-2xl">{currentRucc}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {similar.map((place, i) => (
          <button
            key={place.fips}
            onClick={() => onSearch(place.name)}
            className="text-left rounded-lg border p-3 transition-all group"
            style={{
              backgroundColor: 'var(--color-cream)',
              borderColor: 'var(--color-rule)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.6rem] uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
                № {String(i + 1).padStart(2, '0')}
              </span>
              <span className="w-5 h-5 rounded-sm flex items-center justify-center text-[0.65rem] font-mono text-white"
                    style={{ backgroundColor: color }}>
                {place.rucc}
              </span>
            </div>
            <div className="fg-display text-base leading-tight transition-colors"
                 style={{ color: 'var(--color-ink)' }}>
              {place.name}
            </div>
            <div className="mt-2 pt-2 border-t border-dashed text-[0.6rem] uppercase tracking-[0.22em] font-mono flex items-center justify-between"
                 style={{ borderColor: 'var(--color-rule-soft)', color: 'var(--color-ink-muted)' }}>
              <span>{place.state}</span>
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
