/**
 * Calibrates the engine's APPARENT GEOCENTRIC ECLIPTIC LONGITUDE against JPL
 * Horizons, per body, across the full supported window. Run:
 *
 *   npx ts-node scripts/ephemeris-longitude-calibration.ts
 *
 * WHY THIS EXISTS. The site publishes "typical precision within 0.3 degrees of
 * Swiss Ephemeris Lahiri" (lib/blog-content/kundli-calculator-accuracy.tsx) and
 * drives a user-visible boundary warning off the same figure
 * (lib/astrology/birth-star.ts BIRTH_STAR_BOUNDARY_ORB_DEG). That figure is
 * self-labelled in the source as "a DISCLOSED HEURISTIC ... NOT a precise
 * Swiss-calibrated bound" - i.e. nothing has ever measured it. Separately,
 * /about publishes agreement with Jagannatha Hora "to within one arcminute" on
 * two pinned charts. The two have never been reconciled. This measures the
 * quantity both of them are talking about.
 *
 * REFERENCE. JPL Horizons OBSERVER ephemeris, CENTER='500@399' (geocentric),
 * QUANTITIES='31' (ObsEcLon = apparent ecliptic longitude OF DATE, i.e.
 * TROPICAL). That matches what the engine's longitude helpers return, which is
 * why the comparison is apples to apples - the same frame argument
 * scripts/retrograde-parity-sweep.ts makes. The sidereal step (Lahiri ayanamsa)
 * is deliberately NOT in scope here: it is a separate model term with its own
 * separate claim (lib/astrology/ayanamsa.ts, "typically under 0.01 degrees").
 *
 * SAMPLING. 41-day steps over 1900-01-01 to 2100-01-01, 1782 epochs per body.
 * 41 days is deliberately not near a multiple of the synodic (29.53 d),
 * anomalistic (27.55 d) or draconic (27.21 d) month, so the Moon is not
 * repeatedly sampled at the same phase - a 30-day step would have been, since
 * it is 1.016 synodic months.
 *
 * RAHU AND KETU ARE EXCLUDED, AND NOT BY OVERSIGHT. The engine uses the MEAN
 * lunar node, which is a defined series rather than an observable body. Horizons
 * has no "mean node" to compare against, and "accuracy" is not a meaningful
 * frame for a definition - the honest statement is that the mean node is exact
 * with respect to its own formula and differs from the TRUE node by up to
 * ~1.5 degrees by construction. Do not read this script's silence on them as a
 * clean bill of health.
 *
 * THE IMPLIED-TIME-OFFSET COLUMN IS THE DIAGNOSTIC. Dividing each body's
 * longitude error by that body's own instantaneous motion converts the error
 * into the time offset that would explain it. An ephemeris defect would give a
 * different implied offset per body; a clock defect gives a common one. The
 * measured agreement across bodies is therefore strong evidence for a
 * time-scale mismatch - though the bodies' mean motions span roughly 0.5 to
 * 13 deg/day, about 1.4 orders of magnitude, not more, and the per-body offset
 * distributions are broad. Read it as strongly indicative, not as proof that no
 * ephemeris defect could mimic it. Guarded two ways: bodies slower than
 * MIN_MOTION are skipped (a small longitude error over a slow body implies an
 * absurd time), and epochs near a retrograde station are skipped (motion passes
 * through zero, so the quotient diverges).
 *
 * SIGN. The implied offset is the engine's LAG - a negative value means the
 * engine computed the position for an instant EARLIER than it should have. The
 * corrective shift handed to the planetary routines is therefore the NEGATION
 * of it (a measured -61 s lag needs +61 s added to the JD).
 *
 * THREE CLOCKS, AND THIS IS NOT ONE DELTA-T CURVE. Horizons time tags are UT1
 * before 1962, UTC from 1962, and hold the last known TDB-UTC constant once
 * leap-second predictions run out - so the flat era means from ~2025 onward in
 * the output below are HORIZONS FREEZING ITS CONVERSION, not physical delta-T
 * levelling off. Do not describe the era table as "the delta-T curve". The
 * defensible diagnosis is narrower: the planetary routines want a dynamical
 * time (TT/TDB-like JDE) and the chart path hands them a civil/UT-derived JD
 * without converting. Any fix must keep the clocks SEPARATE - planetary
 * positions on TT/TDB, but sidereal time and the Ascendant on UT1 - and modern
 * civil input is UTC, which needs TT-UTC rather than a blind TT-UT1 polynomial.
 *
 * Reference data is retained under docs/evidence/ephemeris-calibration/ and was
 * fetched with (one call per body, COMMAND per BODIES below):
 *   curl -s -G "https://ssd.jpl.nasa.gov/api/horizons.api" \
 *     --data-urlencode "format=text" --data-urlencode "COMMAND='301'" \
 *     --data-urlencode "OBJ_DATA='NO'" --data-urlencode "MAKE_EPHEM='YES'" \
 *     --data-urlencode "EPHEM_TYPE='OBSERVER'" --data-urlencode "CENTER='500@399'" \
 *     --data-urlencode "START_TIME='1900-01-01'" --data-urlencode "STOP_TIME='2100-01-01'" \
 *     --data-urlencode "STEP_SIZE='41 d'" --data-urlencode "QUANTITIES='31'" \
 *     -o docs/evidence/ephemeris-calibration/horizons-moon.txt
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  moonLongitude,
  sunLongitude,
  planetLongitude,
  dateToJD,
} from "../lib/astrology/ephemeris";

const EVIDENCE_DIR = join(__dirname, "..", "docs", "evidence", "ephemeris-calibration");

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

interface Body {
  /** File stem under docs/evidence/ephemeris-calibration/. */
  file: string;
  label: string;
  /** Horizons COMMAND, recorded so the fetch is reproducible from this file. */
  horizonsCommand: string;
  lon: (jde: number) => number;
}

const BODIES: Body[] = [
  { file: "moon", label: "Moon", horizonsCommand: "301", lon: moonLongitude },
  { file: "sun", label: "Sun", horizonsCommand: "10", lon: sunLongitude },
  { file: "mercury", label: "Mercury", horizonsCommand: "199", lon: (j) => planetLongitude("Mercury", j) },
  { file: "venus", label: "Venus", horizonsCommand: "299", lon: (j) => planetLongitude("Venus", j) },
  { file: "mars", label: "Mars", horizonsCommand: "499", lon: (j) => planetLongitude("Mars", j) },
  { file: "jupiter", label: "Jupiter", horizonsCommand: "599", lon: (j) => planetLongitude("Jupiter", j) },
  { file: "saturn", label: "Saturn", horizonsCommand: "699", lon: (j) => planetLongitude("Saturn", j) },
];

/** Below this apparent motion the implied-offset quotient is meaningless. */
const MIN_MOTION_DEG_PER_DAY = 0.05;
/** Centred difference half-width for instantaneous motion, in days. */
const MOTION_H = 0.25;

/** Signed shortest angular difference in degrees, in (-180, 180]. */
function wrapDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

interface Row {
  jdUT: number;
  year: number;
  refLon: number;
}

/** The retained-dataset contract. A parser that silently skips malformed lines
 *  and accepts any nonzero row count cannot tell a good fetch from a truncated
 *  one, so every property this analysis depends on is asserted rather than
 *  assumed. */
const EXPECTED_ROWS = 1782;
const EXPECTED_FIRST = "1900-Jan-01";
const EXPECTED_LAST = "2099-Dec-04";
const EXPECTED_STEP_DAYS = 41;

function assertHeader(text: string, file: string, body: Body): void {
  const need: [string, RegExp][] = [
    ["geocentric center 500@399", /Center-site name|Center body name|500@399|Earth \(399\)/],
    ["UT time type", /Time format\s*:\s*CAL|A\.D\. 1900-Jan-01 00:00:00\.0000 UT/],
    ["ObsEcLon quantity present", /ObsEcLon|Obs Ecl Lon/i],
    [`target ${body.horizonsCommand}`, new RegExp(`Target body name[^\\n]*\\(${body.horizonsCommand}\\)|Revised|${body.label}`, "i")],
  ];
  for (const [what, re] of need) {
    if (!re.test(text)) {
      throw new Error(`horizons-${file}.txt: provenance check failed - could not confirm ${what}.`);
    }
  }
}

function parseHorizons(file: string, body: Body): Row[] {
  const text = readFileSync(join(EVIDENCE_DIR, `horizons-${file}.txt`), "utf8");
  const start = text.indexOf("$$SOE");
  const end = text.indexOf("$$EOE");
  if (start < 0 || end < 0) {
    throw new Error(`horizons-${file}.txt has no $$SOE/$$EOE block - the fetch did not return an ephemeris.`);
  }
  assertHeader(text, file, body);

  const block = text.slice(start + 5, end).split("\n");
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of block) {
    if (line.trim() === "") continue;
    // " 1900-Jan-01 00:00     272.4162663   1.1082671"
    const m = line.match(/^\s(\d{4})-([A-Z][a-z]{2})-(\d{2})\s+(\d{2}):(\d{2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/);
    if (!m) { skipped++; continue; }
    const [, yy, mon, dd, hh, mi, lon] = m;
    const month = MONTHS[mon];
    if (month === undefined) throw new Error(`Unparsed month "${mon}" in horizons-${file}.txt`);
    const date = new Date(Date.UTC(Number(yy), month, Number(dd), Number(hh), Number(mi)));
    rows.push({ jdUT: dateToJD(date), year: Number(yy), refLon: Number(lon) });
  }

  if (skipped > 0) {
    throw new Error(`horizons-${file}.txt: ${skipped} non-empty line(s) inside $$SOE/$$EOE did not parse - the row format changed.`);
  }
  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`horizons-${file}.txt: expected ${EXPECTED_ROWS} rows, parsed ${rows.length} - truncated or re-fetched at a different cadence.`);
  }
  const firstLabel = text.slice(start + 5).match(/\s(\d{4}-[A-Z][a-z]{2}-\d{2})/)?.[1];
  if (firstLabel !== EXPECTED_FIRST) {
    throw new Error(`horizons-${file}.txt: first epoch ${firstLabel}, expected ${EXPECTED_FIRST}.`);
  }
  const lastLine = block.filter((l) => /^\s\d{4}-/.test(l)).pop() ?? "";
  if (!lastLine.includes(EXPECTED_LAST)) {
    throw new Error(`horizons-${file}.txt: last epoch is not ${EXPECTED_LAST}.`);
  }
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].jdUT - rows[i - 1].jdUT;
    if (Math.abs(gap - EXPECTED_STEP_DAYS) > 1e-6) {
      throw new Error(`horizons-${file}.txt: cadence break at row ${i} - gap ${gap} d, expected ${EXPECTED_STEP_DAYS} d.`);
    }
  }
  return rows;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const ERA_WIDTH = 25;
const results = BODIES.map((body) => {
  const rows = parseHorizons(body.file, body);
  const absArcsec: number[] = [];
  let signedSum = 0;
  const impliedOffsets: number[] = [];
  const byEra = new Map<number, number[]>();

  for (const r of rows) {
    // AS SHIPPED: the engine is handed a UT-derived JD in a parameter its own
    // docblocks name `jde` (Terrestrial Time). Reproducing that faithfully is
    // the whole point - this measures what users get, not what the ephemeris
    // could do.
    const engine = body.lon(r.jdUT);
    const errDeg = wrapDeg(engine - r.refLon);
    const errArcsec = errDeg * 3600;

    absArcsec.push(Math.abs(errArcsec));
    signedSum += errArcsec;

    const era = Math.floor(r.year / ERA_WIDTH) * ERA_WIDTH;
    if (!byEra.has(era)) byEra.set(era, []);
    byEra.get(era)!.push(errArcsec);

    // Centred difference for instantaneous apparent motion.
    const motionPerDay =
      wrapDeg(body.lon(r.jdUT + MOTION_H) - body.lon(r.jdUT - MOTION_H)) / (2 * MOTION_H);
    if (Math.abs(motionPerDay) >= MIN_MOTION_DEG_PER_DAY) {
      impliedOffsets.push((errDeg / motionPerDay) * 86400);
    }
  }

  const sorted = [...absArcsec].sort((a, b) => a - b);
  const sortedOffsets = [...impliedOffsets].sort((a, b) => a - b);

  return {
    body: body.label,
    horizonsCommand: body.horizonsCommand,
    epochs: rows.length,
    absErrorArcsec: {
      median: Number(quantile(sorted, 0.5).toFixed(2)),
      p90: Number(quantile(sorted, 0.9).toFixed(2)),
      p95: Number(quantile(sorted, 0.95).toFixed(2)),
      p99: Number(quantile(sorted, 0.99).toFixed(2)),
      max: Number(sorted[sorted.length - 1].toFixed(2)),
    },
    /** Signed mean: a large magnitude here means a SYSTEMATIC bias rather than
     *  scatter, which is what separates a clock error from ephemeris noise. */
    meanSignedErrorArcsec: Number((signedSum / rows.length).toFixed(2)),
    impliedTimeOffsetSeconds: {
      usableEpochs: sortedOffsets.length,
      median: sortedOffsets.length ? Number(quantile(sortedOffsets, 0.5).toFixed(1)) : null,
      p10: sortedOffsets.length ? Number(quantile(sortedOffsets, 0.1).toFixed(1)) : null,
      p90: sortedOffsets.length ? Number(quantile(sortedOffsets, 0.9).toFixed(1)) : null,
    },
    byEra: [...byEra.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([era, errs]) => ({
        era: `${era}-${era + ERA_WIDTH - 1}`,
        epochs: errs.length,
        meanSignedArcsec: Number((errs.reduce((x, y) => x + y, 0) / errs.length).toFixed(2)),
        maxAbsArcsec: Number(Math.max(...errs.map(Math.abs)).toFixed(2)),
      })),
  };
});

const worstP99 = Math.max(...results.map((r) => r.absErrorArcsec.p99));
const worstMax = Math.max(...results.map((r) => r.absErrorArcsec.max));
const sampledPositions = results.reduce((n, r) => n + r.epochs, 0);

const output = {
  generatedBy: "scripts/ephemeris-longitude-calibration.ts",
  note:
    "Engine apparent geocentric ecliptic longitude vs JPL Horizons ObsEcLon (apparent, of date, geocentric = TROPICAL), 1782 epochs per body at 41-day steps over 1900-2100. Measures the engine AS SHIPPED, which passes a UT-derived JD into parameters named jde (Terrestrial Time). Sidereal conversion (Lahiri ayanamsa) is out of scope and carries its own separate claim. Rahu/Ketu excluded: the engine's mean node is a definition, not an observable, so accuracy is not a meaningful frame for it.",
  reference: "JPL Horizons OBSERVER, CENTER='500@399', QUANTITIES='31'",
  referenceFetched: "2026-08-16",
  sampling: { start: "1900-01-01", stopExclusiveish: "2100-01-01", stepDays: 41, epochsPerBody: 1782 },
  /**
   * RECORDED FOR CONTEXT ONLY, AND DELIBERATELY NOT DIVIDED INTO ANYTHING HERE.
   * The 0.3 deg boundary orb is worded against Swiss Ephemeris LAHIRI, i.e.
   * SIDEREAL. Everything measured in this file is TROPICAL, because the
   * ayanamsa step is explicitly out of scope. Emitting a ratio between the two
   * would mix frames, and an earlier revision of this script did exactly that -
   * the caveat lived in the prose while the artifact published the mixed-frame
   * number as a headline. Only a direct Swiss-facing audit can size this orb.
   */
  publishedClaimsForContextOnly: {
    boundaryOrbDeg: 0.3,
    boundaryOrbFrame: "sidereal (Swiss Ephemeris Lahiri) - NOT the frame measured here",
    jhoraParityClaim:
      "within one arcminute on two pinned charts - sidereal and end to end, so also not directly comparable to the tropical figures below",
  },
  headline: {
    frame: "tropical apparent-of-date vs JPL Horizons ObsEcLon",
    sampledPositions,
    /**
     * MAXIMUM OBSERVED, NOT A CONTINUOUS BOUND. A 41-day cadence cannot exclude
     * a larger excursion between samples, so this is a property of the sample,
     * not a proof about the window. Word it as "largest sampled error", never
     * "worst case".
     */
    largestSampledErrorArcsec: Number(worstMax.toFixed(2)),
    worstBodyP99Arcsec: Number(worstP99.toFixed(2)),
  },
  results,
};

const outPath = join(EVIDENCE_DIR, "calibration.output.json");
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

process.stderr.write(
  `\nbody      epochs  median   p95     p99     max     meanSigned  impliedOffset(s) p10/med/p90\n`
);
for (const r of results) {
  const o = r.impliedTimeOffsetSeconds;
  process.stderr.write(
    `${r.body.padEnd(9)} ${String(r.epochs).padStart(5)}  ` +
      `${r.absErrorArcsec.median.toFixed(2).padStart(6)}  ${r.absErrorArcsec.p95.toFixed(2).padStart(6)}  ` +
      `${r.absErrorArcsec.p99.toFixed(2).padStart(6)}  ${r.absErrorArcsec.max.toFixed(2).padStart(7)}  ` +
      `${r.meanSignedErrorArcsec.toFixed(2).padStart(10)}  ` +
      `${o.median === null ? "n/a (too slow)" : `${o.p10}/${o.median}/${o.p90}`}\n`
  );
}
process.stderr.write(
  `\nTROPICAL vs JPL Horizons. ${sampledPositions} sampled positions; ` +
    `largest SAMPLED error ${worstMax.toFixed(2)}", worst-body p99 ${worstP99.toFixed(2)}".\n` +
    `Not compared here to the 0.3 deg orb: that orb is SIDEREAL and this is TROPICAL.\n` +
    `Not a continuous bound - a 41-day cadence cannot exclude a larger excursion between samples.\n${outPath}\n`
);
