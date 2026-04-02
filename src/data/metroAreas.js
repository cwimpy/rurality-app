/**
 * US Metropolitan Statistical Areas by Population Tier
 * Source: US Census Bureau, 2020 Census
 *
 * Used to calculate distance to nearest urban center of various sizes
 */

/**
 * Large Metro Areas (>1 million population)
 * Using principal city coordinates
 */
export const LARGE_METROS = [
  { name: "New York, NY", lat: 40.7128, lng: -74.0060, pop: 19768458 },
  { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437, pop: 13214799 },
  { name: "Chicago, IL", lat: 41.8781, lng: -87.6298, pop: 9618502 },
  { name: "Dallas-Fort Worth, TX", lat: 32.7767, lng: -96.7970, pop: 7637387 },
  { name: "Houston, TX", lat: 29.7604, lng: -95.3698, pop: 7122240 },
  { name: "Washington, DC", lat: 38.9072, lng: -77.0369, pop: 6385162 },
  { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652, pop: 6245051 },
  { name: "Miami, FL", lat: 25.7617, lng: -80.1918, pop: 6138333 },
  { name: "Atlanta, GA", lat: 33.7490, lng: -84.3880, pop: 6089815 },
  { name: "Phoenix, AZ", lat: 33.4484, lng: -112.0740, pop: 4845832 },
  { name: "Boston, MA", lat: 42.3601, lng: -71.0589, pop: 4941632 },
  { name: "San Francisco, CA", lat: 37.7749, lng: -122.4194, pop: 4749008 },
  { name: "Riverside, CA", lat: 33.9533, lng: -117.3962, pop: 4599839 },
  { name: "Detroit, MI", lat: 42.3314, lng: -83.0458, pop: 4392041 },
  { name: "Seattle, WA", lat: 47.6062, lng: -122.3321, pop: 4018762 },
  { name: "Minneapolis, MN", lat: 44.9778, lng: -93.2650, pop: 3690261 },
  { name: "San Diego, CA", lat: 32.7157, lng: -117.1611, pop: 3298634 },
  { name: "Tampa, FL", lat: 27.9506, lng: -82.4572, pop: 3175275 },
  { name: "Denver, CO", lat: 39.7392, lng: -104.9903, pop: 2963821 },
  { name: "St. Louis, MO", lat: 38.6270, lng: -90.1994, pop: 2820253 },
  { name: "Baltimore, MD", lat: 39.2904, lng: -76.6122, pop: 2844510 },
  { name: "Charlotte, NC", lat: 35.2271, lng: -80.8431, pop: 2660329 },
  { name: "Orlando, FL", lat: 28.5383, lng: -81.3792, pop: 2673516 },
  { name: "San Antonio, TX", lat: 29.4241, lng: -98.4936, pop: 2558143 },
  { name: "Portland, OR", lat: 45.5152, lng: -122.6784, pop: 2512859 },
  { name: "Sacramento, CA", lat: 38.5816, lng: -121.4944, pop: 2397382 },
  { name: "Pittsburgh, PA", lat: 40.4406, lng: -79.9959, pop: 2370930 },
  { name: "Las Vegas, NV", lat: 36.1699, lng: -115.1398, pop: 2265018 },
  { name: "Austin, TX", lat: 30.2672, lng: -97.7431, pop: 2283371 },
  { name: "Cincinnati, OH", lat: 39.1031, lng: -84.5120, pop: 2256884 },
  { name: "Kansas City, MO", lat: 39.0997, lng: -94.5786, pop: 2192035 },
  { name: "Columbus, OH", lat: 39.9612, lng: -82.9988, pop: 2138926 },
  { name: "Indianapolis, IN", lat: 39.7684, lng: -86.1581, pop: 2111040 },
  { name: "Cleveland, OH", lat: 41.4993, lng: -81.6944, pop: 2088251 },
  { name: "San Jose, CA", lat: 37.3382, lng: -121.8863, pop: 2016451 },
  { name: "Nashville, TN", lat: 36.1627, lng: -86.7816, pop: 1989519 },
  { name: "Virginia Beach, VA", lat: 36.8529, lng: -75.9780, pop: 1799674 },
  { name: "Providence, RI", lat: 41.8240, lng: -71.4128, pop: 1676579 },
  { name: "Milwaukee, WI", lat: 43.0389, lng: -87.9065, pop: 1574731 },
  { name: "Jacksonville, FL", lat: 30.3322, lng: -81.6557, pop: 1605848 },
  { name: "Oklahoma City, OK", lat: 35.4676, lng: -97.5164, pop: 1425695 },
  { name: "Raleigh, NC", lat: 35.7796, lng: -78.6382, pop: 1413982 },
  { name: "Memphis, TN", lat: 35.1495, lng: -90.0490, pop: 1346045 },
  { name: "Richmond, VA", lat: 37.5407, lng: -77.4360, pop: 1314434 },
  { name: "New Orleans, LA", lat: 29.9511, lng: -90.0715, pop: 1270530 },
  { name: "Louisville, KY", lat: 38.2527, lng: -85.7585, pop: 1306735 },
  { name: "Salt Lake City, UT", lat: 40.7608, lng: -111.8910, pop: 1257936 },
  { name: "Hartford, CT", lat: 41.7658, lng: -72.6734, pop: 1204877 },
  { name: "Buffalo, NY", lat: 42.8864, lng: -78.8784, pop: 1166902 },
  { name: "Birmingham, AL", lat: 33.5207, lng: -86.8025, pop: 1115289 },
  { name: "Grand Rapids, MI", lat: 42.9634, lng: -85.6681, pop: 1087592 },
  { name: "Tucson, AZ", lat: 32.2226, lng: -110.9747, pop: 1043433 }
];

/**
 * Medium Metro Areas (250,000 - 1 million population)
 */
export const MEDIUM_METROS = [
  { name: "Fresno, CA", lat: 36.7378, lng: -119.7871, pop: 999101 },
  { name: "Omaha, NE", lat: 41.2565, lng: -95.9345, pop: 967604 },
  { name: "Albuquerque, NM", lat: 35.0844, lng: -106.6504, pop: 916528 },
  { name: "Knoxville, TN", lat: 35.9606, lng: -83.9207, pop: 879477 },
  { name: "El Paso, TX", lat: 31.7619, lng: -106.4850, pop: 868859 },
  { name: "Bakersfield, CA", lat: 35.3733, lng: -119.0187, pop: 909235 },
  { name: "Allentown, PA", lat: 40.6084, lng: -75.4902, pop: 861899 },
  { name: "Baton Rouge, LA", lat: 30.4515, lng: -91.1871, pop: 870569 },
  { name: "Des Moines, IA", lat: 41.5868, lng: -93.6250, pop: 707915 },
  { name: "Little Rock, AR", lat: 34.7465, lng: -92.2896, pop: 748031 },
  { name: "Boise, ID", lat: 43.6150, lng: -116.2023, pop: 764718 },
  { name: "Spokane, WA", lat: 47.6588, lng: -117.4260, pop: 593466 },
  { name: "Madison, WI", lat: 43.0731, lng: -89.4012, pop: 680796 },
  { name: "Fort Wayne, IN", lat: 41.0793, lng: -85.1394, pop: 419453 },
  { name: "Fargo, ND", lat: 46.8772, lng: -96.7898, pop: 268012 },
  { name: "Sioux Falls, SD", lat: 43.5460, lng: -96.7313, pop: 265653 },
  { name: "Eugene, OR", lat: 44.0521, lng: -123.0868, pop: 382971 },
  { name: "Fayetteville, AR", lat: 36.0626, lng: -94.1574, pop: 545671 },
  { name: "Huntsville, AL", lat: 34.7304, lng: -86.5861, pop: 460054 },
  { name: "Chattanooga, TN", lat: 35.0456, lng: -85.3097, pop: 574893 },
  { name: "Greenville, SC", lat: 34.8526, lng: -82.3940, pop: 942529 },
  { name: "Columbia, SC", lat: 33.9988, lng: -81.0453, pop: 836479 },
  { name: "Savannah, GA", lat: 32.0835, lng: -81.0998, pop: 404798 },
  { name: "Columbus, GA", lat: 32.4610, lng: -84.9877, pop: 337099 },
  { name: "Evansville, IN", lat: 37.9716, lng: -87.5711, pop: 316429 },
  { name: "Springfield, MO", lat: 37.2153, lng: -93.2982, pop: 467369 },
  { name: "Tuscaloosa, AL", lat: 33.2098, lng: -87.5692, pop: 276678 },
  { name: "Fort Smith, AR", lat: 35.3859, lng: -94.3985, pop: 255435 },
  { name: "Pensacola, FL", lat: 30.4213, lng: -87.2169, pop: 502629 },
  { name: "Tallahassee, FL", lat: 30.4518, lng: -84.2807, pop: 390560 }
];

/**
 * Small Metro Areas (50,000 - 250,000 population)
 * Sample of representative small metros
 */
export const SMALL_METROS = [
  // West / Mountain
  { name: "Missoula, MT", lat: 46.8721, lng: -113.9940, pop: 117922 },
  { name: "Billings, MT", lat: 45.7833, lng: -108.5007, pop: 184167 },
  { name: "Flagstaff, AZ", lat: 35.1983, lng: -111.6513, pop: 145101 },
  { name: "Bend, OR", lat: 44.0582, lng: -121.3153, pop: 197692 },
  { name: "Chico, CA", lat: 39.7285, lng: -121.8375, pop: 212843 },
  // Plains / Midwest
  { name: "Ames, IA", lat: 42.0308, lng: -93.6319, pop: 123792 },
  { name: "Rapid City, SD", lat: 44.0805, lng: -103.2310, pop: 148156 },
  { name: "Bismarck, ND", lat: 46.8083, lng: -100.7837, pop: 129508 },
  { name: "Joplin, MO", lat: 37.0842, lng: -94.5133, pop: 186024 },
  { name: "Cape Girardeau, MO", lat: 37.3059, lng: -89.5181, pop: 101138 },
  { name: "Owensboro, KY", lat: 37.7719, lng: -87.1111, pop: 118441 },
  { name: "Muncie, IN", lat: 40.1934, lng: -85.3864, pop: 115072 },
  { name: "Paducah, KY", lat: 37.0834, lng: -88.6001, pop: 97551 },
  // South / Southeast
  { name: "Jonesboro, AR", lat: 35.8423, lng: -90.7043, pop: 131012 },
  { name: "Monroe, LA", lat: 32.5093, lng: -92.1193, pop: 176988 },
  { name: "Hattiesburg, MS", lat: 31.3271, lng: -89.2903, pop: 169351 },
  { name: "Tupelo, MS", lat: 34.2576, lng: -88.7034, pop: 175673 },
  { name: "Meridian, MS", lat: 32.3643, lng: -88.7037, pop: 104062 },
  { name: "Florence, SC", lat: 34.1954, lng: -79.7626, pop: 207621 },
  { name: "Bowling Green, KY", lat: 36.9903, lng: -86.4436, pop: 179135 },
  { name: "Jackson, TN", lat: 35.6145, lng: -88.8139, pop: 183182 },
  { name: "Dothan, AL", lat: 31.2232, lng: -85.3905, pop: 149289 },
  { name: "Texarkana, TX", lat: 33.4418, lng: -94.0477, pop: 149198 },
  { name: "Hot Springs, AR", lat: 34.5037, lng: -93.0552, pop: 100039 },
  // Northeast
  { name: "Burlington, VT", lat: 44.4759, lng: -73.2121, pop: 225562 },
  { name: "Ithaca, NY", lat: 42.4430, lng: -76.5019, pop: 102237 },
  // Texas / Southwest
  { name: "College Station, TX", lat: 30.6280, lng: -96.3344, pop: 273101 }
];

/**
 * Calculate distance to nearest metro of each tier
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Distances to nearest metros by size
 */
export function calculateMetroDistances(lat, lng) {
  const toRadians = deg => deg * (Math.PI / 180);

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const findNearest = (metros) => {
    let minDistance = Infinity;
    let nearestMetro = null;

    metros.forEach(metro => {
      const distance = calculateDistance(lat, lng, metro.lat, metro.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestMetro = metro;
      }
    });

    return { distance: Math.round(minDistance), metro: nearestMetro };
  };

  return {
    largeMetro: findNearest(LARGE_METROS),
    mediumMetro: findNearest(MEDIUM_METROS),
    smallMetro: findNearest(SMALL_METROS)
  };
}

export default {
  LARGE_METROS,
  MEDIUM_METROS,
  SMALL_METROS,
  calculateMetroDistances
};
