# Public claim changes

What changed on the DesiUtils site as a result of the measurements in this repository.
This is a summary of outcomes. It intentionally contains no internal file names, constants
or architecture.

## The claim that was retired

> Typical precision: within 0.3 degrees of Swiss Ephemeris Lahiri

Published from roughly 2026-08-01. The figure was self-labelled in the source as a disclosed
heuristic and explicitly not a Swiss-calibrated bound. Nothing had ever measured it. That is the
gap this work closed.

## The claim that replaced it

> Across 1,176 sampled epochs per body from 1900 through 2031, the Sun, Moon, Mercury, Venus,
> Mars, Jupiter, and Saturn agreed with Swiss Ephemeris Lahiri to within 12 arcseconds. The
> largest observed difference was 11.29 arcseconds.

Stated with its exclusions: lunar nodes, house cusps, unsampled dates, and no accuracy guarantee
from 2032 onward because delta-T models diverge.

Supporting bounds, all derivable from the matrix in `swiss-production-audit.md`: every body's
median is 2.22 arcsec or less, and every non-Moon body stays within 2.27 arcsec through 2031.

## Counts

| | |
|---|---|
| Production files carrying a 0.3-style accuracy claim | 43 |
| Numeric orb and default values reviewed in the astrology library | 21 |
| Files touched by the copy sweep | 92 |
| Boundary-warning orb, before and after | 0.3 deg to 0.01 deg (36 arcsec) |
| Automated test suites and tests at the shipped state | 318 suites, 8,504 tests |

The orb change was a narrowing by a factor of 30, from roughly 95 times the largest observed
difference to a little over 3 times it. It is user-visible: it governs when a placement near a
sign, nakshatra, pada or navamsa boundary is flagged as provisional.

Four categories of number were deliberately kept separate during the sweep rather than replaced
mechanically: measured engine error, birth-time uncertainty, conservative interface proximity
warnings, and method-specific orbs. They are different quantities that happened to share a value.

## Verification

The measurements behind the replacement claim regenerate from this repository:

```bash
npm ci
npm run verify
```

The live claim is published at
<https://desiutils.in/blog/kundli-calculator-accuracy>.

Note the boundary this repository does not cross: `npm run verify` reproduces the JPL Horizons
legs and the nutation prediction. It does **not** reproduce the Swiss Ephemeris comparison, which
is reviewer-reported. See the README.
