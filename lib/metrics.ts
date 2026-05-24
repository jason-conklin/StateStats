import { PrismaClient } from "@prisma/client";
import { DataSourceInfo, MetricDefinition } from "./types";

export const dataSources: DataSourceInfo[] = [
  {
    id: "census_acs",
    name: "U.S. Census American Community Survey",
    description: "Annual estimates on income, demographics, housing, and more.",
    homepageUrl: "https://www.census.gov/programs-surveys/acs",
    apiDocsUrl: "https://www.census.gov/data/developers/data-sets/acs-1year.html",
  },
  {
    id: "bls_laus",
    name: "BLS Local Area Unemployment Statistics",
    description: "Unemployment rates and labor market estimates from BLS LAUS.",
    homepageUrl: "https://www.bls.gov/lau/",
    apiDocsUrl: "https://download.bls.gov/pub/time.series/la/",
  },
  {
    id: "noaa_climate_at_a_glance",
    name: "NOAA Climate at a Glance",
    description: "NOAA NCEI state-level climate time series for temperature and precipitation.",
    homepageUrl: "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/",
    apiDocsUrl: "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/statewide/time-series",
  },
  {
    id: "noaa_cdo",
    name: "NOAA Climate Data Online",
    description: "NOAA NCEI Climate Data Online annual station summaries.",
    homepageUrl: "https://www.ncei.noaa.gov/cdo-web/",
    apiDocsUrl: "https://www.ncdc.noaa.gov/cdo-web/webservices/v2",
  },
  {
    id: "noaa_storm_events",
    name: "NOAA Storm Events Database",
    description: "Official NOAA/NWS Storm Events records distributed by NOAA NCEI.",
    homepageUrl: "https://www.ncei.noaa.gov/stormevents/",
    apiDocsUrl: "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/",
  },
  {
    id: "usgs_earthquake_catalog",
    name: "USGS Earthquake Catalog",
    description: "USGS FDSN earthquake event catalog.",
    homepageUrl: "https://earthquake.usgs.gov/earthquakes/search/",
    apiDocsUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
  },
];

export const metrics: MetricDefinition[] = [
  {
    id: "median_household_income",
    name: "Median Household Income",
    description: "Median household income (ACS 1-year estimates, inflation adjusted).",
    unit: "USD",
    sourceId: "census_acs",
    category: "Income",
    isDefault: true,
    sourceHint: "Census ACS",
  },
  {
    id: "unemployment_rate",
    name: "Unemployment Rate",
    description: "Annual average unemployment rate for civilian labor force.",
    unit: "%",
    sourceId: "bls_laus",
    category: "Labor",
    sourceHint: "BLS LAUS",
  },
  {
    id: "population_total",
    name: "Total Population",
    description: "Total resident population.",
    unit: "people",
    sourceId: "census_acs",
    category: "Population",
    sourceHint: "Census ACS",
  },
  {
    id: "median_home_value",
    name: "Median Home Value",
    description: "Median value of owner-occupied housing units.",
    unit: "USD",
    sourceId: "census_acs",
    category: "Housing",
    sourceHint: "Census ACS",
  },
  {
    id: "median_age",
    name: "Median Age",
    description: "Median age of the population.",
    unit: "years",
    sourceId: "census_acs",
    category: "Age",
    sourceHint: "Census ACS",
  },
  {
    id: "average_annual_temperature",
    name: "Average Annual Temperature",
    description: "Statewide annual average temperature from NOAA NCEI Climate at a Glance.",
    unit: "°F",
    sourceId: "noaa_climate_at_a_glance",
    category: "Climate",
    sourceHint: "NOAA NCEI",
  },
  {
    id: "annual_precipitation",
    name: "Annual Precipitation",
    description: "Statewide annual total precipitation from NOAA NCEI Climate at a Glance.",
    unit: "in",
    sourceId: "noaa_climate_at_a_glance",
    category: "Climate",
    sourceHint: "NOAA NCEI",
  },
  {
    id: "annual_snowfall",
    name: "Annual Snowfall",
    description: "Average annual snowfall across NOAA GSOY reporting stations in each state.",
    unit: "in",
    sourceId: "noaa_cdo",
    category: "Climate",
    sourceHint: "NOAA CDO",
  },
  {
    id: "tornado_count",
    name: "Tornado Count",
    description: "Yearly count of NOAA Storm Events tornado records by state.",
    unit: "events",
    sourceId: "noaa_storm_events",
    category: "Severe Weather",
    sourceHint: "NOAA Storm Events",
  },
  {
    id: "earthquake_count",
    name: "Earthquake Count",
    description: "Yearly count of USGS earthquakes magnitude 2.5 and greater by state.",
    unit: "events",
    sourceId: "usgs_earthquake_catalog",
    category: "Natural Hazards",
    sourceHint: "USGS",
  },
];

export const MEDIAN_HOUSEHOLD_INCOME_ID = "median_household_income";

export function getMetricConfigById(id: string | null | undefined) {
  return metrics.find((m) => m.id === id) ?? metrics.find((m) => m.isDefault) ?? metrics[0];
}

/**
 * Ensure cataloged data sources and metrics exist in the database.
 * Safe to call at startup on the server.
 */
export async function ensureCatalog(prisma: PrismaClient) {
  for (const source of dataSources) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      update: {
        name: source.name,
        description: source.description,
        homepageUrl: source.homepageUrl,
        apiDocsUrl: source.apiDocsUrl,
      },
      create: {
        id: source.id,
        name: source.name,
        description: source.description,
        homepageUrl: source.homepageUrl,
        apiDocsUrl: source.apiDocsUrl,
      },
    });
  }

  for (const metric of metrics) {
    await prisma.metric.upsert({
      where: { id: metric.id },
      update: {
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        category: metric.category,
        isDefault: Boolean(metric.isDefault),
      },
      create: {
        id: metric.id,
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        category: metric.category,
        isDefault: Boolean(metric.isDefault),
        sourceId: metric.sourceId,
      },
    });
  }
}
