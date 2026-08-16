/**
 * Does our sidereal conversion carry nutation that Swiss Ephemeris's does not?
 * Run:
 *
 *   npx ts-node scripts/sidereal-nutation-convention-probe.ts
 *
 * THE ARITHMETIC, WHICH IS THE WHOLE ARGUMENT.
 *
 *   apparent tropical = mean tropical + dPsi        (dPsi = nutation in longitude)
 *
 *   ours    = apparent tropical - MEAN ayanamsa     (lib/astrology/ayanamsa.ts
 *             = mean tropical + dPsi - mean ayanamsa   toSidereal; lahiriAyanamsa
 *                                                      is a pure linear function
 *                                                      of jd with no nutation term)
 *
 *   Swiss   = apparent tropical - TRUE ayanamsa
 *             = mean tropical + dPsi - (mean ayanamsa + dPsi)
 *             = mean tropical - mean ayanamsa       (nutation cancels)
 *
 *   ours - Swiss = dPsi
 *
 * So if the convention differs in exactly that way, the discrepancy between our
 * sidereal longitudes and Swiss's should BE the nutation in longitude - same
 * magnitude, same distribution, on every body regardless of its own accuracy.
 * Swiss's own programming documentation warns about precisely this: it reports a
 * MEAN ayanamsa but computes sidereal positions with the true one, and tells
 * callers not to subtract the reported mean value from an apparent longitude.
 * That is what our toSidereal does.
 *
 * WHAT THIS SCRIPT CAN AND CANNOT SETTLE. It computes the |dPsi| distribution
 * over the same epochs as the calibration, using the SAME nutation routine the
 * engine itself uses, so it can confirm or refute the magnitude prediction
 * without Swiss Ephemeris installed. It CANNOT tell you which convention is
 * correct for Vedic practice - that is a question about what Lahiri means, not
 * about arithmetic, and answering it needs a direct Swiss comparison (default
 * vs SEFLG_NONUT) and ideally a JHora cross-check.
 *
 * MEASURED 2026-08-16 against an independent Swiss Ephemeris 2.10.03 Lahiri
 * audit of the same 1,782 epochs (reviewer-supplied, not reproduced here):
 *
 *              |dPsi| here     Swiss discrepancy, six non-Moon bodies
 *   median        12.09"                 11.7 - 12.0"
 *   p99           18.41"                 19.0 - 21.8"
 *   max           18.82"                 <= 23.5"
 *
 * The medians agree to within ~0.4". The Swiss p99/max run slightly higher
 * because they also carry each body's own tropical error (1-6"), which stacks
 * on top of dPsi. The six bodies' tropical errors against JPL are 1.2-2.5"
 * median, so nutation - not model error - is the dominant term in that gap.
 *
 * CONSEQUENCE FOR ANY FIX: it belongs at the SIDEREAL-CONVERSION BOUNDARY, not
 * in the tropical engine. The tropical longitudes are already excellent once the
 * time scale is corrected (see scripts/ephemeris-timescale-control.ts: Sun,
 * Mercury, Venus and Mars all fall to <=0.5" largest sampled). Do not perturb
 * them to chase a sidereal output difference.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dateToJD } from "../lib/astrology/ephemeris";
import { lahiriAyanamsa } from "../lib/astrology/ayanamsa";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { nutation } = require("astronomia") as {
  nutation: { nutation: (jde: number) => [number, number] };
};

const EVIDENCE_DIR = join(__dirname, "..", "docs", "evidence", "ephemeris-calibration");
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
const EXPECTED_ROWS = 1782;
const DEG = 180 / Math.PI;

const text = readFileSync(join(EVIDENCE_DIR, "horizons-timescale.txt"), "utf8");
const s = text.indexOf("$$SOE");
const e = text.indexOf("$$EOE");
if (s < 0 || e < 0) throw new Error("horizons-timescale.txt: no $$SOE/$$EOE block.");

const epochs: { jd: number; year: number; dPsiArcsec: number }[] = [];
for (const line of text.slice(s + 5, e).split("\n")) {
  if (line.trim() === "") continue;
  const m = line.match(/^\s(\d{4})-([A-Z][a-z]{2})-(\d{2})\s+(\d{2}):(\d{2})\s+(.*)$/);
  if (!m) throw new Error(`horizons-timescale.txt: unparsed row "${line}"`);
  const [, yy, mon, dd, hh, mi] = m;
  const jd = dateToJD(new Date(Date.UTC(Number(yy), MONTHS[mon], Number(dd), Number(hh), Number(mi))));
  epochs.push({ jd, year: Number(yy), dPsiArcsec: nutation.nutation(jd)[0] * DEG * 3600 });
}
if (epochs.length !== EXPECTED_ROWS) {
  throw new Error(`horizons-timescale.txt: ${epochs.length} rows, expected ${EXPECTED_ROWS}.`);
}

/**
 * POSITIVE CONTROL on the claim that our ayanamsa carries NO nutation term. If
 * lahiriAyanamsa ever gained one, the whole argument above would be void, so it
 * is tested rather than asserted: the function must be exactly linear in jd.
 */
const j0 = 2451545.0;
const slope = lahiriAyanamsa(j0 + 1000) - lahiriAyanamsa(j0);
for (const step of [1, 37, 365.25, 4000, 12000]) {
  const predicted = lahiriAyanamsa(j0) + (slope / 1000) * step;
  const actual = lahiriAyanamsa(j0 + step);
  if (Math.abs(predicted - actual) * 3600 > 1e-6) {
    throw new Error(
      `lahiriAyanamsa is no longer exactly linear (step ${step} d deviates ` +
        `${((predicted - actual) * 3600).toExponential(2)}") - this probe's premise is void.`
    );
  }
}

const abs = epochs.map((x) => Math.abs(x.dPsiArcsec)).sort((a, b) => a - b);
const q = (p: number): number => {
  const i = (abs.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? abs[lo] : abs[lo] + (abs[hi] - abs[lo]) * (i - lo);
};

const output = {
  generatedBy: "scripts/sidereal-nutation-convention-probe.ts",
  note:
    "Magnitude of nutation in longitude over the calibration epochs, computed with the SAME astronomia routine the engine uses. Tests the prediction that (our sidereal - Swiss sidereal) == dPsi, which follows if we subtract a MEAN ayanamsa from an APPARENT tropical longitude while Swiss subtracts a true (nutation-inclusive) one. Confirms magnitude only; it does NOT establish which convention is correct for Vedic practice, which needs a direct Swiss default-vs-NONUT comparison and a JHora cross-check.",
  ayanamsaIsExactlyLinearInJd: true,
  epochs: epochs.length,
  absNutationInLongitudeArcsec: {
    median: Number(q(0.5).toFixed(2)),
    p90: Number(q(0.9).toFixed(2)),
    p99: Number(q(0.99).toFixed(2)),
    max: Number(abs[abs.length - 1].toFixed(2)),
  },
  reviewerSwissAudit: {
    source: "Swiss Ephemeris 2.10.03 Lahiri, same 1782 epochs, reviewer-supplied and NOT reproduced here",
    sixNonMoonBodies: { median: "11.7-12.0", p99: "19.0-21.8", max: "<=23.5" },
    moon: { median: 28.8, p99: 66.5, max: 71.4 },
  },
  openQuestion:
    "Which convention should ship: retain nutation in sidereal, subtract a nutation-inclusive ayanamsa, or keep distinct apparent-tropical and mean-sidereal paths. Any fix belongs at the sidereal-conversion boundary, never in the tropical engine.",
};

writeFileSync(join(EVIDENCE_DIR, "nutation-convention.output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

process.stderr.write(
  `\n|nutation in longitude| over ${epochs.length} epochs:\n` +
    `  median ${q(0.5).toFixed(2)}"  p90 ${q(0.9).toFixed(2)}"  p99 ${q(0.99).toFixed(2)}"  max ${abs[abs.length - 1].toFixed(2)}"\n\n` +
    `reviewer's Swiss sidereal discrepancy, six non-Moon bodies:\n` +
    `  median 11.7-12.0"  p99 19.0-21.8"  max <=23.5"\n\n` +
    `ayanamsa exactly linear in jd (no nutation term): VERIFIED\n`
);
