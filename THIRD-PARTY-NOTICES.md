# Third-party notices

This repository mixes DesiUtils code with third-party material under different terms. This file
separates them.

## DesiUtils code, MIT

`lib/astrology/ephemeris.ts`, `lib/astrology/ayanamsa.ts`, `lib/astrology/astronomia.d.ts` and the
three files in `scripts/` are DesiUtils code, licensed MIT. See `LICENSE`.

`lib/astrology/astronomia.d.ts` is a hand-written TypeScript declaration describing the astronomia
API surface used here. It is DesiUtils-authored and MIT licensed; it is not distributed by the
astronomia project.

## astronomia, MIT, not vendored

The ephemeris computation depends on [astronomia](https://www.npmjs.com/package/astronomia)
version 4.2.0, an MIT-licensed implementation of algorithms from Jean Meeus, *Astronomical
Algorithms*, including VSOP87 planetary theory. It is installed from npm by `npm ci` and no
astronomia source or data is copied into this repository.

Copyright (c) commenthol and contributors. Full licence text ships with the package in
`node_modules/astronomia/LICENSE` after installation.

## NASA JPL Horizons, retained responses

The eight `docs/evidence/ephemeris-calibration/horizons-*.txt` files are unmodified responses from
the NASA Jet Propulsion Laboratory [Horizons system](https://ssd.jpl.nasa.gov/horizons/), retained
so the comparison can be re-run against a fixed reference rather than a live service whose output
may change.

They were fetched as OBSERVER ephemerides, geocentric (`CENTER='500@399'`), using `QUANTITIES='31'`
for apparent ecliptic longitude and `QUANTITIES='30,31'` for the time-scale control fetch, at
41-day steps. The underlying planetary and lunar ephemeris is DE441.

JPL Horizons output is US Government work and is not subject to copyright protection in the United
States. It is retained here for verification. Neither NASA nor JPL endorses DesiUtils or this
analysis.

## Swiss Ephemeris, referenced but not redistributed

`docs/evidence/ephemeris-calibration/swiss-production-audit.md` records figures obtained by a
reviewer running [Swiss Ephemeris](https://www.astro.com/swisseph/) 2.10.03 with the `sepl_18.se1`
and `semo_18.se1` data files.

**No Swiss Ephemeris code or data is included in this repository, and no script here invokes it.**
Swiss Ephemeris is distributed by Astrodienst AG under a dual licence (AGPL or a paid commercial
licence). Anyone wishing to reproduce that comparison must obtain it from Astrodienst directly and
comply with those terms. Astrodienst does not endorse DesiUtils or this analysis.
