import React, { useState, useEffect } from 'react';
import { MapPin, Loader } from 'lucide-react';
import { getRUCCDescription } from '../data/ruralUrbanCodes';

// Static county name lookup — we build this from RUCC data keys
// FIPS → county name mapping via Census (loaded once)
const STATE_NAMES = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY'
};

export default function PlacesLikeThis({ currentFips, currentRucc, currentDensity, onSearch }) {
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentFips || currentRucc === null || currentRucc === undefined) {
      setSimilar([]);
      setLoading(false);
      return;
    }

    async function findSimilar() {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.PUBLIC_URL}/data/rucc.json`);
        const data = await res.json();
        const entries = Object.entries(data);

        // Find counties with matching RUCC code, exclude current
        const sameRucc = entries
          .filter(([fips, rucc]) => rucc === currentRucc && fips !== currentFips)
          .map(([fips, rucc]) => ({
            fips,
            rucc,
            stateFips: fips.slice(0, 2),
            countyFips: fips.slice(2),
            state: STATE_NAMES[fips.slice(0, 2)] || fips.slice(0, 2)
          }));

        // Randomly sample 8 from the matching set for variety
        const shuffled = sameRucc.sort(() => Math.random() - 0.5);
        const sample = shuffled.slice(0, 8);

        // Try to get county names from Census API for the sample
        const withNames = await Promise.all(
          sample.map(async (item) => {
            try {
              const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME&for=county:${item.countyFips}&in=state:${item.stateFips}`;
              const res = await fetch(url);
              const json = await res.json();
              const name = json[1]?.[0]?.replace(/, [A-Za-z]+$/, '') || `FIPS ${item.fips}`;
              return { ...item, name };
            } catch {
              return { ...item, name: `County (${item.state})` };
            }
          })
        );

        setSimilar(withNames);
      } catch {
        setSimilar([]);
      }
      setLoading(false);
    }

    findSimilar();
  }, [currentFips, currentRucc, currentDensity]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Places Like This
        </h3>
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Finding similar places...</span>
        </div>
      </div>
    );
  }

  if (similar.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        Places Like This
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Counties with the same RUCC classification ({getRUCCDescription(currentRucc)})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {similar.map((place) => (
          <button
            key={place.fips}
            onClick={() => onSearch(place.name)}
            className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
          >
            <div className="flex items-center space-x-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-green-600" />
              <span className="text-xs text-slate-400">{place.state}</span>
            </div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{place.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">RUCC {place.rucc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
