/**
 * Rurality Calculator — Research-Based Hybrid Methodology (DRAFT)
 *
 * Weights when full data available (confidence: high):
 *   RUCA code          50%  — USDA gold standard commuting-area classification
 *   Population density 25%  — Census ACS
 *   Distance to metro  15%  — Haversine to nearest metro tier
 *   Broadband access   10%  — FCC BDC, % locations served at 100/20 Mbps
 *
 * RUCA only (confidence: medium-high):
 *   RUCA 55%, Density 25%, Distance 20%
 *
 * No RUCA, broadband available (confidence: medium):
 *   Density 50%, Distance 25%, Broadband 25%
 *
 * Density + Distance only (confidence: medium):
 *   Density 55%, Distance 45%
 *
 * These values match the Methodology page §1 exhibit and the R replication
 * snippet in Researchers §5. Any change here must also update those surfaces.
 */

import { rucaToScore, getRUCADescription, isRuralByRUCA } from '../data/rucaZcta';
import { calculateMetroDistances } from '../data/metroAreas';

/**
 * Calculate comprehensive rurality score.
 *
 * @param {Object}  params
 * @param {number}  params.lat              - Latitude
 * @param {number}  params.lng              - Longitude
 * @param {number}  params.populationDensity - People per square mile
 * @param {number|null} [params.ruca]       - RUCA code 1–10 (null = not available)
 * @param {number|null} [params.broadbandAccess] - Percent with broadband (0–100)
 * @returns {Object} Comprehensive rurality analysis
 */
export function calculateRuralityScore({
  lat,
  lng,
  populationDensity,
  ruca = null,
  broadbandAccess = null
}) {
  if (lat === undefined || lng === undefined || populationDensity === undefined) {
    throw new Error('lat, lng, and populationDensity are required');
  }

  // ── 1. RUCA component ────────────────────────────────────────────────────
  const rucaScore = ruca !== null ? rucaToScore(ruca) : null;
  const rucaDescription = ruca !== null ? getRUCADescription(ruca) : null;
  const officiallyRural = ruca !== null ? isRuralByRUCA(ruca) : null;

  // ── 2. Population density component ─────────────────────────────────────
  const densityScore = calcDensityScore(populationDensity);

  // ── 3. Distance to metro component ──────────────────────────────────────
  const metroDistances = calculateMetroDistances(lat, lng);
  const distanceScore = calcDistanceScore(metroDistances);

  // ── 4. Broadband component ───────────────────────────────────────────────
  const broadbandScore = broadbandAccess !== null
    ? Math.round(100 - broadbandAccess)
    : null;

  // ── 5. Weighted total ────────────────────────────────────────────────────
  let weights, totalScore;

  // Weights per published methodology (see Methodology page §1 and CLAUDE.md).
  // Draft index — subject to refinement before peer review.
  if (rucaScore !== null && broadbandScore !== null) {
    // Full data: RUCA + Density + Distance + Broadband
    weights = { ruca: 0.50, density: 0.25, distance: 0.15, broadband: 0.10 };
    totalScore = rucaScore * weights.ruca + densityScore * weights.density +
                 distanceScore * weights.distance + broadbandScore * weights.broadband;
  } else if (rucaScore !== null) {
    // RUCA available but no broadband: weight shifts to distance
    weights = { ruca: 0.55, density: 0.25, distance: 0.20, broadband: 0.00 };
    totalScore = rucaScore * weights.ruca + densityScore * weights.density +
                 distanceScore * weights.distance;
  } else if (broadbandScore !== null) {
    // No RUCA but broadband present
    weights = { ruca: 0.00, density: 0.50, distance: 0.25, broadband: 0.25 };
    totalScore = densityScore * weights.density + distanceScore * weights.distance +
                 broadbandScore * weights.broadband;
  } else {
    // Fallback: density + distance only
    weights = { ruca: 0.00, density: 0.55, distance: 0.45, broadband: 0.00 };
    totalScore = densityScore * weights.density + distanceScore * weights.distance;
  }

  const overallScore = Math.round(Math.max(0, Math.min(100, totalScore)));
  const classification = getClassification(overallScore);

  // Confidence: high = RUCA + broadband, medium-high = RUCA only,
  //             medium = density + distance only
  const confidence = rucaScore !== null
    ? (broadbandScore !== null ? 'high' : 'medium-high')
    : 'medium';

  return {
    overallScore,
    classification,
    confidence,
    components: {
      ruca: rucaScore !== null ? {
        code: ruca,
        description: rucaDescription,
        score: rucaScore,
        weight: weights.ruca,
        contribution: Math.round(rucaScore * weights.ruca),
        officiallyRural
      } : null,
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
      version: '2.0',
      lastUpdated: '2025-01-01',
      rucaAvailable: rucaScore !== null,
      sources: [
        'USDA ERS Rural-Urban Commuting Area Codes (RUCA 2020)',
        'US Census Bureau ACS 5-Year (2022)',
        'Census TIGER/Line for county land area',
        ...(broadbandAccess !== null ? ['FCC Broadband Data Collection (BDC) — June 2025 filing'] : [])
      ],
      weights
    }
  };
}

// Density + distance formulas mirror build_county_data.R in the rurality R
// package so the live site and county_rurality.csv stay in sync. Any change
// here must update the R script too.

function calcDensityScore(density) {
  // R: 100 - log10(pmax(1, density)) * 25
  // Flooring at 1/sqmi sidesteps NaN from log10(negative) (Math.pow chain)
  // and gives every sub-1/sqmi county the same max-rural density score.
  const d = Math.max(1, density);
  const score = 100 - Math.log10(d) * 25;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function calcDistanceScore(distances) {
  // R: score_large = dist/3, score_medium = dist/2, score_small = dist/1
  // Weighted 0.5 / 0.3 / 0.2.
  const large  = Math.min(100, distances.largeMetro.distance  / 3);
  const medium = Math.min(100, distances.mediumMetro.distance / 2);
  const small  = Math.min(100, distances.smallMetro.distance  / 1);
  return Math.round(Math.max(0, Math.min(100, large * 0.5 + medium * 0.3 + small * 0.2)));
}

function getClassification(score) {
  if (score >= 80) return { label: 'Very Rural',  description: 'Remote rural area with minimal urban influence',      color: 'green',  emoji: '🌾' };
  if (score >= 60) return { label: 'Rural',        description: 'Rural area with some distance from urban centers',   color: 'lime',   emoji: '🏞️' };
  if (score >= 40) return { label: 'Mixed',         description: 'Mix of rural and urban characteristics',            color: 'yellow', emoji: '🏘️' };
  if (score >= 20) return { label: 'Suburban',      description: 'Suburban area near urban centers',                  color: 'orange', emoji: '🏡' };
  return             { label: 'Urban',         description: 'Urban area with high population density',            color: 'red',    emoji: '🏙️' };
}

const ruralityCalculator = { calculateRuralityScore };
export default ruralityCalculator;
