/**
 * Coordinate → county resolution. TIGERweb (current counties) is primary so
 * Connecticut resolves to its planning regions, which is what the ACS answers
 * for; the FCC Area API is the fallback when TIGERweb is down.
 */
import { getCountyFromCoordinates, AREA_FALLBACK_SQ_MI } from './apiUtils';

const tigerFeature = (attrs) => ({
  ok: true,
  json: () => Promise.resolve({ features: [{ attributes: attrs }] }),
});
const fccResult = (r) => ({ ok: true, json: () => Promise.resolve({ results: [r] }) });
const fccDown = () => ({
  ok: false,
  status: 400,
  json: () => Promise.resolve({ status: 'error', statusCode: '400' }),
});

afterEach(() => { global.fetch = undefined; });

test('a Connecticut point resolves to its planning region, with land area', async () => {
  global.fetch = jest.fn((url) => {
    expect(url).toContain('tigerWMS_Current/MapServer/82/query');
    expect(url).toContain('geometry=-72.6734%2C41.7658');
    return Promise.resolve(tigerFeature({
      GEOID: '09110', STATE: '09', COUNTY: '110', NAME: 'Capitol Planning Region', AREALAND: 2660846205,
    }));
  });
  const r = await getCountyFromCoordinates(41.7658, -72.6734);
  expect(r).toEqual({ stateFips: '09', countyFips: '110', countyName: 'Capitol Planning Region', areaSqMiles: 1027.36 });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('falls back to the FCC Area API when TIGERweb errors', async () => {
  global.fetch = jest.fn((url) => {
    if (url.includes('tigerweb')) return Promise.resolve({ ok: false, status: 503 });
    expect(url).toContain('geo.fcc.gov/api/census/area');
    return Promise.resolve(fccResult({ state_fips: '05', county_fips: '05031', county_name: 'Craighead County' }));
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const r = await getCountyFromCoordinates(35.8423, -90.7043);
  expect(r).toEqual({ stateFips: '05', countyFips: '031', countyName: 'Craighead County', areaSqMiles: AREA_FALLBACK_SQ_MI });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test('an ArcGIS error payload (HTTP 200) also triggers the fallback', async () => {
  global.fetch = jest.fn((url) => {
    if (url.includes('tigerweb')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ error: { code: 404, message: 'Layer not found' } }) });
    }
    return Promise.resolve(fccResult({ state_fips: '2', county_fips: '2013', county_name: 'Aleutians East' }));
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const r = await getCountyFromCoordinates(55.0, -162.0);
  expect(r.stateFips).toBe('02');
  expect(r.countyFips).toBe('013');
  warn.mockRestore();
});

test('a fallback result is not cached, so TIGERweb is tried again next time', async () => {
  let tigerCalls = 0;
  global.fetch = jest.fn((url) => {
    if (url.includes('tigerweb')) {
      tigerCalls += 1;
      return Promise.resolve(tigerCalls === 1
        ? { ok: false, status: 503 }
        : tigerFeature({ GEOID: '48201', STATE: '48', COUNTY: '201', NAME: 'Harris County', AREOLAND: 0, AREALAND: 4412000000 }));
    }
    return Promise.resolve(fccResult({ state_fips: '48', county_fips: '48201', county_name: 'Harris County' }));
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const first = await getCountyFromCoordinates(29.76, -95.37);
  expect(first.areaSqMiles).toBe(AREA_FALLBACK_SQ_MI);
  const second = await getCountyFromCoordinates(29.76, -95.37);
  expect(second.areaSqMiles).toBeCloseTo(1703.48, 1);
  expect(tigerCalls).toBe(2);
  warn.mockRestore();
});

test('FCC results without a county FIPS are rejected', async () => {
  global.fetch = jest.fn((url) =>
    Promise.resolve(url.includes('tigerweb') ? { ok: false, status: 500 } : fccResult({ state_fips: '09', county_fips: '', county_name: '' })));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(getCountyFromCoordinates(41.0, -73.0)).rejects.toThrow('FCC API returned no county FIPS');
  warn.mockRestore();
});

test('throws when both services fail', async () => {
  global.fetch = jest.fn((url) =>
    Promise.resolve(url.includes('tigerweb') ? { ok: false, status: 500 } : fccDown()));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(getCountyFromCoordinates(40.0, -100.0)).rejects.toThrow('County lookup failed (TIGERweb: TIGERweb error: 500; FCC: FCC API error: 400)');
  warn.mockRestore();
});
