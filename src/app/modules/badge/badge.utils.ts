// src/app/modules/badge/badge.utils.ts

/**
 * Hijri Date Converter
 */
class HijriDate {
  year: number;
  month: number;
  day: number;

  constructor(date: Date) {
    const { hy, hm, hd } = this.gregorianToHijri(date);
    this.year = hy;
    this.month = hm;
    this.day = hd;
  }

  private gregorianToHijri(date: Date): { hy: number; hm: number; hd: number } {
    const gYear = date.getFullYear();
    const gMonth = date.getMonth() + 1;
    const gDay = date.getDate();

    const jd = this.gregorianToJulian(gYear, gMonth, gDay);
    return this.julianToHijri(jd);
  }

  private gregorianToJulian(year: number, month: number, day: number): number {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    return (
      Math.floor(365.25 * (year + 4716)) +
      Math.floor(30.6001 * (month + 1)) +
      day +
      b -
      1524.5
    );
  }

  private julianToHijri(jd: number): { hy: number; hm: number; hd: number } {
    const l = Math.floor(jd) - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j =
      Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
      Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
    const l3 =
      l2 -
      Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
      Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
      29;
    const hm = Math.floor((24 * l3) / 709);
    const hd = l3 - Math.floor((709 * hm) / 24);
    const hy = 30 * n + j - 30;

    return { hy, hm, hd };
  }
}

/**
 * Check if date is in Ramadan
 */
export const isRamadan = (date: Date): boolean => {
  const hijri = new HijriDate(date);
  return hijri.month === 9;
};

/**
 * Check if date is Laylat al-Qadr (27th of Ramadan)
 */
export const isLaylatAlQadr = (date: Date): boolean => {
  const hijri = new HijriDate(date);
  return hijri.month === 9 && hijri.day === 27;
};

/**
 * Check if date is in Dhul Hijjah
 */
export const isDhulHijjah = (date: Date): boolean => {
  const hijri = new HijriDate(date);
  return hijri.month === 12;
};

/**
 * Check if date is in winter (May-Aug for Southern Hemisphere)
 */
export const isWinter = (date: Date): boolean => {
  const month = date.getMonth() + 1;
  return month >= 5 && month <= 8;
};

/**
 * Check if within time range
 */
export const isWithinTimeRange = (
  date: Date,
  startHour: number,
  endHour: number
): boolean => {
  const hour = date.getHours();

  if (startHour <= endHour) {
    return hour >= startHour && hour < endHour;
  } else {
    return hour >= startHour || hour < endHour;
  }
};

/**
 * Check if midnight (12am-4am)
 */
export const isMidnight = (date: Date): boolean => {
  return isWithinTimeRange(date, 0, 4);
};

/**
 * Get seasonal period
 */
export const getSeasonalPeriod = (
  date: Date
): 'ramadan' | 'dhul_hijjah' | 'winter' | null => {
  if (isRamadan(date)) return 'ramadan';
  if (isDhulHijjah(date)) return 'dhul_hijjah';
  if (isWinter(date)) return 'winter';
  return null;
};

/**
 * Check if before Eid
 */
export const isBeforeEid = (date: Date): boolean => {
  const hijri = new HijriDate(date);
  return hijri.month === 9 || (hijri.month === 10 && hijri.day === 1);
};

/**
 * Get current Hijri year
 */
export const getCurrentHijriYear = (): number => {
  const hijri = new HijriDate(new Date());
  return hijri.year;
};
