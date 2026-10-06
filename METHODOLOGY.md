# Rurality.app Methodology

## Overview

Rurality.app calculates a **Rural Index Score** (0–100) for any location in the United States using a transparent, evidence-based methodology that builds on official federal classifications.

**Higher scores = more rural** | **Lower scores = more urban**

> [!note] Working draft
> The composite Rural Index Score is a **working draft pending peer review** — the weights are currently judgment-based, not yet derived from a formal measurement model. The underlying USDA (RUCA, RUCC) and Census data are official and can be used independently. See *Roadmap: Toward a Validated Index* below.

**Methodology version:** 2.0
**Data vintages:** RUCA 2020 · RUCC 2023 · ACS 2022 (5-year) · FCC BDC J25 (June 2025)

---

## Our Approach: A Hybrid Model Anchored on Federal Classifications

Rather than invent a new classification system, Rurality.app builds on the U.S. Department of Agriculture's official rural measures — the standards used by researchers, policymakers, and federal agencies for decades — and enhances them with more granular, more frequently updated data.

Two USDA measures do different jobs in the app:

- **RUCA (Rural-Urban Commuting Area codes, 2020)** — a **ZCTA-level** classification based on population density, urbanization, and daily commuting flows. Because the interactive app geocodes an address to a ZIP/ZCTA, RUCA is the **primary federal anchor in the live composite score.**
- **RUCC (Rural-Urban Continuum Codes, 2023)** — a **county-level** classification based on metro-area population and metro adjacency. RUCC is shown as an official displayed classification (county choropleth, OMB designation, "Places Like This") and is the anchor used in the **bulk county-level dataset** (`county_rurality.csv`) that feeds the companion R and Stata packages.

This split matters: the **interactive score is RUCA-based** (ZCTA granularity), while the **downloadable county dataset is RUCC-based** (county granularity). Both are documented below.

---

## Score Components & Weights (Interactive App)

The live composite score adapts its weights to the data available for a location. The four scenarios below match `src/services/ruralityCalculator.js` exactly.

| Scenario | RUCA | Density | Distance | Broadband | Confidence |
|---|---:|---:|---:|---:|---|
| **Full data** (RUCA + broadband) | 50% | 25% | 15% | 10% | High |
| **RUCA only** (no broadband) | 55% | 25% | 20% | — | Medium-high |
| **Broadband, no RUCA** | — | 50% | 25% | 25% | Medium |
| **Density + distance only** | — | 55% | 45% | — | Medium |

When a factor is unavailable, its weight is redistributed to the remaining factors as shown — never filled with placeholder data.

---

### 1. USDA Rural-Urban Commuting Area Code — RUCA (up to 50% weight)

**What it is:** Official federal classification of **ZIP Code Tabulation Areas (ZCTAs)** based on population density, urbanization, and daily commuting flows.

**Source:** USDA Economic Research Service, RUCA 2020 (based on 2020 Census and ACS commuting-flow data)
**Coverage:** 41,146 ZCTAs
**Granularity:** Sub-county (ZCTA) — finer than county-level RUCC
**Lookup:** Address → ZIP/ZCTA (geocoder) → RUCA code

**RUCA codes and index scores:**

| Code | Classification | Score |
|---|---|---:|
| 1 | Metropolitan area core | 8 |
| 2 | Metropolitan area — high commuting | 15 |
| 3 | Metropolitan area — low commuting | 24 |
| 4 | Micropolitan (small city) core | 38 |
| 5 | Micropolitan area — high commuting | 48 |
| 6 | Micropolitan area — low commuting | 56 |
| 7 | Small town core | 68 |
| 8 | Small town — high commuting | 76 |
| 9 | Small town — low commuting | 84 |
| 10 | Rural — no significant urban commuting | 95 |

Codes 4+ are treated as "officially rural."

**Why RUCA as the interactive anchor:** it captures commuting relationships (functional economic ties to urban cores) at sub-county resolution, which better reflects an individual address than a single county-wide code.

**Limitation:** Requires a resolvable ZCTA; ties rurality to commuting flows, which can lag rapid local change.

---

### 2. Population Density (25% weight)

**What it is:** People per square mile.

**Source:** US Census Bureau, American Community Survey 5-year estimates (2022); land area from Census TIGERweb (current county boundaries)
**Update frequency:** Annual

**Scoring (logarithmic):**
```
Score = 100 - (log10(max(1, density)) × 25)

  1 person/sq mi    → 100   (very rural)
 10 people/sq mi    →  75   (rural)
100 people/sq mi    →  50   (mixed)
1,000/sq mi         →  25   (suburban)
10,000+/sq mi       →   0   (urban)
```

Density is floored at 1/sq mi to avoid `log10` of zero/negatives. A logarithmic scale keeps extremely dense urban areas from dominating the composite.

---

### 3. Distance to Metropolitan Areas (15% weight)

**What it is:** Great-circle (Haversine) distance to the nearest metro areas of three size tiers.

**Source:** Metro locations from Census metro definitions; distances computed with the Haversine formula.

**Scoring:**
```
Distance Score = 0.5 × min(100, dist_large / 3)
               + 0.3 × min(100, dist_medium / 2)
               + 0.2 × min(100, dist_small / 1)
```
where `dist_large`, `dist_medium`, `dist_small` are miles to the nearest large, medium, and small metro respectively.

**Why:** captures the exurban-vs-truly-remote distinction that a binary metro/nonmetro flag misses.

---

### 4. Broadband Access (10% weight, when available)

**What it is:** Share of residential broadband-serviceable locations with service — scored so that *lower* availability raises the rurality score.

**Source:** FCC **Broadband Data Collection (BDC)**, **J25 filing (data as of June 30, 2025; published April 14, 2026)**
**Threshold:** ≥ **100/20 Mbps** (the current FCC benchmark, raised from 25/3 in March 2024)
**Definition:** Percent of residential **broadband-serviceable locations (BSLs)** with at least one provider offering ≥100/20 Mbps via **wired or licensed fixed-wireless** technology. **Satellite and unlicensed fixed wireless are excluded** to match the FCC's BEAD-eligibility footprint.
**Granularity:** County-level

**Scoring:**
```
Broadband Score = 100 - percent_served

 95% served → Score:  5  (urban)
 75% served → Score: 25  (suburban)
 50% served → Score: 50  (rural)
 25% served → Score: 75  (very rural)
```

**Why:** broadband availability is a federal rural-development priority and a proxy for economic opportunity and remote-work viability.

**Limitations to state plainly:** BDC availability is **provider-reported and historically overstates coverage**; the FCC challenge process and location fabric exist precisely because of that. This is a coarse, county-level, 10% signal — Rurality.app is a rurality index that *includes* a connectivity input, **not** a broadband-mapping tool. For authoritative broadband analysis, use location-level BDC data or specialized community-network datasets.

---

## Bulk County Dataset (`county_rurality.csv`)

The downloadable county file — and the companion **R (`rurality`, on CRAN)** and **Stata (`rurality-stata`)** packages — cannot resolve a sub-county ZCTA, so they use a **county-level, RUCC-anchored** composite:

**County CSV weights:** RUCC **55%** · density **28%** · distance **17%**

**RUCC 2023 codes and index scores:**

| Code | Classification | Score |
|---|---|---:|
| 1 | Metro — metro area of 1 million+ | 8 |
| 2 | Metro — metro area of 250,000–1 million | 18 |
| 3 | Metro — metro area of fewer than 250,000 | 28 |
| 4 | Nonmetro — urban 20,000+, adjacent to metro | 42 |
| 5 | Nonmetro — urban 20,000+, not adjacent | 52 |
| 6 | Nonmetro — urban 5,000–19,999, adjacent | 62 |
| 7 | Nonmetro — urban 5,000–19,999, not adjacent | 72 |
| 8 | Nonmetro — completely rural / <5,000 urban, adjacent | 82 |
| 9 | Nonmetro — completely rural / <5,000 urban, not adjacent | 92 |

**RUCC 2023 note:** the 2023 vintage (2020 Census basis, 3,235 counties) **raised the "urban area" population threshold from 2,500 to 5,000** to match the Census Bureau's 2020 urban-area redefinition — so codes 6–9 differ from the 2013 vintage.

---

## Displayed Classifications (Not Composite Inputs)

To serve as a public good, the app surfaces several independent official/peer rural measures **alongside** the score, with provenance and source links. These are **displayed only — they are NOT inputs to the composite score** (that decision is reserved for the validated-index work below):

| Measure | Vintage | Unit | Notes |
|---|---|---|---|
| USDA ERS **FAR** (Frontier and Remote) | 2020 | ZIP | Remoteness levels |
| CDC **NCHS** Urban-Rural | 2023 | County | 6-level health-research scheme |
| USDA ERS **UIC** (Urban Influence Codes) | 2024 | County | 9-category settlement structure |
| **IRR** (Index of Relative Rurality), Kim & Waldorf | 2020 | County | Continuous 0–1 (CC BY 4.0, Zenodo) |
| **NCES** EDGE Locale Codes | 2021 | ZCTA | 12-category City/Suburb/Town/Rural |
| HRSA **FORHP** rural grant-eligibility | 2024 | ZIP | Binary eligibility flag |
| **OMB** Metro–Micro Delineations (Bulletin 23-01) | Jul 2023 | County | Metro/micro/noncore + CBSA |
| Census **% urban population** | 2020 | County | Continuous 0–100 |

---

## Score Classifications

- **80–100:** Very Rural 🌾
- **60–79:** Rural 🏞️
- **40–59:** Mixed 🏘️
- **20–39:** Suburban 🏡
- **0–19:** Urban 🏙️

---

## What We Deliberately EXCLUDED (from the composite)

Rurality.app does not fabricate inputs. Where no honest, publicly queryable data source exists, the factor is left out rather than filled with placeholders:

- **Agricultural land use** — no real-time queryable API (USDA Census of Agriculture is download-only). Candidate for the validated index.
- **Healthcare facility density** — would require HRSA AHRF integration; population density is a partial proxy. (Note: the FORHP measure shown above is a grant-*eligibility* flag, not a facility-density measure.)
- **Economic diversity / employment mix** — no single clean metric; candidate for the validated index (ACS employment shares).
- **Commute-time distributions** — ambiguous signal (rural isolation vs. suburban sprawl).

---

## Data Sources & Citations

**Composite inputs**
1. **USDA ERS — Rural-Urban Commuting Area Codes (RUCA), 2020.** https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/
2. **USDA ERS — Rural-Urban Continuum Codes (RUCC), 2023.** https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/
3. **US Census Bureau — American Community Survey, 2022 (5-year).** https://www.census.gov/programs-surveys/acs
4. **US Census Bureau — TIGERweb, current counties** (coordinate-to-county lookup, boundaries and land area; Connecticut resolves to planning regions).
5. **Federal Communications Commission — Broadband Data Collection (BDC), J25 filing (June 2025).** https://broadbandmap.fcc.gov/data-download/nationwide-data

**Geocoding & live lookups**
6. **OpenStreetMap Nominatim** (geocoding); **FCC Area API** (fallback coordinate-to-county lookup when TIGERweb is unavailable).

**Displayed comparison measures:** USDA ERS FAR (2020), UIC (2024); CDC NCHS Urban-Rural (2023); Kim & Waldorf IRR (2020, Zenodo, CC BY 4.0); NCES EDGE Locale (2021); HRSA FORHP (2024); OMB Metro–Micro Delineations (Bulletin 23-01, Jul 2023); Census % urban population (2020).

---

## Validation & Known Edge Cases

**Alignment with USDA:** composite scores track the official RUCA/RUCC ordering — metro cores land Urban/Suburban, small towns land Mixed/Rural, remote areas land Very Rural.

**Known edge cases (intentional):**
1. **Low-density ZCTAs inside large metros** can score "more rural" than their metro label — reflecting lived space.
2. **College towns** can read more rural due to surrounding low density.
3. **Exurban areas** near major metros read as Mixed/Suburban — reflecting their dual character.

---

## Roadmap: Toward a Validated Index

The current weights are judgment-based. The plan to publish a peer-reviewed index:

1. **Formalize the measurement model** — PCA/CFA on the indicators across all counties; let factor loadings set the weights.
2. **Expand indicators** — broadband (done), agricultural land use, healthcare density, employment mix, commute times; keep those that load on a single rurality factor.
3. **Convergent validity** — correlate with RUCC, RUCA, NCHS, Census % urban, IRR.
4. **Discriminant validity** — show the index isn't reducible to density, income, or poverty.
5. **Criterion validity** — test prediction of health-access and election-administration outcomes.
6. **The paper** — construction, validation, application, distribution.

---

## Limitations & Transparency

**What we do**
- ✅ Anchor on official federal classifications (RUCA/RUCC)
- ✅ Cite every source; show every weight and formula
- ✅ Use no placeholder or fabricated data
- ✅ Report confidence levels and redistribute weights transparently
- ✅ Surface independent official measures alongside the score

**What we don't do**
- ❌ Claim false precision when data is unavailable
- ❌ Mix real and simulated data
- ❌ Treat the working-draft composite as a settled federal standard
- ❌ Reduce rural culture, identity, or community to a single number

**Appropriate use**
- ✅ Research, exploratory analysis, and relative comparison of locations
- ✅ Communicating rurality with a transparent, cited score
- ❌ Federal funding eligibility — use the official USDA RUCA/RUCC directly
- ❌ A definitive answer to "what is rural"

---

## Academic Use

If you use Rurality.app in research, please cite the tool and the underlying federal data:

```
Wimpy, C. (2026). Rurality.app: A Hybrid Model for Measuring US Rurality.
https://rurality.app

USDA Economic Research Service. (2020). Rural-Urban Commuting Area Codes.
USDA Economic Research Service. (2023). Rural-Urban Continuum Codes.
https://www.ers.usda.gov/data-products/
```

Companion packages: **R** — `rurality` (CRAN); **Stata** — `rurality-stata`.

---

## Contact & Feedback

- Email: cwimpy@mac.com
- GitHub: https://github.com/cwimpy/rurality-app/issues

---

**Methodology Version:** 2.0
**Last Updated:** 2026-07-24
**Data Vintages:** RUCA 2020 · RUCC 2023 · ACS 2022 (5-year) · FCC BDC J25 (June 2025)
