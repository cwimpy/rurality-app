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
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Rurality.app/1.0 (https://rurality.app; cwimpy@mac.com)',
          ...options.headers
        }
      });

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

  const result = {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    address: data[0].address
  };

  geocodeCache.set(cacheKey, result);
  return result;
}

// Census API with rate limiting and caching
export async function fetchCensusData(stateFips, countyFips) {
  const cacheKey = `census:${stateFips}:${countyFips}`;
  const cached = censusCache.get(cacheKey);

  if (cached) {
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

// FCC FIPS lookup
export async function getFipsFromCoordinates(lat, lng) {
  const cacheKey = `fips:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const response = await fetchWithRetry(
    `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`
  );

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error('FIPS codes not found');
  }

  const result = {
    stateFips: data.results[0].state_fips,
    countyFips: data.results[0].county_fips,
    stateName: data.results[0].state_name,
    countyName: data.results[0].county_name
  };

  geocodeCache.set(cacheKey, result);
  return result;
}

// Clear all caches (useful for admin or settings)
export function clearAllCaches() {
  geocodeCache.clear();
  censusCache.clear();
  console.log('All caches cleared');
}

// Get cache stats (useful for debugging)
export function getCacheStats() {
  return {
    geocodeCache: geocodeCache.size(),
    censusCache: censusCache.size()
  };
}

export default {
  fetchWithRetry,
  geocodeWithCache,
  fetchCensusData,
  getFipsFromCoordinates,
  clearAllCaches,
  getCacheStats
};
