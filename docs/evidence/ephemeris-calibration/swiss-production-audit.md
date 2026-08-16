# Swiss Ephemeris production audit - 2026-08-16 (reviewer-run)

This file is the committed record of the external audit that licenses the public
accuracy claim and the 0.01 deg boundary-warning orb. The claim's figures must
live in committed evidence, not only in review threads and code comments; this
is that evidence.

## Provenance

- Run EXTERNALLY by the reviewer against **Swiss Ephemeris 2.10.03** using the
  **sepl_18.se1 / semo_18.se1** data files. No Swiss Ephemeris is installed on
  this build box (no npm install into the shared tree), so this artifact RECORDS
  the reviewer's reported figures; it is not reproducible in-repo. The in-repo
  reproducible legs are the JPL Horizons comparisons beside this file
  (calibration.output.json, timescale-control.output.json,
  nutation-convention.output.json).
- Engine side: the committed production sidereal path AFTER the
  nutation-convention and time-split fixes (mean sidereal matching Swiss Lahiri;
  `utJulianDayToJDE` time split), i.e. the branch state reviewed at `1aafb64`.
- Convention check reported by the reviewer: Swiss's default sidereal output was
  **verified equal to `SEFLG_NONUT`** for this comparison, so the engine's
  mean-sidereal convention and the Swiss reference agree on nutation handling -
  the ~12 arcsec systematic that existed before the fix is gone, not hidden.

## Regime classification

Epochs are binned by the delta-T regime of the SHIPPED astronomia chain, using
the production `CalendarGregorian.toYear()` conversion, with boundaries located
on that chain and asserted against astronomia Rev 5 (the data-to-prediction
hand-off sits at year 2023.0788 on the shipped conversion, NOT at
`data.last = 2023.3288`).

Epochs per body, 1900 through 2031, on the repo's standard 41-day calibration
grid (the full 1900-2100 grid is 1,782 epochs; truncation at the 2032 regime
boundary leaves 1,176):

| regime | epochs per body |
|---|---|
| pre-1973 (historical) | 652 |
| 1973-2023 (delta-T data) | 445 |
| 2023-2032 (delta-T prediction) | 79 |
| **total claimed span 1900-2031** | **1,176** |

## Results vs Swiss Ephemeris Lahiri - full per-body matrix (arcseconds; median / p99 / max)

| Body | pre-1973 | 1973-2023 | 2023-2032 | 2032+ |
|---|---|---|---|---|
| Moon | 1.909 / 7.476 / **11.286** | 1.961 / 8.202 / 9.429 | 2.218 / 6.335 / 7.716 | 26.734 / 69.595 / 73.724 |
| Sun | 1.145 / 1.672 / 1.696 | 0.884 / 1.005 / 1.017 | 1.066 / 1.124 / 1.128 | 3.472 / 6.710 / 6.905 |
| Mercury | 1.051 / 1.601 / 1.672 | 0.796 / 0.931 / 1.042 | 0.961 / 1.062 / 1.083 | 2.826 / 10.399 / 11.588 |
| Venus | 1.051 / 1.585 / 1.634 | 0.795 / 0.929 / 2.261 | 0.974 / 1.073 / 1.073 | 3.191 / 7.704 / 7.810 |
| Mars | 1.055 / 1.586 / 1.723 | 0.797 / 0.916 / 0.980 | 0.953 / 1.034 / 1.064 | 2.341 / 5.172 / 5.264 |
| Jupiter | 1.071 / 1.561 / 1.603 | 0.938 / 1.170 / 1.207 | 1.166 / 1.284 / 1.319 | 1.866 / 3.355 / 3.663 |
| Saturn | 1.036 / 1.612 / 1.674 | 0.938 / 1.164 / 1.305 | 1.061 / 1.136 / 1.170 | 1.748 / 2.866 / 3.017 |

Derived bounds the public claim quotes, all reproducible from the matrix:
every non-Moon body stays **within 2.27 arcsec** at worst through 2031 (the
largest is Venus at 2.261, 1973-2023); **every body's median is 2.22 arcsec
or less** (the largest is the Moon at 2.218, 2023-2032); and the largest
observed difference over 1900-2031 is **11.286 arcsec** (Moon, pre-1973),
quoted as 11.29 in the public claim.

Matrix provenance: supplied by the reviewer from the same run recorded above.
The isolated Swiss Ephemeris 2.10.03 runtime and both .se1 data files remained
available in the reviewer's environment at the time of recording, so the run
is re-executable there; it is still not reproducible in-repo.

## Excluded from any claim: 2032 onward

The 2032+ column above - the Moon reaching 73.724 arcsec - is delta-T MODEL
DIVERGENCE (astronomia's post-data polynomial vs Swiss's model), not ephemeris
error; neither model is truth out there. The measured astronomia-vs-Horizons
clock spread reaches 133.4 s at 2099-12-04. No accuracy is claimed from 2032
onward, and the public copy says so explicitly.

## What this licenses

The shipped public claim (verbatim):

> Across 1,176 sampled epochs per body from 1900 through 2031, the Sun, Moon,
> Mercury, Venus, Mars, Jupiter, and Saturn agreed with Swiss Ephemeris Lahiri
> to within 12 arcseconds. The largest observed difference was 11.29 arcseconds.

Supported by: every median <= 2.22 arcsec; non-Moon max 2.27 arcsec; Moon max
11.29 arcsec. Exclusions stated with the claim: lunar nodes (mean node is a
definition, not an observable), house cusps, and unsampled dates; no accuracy
guarantee from 2032 onward (delta-T models diverge).

The boundary-warning orb derived from it: **0.01 deg = 36 arcsec**, a little
over 3x the largest observed difference. The retired 0.3 deg figure was ~95x
the observed maximum (and 30x the new orb).

SAMPLED, NOT BOUNDED: "largest observed" means largest among the sampled
epochs. A 41-day cadence cannot exclude a larger excursion between samples;
the claim wording and this artifact both stay on the "observed" side of that
line.
