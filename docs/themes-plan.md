# Themes

Appearance has two independent colour choices: a **colour theme**, and light or
dark on top of it. Six themes ship: Sun Dogs (the default), Pebble, Opal and
Harvest, and two accessible ones, High contrast and Colour-blind safe.

There are two kinds of theme, and they are held to different standards on
purpose. **Aesthetic themes** are chosen for how they look, and the design wins
where a number and a palette disagree. **Accessible themes** are chosen for a
need (stronger contrast, colour vision) and are held to the standard that need
implies. An artist who finds an aesthetic theme hard to read is pointed at an
accessible one, so the aesthetic ones do not have to be everything to everyone.

Planned and built on 2026-10-07. This file started as the plan and is now the
record of what was built, with what is still to do at the end.

## What a theme is, and is not

A theme is a set of colour tokens for the light mode and another for the dark
mode: 48 colour tokens and four shadows each, plus an optional set of six that
"Higher contrast" strengthens. It is not a typeface, a density or a layout: text
size, typeface, width, contrast, motion and links stay their own settings.

The stage plot's connection colours (`conn-*`) are the exception to "a theme
sets every colour": they are the same in every theme, because telling a DI from
a mic across a table depends on distinct hues.

## The themes

| Theme | Kind | Source | What it is |
| --- | --- | --- | --- |
| Sun Dogs (default) | aesthetic | the sundogsmusic.ca cream, ink and a forest jade | warm cream ground, drawn by hand |
| Pebble | aesthetic | Jade Pebble Morning: `#7B9669` `#6C8480` `#E6E6E6` `#BAC8B1` `#404E3B` | quiet sage and grey-teal |
| Opal | aesthetic | Opal Forest Morning: `#126842` `#5CA484` `#CFB177` `#C9C3BD` | warm stone ground, a real forest green |
| Harvest | aesthetic | Emerald Harvest Twilight: `#397234` `#283F23` `#3F2617` `#0B0F08` `#ACBD5E` `#B78449` | woodland, with a near-black green that suits dark mode |
| High contrast | accessible | none | black and white, firm lines, the strongest text |
| Colour-blind safe | accessible | none | blue, gold and rose in place of green, ochre and clay |

The palettes are Figma's, from its earthy colour palettes page as listed on
2026-10-07 (the name follows its colours there). The themes carry our own names
and Help credits the palettes. Why these two beside Pebble: Opal is the closest
in spirit to the default (earthy, warm neutrals) while being visibly a different
place to be; Harvest is the only green palette on the page that starts dark, so
dark mode has a native home rather than being an inversion. Considered and set
aside: Emerald Tangerine Morning (a cream and a forest green, too close to the
default), Sage Peridot Morning (a lime that would collide with ochre).

### Aesthetic themes keep the palette's own green

Each was derived by `scripts/themes/derive.mjs` (OKLCH lightness ladders,
neutrals tinted with the palette's hue at low chroma) and nothing was bent to
pass a colour-vision test. The lightness of ochre and clay is still tuned per
theme, because that costs the design nothing.

- **Raw palette colours are mostly too light to be text.** Pebble's sage is 2.9:1
  on its own ground, its teal 3.5:1, Opal's sand 1.8:1, Harvest's tan 2.9:1 and
  its lime 1.8:1. They become fills, grounds and tints. Only the deep ones carry
  text, and the accent is a darkened or lightened relative of the palette's green.
- **Harvest is the weak one for colour vision**, and keeps its warm green anyway:
  its closest pair of green, ochre and clay is ΔE 15 in light and 17 in dark,
  where the default holds 17 or more under two kinds of colour blindness. The
  first version of this plan bent its dark accent toward mint to fix that. The
  palette is the design, and the Colour-blind safe theme exists for the person
  who needs more.
- **The meaning colours keep their hues in every aesthetic theme.** Green means
  go, ochre waiting, clay broken. A theme chooses which green and nudges the
  lightness of the other two so they read on its ground. Two source palettes have
  a tempting ochre of their own (Opal's sand, Harvest's tan); they are not used
  for waiting, so that a screen means the same thing under every aesthetic theme.

### Accessible themes redraw the meaning colours

Both draw **blue for go, gold for waiting and a red or rose for broken**. A
search over hue for three colours that clear the contrast floor and stay apart
under simulated deuteranopia, protanopia **and tritanopia** found that one set
serves all three kinds, so Colour-blind safe is one theme and not three.

- **High contrast.** Pure white and black grounds, text at 7:1 on every ground
  and on the soft accent fill, field edges at 4.5:1, every rule that separates
  two things at 3:1 or more, a 3px focus ring, and nothing that works by being
  faint. This is the designed whole of what the "Higher contrast" modifier
  approximates by darkening a theme that was drawn soft. The modifier stays, for
  people who want a little more of a theme they like. Its green could not be kept:
  at 7:1 on white the three dark colours cannot be told apart without a change of
  hue, so go is a deep blue (light) and a light blue (dark).
- **Colour-blind safe.** A quiet neutral ground, text at 7:1, and the three
  meaning colours at least ΔE 33 apart under all three kinds in light and 40 in
  dark. The three are deliberately level in lightness at 7:1, which is why this
  theme does not help a person who sees no colour at all. Labels and icons already
  accompany every status, and a Greyscale theme would answer that need.

Starting values, as built (canvas and card are the two grounds; "closest pair"
is the closest two of green, ochre and clay in the worst of the three kinds of
colour blindness; "lowest text" is the lowest of ink, body, muted and faint):

| Theme | Mode | Canvas | Card | Ink | Muted | Accent | Ochre text | Clay text | Closest pair, ΔE | Lowest text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pebble | light | `#ECF2E9` | `#F8FBF6` | `#1A2216` | `#525B4F` | `#2B635C` | `#8A600A` | `#55120B` | 29 | 4.8 |
| Pebble | dark | `#0E100D` | `#161814` | `#E3EFDF` | `#959F91` | `#98D1C8` | `#FECF86` | `#C17468` | 31 | 4.7 |
| Opal | light | `#F6EFE7` | `#FDF9F6` | `#15231B` | `#4E5C53` | `#23744D` | `#815B11` | `#55120B` | 26 | 4.8 |
| Opal | dark | `#120F0C` | `#1A1713` | `#DEF1E5` | `#90A096` | `#8AD8AC` | `#E3B56D` | `#C17468` | 23 | 4.7 |
| Harvest | light | `#EEF2E2` | `#F9FBF3` | `#182217` | `#515B50` | `#3A7335` | `#8A600A` | `#55120B` | 15 | 4.8 |
| Harvest | dark | `#0F100A` | `#171811` | `#E2F0E0` | `#949F92` | `#9BD794` | `#D6A960` | `#C17468` | 17 | 4.7 |
| High contrast | light | `#FFFFFF` | `#FFFFFF` | `#1F1F1F` | `#4A4A4A` | `#034263` | `#6A3F00` | `#822B31` | 20 | 7.2 |
| High contrast | dark | `#000000` | `#030303` | `#EBEBEB` | `#AEAEAE` | `#80C7F8` | `#FBDA8B` | `#F49191` | 28 | 8.8 |
| Colour-blind safe | light | `#F5F3EF` | `#FCFCF9` | `#1B1F29` | `#464A54` | `#084A89` | `#594900` | `#680835` | 33 | 7.4 |
| Colour-blind safe | dark | `#100F0E` | `#181715` | `#E5EBF9` | `#A8AEBA` | `#88ACFB` | `#D1C95D` | `#F78C9E` | 40 | 7.3 |

## How it works

**Two settings, not one.** `Appearance.theme` still stores light, dark or system
under the key `musichq.appearance`, so nothing saved is orphaned; the Settings
label is now "Light or dark". The colour theme is a new `palette` field, `null`
until chosen. A saved setting with no `palette`, or with one this build has never
heard of, loads as `null`. `null` resolves to Sun Dogs, or to High contrast when
the device asks for more contrast (`prefers-contrast: more`), and a choice made in
Appearance always wins. The same rule runs in the inline script in `index.html`,
which sets `data-theme`, `data-palette` and `data-contrast` before the first paint.

**One source of truth, generated CSS.** The data is `shared/themeSunDogs.ts` (the
default, drawn by hand) and `shared/themeData.ts` (the other five, generated by
`npm run themes:derive` and committed), assembled in `shared/themes.ts`. A small
generator, `shared/themeCss.ts`, writes `frontend/src/themes.css` from them
(`npm run themes:css`), one block per theme and mode, and a test fails if the
checked-in file differs. Editing the stylesheet by hand is therefore not a way to
change a theme.

**Which block applies.** The default is the base `:root` (light) and
`[data-theme='dark']`, so a page that has not run a script yet is already the
default. Every other theme is `[data-palette='x'][data-theme='y']`, two
attributes, which out-ranks the base without depending on source order.
"Higher contrast" adds a third attribute for the others.

**Print is always the default, on white.** The last block in `themes.css`
carries four attributes and sets every themed token, so a dark page, a themed page
or an accessible page still prints as the default's light palette on white paper.
It used to set only some tokens and a dark page printed pale text on white.

**The picker.** Settings, Appearance, "Colour theme": one card per theme showing
its ground, card, ink, accent and ochre as five swatches in the mode currently in
force, with the name, a sentence, and a check on the selected one. The two
accessible themes sit under their own heading, and the aesthetic group ends with a
line pointing at them. It is one radio group: arrow keys move the choice, and only
the selected card is in the tab order. Choosing writes straight through to the
page, which is the preview.

## Guards

Two standards, both enforced by tests (`test/themes.test.ts`,
`test/paletteContrast.test.ts`).

**Strict, for the default and the accessible themes.**

- Every theme defines all 48 themed tokens in both modes, as valid channels, and
  none defines a `conn-*`.
- Sun Dogs: text 4.5:1 on every ground and on its own fill, field edges 3:1, and
  green, ochre and clay at least ΔE 15 apart for deuteranopia and protanopia.
- Accessible themes: text 7:1 on every ground and on the soft accent fill, text on
  each tinted fill 7:1, text on the accent fill 7:1, field edges 3:1 (4.5:1 in
  High contrast), rules 3:1 in High contrast, and the closest pair of the three
  meaning colours at least ΔE 20 in High contrast and ΔE 30 in Colour-blind safe,
  both measured under all three kinds.

**A ratchet, for Pebble, Opal and Harvest.** `shared/themeBaselines.ts` records
every measure of each theme in each mode when it was added. A test fails if a later
change makes any measure worse than its record, so a theme can be less accessible
than the default but never quietly less accessible than it was; lowering a record
is a visible diff somebody has to mean. One floor is not on the ratchet: ink and
body text at 4.5:1. A test also fails if an aesthetic theme is added without a
record.

**Shared.** The generated CSS equals the checked-in CSS; the print block sets every
token and out-ranks every theme; a saved setting with no or an unknown `palette`
loads as nothing chosen; the inline pre-paint script uses the same default and the
same High contrast id as the code.

**By hand, in a browser.** A rendered scan of text contrast over the eight main
screens in every theme and mode. It cannot run in the test suite because it needs
a browser, and it is the check that found two things the token tests could not: a
filter count at 1.24:1 and then 4.15:1, and secondary text on the active queue
row's tinted fill, which is now a fitted ground. Done on 2026-10-07: 571 text
elements per run, 12 theme and mode combinations, no failures (7:1 for the
accessible two, 4.5:1 for the rest).

## What is not done

- **Per account storage.** The choice is kept per device, in the browser, as
  agreed for the first release. Now that accessible themes exist it should follow
  the artist across devices: one row in `tenant_settings`, written on change and
  read before the local value.
- **Greyscale and Low glare.** Greyscale tells the meaning colours apart by
  lightness steps and weight alone, for achromatopsia or a monochrome display.
  Low glare is a dim, warm ground with no white in it and softened highlights, for
  light sensitivity, still at 4.5:1 for text.
- **Seen in a real browser.** Pebble in light, Opal in dark, High contrast in light
  and Colour-blind safe in light were looked at on the seeded screens. The other
  combinations were scanned and not looked at. `forced-colors` and live changes of
  `prefers-contrast` have been written from the specification and unit-tested but
  not seen.
- **The public EPK page** always renders the default. An artist-chosen theme for
  their own EPK is branding rather than appearance and is a different feature.

## Not in scope

Custom colour pickers, importing a palette from a URL, per-page themes, and
anything that changes what the meaning colours mean inside the aesthetic family.
