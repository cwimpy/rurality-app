/**
 * USDA Rural-Urban Continuum Codes (2013)
 * Source: https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/
 *
 * Official federal classification of US counties by rurality.
 * This is the gold standard for rural classification research.
 *
 * Codes:
 * 1 = Metro - 1 million+ population
 * 2 = Metro - 250,000 to 1 million population
 * 3 = Metro - Fewer than 250,000 population
 * 4 = Nonmetro - Urban population 20,000+, adjacent to metro
 * 5 = Nonmetro - Urban population 20,000+, not adjacent to metro
 * 6 = Nonmetro - Urban population 2,500-19,999, adjacent to metro
 * 7 = Nonmetro - Urban population 2,500-19,999, not adjacent to metro
 * 8 = Nonmetro - Completely rural/less than 2,500 urban, adjacent to metro
 * 9 = Nonmetro - Completely rural/less than 2,500 urban, not adjacent to metro
 *
 * Last Updated: 2013 (based on 2010 Census)
 * Note: USDA updates these codes every 10 years following the Census
 */

export const RUCC_DESCRIPTIONS = {
  1: "Metro counties with 1 million+ population",
  2: "Metro counties with 250,000 to 1 million population",
  3: "Metro counties with fewer than 250,000 population",
  4: "Nonmetro counties with urban population of 20,000+, adjacent to a metro area",
  5: "Nonmetro counties with urban population of 20,000+, not adjacent to a metro area",
  6: "Nonmetro counties with urban population of 2,500-19,999, adjacent to a metro area",
  7: "Nonmetro counties with urban population of 2,500-19,999, not adjacent to a metro area",
  8: "Nonmetro counties completely rural or less than 2,500 urban population, adjacent to a metro area",
  9: "Nonmetro counties completely rural or less than 2,500 urban population, not adjacent to a metro area"
};

/**
 * Sample of USDA Rural-Urban Continuum Codes for key counties
 * Full dataset contains all 3,142 US counties and county equivalents
 *
 * Format: "SSCCC" where SS = state FIPS, CCC = county FIPS
 *
 * TODO: Load complete dataset from USDA CSV file or create comprehensive lookup
 */
export const RURAL_URBAN_CODES = {
  // Major Metro Areas (Code 1)
  "36061": 1, // New York County, NY
  "06037": 1, // Los Angeles County, CA
  "17031": 1, // Cook County, IL (Chicago)
  "48201": 1, // Harris County, TX (Houston)
  "04013": 1, // Maricopa County, AZ (Phoenix)
  "42101": 1, // Philadelphia County, PA
  "06073": 1, // San Diego County, CA
  "48113": 1, // Dallas County, TX
  "06085": 1, // Santa Clara County, CA (San Jose)
  "48453": 1, // Travis County, TX (Austin)
  "06059": 1, // Orange County, CA
  "53033": 1, // King County, WA (Seattle)
  "12086": 1, // Miami-Dade County, FL

  // Mid-Size Metro (Code 2)
  "19169": 2, // Story County, IA (Ames)
  "37183": 2, // Wake County, NC (Raleigh)
  "51760": 2, // Richmond city, VA

  // Small Metro (Code 3)
  "30111": 3, // Yellowstone County, MT (Billings)
  "16001": 3, // Ada County, ID (Boise)
  "41051": 3, // Multnomah County, OR (Portland - smaller metro)

  // Urban Nonmetro, Adjacent (Code 4)
  "08123": 4, // Weld County, CO

  // Urban Nonmetro, Not Adjacent (Code 5)
  "35001": 5, // Bernalillo County, NM

  // Small Town, Adjacent (Code 6)
  "18157": 6, // Tippecanoe County, IN

  // Small Town, Not Adjacent (Code 7)
  "30063": 7, // Missoula County, MT

  // Rural, Adjacent (Code 8)
  "01117": 8, // Shelby County, AL

  // Rural, Not Adjacent (Code 9)
  "30091": 9, // Petroleum County, MT
  "46075": 9, // Jones County, SD
  "31005": 9, // Arthur County, NE
};

/**
 * Load Rural-Urban Continuum Code for a given county
 * @param {string} stateFips - 2-digit state FIPS code
 * @param {string} countyFips - 3-digit county FIPS code
 * @returns {number|null} - RUCC code (1-9) or null if not found
 */
export function getRUCC(stateFips, countyFips) {
  const fipsCode = `${stateFips}${countyFips}`;
  return RURAL_URBAN_CODES[fipsCode] || null;
}

/**
 * Get description for a RUCC code
 * @param {number} code - RUCC code (1-9)
 * @returns {string} - Human-readable description
 */
export function getRUCCDescription(code) {
  return RUCC_DESCRIPTIONS[code] || "Unknown classification";
}

/**
 * Calculate rurality score from RUCC (higher = more rural)
 * @param {number} rucc - RUCC code (1-9)
 * @returns {number} - Score from 0-100
 */
export function ruccToScore(rucc) {
  // Linear scale: Code 9 = 100, Code 1 = 11.1
  // This gives appropriate weight to the official classification
  return Math.round((rucc / 9) * 100);
}

/**
 * Determine if county is considered rural by federal definition
 * @param {number} rucc - RUCC code (1-9)
 * @returns {boolean} - True if nonmetro (codes 4-9)
 */
export function isRuralByUSDA(rucc) {
  return rucc >= 4;
}

export default {
  RURAL_URBAN_CODES,
  RUCC_DESCRIPTIONS,
  getRUCC,
  getRUCCDescription,
  ruccToScore,
  isRuralByUSDA
};
