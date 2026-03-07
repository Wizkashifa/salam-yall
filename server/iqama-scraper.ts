const IAR_API_URL = "https://raleighmasjid.org/API/prayer/month/";
const ICMNC_API_URL = "https://www.icmnc.org/wp-json/dpt/v1/prayertime";

export interface DayIqama {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface MasjidIqamaSchedule {
  masjid: string;
  iqama: DayIqama;
}

interface IARDayData {
  hijri: { day: number; year: number; month_numeric: number; month: string };
  adhan: { Fajr: string; Shuruq: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string };
  iqamah: { Fajr: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string };
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const iarCache: Record<string, CacheEntry<Record<string, DayIqama>>> = {};
let icmncCache: (CacheEntry<DayIqama> & { dateKey: string }) | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

function to12h(time24: string): string {
  const [hh, mm] = time24.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return time24;
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  const suffix = hh >= 12 ? "PM" : "AM";
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function getRaleighDate(): { year: number; month: number; day: number; dateKey: string } {
  const now = new Date();
  const raleigh = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parseInt(raleigh.find(p => p.type === "year")!.value);
  const month = parseInt(raleigh.find(p => p.type === "month")!.value);
  const day = parseInt(raleigh.find(p => p.type === "day")!.value);
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dateKey };
}

async function fetchIARToday(): Promise<DayIqama | null> {
  const { year, month, dateKey } = getRaleighDate();
  const cacheKey = `${year}-${month}`;
  const cached = iarCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL && cached.data[dateKey]) {
    return cached.data[dateKey];
  }

  try {
    const url = `${IAR_API_URL}?year=${year}&month=${month}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Iqama] IAR API returned ${resp.status}`);
      return cached?.data?.[dateKey] || null;
    }

    const json = await resp.json() as Record<string, IARDayData>;
    const result: Record<string, DayIqama> = {};

    for (const [dk, dayData] of Object.entries(json)) {
      if (!dayData?.iqamah?.Fajr || !dayData?.iqamah?.Isha) continue;
      result[dk] = {
        fajr: dayData.iqamah.Fajr,
        dhuhr: dayData.iqamah.Dhuhr,
        asr: dayData.iqamah.Asr,
        maghrib: dayData.iqamah.Maghrib,
        isha: dayData.iqamah.Isha,
      };
    }

    if (Object.keys(result).length > 0) {
      iarCache[cacheKey] = { data: result, fetchedAt: Date.now() };
      console.log(`[Iqama] Cached ${Object.keys(result).length} days for IAR ${month}/${year}`);
    }

    return result[dateKey] || null;
  } catch (err: any) {
    console.error("[Iqama] Error fetching IAR schedule:", err.message);
    return cached?.data?.[dateKey] || null;
  }
}

async function fetchICMNCToday(): Promise<DayIqama | null> {
  const { dateKey } = getRaleighDate();
  if (icmncCache && icmncCache.dateKey === dateKey && Date.now() - icmncCache.fetchedAt < CACHE_TTL) {
    return icmncCache.data;
  }

  try {
    const resp = await fetch(`${ICMNC_API_URL}?filter=today`);
    if (!resp.ok) {
      console.error(`[Iqama] ICMNC API returned ${resp.status}`);
      return icmncCache?.data || null;
    }

    const json = await resp.json() as any[];
    if (!json || json.length === 0) return icmncCache?.data || null;

    const today = json[0];
    if (!today.fajr_jamah || !today.isha_jamah) return icmncCache?.data || null;

    const iqama: DayIqama = {
      fajr: to12h(today.fajr_jamah),
      dhuhr: to12h(today.zuhr_jamah),
      asr: to12h(today.asr_jamah),
      maghrib: to12h(today.maghrib_jamah),
      isha: to12h(today.isha_jamah),
    };

    icmncCache = { data: iqama, fetchedAt: Date.now(), dateKey };
    console.log(`[Iqama] Cached ICMNC iqama times for today`);

    return iqama;
  } catch (err: any) {
    console.error("[Iqama] Error fetching ICMNC schedule:", err.message);
    return icmncCache?.data || null;
  }
}

export async function getTodayIqamaTimes(): Promise<MasjidIqamaSchedule[]> {
  const [iarIqama, icmncIqama] = await Promise.all([
    fetchIARToday(),
    fetchICMNCToday(),
  ]);

  const results: MasjidIqamaSchedule[] = [];

  if (iarIqama) {
    results.push({ masjid: "IAR", iqama: iarIqama });
  }

  if (icmncIqama) {
    results.push({ masjid: "ICMNC", iqama: icmncIqama });
  }

  return results;
}
