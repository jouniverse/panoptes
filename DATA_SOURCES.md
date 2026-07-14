# Panoptes — Data Sources

This document lists **data sources used by the running application**, grouped by **view → section → layer or feature**. It is the canonical reference for provenance and maintenance.

See also **[`README.md`](README.md)** for setup, data pipeline, and deployment.

**Legend**

| Column           | Meaning                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Runtime file** | Path served to the app (`public/geo/`, `public/data/`, or API route)                   |
| **Build input**  | File under `static-data/` used by `npm run geo:build` (if applicable)                  |
| **Upstream**     | Original provider URL or API docs — verify links manually where marked _(placeholder)_ |

Placeholders (`—`) mean the upstream URL was not confirmed in code; fill in after checking `static-data/` provenance.

**Related scripts:** `npm run geo:build` · `npm run analytics:cache` · `npm run tles:fetch` · `npm run ais:relay`

---

## Geospatial view

Layers are defined in [`src/config/layer-registry.ts`](src/config/layer-registry.ts). Static layers are fetched from `/geo/<file>.geojson`. API/worker layers use `/api/<route>` or client workers.

### Conflict & Violence

#### Historical Conflicts

|                  |                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Description**  | Militarized interstate disputes & incidents (COW MIDLOC 2.1, 1816–2014). Overlapping coordinates are ring-jittered. |
| **Runtime file** | `public/geo/historical-conflicts.geojson`                                                                           |
| **Build input**  | `static-data/cow/historical-conflicts.geojson`                                                                      |
| **Upstream**     | [Correlates of War (COW)](https://correlatesofwar.org/data-sets/midloc/) · MIDLOC v2.1 \_                           |

#### Water Conflicts

|                  |                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **Description**  | Historical and current water-related conflicts (Pacific Institute chronology).                   |
| **Runtime file** | `public/geo/water-conflicts.geojson`                                                             |
| **Build input**  | `static-data/water-conflicts/water-conflicts.csv`                                                |
| **Upstream**     | [World Water Conflict Chronology](https://www.worldwater.org/data-licensing-and-commercial-use/) |

#### Conflict Events (media)

|                 |                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Description** | Media-reported battle/attack/airstrike clusters (GDELT, ~24h). OSINT media signal — not verified events.                                               |
| **API route**   | `/api/gdelt`                                                                                                                                           |
| **Upstream**    | [GDELT Project GeoJSON API](https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/) · `https://api.gdeltproject.org/api/v1/gkg_geojson` |

---

### Military & Strategic

#### Military Bases

|                  |                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Description**  | US and global military installations (merged US Base Project + OSINT base map).                                                            |
| **Runtime file** | `public/geo/military-bases.geojson`                                                                                                        |
| **Build input**  | `static-data/military-bases/all-military-bases.geojson`                                                                                    |
| **Upstream**     | [US Base Project](https://usbaseproject.com/data/) · [OSINT Military Base Map](https://sites.google.com/view/osintmilitarymap/?utm_source) |

#### Missile Silos

|                  |                                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| **Description**  | Known missile silo / ICBM-related sites (community OSINT compilation). |
| **Runtime file** | `public/geo/missile-silos.geojson`                                     |
| **Build input**  | `static-data/nuclear-missile/missile-sites.geojson`                    |
| **Upstream**     | Wikipedia                                                              |

#### Nuclear Test Sites

|                  |                                                               |
| ---------------- | ------------------------------------------------------------- |
| **Description**  | Historical nuclear weapon test locations.                     |
| **Runtime file** | `public/geo/nuclear-test-sites.geojson`                       |
| **Build input**  | `static-data/nuclear-missile/nuclear-bomb-test-sites.geojson` |
| **Upstream**     | Wikipedia                                                     |

---

### Aviation

#### Military Airports

|                  |                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Description**  | Military airfields worldwide (OurAirports). METAR/SIGMET in detail panel when ICAO available.                         |
| **Runtime file** | `public/geo/military-airports.geojson`                                                                                |
| **Build input**  | `static-data/airports/military-airports.geojson`                                                                      |
| **Upstream**     | [OurAirports](https://ourairports.com/data/) · [GitHub data repo](https://github.com/davidmegginson/ourairports-data) |

#### Military Flights

|                 |                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description** | Live military ADS-B (IntelSky + adsb.lol), registry-enriched; optional OpenSky gap-fill.                                                                                                                                                                                                                                                                                               |
| **API route**   | `/api/flights`                                                                                                                                                                                                                                                                                                                                                                         |
| **Upstream**    | [adsb.lol API](https://api.adsb.lol/docs) · [IntelSky](https://intelsky.org/api-docs.php) · [OpenSky Network API](https://openskynetwork.github.io/opensky-api/rest.html) · Military aircraft registry (filtered from [aircraftDatabase](https://opensky-network.org/datasets/#metadata/)): `static-data/aircraft/military-aircraft.json` → `src/data/military-aircraft-registry.json` |

_NOTE: Terrestrial ADS-B receivers can track aircraft within a "radio line of sight," which typically maxes out between 150 to 250 nautical miles (278 to 463 km) from the ground station, largely constrained by Earth's curvature. There may be some false positives in the data, due to the fact that some civilian airlines use a military hex range. The same actors are also known to use civilian livery for military aircraft (e.g. Qatar Airways)._

**Detail panel extras (API)**

| Feature          | API route                  | Upstream                                                         |
| ---------------- | -------------------------- | ---------------------------------------------------------------- |
| METAR            | `/api/metar?icao=`         | [NOAA AWC API](https://aviationweather.gov/data/api/)            |
| SIGMET / ISIGMET | `/api/isigmet`             | [NOAA AWC API](https://aviationweather.gov/data/api/)            |
| Aircraft photo   | `/api/aircraft-photo?hex=` | [Planespotters.net API](https://www.planespotters.net/photo/api) |

---

### Maritime

#### Maritime AIS

|                 |                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description** | Live vessel positions via AISStream; military watchlist + cargo/tanker classification.                                                      |
| **Transport**   | Local relay `npm run ais:relay` → WebSocket; fallback `/api/vessels`                                                                        |
| **Watchlist**   | `public/data/military-vessels-watchlist.json`                                                                                               |
| **Upstream**    | [AISStream.io](https://aisstream.io/documentation) · Watchlist compiled from `static-data/military-vessels/military-vessels-watchlist.json` |

_NOTE: Terrestrial Automatic Identification System (AIS) has a maximum effective range of roughly 20 to 40 nautical miles (approximately 37 to 74 km) from the coast or another vessel. Because it relies on VHF radio frequencies, its coverage is strictly limited by the Earth's curvature (line-of-sight)._

#### Maritime Alerts

|                 |                                                                                  |
| --------------- | -------------------------------------------------------------------------------- |
| **Description** | In-force NGA navigational warnings (DailyMem bulletins, parsed from plain text). |
| **API route**   | `/api/maritime-alerts`                                                           |
| **Upstream**    | [NGA Maritime Safety Information](https://msi.nga.mil/NavWarnings)               |

#### Major Ports

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **Description**  | World Port Index — major harbors.                            |
| **Runtime file** | `public/geo/major-ports.geojson`                             |
| **Build input**  | `static-data/major-ports/major-ports.geojson`                |
| **Upstream**     | [NGA World Port Index](https://msi.nga.mil/Publications/WPI) |

#### Major Rivers

|                  |                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Description**  | Major navigable rivers and waterways (Natural Earth, scalerank ≤ 6).                          |
| **Runtime file** | `public/geo/rivers.geojson`                                                                   |
| **Build input**  | `static-data/rivers/rivers.geojson`                                                           |
| **Upstream**     | [Natural Earth](https://www.quickmaptools.com/download-natural-earth/rivers_lake_centerlines) |

---

### Space & Orbital

#### Government & Military Satellites

|                 |                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description** | Live-propagated orbital positions from TLEs; UCS metadata for detail panel.                                                                                                                                                                                            |
| **API route**   | `/api/satellites?group=gov-military`                                                                                                                                                                                                                                   |
| **Cache**       | `public/data/gov-military-tles.json`                                                                                                                                                                                                                                   |
| **Metadata**    | `src/data/military-norad-ids.json`, `src/data/military-satellites-meta.json`                                                                                                                                                                                           |
| **Upstream**    | [Space-Track.org](https://www.space-track.org/) (primary, credentialed) · [CelesTrak](https://celestrak.org/) (fallback) · [UCS Satellite Database](https://www.ucsusa.org/resources/satellite-database) filtered to `static-data/government+military-satellites.json` |

---

### Critical Infrastructure

#### Submarine Cables

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Description**  | Global submarine cable routes.                                                                         |
| **Runtime file** | `public/geo/submarine-cables.geojson`                                                                  |
| **Build input**  | `static-data/submarine-cables/submarine-cables.json`                                                   |
| **Upstream**     | [TeleGeography Submarine Cable Map API](https://www.submarinecablemap.com/api/v3/cable/cable-geo.json) |

#### Data Centers

|                  |                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Description**  | Global data-center facilities; overlapping city centroids ring-jittered for visibility. |
| **Runtime file** | `public/geo/data-centers.geojson`                                                       |
| **Build input**  | `static-data/data-centers/datacenters.geojson`                                          |
| **Upstream**     | [Global Data Center Map (GitHub)](https://github.com/Ringmast4r/Global-Data-Center-Map) |

_NOTE: Exact location of data centers is not always available. Street level and city center accuracy is sometimes used._

#### Dams & Reservoirs

|                  |                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Description**  | Large dams (GRanD / Global Dam Watch).                                                                       |
| **Runtime file** | `public/geo/dams.geojson`                                                                                    |
| **Build input**  | `static-data/dams-and-reservoirs/dams.geojson`                                                               |
| **Upstream**     | [GRanD/GWSP](https://ln.sync.com/dl/bd47eb6b0/anhxaikr-62pmrgtq-k44xf84f-pyz4atkm/view/default/447819520013) |

#### Launch & Spaceports

|                  |                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Description**  | Rocket launch sites and spaceports (compiled).                                             |
| **Runtime file** | `public/geo/launch-sites.geojson`                                                          |
| **Build input**  | `static-data/launch-sites/all-launch-sites.json`                                           |
| **Upstream**     | Wikipedia · [Gunther's Space Page](https://space.skyrocket.de/directories/launchsites.htm) |

#### Railroads

|                  |                                                                                 |
| ---------------- | ------------------------------------------------------------------------------- |
| **Description**  | Global trunk rail network (Natural Earth, scalerank ≤ 6).                       |
| **Runtime file** | `public/geo/railroads.geojson`                                                  |
| **Build input**  | `static-data/railroads/railroads.geojson`                                       |
| **Upstream**     | [Natural Earth](https://www.quickmaptools.com/download-natural-earth/railroads) |

---

### Mineral Resources

#### Critical Minerals

|                  |                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Description**  | USGS critical mineral deposits and mines.                                             |
| **Runtime file** | `public/geo/critical-minerals.geojson`                                                |
| **Build input**  | `static-data/mines-and-mineral-deposits/critical-minerals-deposits-and-mines.geojson` |
| **Upstream**     | [USGS PP1802 / MRData](https://mrdata.usgs.gov/pp1802/)                               |

#### Mineral Deposits

|                  |                                                                   |
| ---------------- | ----------------------------------------------------------------- |
| **Description**  | USGS Mineral Resources Data System (MRDS) major deposits.         |
| **Runtime file** | `public/geo/mineral-deposits.geojson`                             |
| **Build input**  | `static-data/mines-and-mineral-deposits/mineral-deposits.geojson` |
| **Upstream**     | [USGS MRDS](https://mrdata.usgs.gov/major-deposits/)              |

#### Iron Ore Mines

|                  |                                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| **Description**  | Iron ore mines (Global Energy Monitor).                                |
| **Runtime file** | `public/geo/iron-ore-mines.geojson`                                    |
| **Build input**  | `static-data/gem/iron-and-steel/iron-ore-mines.geojson`                |
| **Upstream**     | [Global Energy Monitor](https://globalenergymonitor.org/download-data) |

#### Diamond Deposits / Gem Deposits

|                   |                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Description**   | [PRIO](https://www.prio.org) diamond and gemstone deposit datasets.                               |
| **Runtime files** | `public/geo/prio-diamonds.geojson`, `public/geo/prio-gems.geojson`                                |
| **Build input**   | `static-data/prio/diamonds.geojson`, `static-data/prio/gems.geojson`                              |
| **Upstream**      | Diamonds: [DIADATA](https://www.prio.org/data/10) · Gems: [GEMDATA](https://www.prio.org/data/25) |

---

### Oil & Gas

#### Undiscovered Oil & Gas

|                  |                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**  | USGS undiscovered oil and gas resource assessment areas.                                                                                                                                                                  |
| **Runtime file** | `public/geo/undiscovered-oil-gas.geojson`                                                                                                                                                                                 |
| **Build input**  | `static-data/undiscovered-oil-and-gas-resources/undiscovered-oil-and-gas-resources.geojson`                                                                                                                               |
| **Upstream**     | [USGS: An Estimate of Undiscovered Conventional Oil and Gas Resources of the World](https://pubs.usgs.gov/fs/2012/3042/) · [USGS: World Petroleum Assesment](https://energy.usgs.gov/world-energy/?resource=conventional) |

#### Oil & Gas Fields

|                  |                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Description**  | Operating oil and gas fields (GEM).                                                                             |
| **Runtime file** | `public/geo/og-fields.geojson`                                                                                  |
| **Build input**  | `static-data/oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-fields/field-level-data-gem.geojson` |
| **Upstream**     | [Global Energy Monitor](https://globalenergymonitor.org/download-data)                                          |

#### Gas Pipelines

|                  |                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**  | Operating gas pipelines (GEM GGIT).                                                                                                                       |
| **Runtime file** | `public/geo/gas-pipelines.geojson`                                                                                                                        |
| **Build input**  | `static-data/oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-pipelines/gas-pipelines-operating.geojson` (fallback: `gas-pipelines.geojson`) |
| **Upstream**     | [Global Energy Monitor](https://globalenergymonitor.org/download-data)                                                                                    |

#### Offshore Platforms

|                  |                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**  | Offshore oil/gas platforms (OGIM).                                                                                                                         |
| **Runtime file** | `public/geo/offshore-platforms.geojson`                                                                                                                    |
| **Build input**  | `static-data/oil-and-gas-infrastructure/oil-and-gas-aggregated/offshore-platforms/offshore-platforms.geojson`                                              |
| **Upstream**     | [OGIM](https://gee-community-catalog.org/projects/ogim/) · [US DoE](https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44) |

_NOTE: Current locations of mobile offshore platforms are available from [NGA MSI](https://msi.nga.mil/NavWarnings)_

#### LNG Terminals / Petroleum Terminals / Oil Refineries

|                   |                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime files** | `lng-terminals.geojson`, `petroleum-terminals.geojson`, `refineries.geojson`                                                                                                                                               |
| **Build input**   | `static-data/oil-and-gas-infrastructure/oil-and-gas-aggregated/lng-terminals/lng-terminals.geojson` · `.../petroleum-terminals/petroleum-terminals-ogim.geojson` · `.../crude-oil-refineries/crude-oil-refineries.geojson` |
| **Upstream**      | [OGIM](https://gee-community-catalog.org/projects/ogim/) · [US DoE](https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44) · [GEM](https://globalenergymonitor.org/download-data)          |

---

### Plants & Factories

#### Power Plants (≥20 MW)

|                  |                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Description**  | Global Power Plant Database (WRI).                                                           |
| **Runtime file** | `public/geo/power-plants.geojson`                                                            |
| **Build input**  | `static-data/power-plants/global-power-plants-database.geojson`                              |
| **Upstream**     | [WRI Global Power Plant Database](https://datasets.wri.org/dataset/globalpowerplantdatabase) |

#### Nuclear Power Plants

|                  |                                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| **Description**  | Nuclear power reactors (GEM).                                          |
| **Runtime file** | `public/geo/nuclear-power-plants.geojson`                              |
| **Build input**  | `static-data/gem/nuclear/nuclear-power-plants.geojson`                 |
| **Upstream**     | [Global Energy Monitor](https://globalenergymonitor.org/download-data) |

#### Iron & Steel Plants / Ammonia Plants

|                   |                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Runtime files** | `iron-steel-plants.geojson`, `ammonia-plants.geojson`                                                                         |
| **Build input**   | `static-data/gem/iron-and-steel/iron-and-steel-plants.geojson` · `static-data/gem/chemicals/ammonia-producing-plants.geojson` |
| **Upstream**      | [Global Energy Monitor](https://globalenergymonitor.org/download-data)                                                        |

---

### Hazards & Weak Signals

#### Earthquakes

|                 |                                                                                        |
| --------------- | -------------------------------------------------------------------------------------- |
| **Description** | M2.5+ events, USGS 7-day feed; 1d/7d client filter.                                    |
| **API route**   | `/api/earthquakes`                                                                     |
| **Upstream**    | [USGS Earthquake Feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) |

#### Major Earthquakes

|                 |                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Description** | USGS “significant” earthquakes, 7-day window.                                                                      |
| **API route**   | `/api/earthquakes-significant`                                                                                     |
| **Upstream**    | [USGS Significant Events Feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson) |

#### Active Fires (thermal)

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| **Description** | VIIRS active fire detections, last 24h (requires `NASA_FIRMS_MAP_KEY`). |
| **API route**   | `/api/fires`                                                            |
| **Upstream**    | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/)                 |

---

### Humanitarian

#### Disaster Events

|                 |                                                                                 |
| --------------- | ------------------------------------------------------------------------------- |
| **Description** | Active humanitarian disasters (ReliefWeb).                                      |
| **API route**   | `/api/reliefweb`                                                                |
| **Upstream**    | [ReliefWeb API](https://reliefweb.int/help/api) · requires `RELIEFWEB_APP_NAME` |

---

### Information Environment

#### Internet Outages

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Description** | Traffic anomalies and outages (Cloudflare Radar).                                                  |
| **API route**   | `/api/outages`                                                                                     |
| **Upstream**    | [Cloudflare Radar API](https://developers.cloudflare.com/radar/) · requires `CLOUDFLARE_API_TOKEN` |

---

### Reference & Context

#### Country Borders

|                  |                                                            |
| ---------------- | ---------------------------------------------------------- |
| **Description**  | Admin-0 country boundaries.                                |
| **Runtime file** | `public/geo/country-borders.geojson`                       |
| **Build input**  | `static-data/country-maps-geojson/countries.geojson`       |
| **Upstream**     | [geo-countries](https://github.com/datasets/geo-countries) |

#### Populated Places

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| **Description**  | Major cities and towns (Natural Earth).                               |
| **Runtime file** | `public/geo/populated-places.geojson`                                 |
| **Build input**  | `static-data/populated-places/populated-places-simple.geojson`        |
| **Upstream**     | [Natural Earth - Populated Places](https://www.naturalearthdata.com/) |

#### Urban Areas

|                  |                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Runtime file** | `public/geo/urban-areas.geojson`                                                                |
| **Build input**  | `static-data/urban-areas/urban-areas.geojson`                                                   |
| **Upstream**     | [Natural Earth - Urban Areas](https://www.quickmaptools.com/download-natural-earth/urban_areas) |

#### Volcanoes

|                  |                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Description**  | Holocene volcanoes (Smithsonian GVP / USGS). Seismic / hazard / weak signal context.                                                 |
| **Runtime file** | `public/geo/volcanoes.geojson`                                                                                                       |
| **Build input**  | `static-data/volcanoes/volcanoes.geojson`                                                                                            |
| **Upstream**     | [USGS](https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP) · [Smithsonian Global Volcanism Program](https://volcano.si.edu/) |

#### Tectonic Boundaries

|                  |                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Runtime file** | `public/geo/tectonic-boundaries.geojson`                                                                  |
| **Build input**  | `static-data/tectonic-plates/tectonic-plates-boundaries.json`                                             |
| **Upstream**     | [tectonicplates - An updated digital model of plate boundaries](https://github.com/fraxen/tectonicplates) |

#### NAVAREA Zones

|                  |                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime file** | `public/geo/navareas.geojson`                                                                                                                |
| **Build input**  | `static-data/nga-alerts/navareas.geojson`                                                                                                    |
| **Upstream**     | [USCG: NAVAREA - Global Navigation Warning Areas](https://surie.maps.arcgis.com/home/item.html?id=161e115920164289af6d70130b3e8a1f#overview) |

#### Oil & Gas Basins

|                  |                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Runtime file** | `public/geo/og-basins.geojson`                                                                                             |
| **Build input**  | `static-data/oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-basins/oil-and-natural-gas-basins-ogim.geojson` |
| **Upstream**     | [OGIM](https://gee-community-catalog.org/projects/ogim/)                                                                   |

---

## Analytics view

### Choropleth indices

| Index                                             | Source (build input under `static-data/`)                                             | Upstream                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPI** (Global Peace Index)                      | `global-indices/global-peace-and-terrorism-index/global-peace-index-2026-details.csv` | [Institute for Economics & Peace](https://www.visionofhumanity.org/maps/)                                                                                                                                         |
| **GTI** (Global Terrorism Index)                  | `global-indices/global-peace-and-terrorism-index/global-terrorism-index.csv`          | [Institute for Economics & Peace](https://www.visionofhumanity.org/maps/)                                                                                                                                         |
| **FSI** (Fragile States Index)                    | `fragile-states-index/fragile-states-index.csv`                                       | [Fragile States Index](https://fragilestatesindex.org/excel/)                                                                                                                                                     |
| **GHI** (Global Hunger Index)                     | `global-hunger-index/global-hunger-index-2025.csv`                                    | [Global Hunger Index](https://www.globalhungerindex.org/)                                                                                                                                                         |
| **GCI** (Global Cybersecurity Index)              | `global-indices/global-cybersecurity-index/global-cybersecurity-index.json`           | [ITU](https://www.itu.int/en/ITU-D/Cybersecurity/pages/global-cybersecurity-index.aspx) via [World Bank](https://data360.worldbank.org/en/dataset/ITU_GCI)                                                        |
| **CORPI** (Corruption Perceptions)                | `global-indices/corruption-perceptions-index/corruption-perceptions-index.json`       | [Transparency International](https://www.transparency.org/) via [Our World in Data](https://ourworldindata.org/grapher/ti-corruption-perception-index)                                                            |
| **HDI** (Human Development Index)                 | `global-indices/human-develpment-index/human-development-index.json`                  | [UNDP - HDI](https://hdr.undp.org/data-center/human-development-index#/indicies/HDI)                                                                                                                              |
| **SSI** (Safety & Security Index)                 | `global-indices/safety-and-security-index/safety-and-security-index.csv`              | [WEF](https://www.weforum.org/publications/travel-and-tourism-development-index-2021/in-full/endnotes/) via [World Bank](https://data360.worldbank.org/en/indicator/WEF_TTDI_TTDI_A_02?view=bar&recentYear=false) |
| **ACI** (ACLED Conflict Index)                    | `global-indices/conflict-index/conflict-index.json`                                   | [ACLED](https://acleddata.com/series/acled-conflict-index)                                                                                                                                                        |
| **CINC** (Composite Index of National Capability) | `cow/composite-index-of-national-capability.json`                                     | [Correlates of War (COW) - National Material Capabilities v7.0](https://correlatesofwar.org/data-sets/national-material-capabilities/)                                                                            |

**Runtime bundle:** `public/data/country-indicators.json` (from `npm run geo:build`)

**Country borders for map:** `public/geo/country-borders.geojson` (same as Geospatial)

### Country profile — macro time series

| Data                                                    | Runtime file                             | Upstream                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GDP, population, military expenditure, arms trade, etc. | `public/data/wb-country-indicators.json` | [SIPRI](https://www.sipri.org/databases/milex) via [World Bank](https://data360.worldbank.org/en/search?tab=all&pageNumber=1&itemsPerPage=20&sortBy=data_last_updated&order=desc&source=Stockholm+International+Peace+Research+Institute+%28SIPRI%29) · [World Bank Data360 API](https://data360.worldbank.org/) · `npm run analytics:cache` |
| CINC time series (chart)                                | `public/data/cow-cinc-series.json`       | `static-data/cow/composite-index-of-national-capability-time-series. csv` · [COW - National Material Capabilities v7.0](https://correlatesofwar.org/data-sets/national-material-capabilities/)                                                                                                                                               |
| Battle deaths (UCDP)                                    | `public/data/battle-deaths.json`         | `static-data/battle-deaths/ucdp-battle-deaths.csv` · [UCDP](https://ucdp.uu.se/)                                                                                                                                                                                                                                                             |
| Intentional homicides                                   | `public/data/homicides.json`             | `static-data/world-bank/intentional-homicides.csv` · [World Bank](https://data.worldbank.org/indicator/VC.IHR.PSRC.P5)                                                                                                                                                                                                                       |
| COW advanced arms (profile)                             | `public/data/cow-advanced-arms.json`     | `static-data/cow/advanced-arms-technologies.csv` · [COW - Arms Technology Data v1.1](https://correlatesofwar.org/data-sets/arms-technology-data-v1-0/)                                                                                                                                                                                       |

### Country profile — trade & resources text

| Data                                           | Runtime file                              | Upstream                                                    |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Natural resources, industries, exports/imports | `public/data/worldfactbook-profiles.json` | [worldfactbook.io API](https://worldfactbook.io/api-docs/)  |
| ISO → slug map                                 | `public/data/worldfactbook-slugs.json`    | Compiled from `static-data/country-codes/country-codes.csv` |

### Country profile — BIS / IMF (static)

| Data                    | API route         | Build input                                                            |
| ----------------------- | ----------------- | ---------------------------------------------------------------------- |
| BIS macro snippets      | `/api/macro?iso=` | `static-data/country-codes/macroeconomic-indicators/bis-countries.csv` |
| IMF balance of payments | `/api/macro?iso=` | `static-data/country-codes/macroeconomic-indicators/imf-bop.csv`       |

**Upstream:** [BIS](https://stats.bis.org/api-doc/v1/) · [IMF Data](https://data.imf.org/en/Resource-Pages/IMF-API)

### Optional Analytics API

| Feature                  | API route             | Upstream                                                               |
| ------------------------ | --------------------- | ---------------------------------------------------------------------- |
| HDX HAPI conflict events | `/api/hapi/conflicts` | [HDX HAPI](https://hapi.humdata.org/) · requires `HAPI_APP_IDENTIFIER` |

---

## OPS view

Panels in [`src/components/ops/OpsView.tsx`](src/components/ops/OpsView.tsx) (exported via [`src/components/views/OpsView.tsx`](src/components/views/OpsView.tsx)).

| Panel                         | Data source               | Route / transport                   | Upstream                                                                                                                                                          |
| ----------------------------- | ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Situational Awareness Map** | Military flights GeoJSON  | `/api/flights`                      | adsb.lol · IntelSky _(see Geospatial)_                                                                                                                            |
| **Details**                   | Selected feed item        | —                                   | —                                                                                                                                                                 |
| **Aviation // MIL ADS-B**     | Same as flights           | `/api/flights`                      | adsb.lol (see _Geospatial_)                                                                                                                                       |
| **Aviation News**             | Defense News RSS          | `/api/ops/aviation-news`            | [Defense News Air RSS](https://www.defensenews.com/arc/outboundfeeds/rss/category/air/?outputType=xml)                                                            |
| **Maritime // AIS**           | Live vessels              | AIS relay / `/api/vessels`          | AISStream.io (see _Geospatial_)                                                                                                                                   |
| **Maritime Alerts**           | NGA warnings              | `/api/maritime-alerts`              | NGA MSI (see _Geospatial_)                                                                                                                                        |
| **Naval News**                | Multi RSS                 | `/api/ops/naval-news`               | USNI, Naval News, HI Sutton, Naval Today, …                                                                                                                       |
| **Space // Orbital**          | Satellite TLE propagation | `/api/satellites` + worker          | Space-Track / CelesTrak (see _Geospatial_)                                                                                                                        |
| **Space News + Launches**     | RSS + Launch Library      | `/api/ops/space-news`               | [Defense News Space RSS](https://www.defensenews.com/arc/outboundfeeds/rss/category/space/?outputType=xml) · [Launch Library 2](https://ll.thespacedevs.com/docs) |
| **Space Weather**             | NOAA SWPC                 | `/api/ops/space-weather`            | [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/) · [SWPC Data Access](https://www.spaceweather.gov/content/data-access)                         |
| **News // Multi-perspective** | 6× world RSS              | `/api/news`                         | BBC, Al Jazeera, France 24, TASS, Global Times, Times of India                                                                                                    |
| **Economics & Finance**       | EIA + FRED + markets      | `/api/ops/eia` · `/api/ops/markets` | [EIA Open Data](https://www.eia.gov/opendata/) · [FRED API](https://fred.stlouisfed.org/docs/api/fred/) · Yahoo Finance _(unofficial, markets sub-panel)_         |
| **Trade & Supply Chain**      | FRED + UN Comtrade        | `/api/ops/trade`                    | [FRED](<(https://fred.stlouisfed.org/docs/api/fred/)>) · [UN Comtrade](https://comtradedeveloper.un.org/signin?returnUrl=%2F)                                     |
| **Source Health**             | Aggregated feed status    | —                                   | Internal health headers                                                                                                                                           |

---

## Tools view

### Map layers (toggleable)

Uses subset of Geospatial static layers — see [`src/config/tools-layers.ts`](src/config/tools-layers.ts):

| Layer              | Runtime file                            |
| ------------------ | --------------------------------------- |
| Country Borders    | `public/geo/country-borders.geojson`    |
| Missile Silos      | `public/geo/missile-silos.geojson`      |
| Nuclear Test Sites | `public/geo/nuclear-test-sites.geojson` |
| Military Bases     | `public/geo/military-bases.geojson`     |
| Military Airports  | `public/geo/military-airports.geojson`  |
| Major Ports        | `public/geo/major-ports.geojson`        |
| Power Plants       | `public/geo/power-plants.geojson`       |
| Populated Places   | `public/geo/populated-places.geojson`   |

### Asset picker (nuclear / missile analysis)

Additional static fetch for impact analysis dropdown:

| Asset type                                  | Runtime file                                     |
| ------------------------------------------- | ------------------------------------------------ |
| Military bases, ports, data centers, cities | Same GeoJSON as above (+ `data-centers.geojson`) |

### Models (no external live data)

| Tool                     | Basis                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nuclear detonation rings | Glasstone & Dolan scaling ([The Effects of Nuclear Weapons, US DoD/ERDA](https://www.deepspace.ucsb.edu/wp-content/uploads/2013/01/Effects-of-Nuclear-Weapons-1977-3rd-edition-complete.pdf)) |
| Missile trajectory       | Great-circle distance, preset range tables in `src/config/presets.ts`                                                                                                                         |

---

## Shared / supporting assets

| File                                          | Purpose                   | Source                                           |
| --------------------------------------------- | ------------------------- | ------------------------------------------------ |
| `src/data/country-centroids.json`             | Analytics / map centroids | Built from `country-borders`                     |
| `src/data/military-aircraft-registry.json`    | Flight hex → type/country | `static-data/aircraft/military-aircraft.json`    |
| `src/data/military-norad-ids.json`            | Gov/mil satellite filter  | UCS / compiled                                   |
| `src/data/military-satellites-meta.json`      | Satellite detail metadata | UCS Satellite Database                           |
| `public/data/military-vessels-watchlist.json` | AIS military watchlist    | `static-data/military-vessels/`                  |
| `public/data/gov-military-tles.json`          | Cached TLE bundle         | Space-Track / CelesTrak via `npm run tles:fetch` |

---

## Basemap

| Layer                 | Source                                      |
| --------------------- | ------------------------------------------- |
| Strategic dark raster | CARTO Dark Matter (via deck.gl / MapLibre)  |
| Satellite imagery     | Esri World Imagery (toggle in map controls) |

Optional: `NEXT_PUBLIC_BASEMAP_PMTILES_URL` for self-hosted Protomaps basemap.

---

## Maintenance

Panoptes v0.1 treats **committed files under `public/geo/` and `public/data/`** as the source of truth for static and analytics data. Live API routes refresh at runtime; everything in the table below requires a **manual script** (or scheduled CI).

### Update schedule by asset class

| Asset class                                                              | Output path(s)                                                        | Command                   | Suggested frequency                                              | Auto at runtime?                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Static GeoJSON map layers                                                | `public/geo/*.geojson`                                                | `npm run geo:build`       | When upstream sources change (varies by layer)                   | **No** — loaded once per session; some registry `cadence` values re-fetch the same static file harmlessly |
| Choropleth indices (GPI, GTI, FSI, …)                                    | `public/data/country-indicators.json`                                 | `npm run geo:build`       | When index CSVs/JSON in `static-data/` change (typically annual) | **No**                                                                                                    |
| Country profile extras (CINC series, battle deaths, homicides, COW arms) | `public/data/cow-*.json`, `battle-deaths.json`, `homicides.json`      | `npm run geo:build`       | When COW/UCDP/World Bank static inputs change                    | **No**                                                                                                    |
| World Bank macro series                                                  | `public/data/wb-country-indicators.json`                              | `npm run analytics:cache` | Monthly or after WDI release                                     | **Partial** — `/api/country` uses file first; live Data360 fallback if missing                            |
| World Factbook profiles                                                  | `public/data/worldfactbook-profiles.json`, `worldfactbook-slugs.json` | `npm run analytics:cache` | When Factbook updates                                            | **Partial** — file first, then `/api/worldfactbook`                                                       |
| Gov/military satellite TLEs                                              | `public/data/gov-military-tles.json`                                  | `npm run tles:fetch`      | Daily (orbital drift)                                            | **No** — positions propagate client-side from cached TLEs; `predev` refreshes TLEs in dev only            |
| Military aircraft hex registry                                           | `src/data/military-aircraft-registry.json`                            | `npm run geo:build`       | When `static-data/aircraft/` changes                             | **No**                                                                                                    |
| Military vessel watchlist                                                | `public/data/military-vessels-watchlist.json`                         | Manual / build pipeline   | As needed                                                        | **No**                                                                                                    |
| PMTiles vector tiles (optional)                                          | `public/tiles/`                                                       | `npm run geo:tiles`       | After geo rebuild                                                | **No**                                                                                                    |

### Live feeds (runtime — no rebuild)

These update via `src/app/api/*` and client polling while the app runs. See layer `cadence` in [`src/config/layer-registry.ts`](src/config/layer-registry.ts) and OPS panel intervals in [`src/components/ops/OpsView.tsx`](src/components/ops/OpsView.tsx).

| Examples              | Typical interval                 |
| --------------------- | -------------------------------- |
| Military flights      | 60 s                             |
| GDELT conflict events | 15 min                           |
| USGS earthquakes      | 1 h                              |
| NASA FIRMS fires      | 15 min                           |
| Maritime alerts (NGA) | 6 h server TTL                   |
| OPS news RSS          | 10–15 min                        |
| OPS markets (Yahoo)   | 5 min (US hours) / 1 h off-hours |
| OPS EIA / trade       | 24 h                             |

Maritime **AIS** requires `npm run ais:relay` locally (WebSocket); not automatic without the relay.

### Checklist

1. After changing `static-data/`, run `npm run geo:build` and commit updated `public/geo/`, `public/data/`, and `src/data/` outputs as needed.
2. Refresh World Bank / Factbook: `npm run analytics:cache` (requires `static-data/` country-code files).
3. Refresh TLEs when satellites matter: `npm run tles:fetch` (`SPACETRACK_USER` / `SPACETRACK_PASS` in `src/.env`).
4. Optional CI: extend [`.github/workflows/data-refresh.yml`](../../.github/workflows/data-refresh.yml) with `analytics:cache` and `tles:fetch` if automating maintenance.

_The datasets in `static-data/` that were used for development can be accessed [here](https://drive.google.com/drive/folders/1Xrq1vu2dq_femdxGYpFbMAH-obh9QGOm?usp=sharing)._

_Last updated with application layer registry as of Panoptes v0.1._
