/**
 * Roughly how far one province or state is from another, for the trip that has
 * not been measured yet.
 *
 * The cost estimate used to guess a travel band from a list of place names
 * written for Winnipeg: Brandon and Fargo were drives, Vancouver and Halifax
 * were flights, and for an artist in Calgary every one of those answers was
 * wrong, without saying so. A distance is the thing a band is made of, and a
 * province or state has a place to measure from, so the guess is now the same
 * rule the measured path uses (`bandFromDistance`) applied to the straight line
 * between the artist's province and the gig's.
 *
 * Coarse on purpose, and used only where nothing better exists. Each point is
 * the region's best-known city, not its middle, because that is where a show
 * is: a state's geometric centre is often a field. A gig in the artist's own
 * province is a drive whatever the table says, and the nightly measurement
 * replaces all of this with a real road distance once a home base is set.
 * Every estimate that leans on this says it was guessed.
 */

import type { Coordinates } from './travelDistance'

/** Provinces and territories, by two-letter code. */
export const PROVINCE_POINTS: Record<string, Coordinates> = {
  AB: { lat: 53.55, lon: -113.49 }, // Edmonton
  BC: { lat: 49.28, lon: -123.12 }, // Vancouver
  MB: { lat: 49.9, lon: -97.14 }, // Winnipeg
  NB: { lat: 45.96, lon: -66.64 }, // Fredericton
  NL: { lat: 47.56, lon: -52.71 }, // St. John's
  NS: { lat: 44.65, lon: -63.57 }, // Halifax
  NT: { lat: 62.45, lon: -114.37 }, // Yellowknife
  NU: { lat: 63.75, lon: -68.52 }, // Iqaluit
  ON: { lat: 43.65, lon: -79.38 }, // Toronto
  PE: { lat: 46.24, lon: -63.13 }, // Charlottetown
  QC: { lat: 45.5, lon: -73.57 }, // Montreal
  SK: { lat: 50.45, lon: -104.61 }, // Regina
  YT: { lat: 60.72, lon: -135.06 }, // Whitehorse
}

/** States, by two-letter code. Where the music is, which is not always the capital. */
export const STATE_POINTS: Record<string, Coordinates> = {
  AL: { lat: 33.5, lon: -86.8 }, AK: { lat: 61.2, lon: -149.9 }, AZ: { lat: 33.4, lon: -112.1 },
  AR: { lat: 34.7, lon: -92.3 }, CA: { lat: 36.7, lon: -119.8 }, CO: { lat: 39.7, lon: -105.0 },
  CT: { lat: 41.8, lon: -72.7 }, DE: { lat: 39.7, lon: -75.5 }, FL: { lat: 28.5, lon: -81.4 },
  GA: { lat: 33.7, lon: -84.4 }, HI: { lat: 21.3, lon: -157.9 }, ID: { lat: 43.6, lon: -116.2 },
  IL: { lat: 41.9, lon: -87.6 }, IN: { lat: 39.8, lon: -86.2 }, IA: { lat: 41.6, lon: -93.6 },
  KS: { lat: 37.7, lon: -97.3 }, KY: { lat: 38.3, lon: -85.8 }, LA: { lat: 30.0, lon: -90.1 },
  ME: { lat: 43.7, lon: -70.3 }, MD: { lat: 39.3, lon: -76.6 }, MA: { lat: 42.4, lon: -71.1 },
  MI: { lat: 42.3, lon: -83.0 }, MN: { lat: 45.0, lon: -93.3 }, MS: { lat: 32.3, lon: -90.2 },
  MO: { lat: 39.1, lon: -94.6 }, MT: { lat: 45.8, lon: -108.5 }, NE: { lat: 41.3, lon: -96.0 },
  NV: { lat: 36.2, lon: -115.1 }, NH: { lat: 43.0, lon: -71.5 }, NJ: { lat: 40.7, lon: -74.2 },
  NM: { lat: 35.1, lon: -106.6 }, NY: { lat: 40.7, lon: -74.0 }, NC: { lat: 35.2, lon: -80.8 },
  ND: { lat: 46.9, lon: -96.8 }, OH: { lat: 40.0, lon: -83.0 }, OK: { lat: 35.5, lon: -97.5 },
  OR: { lat: 45.5, lon: -122.7 }, PA: { lat: 40.0, lon: -75.2 }, RI: { lat: 41.8, lon: -71.4 },
  SC: { lat: 34.0, lon: -81.0 }, SD: { lat: 43.5, lon: -96.7 }, TN: { lat: 36.2, lon: -86.8 },
  TX: { lat: 30.3, lon: -97.7 }, UT: { lat: 40.8, lon: -111.9 }, VT: { lat: 44.5, lon: -73.2 },
  VA: { lat: 37.5, lon: -77.4 }, WA: { lat: 47.6, lon: -122.3 }, WV: { lat: 38.4, lon: -81.6 },
  WI: { lat: 43.0, lon: -87.9 }, WY: { lat: 41.1, lon: -104.8 }, DC: { lat: 38.9, lon: -77.0 },
}

/** The point to measure from for a region, or null when the code is not known. */
export function regionPoint(code: string, country: 'CA' | 'US'): Coordinates | null {
  return (country === 'CA' ? PROVINCE_POINTS : STATE_POINTS)[code] ?? null
}
