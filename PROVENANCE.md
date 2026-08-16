# Provenance

## Source

The three measurement harnesses in `scripts/`, both modules in `lib/astrology/`, and every file in
`docs/evidence/` were extracted from the private DesiUtils repository at commit `a0d6b62` on
`main`.

**Not everything here came from that commit.** The following were written specifically for this
public artifact and exist at no upstream commit:

- `scripts/verify-evidence-hashes.mjs`, the evidence hash verifier
- `README.md`, `PROVENANCE.md`, `CLAIM-CHANGES.md`, `THIRD-PARTY-NOTICES.md`, `LICENSE`,
  `CITATION.cff`, `.zenodo.json`, `SHA256SUMS.txt`
- `package.json`, `package-lock.json`, `tsconfig.json`, `.nvmrc`, `.gitignore`

An earlier draft of this file said every `scripts/` file came from `a0d6b62` and that nothing had
content added. Both were wrong, and the verifier is the counterexample.

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

**`lib/astrology/ayanamsa.ts`, two comment corrections, no code change.**

Both were found in review and are documented rather than silently applied. Neither touches
executable code, and `npm run verify` is unaffected.

1. The docblock read "Reference epoch: 1900-01-01 12:00 UT" while the constant beneath it is
   `REF_JD = 2415020.5`, which is 1900-01-01 **00:00** UT and is correctly annotated as such on its
   own line. The docblock contradicted the constant; the docblock was wrong and now states the
   midnight epoch with the JD alongside it.
2. The docblock pointed at `scripts/ayanamsa-linearity-check.ts` for the linearisation-error figure.
   That harness is internal and is not published here, so the reference is now labelled out of
   scope instead of dangling.

## What was not modified

The three measurement harnesses, `swiss-production-audit.md`, and every `horizons-*.txt` and
`*.output.json` file are byte-identical to `a0d6b62`.

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

## Licensing posture, and why no repository-wide licence is declared

This repository is deliberately **mixed-licence**. `LICENSE` grants MIT, and that grant is scoped
in `README.md` and `THIRD-PARTY-NOTICES.md` to the DesiUtils-authored code in `lib/` and `scripts/`.

The eight `horizons-*.txt` files are retained NASA/JPL Horizons responses. No reuse basis is
asserted for them. JPL is a federally funded research and development centre managed by Caltech, a
private institution, and JPL's own guidance states that the federal copyright limitation does not
automatically apply to Caltech-produced material, so the "US Government work, not subject to
copyright" reasoning an earlier draft used does not hold.

**Consequence for Zenodo:** a deposit-wide licence field would assert that licence over every
deposited file, including those. So `.zenodo.json` declares **no** `license`, and `CITATION.cff`
declares no work-wide `license` either. Before enabling the Zenodo integration, either obtain a
specific redistribution basis for the raw responses or split the code and the reference data into
two separately licensed deposits. Until that is resolved, the absence of the field is intentional
and should not be "fixed".

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
