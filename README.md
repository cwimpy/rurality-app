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
- GPS-powered current location detection
- Real-time geocoding with OpenStreetMap

### 📊 **Evidence-Based Rural Index**
Our methodology builds on the **USDA Rural-Urban Continuum Codes** (the federal gold standard) enhanced with real-time data:
- **USDA Classification (50%)** - Official federal rurality codes
- **Population Density (25%)** - People per square mile from US Census
- **Distance to Metro Areas (15%)** - Calculated proximity to cities of various sizes
- **Broadband Access (10%)** - Internet availability when data is available

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
- **USDA Economic Research Service** - Rural-Urban Continuum Codes (2013)
- **US Census Bureau API** - Population and demographic data (2022)
- **US Census Bureau** - Metropolitan Statistical Areas (2020)
- **FCC Broadband Data Collection** - County-level coverage at ≥100/20 Mbps (J25 filing, June 2025)
- **OpenStreetMap Nominatim** - Free geocoding service

All sources are cited in [METHODOLOGY.md](METHODOLOGY.md)

### Deployment
- **Vercel** - Serverless deployment platform
- **GitHub Actions** - Automated CI/CD

## 📊 Rural Index Methodology

The Rural Index Score (0-100) uses a **hybrid approach** that prioritizes official federal classifications:

```
Rural Index = (USDA RUCC × 0.50) +
              (Population Density × 0.25) +
              (Distance to Metros × 0.15) +
              (Broadband Access × 0.10)*

* When broadband data unavailable, weight redistributes to other factors
```

**Why this approach?**
- **USDA RUCC** is the federal government's official rurality measure, developed by researchers and used for policy
- We enhance it with granular, real-time data for more detailed insights
- All data sources are cited, all calculations are transparent
- No placeholder or fabricated data

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
- [x] USDA Rural-Urban Continuum Codes integration
- [x] US Census Bureau API integration
- [x] Evidence-based calculation methodology
- [ ] Complete RUCC database (all 3,142 counties)
- [x] FCC broadband integration (BDC, ≥100/20 Mbps, county-level)
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