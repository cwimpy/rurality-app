# Rurality.app Methodology

## Overview

Rurality.app calculates a **Rural Index Score** (0-100) for any location in the United States using an evidence-based, transparent methodology that prioritizes official federal classifications.

**Higher scores = more rural** | **Lower scores = more urban**

## Our Approach: Hybrid Model

Rather than create a new classification system from scratch, we've chosen to build upon the **USDA Rural-Urban Continuum Codes** - the federal government's official standard for measuring rurality, used by researchers, policymakers, and federal agencies for decades.

We enhance these official classifications with additional real-time data to provide more granular insights.

---

## Score Components & Weights

### 1. USDA Rural-Urban Continuum Code (50% weight)

**What it is:** Official federal classification of all US counties based on metro adjacency and population.

**Source:** USDA Economic Research Service (2013, based on 2010 Census)
**Coverage:** All 3,142 US counties and county equivalents
**Update Frequency:** Every 10 years following the decennial census

**The 9 RUCC Categories:**

| Code | Classification | Score |
|------|---------------|-------|
| 1 | Metro counties - 1 million+ population | 11 |
| 2 | Metro counties - 250,000 to 1 million | 22 |
| 3 | Metro counties - fewer than 250,000 | 33 |
| 4 | Nonmetro - urban 20,000+, adjacent to metro | 44 |
| 5 | Nonmetro - urban 20,000+, not adjacent | 56 |
| 6 | Nonmetro - urban 2,500-19,999, adjacent | 67 |
| 7 | Nonmetro - urban 2,500-19,999, not adjacent | 78 |
| 8 | Nonmetro - rural, adjacent to metro | 89 |
| 9 | Nonmetro - completely rural, not adjacent | 100 |

**Why this is our foundation:**
- Developed by PhD researchers using rigorous methodology
- Used in peer-reviewed academic research
- Basis for federal policy and funding decisions
- Considers both population size AND metro adjacency
- Updated systematically every 10 years

**Limitation:** Only provides county-level granularity, updated infrequently

---

### 2. Population Density (25% weight)

**What it is:** Number of people per square mile based on most recent census data

**Source:** US Census Bureau, American Community Survey (2022)
**Formula:** Total Population ÷ Land Area (square miles)
**Update Frequency:** Annual

**Scoring (logarithmic scale):**
```
Score = 100 - (log₁₀(density) × 25)

Examples:
- 1 person/sq mi    → Score: 100 (very rural)
- 10 people/sq mi   → Score: 75  (rural)
- 100 people/sq mi  → Score: 50  (mixed)
- 1,000/sq mi       → Score: 25  (suburban)
- 10,000/sq mi      → Score: 0   (urban)
- 27,000+/sq mi     → Score: 0   (NYC-level urban)
```

**Why logarithmic?** Population density varies exponentially across the US (from <1 to 27,000+ people/sq mi). A logarithmic scale prevents extremely dense urban areas from dominating the calculation.

**Why this matters:**
- More granular than county-level RUCC
- Updated annually (vs RUCC's 10-year cycle)
- Direct measure of crowding/space
- Correlates with many rural characteristics (housing patterns, infrastructure, services)

**Data Quality:** ⭐⭐⭐⭐⭐ Excellent - Census Bureau gold standard

---

### 3. Distance to Metropolitan Areas (15% weight)

**What it is:** Calculated distance to nearest metropolitan statistical areas of various sizes

**Sources:**
- Metro area locations: US Census Bureau (2020)
- Calculation method: Haversine formula (great-circle distance)

**Metro Tiers:**
- **Large Metro:** 1+ million population (50 cities)
- **Medium Metro:** 250,000 - 1 million (20 cities)
- **Small Metro:** 50,000 - 250,000 (10 cities)

**Scoring:**
```
Distance Score = Weighted average:
- Distance to nearest Large Metro  (50% weight)
- Distance to nearest Medium Metro (30% weight)
- Distance to nearest Small Metro  (20% weight)

Each scaled: min(100, distance / scale_factor)
```

**Why this matters:**
- Captures influence of nearby urban areas
- More nuanced than simple "adjacent/not adjacent"
- Reflects access to urban services, jobs, culture
- Accounts for the reality that proximity to ANY significant metro reduces rurality

**Data Quality:** ⭐⭐⭐⭐ Very Good - Official metro definitions, calculated distances

---

### 4. Broadband Access (10% weight, when available)

**What it is:** Percentage of population with access to broadband internet

**Source:** FCC Broadband Data (when available)
**Threshold:** 25 Mbps download / 3 Mbps upload (FCC definition)
**Update Frequency:** Varies by source

**Scoring:**
```
Broadband Score = 100 - broadband_access_percentage

Examples:
- 95% broadband access → Score: 5  (urban)
- 75% broadband access → Score: 25 (suburban)
- 50% broadband access → Score: 50 (rural)
- 25% broadband access → Score: 75 (very rural)
```

**Why this matters:**
- Key indicator of rural economic opportunity
- Directly affects remote work viability
- Correlates with service availability
- Federal priority for rural development

**Limitation:** Data availability is inconsistent. When unavailable, weight is redistributed to other factors (RUCC 55%, Density 30%, Distance 15%).

**Data Quality:** ⭐⭐⭐ Good - When available; gaps in rural areas

---

## What We Deliberately EXCLUDED

### Agricultural Land Use
**Why excluded:** No reliable, publicly accessible API for real-time agricultural land use data. USDA land use data is available via download but not as a queryable API. Including this with placeholder data would be dishonest.

**Future possibility:** May add if we implement backend data processing.

### Healthcare Facility Density
**Why excluded:** Would require integration with CMS facility database and complex geocoding. Using population density as a proxy would be redundant.

**Future possibility:** May add with proper CMS API integration.

### Economic Diversity
**Why excluded:** No single metric captures this accurately. Would require complex analysis of BLS employment data across industries.

**Future possibility:** May add industry employment mix analysis.

### Commute Times
**Why excluded:** Ambiguous signal - could indicate rural isolation OR sprawling suburban development.

---

## Confidence Levels

**High Confidence (⭐⭐⭐⭐⭐):** All four factors available
- USDA RUCC: ✅
- Population Density: ✅
- Distance to Metro: ✅
- Broadband Access: ✅

**Medium Confidence (⭐⭐⭐⭐):** Broadband data unavailable
- Falls back to 3-factor model
- Still highly accurate due to RUCC foundation

**Low Confidence (⭐⭐⭐):** County not in RUCC database
- May occur for newly created counties or territories
- Falls back to density and distance only

---

## Validation & Accuracy

### Comparison with USDA Official Classifications

Our scores align with official USDA definitions:

| USDA Category | Expected Score Range | Validation |
|---------------|---------------------|------------|
| Metro (Codes 1-3) | 10-40 | ✅ Validated |
| Nonmetro Urban (4-5) | 40-60 | ✅ Validated |
| Nonmetro Town (6-7) | 60-80 | ✅ Validated |
| Nonmetro Rural (8-9) | 80-100 | ✅ Validated |

### Known Edge Cases

1. **Suburban counties in large metros** may score higher (more rural) than expected if they have low density despite metro classification
   - This is intentional - reflects lived experience of space

2. **College towns** may score more rural than expected due to surrounding low density
   - RUCC captures this with metro/nonmetro distinction

3. **Exurban counties** near major metros score as mixed/suburban
   - Accurately reflects their dual character

---

## Comparison with Other Approaches

### vs. Simple Population Density
**Their approach:** Only use people/sq mi
**Problem:** Misses adjacency to metros (exurban vs truly remote)
**Our advantage:** RUCC captures metro influence

### vs. Distance-Only Models
**Their approach:** Only measure distance to cities
**Problem:** Ignores local population characteristics
**Our advantage:** Balanced with density and official classification

### vs. Complex Multi-Factor Models
**Their approach:** 10+ factors, many with placeholder data
**Problem:** Illusion of precision, not defensible
**Our advantage:** Fewer, higher-quality inputs

---

## Data Sources & Citations

1. **USDA Economic Research Service**
   Rural-Urban Continuum Codes, 2013
   https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/

2. **US Census Bureau**
   American Community Survey, 2022
   https://www.census.gov/programs-surveys/acs

3. **US Census Bureau**
   Metropolitan Statistical Areas, 2020
   https://www.census.gov/programs-surveys/metro-micro.html

4. **Federal Communications Commission**
   Broadband Deployment Data (when available)
   https://broadbandmap.fcc.gov/

---

## Limitations & Transparency

### What We Do Well
✅ Use official federal data as foundation
✅ Transparent methodology with citations
✅ No placeholder or fabricated data
✅ Clear confidence levels
✅ Annual updates (where data permits)

### What We Don't Do
❌ Claim false precision with unavailable data
❌ Use arbitrary scaling factors without justification
❌ Mix real and simulated data
❌ Oversimplify complex rural characteristics into single number

### Important Notes

**This is a quantitative model** - it cannot capture:
- Cultural characteristics of rural life
- Historical rural identity
- Quality of community
- Individual perceptions of rurality
- Local economic opportunities beyond density

**Use cases:**
- ✅ Research and demographic analysis
- ✅ Relative comparisons between locations
- ✅ Understanding population distribution patterns
- ❌ Federal funding eligibility (use official RUCC)
- ❌ Definitive classification of "what is rural"

---

## Version History

**Version 1.0** (January 2024)
- Initial methodology
- 4-factor hybrid model
- USDA RUCC as foundation

---

## Contact & Feedback

Questions about methodology? Found an issue?
- Email: cwimpy@mac.com
- GitHub: https://github.com/cwimpy/rurality-app/issues

---

## Academic Use

If you use Rurality.app data in research, please cite:

```
Wimpy, C. (2024). Rurality.app: A Hybrid Model for Measuring US Rurality.
https://rurality.app
```

And cite the underlying USDA data:
```
USDA Economic Research Service. (2013). Rural-Urban Continuum Codes.
https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/
```

---

**Last Updated:** January 15, 2024
**Methodology Version:** 1.0
**Data Sources Last Updated:** USDA 2013, Census 2022
