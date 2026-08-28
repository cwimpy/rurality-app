/**
 * Tests for the county place index used by the search typeahead.
 *
 * These run against the real public/data/places.json, so a bad rebuild of that
 * file fails here rather than silently degrading the search box.
 */

import fs from 'fs';
import path from 'path';
import { loadPlacesData, searchPlaces, countExactMatches, parseQuery } from './places';
import { toStateAbbr } from './states';

beforeAll(async () => {
  const file = path.join(__dirname, '..', '..', 'public', 'data', 'places.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(json) }));
  await loadPlacesData();
});

describe('parseQuery', () => {
  test('splits a comma-qualified state abbreviation', () => {
    expect(parseQuery('Washington County, AR')).toEqual({ place: 'Washington County', state: 'AR' });
  });

  test('splits a comma-qualified full state name', () => {
    expect(parseQuery('Washington County, Arkansas')).toEqual({ place: 'Washington County', state: 'AR' });
  });

  test('splits a comma-less trailing state', () => {
    expect(parseQuery('washington county ar')).toEqual({ place: 'washington county', state: 'AR' });
  });

  test('prefers the two-word state name over its last word', () => {
    expect(parseQuery('Roosevelt County New Mexico')).toEqual({ place: 'Roosevelt County', state: 'NM' });
  });

  test('leaves a bare state name as a place query', () => {
    expect(parseQuery('Arkansas')).toEqual({ place: 'Arkansas', state: null });
  });

  test('keeps the county when the state repeats the county name', () => {
    expect(parseQuery('Washington County, Washington')).toEqual({ place: 'Washington County', state: 'WA' });
  });

  test('ignores an unrecognized trailing token', () => {
    expect(parseQuery('Springfield')).toEqual({ place: 'Springfield', state: null });
  });
});

describe('toStateAbbr', () => {
  test.each([
    ['AR', 'AR'], ['ar', 'AR'], ['Arkansas', 'AR'], ['arkansas', 'AR'],
    ['Puerto Rico', 'PR'], ['washington dc', 'DC'],
  ])('resolves %s', (input, expected) => {
    expect(toStateAbbr(input)).toBe(expected);
  });

  test('returns null for a non-state', () => {
    expect(toStateAbbr('Ontario')).toBeNull();
  });
});

describe('searchPlaces', () => {
  test('finds every Washington across states, including the Louisiana parish', () => {
    // 30 Washington Counties + Washington Parish, LA. The parish belongs here:
    // a collision across county-equivalent *types* is exactly as ambiguous as
    // one across states.
    const { total, matches } = searchPlaces('Washington County', 50);
    expect(total).toBe(31);
    expect(matches.map(m => m.label)).toContain('Washington Parish, LA');
  });

  test('matches with or without the type suffix', () => {
    expect(searchPlaces('washington', 50).total).toBe(searchPlaces('washington county', 50).total);
  });

  test('a state qualifier narrows to one result', () => {
    const { matches, total } = searchPlaces('Washington County, AR');
    expect(total).toBe(1);
    expect(matches[0].fips).toBe('05143');
    expect(matches[0].label).toBe('Washington County, AR');
  });

  test('ranks an exact name above a longer name containing it', () => {
    const { matches } = searchPlaces('Washington', 50);
    expect(matches[0].name).toBe('Washington County');
  });

  test('resolves Louisiana parishes by their real type word', () => {
    const { matches } = searchPlaces('Acadia, LA');
    expect(matches[0].name).toBe('Acadia Parish');
  });

  test('resolves Alaska census areas', () => {
    const { matches } = searchPlaces('Aleutians West, AK');
    expect(matches[0].name).toBe('Aleutians West Census Area');
  });

  test('resolves Connecticut planning regions', () => {
    const { matches } = searchPlaces('Capitol, CT');
    expect(matches[0].fips).toBe('09110');
  });

  test('resolves a Virginia independent city', () => {
    const { matches } = searchPlaces('Alexandria, VA');
    expect(matches[0].fips).toBe('51510');
  });

  test('ignores accents in Puerto Rico municipios', () => {
    // Guards the Latin-1 decode in data_raw/build_places.R: if places.json is
    // ever rebuilt without locale(encoding = "latin1"), the name arrives as
    // mojibake and this fails.
    expect(searchPlaces('Anasco, PR').matches[0].name).toBe('Añasco Municipio');
    expect(searchPlaces('Añasco, PR').matches[0].fips).toBe('72011');
    expect(searchPlaces('Dona Ana, NM').matches[0].name).toBe('Doña Ana County');
  });

  test('ignores punctuation differences', () => {
    expect(searchPlaces('St Louis County, MO').matches[0].fips).toBe('29189');
    expect(searchPlaces('St. Louis County, MO').matches[0].fips).toBe('29189');
  });

  test('respects the limit while reporting the true total', () => {
    const { matches, total } = searchPlaces('Washington County', 5);
    expect(matches).toHaveLength(5);
    expect(total).toBe(31);
  });

  test('returns nothing for a one-character query', () => {
    expect(searchPlaces('W').total).toBe(0);
  });

  test('returns nothing for a ZIP code', () => {
    expect(searchPlaces('72401').total).toBe(0);
  });

  test('every match carries the fields the UI renders', () => {
    const { matches } = searchPlaces('Craighead');
    expect(matches[0]).toMatchObject({
      fips: expect.stringMatching(/^\d{5}$/),
      name: expect.any(String),
      st: expect.stringMatching(/^[A-Z]{2}$/),
      label: expect.any(String),
    });
  });
});

describe('countExactMatches', () => {
  test('counts only exact name collisions, not substrings', () => {
    expect(countExactMatches('Washington County')).toBe(31);
    expect(countExactMatches('Washington')).toBe(31);
  });

  test('a state qualifier collapses the collision to one', () => {
    expect(countExactMatches('Washington County, AR')).toBe(1);
  });

  test('a unique county name counts once', () => {
    expect(countExactMatches('Craighead County, AR')).toBe(1);
  });

  test('an unknown name counts zero', () => {
    expect(countExactMatches('Nowhere Township')).toBe(0);
  });
});
