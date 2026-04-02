// API Utilities with rate limiting and caching

class APIRateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow; // in milliseconds
    this.requests = [];
  }

  async throttle() {
    const now = Date.now();

    // Remove requests outside the time window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.timeWindow
    );

    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);

      console.warn(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle(); // Retry after waiting
    }

    this.requests.push(now);
  }
}

class APICache {
  constructor(ttl = 300000) { // Default 5 minutes TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) return null;

    const age = Date.now() - item.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Rate limiters for different APIs
const censusRateLimiter = new APIRateLimiter(50, 60000); // 50 requests per minute
const nominatimRateLimiter = new APIRateLimiter(1, 1000); // 1 request per second per Nominatim policy

// Caches
const geocodeCache = new APICache(3600000); // 1 hour
const censusCache = new APICache(86400000); // 24 hours

// Enhanced fetch with retry logic
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      console.warn(`Fetch attempt ${i + 1} failed:`, error.message);

      if (i < maxRetries - 1) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, i), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

// Geocoding with rate limiting and caching
export async function geocodeWithCache(location) {
  const cacheKey = `geocode:${location.toLowerCase()}`;
  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    // eslint-disable-next-line no-console
    console.log('Geocode cache hit for:', location);
    return cached;
  }

  await nominatimRateLimiter.throttle();

  const response = await fetchWithRetry(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&countrycodes=us&limit=1&addressdetails=1`
  );

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error('Location not found');
  }

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);

  // City/place searches often lack a postcode — fall back to reverse geocode
  // at the same coordinates, which nearly always returns one.
  let postcode = data[0].address?.postcode
    ? String(data[0].address.postcode).trim().split('-')[0].substring(0, 5)
    : null;

  if (!postcode) {
    try {
      await nominatimRateLimiter.throttle();
      const revResp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      if (revResp.ok) {
        const revData = await revResp.json();
        if (revData.address?.postcode) {
          postcode = String(revData.address.postcode).trim().split('-')[0].substring(0, 5);
        }
      }
    } catch {
      // reverse geocode failed — postcode stays null, RUCA will be skipped
    }
  }

  const result = {
    lat,
    lng,
    displayName: data[0].display_name,
    address: data[0].address,
    postcode
  };

  geocodeCache.set(cacheKey, result);
  return result;
}

// getLandArea is no longer needed as a standalone function —
// getCountyFromCoordinates returns areaSqMiles from the Census Geocoder.
// This stub keeps any legacy imports from breaking.
export async function getLandArea(_stateFips, _countyFips) {
  return { areaSqMiles: 1000, areaSqMeters: 2589988110 };
}

// Census API with rate limiting and caching
export async function fetchCensusData(stateFips, countyFips) {
  const cacheKey = `census:${stateFips}:${countyFips}`;
  const cached = censusCache.get(cacheKey);

  if (cached) {
    // eslint-disable-next-line no-console
    console.log('Census cache hit for:', cacheKey);
    return cached;
  }

  await censusRateLimiter.throttle();

  const apiKey = process.env.REACT_APP_CENSUS_API_KEY;
  const apiKeyParam = apiKey ? `&key=${apiKey}` : '';

  // Variables: Population, Median Income, Housing Units, Commute Time, Labor Force, Unemployed, Median Age
  const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E,B19013_001E,B25001_001E,B08303_001E,B23025_002E,B23025_005E,B01002_001E&for=county:${countyFips}&in=state:${stateFips}${apiKeyParam}`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  if (!data || data.length < 2) {
    throw new Error('No Census data found');
  }

  const values = data[1];
  const result = {
    totalPopulation: parseInt(values[0]) || 0,
    medianIncome: parseInt(values[1]) || 0,
    housingUnits: parseInt(values[2]) || 0,
    commuteTime: parseFloat(values[3]) || 0,
    laborForce: parseInt(values[4]) || 0,
    unemployed: parseInt(values[5]) || 0,
    medianAge: parseFloat(values[6]) || 0,
    unemploymentRate: values[4] > 0 ? parseFloat(((values[5] / values[4]) * 100).toFixed(1)) : 0
  };

  censusCache.set(cacheKey, result);
  return result;
}

// County lookup via FCC Census Area API, then land area from Census TIGER.
// Returns { stateFips (2-digit), countyFips (3-digit), countyName, areaSqMiles }
export async function getCountyFromCoordinates(lat, lng) {
  const cacheKey = `county:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  // ── FCC Census Area API (CORS-friendly) ─────────────────────────────────
  const fccUrl = `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`;
  const fccResp = await fetch(fccUrl);
  if (!fccResp.ok) throw new Error(`FCC API error: ${fccResp.status}`);
  const fccData = await fccResp.json();

  if (!fccData.results || fccData.results.length === 0) {
    throw new Error('Could not identify county for this location');
  }

  const r = fccData.results[0];
  const stateFips = String(r.state_fips || '');
  // FCC county_fips may be 5-digit (state+county) — extract last 3
  const rawFips = String(r.county_fips || '');
  const countyFips = rawFips.length === 5 ? rawFips.slice(2) : rawFips.padStart(3, '0');
  const countyName = r.county_name || '';

  // ── Land area from Census TIGER (CORS-friendly) ─────────────────────────
  let areaSqMiles = 1000; // fallback
  try {
    const tigerUrl =
      `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/86/query` +
      `?where=STATE%3D%27${stateFips}%27+AND+COUNTY%3D%27${countyFips}%27` +
      `&outFields=AREALAND&f=json`;
    const tigerResp = await fetch(tigerUrl);
    if (tigerResp.ok) {
      const tigerData = await tigerResp.json();
      const areaLand = tigerData.features?.[0]?.attributes?.AREALAND;
      if (areaLand && areaLand > 0) {
        areaSqMiles = parseFloat((areaLand / 2589988.11).toFixed(2));
      }
    }
  } catch {
    // TIGER lookup failed — areaSqMiles stays at fallback
  }

  const result = { stateFips, countyFips, countyName, areaSqMiles };
  geocodeCache.set(cacheKey, result);
  return result;
}

// Alias for any legacy callers
export const getFipsFromCoordinates = getCountyFromCoordinates;

// Multi-year ACS data for trends (2018–2022 5-year estimates)
// Fetches population, income, and unemployment for each year separately.
// Runs in parallel; individual year failures return null and are filtered out.
export async function fetchMultiYearCensusData(stateFips, countyFips) {
  const cacheKey = `multiyear:${stateFips}:${countyFips}`;
  const cached = censusCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.REACT_APP_CENSUS_API_KEY;
  const apiKeyParam = apiKey ? `&key=${apiKey}` : '';
  const years = [2018, 2019, 2020, 2021, 2022];

  const results = await Promise.all(
    years.map(async (year) => {
      await censusRateLimiter.throttle();
      const url =
        `https://api.census.gov/data/${year}/acs/acs5` +
        `?get=B01003_001E,B19013_001E,B23025_002E,B23025_005E` +
        `&for=county:${countyFips}&in=state:${stateFips}${apiKeyParam}`;
      try {
        const response = await fetchWithRetry(url);
        const data = await response.json();
        if (!data || data.length < 2) return null;
        const v = data[1];
        const laborForce = parseInt(v[2]) || 0;
        const unemployed  = parseInt(v[3]) || 0;
        return {
          year,
          population:      parseInt(v[0]) || 0,
          medianIncome:    parseInt(v[1]) || 0,
          unemploymentRate: laborForce > 0
            ? parseFloat(((unemployed / laborForce) * 100).toFixed(1))
            : 0
        };
      } catch {
        return null;
      }
    })
  );

  const filtered = results.filter(Boolean);
  censusCache.set(cacheKey, filtered);
  return filtered;
}

// Clear all caches (useful for admin or settings)
export function clearAllCaches() {
  geocodeCache.clear();
  censusCache.clear();
  // eslint-disable-next-line no-console
  console.log('All caches cleared');
}

// Get cache stats (useful for debugging)
export function getCacheStats() {
  return {
    geocodeCache: geocodeCache.size(),
    censusCache: censusCache.size()
  };
}

const apiUtils = {
  fetchWithRetry,
  geocodeWithCache,
  fetchCensusData,
  getCountyFromCoordinates,
  getFipsFromCoordinates,
  clearAllCaches,
  getCacheStats
};
export default apiUtils;
