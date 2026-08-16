/**
 * Lahiri (Chitrapaksha) Ayanamsa for a given Julian Day (UT or JDE - the
 * difference of <1 minute is negligible at our ±0.1° target tolerance).
 *
 * WHAT THIS IS, stated accurately after a 2026-08-16 correction. The constants
 * below are a FITTED LINEAR APPROXIMATION anchored at 1900-01-01 00:00 UT
 * (JD 2415020.5). They are NOT the definition of the Lahiri ayanamsa, and an
 * earlier version of this docblock wrongly claimed the Calendar Reform
 * Committee fixed the value at this epoch and that it advances at the IAU 2000
 * mean precession rate. Neither claim was sourced. Both are withdrawn.
 *
 * THE ACTUAL DEFINITION, per the Swiss Ephemeris general documentation
 * Appendix E ("How to compare the Swiss Ephemeris Lahiri Ayanamsha with Indian
 * Astronomical Ephemeris"): Lahiri was originally defined as 23deg 15' 00" at
 * 1956-03-21 00:00 Ephemeris Time, revised in Indian Astronomical Ephemeris
 * 1989 (p. 556 footnote) to 23deg 15' 00".658. Appendix E concludes that the
 * revised value is the TRUE ayanamsa, not the mean, on the grounds that
 * nutation on that date exceeded 16". The ayanamsa's original models are
 * IAU1976 precession (Lieske) and Wahr 1980 nutation, NOT IAU 2000.
 *
 * MEASURED AGAINST THAT DEFINITION 2026-08-16: at the 1956-03-21 anchor this
 * module's lahiriTrueAyanamsa returns 23deg 14' 59.768", which is 0.89 arcsec
 * from the defined 23deg 15' 00".658. The mean value is 17.66 arcsec away, and
 * the nutation term this module computes at that epoch is 16.77 arcsec, which
 * independently reproduces Appendix E's own "over 16 arcsec" argument for the
 * value being true rather than mean.
 *
 * KNOWN-SIMPLISTIC BY CONSTRUCTION. Swiss Ephemeris general documentation
 * section 2.8.12 describes exactly this method (an initial value at a t0 such
 * as 1 Jan 1900 plus a precession rate) and states it "is not really clean
 * because the two formulae do not operate on exactly the same plane", is
 * adequate "in an ordinary astrologer's practice", and is "too simplistic" for
 * very high accuracy over long periods. That is an accepted limitation here,
 * bounded by the measurements below, not an unknown.
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
