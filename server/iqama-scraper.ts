const IAR_API_URL = "https://raleighmasjid.org/API/prayer/month/";

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

interface CacheEntry {
  data: Record<string, DayIqama>;
  fetchedAt: number;
}

const iarCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchIARMonth(month: number, year: number): Promise<Record<string, DayIqama>> {
  const cacheKey = `${year}-${month}`;
  const cached = iarCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${IAR_API_URL}?year=${year}&month=${month}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Iqama] IAR API returned ${resp.status}`);
      return cached?.data || {};
    }

    const json = await resp.json() as Record<string, IARDayData>;
    const result: Record<string, DayIqama> = {};

    for (const [dateKey, dayData] of Object.entries(json)) {
      if (!dayData?.iqamah?.Fajr || !dayData?.iqamah?.Isha) continue;
      result[dateKey] = {
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

    return result;
  } catch (err: any) {
    console.error("[Iqama] Error fetching IAR schedule:", err.message);
    return cached?.data || {};
  }
}

function addMinutesToTime(timeStr: string, offsetMinutes: number): string {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1]);
  let minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  minutes += offsetMinutes;
  while (minutes >= 60) { hours++; minutes -= 60; }
  while (minutes < 0) { hours--; minutes += 60; }
  hours = hours % 24;

  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getICMIqama(iarIqama: DayIqama): DayIqama {
  return { ...iarIqama };
}

function getJIARIqama(iarIqama: DayIqama): DayIqama {
  return {
    fajr: addMinutesToTime(iarIqama.fajr, 5),
    dhuhr: iarIqama.dhuhr,
    asr: iarIqama.asr,
    maghrib: addMinutesToTime(iarIqama.maghrib, 5),
    isha: iarIqama.isha,
  };
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

export async function getTodayIqamaTimes(): Promise<MasjidIqamaSchedule[]> {
  const { year, month, dateKey } = getRaleighDate();

  const iarData = await fetchIARMonth(month, year);
  const todayIAR = iarData[dateKey];

  if (!todayIAR) {
    return [];
  }

  return [
    { masjid: "Islamic Association of Raleigh (Atwater)", iqama: todayIAR },
    { masjid: "Islamic Association of Raleigh (Page Rd)", iqama: todayIAR },
    { masjid: "Islamic Center of Morrisville", iqama: getICMIqama(todayIAR) },
    { masjid: "Islamic Center of Cary", iqama: getICMIqama(todayIAR) },
    { masjid: "Jamaat Ibad Ar-Rahman", iqama: getJIARIqama(todayIAR) },
    { masjid: "Parkwood Masjid (JIAR)", iqama: getJIARIqama(todayIAR) },
  ];
}
