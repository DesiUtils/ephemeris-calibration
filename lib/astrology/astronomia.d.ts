/**
 * Minimal ambient types for the subset of `astronomia` (MIT-licensed
 * Meeus-based astronomy library) we use. Only signatures we call are declared;
 * the full API is broader.
 */

declare module "astronomia/julian" {
  /** Subset of CalendarGregorian we use. */
  interface Calendar {
    year: number;
    month: number;
    day: number;
    midnight(): Calendar;
    /** Loads this calendar from a Julian Day and returns itself (chainable). */
    fromJD(jd: number): Calendar;
    toJD(): number;
    /** JD + deltaT(year)/86400 - the astronomia UT->TT path utJulianDayToJDE wraps; the
     *  panchang cluster characterised exactly this chain
     *  (docs/evidence/panchang-cluster/q9-deltat-error-probe.md). */
    toJDE(): number;
    toYear(): number;
  }
  interface CalendarConstructor {
    /** Bare `new Calendar()` is the documented astronomia idiom for the
     *  fromJD chain; year/month/day args are accepted but unused by us. */
    new (year?: number, month?: number, day?: number): Calendar;
  }
  interface CalendarGregorianConstructor {
    new (year?: number, month?: number, day?: number): Calendar;
  }
  const api: {
    CalendarGregorianToJD(y: number, m: number, d: number): number;
    DateToJD(d: Date): number;
    JDToDate(jd: number): Date;
    DateToJDE(d: Date): number;
    Calendar: CalendarConstructor;
    CalendarGregorian: CalendarGregorianConstructor;
  };
  export default api;
}



declare module "astronomia/moonposition" {
  const api: {
    position(jde: number): { lon: number; lat: number; range: number };
    node(jde: number): number;
  };
  export default api;
}

declare module "astronomia/planetposition" {
  interface Planet {
    position(jde: number): { lon: number; lat: number; range: number };
    position2000(jde: number): { lon: number; lat: number; range: number };
  }
  interface PlanetConstructor {
    new (vsop87Data: unknown): Planet;
  }
  const api: {
    Planet: PlanetConstructor;
    toFK5(lon: number, lat: number, jde: number): { lon: number; lat: number };
  };
  export default api;
}

declare module "astronomia/nutation" {
  const api: {
    nutation(jde: number): [number, number];
    meanObliquity(jde: number): number;
  };
  export default api;
}

declare module "astronomia/sidereal" {
  const api: {
    mean(jd: number): number;
    apparent(jd: number): number;
  };
  export default api;
}

declare module "astronomia/base" {
  const api: {
    sincos(x: number): [number, number];
    horner(x: number, ...coeffs: number[]): number;
    lightTime(distanceAU: number): number;
    pmod(x: number, y: number): number;
    J2000Century(jde: number): number;
  };
  export default api;
}

declare module "astronomia/data/deltat" {
  /** One delta-T series: decimal-year range plus its value table. Only the
   *  fields the regime classifier reads are declared. */
  interface DeltaTSeries {
    first: number;
    last: number;
    firstYM?: [number, number];
    lastYM?: [number, number];
    table: number[];
  }
  const api: {
    historic: DeltaTSeries;
    data: DeltaTSeries;
    prediction: DeltaTSeries;
  };
  export default api;
}

declare module "astronomia/data/vsop87Bearth" {
  const data: unknown;
  export default data;
}
declare module "astronomia/data/vsop87Bmars" {
  const data: unknown;
  export default data;
}
declare module "astronomia/data/vsop87Bmercury" {
  const data: unknown;
  export default data;
}
declare module "astronomia/data/vsop87Bjupiter" {
  const data: unknown;
  export default data;
}
declare module "astronomia/data/vsop87Bvenus" {
  const data: unknown;
  export default data;
}
declare module "astronomia/data/vsop87Bsaturn" {
  const data: unknown;
  export default data;
}
