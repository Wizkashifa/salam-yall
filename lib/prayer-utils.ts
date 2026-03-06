import {
  PrayerTimes,
  CalculationMethod,
  Coordinates,
  SunnahTimes,
} from "adhan";

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface PrayerTimeEntry {
  name: PrayerName;
  label: string;
  time: Date;
  icon: string;
}

export function getPrayerTimes(latitude: number, longitude: number, date: Date): PrayerTimeEntry[] {
  const coordinates = new Coordinates(latitude, longitude);
  const params = CalculationMethod.NorthAmerica();
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
}

export const NEARBY_MASJIDS: Masjid[] = [
  { name: "Islamic Association of Raleigh", latitude: 35.8329, longitude: -78.6419, address: "808 Atwater St, Raleigh, NC" },
  { name: "Islamic Center of Raleigh", latitude: 35.7920, longitude: -78.6805, address: "2635 Avent Ferry Rd, Raleigh, NC" },
  { name: "Masjid Al-Iman", latitude: 35.7777, longitude: -78.6239, address: "514 E Martin St, Raleigh, NC" },
  { name: "Islamic Society of Durham", latitude: 35.9737, longitude: -78.9049, address: "304 Alexander Ave, Durham, NC" },
  { name: "As-Salaam Islamic Center", latitude: 35.8601, longitude: -78.8837, address: "5501 Sunnybrook Rd, Raleigh, NC" },
  { name: "Masjid Ar-Razzaq", latitude: 35.7531, longitude: -78.6289, address: "921 S East St, Raleigh, NC" },
];

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

export function findNearestMasjid(latitude: number, longitude: number): { masjid: Masjid; distanceMiles: number } {
  let nearest = NEARBY_MASJIDS[0];
  let minDist = Infinity;

  for (const m of NEARBY_MASJIDS) {
    const d = getDistanceKm(latitude, longitude, m.latitude, m.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = m;
    }
  }

  return { masjid: nearest, distanceMiles: kmToMiles(minDist) };
}
