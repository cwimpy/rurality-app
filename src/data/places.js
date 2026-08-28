/**
 * County place index — local, offline disambiguation for the search box.
 *
 * There are 30 Washington Counties, 25 Jeffersons, and 24 Franklins; 422 county
 * names are shared across two or more states. Sending a bare "Washington
 * County" to a geocoder silently returns one of them with no indication the
 * other 29 exist. This index lets the search box show the collision *before*
 * a lookup runs, and costs no network round-trip.
 *
 * Data: public/data/places.json (3,235 counties/equivalents, 108 KB)
 * Built by data_raw/build_places.R from public/data/county_rurality.csv.
 */

import { toStateAbbr, stateName } from './states';

let _data = null;
let _loadPromise = null;

export function loadPlacesData() {
  if (_data) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch(`${process.env.PUBLIC_URL}/data/places.json`)
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load place index (${r.status})`);
      return r.json();
    })
    .then(d => {
      // Column-oriented on the wire; expanded once here so lookups read clearly.
      _data = (d.rows || []).map(([fips, name, st, rucc]) => ({
        fips,
        name,
        st,
        rucc: rucc ?? null,
        base: baseName(name),
        label: `${name}, ${st}`,
      }));
      _loadPromise = null;
    })
    .catch(err => { _loadPromise = null; throw err; });
  return _loadPromise;
}

export function isPlacesLoaded() { return _data !== null; }

// The type words that end a county-equivalent name. Ordered longest-first so
// "City and Borough" is stripped before "Borough" gets a chance to match.
const TYPE_SUFFIXES = [
  'city and borough', 'planning region', 'census area', 'municipality',
  'municipio', 'district', 'borough', 'parish', 'county', 'city',
];

/** Lowercase, drop accents and punctuation, collapse whitespace. */
function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining accents (Añasco → Anasco)
    .toLowerCase()
    .replace(/[.'’]/g, '')            // St. Louis === St Louis === St. Louis'
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Normalized name with its type suffix removed, so a user who types
 * "washington" matches "Washington County" and one who types "washington
 * county" matches it too.
 */
function baseName(name) {
  let n = normalize(name);
  for (const suffix of TYPE_SUFFIXES) {
    if (n.endsWith(` ${suffix}`)) {
      n = n.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return n;
}

/**
 * Split a raw query into a place part and an optional state part.
 *
 * Handles "Washington County, AR", "Washington County, Arkansas", and the
 * comma-less "washington county ar". A trailing state is only peeled off when
 * something is left over — so "Arkansas" alone stays a place query, and
 * "Washington County, Washington" keeps its county.
 */
export function parseQuery(raw) {
  const text = String(raw || '').trim();
  if (!text) return { place: '', state: null };

  const commaIdx = text.lastIndexOf(',');
  if (commaIdx > 0) {
    const state = toStateAbbr(text.slice(commaIdx + 1));
    if (state) return { place: text.slice(0, commaIdx).trim(), state };
  }

  // No usable comma — try the trailing two words, then the trailing one
  // ("new mexico" before "mexico").
  const words = text.split(/\s+/);
  for (const take of [2, 1]) {
    if (words.length > take) {
      const state = toStateAbbr(words.slice(-take).join(' '));
      if (state) return { place: words.slice(0, -take).join(' '), state };
    }
  }

  return { place: text, state: null };
}

/**
 * Rank a candidate against the normalized query. Lower is better; null means
 * no match. Exact beats prefix beats word-start beats anywhere, so typing
 * "washington" puts the Washingtons above "Washington Parish"-style partials
 * and well above incidental substring hits.
 */
function rankOf(base, q) {
  if (base === q) return 0;
  if (base.startsWith(q)) return 1;
  if (base.includes(` ${q}`)) return 2;
  if (base.includes(q)) return 3;
  return null;
}

/**
 * Search the county index.
 *
 * @param {string} raw   what the user typed
 * @param {number} limit max candidates to return
 * @returns {{matches: Array, total: number, state: string|null}}
 *          `total` is the number of matches before the limit, so the UI can
 *          say "…and 26 more" honestly.
 */
export function searchPlaces(raw, limit = 8) {
  const empty = { matches: [], total: 0, state: null };
  if (!_data) return empty;

  const { place, state } = parseQuery(raw);
  const q = baseName(place);
  if (q.length < 2) return empty;

  const scored = [];
  for (const p of _data) {
    if (state && p.st !== state) continue;
    const rank = rankOf(p.base, q);
    if (rank === null) continue;
    scored.push({ ...p, rank });
  }

  scored.sort((a, b) =>
    a.rank - b.rank ||
    a.base.length - b.base.length ||
    a.st.localeCompare(b.st)
  );

  return { matches: scored.slice(0, limit), total: scored.length, state };
}

/**
 * Every county whose name matches the query *exactly* — no prefix or substring
 * hits. These are the true collisions: the 31 Washingtons, not the incidental
 * "Fort Bend" that contains "bend".
 */
export function exactMatches(raw) {
  if (!_data) return [];
  const { place, state } = parseQuery(raw);
  const q = baseName(place);
  if (!q) return [];
  return _data
    .filter(p => p.base === q && (!state || p.st === state))
    .sort((a, b) => a.st.localeCompare(b.st));
}

/**
 * How many counties share this exact name — the number the search box uses to
 * decide whether a query is ambiguous at all.
 */
export function countExactMatches(raw) {
  return exactMatches(raw).length;
}

export { stateName };

const places = { loadPlacesData, searchPlaces, exactMatches, countExactMatches, parseQuery };
export default places;
