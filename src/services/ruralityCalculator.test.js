import { calculateRuralityScore } from './ruralityCalculator';

// Arthur County, NE sits at 41.57, -101.70 with ~0.7 people/sqmi. The
// density < 1 path used to call Math.pow on a negative log, which returns
// NaN and silently classified Sandhills counties as Urban. These tests
// lock in the fix. If density ever slips back to NaN, these fail loudly.
describe('calculateRuralityScore', () => {
  const base = { lat: 41.57, lng: -101.70, populationDensity: 0.7 };

  test('density < 1 does not produce NaN (Sandhills regression)', () => {
    const r = calculateRuralityScore({ ...base, ruca: 10 });
    expect(Number.isFinite(r.overallScore)).toBe(true);
    expect(Number.isFinite(r.components.populationDensity.score)).toBe(true);
    expect(r.components.populationDensity.score).toBe(100);
  });

  test('density = 0 floors at rural (not NaN, not Urban)', () => {
    const r = calculateRuralityScore({ ...base, populationDensity: 0 });
    expect(r.components.populationDensity.score).toBe(100);
    expect(r.overallScore).toBeGreaterThan(60);
  });

  test('very rural county classifies as Very Rural', () => {
    // Arthur / Grant NE: RUCA 10, density < 1, hundreds of miles from metros
    const r = calculateRuralityScore({ ...base, ruca: 10 });
    expect(r.classification.label).toBe('Very Rural');
    expect(r.overallScore).toBeGreaterThanOrEqual(80);
  });

  test('dense metro core (NYC-like) classifies as Urban', () => {
    const r = calculateRuralityScore({
      lat: 40.7128, lng: -74.0060, populationDensity: 28000, ruca: 1,
    });
    expect(r.classification.label).toBe('Urban');
    expect(r.overallScore).toBeLessThan(20);
  });

  test('density curve matches calibration points', () => {
    // Pulled directly from R build_county_data.R: 100 - log10(max(1,d))*25
    const cases = [
      { d: 0.5, expected: 100 },
      { d: 1,    expected: 100 },
      { d: 10,   expected: 75  },
      { d: 100,  expected: 50  },
      { d: 1000, expected: 25  },
      { d: 10000, expected: 0  },
    ];
    for (const { d, expected } of cases) {
      const r = calculateRuralityScore({ ...base, populationDensity: d });
      expect(r.components.populationDensity.score).toBe(expected);
    }
  });

  test('missing RUCA falls back to density + distance weights', () => {
    const r = calculateRuralityScore({ ...base, ruca: null });
    expect(r.components.ruca).toBeNull();
    expect(r.confidence).toBe('medium');
    expect(Number.isFinite(r.overallScore)).toBe(true);
  });

  test('full-data path uses RUCA + density + distance + broadband', () => {
    const r = calculateRuralityScore({
      ...base, ruca: 10, broadbandAccess: 50,
    });
    expect(r.confidence).toBe('high');
    expect(r.components.broadband).not.toBeNull();
    expect(r.methodology.weights).toEqual({
      ruca: 0.50, density: 0.25, distance: 0.15, broadband: 0.10,
    });
  });

  test('unknown RUCA code (>10) returns null score, not NaN', () => {
    const r = calculateRuralityScore({ ...base, ruca: 99 });
    // Unknown code → rucaToScore returns null → treated as "no RUCA"
    expect(Number.isFinite(r.overallScore)).toBe(true);
  });

  test('overall score always clamps to [0, 100]', () => {
    for (const d of [0, 0.01, 1, 100, 10000, 100000]) {
      for (const ruca of [null, 1, 5, 10]) {
        const r = calculateRuralityScore({ ...base, populationDensity: d, ruca });
        expect(r.overallScore).toBeGreaterThanOrEqual(0);
        expect(r.overallScore).toBeLessThanOrEqual(100);
      }
    }
  });

  test('throws on missing lat/lng', () => {
    expect(() => calculateRuralityScore({ populationDensity: 1 })).toThrow();
  });
});
