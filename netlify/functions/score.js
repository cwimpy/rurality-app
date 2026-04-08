const fs = require('fs');
const path = require('path');

// Parse CSV once at cold start, cache in module scope
let countyMap = null;   // FIPS -> county object
let stateIndex = null;  // state_abbr -> [county objects]

function loadData() {
  if (countyMap) return;

  const csvPath = path.join(__dirname, '..', '..', 'build', 'data', 'county_rurality.csv');
  // Fallback for local dev (before build)
  const fallbackPath = path.join(__dirname, '..', '..', 'public', 'data', 'county_rurality.csv');
  const filePath = fs.existsSync(csvPath) ? csvPath : fallbackPath;

  const raw = fs.readFileSync(filePath, 'latin1');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');

  countyMap = new Map();
  stateIndex = {};

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields (rucc_description has commas)
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { fields.push(current); current = ''; continue; }
      current += char;
    }
    fields.push(current);

    if (fields.length < headers.length - 1) continue;

    const county = {
      fips: fields[0],
      state_fips: fields[1],
      county_fips: fields[2],
      state: fields[3],
      county: fields[4],
      population_2020: parseInt(fields[5]) || null,
      acs_population: parseInt(fields[6]) || null,
      land_area_sqmi: parseFloat(fields[7]) || null,
      population_density: parseFloat(fields[8]) || null,
      rucc_2023: parseInt(fields[9]) || null,
      rucc_description: fields[10] || null,
      omb_designation: fields[11] || null,
      lat: parseFloat(fields[12]) || null,
      lng: parseFloat(fields[13]) || null,
      dist_large_metro: parseFloat(fields[14]) || null,
      dist_medium_metro: parseFloat(fields[15]) || null,
      dist_small_metro: parseFloat(fields[16]) || null,
      rucc_score: parseInt(fields[17]) || null,
      density_score: parseInt(fields[18]) || null,
      distance_score: parseInt(fields[19]) || null,
      rurality_score: parseInt(fields[20]) || null,
      classification: fields[21] || null,
      median_income: parseInt(fields[22]) || null,
      median_age: parseFloat(fields[23]) || null
    };

    countyMap.set(county.fips, county);

    if (!stateIndex[county.state]) stateIndex[county.state] = [];
    stateIndex[county.state].push(county);
  }
}

function formatCounty(c) {
  return {
    fips: c.fips,
    state: c.state,
    county: c.county,
    population_2020: c.population_2020,
    population_density: c.population_density,
    rucc_2023: c.rucc_2023,
    rucc_description: c.rucc_description,
    omb_designation: c.omb_designation,
    rurality_score: c.rurality_score,
    classification: c.classification,
    components: {
      rucc_score: c.rucc_score,
      density_score: c.density_score,
      distance_score: c.distance_score
    },
    location: { lat: c.lat, lng: c.lng },
    demographics: {
      median_income: c.median_income,
      median_age: c.median_age
    }
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    loadData();
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to load county data' })
    };
  }

  const params = event.queryStringParameters || {};

  // Lookup by FIPS
  if (params.fips) {
    const fips = params.fips.padStart(5, '0');
    const county = countyMap.get(fips);
    if (!county) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `No county found for FIPS ${fips}` })
      };
    }
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ count: 1, results: [formatCounty(county)] })
    };
  }

  // Lookup by state abbreviation
  if (params.state) {
    const st = params.state.toUpperCase();
    const counties = stateIndex[st];
    if (!counties || counties.length === 0) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `No counties found for state ${st}` })
      };
    }
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        count: counties.length,
        results: counties.map(formatCounty)
      })
    };
  }

  // Search by name
  if (params.q) {
    const query = params.q.toLowerCase();
    const limit = Math.min(parseInt(params.limit) || 25, 100);
    const matches = [];
    for (const [, county] of countyMap) {
      if (county.county.toLowerCase().includes(query)) {
        matches.push(county);
        if (matches.length >= limit) break;
      }
    }
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        count: matches.length,
        query: params.q,
        results: matches.map(formatCounty)
      })
    };
  }

  // No params: return usage info
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      name: 'Rurality.app API',
      version: '1.0',
      documentation: 'https://rurality.app',
      endpoints: {
        'by_fips': '/api/score?fips=05031',
        'by_state': '/api/score?state=AR',
        'by_name': '/api/score?q=Jonesboro&limit=10'
      },
      counties_available: countyMap.size,
      source: 'USDA ERS RUCC 2023, Census ACS 2022',
      citation: 'Wimpy, C. (2026). Rurality.app: Rurality Classification and Scoring for U.S. Locations. https://rurality.app'
    })
  };
};
