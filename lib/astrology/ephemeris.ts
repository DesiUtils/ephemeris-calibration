/**
 * Astronomical ephemeris wrapper around `astronomia` (Meeus-based, MIT-licensed).
 *
 * Responsibilities:
 *  - compute tropical apparent geocentric ecliptic longitude of all 9 Vedic
 *    grahas (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu)
 *    at a given Julian Day in UT
 *  - detect retrograde motion via a centred longitude delta (see isRetrograde)
 *  - compute tropical ascendant (Lagna) from LST + latitude + obliquity
 *  - expose Julian Day helpers (UT birth moment → JD)
 *
 * Sidereal conversion (subtract Lahiri ayanamsa) lives in ayanamsa.ts and is
 * called by higher-level computation layers (calculations.ts).
 *
 * ======================================================================
 * ACCURACY TEST RESULTS (run 2026-04-22 via scripts/astrology-accuracy-test.mjs)
 *
 *   Test 1: 15 Aug 1947, 00:00 IST, New Delhi  (JD_UT 2432412.2708333)
 *     Expected Lagna: Taurus 8-10 deg     | Actual: Taurus 7.73 deg  (0.27 deg short)
 *     Expected Sun:   Cancer 28-29 deg     | Actual: Cancer 27.99 deg (0.01 deg short)
 *     Expected Moon:  Cancer + Pushya      | Actual: Cancer + Pushya           OK
 *     Expected Vaara: Friday               | Actual: Friday                    OK
 *
 *   Test 2: 17 Sep 1950, 11:00 IST, Vadnagar (JD_UT 2433541.729167)
 *     Expected Lagna: Scorpio 14-17 deg    | Actual: Scorpio 1.25 deg          MISMATCH
 *     Expected Moon:  Scorpio + Anuradha   | Actual: Scorpio + Anuradha        OK
 *     Expected Sun:   Virgo                | Actual: Virgo                     OK
 *     Note: Modi's birth time is famously disputed. Our Lagna crosses Libra->Scorpio
 *     right around 11:00 IST per the Meeus engine. The "14-17 deg" expected value
 *     is consistent with a birth time near 11:55-12:05 IST, not 11:00. Treated as
 *     test-data ambiguity, not an engine defect.
 *
 *   Test 3: 24 Apr 1973, 17:00 IST, Mumbai  (JD_UT 2441796.979167)
 *     Expected Lagna: Virgo/Libra boundary | Actual: Virgo 13.84 deg           OK
 *     Expected Moon:  Sag + PurvaAshadha   | Actual: Sag + Purva Ashadha       OK
 *     Expected Sun:   Aries                | Actual: Aries                     OK
 *     Cross-check vs widely published Tendulkar chart: Mars 26.82 Cap (pub ~26-27),
 *     Jupiter 16.62 Cap (~15-17), Saturn 24.28 Tau (~24-25), Venus 14.47 Ari
 *     (~14-15). All within 0.3 deg of cited values.
 *
 * MEASURED ACCURACY (2026-08-16, production sidereal path vs Swiss Ephemeris
 * 2.10.03 Lahiri, 1,176 sampled epochs per body, 1900-2031): every body's
 * median <= 2.22"; non-Moon maximum 2.27"; Moon maximum 11.29". The old
 * "~+/-0.3 deg" figure that used to live here was never calibrated; against
 * the observed 11.29" maximum it overstated the error ~95x, and the boundary
 * orb derived from it was 30x wider than the measured replacement. Its two
 * real causes (UT fed as TT, and nutation retained
 * through a mean-ayanamsa subtraction) were measured and fixed the same day
 * (utJulianDayToJDE; lahiriTrueAyanamsa). Scope: the seven classical planets
 * at sampled epochs through 2031; no guarantee from 2032 onward (delta-T
 * models diverge - see utJulianDayToJDE), none for the mean node (a
 * convention, not an observable), none for unsampled dates.
 *
 * User-facing copy must reflect the MEASURED claim (and only it): agreement
 * with Swiss Ephemeris Lahiri within 12 arcseconds across 1,176 sampled
 * epochs per body, 1900-2031, largest observed difference 11.29 arcseconds -
 * scoped to the seven classical planets, no guarantee from 2032 onward. Do
 * NOT resurrect the old 0.3 deg figure, and do not overclaim past the
 * sampled scope.
 * ======================================================================
 */

// astronomia ships no TypeScript types; see lib declarations in astronomia.d.ts
import julian from "astronomia/julian";
import moonposition from "astronomia/moonposition";
import planetposition from "astronomia/planetposition";
import nutation from "astronomia/nutation";
import sidereal from "astronomia/sidereal";
import base from "astronomia/base";
import vsop87Bearth from "astronomia/data/vsop87Bearth";
import vsop87Bmars from "astronomia/data/vsop87Bmars";
import vsop87Bmercury from "astronomia/data/vsop87Bmercury";
import vsop87Bjupiter from "astronomia/data/vsop87Bjupiter";
import vsop87Bvenus from "astronomia/data/vsop87Bvenus";
import vsop87Bsaturn from "astronomia/data/vsop87Bsaturn";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Normalize any angle in degrees to [0, 360). */
export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Convert Gregorian calendar date + fractional time (UT) to Julian Day.
 * @param y full year (e.g. 1947)
 * @param m month 1..12
 * @param dFrac day with fractional time, e.g. 15.5 for noon of the 15th
 */
export function calendarToJD(y: number, m: number, dFrac: number): number {
  return julian.CalendarGregorianToJD(y, m, dFrac);
}

/** Convert a JS Date (assumed to be UTC moment) to JD. */
export function dateToJD(date: Date): number {
  return julian.DateToJD(date);
}

/**
 * UT-derived JD -> Terrestrial-Time JDE for the planetary theories, via
 * astronomia's delta-T (julian.Calendar.toJDE: observed table + polynomials).
 *
 * WHY (measured 2026-08-16, scripts/ephemeris-timescale-control.ts): feeding a
 * UT-derived jd straight into the `jde` parameters below put ~-61 s of clock
 * error into every position - 32" median on the Moon. Correcting each epoch
 * with Horizons' own TDB-UT collapsed that to 1.68" median / 12.27" largest
 * sampled. astronomia's model agrees with that reference to ~0.1 s at 1990,
 * and the panchang cluster characterised it end to end (rms 15 ms and 3 ms on
 * the two branches carrying 1956-2023;
 * docs/evidence/panchang-cluster/q9-deltat-error-probe.md).
 *
 * CLOCK FINE PRINT, all of it in this one place:
 *  - The input is a UTC-derived JD (toUniversalJD); astronomia's delta-T is
 *    TT-UT1. |UT1-UTC| <= 0.9 s by construction (leap seconds), which is
 *    <= 0.5" of Moon motion - accepted and deliberately NOT corrected, since a
 *    leap-second table would buy less than the engine's truncation floor.
 *  - THE ERROR IS DISCONTINUOUS, NOT ONE NUMBER. astronomia selects a delta-T
 *    branch by decimal year, with measured steps at the boundaries: +0.0026 s
 *    at 1973.0849, -1.0036 s at 2023.0788, +8.4844 s at 2032.0000 (panchang
 *    Q9 B3 Revision 5, whose evidence runs to 2033.75 against USNO's
 *    forecast). Shipped Moon error vs Horizons by regime, measured HERE in
 *    timescale-control.output.json `shipped`: pre-1973 and 1973-2023 sit at
 *    the truncation floor (~1.5-1.8" median), 2023-2032 adds the
 *    prediction-branch ramp (<=1.04 s ~ 0.57"), and FROM 2032 the
 *    model-vs-frozen-Horizons spread grows to 31" median / 86" largest
 *    sampled by 2099 (clock spread ~133 s at the far end - this repo's
 *    measurement, NOT Rev 5's, which claims nothing past 2033.75). The 2050
 *    hand-off from poly2000 to the final branch JOINS SMOOTHLY (~0.01 s, both
 *    sessions measured independently) - only 2032 steps. Past 2032 NEITHER
 *    side is truth (Horizons freezes its conversion; astronomia
 *    extrapolates), so no accuracy claim can be made there at all - scope
 *    every claim to sampled historical epochs.
 *  - THE 2032 STEP LANDS INSIDE ONE CIVIL DAY: dyear 2032.0 = 05:30 IST, so
 *    births at 05:00 and 06:00 IST on 2032-01-01 take different branches and
 *    differ by 8.48 s (~4.66" of Moon) from the branch edge alone. Witnessed
 *    by a value-asserting guard in scripts/ephemeris-timescale-control.ts.
 *  - LEAP-FEBRUARY QUIRK, known and bounded: astronomia's `toYear()` (inside
 *    toJDE) returns a decimal year ONE DAY LARGE for February dates in leap
 *    years - Feb 29 and Mar 1 collapse to the same value. Measured worst case
 *    over an exhaustive 1900-2032 civil-date scan: 7.825 ms of delta-T at
 *    1976-02-29 ~ 0.0043" of Moon (an earlier 3.4 ms figure understated it).
 *    Still utterly immaterial at chart precision; recorded so it is not
 *    rediscovered as a mystery. Do NOT "fix" it by feeding a calendar-correct
 *    decimal year into deltat.deltaT() - every panchang boundary is calibrated
 *    against the shipped convention, and a corrected dyear would silently
 *    diverge from it (panchang Rev 5 landmine note).
 *  - VERSION-BUMP WATCH: the 1973 boundary comes from astronomia's data table
 *    (data.firstYM) and already sits in February - immune to the leap quirk
 *    only because 1973 is a common year. data.last MOVES with astronomia
 *    releases; if a future release lands a branch boundary inside a leap-year
 *    February, the one-day dyear shift and a ~1 s discontinuity interact.
 *    Re-check this block on any astronomia upgrade.
 *  - SCOPE: planetary and nodal positions ONLY. Sidereal time and the Lagna
 *    are UT quantities (computeLagna) and must never be fed a TT value.
 *
 * SHARED-INFRASTRUCTURE CONTRACT (agreed with the panchang cluster 2026-08-16;
 * their Rev 5 reply raised no objection): "UTC-derived JD used as a UT1
 * approximation; no DUT1 correction." The cost travels with the sentence, with
 * its scope: the <= 0.9 s |UTC-UT1| bound is a LEAP-SECOND-ERA GUARANTEE
 * (1972 onward), worth up to 0.49" on the Moon - the same order as the
 * corrected 1.68" median, and a floor no ephemeris work can beat without DUT1.
 * Pre-1972 instants carry no such policy bound; their agreement is MEASURED
 * excellent in the calibration (pre-1973 Moon median 1.53-1.59") rather than
 * guaranteed by construction. Horizons control: worst sampled 2026 Moon
 * residual 0.623".
 *
 * MUTATION HAZARD, witnessed twice independently: `toJDE()` ACCUMULATES
 * delta-T onto the instance rather than returning a derived value - the N-th
 * call returns N x deltaT (56.86 s then 113.71 s here; 68.50 s then 137.00 s
 * in the panchang session's reproduction - exact doubles). Nastier than
 * garbage: a third call (~205 s) still LOOKS like a plausible delta-T, so any
 * guard must assert the VALUE, never mere finiteness. A fresh instance per
 * call is load-bearing; never hoist or reuse one. (`toYear()` verified
 * non-mutating.)
 */
export function utJulianDayToJDE(jdUT: number): number {
  return new julian.CalendarGregorian().fromJD(jdUT).toJDE();
}

// ----- VSOP87 Planet instances (reused; heavy data load) --------------------
// vsop87B* is referenced to equinox J2000; `Planet.position(jde)` internally
// precesses to the equinox of date.
const earth = new planetposition.Planet(vsop87Bearth);
const marsP = new planetposition.Planet(vsop87Bmars);
const mercuryP = new planetposition.Planet(vsop87Bmercury);
const jupiterP = new planetposition.Planet(vsop87Bjupiter);
const venusP = new planetposition.Planet(vsop87Bvenus);
const saturnP = new planetposition.Planet(vsop87Bsaturn);

const PLANET_MAP: Record<string, unknown> = {
  Mars: marsP,
  Mercury: mercuryP,
  Jupiter: jupiterP,
  Venus: venusP,
  Saturn: saturnP,
};

// ----- Core longitude helpers -----------------------------------------------

/**
 * Apparent geocentric ecliptic longitude of the Sun, degrees (tropical).
 * Uses `solar.apparentVSOP87` which handles nutation + aberration internally
 * against Earth's VSOP87 heliocentric position.
 */
export function sunLongitude(jde: number): number {
  // Sun's geocentric ecliptic longitude = Earth's heliocentric longitude + 180°
  // (Both at equinox/ecliptic of date since we use vsop87B + Planet.position.)
  const pos = earth.position(jde); // {lon, lat, range} in radians, AU, of-date
  const lonRad = pos.lon + Math.PI; // +180 deg
  // Apply nutation in longitude (Δψ) to get apparent.
  const [deltaPsi] = nutation.nutation(jde);
  // Apply aberration (approximate: -20.4898" / R) toward the Sun in longitude.
  const aberrationArcsec = -20.4898 / pos.range;
  const aberrationRad = (aberrationArcsec / 3600) * RAD;
  const apparentRad = lonRad + deltaPsi + aberrationRad;
  return norm360(apparentRad * DEG);
}

/**
 * Apparent geocentric ecliptic longitude of the Moon, degrees (tropical).
 * moonposition.position returns mean-of-date longitude WITHOUT nutation.
 * We add nutation in longitude to convert mean → apparent (tropical).
 */
export function moonLongitude(jde: number): number {
  const pos = moonposition.position(jde); // {lon, lat, range} - mean of date
  const [deltaPsi] = nutation.nutation(jde);
  return norm360((pos.lon + deltaPsi) * DEG);
}

/** Geocentric ecliptic latitude of the Moon in degrees - same mean-of-date
 *  series as moonLongitude (latitude needs no nutation-in-longitude term).
 *  Feeds exact declination for Ayana Bala. */
export function moonLatitude(jde: number): number {
  return moonposition.position(jde).lat * DEG;
}

/** TRUE obliquity of the ecliptic in degrees: mean obliquity + nutation in
 *  obliquity. This module's longitudes are APPARENT (they include nutation
 *  in longitude), so declination built from them must pair with the TRUE
 *  obliquity for a coherent transformation (review P2) - use this with
 *  moonLatitude/planetLatitude when computing declination. */
export function trueObliquityDeg(jde: number): number {
  const [, deltaEpsilon] = nutation.nutation(jde);
  return (nutation.meanObliquity(jde) + deltaEpsilon) * DEG;
}

/**
 * Apparent geocentric ecliptic longitude of a VSOP87 planet (Mars, Mercury,
 * Jupiter, Venus, Saturn), degrees. Implements Meeus ch.33 up to ecliptic
 * coords, with light-time iteration, aberration, FK5 and nutation corrections
 * from astronomia's elliptic routine.
 */
function planetEclipticOfDate(name: string, jde: number): { lonRad: number; latRad: number } {
  const planet = PLANET_MAP[name];
  if (!planet) throw new Error(`Unknown planet: ${name}`);

  // Meeus chapter 33: iterate light-time once.
  const posEarth: { lon: number; lat: number; range: number } = earth.position(jde);
  const [L0, B0, R0] = [posEarth.lon, posEarth.lat, posEarth.range];
  const [sB0, cB0] = base.sincos(B0);
  const [sL0, cL0] = base.sincos(L0);

  function rect(tau: number): { x: number; y: number; z: number; Δ: number } {
    const posP: { lon: number; lat: number; range: number } = (planet as { position: (j: number) => { lon: number; lat: number; range: number } }).position(jde - tau);
    const [sB, cB] = base.sincos(posP.lat);
    const [sL, cL] = base.sincos(posP.lon);
    const x = posP.range * cB * cL - R0 * cB0 * cL0;
    const y = posP.range * cB * sL - R0 * cB0 * sL0;
    const z = posP.range * sB - R0 * sB0;
    const Δ = Math.sqrt(x * x + y * y + z * z);
    return { x, y, z, Δ };
  }

  let r = rect(0);
  const tau = base.lightTime(r.Δ);
  r = rect(tau);

  // Ecliptic geocentric longitude of date, mean equinox.
  let lambda = Math.atan2(r.y, r.x);
  const beta = Math.atan2(r.z, Math.hypot(r.x, r.y));

  // Aberration & FK5 per Meeus ch.33. ORDER CONTRACT (slice-4 refactor):
  // toFK5 receives exactly the pre-refactor inputs (aberrated lambda,
  // GEOMETRIC beta) so planetLongitude stays byte-identical; the latitude
  // corrections (FK5 lat + aberration dB, both sub-arcsecond-to-arcsecond
  // order) compose afterwards instead.
  const ab = ecAberration(lambda, beta, jde);
  lambda += ab.lon;
  const fk5 = planetposition.toFK5(lambda, beta, jde);
  lambda = fk5.lon;

  // Apparent: add nutation in longitude
  const [deltaPsi] = nutation.nutation(jde);
  lambda += deltaPsi;

  return { lonRad: lambda, latRad: fk5.lat + ab.lat };
}

export function planetLongitude(name: string, jde: number): number {
  return norm360(planetEclipticOfDate(name, jde).lonRad * DEG);
}

/** Geocentric ecliptic latitude of a planet in degrees (same Meeus ch.33
 *  pipeline as planetLongitude). Feeds exact declination for Ayana Bala. */
export function planetLatitude(name: string, jde: number): number {
  return planetEclipticOfDate(name, jde).latRad * DEG;
}

/**
 * Ecliptic aberration (Meeus 23.2). Returns correction to λ, β in radians.
 * Uses a low-precision approximation suitable for our ±0.1° tolerance.
 */
function ecAberration(lambda: number, beta: number, jde: number): { lon: number; lat: number } {
  const T = (jde - 2451545.0) / 36525;
  const e = base.horner(T, 0.016708634, -0.000042037, -0.0000001267);
  const pi = (102.93735 + 1.71953 * T + 0.00046 * T * T) * RAD;
  // Sun's geometric longitude
  const L = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) * RAD;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) * RAD
          + (0.019993 - 0.000101 * T) * Math.sin(2 * M) * RAD
          + 0.000289 * Math.sin(3 * M) * RAD;
  const sunLon = L + C;
  const k = 20.49552 / 3600 * RAD; // constant of aberration in rad
  const sin_sunLon_lambda = Math.sin(sunLon - lambda);
  const cos_sunLon_lambda = Math.cos(sunLon - lambda);
  const sin_pi_lambda = Math.sin(pi - lambda);
  const cos_pi_lambda = Math.cos(pi - lambda);
  const dL = (-k * cos_sunLon_lambda + e * k * cos_pi_lambda) / Math.cos(beta);
  const dB = -k * Math.sin(beta) * (sin_sunLon_lambda - e * sin_pi_lambda);
  return { lon: dL, lat: dB };
}

/**
 * Moon's mean ascending node (Rahu) in degrees, tropical of date.
 * Meeus formula 47.7.
 */
export function meanNodeLongitude(jde: number): number {
  const T = (jde - 2451545.0) / 36525;
  const Omega =
    125.04452 -
    1934.136261 * T +
    0.0020708 * T * T +
    (T * T * T) / 450000;
  return norm360(Omega);
}

/**
 * Tropical ascendant (Lagna) longitude in degrees for a given UT JD and
 * geographic latitude/longitude (east positive).
 *
 * Formula: Meeus (26.2) - ecliptic longitude of east horizon.
 *   tan λ = -cos(H) / (sin(ε) tan(φ) + cos(ε) sin(H))
 * where H = LST in radians, ε = true obliquity, φ = latitude.
 * Quadrant is resolved via atan2 and adjusted so result is in [0, 360).
 */
export function lagnaTropical(jd: number, latDeg: number, lngEastDeg: number): number {
  // Apparent sidereal time at Greenwich in seconds → hours → degrees.
  const gstSec = sidereal.apparent(jd); // seconds, [0, 86400)
  const gstDeg = (gstSec / 86400) * 360;
  // Local sidereal time
  const lstDeg = norm360(gstDeg + lngEastDeg);
  const H = lstDeg * RAD;

  const [, dEps] = nutation.nutation(jd);
  const eps = nutation.meanObliquity(jd) + dEps;
  const phi = latDeg * RAD;

  const y = -Math.cos(H);
  const x = Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(H);
  let lambda = Math.atan2(y, x);
  // atan2 returns [-π, π]; ensure [0, 2π). Also, the east-horizon longitude
  // must be the ascending one - if negative cos(H) puts us on the descending
  // horizon, flip by π. The check: ascendant should be within ~6h east of LST.
  if (lambda < 0) lambda += 2 * Math.PI;
  // Sanity flip if outside a reasonable arc of LST (Meeus notes the quadrant
  // ambiguity - add π if the result is not the ascending horizon).
  // Practical rule: the asc. must be such that (asc - LST) mod 360 is in (0, 180).
  // If not, add 180.
  const lambdaDeg = lambda * DEG;
  const offset = norm360(lambdaDeg - lstDeg);
  if (offset > 180) {
    return norm360(lambdaDeg + 180);
  }
  return lambdaDeg;
}

/** Half-step for the central difference in `isRetrograde`, in days (30 minutes). */
const RETRO_HALF_STEP_DAYS = 1 / 48;

/**
 * Detect retrograde motion for a VSOP87 planet: true when apparent geocentric
 * longitude is DECREASING at `jde` (after unwrapping the 0/360 boundary).
 * Always false for Sun and Moon; always true for Rahu/Ketu by convention.
 *
 * Uses a CENTRAL difference over jde +/- 30 min, which estimates the
 * instantaneous motion at `jde`. It must stay centred: a forward difference
 * over [jde, jde+1d] measures the AVERAGE motion over the following day, and
 * because longitude is locally parabolic in time around a station that average
 * changes sign exactly half a day BEFORE the station itself - so every station
 * fired ~12 h early. That was the pre-2026-07-26 behaviour (see below).
 *
 * ---------------------------------------------------------------------------
 * FRAME: this flag reports TROPICAL apparent motion. planetLongitude returns
 * tropical apparent geocentric longitude and both samples come from it, so no
 * ayanamsa enters the difference.
 *
 * An earlier version of this comment said retrograde status is
 * "frame-independent, so Lahiri-sidereal vs tropical does not matter". THAT IS
 * FALSE NEAR A STATION and the claim is withdrawn. Sidereal longitude is
 * tropical minus the ayanamsa, and the ayanamsa itself drifts at ~50.3 arcsec /
 * year = 3.8e-5 deg/day. Away from a station that is nothing against a planet
 * moving degrees per day. AT a station the planet's own rate passes through
 * zero, so that constant offset moves the zero crossing - and the flatter the
 * curve, the bigger the shift. MEASURED from this engine (bisecting a centred
 * 1-minute difference on tropical longitude, then on tropical minus
 * lahiriAyanamsa, at the 1989-90 stations):
 *
 *   Mercury  0.30 and 0.40 min      Venus   1.41 and 1.31 min
 *   Mars     3.69 min               Jupiter 16.51 min
 *   Saturn   33.79 min
 *
 * (An earlier version of this note gave 0.1 / 0.8 / 2.5 / 16 / 30 from a
 * ballpark curvature rather than measurement; those were understated and are
 * replaced by the figures above. Sign varies with station direction; magnitude
 * is the point.)
 *
 * So a sidereal-motion flag would station Saturn about half an hour away from
 * this one. Which convention is "right" for a Jyotisha tool is a real question
 * and is NOT settled here - changing it would move the flag for slow planets in
 * a narrow window, and belongs in its own gated change. What matters for
 * correctness today is that the flag and its reference agree: Horizons
 * QUANTITIES='31' is apparent longitude OF DATE, i.e. tropical, matching this.
 *
 * VERIFIED 2026-07-26 against JPL Horizons (DE441), geocentric apparent
 * ecliptic longitude of date (CENTER='500@399', QUANTITIES='31').
 * Harness: scripts/retrograde-parity-sweep.ts. Regression test:
 * __tests__/lib/astrology/retrograde-stations.test.ts
 *
 * Station times measured (UT) and this function's error against them:
 *
 *   Station                        Horizons (DE441)      old fwd-diff   central
 *   Mercury direct->retro   1989-12-30 23:29:08 UT       -12h 02m       +0.9 min
 *   Mercury retro->direct   1990-01-20 04:31:30 UT       -11h 55m       +0.9 min
 *   Venus   direct->retro   1989-12-29 08:50:05 UT       -12h 00m       +1.0 min
 *   Venus   retro->direct   1990-02-08 09:16:22 UT       -11h 58m       +0.9 min
 *   Jupiter retro->direct   1990-02-24 19:11:00 UT       -11h 56m       +4.2 min
 *   Saturn  direct->retro   1990-05-04 22:41:15 UT       -11h 57m       +2.9 min
 *
 * A daily sweep of Mercury/Venus/Mars/Jupiter/Saturn over 1989-11-01..1990-07-01
 * (1205 planet-days) disagreed with Horizons on 5 days under the old forward
 * difference and 0 under the central difference.
 *
 * The residual ~1 min for the inner planets was dT (TT-UT ~ 57 s in 1990):
 * at the time of this 2026-07-26 measurement the module was called with
 * JD(UT) where VSOP87 wants JDE(TT). The 2026-08-16 time split fixed that -
 * computePlanets now converts via utJulianDayToJDE before sampling, so the
 * station-time comparison would tighten if re-run today. The larger
 * Jupiter/Saturn residuals are the slow movers' flat longitude curve making the
 * reference station fit itself less sharp, not estimator error.
 *
 * NOTE (also verified 2026-07-26): the pinned varga fixture 1990-01-15 12:00
 * IST is nowhere near a station - Venus was 17 days into a 41-day retrograde
 * arc, Mercury 15 days in, Jupiter ~40 days from its station. Venus/Mercury/
 * Jupiter (R) on that chart were CORRECT both before and after this fix.
 * ---------------------------------------------------------------------------
 */
export function isRetrograde(name: string, jde: number): boolean {
  if (name === "Sun" || name === "Moon") return false;
  if (name === "Rahu" || name === "Ketu") return true; // convention: always retrograde
  const l0 = planetLongitude(name, jde - RETRO_HALF_STEP_DAYS);
  const l1 = planetLongitude(name, jde + RETRO_HALF_STEP_DAYS);
  let delta = l1 - l0;
  // Unwrap across 360/0 boundary
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}
