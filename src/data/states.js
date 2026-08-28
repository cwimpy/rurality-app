/**
 * State and territory names, keyed by USPS abbreviation.
 *
 * Covers the 50 states, DC, and the five inhabited territories — the same
 * universe as public/data/places.json, which carries FIPS 60/66/69/72/78.
 */

export const STATE_NAMES = {
  AL: 'Alabama',        AK: 'Alaska',         AZ: 'Arizona',        AR: 'Arkansas',
  CA: 'California',     CO: 'Colorado',       CT: 'Connecticut',    DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',        GA: 'Georgia',        HI: 'Hawaii',         ID: 'Idaho',
  IL: 'Illinois',       IN: 'Indiana',        IA: 'Iowa',           KS: 'Kansas',
  KY: 'Kentucky',       LA: 'Louisiana',      ME: 'Maine',          MD: 'Maryland',
  MA: 'Massachusetts',  MI: 'Michigan',       MN: 'Minnesota',      MS: 'Mississippi',
  MO: 'Missouri',       MT: 'Montana',        NE: 'Nebraska',       NV: 'Nevada',
  NH: 'New Hampshire',  NJ: 'New Jersey',     NM: 'New Mexico',     NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota',   OH: 'Ohio',           OK: 'Oklahoma',
  OR: 'Oregon',         PA: 'Pennsylvania',   RI: 'Rhode Island',   SC: 'South Carolina',
  SD: 'South Dakota',   TN: 'Tennessee',      TX: 'Texas',          UT: 'Utah',
  VT: 'Vermont',        VA: 'Virginia',       WA: 'Washington',     WV: 'West Virginia',
  WI: 'Wisconsin',      WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam',           MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico',    VI: 'U.S. Virgin Islands',
};

/** Lowercased full name → abbreviation, for parsing "…, Arkansas". */
const NAME_TO_ABBR = Object.entries(STATE_NAMES).reduce((acc, [abbr, name]) => {
  acc[name.toLowerCase()] = abbr;
  return acc;
}, {});

// A few spellings people actually type that aren't the official name.
const ALIASES = {
  'washington dc': 'DC',
  'washington d.c.': 'DC',
  'd.c.': 'DC',
  'us virgin islands': 'VI',
  'virgin islands': 'VI',
  'northern marianas': 'MP',
};

/**
 * Resolve a state token to its USPS abbreviation.
 * Accepts "AR", "ar", "Arkansas", "arkansas". Returns null if unrecognized.
 */
export function toStateAbbr(token) {
  if (!token) return null;
  const t = String(token).trim().toLowerCase();
  if (!t) return null;
  if (t.length === 2 && STATE_NAMES[t.toUpperCase()]) return t.toUpperCase();
  return NAME_TO_ABBR[t] ?? ALIASES[t] ?? null;
}

export function stateName(abbr) {
  return STATE_NAMES[abbr] ?? abbr;
}

const states = { STATE_NAMES, toStateAbbr, stateName };
export default states;
