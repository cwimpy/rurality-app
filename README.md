# 🌾 Rurality.app

**Discover how rural any location in the United States is using comprehensive data analysis.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-rurality.app-green)](https://rurality.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://reactjs.org/)

## 🎯 What is Rurality.app?

Rurality.app provides a comprehensive **Rural Index Score** for any location in the United States by analyzing multiple data sources and factors that define rural vs. urban characteristics. Whether you're a researcher, policy maker, real estate professional, or just curious about your hometown, Rurality.app gives you data-driven insights into the rural nature of any place.

## ✨ Features

### 🔍 **Smart Location Analysis**
- Search any city, county, or ZIP code in the US
- Same-name disambiguation — 422 county names are shared across states, so a
  bare "Washington County" (31 matches) prompts you to choose instead of
  silently resolving to one of them
- Local county typeahead: all 3,235 counties matched in-browser, no request per keystroke
- GPS-powered current location detection
- Real-time geocoding with OpenStreetMap

### 📊 **Evidence-Based Rural Index**
Our methodology builds on official USDA classifications (the federal gold standard) enhanced with real-time data. The interactive score is anchored on **USDA RUCA 2020** (ZCTA-level), with weights that adapt to data availability:
- **USDA RUCA code (up to 50%)** - Official federal Rural-Urban Commuting Area classification (ZCTA-level)
- **Population Density (25%)** - People per square mile from US Census
- **Distance to Metro Areas (15%)** - Calculated proximity to cities of various sizes
- **Broadband Access (10%)** - FCC coverage at ≥100/20 Mbps, when available

*(The downloadable county dataset and R/Stata packages use a county-level, RUCC 2023–anchored variant — see [METHODOLOGY.md](METHODOLOGY.md).)*

[See detailed methodology](METHODOLOGY.md) with data sources and citations.

### 📈 **Historical Trends**
- 5-year historical rurality trends
- Identify changing rural/urban patterns
- Export trend data for research

### 🗺️ **Interactive Mapping**
- Real-time location mapping
- Rurality heat map overlays
- Multiple data layer views

### 🔄 **Location Comparison**
- Compare up to 5 locations side-by-side
- Detailed metric breakdowns
- Export comparison reports

### 📱 **Mobile-First Design**
- Responsive design for all devices
- Touch-optimized interface
- Offline capability (coming soon)

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Modern web browser

### Installation

```bash
# Clone the repository
git clone https://github.com/cwimpy/rurality-app.git
cd rurality-app

# Install dependencies
npm install

# Start development server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### Environment Variables (Optional)

Create a `.env` file for enhanced functionality:

```env
# US Census Bureau API Key (optional - increases rate limits)
REACT_APP_CENSUS_API_KEY=your_census_api_key

# Mapbox API Key (for advanced mapping features)
REACT_APP_MAPBOX_TOKEN=your_mapbox_token

# Google Places API (for enhanced geocoding)
REACT_APP_GOOGLE_PLACES_KEY=your_google_places_key
```

## 🏗️ Tech Stack

### Frontend
- **React 18** - Modern UI framework
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful icons
- **OpenStreetMap** - Free mapping service

### Data Sources
- **USDA Economic Research Service** - Rural-Urban Commuting Area Codes (RUCA 2020, ZCTA-level) — interactive-score anchor
- **USDA Economic Research Service** - Rural-Urban Continuum Codes (RUCC 2023, county-level) — county dataset anchor + displayed classification
- **US Census Bureau API** - Population and demographic data (ACS 2022, 5-year); TIGERweb current county boundaries and land area
- **US Census Bureau** - Metropolitan Statistical Areas (2020)
- **FCC Broadband Data Collection** - County-level coverage at ≥100/20 Mbps (J25 filing, June 2025)
- **OpenStreetMap Nominatim** - Free geocoding service

Rurality.app also **displays** eight independent official/peer rural measures alongside the score (USDA FAR & UIC, CDC NCHS, Kim & Waldorf IRR, NCES locale, HRSA FORHP, OMB CBSA, Census % urban) — these are shown for reference and are **not** inputs to the composite. See [METHODOLOGY.md](METHODOLOGY.md).

All sources are cited in [METHODOLOGY.md](METHODOLOGY.md)

### Deployment
- **Vercel** - Serverless deployment platform
- **GitHub Actions** - Automated CI/CD

## 📊 Rural Index Methodology

The Rural Index Score (0-100) uses a **hybrid approach** anchored on official USDA classifications. The interactive score is RUCA-based, with weights that adapt to data availability:

```
Rural Index = (USDA RUCA × 0.50) +
              (Population Density × 0.25) +
              (Distance to Metros × 0.15) +
              (Broadband Access × 0.10)*

* When broadband is unavailable → RUCA 0.55 / Density 0.25 / Distance 0.20.
  Other fallbacks apply when RUCA is unavailable — see METHODOLOGY.md.
```

**Why this approach?**
- **USDA RUCA** (2020) is an official federal rurality measure at ZCTA resolution — finer than county-level codes and sensitive to commuting ties
- We enhance it with granular, frequently updated data for more detailed insights
- All data sources are cited, all calculations are transparent
- No placeholder or fabricated data

> **Note:** the composite score is a **working draft pending peer review**; the underlying USDA (RUCA/RUCC) and Census data are official and usable independently.

### Score Classifications
- **80-100**: Very Rural 🌾
- **60-79**: Rural 🏞️
- **40-59**: Mixed 🏘️
- **20-39**: Suburban 🏡
- **0-19**: Urban 🏙️

**See [METHODOLOGY.md](METHODOLOGY.md) for complete details, data sources, and academic citations.**

## 🔧 Development

### Available Scripts

```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
rurality-app/
├── public/                    # Static assets
├── src/
│   ├── components/           # Reusable UI components
│   ├── data/                 # USDA codes, metro data
│   ├── services/             # API and calculation services
│   ├── utils/                # API utilities, rate limiting, caching
│   └── App.js                # Main application component
├── METHODOLOGY.md            # Detailed methodology documentation
├── DEPLOYMENT.md             # Deployment guide
└── PRODUCTION_READINESS.md   # Production checklist
```

## 🌍 API Documentation

### Rurality Score Endpoint (Coming Soon)

```javascript
// GET /api/rurality?location={location}
const response = await fetch('/api/rurality?location=Yellowstone County, MT');
const data = await response.json();

// Response format
{
  "location": "Yellowstone County, MT",
  "coordinates": { "lat": 45.7833, "lng": -108.5007 },
  "ruralityScore": 72,
  "classification": "Rural",
  "metrics": {
    "populationDensity": { "value": 37.2, "score": 85 },
    "distanceToUrban": { "value": 45, "score": 78 },
    // ... additional metrics
  },
  "lastUpdated": "2024-01-15T10:30:00Z"
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Areas We Need Help

- [ ] Additional data source integration
- [ ] Mobile app development (React Native)
- [ ] Advanced mapping features
- [ ] Data visualization improvements
- [ ] API rate limiting and caching
- [ ] Accessibility improvements

## 📈 Roadmap

### Phase 1: Foundation ✅
- [x] Basic UI and design
- [x] Location search functionality
- [x] Mock rurality calculations
- [x] Local development setup

### Phase 2: Real Data Integration ✅
- [x] USDA RUCA 2020 integration (ZCTA-level, interactive-score anchor)
- [x] USDA RUCC 2023 integration (all 3,235 counties)
- [x] US Census Bureau API integration
- [x] Evidence-based calculation methodology
- [x] FCC broadband integration (BDC J25, ≥100/20 Mbps, county-level)
- [x] Eight displayed comparison measures (FAR, NCHS, UIC, IRR, NCES locale, FORHP, OMB CBSA, Census % urban)
- [ ] Historical trend data collection

### Phase 3: Advanced Features 📋
- [ ] User accounts and saved locations
- [ ] Advanced mapping with Mapbox
- [ ] PDF report generation
- [ ] API rate limiting and caching
- [ ] Mobile app development

### Phase 4: Scale & Polish 🎯
- [ ] Performance optimization
- [ ] Advanced analytics
- [ ] Enterprise features
- [ ] White-label solutions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **US Census Bureau** for providing comprehensive demographic data
- **USDA Economic Research Service** for rural-urban classification codes
- **OpenStreetMap** contributors for mapping data
- **React** and **Tailwind CSS** communities for excellent tools

## 📧 Contact

- **Website**: [rurality.app](https://rurality.app)
- **Issues**: [GitHub Issues](https://github.com/cwimpy/rurality-app/issues)
- **Email**: cwimpy@mac.com

---

**Built with ❤️ for rural communities and researchers everywhere.**