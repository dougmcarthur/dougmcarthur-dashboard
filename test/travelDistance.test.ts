import { describe, it, expect } from 'vitest'
import {
  bandFromDistance,
  crowKm,
  driveCost,
  driveNights,
  estimateDrive,
  formatDriveTime,
  mappablePlace,
  mapsLink,
  measuredDistance,
} from '../shared/travelDistance'
import { estimateGigCost, TRAVEL_BANDS } from '../shared/gigCost'
import type { GigOpportunity } from '../shared/types'

const WINNIPEG = { lat: 49.8951, lon: -97.1384 }
const LAC_DU_BONNET = { lat: 50.2549, lon: -96.0621 }
const TORONTO = { lat: 43.6532, lon: -79.3832 }

function gig(o: Partial<GigOpportunity>): GigOpportunity {
  return {
    id: 1, name: 'A gig', type: 'venue', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null, feeAmount: null, feeCurrency: 'CAD',
    fee: null, paid: 0, fitNotes: null, fitRationale: null, url: null, status: 'discovered', googleEventId: null,
    snoozedUntil: null, snoozedAt: null, discoveredAt: '2026-09-01', updatedAt: '2026-09-01', ...o,
  }
}

describe('which places can be looked up on a map', () => {
  // Every shape below is a real production location or name.
  it('takes a town and region, from the location or the end of the name', () => {
    expect(mappablePlace({ location: 'Birds Hill Park, MB' })).toBe('Birds Hill Park, MB')
    expect(mappablePlace({ location: 'Austin, TX' })).toBe('Austin, TX')
    expect(mappablePlace({ location: null, name: 'The Listening Room — Lac du Bonnet, MB' })).toBe('Lac du Bonnet, MB')
  })

  it('refuses anything that is not one place', () => {
    // A bare province geocodes to its middle, and would report a precise
    // distance to a point in the bush.
    expect(mappablePlace({ location: 'Manitoba' })).toBeNull()
    expect(mappablePlace({ location: 'National (Canada)' })).toBeNull()
    expect(mappablePlace({ location: 'Manitoba (touring outside hometown, incl. across Canada, US or internationally)' })).toBeNull()
    expect(mappablePlace({ location: 'Online, anywhere' })).toBeNull()
    expect(mappablePlace({ location: null, name: 'New Music Night — Park Alleys (Manitoba Music)' })).toBeNull()
  })
})

describe('distance, and what it means', () => {
  it('measures a straight line in kilometres', () => {
    expect(Math.round(crowKm(WINNIPEG, TORONTO))).toBeGreaterThan(1490)
    expect(Math.round(crowKm(WINNIPEG, TORONTO))).toBeLessThan(1530)
    expect(Math.round(crowKm(WINNIPEG, LAC_DU_BONNET))).toBeLessThan(100)
  })

  it('bands by road for driving and by straight line for flying', () => {
    expect(bandFromDistance({ roadKm: 30, crowKm: 25, overseas: false })).toBe('local')
    expect(bandFromDistance({ roadKm: 119, crowKm: 88, overseas: false })).toBe('drive')
    // Thunder Bay: 700 km of road is still a drive.
    expect(bandFromDistance({ roadKm: 700, crowKm: 580, overseas: false })).toBe('drive')
    // Toronto: a regional fare. Vancouver: past it.
    expect(bandFromDistance({ roadKm: 2100, crowKm: 1510, overseas: false })).toBe('regional')
    expect(bandFromDistance({ roadKm: 2300, crowKm: 1865, overseas: false })).toBe('transcontinental')
    expect(bandFromDistance({ roadKm: 10, crowKm: 10, overseas: true })).toBe('international')
  })

  it('prices a drive by its length, there and back, as a range', () => {
    expect(driveCost(118.7)).toEqual({ low: 40, high: 60 })
    expect(driveCost(800)).toEqual({ low: 240, high: 400 })
  })

  it('counts nights from the hours, not the band', () => {
    expect(driveNights(1.66)).toEqual({ low: 0, high: 0 })
    expect(driveNights(4)).toEqual({ low: 0, high: 1 })
    expect(driveNights(8)).toEqual({ low: 1, high: 2 })
  })

  it('stands in a straight line for a road that could not be routed', () => {
    const drive = estimateDrive(100)
    expect(drive.km).toBeCloseTo(125)
    expect(formatDriveTime(1.66)).toBe('1 h 40 min')
    expect(formatDriveTime(0.5)).toBe('30 min')
  })
})

describe('a measured distance is used only while it is about this place', () => {
  const measured = {
    location: 'Lac du Bonnet, MB', geoStatus: 'found', geoPlace: 'Lac du Bonnet, MB',
    roadKm: 118.7, roadHours: 1.66, crowKm: 88, distanceSource: 'route',
  }

  it('reads the cached numbers', () => {
    expect(measuredDistance(measured)).toEqual({ roadKm: 118.7, roadHours: 1.66, crowKm: 88, source: 'route' })
  })

  it('ignores them once the location has been edited to somewhere else', () => {
    expect(measuredDistance({ ...measured, location: 'Brandon, MB' })).toBeNull()
  })

  it('has nothing for a place the map did not know', () => {
    expect(measuredDistance({ ...measured, geoStatus: 'not_found' })).toBeNull()
  })
})

describe('the trip cost, with a distance', () => {
  it('prices the Listening Room as a day-trip drive, not a regional flight', () => {
    const estimate = estimateGigCost(gig({
      name: 'The Listening Room — Lac du Bonnet, MB', location: null, country: 'CA',
      geoStatus: 'found', geoPlace: 'Lac du Bonnet, MB', roadKm: 118.7, roadHours: 1.66, crowKm: 88,
      distanceSource: 'route',
    }))
    const travel = estimate.lines.find((l) => l.id === 'travel')!
    expect(travel.label).toBe('Drive, 119 km each way (about 1 h 40 min)')
    expect(travel.amount).toEqual({ low: 40, high: 60 })
    expect(travel.basis).toBe('route')
    // A day trip: no lodging line at all.
    expect(estimate.lines.find((l) => l.id === 'lodging')).toBeUndefined()
  })

  it('yields to a band somebody set by hand', () => {
    const estimate = estimateGigCost(gig({
      location: 'Lac du Bonnet, MB', country: 'CA', travelBand: 'regional',
      geoStatus: 'found', geoPlace: 'Lac du Bonnet, MB', roadKm: 118.7, roadHours: 1.66, crowKm: 88,
      distanceSource: 'route',
    }))
    const travel = estimate.lines.find((l) => l.id === 'travel')!
    expect(travel.label).toBe(TRAVEL_BANDS.regional.label)
    expect(travel.basis).toBeUndefined()
  })

  it('says a home-town gig is in town, not 0 km away', () => {
    const estimate = estimateGigCost(gig({
      location: 'Winnipeg, MB', country: 'CA',
      geoStatus: 'found', geoPlace: 'Winnipeg, MB', roadKm: 0, roadHours: 0, crowKm: 0, distanceSource: 'route',
    }))
    expect(estimate.lines.find((l) => l.id === 'travel')!.label).toBe('Local, in town')
  })

  it('keeps a flight at the band’s range, because a fare does not follow distance', () => {
    const estimate = estimateGigCost(gig({
      location: 'Toronto, ON', country: 'CA',
      geoStatus: 'found', geoPlace: 'Toronto, ON', roadKm: 2100, roadHours: 21, crowKm: 1510, distanceSource: 'route',
    }))
    const travel = estimate.lines.find((l) => l.id === 'travel')!
    expect(travel.amount).toEqual(TRAVEL_BANDS.regional.cost)
    // A flight says how far away, not how far by road.
    expect(travel.label).toBe('Regional flight, 1,510 km away')
  })
})

describe('Open in Maps', () => {
  it('links a real place, encoded', () => {
    expect(mapsLink({ location: 'Lac du Bonnet, MB' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Lac%20du%20Bonnet%2C%20MB',
    )
  })

  it('offers nothing where there is no single place', () => {
    expect(mapsLink({ location: 'National (Canada)' })).toBeNull()
    expect(mapsLink({ location: null, name: 'Polaris Music Prize' })).toBeNull()
  })
})

describe('maps are linked, never embedded', () => {
  it('loads no map frame anywhere in the app', async () => {
    // A link loads nothing from any map service until somebody clicks it; an
    // embedded map loads the provider's frame, and its tracking, on every view.
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []
      })
    for (const file of walk('frontend/src')) {
      // Map providers' embed addresses and script API — not every iframe: the
      // public EPK embeds a live video, on YouTube's no-cookie domain.
      expect(readFileSync(file, 'utf8'), file).not.toMatch(
        /google\.[a-z.]+\/maps\/embed|output=embed|openstreetmap\.org\/export\/embed|google\.maps\.|maps\.googleapis\.com/i,
      )
    }
  })
})
