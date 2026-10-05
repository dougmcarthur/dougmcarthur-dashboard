import { describe, it, expect } from 'vitest'
import {
  channelCount,
  channelsFor,
  emptyPlot,
  inputList,
  layoutStage,
  monitorMixes,
  parseStagePlot,
  performerRole,
  powerDrops,
  performerPhoto,
  NO_PHOTO,
  stageLines,
  type StagePlot,
} from '../shared/stagePlot'
import { readClues } from '../shared/stagePlotClues'
import { cardRows } from '../shared/stagePlotCards'

function band(): StagePlot {
  const plot = emptyPlot('band', 4, 'Sam')
  plot.performers[0] = { ...plot.performers[0], instruments: ['acoustic_guitar'], vocals: 'lead' }
  plot.performers[1] = { ...plot.performers[1], name: 'Jen', instruments: ['fiddle'], vocals: 'backing' }
  plot.performers[2] = { ...plot.performers[2], name: 'Ray', instruments: ['bass'], vocals: 'none' }
  plot.performers[3] = { ...plot.performers[3], name: 'Lee', instruments: ['drums'], vocals: 'none' }
  return plot
}

describe('inputList', () => {
  it('patches drums first and vocals last, as a console is laid out', () => {
    const lines = inputList(band())
    expect(lines[0].label).toBe('Kick')
    expect(lines.at(-1)?.label).toBe('BV — Jen')
    expect(lines.at(-2)?.label).toBe('Lead vox — Sam')
  })

  it('gives a stereo source two channels', () => {
    const plot = emptyPlot('solo', 1, 'Sam')
    plot.performers[0].instruments = ['keys']
    plot.performers[0].vocals = 'lead'
    const lines = inputList(plot)
    expect(lines.map((l) => l.ch)).toEqual([1, 3])
    expect(channelCount(lines)).toBe(3)
  })

  it('adds playback once, not again for somebody who already runs a laptop', () => {
    const plot = emptyPlot('solo', 1, 'Sam')
    plot.playback = true
    expect(inputList(plot).filter((l) => l.label === 'Playback')).toHaveLength(1)
    plot.performers[0].instruments = ['laptop']
    expect(inputList(plot).filter((l) => l.label === 'Playback')).toHaveLength(1)
  })

  it('names somebody nobody named, rather than leaving a blank on the strip', () => {
    const plot = emptyPlot('duo', 2, '')
    plot.performers[1].vocals = 'backing'
    expect(inputList(plot).map((l) => l.label)).toContain('BV — Performer 2')
  })
})

describe('layoutStage', () => {
  it('puts the kit upstage centre and the lead singer centre of the front line', () => {
    const placed = layoutStage(band())
    const lee = placed.find((p) => p.name === 'Lee')!
    const sam = placed.find((p) => p.name === 'Sam')!
    expect(lee.y).toBeLessThan(sam.y)
    expect(Math.abs(lee.x - 50)).toBeLessThan(10)
    expect(Math.abs(sam.x - 50)).toBeLessThan(20)
  })

  it('keeps everybody on the stage', () => {
    const plot = emptyPlot('band', 12, 'Sam')
    plot.performers.forEach((p, i) => (p.instruments = i % 2 ? ['keys'] : ['fiddle']))
    for (const p of layoutStage(plot)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(100)
    }
  })

  it('draws wedges only when wedges were asked for', () => {
    const plot = band()
    plot.monitors = 'iem'
    expect(layoutStage(plot).every((p) => p.wedge === null)).toBe(true)
    plot.monitors = 'wedges'
    expect(layoutStage(plot).every((p) => p.wedge !== null)).toBe(true)
  })
})

describe('monitors and power', () => {
  it('counts a mix per performer and a drop per powered rig', () => {
    const plot = band()
    expect(monitorMixes(plot)).toBe(4)
    expect(powerDrops(plot)).toEqual(['Ray'])
    plot.monitors = 'none'
    expect(monitorMixes(plot)).toBe(0)
  })
})

describe('parseStagePlot', () => {
  it('reads back what it wrote, and drops what this build does not know', () => {
    const plot = band()
    plot.performers[0].instruments = ['acoustic_guitar', 'theremin' as never]
    const back = parseStagePlot(JSON.stringify(plot))
    expect(back?.performers[0].instruments).toEqual(['acoustic_guitar'])
    expect(parseStagePlot('{broken')).toBeNull()
    expect(parseStagePlot(JSON.stringify({ act: 'orchestra', performers: [] }))).toBeNull()
  })

  it('describes a performer in a phrase', () => {
    expect(performerRole(band().performers[0])).toBe('Lead vocals, acoustic guitar')
  })
})

describe('readClues', () => {
  const clues = readClues([
    {
      source: 'Bio',
      text:
        'The Sundogs are a four-piece from Winnipeg, based in the Exchange. Jen Moss on fiddle and Ray Chu (bass, vocals) ' +
        'hold it together.',
    },
    { source: 'Tech rider', text: 'Sam plays a Martin D-28 through an LR Baggs Venue DI. Ray uses an Ampeg SVT.' },
  ])

  it('finds the line-up size and quotes where it said so', () => {
    expect(clues.act).toMatchObject({ act: 'band', size: 4, source: 'Bio' })
  })

  it('reads who plays what', () => {
    expect(clues.members.map((m) => [m.name, m.instruments, m.vocals])).toEqual([
      ['Jen Moss', ['fiddle'], false],
      ['Ray Chu', ['bass'], true],
    ])
  })

  it('does not read "based" as a bass', () => {
    const only = readClues([{ source: 'Bio', text: 'Based in Winnipeg since 2019.' }])
    expect(only.instruments).toEqual([])
  })

  it('finds named gear, and not a maker named on its own', () => {
    expect(clues.gear.map((g) => g.item)).toEqual(['Martin D-28', 'LR Baggs Venue DI', 'Ampeg SVT'])
    expect(readClues([{ source: 'x', text: 'I love Fender.' }]).gear).toEqual([])
  })
})

describe('what a solo acoustic act asks for', () => {
  const solo = (): StagePlot => {
    const plot = emptyPlot('solo', 1, 'Doug')
    plot.performers[0] = { ...plot.performers[0], instruments: ['acoustic_guitar'], vocals: 'lead' }
    plot.monitors = 'iem'
    return plot
  }

  it('never asks for phantom power on a pickup', () => {
    const lines = inputList(solo())
    expect(lines.find((l) => l.label === 'Acoustic gtr')?.phantom).toBe(false)
  })

  // A tuner, a pedal or a phone still needs a socket; "nothing needs power"
  // is the line that gets no cable run.
  it('still gets a power drop, at the singer', () => {
    expect(powerDrops(solo())).toEqual(['Doug'])
    expect(layoutStage(solo())[0].power).toBe(true)
  })

  it('numbers each source with the channel the input list gives it', () => {
    const plot = solo()
    const lines = inputList(plot)
    expect(channelsFor(lines, 'p1', 'acoustic_guitar')).toBe('1')
    expect(channelsFor(lines, 'p1', 'vocal')).toBe('2')
    const kit = band()
    expect(channelsFor(inputList(kit), 'p4', 'drums')).toBe('1–7')
  })
})

describe('the stage as cards', () => {
  const solo = (): StagePlot => {
    const plot = emptyPlot('solo', 1, 'Doug')
    plot.performers[0] = { ...plot.performers[0], instruments: ['acoustic_guitar'], vocals: 'lead', gear: ['Taylor 114ce', 'Boss TU-3 tuner', 'Shure SM58'] }
    return plot
  }

  it('puts the make and model on the instrument it belongs to, and nothing it cannot place', () => {
    const plot = solo()
    const rows = cardRows(plot, inputList(plot), plot.performers[0], 1)
    const guitar = rows.find((r) => r.instrument === 'acoustic_guitar')!
    expect(guitar).toMatchObject({ model: 'Taylor 114ce', connection: 'di', channels: '1' })
    expect(rows.find((r) => r.kind === 'vocal')).toMatchObject({ model: 'Shure SM58', connection: 'mic', channels: '2' })
    // A tuner is not the guitar: it gets its own row rather than a guess.
    expect(rows.find((r) => r.kind === 'gear')?.title).toBe('Boss TU-3 tuner')
    expect(rows.map((r) => r.kind)).toEqual(['instrument', 'vocal', 'gear', 'monitor', 'power'])
  })

  it('counts a kit by its channels, not its microphones', () => {
    const plot = band()
    const kit = cardRows(plot, inputList(plot), plot.performers[3], 4).find((r) => r.instrument === 'drums')!
    expect(kit.spec).toMatch(/^7 channels/)
  })

  it('stands the kit and back line upstage until the artist moves somebody', () => {
    const plot = band()
    expect(stageLines(plot)).toEqual({ upstage: ['p3', 'p4'], downstage: ['p1', 'p2'] })
    plot.stage = { upstage: ['p4'], downstage: ['p3', 'p1', 'p2', 'gone'] }
    expect(stageLines(plot)).toEqual({ upstage: ['p4'], downstage: ['p3', 'p1', 'p2'] })
  })

  it('places a performer the saved arrangement never heard of', () => {
    const plot = band()
    plot.stage = { upstage: ['p4'], downstage: ['p1'] }
    const lines = stageLines(plot)
    expect([...lines.upstage, ...lines.downstage].sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('reads a stored arrangement back', () => {
    const plot = band()
    plot.stage = { upstage: ['p4', 'p3'], downstage: ['p1', 'p2'] }
    expect(parseStagePlot(JSON.stringify(plot))?.stage).toEqual(plot.stage)
  })
})

describe('a photo on each card', () => {
  const press = { photo: 'https://img.example/doug.jpg', ownName: 'Sam' }

  it("puts the press photo on the artist's own card only, until somebody chooses", () => {
    const plot = band()
    expect(plot.performers.map((_, i) => performerPhoto(plot, i, press))).toEqual([press.photo, null, null, null])
  })

  it('uses the photo chosen for each member, and honours "no photo"', () => {
    const plot = band()
    plot.performers[1].photo = 'https://img.example/jen.jpg'
    plot.performers[0].photo = NO_PHOTO
    expect(performerPhoto(plot, 1, press)).toBe('https://img.example/jen.jpg')
    expect(performerPhoto(plot, 0, press)).toBeNull()
  })

  it('keeps a choice it can store and drops one it cannot', () => {
    const plot = band()
    plot.performers[1].photo = 'https://img.example/jen.jpg'
    plot.performers[2].photo = 'javascript:alert(1)'
    const back = parseStagePlot(JSON.stringify(plot))!
    expect(back.performers[1].photo).toBe('https://img.example/jen.jpg')
    expect(back.performers[2].photo).toBeUndefined()
  })
})
