// src/services/dataServices.js
// Real API integrations for Rurality.app

class RuralityDataService {
  constructor() {
    this.censusApiKey = process.env.REACT_APP_CENSUS_API_KEY;
    this.mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
  }

  // Enhanced geocoding with multiple fallbacks
  async geocodeLocation(location) {
    const encodedLocation = encodeURIComponent(location);
    
    try {
      // Try Mapbox first (if token available)
      if (this.mapboxToken) {
        const mapboxResponse = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${this.mapboxToken}&country=us&limit=1`
        );
        const mapboxData = await mapboxResponse.json();
        
        if (mapboxData.features && mapboxData.features.length > 0) {
          const feature = mapboxData.features[0];
          return {
            lat: feature.center[1],
            lng: feature.center[0],
            displayName: feature.place_name,
            context: feature.context || []
          };
        }
      }
      
      // Fallback to OpenStreetMap Nominatim
      const osmResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&countrycodes=us&limit=1&addressdetails=1`
      );
      const osmData = await osmResponse.json();
      
      if (osmData && osmData.length > 0) {
        return {
          lat: parseFloat(osmData[0].lat),
          lng: parseFloat(osmData[0].lon),
          displayName: osmData[0].display_name,
          address: osmData[0].address
        };
      }
      
      throw new Error('Location not found');
    } catch (error) {
      throw new Error(`Geocoding failed: ${error.message}`);
    }
  }

  // Get county and state FIPS codes from coordinates
  async getFipsFromCoordinates(lat, lng) {
    try {
      const response = await fetch(
        `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        return {
          stateFips: data.results[0].state_fips,
          countyFips: data.results[0].county_fips,
          stateName: data.results[0].state_name,
          countyName: data.results[0].county_name
        };
      }
      throw new Error('FIPS codes not found');
    } catch (error) {
      console.warn('FCC FIPS lookup failed:', error);
      return null;
    }
  }
  
  // In your getCensusData method, add debugging:
  async getCensusData(stateFips, countyFips) {
    try {
      const apiKeyParam = this.censusApiKey ? `&key=${this.censusApiKey}` : '';
    
      const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E,B19013_001E,B25001_001E,B08303_001E,B23025_002E,B23025_005E,B01002_001E&for=county:${countyFips}&in=state:${stateFips}${apiKeyParam}`;
    
    
      const response = await fetch(url);
    
    
      if (!response.ok) {
        throw new Error(`Census API error: ${response.status}`);
      }
    
      const data = await response.json();
    
      if (data && data.length > 1) {
        const values = data[1];
      
        const totalPopulation = parseInt(values[0]) || 0;
        const medianIncome = parseInt(values[1]) || 0;
        const housingUnits = parseInt(values[2]) || 0;
        const commuteTime = parseFloat(values[3]) || 0;
        const laborForce = parseInt(values[4]) || 0;
        const unemployed = parseInt(values[5]) || 0;
        const medianAge = parseFloat(values[6]) || 0;
      
        const unemploymentRate = laborForce > 0 ? ((unemployed / laborForce) * 100).toFixed(1) : 0;
      
        const result = {
          totalPopulation,
          medianIncome,
          housingUnits,
          commuteTime,
          unemployed,
          laborForce,
          unemploymentRate: parseFloat(unemploymentRate),
          medianAge
        };
      
        return result;
      }
    
      throw new Error('No Census data found');
    } catch (error) {
      return null;
    }
  }
  // Get county area and calculate population density
  async getCountyArea(stateFips, countyFips) {
    try {
      // Using a lookup table of county areas (in square miles)
      // In production, you'd calculate this from actual boundary data
      const countyAreas = await this.getCountyAreaLookup();
      const fipsCode = `${stateFips}${countyFips}`;
      
      return countyAreas[fipsCode] || 1000; // Default 1000 sq mi if not found
    } catch (error) {
      return 1000; // Default fallback
    }
  }

  // USDA Rural-Urban Continuum Codes
  async getRuralUrbanCode(stateFips, countyFips) {
    try {
      // This would typically be a local JSON file or database
      // USDA publishes these codes every 10 years
      const ruralUrbanCodes = await this.getRuralUrbanLookup();
      const fipsCode = `${stateFips}${countyFips}`;
      
      return ruralUrbanCodes[fipsCode] || {
        code: 5, // Default to "rural or less than 2,500 urban population, adjacent to a metro area"
        description: "Rural or less than 2,500 urban population, adjacent to a metro area"
      };
    } catch (error) {
      return { code: 5, description: "Unknown classification" };
    }
  }

  // FCC Broadband data
  async getBroadbandData(stateFips, countyFips) {
    try {
      const response = await fetch(
        `https://broadbandmap.fcc.gov/api/public/map/us/county/${stateFips}${countyFips}/broadband/summary`
      );
      
      if (!response.ok) {
        throw new Error('FCC API error');
      }
      
      const data = await response.json();
      
      return {
        broadbandAvailability: data.fixed_broadband_deployment || 0,
        mobileAvailability: data.mobile_broadband_deployment || 0,
        totalProviders: data.provider_count || 0
      };
    } catch (error) {
      console.warn('FCC broadband data failed:', error);
      return {
        broadbandAvailability: 70, // National average fallback
        mobileAvailability: 85,
        totalProviders: 3
      };
    }
  }

  // Calculate distance to nearest urban center
  calculateDistanceToUrban(lat, lng) {
    // Major US urban centers (population > 1 million)
    const urbanCenters = [
      { name: "New York, NY", lat: 40.7128, lng: -74.0060 },
      { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
      { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
      { name: "Houston, TX", lat: 29.7604, lng: -95.3698 },
      { name: "Phoenix, AZ", lat: 33.4484, lng: -112.0740 },
      { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652 },
      { name: "San Antonio, TX", lat: 29.4241, lng: -98.4936 },
      { name: "San Diego, CA", lat: 32.7157, lng: -117.1611 },
      { name: "Dallas, TX", lat: 32.7767, lng: -96.7970 },
      { name: "San Jose, CA", lat: 37.3382, lng: -121.8863 }
    ];

    const distances = urbanCenters.map(center => {
      return this.calculateDistance(lat, lng, center.lat, center.lng);
    });

    return Math.min(...distances);
  }

  // Haversine formula for distance calculation
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Main function to get complete rurality data
  async getRuralityData(location) {
    try {
      // Step 1: Geocode the location
      const geoData = await this.geocodeLocation(location);
      
      // Step 2: Get FIPS codes
      const fipsData = await this.getFipsFromCoordinates(geoData.lat, geoData.lng);
      
      if (!fipsData) {
        throw new Error('Could not determine county/state');
      }

      // Step 3: Get all data sources in parallel
      const [censusData, countyArea, ruralUrbanCode, broadbandData] = await Promise.all([
        this.getCensusData(fipsData.stateFips, fipsData.countyFips),
        this.getCountyArea(fipsData.stateFips, fipsData.countyFips),
        this.getRuralUrbanCode(fipsData.stateFips, fipsData.countyFips),
        this.getBroadbandData(fipsData.stateFips, fipsData.countyFips)
      ]);

      // Step 4: Calculate metrics
      const populationDensity = censusData ? censusData.totalPopulation / countyArea : 50;
      const distanceToUrban = this.calculateDistanceToUrban(geoData.lat, geoData.lng);
      
      // Step 5: Calculate rurality score
      const ruralityScore = this.calculateRuralityScore({
        populationDensity,
        distanceToUrban,
        ruralUrbanCode: ruralUrbanCode.code,
        broadbandAvailability: broadbandData.broadbandAvailability,
        medianIncome: censusData?.medianIncome || 50000,
        commuteTime: censusData?.commuteTime || 25
      });

      return {
        location: geoData.displayName,
        coordinates: { lat: geoData.lat, lng: geoData.lng },
        fips: fipsData,
        ruralityScore,
        rawData: {
          censusData,
          countyArea,
          ruralUrbanCode,
          broadbandData,
          populationDensity,
          distanceToUrban
        }
      };

    } catch (error) {
      throw new Error(`Failed to get rurality data: ${error.message}`);
    }
  }

  // Enhanced rurality scoring algorithm
  calculateRuralityScore(data) {
    const scores = {
      // Population density (lower = more rural)
      populationDensity: Math.max(0, Math.min(100, (2000 - data.populationDensity) / 20)),
      
      // Distance to urban center (higher = more rural)
      distanceToUrban: Math.min(100, data.distanceToUrban * 1.5),
      
      // USDA Rural-Urban code (9 = most rural, 1 = most urban)
      ruralUrbanCode: (data.ruralUrbanCode / 9) * 100,
      
      // Broadband availability (lower = more rural)
      internetAccess: 100 - data.broadbandAvailability,
      
      // Economic factors
      economicDiversity: this.calculateEconomicDiversityScore(data.medianIncome, data.commuteTime),
      
      // Healthcare access (simplified for now)
      healthcareAccess: this.calculateHealthcareScore(data.populationDensity)
    };

    // Weighted average
    const weights = {
      populationDensity: 0.30,
      distanceToUrban: 0.25,
      ruralUrbanCode: 0.20,
      internetAccess: 0.10,
      economicDiversity: 0.10,
      healthcareAccess: 0.05
    };

    const weightedScore = Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (scores[key] * weight);
    }, 0);

    return {
      overallScore: Math.round(Math.max(0, Math.min(100, weightedScore))),
      componentScores: scores
    };
  }

  calculateEconomicDiversityScore(medianIncome, commuteTime) {
    // Higher income and longer commute times typically indicate less economic diversity locally
    const incomeScore = Math.max(0, (80000 - medianIncome) / 1000);
    const commuteScore = Math.max(0, (45 - commuteTime));
    return Math.min(100, (incomeScore + commuteScore) / 2);
  }

  calculateHealthcareScore(populationDensity) {
    // Lower population density typically means fewer healthcare facilities
    return Math.max(0, Math.min(100, (500 - populationDensity) / 5));
  }

  // Data lookup methods (these would load from JSON files or APIs)
  async getCountyAreaLookup() {
    // This would be a comprehensive lookup table of all US county areas
    // For now, return a sample
    return {
      "30111": 2635, // Yellowstone County, MT
      "06059": 948,  // Orange County, CA
      "48453": 1023, // Travis County, TX
      "19169": 573   // Story County, IA
    };
  }

  async getRuralUrbanLookup() {
    // USDA 2013 Rural-Urban Continuum Codes
    return {
      "30111": { code: 3, description: "Counties in metro areas of fewer than 250,000 population" },
      "06059": { code: 1, description: "Counties in metro areas of 1 million population or more" },
      "48453": { code: 1, description: "Counties in metro areas of 1 million population or more" },
      "19169": { code: 2, description: "Counties in metro areas of 250,000 to 1 million population" }
    };
  }
}

const ruralityDataService = new RuralityDataService();
export default ruralityDataService;