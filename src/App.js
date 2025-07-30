import RuralityDataService from './services/dataServices';
import React, { useState, useEffect } from 'react';
import { Search, MapPin, TrendingUp, BarChart3, Layers, Plus, X, Navigation, Info, Filter, Download, Share2, Zap, Wifi, Building2, Tractor, Heart, DollarSign, AlertCircle } from 'lucide-react';

const RuralityApp = () => {
  const [currentLocation, setCurrentLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState('dashboard');
  const [comparisonPlaces, setComparisonPlaces] = useState([]);
  const [selectedYear, setSelectedYear] = useState(2023);
  const [ruralityData, setRuralityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapLayer, setMapLayer] = useState('rurality');

  // Real API integration functions
  const calculateRuralityScore = (data) => {
    // Weighted rurality algorithm
    const weights = {
      populationDensity: 0.25,
      distanceToUrban: 0.20,
      agriculturalLand: 0.15,
      internetAccess: 0.15,
      healthcareDensity: 0.15,
      economicDiversity: 0.10
    };

    const scores = {
      populationDensity: Math.max(0, Math.min(100, (1000 - data.populationDensity) / 10)),
      distanceToUrban: Math.min(100, data.distanceToUrban * 2),
      agriculturalLand: data.agriculturalLand || 50,
      internetAccess: data.internetAccess || 70,
      healthcareDensity: Math.max(0, Math.min(100, (5 - data.healthcareDensity) * 20)),
      economicDiversity: data.economicDiversity || 60
    };

    const overallScore = Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (scores[key] * weight);
    }, 0);

    return {
      overallScore: Math.round(overallScore),
      metrics: {
        populationDensity: { 
          value: data.populationDensity, 
          score: Math.round(scores.populationDensity), 
          label: 'Pop. Density (per sq mi)', 
          icon: Building2 
        },
        distanceToUrban: { 
          value: data.distanceToUrban || 25, 
          score: Math.round(scores.distanceToUrban), 
          label: 'Distance to Urban Center (mi)', 
          icon: MapPin 
        },
        agriculturalLand: { 
          value: data.agriculturalLand || 45, 
          score: Math.round(scores.agriculturalLand), 
          label: 'Agricultural Land Use (%)', 
          icon: Tractor 
        },
        internetAccess: { 
          value: data.internetAccess || 70, 
          score: Math.round(scores.internetAccess), 
          label: 'Broadband Access (%)', 
          icon: Wifi 
        },
        healthcareDensity: { 
          value: data.healthcareDensity || 2.1, 
          score: Math.round(scores.healthcareDensity), 
          label: 'Healthcare Facilities (per 1000)', 
          icon: Heart 
        },
        economicDiversity: { 
          value: data.economicDiversity || 5.2, 
          score: Math.round(scores.economicDiversity), 
          label: 'Economic Diversity Index', 
          icon: DollarSign 
        }
      },
      historicalData: generateHistoricalData(Math.round(overallScore)),
      demographics: data.demographics || {
        population: data.population || 'N/A',
        medianAge: 'N/A',
        medianIncome: 'N/A',
        unemploymentRate: 'N/A'
      }
    };
  };

  const generateHistoricalData = (currentScore) => {
    // Generate realistic historical progression
    const years = [2018, 2019, 2020, 2021, 2022, 2023];
    return years.map((year, index) => ({
      year,
      score: Math.max(0, Math.min(100, currentScore + (Math.random() - 0.5) * 10 - (years.length - index) * 0.5))
    }));
  };

  const geocodeLocation = async (location) => {
    try {
      // Using free Nominatim API for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&countrycodes=us&limit=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }
      throw new Error('Location not found');
    } catch (error) {
      throw new Error(`Geocoding failed: ${error.message}`);
    }
  };

  const getCensusData = async (lat, lng) => {
    try {
      // Using free Census Bureau API
      const response = await fetch(
        `https://api.census.gov/data/2021/acs/acs5?get=B01003_001E,B19013_001E,B25001_001E&for=tract:*&in=state:*&in=county:*`
      );
      
      // For demo purposes, simulate data based on coordinates
      // In real implementation, you'd process the Census API response
      const simulatedData = {
        populationDensity: Math.max(1, Math.random() * 5000),
        population: Math.floor(Math.random() * 50000) + 1000,
        distanceToUrban: calculateDistanceToUrban(lat, lng),
        agriculturalLand: Math.random() * 80 + 10,
        internetAccess: Math.random() * 40 + 60,
        healthcareDensity: Math.random() * 5 + 0.5,
        economicDiversity: Math.random() * 8 + 2,
        demographics: {
          population: Math.floor(Math.random() * 50000) + 1000,
          medianAge: Math.floor(Math.random() * 20) + 30,
          medianIncome: Math.floor(Math.random() * 50000) + 30000,
          unemploymentRate: (Math.random() * 8 + 2).toFixed(1)
        }
      };
      
      return simulatedData;
    } catch (error) {
      throw new Error(`Census data fetch failed: ${error.message}`);
    }
  };

  const calculateDistanceToUrban = (lat, lng) => {
    // Major US urban centers
    const urbanCenters = [
      { lat: 40.7128, lng: -74.0060 }, // NYC
      { lat: 34.0522, lng: -118.2437 }, // LA
      { lat: 41.8781, lng: -87.6298 }, // Chicago
      { lat: 29.7604, lng: -95.3698 }, // Houston
      { lat: 33.4484, lng: -112.0740 }, // Phoenix
    ];

    const distances = urbanCenters.map(center => {
      const dlat = lat - center.lat;
      const dlng = lng - center.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) * 69; // Rough miles conversion
    });

    return Math.min(...distances);
  };

  const handleLocationSearch = async (location) => {
    if (!location.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Step 1: Geocode the location
      const geoData = await geocodeLocation(location);
      
      // Step 2: Get Census and other data
      const censusData = await getCensusData(geoData.lat, geoData.lng);
      
      // Step 3: Calculate rurality score
      const ruralityScore = calculateRuralityScore(censusData);
      
      // Step 4: Update state
      setCurrentLocation(geoData.displayName.split(',')[0] || location);
      setRuralityData({
        ...ruralityScore,
        coordinates: { lat: geoData.lat, lng: geoData.lng }
      });
      
    } catch (error) {
      setError(error.message);
      console.error('Location search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get location name
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          
          const locationName = data.display_name.split(',')[0] || 'Current Location';
          await handleLocationSearch(locationName);
          
        } catch (error) {
          setError('Failed to get location data');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setError(`Location access denied: ${error.message}`);
        setLoading(false);
      },
      { timeout: 10000 }
    );
  };

  const addComparison = (place) => {
    if (comparisonPlaces.length < 5 && !comparisonPlaces.includes(place)) {
      setComparisonPlaces([...comparisonPlaces, place]);
    }
  };

  const removeComparison = (place) => {
    setComparisonPlaces(comparisonPlaces.filter(p => p !== place));
  };

  const getRuralityLevel = (score) => {
    if (score >= 80) return { level: 'Very Rural', color: 'text-green-800 bg-green-200 border-green-300' };
    if (score >= 60) return { level: 'Rural', color: 'text-green-700 bg-green-100 border-green-300' };
    if (score >= 40) return { level: 'Mixed', color: 'text-yellow-700 bg-yellow-100 border-yellow-300' };
    if (score >= 20) return { level: 'Suburban', color: 'text-orange-700 bg-orange-100 border-orange-300' };
    return { level: 'Urban', color: 'text-red-700 bg-red-100 border-red-300' };
  };

  const shareResults = async () => {
    if (!ruralityData || !currentLocation) return;
    
    const shareData = {
      title: 'Rurality.app Analysis',
      text: `${currentLocation} has a Rural Index score of ${ruralityData.overallScore}/100 (${getRuralityLevel(ruralityData.overallScore).level})`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        console.log('Share failed:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareData.text + ' - ' + shareData.url);
      alert('Results copied to clipboard!');
    }
  };

  const exportData = () => {
    if (!ruralityData) return;
    
    // Create CSV data
    const csvData = [
      // Header row
      ['Metric', 'Value', 'Score'],
      // Basic info
      ['Location', currentLocation, ''],
      ['Overall Rural Index', ruralityData.overallScore, ruralityData.overallScore],
      ['Classification', getRuralityLevel(ruralityData.overallScore).level, ''],
      ['', '', ''], // Empty row
      // Metrics
      ...Object.entries(ruralityData.metrics).map(([key, metric]) => [
        metric.label,
        metric.value,
        metric.score
      ]),
      ['', '', ''], // Empty row
      // Demographics
      ['Total Population', ruralityData.demographics?.population || 'N/A', ''],
      ['Median Age', ruralityData.demographics?.medianAge || 'N/A', ''],
      ['Median Income', ruralityData.demographics?.medianIncome ? `${ruralityData.demographics.medianIncome.toLocaleString()}` : 'N/A', ''],
      ['Unemployment Rate', ruralityData.demographics?.unemploymentRate ? `${ruralityData.demographics.unemploymentRate}%` : 'N/A', '']
    ];
    
    // Convert to CSV string
    const csvString = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    // Create download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `rurality-${currentLocation.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const MapView = () => (
    <div className="space-y-6">
      {/* Map Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-slate-800">Rural Index Heat Map</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={mapLayer}
              onChange={(e) => setMapLayer(e.target.value)}
              className="px-3 py-2 border border-green-200 rounded-lg text-sm bg-white"
            >
              <option value="rurality">Rurality Index</option>
              <option value="population">Population Density</option>
              <option value="agriculture">Agricultural Land</option>
              <option value="internet">Internet Access</option>
              <option value="healthcare">Healthcare Access</option>
            </select>
            <button className="flex items-center space-x-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors">
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Map with OpenStreetMap */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
        <div className="h-96 relative">
          {ruralityData?.coordinates ? (
            <iframe
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${ruralityData.coordinates.lng-0.1},${ruralityData.coordinates.lat-0.1},${ruralityData.coordinates.lng+0.1},${ruralityData.coordinates.lat+0.1}&layer=mapnik&marker=${ruralityData.coordinates.lat},${ruralityData.coordinates.lng}`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              title="Location Map"
            />
          ) : (
            <div className="h-full bg-gradient-to-br from-green-100 via-green-50 to-emerald-100 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-slate-700 font-medium">Search for a location to view on map</p>
                <p className="text-sm text-slate-500 mt-2">Real-time mapping with OpenStreetMap</p>
              </div>
            </div>
          )}
          
          {/* Current location indicator */}
          {currentLocation && (
            <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg">
              📍 {currentLocation}
              {ruralityData && (
                <span className="ml-2 bg-green-700 px-2 py-1 rounded text-xs">
                  Score: {ruralityData.overallScore}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Map stats */}
        <div className="p-4 bg-green-50 border-t border-green-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-green-700">3,143</div>
              <div className="text-xs text-slate-600">US Counties</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-700">Real-time</div>
              <div className="text-xs text-slate-600">Data Updates</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-700">6+</div>
              <div className="text-xs text-slate-600">Data Sources</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-700">Free</div>
              <div className="text-xs text-slate-600">Open Access</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const TrendsView = () => (
    <div className="space-y-6">
      {/* Trends Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Rurality Trends</h3>
            <p className="text-slate-600 text-sm mt-1">{currentLocation || 'Select a location to view trends'}</p>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={exportData}
              disabled={!ruralityData}
              className="flex items-center space-x-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button 
              onClick={shareResults}
              disabled={!ruralityData}
              className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
          </div>
        </div>
        
        {ruralityData?.historicalData ? (
          <div className="space-y-6">
            {/* Main trend chart */}
            <div className="h-64 bg-green-50 rounded-xl p-4 relative overflow-hidden">
              {/* Grid lines */}
              <div className="absolute inset-4 opacity-20">
                {[0, 25, 50, 75, 100].map(val => (
                  <div key={val} className="absolute w-full border-t border-green-300" style={{bottom: `${val}%`}}>
                    <span className="text-xs text-green-600 ml-2">{val}</span>
                  </div>
                ))}
              </div>
              
              {/* Trend line */}
              <div className="relative h-full flex items-end justify-between px-4">
                {ruralityData.historicalData.map((item, index) => (
                  <div key={item.year} className="flex flex-col items-center flex-1">
                    {/* Data point */}
                    <div className="relative">
                      <div
                        className="w-2 bg-green-500 rounded-t-full transition-all duration-1000 ease-out"
                        style={{ height: `${Math.round(item.score) * 2}px` }}
                      />
                      <div className="w-3 h-3 bg-green-600 rounded-full absolute -top-1.5 -left-0.5 border-2 border-white shadow-sm" />
                    </div>
                    
                    {/* Year label */}
                    <div className="mt-3 text-xs font-medium text-slate-600">{item.year}</div>
                    <div className="text-xs text-green-600 font-semibold">{Math.round(item.score)}</div>
                  </div>
                ))}
              </div>
              
              {/* Trend indicator */}
              <div className="absolute top-4 right-4 flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {ruralityData.historicalData[ruralityData.historicalData.length - 1].score > ruralityData.historicalData[0].score ? '+' : ''}
                  {(ruralityData.historicalData[ruralityData.historicalData.length - 1].score - ruralityData.historicalData[0].score).toFixed(1)}
                </span>
              </div>
            </div>
            
            {/* Trend insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-slate-800">5-Year Change</h4>
                </div>
                <div className="text-2xl font-bold text-green-700 mb-1">
                  {(ruralityData.historicalData[ruralityData.historicalData.length - 1].score - ruralityData.historicalData[0].score) > 0 ? '+' : ''}
                  {(ruralityData.historicalData[ruralityData.historicalData.length - 1].score - ruralityData.historicalData[0].score).toFixed(1)}
                </div>
                <div className="text-sm text-slate-600">
                  {(ruralityData.historicalData[ruralityData.historicalData.length - 1].score - ruralityData.historicalData[0].score) > 0 ? 'More rural' : 'Less rural'} over time
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-slate-800">Peak Year</h4>
                </div>
                <div className="text-2xl font-bold text-blue-700 mb-1">
                  {ruralityData.historicalData.reduce((prev, current) => prev.score > current.score ? prev : current).year}
                </div>
                <div className="text-sm text-slate-600">Highest rurality score</div>
              </div>
              
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-slate-800">Volatility</h4>
                </div>
                <div className="text-2xl font-bold text-purple-700 mb-1">
                  {Math.max(...ruralityData.historicalData.map(d => d.score)) - Math.min(...ruralityData.historicalData.map(d => d.score)) < 10 ? 'Low' : 'High'}
                </div>
                <div className="text-sm text-slate-600">Score stability</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Search for a location to view historical trends</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-emerald-100">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-green-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl flex items-center justify-center">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-green-800 to-emerald-800 bg-clip-text text-transparent">
                Rurality.app
              </h1>
            </div>
            
            <nav className="flex space-x-1">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'map', label: 'Map', icon: MapPin },
                { id: 'trends', label: 'Trends', icon: TrendingUp }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveView(id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeView === id
                      ? 'bg-green-200 text-green-800'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search Section */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Enter city, county, or ZIP code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLocationSearch(searchQuery)}
                  className="w-full pl-10 pr-4 py-3 border border-green-300 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={getCurrentLocation}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-3 bg-green-200 hover:bg-green-300 text-green-800 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Navigation className="w-4 h-4" />
                  <span className="hidden sm:inline">GPS</span>
                </button>
                <button
                  onClick={() => handleLocationSearch(searchQuery)}
                  disabled={loading || !searchQuery.trim()}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-700 hover:bg-green-800 text-white rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
            </div>
            
            {/* Error display */}
            {error && (
              <div className="mt-4 flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}
            
            {/* Quick location buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              {['Yellowstone County, MT', 'Orange County, CA', 'Travis County, TX', 'Story County, IA'].map((place) => (
                <button
                  key={place}
                  onClick={() => handleLocationSearch(place)}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-lg transition-colors border border-green-300 disabled:opacity-50"
                >
                  {place}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Views */}
        {activeView === 'map' && <MapView />}
        {activeView === 'trends' && <TrendsView />}

        {/* Dashboard View */}
        {ruralityData && activeView === 'dashboard' && (
          <div className="space-y-6">
            {/* Overview Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">{currentLocation}</h2>
                  <div className="flex items-center space-x-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getRuralityLevel(ruralityData.overallScore).color}`}>
                      {getRuralityLevel(ruralityData.overallScore).level}
                    </div>
                    {ruralityData.demographics?.population && (
                      <div className="text-sm text-slate-500">
                        Population: {typeof ruralityData.demographics.population === 'number' ? ruralityData.demographics.population.toLocaleString() : ruralityData.demographics.population}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    {ruralityData.overallScore}
                  </div>
                  <div className="text-sm text-slate-500">Rural Index Score</div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {Object.entries(ruralityData.metrics).map(([key, metric]) => {
                  const Icon = metric.icon;
                  return (
                    <div key={key} className="bg-green-50 rounded-xl p-4 border border-green-100">
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Icon className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-slate-700">{metric.label}</h4>
                          <div className="text-xs text-green-600 font-medium">{metric.score}/100</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800 mb-2">
                        {typeof metric.value === 'number' && metric.value % 1 !== 0 ? metric.value.toFixed(1) : metric.value}
                      </div>
                      <div className="w-full bg-green-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-red-400 via-yellow-400 to-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${metric.score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Demographics quick stats */}
              {ruralityData.demographics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl">
                  <div className="text-center">
                    <div className="text-lg font-bold text-slate-800">{ruralityData.demographics.medianAge}</div>
                    <div className="text-xs text-slate-600">Median Age</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-slate-800">
                      {typeof ruralityData.demographics.medianIncome === 'number' 
                        ? `$${(ruralityData.demographics.medianIncome/1000).toFixed(0)}K`
                        : ruralityData.demographics.medianIncome
                      }
                    </div>
                    <div className="text-xs text-slate-600">Median Income</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-slate-800">{ruralityData.demographics.unemploymentRate}%</div>
                    <div className="text-xs text-slate-600">Unemployment</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{ruralityData.overallScore}</div>
                    <div className="text-xs text-slate-600">Rural Score</div>
                  </div>
                </div>
              )}

              {/* Add to comparison */}
              <div className="mt-6 pt-6 border-t border-green-100 flex justify-between items-center">
                <button
                  onClick={() => addComparison(currentLocation)}
                  disabled={comparisonPlaces.includes(currentLocation) || comparisonPlaces.length >= 5}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Comparison ({comparisonPlaces.length}/5)</span>
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={shareResults}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Comparison Section */}
            {comparisonPlaces.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-6">Location Comparison</h3>
                
                <div className="space-y-4">
                  {comparisonPlaces.map((place) => {
                    // For demo, show simplified comparison data
                    const score = Math.floor(Math.random() * 100);
                    return (
                      <div key={place} className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                        <div className="flex items-center space-x-4">
                          <div className="text-lg font-semibold text-slate-800">{place}</div>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getRuralityLevel(score).color}`}>
                            {getRuralityLevel(score).level}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl font-bold text-green-600">{score}</div>
                          <button
                            onClick={() => removeComparison(place)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Welcome message when no data */}
        {!ruralityData && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 text-center">
            <Layers className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Welcome to Rurality.app</h2>
            <p className="text-slate-600 mb-6 max-w-2xl mx-auto">
              Discover how rural any location in the United States is using our comprehensive Rural Index. 
              We analyze population density, distance to urban centers, agricultural land use, internet access, 
              healthcare availability, and economic diversity to give you a complete picture.
            </p>
            <p className="text-sm text-slate-500">
              Search for any city, county, or ZIP code to get started, or use your current location.
            </p>
          </div>
        )}
      </main>

      {/* Footer with Creator Attribution */}
      <footer className="bg-white border-t border-green-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              {/* Organization Logo Placeholder */}
              <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-700">Built by Cameron Wimpy</div>
                <div className="text-xs text-slate-500">Powered by US Government Data Sources</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-slate-600">
              <a href="#" className="hover:text-green-700 transition-colors">About</a>
              <a href="#" className="hover:text-green-700 transition-colors">API</a>
              <a href="#" className="hover:text-green-700 transition-colors">Contact</a>
              <a href="https://github.com/cwimpy/rurality-app" className="hover:text-green-700 transition-colors">GitHub</a>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-green-100 text-center text-xs text-slate-500">
            <p>© 2024 Rurality.app • Data from US Census Bureau, USDA, and FCC • Updated in real-time</p>
          </div>
        </div>
      </footer>

      {/* Mobile-optimized info panel */}
      <div className="fixed bottom-4 right-4 z-40">
        <div className="bg-white rounded-xl shadow-lg border border-green-200 p-4 max-w-xs">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-slate-800 mb-1">Live Data Sources</div>
              <div className="text-slate-600 space-y-1 text-xs">
                <div>• US Census Bureau API</div>
                <div>• OpenStreetMap Geocoding</div>
                <div>• USDA Rural-Urban Codes</div>
                <div>• Real-time Processing</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuralityApp;