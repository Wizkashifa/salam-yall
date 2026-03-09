import {
  PrayerTimes,
  CalculationMethod,
  Coordinates,
  SunnahTimes,
} from "adhan";

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export type CalcMethodKey =
  | "NorthAmerica"
  | "MuslimWorldLeague"
  | "Egyptian"
  | "Karachi"
  | "UmmAlQura"
  | "Dubai"
  | "MoonsightingCommittee"
  | "Kuwait"
  | "Qatar"
  | "Singapore"
  | "Tehran"
  | "Turkey";

export const CALC_METHOD_LABELS: Record<CalcMethodKey, string> = {
  NorthAmerica: "ISNA (North America)",
  MuslimWorldLeague: "Muslim World League",
  Egyptian: "Egyptian General Authority",
  Karachi: "University of Karachi",
  UmmAlQura: "Umm Al-Qura (Makkah)",
  Dubai: "Dubai",
  MoonsightingCommittee: "Moonsighting Committee",
  Kuwait: "Kuwait",
  Qatar: "Qatar",
  Singapore: "Singapore",
  Tehran: "Tehran",
  Turkey: "Turkey",
};

export interface PrayerTimeEntry {
  name: PrayerName;
  label: string;
  time: Date;
  icon: string;
}

function getCalcParams(method: CalcMethodKey) {
  return CalculationMethod[method]();
}

export function getPrayerTimes(latitude: number, longitude: number, date: Date, method: CalcMethodKey = "NorthAmerica"): PrayerTimeEntry[] {
  const coordinates = new Coordinates(latitude, longitude);
  const params = getCalcParams(method);
  const prayerTimes = new PrayerTimes(coordinates, date, params);

  return [
    { name: "fajr", label: "Fajr", time: prayerTimes.fajr, icon: "weather-sunset-up" },
    { name: "sunrise", label: "Sunrise", time: prayerTimes.sunrise, icon: "weather-sunny" },
    { name: "dhuhr", label: "Dhuhr", time: prayerTimes.dhuhr, icon: "weather-sunny" },
    { name: "asr", label: "Asr", time: prayerTimes.asr, icon: "white-balance-sunny" },
    { name: "maghrib", label: "Maghrib", time: prayerTimes.maghrib, icon: "weather-sunset-down" },
    { name: "isha", label: "Isha", time: prayerTimes.isha, icon: "weather-night" },
  ];
}

export function getNextPrayer(prayers: PrayerTimeEntry[], now: Date): PrayerTimeEntry | null {
  for (const prayer of prayers) {
    if (prayer.time > now) {
      return prayer;
    }
  }
  return null;
}

export function getCountdown(target: Date, now: Date): { hours: number; minutes: number; seconds: number } {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { hours, minutes, seconds };
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function toHijriDate(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return formatter.format(date);
  } catch {
    return "";
  }
}

export interface Masjid {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  website?: string;
  matchTerms?: string[];
  hasIqama?: boolean;
}

export const NEARBY_MASJIDS: Masjid[] = [
  { name: "Al-Noor Islamic Center", latitude: 35.7676, longitude: -78.7165, address: "1501 Buck Jones Rd, Raleigh, NC 27606", matchTerms: ["al-noor", "alnoor"], hasIqama: true },
  { name: "Islamic Association of Raleigh (Atwater)", latitude: 35.7953, longitude: -78.6711, address: "808 Atwater St, Raleigh, NC 27607", website: "https://www.raleighmasjid.org", matchTerms: ["iar", "islamic association of raleigh", "atwater"], hasIqama: true },
  { name: "Islamic Association of Raleigh (Page Rd)", latitude: 35.8329, longitude: -78.8274, address: "3104 Page Rd, Morrisville, NC 27560", website: "https://www.raleighmasjid.org", matchTerms: ["iar", "islamic association of raleigh", "page rd", "page road"], hasIqama: true },
  { name: "Islamic Center of Morrisville", latitude: 35.8316, longitude: -78.8345, address: "107 Quail Fields Ct, Morrisville, NC 27560", website: "https://www.icmorrisville.org", matchTerms: ["icm", "islamic center of morrisville", "quail fields"], hasIqama: true },
  { name: "Jamaat Ibad Ar-Rahman (Fayetteville)", latitude: 35.9615, longitude: -78.8872, address: "3034 Fayetteville St, Durham, NC 27707", website: "https://www.jiar.org", matchTerms: ["jamaat ibad", "jiar", "fayetteville st"], hasIqama: true },
  { name: "Jamaat Ibad Ar-Rahman (Parkwood)", latitude: 35.9194, longitude: -78.9227, address: "5122 Revere Rd, Durham, NC 27713", website: "https://www.jiar.org", matchTerms: ["parkwood", "revere rd"], hasIqama: true },
  { name: "Apex Masjid", latitude: 35.7327, longitude: -78.8502, address: "733 Center St, Apex, NC 27502", matchTerms: ["apex masjid", "center st, apex"] },
  { name: "Ar-Razzaq Islamic Center", latitude: 35.9728, longitude: -78.9327, address: "1920 Chapel Hill Rd, Durham, NC 27707", matchTerms: ["ar-razzaq", "arrazzaq", "chapel hill rd, durham"] },
  { name: "As-Salaam Islamic Center", latitude: 35.7985, longitude: -78.6766, address: "2104 Woods Edge Rd, Raleigh, NC 27607", website: "https://www.assalaam.org", matchTerms: ["as-salaam", "assalaam", "woods edge"] },
  { name: "Chapel Hill Islamic Society", latitude: 35.8841, longitude: -79.0328, address: "1717 Legion Rd, Chapel Hill, NC 27517", website: "https://www.chapelhillmasjid.org", matchTerms: ["chapel hill islamic", "legion rd"] },
  { name: "Islamic Center of Cary", latitude: 35.7773, longitude: -78.7978, address: "1155 W Chatham St, Cary, NC 27511", website: "https://www.icocary.org", matchTerms: ["islamic center of cary", "chatham st"] },
  { name: "Masjid King Khalid", latitude: 35.7756, longitude: -78.6375, address: "130 Martin Luther King Jr Blvd, Raleigh, NC 27601", matchTerms: ["king khalid", "martin luther king"] },
  { name: "North Raleigh Masjid", latitude: 35.7682, longitude: -78.7149, address: "1411 Buck Jones Rd, Raleigh, NC 27606", matchTerms: ["north raleigh masjid", "deah way", "buck jones"] },
];

export function matchEventsToMasjid(masjid: Masjid, events: { title: string; location: string; organizer: string }[]): number[] {
  const terms = masjid.matchTerms || [];
  const addrParts = masjid.address.toLowerCase().split(",")[0];
  const indices: number[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const loc = (ev.location || "").toLowerCase();
    const org = (ev.organizer || "").toLowerCase();
    const title = (ev.title || "").toLowerCase();
    const searchable = `${loc} ${org} ${title}`;

    if (loc.includes(addrParts)) {
      indices.push(i);
      continue;
    }

    let matched = false;
    for (const term of terms) {
      if (searchable.includes(term)) {
        matched = true;
        break;
      }
    }
    if (matched) indices.push(i);
  }

  return indices;
}

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export function findNearestMasjid(latitude: number, longitude: number, masjidList?: Masjid[]): { masjid: Masjid; distanceMiles: number } {
  const list = masjidList || NEARBY_MASJIDS;
  let nearest = list[0];
  let minDist = Infinity;

  for (const m of list) {
    const d = getDistanceKm(latitude, longitude, m.latitude, m.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = m;
    }
  }

  return { masjid: nearest, distanceMiles: kmToMiles(minDist) };
}

export function getAllMasjidsByDistance(latitude: number, longitude: number, masjidList?: Masjid[]): { masjid: Masjid; distanceMiles: number; driveMinutes: number }[] {
  const list = masjidList || NEARBY_MASJIDS;
  return list.map((m) => {
    const km = getDistanceKm(latitude, longitude, m.latitude, m.longitude);
    const miles = kmToMiles(km);
    const driveMinutes = Math.round(miles * 2.5 + 2);
    return { masjid: m, distanceMiles: miles, driveMinutes };
  }).sort((a, b) => a.distanceMiles - b.distanceMiles);
}

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

export function calculateQiblaBearing(latitude: number, longitude: number): number {
  const lat1 = (latitude * Math.PI) / 180;
  const lon1 = (longitude * Math.PI) / 180;
  const lat2 = (KAABA_LAT * Math.PI) / 180;
  const lon2 = (KAABA_LON * Math.PI) / 180;
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export function isRamadan(): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric" });
    const parts = formatter.formatToParts(now);
    const monthPart = parts.find(p => p.type === "month");
    return monthPart?.value === "9";
  } catch {
    return false;
  }
}

const MOSQUE_PROXIMITY_THRESHOLD_KM = 0.1;

export function checkNearMosque(latitude: number, longitude: number, masjidList?: Masjid[]): Masjid | null {
  const list = masjidList || NEARBY_MASJIDS;
  for (const m of list) {
    const dist = getDistanceKm(latitude, longitude, m.latitude, m.longitude);
    if (dist <= MOSQUE_PROXIMITY_THRESHOLD_KM) {
      return m;
    }
  }
  return null;
}
