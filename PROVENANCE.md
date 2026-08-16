# Provenance

## Source

Every file in `lib/`, `scripts/` and `docs/evidence/` was extracted from the private DesiUtils
repository at commit `a0d6b62` on `main`.

The Swiss Ephemeris audit recorded in `docs/evidence/ephemeris-calibration/swiss-production-audit.md`
was run by the reviewer against the branch state at `1aafb64`, which is the same production sidereal
path after the nutation-convention and time-split fixes. That artifact states its own provenance and
its own limits; it is reproduced here without edits.

## What was modified for publication

Two files were trimmed. Nothing else was altered, and no file had content added.

**`lib/astrology/ephemeris.ts`, 605 lines to 479.**

Removed lines 481 to 605, the classical Ujjain-1900 mean-longitude block used by the Shadbala
Cheshta construction (`ClassicalMeanPlanet`, `ujjainMeanLongitude`, and the accompanying
calibration notes). None of the three harnesses reference any symbol in that block, and no
retained file in this repository refers to it. It was removed because it is unrelated to these
measurements, not because it is sensitive.

The retained portion ends at line 479, which closes `isRetrograde`. The cut is at a section
boundary, not mid-declaration.

Symbols the harnesses actually use, all retained: `dateToJD`, `utJulianDayToJDE`, `sunLongitude`,
`moonLongitude`, `planetLongitude` from `ephemeris.ts`, and `lahiriAyanamsa` from `ayanamsa.ts`.

**`lib/astrology/astronomia.d.ts`, 174 lines to 135.**

Removed the `astronomia/planetelements` and `astronomia/sunrise` module declarations, neither of
which is imported by anything in this repository. The remaining thirteen declarations cover exactly
the astronomia modules used here. The file is a type declaration for a public MIT package and
contains no DesiUtils logic.

## What was not modified

`lib/astrology/ayanamsa.ts` (84 lines), all three scripts, `swiss-production-audit.md` and every
`horizons-*.txt` and `*.output.json` file are byte-identical to `a0d6b62`.

This includes the wording "AS SHIPPED" in `ephemeris-longitude-calibration.ts` and in the
`description` field of `calibration.output.json`. That phrase dates from the pre-fix investigation
and means as shipped at that time. It was deliberately not rewritten, because editing it would
change the regenerated output and break the byte-identical reproduction the harness exists to
demonstrate. See the pre-fix and post-fix section of the README.

## Not included

`claim-sweep-inventory.md`, which accompanies these files in the source repository, is not
published here. It is an internal work-tracking document mapping filenames, constants, classifiers
and product surfaces across the private codebase. It contributes nothing to numerical
reproducibility. `CLAIM-CHANGES.md` in this repository is the public summary that replaces it.

No Swiss Ephemeris code or data (`sepl_18.se1`, `semo_18.se1`) is redistributed here.

## Integrity

`SHA256SUMS.txt` lists SHA-256 hashes for the retained evidence inputs, meaning the eight
`horizons-*.txt` files and `swiss-production-audit.md`. Verify with:

```bash
npm run verify:hashes
```

The `*.output.json` files are deliberately excluded from the hash manifest because
`npm run reproduce` rewrites them. Their integrity is checked instead by
`git diff --exit-code -- docs/evidence`, which is stronger: it proves they regenerate from the
retained inputs rather than merely proving they have not been edited.
