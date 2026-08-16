# DesiUtils ephemeris calibration

A frozen calibration artifact. It contains the harnesses, the raw JPL Horizons inputs and the
regenerated outputs behind two defects we found and fixed in the DesiUtils browser ephemeris:
a time-scale defect and a nutation-convention defect.

**This is not the DesiUtils SDK.** It is a single-release evidence package, published so the
measurements can be checked by someone other than us. It is not maintained, takes no feature
requests, and the `lib/` modules here are a subset of a larger private codebase.

## The two findings

**1. UT-tagged Julian days were passed to routines expecting dynamical-time JDE.**

The engine's `dateToJD` returns a UT-based Julian day, and it was handed to parameters whose own
docblocks name them `jde` (Terrestrial Time). Dividing each body's longitude error by that body's
own instantaneous motion converts the error into the time offset that would explain it. On the
retained 1900 to 2100 grid, the five faster bodies imply a consistent lag:

| Body | implied offset, median (s) | p10 | p90 | usable epochs |
|---|---|---|---|---|
| Moon | -61.0 | -73.4 | -19.1 | 1782 |
| Sun | -60.7 | -64.8 | -20.7 | 1782 |
| Mercury | -61.6 | -68.1 | -21.5 | 1754 |
| Venus | -61.9 | -67.5 | -21.6 | 1766 |
| Mars | -60.5 | -67.6 | -22.6 | 1754 |
| Jupiter | -33.6 | -143.8 | +6.9 | 1521 |
| Saturn | -27.5 | -164.0 | +24.3 | 1211 |

Those five bodies differ in speed by more than two orders of magnitude and still agree, which is
what identifies the cause as a clock rather than an ephemeris. Jupiter and Saturn are listed for
completeness and are **not** evidence for the offset: they are slow enough that dividing a small
error by a small motion is dominated by noise, which their p10/p90 spreads show directly.

**The offset is not a constant.** It tracks delta-T and is epoch-dependent. The Moon's mean signed
error ramps from -7.03 arcsec over 1900 to 1924 to -38.76 arcsec over 2025 to 2049. Do not quote
"a 61 second offset" as a fixed property of anything. The median over this particular grid is
roughly 61 seconds; that is the whole claim.

**2. Sidereal longitudes retained nutation in longitude.**

`toSidereal` subtracted a mean ayanamsa from an apparent (nutation-included) tropical longitude, so
nutation in longitude survived into the sidereal result instead of cancelling. Swiss Ephemeris'
own programming documentation warns against exactly this: it reports a mean ayanamsa but computes
sidereal positions with the true one, and tells callers not to subtract the reported mean value
from an apparent longitude.

`sidereal-nutation-convention-probe.ts` computes the |dPsi| distribution over the same epochs using
the same nutation routine the engine uses, and confirms the magnitude prediction.

## What is and is not reproducible here

This distinction is the point of the repository, so it is stated before the instructions.

**Reproducible from this repository:**

- the tropical calibration against JPL Horizons (`calibration.output.json`)
- the corrected-residual control, including the production time conversion (`timescale-control.output.json`)
- the |dPsi| distribution that predicts the sidereal discrepancy (`nutation-convention.output.json`)

**Not reproducible from this repository:**

- **the Swiss Ephemeris confirmation matrix.** The per-body by regime matrix in
  `docs/evidence/ephemeris-calibration/swiss-production-audit.md` was run externally by a reviewer
  against Swiss Ephemeris 2.10.03 with the `sepl_18.se1` and `semo_18.se1` data files. It is
  **reviewer-reported and not reproduced here.** No script in this repository invokes Swiss
  Ephemeris or recreates that matrix, and no Swiss code or data is redistributed.

So: the `dPsi` prediction is reproducible; the Swiss confirmation matrix is reviewer-reported and
not reproduced here. `sidereal-nutation-convention-probe.ts` says the same thing in its own
docblock and labels the embedded figures `reviewerSwissAudit` in its output. That labelling is
deliberate and should not be read as an oversight.

Adding a harness that drives a user-supplied Swiss installation, without redistributing Swiss code
or data, would close this gap. It is not in this release.

## Pre-fix and post-fix state

A reviewer could otherwise reasonably object that the harness manufactures a defect the published
source does not contain. It does not, and both states are present:

- `lib/` is the **post-fix** source. It exports `utJulianDayToJDE`, and production converts through
  it before sampling.
- `scripts/ephemeris-longitude-calibration.ts` is a **pre-fix control**. It deliberately passes the
  raw UT-derived JD into the `jde` parameter to reconstruct the call path as it shipped before the
  fix. Its comments and the `description` field of `calibration.output.json` say "AS SHIPPED",
  which means as shipped at the time of the investigation, not as shipped today.
- `scripts/ephemeris-timescale-control.ts` measures **both** legs. Line 262 evaluates through
  `utJulianDayToJDE`, which is the conversion production now uses.

The scripts and the evidence files are byte-identical to their state in the source repository. They
were not edited for publication, which is why the stale "AS SHIPPED" wording was left in place
rather than rewritten. See `PROVENANCE.md` for commit provenance and hashes.

## Layout

```
lib/astrology/ephemeris.ts       trimmed, see PROVENANCE.md
lib/astrology/ayanamsa.ts        verbatim
lib/astrology/astronomia.d.ts    trimmed, see PROVENANCE.md
scripts/                         three harnesses, verbatim
docs/evidence/ephemeris-calibration/
    swiss-production-audit.md    reviewer-reported Swiss matrix
    horizons-*.txt               raw JPL Horizons fetches, 8 files
    *.output.json                regenerated by npm run reproduce
```

## Reproducing

Requires Node 22.15.1 (see `.nvmrc`). Exact dependency versions are pinned in `package.json` and
locked in `package-lock.json`.

```bash
npm ci
npm run verify
```

`npm run verify` runs, in order: `tsc --noEmit`, a SHA-256 check of the retained evidence inputs,
all three harnesses, and `git diff --exit-code -- docs/evidence`. A clean exit means the committed
outputs regenerate byte-for-byte from the committed inputs.

The steps can be run individually with `npm run typecheck`, `npm run verify:hashes` and
`npm run reproduce`.

## Scope and exclusions

- **Rahu and Ketu are excluded, and not by oversight.** The engine uses the mean lunar node, which
  is a defined series rather than an observable body. Horizons has no mean node to compare against,
  and accuracy is not a meaningful frame for a definition. Do not read the silence as a clean bill
  of health.
- **The 41-day sampling cadence is deliberate.** It is not near a multiple of the synodic (29.53 d),
  anomalistic (27.55 d) or draconic (27.21 d) month, so the Moon is not repeatedly sampled at the
  same phase. A 30-day step would have been, at 1.016 synodic months.
- **Sampled, not bounded.** A 41-day cadence cannot exclude a larger excursion between samples.
  Every figure here is a largest *sampled* value.
- **Nothing here is claimed from 2032 onward.** Past 2032 the astronomia and Swiss delta-T models
  diverge and neither is truth; the divergence in the 2032+ column of the Swiss matrix is model
  disagreement, not ephemeris error.

## Licence and third-party material

The DesiUtils code in `lib/` and `scripts/` is MIT licensed. See `LICENSE`.

`astronomia` is a separate MIT-licensed package and is not vendored here. The `horizons-*.txt`
files are retained responses from NASA JPL Horizons. See `THIRD-PARTY-NOTICES.md`.

Claim changes on the public site that followed from this work are summarised in `CLAIM-CHANGES.md`.
