/**
 * Lahiri (Chitrapaksha) Ayanamsa for a given Julian Day (UT or JDE - the
 * difference of <1 minute is negligible at our ±0.1° target tolerance).
 *
 * Reference epoch: 1900-01-01 00:00 UT (JD 2415020.5), matching REF_JD below.
 * The Government of India's
 * Rashtriya Panchang (Calendar Reform Committee 1956) fixed Lahiri
 * ayanamsa at this epoch to the value below, and it advances at the
 * IAU 2000 mean precession rate.
 *
 * MEASURED 2026-08-16 against Swiss Ephemeris 2.10.03 Lahiri over 1,782 epochs
 * spanning 1900-2100: this MEAN model differs from Swiss's MEAN Lahiri by
 * 1.088 arcsec median, 1.922 arcsec at the sampled maximum. (The previous
 * "typically under 0.01 degrees / about 36 arcseconds" was never measured and
 * was conservative by ~19x.) Its linearisation error against the IAU 2006
 * precession polynomial peaks at 1.10 arcsec. (That check was run by
 * scripts/ayanamsa-linearity-check.ts, an internal harness that is OUT OF SCOPE
 * for this published artifact and is not included here.)
 */

import nutation from "astronomia/nutation";

const REF_JD = 2415020.5;            // 1900-01-01 00:00 UT (standard reference)
const REF_AYANAMSA_DEG = 22.460;     // Lahiri at REF_JD
const PRECESSION_ARCSEC_PER_YR = 50.2879;
const PRECESSION_DEG_PER_YR = PRECESSION_ARCSEC_PER_YR / 3600;
const DAYS_PER_YEAR = 365.25;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * MEAN Lahiri ayanamsa - no nutation term, exactly linear in jd.
 *
 * THIS IS THE DISPLAY AND AUDIT VALUE and its meaning must not change. Every
 * published ayanamsa figure, every recorded piece of evidence, and Swiss's own
 * `swe_get_ayanamsa` all mean the MEAN value. Do NOT redefine this as
 * true/apparent - add to the true function below instead.
 *
 * For converting an APPARENT tropical longitude to sidereal, this is the WRONG
 * quantity; use lahiriTrueAyanamsa. See toSidereal.
 */
export function lahiriAyanamsa(jd: number): number {
  const yearsSinceRef = (jd - REF_JD) / DAYS_PER_YEAR;
  return REF_AYANAMSA_DEG + PRECESSION_DEG_PER_YR * yearsSinceRef;
}

/** Nutation in longitude (delta psi) in DEGREES - the same IAU 1980 series the
 *  rest of the engine uses, verified 2026-08-16 to agree with Swiss's nutation
 *  to within 0.018 arcsec over 1,782 epochs. */
export function nutationLongitudeDeg(jde: number): number {
  return nutation.nutation(jde)[0] * RAD_TO_DEG;
}

/**
 * TRUE (apparent) Lahiri ayanamsa = mean + nutation in longitude.
 *
 * WHY THIS EXISTS, and it is the whole correctness story. Our tropical
 * longitudes are APPARENT (they already carry nutation). Subtracting a MEAN
 * ayanamsa from an apparent longitude leaves the nutation in the result:
 *
 *   ours  = (mean tropical + dPsi) - mean ayanamsa   <- nutation RETAINED
 *   Swiss = (mean tropical + dPsi) - true ayanamsa   <- nutation CANCELS
 *
 * so the two differ by exactly dPsi. Measured 2026-08-16: our sidereal output
 * disagreed with Swiss Lahiri by 12.09 arcsec median and up to 18.8 arcsec, and
 * Swiss's own (true - mean) ayanamsa is 12.097 / 18.835 - the same quantity.
 * Swiss's programming documentation warns about precisely this: it reports a
 * mean ayanamsa but computes sidereal positions with the true one.
 *
 * Ship MEAN SIDEREAL, matching Swiss (whose default and NONUT sidereal outputs
 * were verified identical at all 1,782 epochs). Starting from apparent tropical,
 * that means subtracting the TRUE ayanamsa.
 */
export function lahiriTrueAyanamsa(jd: number): number {
  return lahiriAyanamsa(jd) + nutationLongitudeDeg(jd);
}

/**
 * Convert an APPARENT tropical longitude to sidereal (mean Lahiri), degrees.
 *
 * The input is assumed apparent, which every engine longitude helper returns.
 * Feeding a MEAN tropical longitude here would over-subtract nutation.
 */
export function toSidereal(tropicalDeg: number, jd: number): number {
  const ayan = lahiriTrueAyanamsa(jd);
  return ((tropicalDeg - ayan) % 360 + 360) % 360;
}
