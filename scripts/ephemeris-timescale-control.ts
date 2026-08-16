/**
 * Closes the causal chain on the engine's longitude error: raw error, Horizons'
 * own per-epoch TDB-UT, the corrective sign, and the CORRECTED residual per
 * body. Run:
 *
 *   npx ts-node scripts/ephemeris-timescale-control.ts
 *
 * WHY THIS EXISTS SEPARATELY. scripts/ephemeris-longitude-calibration.ts
 * measures the shipped engine and infers, from the fact that several bodies
 * imply a common time offset, that the cause is a time-scale mismatch. That is
 * indicative, not decisive: it never fetched an independent clock value and
 * never re-ran corrected. A previously quoted "corrected residual ~2.5 arcsec"
 * came from an UNCOMMITTED three-epoch probe with a hardcoded 57 s and is not
 * evidence. This script supplies the missing legs, and whatever it prints is
 * the number - the 2.5" figure is not preserved unless reproduced here.
 *
 * THE CLOCK VALUE IS MEASURED, NOT MODELLED. horizons-timescale.txt is a
 * separate OBSERVER fetch at the SAME cadence with QUANTITIES='30,31', so
 * TDB-UT comes from Horizons itself rather than from any delta-T polynomial of
 * ours. That matters: the panchang cluster has its own live delta-T model work,
 * and this deliberately does not depend on or duplicate it. TDB-UT is
 * EPOCH-dependent and not body-dependent, so one aligned dataset corrects all
 * seven bodies - and epoch alignment is asserted row by row rather than
 * assumed.
 *
 * THE CORRECTION, AND ITS SIGN. Horizons time tags are UT; its internal
 * computation is at TDB = tag + (TDB-UT). The engine is handed the UT-derived
 * JD in a parameter its docblocks name `jde`. So the corrected call is
 *
 *   jde = jdTimeTag + tdbMinusUtSeconds / 86400
 *
 * i.e. the correction ADDS the (positive, post-1902) offset. The implied lag
 * reported by the sibling script is the NEGATION of this, which is why it reads
 * about -61 s where TDB-UT is about +64 s.
 *
 * SCOPE - THIS CORRECTS PLANETARY POSITIONS ONLY. Sidereal time and the
 * Ascendant are functions of UT1 and MUST NOT be shifted by this quantity; a
 * real fix has to carry two clocks, not one. Nothing here touches those paths,
 * and nothing here changes engine behaviour - it is a measurement.
 *
 * WHAT TDB-UT IS NOT. Horizons' own header states the value is with respect to
 * UT1, that the 0.002 s TT-vs-TDB distinction is not maintained, and that its
 * time tags are UT1 before 1962 and UTC from 1962. It also holds the last known
 * value constant once leap-second predictions end - visible in the data as
 * 69.182665 s at 2049 and 69.183148 s at 2099. So the flat modern tail is
 * HORIZONS FREEZING, and a corrected residual in that era inherits that freeze
 * rather than proving anything about real future clocks.
 *
 * POSITIVE CONTROL. The RAW leg must reproduce the committed
 * calibration.output.json medians and maxima exactly. These are two independent
 * parsers over the same files; if they disagree, one of them is wrong and the
 * corrected numbers cannot be trusted either. The script throws on mismatch.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  moonLongitude,
  sunLongitude,
  planetLongitude,
  dateToJD,
  utJulianDayToJDE,
} from "../lib/astrology/ephemeris";
import julian from "astronomia/julian";
import deltatData from "astronomia/data/deltat";
import committed from "../docs/evidence/ephemeris-calibration/calibration.output.json";

const EVIDENCE_DIR = join(__dirname, "..", "docs", "evidence", "ephemeris-calibration");
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
const EXPECTED_ROWS = 1782;
const MIN_MOTION_DEG_PER_DAY = 0.05;
const MOTION_H = 0.25;

const BODIES: { file: string; label: string; lon: (jde: number) => number }[] = [
  { file: "moon", label: "Moon", lon: moonLongitude },
  { file: "sun", label: "Sun", lon: sunLongitude },
  { file: "mercury", label: "Mercury", lon: (j) => planetLongitude("Mercury", j) },
  { file: "venus", label: "Venus", lon: (j) => planetLongitude("Venus", j) },
  { file: "mars", label: "Mars", lon: (j) => planetLongitude("Mars", j) },
  { file: "jupiter", label: "Jupiter", lon: (j) => planetLongitude("Jupiter", j) },
  { file: "saturn", label: "Saturn", lon: (j) => planetLongitude("Saturn", j) },
];

const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

function quantile(sorted: number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Epoch key "YYYY-Mon-DD HH:MM" so alignment is compared on the tag itself,
 *  not on a float derived from it. */
function readBlock(file: string): { key: string; jdUT: number; cols: number[] }[] {
  const text = readFileSync(join(EVIDENCE_DIR, file), "utf8");
  const s = text.indexOf("$$SOE");
  const e = text.indexOf("$$EOE");
  if (s < 0 || e < 0) throw new Error(`${file}: no $$SOE/$$EOE block.`);
  const out: { key: string; jdUT: number; cols: number[] }[] = [];
  let skipped = 0;
  for (const line of text.slice(s + 5, e).split("\n")) {
    if (line.trim() === "") continue;
    const m = line.match(/^\s(\d{4})-([A-Z][a-z]{2})-(\d{2})\s+(\d{2}):(\d{2})\s+(.*)$/);
    if (!m) { skipped++; continue; }
    const [, yy, mon, dd, hh, mi, rest] = m;
    const cols = rest.trim().split(/\s+/).map(Number);
    if (cols.some(Number.isNaN)) { skipped++; continue; }
    out.push({
      key: `${yy}-${mon}-${dd} ${hh}:${mi}`,
      jdUT: dateToJD(new Date(Date.UTC(Number(yy), MONTHS[mon], Number(dd), Number(hh), Number(mi)))),
      cols,
    });
  }
  if (skipped > 0) throw new Error(`${file}: ${skipped} non-empty line(s) failed to parse.`);
  if (out.length !== EXPECTED_ROWS) throw new Error(`${file}: ${out.length} rows, expected ${EXPECTED_ROWS}.`);
  return out;
}

// Time-scale control: columns are [TDB-UT, ObsEcLon, ObsEcLat].
const clock = readBlock("horizons-timescale.txt");

/**
 * The SHIPPED clock's regimes, per the panchang cluster's Q9 B3 Revision 5
 * (q9-deltat-error-probe.md; measured boundary steps +0.0026 s at 1973.0849,
 * -1.0036 s at 2023.0788, +8.4844 s at 2032.0000). astronomia's deltaT selects
 * a branch by decimal year, so the production error is DISCONTINUOUS, not one
 * number - which is why the shipped leg below is reported per regime rather
 * than pooled.
 *
 * NAMING CAVEAT: the fourth bin actually spans TWO astronomia branches -
 * poly2000 runs only to dyear < 2050, then a further branch carries 2050-2099.
 * They JOIN SMOOTHLY: the 2050 transition measured +0.011 s on this chain
 * (+0.0030 s in the panchang session's measurement; both ~0.01" of Moon), so
 * unlike 2032 there is no step and one bin does not mix a discontinuity. The
 * key keeps its name for artifact stability.
 *
 * ATTRIBUTION BOUNDARY: Rev 5's evidence stops at 2033.75 (deltat.preds'
 * horizon; supported window [1900, 2033-01-01)). Its +8.3 to +8.9 s poly2000
 * figures are measured over 2032.00-2033.75 against USNO's forecast. Every
 * deep-century figure - the ~133 s spread at 2099 and the 31"/86" shipped Moon
 * statistics - is THIS script's measurement against the frozen Horizons
 * conversion, and must not be cited to Rev 5.
 *
 * CLASSIFICATION IS THE PRODUCTION CONVERSION, NOT AN APPROXIMATION. An
 * earlier revision classified with (jd - epoch)/365.25 against hardcoded
 * boundaries; review pointed out that a single misplaced row CAN move max and
 * p99 in the 79-row prediction bin, so "approximate but harmless" was a false
 * comfort even though the committed statistics happened to be unaffected.
 * Rows are now binned by the same CalendarGregorian.fromJD().toYear() the
 * shipped delta-T chain uses, and the two step boundaries are LOCATED on the
 * shipped chain at runtime by dense scan + refinement, then ASSERTED against
 * Rev 5's independently measured values. An astronomia upgrade that moves a
 * boundary or step magnitude fails those assertions loudly - which is the
 * enforceable form of the data.last version-bump watch in
 * lib/astrology/ephemeris.ts.
 */
const deltaTSecondsAt = (jd: number): number => (utJulianDayToJDE(jd) - jd) * 86400;
/** Production decimal year - the exact quantity astronomia's branch selection
 *  consumes. Fresh instance per call (toJDE mutates; toYear does not, but
 *  uniformity is cheaper than remembering the distinction). */
const dyearOf = (jd: number): number => new julian.CalendarGregorian().fromJD(jd).toYear();
const jdAtDyearApprox = (y: number): number => 2415020.5 + (y - 1900) * 365.25;

/** Locate a delta-T step by widest-jump dense scan, then halving refinement. */
function locateStep(loJd: number, hiJd: number): { dyear: number; stepSeconds: number } {
  let bestJd = loJd;
  for (let w = 2; w > 1e-6; w /= 2) {
    let bestJump = 0;
    const from = w === 2 ? loJd : Math.max(loJd, bestJd - 40 * w);
    const to = w === 2 ? hiJd : Math.min(hiJd, bestJd + 40 * w);
    for (let x = from; x <= to; x += w) {
      const j = Math.abs(deltaTSecondsAt(x + w) - deltaTSecondsAt(x));
      if (j > bestJump) { bestJump = j; bestJd = x; }
    }
  }
  return {
    dyear: dyearOf(bestJd + 1e-5),
    stepSeconds: deltaTSecondsAt(bestJd + 1e-4) - deltaTSecondsAt(bestJd - 1e-4),
  };
}

const dataToPrediction = locateStep(jdAtDyearApprox(2022.5), jdAtDyearApprox(2024.0));
const predictionToPoly = locateStep(jdAtDyearApprox(2031.5), jdAtDyearApprox(2032.5));
/** Rev 5's independently measured boundaries - the assertion oracle. */
const REV5 = {
  dataToPrediction: { dyear: 2023.0788, stepSeconds: -1.0036 },
  predictionToPoly: { dyear: 2032.0, stepSeconds: 8.4844 },
};
for (const [name, located, expected] of [
  ["data->prediction", dataToPrediction, REV5.dataToPrediction],
  ["prediction->poly2000", predictionToPoly, REV5.predictionToPoly],
] as const) {
  if (Math.abs(located.dyear - expected.dyear) > 0.002) {
    throw new Error(
      `${name} boundary located at dyear ${located.dyear.toFixed(5)}, Rev 5 measured ${expected.dyear} - ` +
        `astronomia's branch table has MOVED (see the version-bump watch in lib/astrology/ephemeris.ts).`
    );
  }
  if (Math.abs(located.stepSeconds - expected.stepSeconds) > 0.3) {
    throw new Error(
      `${name} step is ${located.stepSeconds.toFixed(4)} s, Rev 5 measured ${expected.stepSeconds} s - ` +
        `the delta-T model changed underneath the regime table.`
    );
  }
}

const REGIMES = [
  // data.first read from the shipped data module itself - exact, not hardcoded.
  { key: "pre1973", until: deltatData.data.first },
  { key: "data1973to2023", until: dataToPrediction.dyear },
  { key: "prediction2023to2032", until: predictionToPoly.dyear },
  { key: "poly2000from2032", until: Infinity },
] as const;
const regimeOf = (jdUT: number): string => {
  const y = dyearOf(jdUT);
  for (const r of REGIMES) if (y < r.until) return r.key;
  return REGIMES[REGIMES.length - 1].key;
};

const results = BODIES.map((body) => {
  // Body files: columns are [ObsEcLon, ObsEcLat].
  const rows = readBlock(`horizons-${body.file}.txt`);

  const rawAbs: number[] = [];
  const corrAbs: number[] = [];
  const shippedAbs: number[] = [];
  const offsetVsClock: number[] = [];
  let rawSigned = 0;
  let corrSigned = 0;
  const corrByRegime = new Map<string, number[]>();
  const shippedByRegime = new Map<string, number[]>();
  for (const r of REGIMES) {
    corrByRegime.set(r.key, []);
    shippedByRegime.set(r.key, []);
  }

  for (let i = 0; i < rows.length; i++) {
    // EXACT epoch alignment, asserted per row against the clock dataset.
    if (rows[i].key !== clock[i].key) {
      throw new Error(
        `Epoch misalignment at row ${i}: ${body.file} has ${rows[i].key}, timescale has ${clock[i].key}.`
      );
    }
    const refLon = rows[i].cols[0];
    const tdbMinusUt = clock[i].cols[0];
    const jdUT = rows[i].jdUT;

    const rawErrDeg = wrapDeg(body.lon(jdUT) - refLon);
    // The correction ADDS TDB-UT. Planetary positions only - NOT sidereal time,
    // NOT the Ascendant.
    const jde = jdUT + tdbMinusUt / 86400;
    const corrErrDeg = wrapDeg(body.lon(jde) - refLon);

    // THE SHIPPED PATH: what production actually computes, astronomia's deltaT
    // via utJulianDayToJDE. Against the same Horizons reference this leg
    // carries BOTH the ephemeris truncation AND the astronomia-vs-Horizons
    // clock disagreement - which is the quantity users actually receive.
    const shippedErrDeg = wrapDeg(body.lon(utJulianDayToJDE(jdUT)) - refLon);

    const regime = regimeOf(jdUT);
    rawAbs.push(Math.abs(rawErrDeg) * 3600);
    corrAbs.push(Math.abs(corrErrDeg) * 3600);
    shippedAbs.push(Math.abs(shippedErrDeg) * 3600);
    corrByRegime.get(regime)!.push(Math.abs(corrErrDeg) * 3600);
    shippedByRegime.get(regime)!.push(Math.abs(shippedErrDeg) * 3600);
    rawSigned += rawErrDeg * 3600;
    corrSigned += corrErrDeg * 3600;

    // Does the offset inferred from the raw error actually equal -(TDB-UT)?
    const motionPerDay = wrapDeg(body.lon(jdUT + MOTION_H) - body.lon(jdUT - MOTION_H)) / (2 * MOTION_H);
    if (Math.abs(motionPerDay) >= MIN_MOTION_DEG_PER_DAY) {
      const inferred = (rawErrDeg / motionPerDay) * 86400;
      offsetVsClock.push(inferred + tdbMinusUt); // ~0 if the clock fully explains it
    }
  }

  const rawSorted = [...rawAbs].sort((a, b) => a - b);
  const corrSorted = [...corrAbs].sort((a, b) => a - b);
  const shippedSorted = [...shippedAbs].sort((a, b) => a - b);
  const residSorted = [...offsetVsClock].sort((a, b) => a - b);
  const regimeStats = (m: Map<string, number[]>) =>
    REGIMES.map((r) => {
      const v = [...m.get(r.key)!].sort((a, b) => a - b);
      return {
        regime: r.key,
        epochs: v.length,
        medianArcsec: v.length ? Number(quantile(v, 0.5).toFixed(2)) : null,
        p99Arcsec: v.length ? Number(quantile(v, 0.99).toFixed(2)) : null,
        largestSampledArcsec: v.length ? Number(v[v.length - 1].toFixed(2)) : null,
      };
    });

  return {
    body: body.label,
    epochs: rows.length,
    raw: {
      medianArcsec: Number(quantile(rawSorted, 0.5).toFixed(2)),
      p99Arcsec: Number(quantile(rawSorted, 0.99).toFixed(2)),
      largestSampledArcsec: Number(rawSorted[rawSorted.length - 1].toFixed(2)),
      meanSignedArcsec: Number((rawSigned / rows.length).toFixed(2)),
    },
    corrected: {
      medianArcsec: Number(quantile(corrSorted, 0.5).toFixed(2)),
      p99Arcsec: Number(quantile(corrSorted, 0.99).toFixed(2)),
      largestSampledArcsec: Number(corrSorted[corrSorted.length - 1].toFixed(2)),
      meanSignedArcsec: Number((corrSigned / rows.length).toFixed(2)),
      /** Answers the panchang cluster's question directly: the Horizons-clock
       *  correction is per-epoch measured TDB-UT, NOT a model, so there is no
       *  post-2032 model tail here BY CONSTRUCTION - and these bins prove it
       *  rather than assert it. */
      byRegime: regimeStats(corrByRegime),
    },
    /** What production computes: utJulianDayToJDE (astronomia deltaT). Carries
     *  ephemeris truncation PLUS astronomia-vs-Horizons clock disagreement,
     *  which is regime-structured - pool these and the number lies. */
    shipped: {
      medianArcsec: Number(quantile(shippedSorted, 0.5).toFixed(2)),
      p99Arcsec: Number(quantile(shippedSorted, 0.99).toFixed(2)),
      largestSampledArcsec: Number(shippedSorted[shippedSorted.length - 1].toFixed(2)),
      byRegime: regimeStats(shippedByRegime),
    },
    medianImprovementFactor: Number(
      (quantile(rawSorted, 0.5) / Math.max(quantile(corrSorted, 0.5), 1e-9)).toFixed(1)
    ),
    /** Inferred offset + TDB-UT. Near zero means Horizons' own clock value fully
     *  accounts for the raw error on this body. */
    inferredOffsetMinusClockSeconds: residSorted.length
      ? {
          usableEpochs: residSorted.length,
          median: Number(quantile(residSorted, 0.5).toFixed(2)),
          p10: Number(quantile(residSorted, 0.1).toFixed(2)),
          p90: Number(quantile(residSorted, 0.9).toFixed(2)),
        }
      : null,
  };
});

/**
 * POSITIVE CONTROL against the sibling artifact. Two independent parsers over
 * the same files must agree on the raw leg, or neither result is trustworthy.
 */
const mismatches: string[] = [];
for (const r of results) {
  const prior = (committed.results as { body: string; absErrorArcsec: { median: number; p99: number; max: number } }[])
    .find((p) => p.body === r.body);
  if (!prior) { mismatches.push(`${r.body}: absent from calibration.output.json`); continue; }
  if (Math.abs(prior.absErrorArcsec.median - r.raw.medianArcsec) > 0.01) {
    mismatches.push(`${r.body} median: ${r.raw.medianArcsec} vs committed ${prior.absErrorArcsec.median}`);
  }
  if (Math.abs(prior.absErrorArcsec.max - r.raw.largestSampledArcsec) > 0.01) {
    mismatches.push(`${r.body} max: ${r.raw.largestSampledArcsec} vs committed ${prior.absErrorArcsec.max}`);
  }
}
if (mismatches.length > 0) {
  throw new Error(
    `RAW leg does not reproduce calibration.output.json - the two parsers disagree, so the corrected ` +
      `numbers cannot be trusted either:\n  ${mismatches.join("\n  ")}`
  );
}

/**
 * WITNESS: the 2032 branch step lands INSIDE one civil day. astronomia selects
 * its deltaT branch on the UTC-derived decimal year, and dyear 2032.0 is
 * 2032-01-01T00:00Z = 05:30 IST - so two births on the SAME local date
 * 2032-01-01, at 05:00 and 06:00 IST, take different branches. Panchang Q9 B3
 * Revision 5 measured the step at +8.4844 s (~4.66" of Moon motion). Asserted
 * as a bounded VALUE, not mere finiteness: the mutation hazard taught that a
 * wrong deltaT can still look plausible, so a guard must pin magnitude.
 */
const jd0500IST = dateToJD(new Date(Date.UTC(2031, 11, 31, 23, 30))); // 2032-01-01 05:00 IST
const jd0600IST = dateToJD(new Date(Date.UTC(2032, 0, 1, 0, 30)));   // 2032-01-01 06:00 IST
const deltaTAt = (jd: number): number => (utJulianDayToJDE(jd) - jd) * 86400;
const branchStepSeconds = deltaTAt(jd0600IST) - deltaTAt(jd0500IST);
// One hour of real deltaT drift is microseconds, so the difference IS the step.
if (branchStepSeconds < 8.0 || branchStepSeconds > 9.0) {
  throw new Error(
    `2032 branch-step witness failed: measured ${branchStepSeconds.toFixed(4)} s between ` +
      `05:00 and 06:00 IST on 2032-01-01, expected ~8.48 s (panchang Q9 B3 Rev 5). ` +
      `Either astronomia's branch table changed or the shipped chain no longer selects by dyear.`
  );
}

const output = {
  generatedBy: "scripts/ephemeris-timescale-control.ts",
  note:
    "Raw vs time-scale-corrected engine longitude error against JPL Horizons. The clock value is Horizons' own per-epoch TDB-UT (QUANTITIES='30'), not a modelled delta-T. Correction is jde = jdTimeTag + tdbMinusUtSeconds/86400, applied to PLANETARY POSITIONS ONLY - sidereal time and the Ascendant are UT1 functions and must not be shifted by it. Horizons freezes TDB-UT once leap-second predictions end (69.182665 s at 2049, 69.183148 s at 2099), so corrected figures in the modern tail inherit that freeze. All figures are over sampled positions at a 41-day cadence and are NOT continuous bounds. The shipped leg runs the PRODUCTION helper (astronomia deltaT) against the same reference, binned by the model branch regimes measured in panchang Q9 B3 Rev 5; past 2032 neither astronomia nor the frozen Horizons conversion is truth, so that regime quantifies model disagreement, not error. Attribution: Rev 5 evidence stops at 2033.75; all deep-century figures are this script own measurement. The 2050 poly2000 hand-off joins smoothly (~0.01 s) - only 2032 steps.",
  rawLegReproducesCommittedArtifact: true,
  correction: "jde = jdTimeTag + tdbMinusUtSeconds / 86400 (ADDS the offset; the inferred lag is its negation)",
  clockSource: "docs/evidence/ephemeris-calibration/horizons-timescale.txt (OBSERVER, QUANTITIES='30,31', same cadence)",
  sampledPositions: results.reduce((n, r) => n + r.epochs, 0),
  /** Regime boundaries as USED for binning: data.first from the shipped data
   *  module; the two step boundaries LOCATED on the shipped chain and asserted
   *  against Rev 5. */
  regimeBoundaries: {
    dataFirstDyear: Number(deltatData.data.first.toFixed(5)),
    dataToPrediction: { dyear: Number(dataToPrediction.dyear.toFixed(5)), stepSeconds: Number(dataToPrediction.stepSeconds.toFixed(4)) },
    predictionToPoly: { dyear: Number(predictionToPoly.dyear.toFixed(5)), stepSeconds: Number(predictionToPoly.stepSeconds.toFixed(4)) },
  },
  /** The 2032-01-01 intra-civil-day branch discontinuity, witnessed on the
   *  SHIPPED helper. Same local date, 05:00 vs 06:00 IST. */
  branchStepWitness2032: {
    localDate: "2032-01-01 (IST)",
    deltaTAt0500ISTSeconds: Number(deltaTAt(jd0500IST).toFixed(4)),
    deltaTAt0600ISTSeconds: Number(deltaTAt(jd0600IST).toFixed(4)),
    stepSeconds: Number(branchStepSeconds.toFixed(4)),
    moonArcsecEquivalent: Number((branchStepSeconds * 0.549).toFixed(2)),
  },
  results,
};

writeFileSync(join(EVIDENCE_DIR, "timescale-control.output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

process.stderr.write(
  `\n${"body".padEnd(9)} ${"raw med".padStart(8)} ${"raw p99".padStart(8)} ${"raw max".padStart(8)}  |  ` +
    `${"corr med".padStart(8)} ${"corr p99".padStart(8)} ${"corr max".padStart(8)}  gain  inferred-clock(s)\n`
);
for (const r of results) {
  const d = r.inferredOffsetMinusClockSeconds;
  process.stderr.write(
    `${r.body.padEnd(9)} ${r.raw.medianArcsec.toFixed(2).padStart(8)} ${r.raw.p99Arcsec.toFixed(2).padStart(8)} ` +
      `${r.raw.largestSampledArcsec.toFixed(2).padStart(8)}  |  ` +
      `${r.corrected.medianArcsec.toFixed(2).padStart(8)} ${r.corrected.p99Arcsec.toFixed(2).padStart(8)} ` +
      `${r.corrected.largestSampledArcsec.toFixed(2).padStart(8)}  ${String(r.medianImprovementFactor).padStart(5)}x  ` +
      `${d ? `${d.p10}/${d.median}/${d.p90}` : "n/a"}\n`
  );
}
process.stderr.write(`\nraw leg reproduces calibration.output.json: YES\n`);
