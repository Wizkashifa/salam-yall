import {
  PrayerTimes,
  CalculationMethod,
  Coordinates,
  SunnahTimes,
  Madhab,
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

export function getPrayerTimes(latitude: number, longitude: number, date: Date, method: CalcMethodKey = "NorthAmerica", asrHanafi: boolean = false): PrayerTimeEntry[] {
  const coordinates = new Coordinates(latitude, longitude);
  const params = getCalcParams(method);
  if (asrHanafi) {
    params.madhab = Madhab.Hanafi;
  }
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

export function toHijriDate(date: Date, offsetDays: number = 0): string {
  try {
    const d = offsetDays !== 0 ? new Date(date.getTime() + offsetDays * 86400000) : date;
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return formatter.format(d);
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
  campusGroup?: string;
  iqamaSource?: string;
  iqamaId?: string;   // exact key in iqama_schedules.masjid (e.g. "IAR", "SRVIC")
  jumuahId?: string;  // exact key in jumuah_schedules.masjid (e.g. "IAR (Atwater)")
}

export const NEARBY_MASJIDS: Masjid[] = [
  { name: "Al-Noor Islamic Center", latitude: 35.7636, longitude: -78.7443, address: "1501 Buck Jones Rd, Raleigh, NC 27606", matchTerms: ["al-noor", "alnoor"], hasIqama: true, iqamaId: "Al Noor" },
  { name: "Islamic Association of Raleigh (Atwater)", latitude: 35.7898, longitude: -78.6912, address: "808 Atwater St, Raleigh, NC 27607", website: "https://www.raleighmasjid.org", matchTerms: ["iar", "islamic association of raleigh", "atwater"], hasIqama: true, campusGroup: "iar", iqamaId: "IAR", jumuahId: "IAR (Atwater)" },
  { name: "Islamic Association of Raleigh (Page Rd)", latitude: 35.9067, longitude: -78.8169, address: "3104 Page Rd, Morrisville, NC 27560", website: "https://www.raleighmasjid.org", matchTerms: ["iar", "islamic association of raleigh", "page rd", "page road"], hasIqama: true, campusGroup: "iar", iqamaId: "IAR", jumuahId: "IAR (Page Rd)" },
  { name: "Islamic Center of Morrisville", latitude: 35.8099, longitude: -78.8228, address: "107 Quail Fields Ct, Morrisville, NC 27560", website: "https://www.icmorrisville.org", matchTerms: ["icm", "islamic center of morrisville", "quail fields"], hasIqama: true, iqamaId: "ICMNC", jumuahId: "Islamic Center of Morrisville" },
  { name: "Jamaat Ibad Ar-Rahman (Fayetteville)", latitude: 35.9856, longitude: -78.8977, address: "3034 Fayetteville St, Durham, NC 27707", website: "https://www.jiar.org", matchTerms: ["jamaat ibad", "jiar", "fayetteville st"], hasIqama: true, campusGroup: "jiar", iqamaId: "JIAR (Fayetteville)", jumuahId: "Jamaat Ibad Ar-Rahman (Fayetteville)" },
  { name: "Jamaat Ibad Ar-Rahman (Parkwood)", latitude: 35.8938, longitude: -78.9109, address: "5122 Revere Rd, Durham, NC 27713", website: "https://www.jiar.org", matchTerms: ["parkwood", "revere rd"], hasIqama: true, campusGroup: "jiar", iqamaId: "JIAR (Parkwood)", jumuahId: "Jamaat Ibad Ar-Rahman (Parkwood)" },
  { name: "Apex Masjid", latitude: 35.7294, longitude: -78.8415, address: "733 Center St, Apex, NC 27502", matchTerms: ["apex masjid", "center st, apex"] },
  { name: "Ar-Razzaq Islamic Center", latitude: 35.9966, longitude: -78.9155, address: "1920 Chapel Hill Rd, Durham, NC 27707", matchTerms: ["ar-razzaq", "arrazzaq", "chapel hill rd, durham"], jumuahId: "Ar-Razzaq Islamic Center" },
  { name: "As-Salaam Islamic Center", latitude: 35.7781, longitude: -78.6075, address: "110 Lord Anson Dr, Raleigh, NC 27610", website: "https://www.assalaam.org", matchTerms: ["as-salaam", "assalaam", "lord anson"], jumuahId: "As-Salaam Islamic Center" },
  { name: "Chapel Hill Islamic Society", latitude: 35.9406, longitude: -79.0164, address: "1717 Legion Rd, Chapel Hill, NC 27517", website: "https://www.chapelhillmasjid.org", matchTerms: ["chapel hill islamic", "legion rd"], jumuahId: "Chapel Hill Islamic Society" },
  { name: "Islamic Center of Cary", latitude: 35.7731, longitude: -78.8028, address: "1155 W Chatham St, Cary, NC 27511", website: "https://www.icocary.org", matchTerms: ["islamic center of cary", "chatham st"], jumuahId: "Islamic Center of Cary" },
  { name: "Masjid King Khalid", latitude: 35.7693, longitude: -78.6383, address: "130 Martin Luther King Jr Blvd, Raleigh, NC 27601", matchTerms: ["king khalid", "martin luther king"] },
  { name: "North Raleigh Masjid", latitude: 35.8520, longitude: -78.5571, address: "7424 Deah Way, Raleigh, NC 27616", matchTerms: ["north raleigh masjid", "deah way", "mycc", "muslim youth community center"] },
  { name: "San Ramon Valley Islamic Center", latitude: 37.7770, longitude: -121.9691, address: "2230 Camino Ramon, San Ramon, CA 94583", website: "https://srvic.org", matchTerms: ["srvic", "san ramon valley islamic", "camino ramon"], hasIqama: true, iqamaId: "SRVIC", jumuahId: "San Ramon Valley Islamic Center (SRVIC)" },
  { name: "Muslim Community Association", latitude: 37.3769, longitude: -121.9595, address: "3003 Scott Blvd, Santa Clara, CA 95054", website: "https://www.mcabayarea.org", matchTerms: ["mca", "muslim community association", "scott blvd", "mcabayarea"], hasIqama: true, campusGroup: "mca", iqamaId: "MCA", jumuahId: "Muslim Community Association (MCA)" },
  { name: "MCA Al-Noor", latitude: 37.3530, longitude: -121.9535, address: "1755 Catherine St, Santa Clara, CA 95050", website: "https://www.mcabayarea.org", matchTerms: ["mca al-noor", "mca alnoor", "mca noor", "catherine st"], hasIqama: true, campusGroup: "mca", iqamaId: "MCA Al-Noor" },
  { name: "Muslim Community Center of the East Bay", latitude: 37.6925, longitude: -121.9040, address: "5724 W Las Positas Blvd, Pleasanton, CA 94588", website: "https://mcceastbay.org", matchTerms: ["mcc", "mcc east bay", "muslim community center of the east bay", "las positas", "pleasanton", "mcceastbay"], hasIqama: true, iqamaId: "MCC" },
  { name: "South Bay Islamic Association", latitude: 37.3007, longitude: -121.8574, address: "325 N 3rd St, San Jose, CA 95112", website: "https://sbia.info", matchTerms: ["sbia", "south bay islamic", "n 3rd st", "san jose"], hasIqama: true, iqamaId: "SBIA", jumuahId: "South Bay Islamic Association (SBIA)" },
  { name: "Islamic Center of Fremont (ICF)", latitude: 37.5241, longitude: -121.9660, address: "4039 Irvington Ave, Fremont, CA 94538", website: "https://icfbayarea.com", matchTerms: ["icf", "islamic center of fremont", "irvington ave", "icfbayarea"], hasIqama: true, campusGroup: "icf", iqamaId: "ICF", jumuahId: "Islamic Center of Fremont (ICF)" },
  { name: "Masjid Zakariya", latitude: 37.5094, longitude: -121.9628, address: "42412 Albrae St, Fremont, CA 94538", website: "https://icfbayarea.com", matchTerms: ["zakariya", "masjid zakariya", "albrae st"], hasIqama: true, campusGroup: "icf", iqamaId: "ICF" },
  { name: "Pillars Mosque", latitude: 35.3086, longitude: -80.7200, address: "3116 Johnston Oehler Rd, Charlotte, NC 28269", website: "https://pillarsmosque.org", matchTerms: ["pillars", "pillars mosque", "johnston oehler"], hasIqama: true, iqamaId: "Pillars Mosque" },
  { name: "Islamic Society of Greater Charlotte", latitude: 35.2025, longitude: -80.7937, address: "1700 Progress Ln, Charlotte, NC 28205", website: "https://isgcharlotte.org", matchTerms: ["isgc", "islamic society of greater charlotte", "progress ln"], hasIqama: true, iqamaId: "ISGC" },
  { name: "Los Gatos Islamic Center (LGIC)", latitude: 37.2358, longitude: -121.9175, address: "16769 Farley Rd, Los Gatos, CA 95032", website: "https://wvmuslim.org", matchTerms: ["lgic", "los gatos islamic", "los gatos masjid", "wvmuslim", "farley rd"], hasIqama: true, campusGroup: "lgic", iqamaId: "LGIC" },
  { name: "Saratoga Musalla", latitude: 37.3137, longitude: -122.0310, address: "12370 Saratoga-Sunnyvale Rd, Saratoga, CA 95070", website: "https://wvmuslim.org", matchTerms: ["saratoga musalla", "saratoga-sunnyvale rd"], hasIqama: true, campusGroup: "lgic", iqamaId: "LGIC" },
  { name: "Al-Huda Foundation", latitude: 39.9567, longitude: -86.0131, address: "12213 Lantern Rd, Fishers, IN 46038", website: "https://alhudafoundation.org", matchTerms: ["al-huda", "alhuda", "al huda foundation", "lantern rd", "fishers", "aici"], hasIqama: true, iqamaSource: "Al-Huda", iqamaId: "Al-Huda" },
];

export interface OrgCampus {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface CommunityOrg {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  website: string;
  description: string;
  matchTerms: string[];
  logo?: any;
  campuses?: OrgCampus[];
}

export const COMMUNITY_ORGS: CommunityOrg[] = [
  {
    name: "Light House Project",
    latitude: 35.7672,
    longitude: -78.7811,
    address: "1127 Kildaire Farm Rd, Cary, NC 27511",
    website: "https://www.lhproj.com/",
    description: "Community space fostering connection, dialogue, and personal growth through events, mentorship, and creative programming.",
    matchTerms: ["light house project", "lighthouse project", "lhproj"],
    logo: require("@/assets/logos/lighthouse.jpeg"),
  },
  {
    name: "Taleef Collective — Fremont",
    latitude: 37.5484,
    longitude: -121.9886,
    address: "43170 Osgood Rd, Fremont, CA 94539",
    website: "https://www.taleefcollective.org/",
    description: "A welcoming space for Muslims to learn, grow, and connect — especially those new or returning to the faith.",
    matchTerms: ["taleef collective", "taleef"],
    logo: require("@/assets/logos/taleef.jpeg"),
  },
  {
    name: "Taleef Collective — Chicago",
    latitude: 41.8557,
    longitude: -87.6466,
    address: "1945 S Halsted St, Chicago, IL 60608",
    website: "https://www.taleefcollective.org/",
    description: "A welcoming space for Muslims to learn, grow, and connect — especially those new or returning to the faith.",
    matchTerms: ["taleef collective", "taleef"],
    logo: require("@/assets/logos/taleef.jpeg"),
  },
  {
    name: "Roots DFW",
    latitude: 32.9857,
    longitude: -96.7502,
    address: "4200 International Pkwy, Carrollton, TX 75007",
    website: "https://www.rootsdfw.org/",
    description: "Building community among young Muslim professionals through social, spiritual, and service-oriented programming in the DFW metroplex.",
    matchTerms: ["roots dfw", "rootsdfw"],
    logo: require("@/assets/logos/roots-preview.jpeg"),
  },
];

export function matchEventsToCommunityOrg(org: CommunityOrg, events: { title: string; location: string; organizer: string }[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const searchable = `${(ev.location || "").toLowerCase()} ${(ev.organizer || "").toLowerCase()} ${(ev.title || "").toLowerCase()}`;
    for (const term of org.matchTerms) {
      if (searchable.includes(term)) {
        indices.push(i);
        break;
      }
    }
  }
  return indices;
}

export function matchEventsToMasjid(masjid: Masjid, events: { title: string; location: string; organizer: string }[], allMasjids?: Masjid[]): number[] {
  let allTerms = [...(masjid.matchTerms || [])];
  let allAddrParts = [masjid.address.toLowerCase().split(",")[0]];

  if (masjid.campusGroup && allMasjids) {
    for (const sibling of allMasjids) {
      if (sibling.campusGroup === masjid.campusGroup && sibling.name !== masjid.name) {
        allTerms = allTerms.concat(sibling.matchTerms || []);
        allAddrParts.push(sibling.address.toLowerCase().split(",")[0]);
      }
    }
  }

  const indices: number[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const loc = (ev.location || "").toLowerCase();
    const org = (ev.organizer || "").toLowerCase();
    const title = (ev.title || "").toLowerCase();
    const searchable = `${loc} ${org} ${title}`;

    let matched = false;
    for (const addr of allAddrParts) {
      if (loc.includes(addr)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const term of allTerms) {
        if (searchable.includes(term)) {
          matched = true;
          break;
        }
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

export function calculateQiblaBearing(latitude: number, longitude: number): number {
  const { Qibla, Coordinates } = require("adhan");
  return Qibla(new Coordinates(latitude, longitude));
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
