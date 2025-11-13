/**
 * Rurality Calculator - Honest, Research-Based Methodology
 *
 * This calculator uses a hybrid approach based on:
 * 1. USDA Rural-Urban Continuum Codes (50% weight) - The federal gold standard
 * 2. Population Density (25% weight) - From US Census Bureau
 * 3. Distance to Metro Areas (15% weight) - Calculated from census data
 * 4. Broadband Access (10% weight) - From FCC data when available
 *
 * This approach prioritizes official federal classifications while adding
 * granular data where available. All calculations are transparent and
 * cite their data sources.
 *
 * @author Cameron Wimpy
 * @license MIT
 */

import { getRUCC, getRUCCDescription, ruccToScore, isRuralByUSDA } from '../data/ruralUrbanCodes';
import { calculateMetroDistances } from '../data/metroAreas';

/**
 * Calculate comprehensive rurality score
 *
 * @param {Object} params - Input parameters
 * @param {string} params.stateFips - 2-digit state FIPS code
 * @param {string} params.countyFips - 3-digit county FIPS code
 * @param {number} params.lat - Latitude
 * @param {number} params.lng - Longitude
 * @param {number} params.populationDensity - People per square mile
 * @param {number} [params.broadbandAccess] - Percentage with broadband (0-100)
 * @returns {Object} Comprehensive rurality analysis
 */
export function calculateRuralityScore({
  stateFips,
  countyFips,
  lat,
  lng,
  populationDensity,
  broadbandAccess = null
}) {
  // Validate inputs
  if (!stateFips || !countyFips || lat === undefined || lng === undefined || populationDensity === undefined) {
    throw new Error('Missing required parameters for rurality calculation');
  }

  // 1. Get USDA Rural-Urban Continuum Code (50% weight)
  const rucc = getRUCC(stateFips, countyFips);

  if (rucc === null) {
    throw new Error(`No RUCC data found for FIPS ${stateFips}${countyFips}. County may not be in database yet.`);
  }

  const ruccScore = ruccToScore(rucc);
  const ruccDescription = getRUCCDescription(rucc);
  const officiallyRural = isRuralByUSDA(rucc);

  // 2. Calculate Population Density Score (25% weight)
  // Higher density = more urban (lower score)
  // Using logarithmic scale because density varies exponentially
  // Rural: <100 people/sq mi, Suburban: 100-2000, Urban: >2000
  const densityScore = calculatePopulationDensityScore(populationDensity);

  // 3. Calculate Distance to Metro Areas Score (15% weight)
  const metroDistances = calculateMetroDistances(lat, lng);
  const distanceScore = calculateDistanceScore(metroDistances);

  // 4. Calculate Broadband Access Score (10% weight)
  // Lower broadband availability = more rural (higher score)
  const broadbandScore = broadbandAccess !== null
    ? calculateBroadbandScore(broadbandAccess)
    : null;

  // Calculate weighted overall score
  let totalScore;
  let weights;

  if (broadbandScore !== null) {
    // Full calculation with all factors
    weights = {
      rucc: 0.50,
      density: 0.25,
      distance: 0.15,
      broadband: 0.10
    };

    totalScore = (
      ruccScore * weights.rucc +
      densityScore * weights.density +
      distanceScore * weights.distance +
      broadbandScore * weights.broadband
    );
  } else {
    // Calculation without broadband data (redistribute weight)
    weights = {
      rucc: 0.55,
      density: 0.30,
      distance: 0.15,
      broadband: 0.00
    };

    totalScore = (
      ruccScore * weights.rucc +
      densityScore * weights.density +
      distanceScore * weights.distance
    );
  }

  // Round to whole number
  const overallScore = Math.round(Math.max(0, Math.min(100, totalScore)));

  // Determine classification
  const classification = getClassification(overallScore);

  return {
    overallScore,
    classification,
    confidence: broadbandScore !== null ? 'high' : 'medium',
    components: {
      usda: {
        code: rucc,
        description: ruccDescription,
        score: ruccScore,
        weight: weights.rucc,
        contribution: Math.round(ruccScore * weights.rucc),
        officiallyRural
      },
      populationDensity: {
        value: populationDensity,
        score: densityScore,
        weight: weights.density,
        contribution: Math.round(densityScore * weights.density),
        unit: 'people per sq mi'
      },
      distance: {
        nearestLargeMetro: metroDistances.largeMetro.distance,
        nearestMediumMetro: metroDistances.mediumMetro.distance,
        nearestSmallMetro: metroDistances.smallMetro.distance,
        nearestMetroName: metroDistances.smallMetro.metro.name,
        score: distanceScore,
        weight: weights.distance,
        contribution: Math.round(distanceScore * weights.distance),
        unit: 'miles'
      },
      broadband: broadbandScore !== null ? {
        access: broadbandAccess,
        score: broadbandScore,
        weight: weights.broadband,
        contribution: Math.round(broadbandScore * weights.broadband),
        unit: 'percent with access'
      } : null
    },
    methodology: {
      version: '1.0',
      lastUpdated: '2024-01-15',
      sources: [
        'USDA Economic Research Service Rural-Urban Continuum Codes (2013)',
        'US Census Bureau American Community Survey (2022)',
        'FCC Broadband Data (when available)'
      ],
      weights
    }
  };
}

/**
 * Calculate population density score
 * Uses logarithmic scale to handle exponential variation
 *
 * @param {number} density - People per square mile
 * @returns {number} Score from 0-100 (higher = more rural)
 */
function calculatePopulationDensityScore(density) {
  if (density <= 0) return 100;

  // Logarithmic scale
  // 1 person/sq mi = 100 (very rural)
  // 100 people/sq mi = 70 (rural)
  // 1000 people/sq mi = 40 (suburban)
  // 10000 people/sq mi = 10 (urban)
  // 27000+ people/sq mi (NYC) = 0 (very urban)

  const logDensity = Math.log10(density);
  const score = 100 - (logDensity * 25);

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate distance to metro areas score
 *
 * @param {Object} distances - Distances to nearest metros of each tier
 * @returns {number} Score from 0-100 (higher = more rural)
 */
function calculateDistanceScore(distances) {
  // Weighted average of distances
  // Being close to any significant metro makes you less rural
  const largeMetroScore = Math.min(100, distances.largeMetro.distance / 2);
  const mediumMetroScore = Math.min(100, distances.mediumMetro.distance / 1.5);
  const smallMetroScore = Math.min(100, distances.smallMetro.distance);

  // Weight: Large metros matter most
  const score = (
    largeMetroScore * 0.5 +
    mediumMetroScore * 0.3 +
    smallMetroScore * 0.2
  );

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate broadband access score
 *
 * @param {number} broadbandAccess - Percentage with broadband (0-100)
 * @returns {number} Score from 0-100 (higher = more rural/less access)
 */
function calculateBroadbandScore(broadbandAccess) {
  // Invert: Lower access = more rural = higher score
  return Math.round(100 - broadbandAccess);
}

/**
 * Get classification label from score
 *
 * @param {number} score - Overall rurality score (0-100)
 * @returns {Object} Classification details
 */
function getClassification(score) {
  if (score >= 80) {
    return {
      label: 'Very Rural',
      description: 'Remote rural area with minimal urban influence',
      color: 'green',
      emoji: '🌾'
    };
  } else if (score >= 60) {
    return {
      label: 'Rural',
      description: 'Rural area with some distance from urban centers',
      color: 'lime',
      emoji: '🏞️'
    };
  } else if (score >= 40) {
    return {
      label: 'Mixed',
      description: 'Mix of rural and urban characteristics',
      color: 'yellow',
      emoji: '🏘️'
    };
  } else if (score >= 20) {
    return {
      label: 'Suburban',
      description: 'Suburban area near urban centers',
      color: 'orange',
      emoji: '🏡'
    };
  } else {
    return {
      label: 'Urban',
      description: 'Urban area with high population density',
      color: 'red',
      emoji: '🏙️'
    };
  }
}

/**
 * Validate and calculate rurality with error handling
 *
 * @param {Object} params - Input parameters
 * @returns {Object} Results with error handling
 */
export async function calculateRuralityWithValidation(params) {
  try {
    const result = calculateRuralityScore(params);
    return {
      success: true,
      data: result,
      error: null
    };
  } catch (error) {
    console.error('Rurality calculation error:', error);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}

export default {
  calculateRuralityScore,
  calculateRuralityWithValidation
};
