import type { Express } from "express";
import { createServer, type Server } from "node:http";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { getUncachableGoogleCalendarClient } from "./google-calendar";
import halalSeedData from "./halal-seed-data.json";
import { ensureIqamaTable, seedJIARData, seedMCCData, seedAdamsCenterIqama, startIqamaSync, getIqamaSchedules } from "./iqama-scraper";
import Anthropic from "@anthropic-ai/sdk";

const CALENDAR_ID = "5c6138b3c670e90f28b9ec65a6650268569a070eff5ae0ae919129f763d216af@group.calendar.google.com";

const PHOTO_CACHE_DIR = path.resolve(process.cwd(), "server", "photo-cache");
try { fs.mkdirSync(PHOTO_CACHE_DIR, { recursive: true }); } catch {}
const photoMemCache = new Map<string, { buffer: Buffer; contentType: string }>();

function getPhotoCachePath(key: string): string {
  return path.join(PHOTO_CACHE_DIR, key.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function getPhotoFromCache(key: string): { buffer: Buffer; contentType: string } | null {
  const mem = photoMemCache.get(key);
  if (mem) return mem;
  try {
    const cachePath = getPhotoCachePath(key);
    const metaPath = cachePath + ".meta";
    if (fs.existsSync(cachePath) && fs.existsSync(metaPath)) {
      const buffer = fs.readFileSync(cachePath);
      const contentType = fs.readFileSync(metaPath, "utf8").trim();
      photoMemCache.set(key, { buffer, contentType });
      return { buffer, contentType };
    }
  } catch {}
  return null;
}

function setPhotoCache(key: string, buffer: Buffer, contentType: string) {
  photoMemCache.set(key, { buffer, contentType });
  try {
    const cachePath = getPhotoCachePath(key);
    fs.writeFileSync(cachePath, buffer);
    fs.writeFileSync(cachePath + ".meta", contentType);
  } catch {}
}

const NAME_MATCHES: [string, string][] = [
  ["islamic association of raleigh", "Islamic Association of Raleigh"],
  ["iar masjid", "Islamic Association of Raleigh"],
  ["islamic center of morrisville", "Islamic Center of Morrisville"],
  ["icm,", "Islamic Center of Morrisville"],
  ["islamic center of cary", "Islamic Center of Cary"],
  ["cary mosque", "Cary Mosque"],
  ["masjid king khalid", "Masjid King Khalid"],
  ["shaw university mosque", "Masjid King Khalid"],
  ["as-salaam islamic", "As-Salaam Islamic Center"],
  ["north raleigh masjid", "North Raleigh Masjid"],
  ["mycc", "North Raleigh Masjid"],
  ["muslim youth community center", "North Raleigh Masjid"],
  ["al-noor islamic", "Al-Noor Islamic Center"],
  ["apex masjid", "Apex Masjid"],
  ["apex mosque", "Apex Masjid"],
  ["chapel hill islamic", "Chapel Hill Islamic Society"],
  ["ar-razzaq", "Ar-Razzaq Islamic Center"],
  ["jamaat ibad", "Jamaat Ibad Ar-Rahman (Parkwood)"],
  ["jamaat ibad parkwood", "Jamaat Ibad Ar-Rahman (Parkwood)"],
  ["jiar", "Jamaat Ibad Ar-Rahman (Parkwood)"],
  ["parkwood masjid", "Jamaat Ibad Ar-Rahman (Parkwood)"],
  ["jamaat ibad fayetteville", "Jamaat Ibad Ar-Rahman (Fayetteville)"],
  ["fayetteville masjid", "Jamaat Ibad Ar-Rahman (Fayetteville)"],
  ["rumman room", "Rumman Room"],
  ["light house project", "The Light House Project"],
  ["lighthouse project", "The Light House Project"],
  ["muslim american society", "Muslim American Society (MAS Raleigh)"],
  ["mas raleigh", "Muslim American Society (MAS Raleigh)"],
  ["raleigh islamic institute", "Raleigh Islamic Institute"],
  ["madinah quran", "Madinah Quran & Youth Center"],
  ["mqyc", "Madinah Quran & Youth Center"],
  ["zakat foundation", "Zakat Foundation"],
  ["islamic relief usa", "Islamic Relief USA"],
  ["islamic relief", "Islamic Relief USA"],
  ["raleigh convention", "Raleigh Convention Center"],
  ["dorton arena", "NC State Fairgrounds"],
  ["islamic center of clayton", "Islamic Center of Clayton"],
  ["triangle islamic center", "Triangle Islamic Center"],
  ["mckimmon center", "McKimmon Center"],
  ["islamic society of durham", "Islamic Society of Durham"],
  ["islamic center of durham", "Islamic Center of Durham"],
  ["community mosque of durham", "Community Mosque of Durham"],
  ["iqra academy", "Iqra Academy"],
  ["al-iman school", "Al-Iman School"],
  ["deen academy", "Deen Academy"],
  ["san ramon valley islamic center", "San Ramon Valley Islamic Center"],
  ["san ramon valley islamic", "San Ramon Valley Islamic Center"],
  ["srvic", "San Ramon Valley Islamic Center"],
  ["muslim community association", "Muslim Community Association"],
  ["mca bay area", "Muslim Community Association"],
  ["mca santa clara", "Muslim Community Association"],
  ["mcabayarea", "Muslim Community Association"],
  ["muslim community center of the east bay", "Muslim Community Center of the East Bay"],
  ["muslim community center", "Muslim Community Center of the East Bay"],
  ["mcc east bay", "Muslim Community Center of the East Bay"],
  ["mcc pleasanton", "Muslim Community Center of the East Bay"],
  ["mcceastbay", "Muslim Community Center of the East Bay"],
  ["adams center sterling", "ADAMS Sterling"],
  ["adams sterling", "ADAMS Sterling"],
  ["adams center fairfax", "ADAMS Fairfax"],
  ["adams fairfax", "ADAMS Fairfax"],
  ["adams center ashburn", "ADAMS Ashburn"],
  ["adams ashburn", "ADAMS Ashburn"],
  ["adams center gainesville", "ADAMS Gainesville"],
  ["adams gainesville", "ADAMS Gainesville"],
  ["adams center sully", "ADAMS Sully"],
  ["adams sully", "ADAMS Sully"],
  ["adams center leesburg", "ADAMS Leesburg"],
  ["adams leesburg", "ADAMS Leesburg"],
  ["qahwah cafe", "Qahwah Cafe"],
  ["qahwah coffee", "Qahwah Cafe"],
  ["qahwah", "Qahwah Cafe"],
  ["qahwa cafe", "Qahwah Cafe"],
  ["all dulles area muslim society", "ADAMS Sterling"],
  ["all dulles area", "ADAMS Sterling"],
  ["adams center", "ADAMS Sterling"],
  ["adams masjid", "ADAMS Sterling"],
];

const STREET_MATCHES: [string, string][] = [
  ["atwater", "Islamic Association of Raleigh (Atwater)"],
  ["page rd", "Islamic Association of Raleigh (Page Rd)"],
  ["quail fields", "Islamic Center of Morrisville"],
  ["w chatham st", "Islamic Center of Cary"],
  ["martin luther king", "Masjid King Khalid"],
  ["woods edge", "As-Salaam Islamic Center"],
  ["deah way", "North Raleigh Masjid"],
  ["buck jones", "North Raleigh Masjid"],
  ["center st, apex", "Apex Masjid"],
  ["center street, apex", "Apex Masjid"],
  ["legion rd", "Chapel Hill Islamic Society"],
  ["chapel hill rd", "Ar-Razzaq Islamic Center"],
  ["fayetteville st", "Jamaat Ibad Ar-Rahman"],
  ["revere rd", "Parkwood Masjid (JIAR)"],
  ["nw maynard", "The Light House Project"],
  ["kildaire farm", "The Light House Project"],
  ["jones franklin", "Muslim American Society (MAS Raleigh)"],
  ["rock quarry", "Raleigh Islamic Institute"],
  ["new hope rd", "Madinah Quran & Youth Center"],
  ["ridge rd, raleigh", "Madinah Quran & Youth Center"],
  ["ridge rd., raleigh", "Madinah Quran & Youth Center"],
  ["barber mill", "Islamic Center of Clayton"],
  ["method road", "Triangle Islamic Center"],
  ["method rd", "Triangle Islamic Center"],
  ["las positas", "Muslim Community Center of the East Bay"],
];

const CALENDAR_LEVEL_NAMES = new Set([
  "triangle muslim events",
]);

const HOSTED_BY_PATTERNS = [
  /(?:hosted|presented|organized|brought to you|put on|arranged) by\s+([^.;!?\n]+)/i,
  /(?:an? )?(?:iftar|fundraiser|dinner|banquet)\s+(?:by|from)\s+([^.;!?\n]+)/i,
];

const ORG_PATTERNS = [
  /islamic (?:center|association|society|institute) of \w[\w\s]*/i,
  /islamic relief[\w\s]*/i,
  /masjid [\w\s-]+/i,
  /(?:[\w\s-]+) (?:masjid|mosque)/i,
  /(?:[\w\s-]+) islamic (?:center|association|society|institute)/i,
  /muslim (?:community|american|student|youth) [\w\s]+/i,
  /zakat foundation[\w\s]*/i,
  /helping hand[s]?[\w\s]*/i,
];

function titleCase(name: string): string {
  const lowerWords = new Set(["of", "the", "and", "in", "at", "by", "for", "to", "a", "an", "on", "or"]);
  return name.split(" ").map((w, i) =>
    i === 0 || !lowerWords.has(w.toLowerCase())
      ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      : w.toLowerCase()
  ).join(" ");
}

const GENERIC_PHRASES = new Set([
  "a brother", "a sister", "a member", "a volunteer", "a friend",
  "our community", "the community", "a community member",
  "a brother from our community", "a sister from our community",
  "hearts dedicated", "gathering of hearts",
]);

function extractHostFromDescription(text: string): string {
  for (const pattern of HOSTED_BY_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      name = name.replace(/\s+(at|on|in|the|this|will|has|have|was|is|are|and will)\s.*$/i, "").trim();
      name = name.replace(/[*_~`]/g, "").trim();
      if (name.length < 3 || name.length > 80) continue;
      const nameLower = name.toLowerCase();
      if (GENERIC_PHRASES.has(nameLower)) continue;
      if (/^(a|an|the|some|our|my)\s/i.test(name) && !/^(a[ln]-|al |an-)/i.test(name)) continue;
      if (!/[A-Z]/.test(name) && !name.includes("islamic") && !name.includes("masjid")) continue;
      return titleCase(name);
    }
  }
  return "";
}

function extractOrgFromText(text: string): string {
  for (const pattern of ORG_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let name = match[0].trim();
      name = name.replace(/\s+(is|are|at|on|in|the|a|an|for|to|of the|will|has|have|was|with)\s*$/i, "").trim();
      if (name.length >= 8 && name.length <= 80) {
        return titleCase(name);
      }
    }
  }
  return "";
}

function extractVenueFromLocation(location: string): string {
  if (!location) return "";
  const parts = location.split(",");
  if (parts.length < 2) return "";
  const firstPart = parts[0].trim();
  if (/^\d/.test(firstPart)) return "";
  if (firstPart.length < 4 || firstPart.length > 60) return "";
  return firstPart;
}

function resolveOrganizer(event: any): string {
  const location = (event.location || "").toLowerCase();
  const description = (event.description || "").toLowerCase();
  const title = (event.summary || "").toLowerCase();
  const combined = location + " " + title + " " + description;

  const hostedBy = extractHostFromDescription(event.description || "");
  if (hostedBy) {
    const hostedLower = hostedBy.toLowerCase();
    for (const [pattern, org] of NAME_MATCHES) {
      if (hostedLower.includes(pattern) || pattern.includes(hostedLower)) {
        return org;
      }
    }
    return hostedBy;
  }

  for (const [pattern, org] of NAME_MATCHES) {
    if (combined.includes(pattern)) {
      return org;
    }
  }

  for (const [street, org] of STREET_MATCHES) {
    if (combined.includes(street)) {
      return org;
    }
  }

  const descOrg = extractOrgFromText(event.description || "");
  if (descOrg) return descOrg;

  const titleOrg = extractOrgFromText(event.summary || "");
  if (titleOrg) return titleOrg;

  const venueName = extractVenueFromLocation(event.location || "");
  if (venueName) return venueName;

  const orgName = event.organizer?.displayName || event.creator?.displayName || "";
  if (orgName && !CALENDAR_LEVEL_NAMES.has(orgName.toLowerCase())) {
    return orgName;
  }

  return "";
}

interface CachedEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
  organizer: string;
  imageUrl: string;
  registrationUrl: string;
  speaker: string;
  latitude: number | null;
  longitude: number | null;
  isVirtual: boolean;
  isFeatured: boolean;
}

let cachedEvents: CachedEvent[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 2 * 60 * 1000;
const REFRESH_INTERVAL = 5 * 60 * 1000;

function cleanDescription(rawDesc: string): string {
  let text = rawDesc;

  text = text.replace(/<img[^>]*>/gi, "");
  text = text.replace(/<a[^>]*>View Full Image<\/a>/gi, "");
  text = text.replace(/<a\s[^>]*>(.*?)<\/a>/gi, "$1");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(?:p|div|span|b|i|u|strong|em|h[1-6]|ul|ol|li|blockquote)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

  text = text.replace(/https?:\/\/[^\s)"<>]+/g, "");

  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  text = text.replace(/```(?:plaintext)?/g, "");
  text = text.replace(/\[Text from image\]\s*:?\s*/gi, "");

  text = text.replace(/^I'm sorry,?\s*but I cannot access external links\.?[^\n]*/gm, "");
  text = text.replace(/(?:if you provide the text|I would be happy to)[^\n]*/gi, "");

  const sections = text.split(/\n\s*---\s*\n/);
  if (sections.length >= 2) {
    const candidates = sections.map(s => {
      let clean = s.trim();
      clean = clean.replace(/^📝\s*(?:AI\s*)?Summary\s*:?\s*/i, "");
      clean = clean.replace(/https?:\/\/\S+/g, "").trim();
      return clean;
    }).filter(s => s.length > 20);

    if (candidates.length > 0) {
      let best = candidates[0];
      for (const c of candidates) {
        if (c.length > best.length) best = c;
      }
      text = best;
    }
  } else {
    text = text.replace(/^📝\s*(?:AI\s*)?Summary\s*:?\s*/im, "");
  }

  const lines = text.split("\n").filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^https?:\/\//.test(trimmed)) return false;
    if (trimmed === "---") return false;
    if (/^RSVP\s*(?:Here)?$/i.test(trimmed)) return false;
    if (/^(?:Register|Sign up|Click)\s*(?:here|now|today|below)?$/i.test(trimmed)) return false;
    return true;
  });
  text = lines.join("\n");

  text = text.replace(/\n{3,}/g, "\n\n").trim();

  text = text.replace(/^📝\s*(?:AI\s*)?Summary\s*:?\s*/im, "").trim();

  if (text.length < 10) return "";

  return text;
}

const LOCATION_ADDRESS_MAP: Record<string, string> = {
  "Cary Mosque": "1155 W Chatham St, Cary, NC 27511",
  "Light House Project": "1127 Kildaire Farm Rd, Cary, NC 27511",
  "The Light House Project": "1127 Kildaire Farm Rd, Cary, NC 27511",
  "The McKimmon Center": "1101 Gorman St, Raleigh, NC 27606",
  "Muslim Community Center of the East Bay": "5724 W Las Positas Blvd, Pleasanton, CA 94588",
  "MCC East Bay": "5724 W Las Positas Blvd, Pleasanton, CA 94588",
};

const KNOWN_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "Islamic Association of Raleigh": { lat: 35.7898, lng: -78.6912 },
  "Islamic Association of Raleigh (Atwater)": { lat: 35.7898, lng: -78.6912 },
  "Islamic Association of Raleigh (Page Rd)": { lat: 35.9067, lng: -78.8169 },
  "Islamic Center of Morrisville": { lat: 35.8099, lng: -78.8228 },
  "Islamic Center of Cary": { lat: 35.7731, lng: -78.8028 },
  "Al-Noor Islamic Center": { lat: 35.7636, lng: -78.7443 },
  "Jamaat Ibad Ar-Rahman (Fayetteville)": { lat: 35.9856, lng: -78.8977 },
  "Jamaat Ibad Ar-Rahman (Parkwood)": { lat: 35.8938, lng: -78.9109 },
  "Apex Masjid": { lat: 35.7294, lng: -78.8415 },
  "Ar-Razzaq Islamic Center": { lat: 35.9966, lng: -78.9155 },
  "As-Salaam Islamic Center": { lat: 35.7781, lng: -78.6075 },
  "Chapel Hill Islamic Society": { lat: 35.9406, lng: -79.0164 },
  "Masjid King Khalid": { lat: 35.7693, lng: -78.6383 },
  "North Raleigh Masjid": { lat: 35.8520, lng: -78.5571 },
  "Light House Project": { lat: 35.7672, lng: -78.7811 },
  "The Light House Project": { lat: 35.7672, lng: -78.7811 },
  "Muslim American Society (MAS Raleigh)": { lat: 35.7800, lng: -78.7000 },
  "Raleigh Islamic Institute": { lat: 35.7500, lng: -78.6200 },
  "Madinah Quran & Youth Center": { lat: 35.8200, lng: -78.5800 },
  "Rumman Room": { lat: 35.7834, lng: -78.6758 },
  "Cary Mosque": { lat: 35.7731, lng: -78.8028 },
  "San Ramon Valley Islamic Center": { lat: 37.7770, lng: -121.9691 },
  "Muslim Community Association": { lat: 37.3769, lng: -121.9595 },
  "Muslim Community Center of the East Bay": { lat: 37.6925, lng: -121.9040 },
  "MCA Al-Noor": { lat: 37.3530, lng: -121.9535 },
  "Taleef Collective": { lat: 37.5484, lng: -121.9886 },
  "Roots DFW": { lat: 32.9857, lng: -96.7502 },
  "Roots Community": { lat: 32.9857, lng: -96.7502 },
  "NC State Fairgrounds": { lat: 35.7939, lng: -78.7117 },
  "Islamic Center of Fremont": { lat: 37.5241, lng: -121.9660 },
  "Islamic Center of Fremont (ICF)": { lat: 37.5241, lng: -121.9660 },
  "Islamic Center of Fremont (ICF-Irvington)": { lat: 37.5241, lng: -121.9660 },
  "Masjid Zakariya": { lat: 37.5094, lng: -121.9628 },
  "Pillars Mosque": { lat: 35.3086, lng: -80.7200 },
  "Islamic Society of Greater Charlotte": { lat: 35.2025, lng: -80.7937 },
  "Los Gatos Islamic Center": { lat: 37.2358, lng: -121.9175 },
  "Los Gatos Islamic Center (LGIC)": { lat: 37.2358, lng: -121.9175 },
  "Saratoga Musalla": { lat: 37.3137, lng: -122.0310 },
  "ADAMS Sterling": { lat: 39.0057, lng: -77.4050 },
  "ADAMS Fairfax": { lat: 38.8697, lng: -77.3284 },
  "ADAMS Ashburn": { lat: 39.0438, lng: -77.4874 },
  "ADAMS Gainesville": { lat: 38.7004, lng: -77.5641 },
  "ADAMS Sully": { lat: 38.8874, lng: -77.4282 },
  "ADAMS Leesburg": { lat: 39.1157, lng: -77.5636 },
  "Qahwah Cafe": { lat: 39.0057, lng: -77.4050 },
};

function resolveCoordinates(organizer: string, location: string): { latitude: number | null; longitude: number | null } {
  if (organizer && KNOWN_COORDINATES[organizer]) {
    const c = KNOWN_COORDINATES[organizer];
    return { latitude: c.lat, longitude: c.lng };
  }
  for (const [name, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (location && location.toLowerCase().includes(name.toLowerCase())) {
      return { latitude: coords.lat, longitude: coords.lng };
    }
  }
  for (const [name, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (organizer && organizer.toLowerCase().includes(name.toLowerCase())) {
      return { latitude: coords.lat, longitude: coords.lng };
    }
  }

  if (location) {
    const loc = location.toLowerCase();
    for (const [city, coords] of Object.entries(NC_CITY_COORDINATES)) {
      if (loc.includes(city.toLowerCase())) {
        return { latitude: coords.lat, longitude: coords.lng };
      }
    }
  }

  return { latitude: null, longitude: null };
}

const NC_CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "Raleigh": { lat: 35.7796, lng: -78.6382 },
  "Durham": { lat: 35.9940, lng: -78.8986 },
  "Cary": { lat: 35.7915, lng: -78.7811 },
  "Chapel Hill": { lat: 35.9132, lng: -79.0558 },
  "Morrisville": { lat: 35.8235, lng: -78.8256 },
  "Apex": { lat: 35.7327, lng: -78.8503 },
  "Holly Springs": { lat: 35.6513, lng: -78.8336 },
  "Fuquay-Varina": { lat: 35.5843, lng: -78.8000 },
  "Fuquay": { lat: 35.5843, lng: -78.8000 },
  "Wake Forest": { lat: 35.9799, lng: -78.5097 },
  "Garner": { lat: 35.7113, lng: -78.6142 },
  "Knightdale": { lat: 35.7968, lng: -78.4806 },
  "Hillsborough": { lat: 36.0754, lng: -79.0998 },
  "Carrboro": { lat: 35.9101, lng: -79.0753 },
  "Pittsboro": { lat: 35.7202, lng: -79.1773 },
  "Clayton": { lat: 35.6507, lng: -78.4564 },
  "Sanford": { lat: 35.4799, lng: -79.1803 },
  "Fayetteville": { lat: 35.0527, lng: -78.8784 },
  "Greensboro": { lat: 36.0726, lng: -79.7920 },
  "Charlotte": { lat: 35.2271, lng: -80.8431 },
  "Wilson": { lat: 35.7212, lng: -77.9156 },
  "Greenville": { lat: 35.6127, lng: -77.3664 },
  "Concord": { lat: 35.4088, lng: -80.5795 },
};

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: address }),
    });
    const data = await resp.json();
    const place = data.places?.[0];
    if (place?.location?.latitude && place?.location?.longitude) {
      console.log(`[Geocode] Resolved "${address}" -> ${place.location.latitude}, ${place.location.longitude}`);
      return { lat: place.location.latitude, lng: place.location.longitude };
    }
    return null;
  } catch (err: any) {
    console.error(`[Geocode] Error geocoding "${address}":`, err.message);
    return null;
  }
}

const LOCATION_STRIP_PREFIXES = [
  /^islamic association of raleigh\s*[|,]\s*/i,
  /^iar masjid[^,]*,\s*/i,
  /^islamic center of morrisville\s*[|,]\s*/i,
  /^banquet hall of islamic center of morrisville\s*[|,]\s*/i,
  /^madinah quran and youth center\s*[|,]\s*/i,
  /^madinah quran & youth center\s*[|,]\s*/i,
  /^mycc\s*[|,]\s*/i,
  /^method park community hall\s*[|,]\s*/i,
  /^north raleigh masjid\s*[|,]\s*/i,
];

function resolveLocation(location: string): string {
  if (!location) return "";
  if (LOCATION_ADDRESS_MAP[location]) return LOCATION_ADDRESS_MAP[location];
  for (const [key, addr] of Object.entries(LOCATION_ADDRESS_MAP)) {
    if (location.toLowerCase().includes(key.toLowerCase())) return addr;
  }
  for (const pattern of LOCATION_STRIP_PREFIXES) {
    if (pattern.test(location)) {
      return location.replace(pattern, "");
    }
  }
  return location;
}

const ORGANIZER_ADDRESS_MAP: Record<string, string> = {
  "Islamic Association of Raleigh": "808 Atwater St, Raleigh, NC 27607",
  "Islamic Association of Raleigh (Atwater)": "808 Atwater St, Raleigh, NC 27607",
  "Islamic Association of Raleigh (Page Rd)": "9108 Page Rd, Durham, NC 27703",
  "Islamic Center of Morrisville": "101 Quail Fields Ct, Morrisville, NC 27560",
  "Islamic Center of Cary": "2206 W Chatham St, Cary, NC 27513",
  "Al-Noor Islamic Center": "1409 Ligon St, Raleigh, NC 27603",
  "Apex Masjid": "225 N Center St, Apex, NC 27502",
  "As-Salaam Islamic Center": "801 Woods Edge Ct, Raleigh, NC 27609",
  "Chapel Hill Islamic Society": "1005 Old Legion Rd, Chapel Hill, NC 27517",
  "Ar-Razzaq Islamic Center": "1009 Chapel Hill Rd, Durham, NC 27707",
  "North Raleigh Masjid": "5017 Deah Way, Raleigh, NC 27616",
  "Masjid King Khalid": "1309 Martin Luther King Jr Blvd, Raleigh, NC 27610",
  "Jamaat Ibad Ar-Rahman (Parkwood)": "4408 Revere Rd, Durham, NC 27713",
  "Light House Project": "1127 Kildaire Farm Rd, Cary, NC 27511",
  "Madinah Quran & Youth Center": "1329 Ridge Rd, Raleigh, NC 27607",
  "Muslim Community Center of the East Bay": "5724 W Las Positas Blvd, Pleasanton, CA 94588",
  "Muslim Community Association": "3003 Scott Blvd, Santa Clara, CA 95054",
  "San Ramon Valley Islamic Center": "2232 San Ramon Valley Blvd, San Ramon, CA 94583",
  "Roots DFW": "4200 International Pkwy, Carrollton, TX 75007",
  "ADAMS Sterling": "46903 Sugarland Rd, Sterling, VA 20164",
  "ADAMS Fairfax": "11216 Waples Mill Rd Unit 107, Fairfax, VA 22030",
  "ADAMS Ashburn": "21740 Beaumeade Circle Unit 120, Ashburn, VA 20147",
  "ADAMS Gainesville": "12655 Vint Hill Rd, Nokesville, VA 20181",
  "ADAMS Sully": "4431 Brookfield Corporate Dr Suite F, Chantilly, VA 20151",
  "ADAMS Leesburg": "19838 Sycolin Rd, Leesburg, VA 20175",
  "Qahwah Cafe": "46903 Sugarland Rd, Sterling, VA 20164",
};

function resolveOrgName(rawOrg: string): string {
  if (!rawOrg) return "";
  const lower = rawOrg.toLowerCase().trim();
  for (const [pattern, canonical] of NAME_MATCHES) {
    if (lower.includes(pattern) || pattern.includes(lower)) {
      return canonical;
    }
  }
  return "";
}

function resolveLocationFromOrganizer(organizer: string): string {
  if (!organizer) return "";
  if (ORGANIZER_ADDRESS_MAP[organizer]) return ORGANIZER_ADDRESS_MAP[organizer];
  for (const [name, addr] of Object.entries(ORGANIZER_ADDRESS_MAP)) {
    if (organizer.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(organizer.toLowerCase())) {
      return addr;
    }
  }
  return "";
}

const SPEAKER_PATTERNS = [
  /(?:with|featuring|by|speaker[:\s]*)\s+(?:Sheikh|Shaykh|Imam|Ustadh|Ustadha|Dr\.?|Mufti|Hafiz|Qari)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/i,
  /(?:Sheikh|Shaykh|Imam|Ustadh|Ustadha|Dr\.?|Mufti|Hafiz|Qari)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/,
];

function extractSpeaker(text: string): string {
  if (!text) return "";
  const clean = text.replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ");
  for (const pattern of SPEAKER_PATTERNS) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      name = name.replace(/\s+(?:and|&|with|for|in|at|on|who|will|is)\s+.*/i, "").trim();
      name = name.replace(/[.,!?;:✨]+$/, "").trim();
      if (name.length >= 3 && name.length <= 50) {
        const titleMatch = clean.match(new RegExp(`(Sheikh|Shaykh|Imam|Ustadh|Ustadha|Dr\\.?|Mufti|Hafiz|Qari)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
        if (titleMatch) {
          return `${titleMatch[1]} ${name}`;
        }
        return name;
      }
    }
  }
  return "";
}

function processEvent(event: any): CachedEvent {
  const desc = event.description || "";
  const imgMatch = desc.match(/src="([^"]+)"/);
  const imageUrl = imgMatch ? imgMatch[1] : "";

  const allLinks = desc.match(/https?:\/\/[^\s)"<>]+/g) || [];
  const registrationUrl = allLinks.find((url: string) =>
    !url.includes("drive.google.com/thumbnail") &&
    (url.includes("forms.gle") ||
     url.includes("docs.google.com/forms") ||
     url.includes("event-details") ||
     url.includes("registration") ||
     url.includes("register") ||
     url.includes("signup") ||
     url.includes("sign-up") ||
     url.includes("tinyurl.com") ||
     url.includes("givingtools.com") ||
     url.includes("rsvp") ||
     url.includes("eventbrite") ||
     url.includes("bit.ly"))
  ) || allLinks.find((url: string) =>
    !url.includes("drive.google.com/thumbnail")
  ) || "";

  const organizer = resolveOrganizer(event);
  const resolvedLocation = resolveLocation(event.location || "");
  const coords = resolveCoordinates(organizer, event.location || "");

  return {
    id: event.id,
    title: event.summary || "Untitled Event",
    description: cleanDescription(desc),
    location: resolvedLocation,
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    isAllDay: !event.start?.dateTime,
    organizer,
    imageUrl,
    registrationUrl,
    speaker: extractSpeaker(desc),
    latitude: coords.latitude,
    longitude: coords.longitude,
    isVirtual: false,
    isFeatured: false,
  };
}

async function fetchAndCacheEvents(): Promise<CachedEvent[]> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startOfToday.toISOString(),
      timeMax: threeMonthsLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const events = (response.data.items || []).map(processEvent);
    cachedEvents = events;
    lastFetchTime = Date.now();

    const matched = events.filter(e => e.organizer).length;
    console.log(`[Calendar Sync] Fetched ${events.length} events (${matched} with organizer) at ${new Date().toISOString()}`);

    return events;
  } catch (error: any) {
    console.error(`[Calendar Sync] Error: ${error.message}`);
    if (cachedEvents.length > 0) {
      console.log(`[Calendar Sync] Returning ${cachedEvents.length} cached events`);
      return cachedEvents;
    }
    throw error;
  }
}

function startAutoRefresh() {
  fetchAndCacheEvents().catch(err =>
    console.error("[Calendar Sync] Initial fetch failed:", err.message)
  );

  setInterval(() => {
    fetchAndCacheEvents().catch(err =>
      console.error("[Calendar Sync] Scheduled refresh failed:", err.message)
    );
  }, REFRESH_INTERVAL);
}

function getDbPool() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  pool.on("error", (err) => {
    console.error("[DB Pool] Unexpected error on idle client:", err.message);
  });
  return pool;
}

async function ensureJumuahTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jumuah_schedules (
      id SERIAL PRIMARY KEY,
      masjid VARCHAR(255) NOT NULL,
      khutbah_time VARCHAR(20) NOT NULL,
      iqama_time VARCHAR(50) NOT NULL,
      speaker VARCHAR(255),
      topic VARCHAR(500),
      active BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Widen time columns if they are still the original narrow VARCHAR types
  await pool.query(`ALTER TABLE jumuah_schedules ALTER COLUMN khutbah_time TYPE VARCHAR(200);`).catch(() => {});
  await pool.query(`ALTER TABLE jumuah_schedules ALTER COLUMN iqama_time TYPE VARCHAR(200);`).catch(() => {});
  // Add metro, timezone, khutbahs columns if they don't exist
  await pool.query(`ALTER TABLE jumuah_schedules ADD COLUMN IF NOT EXISTS metro VARCHAR(255);`);
  await pool.query(`ALTER TABLE jumuah_schedules ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);`);
  await pool.query(`ALTER TABLE jumuah_schedules ADD COLUMN IF NOT EXISTS khutbahs JSONB;`);
  // Clean up legacy abbreviated names that conflict with proper full names
  await pool.query(`DELETE FROM jumuah_schedules WHERE masjid IN ('SRVIC', 'MCA', 'Muslim Community Center of the East Bay (MCC)', 'Islamic Society of Greater Indianapolis (ISOG)', 'Al-Huda Foundation (IAT)');`);
  // Deduplicate masjid names — keep row with highest id (most recent seed)
  await pool.query(`
    DELETE FROM jumuah_schedules a
    USING jumuah_schedules b
    WHERE a.masjid = b.masjid AND a.id < b.id;
  `);
  // Add unique index on masjid for upsert support
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jumuah_schedules_masjid_unique ON jumuah_schedules (masjid);`);

  // Backfill existing NC rows
  await pool.query(`
    UPDATE jumuah_schedules
    SET metro = 'Raleigh-Durham NC', timezone = 'America/New_York'
    WHERE metro IS NULL;
  `);

  // Migrate comma-separated times to khutbahs JSONB for rows that don't have it yet
  const { rows: toMigrate } = await pool.query(`
    SELECT id, khutbah_time, iqama_time, speaker, topic FROM jumuah_schedules WHERE khutbahs IS NULL;
  `);
  for (const row of toMigrate) {
    const khutbahTimes = (row.khutbah_time as string).split(",").map((t: string) => t.trim()).filter(Boolean);
    const iqamaTimes = (row.iqama_time as string).split(",").map((t: string) => t.trim()).filter(Boolean);
    const slots = khutbahTimes.map((kt: string, i: number) => {
      const slot: any = { khutbah_time: kt, iqama_time: iqamaTimes[i] || iqamaTimes[0] || "" };
      if (row.speaker) slot.speaker = row.speaker;
      if (row.topic) slot.topic = row.topic;
      return slot;
    });
    await pool.query(`UPDATE jumuah_schedules SET khutbahs = $1 WHERE id = $2`, [JSON.stringify(slots), row.id]);
  }

  const { rows } = await pool.query("SELECT COUNT(*) as count FROM jumuah_schedules");
  if (parseInt(rows[0].count) === 0) {
    const ncRows = [
      { masjid: 'IAR (Atwater)', khutbah_time: '1:00 PM', iqama_time: '1:30 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 1 },
      { masjid: 'IAR (Page Rd)', khutbah_time: '1:00 PM', iqama_time: '1:30 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 2 },
      { masjid: 'Islamic Center of Morrisville', khutbah_time: '12:30 PM', iqama_time: '1:00 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 3 },
      { masjid: 'Islamic Center of Cary', khutbah_time: '1:00 PM', iqama_time: '1:30 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 4 },
      { masjid: 'As-Salaam Islamic Center', khutbah_time: '1:15 PM', iqama_time: '1:45 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 5 },
      { masjid: 'Chapel Hill Islamic Society', khutbah_time: '1:00 PM', iqama_time: '1:30 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 6 },
      { masjid: 'Ar-Razzaq Islamic Center', khutbah_time: '1:15 PM', iqama_time: '1:45 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 7 },
      { masjid: 'Jamaat Ibad Ar-Rahman (Fayetteville)', khutbah_time: '1:00 PM', iqama_time: '1:30 PM', metro: 'Raleigh-Durham NC', timezone: 'America/New_York', sort_order: 8 },
    ];
    for (const r of ncRows) {
      const slots = [{ khutbah_time: r.khutbah_time, iqama_time: r.iqama_time }];
      await pool.query(
        `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.masjid, r.khutbah_time, r.iqama_time, r.metro, r.timezone, JSON.stringify(slots), r.sort_order]
      );
    }
    // Parkwood - multi-slot
    const parkwoodSlots = [
      { khutbah_time: '12:10 PM', iqama_time: '12:40 PM' },
      { khutbah_time: '1:10 PM', iqama_time: '1:40 PM' },
      { khutbah_time: '2:10 PM', iqama_time: '2:40 PM' },
    ];
    await pool.query(
      `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      ['Jamaat Ibad Ar-Rahman (Parkwood)', '12:10 PM, 1:10 PM, 2:10 PM', '12:40 PM, 1:40 PM, 2:40 PM', 'Raleigh-Durham NC', 'America/New_York', JSON.stringify(parkwoodSlots), 9]
    );
    console.log("[DB] Seeded default Jumuah schedules");
  }

  // Seed new metros if not already present
  await seedJumuahMetros(pool);
}

async function seedJumuahMetros(pool: pg.Pool) {
  // Bay Area CA
  const bayAreaMasjids = [
    { masjid: 'Muslim Community Association (MCA)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'Bay Area CA', timezone: 'America/Los_Angeles', sort_order: 100 },
    { masjid: 'Islamic Center of Fremont (ICF)', khutbah_time: '1:00 PM', iqama_time: '1:15 PM', metro: 'Bay Area CA', timezone: 'America/Los_Angeles', sort_order: 101 },
    { masjid: 'South Bay Islamic Association (SBIA)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'Bay Area CA', timezone: 'America/Los_Angeles', sort_order: 102 },
    { masjid: 'San Ramon Valley Islamic Center (SRVIC)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'Bay Area CA', timezone: 'America/Los_Angeles', sort_order: 103 },
    { masjid: 'Berkeley Masjid', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'Bay Area CA', timezone: 'America/Los_Angeles', sort_order: 104 },
  ];
  // Indianapolis IN
  const indiMasjids = [
    { masjid: 'Islamic Society of Greater Indianapolis (ISOC)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'Indianapolis IN', timezone: 'America/Indiana/Indianapolis', sort_order: 200 },
    { masjid: 'Islamic Alliance of Indianapolis (IAT)', khutbah_time: '1:00 PM', iqama_time: '1:15 PM', metro: 'Indianapolis IN', timezone: 'America/Indiana/Indianapolis', sort_order: 201 },
  ];
  // Las Vegas NV
  const lasMasjids = [
    { masjid: 'Las Vegas Islamic Center (LVIC)', khutbah_time: '1:30 PM', iqama_time: '1:45 PM', metro: 'Las Vegas NV', timezone: 'America/Los_Angeles', sort_order: 300 },
    { masjid: 'Southern Nevada Muslim Community Center (SNVMC)', khutbah_time: '1:30 PM', iqama_time: '1:45 PM', metro: 'Las Vegas NV', timezone: 'America/Los_Angeles', sort_order: 301 },
  ];
  // DMV — ADAMS Center branches (seed times; scraper will update on Thursdays)
  const dmvMasjids = [
    { masjid: 'ADAMS Sterling', khutbah_time: '1:00 PM, 2:00 PM, 3:00 PM', iqama_time: '1:15 PM, 2:15 PM, 3:15 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 400, slots: [{ khutbah_time: '1:00 PM', iqama_time: '1:15 PM' }, { khutbah_time: '2:00 PM', iqama_time: '2:15 PM' }, { khutbah_time: '3:00 PM', iqama_time: '3:15 PM' }] },
    { masjid: 'ADAMS Fairfax', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 401, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Ashburn', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 402, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Gainesville', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 403, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Leesburg', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 405, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Sully', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 404, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Ashburn Village', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 409, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Leesburg (Clarion Inn)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 410, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Reston (NVHC)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 407, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'Home2 Suites Chantilly (ADAMS)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 406, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
    { masjid: 'ADAMS Manassas (Wyndham Gardens)', khutbah_time: '1:15 PM', iqama_time: '1:30 PM', metro: 'DMV', timezone: 'America/New_York', sort_order: 408, slots: [{ khutbah_time: '1:15 PM', iqama_time: '1:30 PM' }] },
  ];
  for (const r of dmvMasjids) {
    await pool.query(
      `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (masjid) DO NOTHING`,
      [r.masjid, r.khutbah_time, r.iqama_time, r.metro, r.timezone, JSON.stringify(r.slots), r.sort_order]
    );
  }

  // DFW TX
  const dfwMasjids = [
    { masjid: 'Valley Ranch Islamic Center', khutbah_time: '1:45 PM, 3:00 PM, 4:00 PM', iqama_time: '2:00 PM, 3:15 PM, 4:15 PM', metro: 'DFW TX', timezone: 'America/Chicago', sort_order: 600, slots: [{ khutbah_time: '1:45 PM', iqama_time: '2:00 PM', speaker: 'Sh. Majed Mahmoud' }, { khutbah_time: '3:00 PM', iqama_time: '3:15 PM', speaker: 'Dr. Abdul Razzak Junaid' }, { khutbah_time: '4:00 PM', iqama_time: '4:15 PM', speaker: 'Ust. Ameen Atta' }] },
  ];
  for (const r of dfwMasjids) {
    await pool.query(
      `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (masjid) DO UPDATE SET metro=EXCLUDED.metro, timezone=EXCLUDED.timezone, khutbahs=EXCLUDED.khutbahs, sort_order=EXCLUDED.sort_order`,
      [r.masjid, r.khutbah_time, r.iqama_time, r.metro, r.timezone, JSON.stringify(r.slots), r.sort_order]
    );
  }

  // Milwaukee WI
  const mkeMasjids = [
    { masjid: 'ISM', khutbah_time: '12:30 PM, 1:45 PM', iqama_time: '1:00 PM, 2:15 PM', metro: 'Milwaukee WI', timezone: 'America/Chicago', sort_order: 500, slots: [{ khutbah_time: '12:30 PM', iqama_time: '1:00 PM' }, { khutbah_time: '1:45 PM', iqama_time: '2:15 PM' }] },
  ];
  for (const r of mkeMasjids) {
    await pool.query(
      `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (masjid) DO UPDATE SET metro=EXCLUDED.metro, timezone=EXCLUDED.timezone, khutbahs=EXCLUDED.khutbahs, sort_order=EXCLUDED.sort_order`,
      [r.masjid, r.khutbah_time, r.iqama_time, r.metro, r.timezone, JSON.stringify(r.slots), r.sort_order]
    );
  }

  const allNew = [...bayAreaMasjids, ...indiMasjids, ...lasMasjids];
  // Remove incorrectly-named rows from previous seeds
  await pool.query(`DELETE FROM jumuah_schedules WHERE masjid IN ('Muslim Community Center of the East Bay (MCC)', 'Islamic Society of Greater Indianapolis (ISOG)', 'Al-Huda Foundation (IAT)')`);
  for (const r of allNew) {
    const slots = [{ khutbah_time: r.khutbah_time, iqama_time: r.iqama_time }];
    await pool.query(
      `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (masjid) DO UPDATE SET metro=EXCLUDED.metro, timezone=EXCLUDED.timezone, khutbahs=EXCLUDED.khutbahs, sort_order=EXCLUDED.sort_order`,
      [r.masjid, r.khutbah_time, r.iqama_time, r.metro, r.timezone, JSON.stringify(slots), r.sort_order]
    );
  }
}

async function scrapeAdamsCenterJumuah(pool: pg.Pool): Promise<void> {
  try {
    const resp = await fetch("https://adamscenter.org/jumuah/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SalamYallBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`[Adams Jumuah] HTTP ${resp.status}`);
      return;
    }
    const html = await resp.text();

    // Decode HTML entities and strip scripts/styles/tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/&#\d+;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // All known ADAMS section headers in the page, mapped to DB masjid names.
    // More-specific patterns (satellites) appear first so their positions are found
    // before the main branch patterns, enabling correct section boundary detection.
    const VENUE_HEADERS: { re: RegExp; masjid: string; sort: number }[] = [
      // Satellite / overflow locations
      { re: /\bAshburn\s+Satellite\s+Jumu[''\u2019]?ah\b/i,     masjid: "ADAMS Ashburn Village",           sort: 409 },
      { re: /\bSully\s+Satellite\s+Jumu[''\u2019]?ah\b/i,        masjid: "Home2 Suites Chantilly (ADAMS)",  sort: 406 },
      { re: /\bGainesville\s+Satellite\s+Jumu[''\u2019]?ah\b/i,  masjid: "ADAMS Manassas (Wyndham Gardens)", sort: 408 },
      { re: /\bLeesburg\s+Satellite\s+Jumu[''\u2019]?ah\b/i,     masjid: "ADAMS Leesburg (Clarion Inn)",    sort: 410 },
      // Main ADAMS branches
      { re: /\bNVHC\s+Jumu[''\u2019]?ah\b|\bReston\s+Jumu[''\u2019]?ah\b/i, masjid: "ADAMS Reston (NVHC)", sort: 407 },
      { re: /\bSterling\s+Jumu[''\u2019]?ah\b/i,                 masjid: "ADAMS Sterling",                  sort: 400 },
      { re: /\bFairfax\s+Jumu[''\u2019]?ah\b/i,                  masjid: "ADAMS Fairfax",                   sort: 401 },
      { re: /\bAshburn\s+Jumu[''\u2019]?ah\b/i,                  masjid: "ADAMS Ashburn",                   sort: 402 },
      { re: /\bGainesville\s+Jumu[''\u2019]?ah\b/i,              masjid: "ADAMS Gainesville",               sort: 403 },
      { re: /\bSully\s+Jumu[''\u2019]?ah\b/i,                    masjid: "ADAMS Sully",                     sort: 404 },
      { re: /\bLeesburg\s+Jumu[''\u2019]?ah\b/i,                 masjid: "ADAMS Leesburg",                  sort: 405 },
    ];

    // Sentinel patterns: partner/footer sections that act as content boundaries only (not saved to DB)
    const SENTINEL_PATTERNS: RegExp[] = [
      /\bCrescent\s+Islamic\s+Center\s+Jumu[''\u2019]?ah\b/i,
      /\bPartner\s+Jummah\s+Locations?\b/i,
      /\bTysons\s+Jumu[''\u2019]?ah\b/i,
    ];

    // Find each venue's section header position in the text (first occurrence only)
    type SectionEntry = { masjid: string | null; sort: number; headerEnd: number; headerStart: number };
    const found: SectionEntry[] = [];
    for (const vh of VENUE_HEADERS) {
      const m = vh.re.exec(text);
      if (m && !found.find(f => f.masjid === vh.masjid)) {
        found.push({ masjid: vh.masjid, sort: vh.sort, headerStart: m.index, headerEnd: m.index + m[0].length });
      }
    }
    // Add sentinel positions as null-masjid boundary markers
    for (const sp of SENTINEL_PATTERNS) {
      const m = sp.exec(text);
      if (m) found.push({ masjid: null, sort: 999, headerStart: m.index, headerEnd: m.index + m[0].length });
    }

    const venueCount = found.filter(f => f.masjid !== null).length;
    if (venueCount === 0) {
      console.warn("[Adams Jumuah] No Jumu'ah section headers found in page");
      return;
    }

    // Sort all entries (venues + sentinels) by document position
    found.sort((a, b) => a.headerStart - b.headerStart);

    // Build parsed sections map
    const parsedSections = new Map<string, { masjid: string; sort: number; slots: { khutbah_time: string; speaker?: string }[] }>();

    for (let i = 0; i < found.length; i++) {
      const sec = found[i];
      if (sec.masjid === null) continue; // sentinel boundary — skip parsing, used only for positioning

      // Content runs from after this section's "Jumu'ah" to the start of the next section header
      const contentStart = sec.headerEnd;
      const contentEnd = found[i + 1]?.headerStart ?? text.length;
      const content = text.slice(contentStart, Math.min(contentEnd, contentStart + 1500));

      // Find all times in this section
      const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi;
      const timeMatches = [...content.matchAll(TIME_RE)];
      if (timeMatches.length === 0) continue;

      // For each time, extract the speaker name that follows (text until next time or end)
      const slots: { khutbah_time: string; speaker?: string }[] = [];
      for (let j = 0; j < timeMatches.length; j++) {
        const tm = timeMatches[j];
        const khutbah_time = tm[1].replace(/\s+/g, " ").toUpperCase();

        // Extract speaker: one or more words (capitalized) following the time
        // Allow hyphens and mixed-case Arabic name particles (al, ar, ibn, bin, Abd, etc.)
        const afterStart = tm.index! + tm[0].length;
        const afterEnd = timeMatches[j + 1]?.index ?? content.length;
        const afterText = content.slice(afterStart, afterEnd).trim();
        const speakerMatch = afterText.match(/^([A-Z][a-zA-Z'.\-]+(?:\s+(?:[A-Z]|(?:al|ar|bin|bint|ibn|Abd|Ar|El|Al|Ul|Ur))[a-zA-Z'.\-]*){0,5})/);
        const speaker = speakerMatch ? speakerMatch[1].replace(/\s+/g, " ").trim() : undefined;

        slots.push({ khutbah_time, ...(speaker ? { speaker } : {}) });
      }

      parsedSections.set(sec.masjid, { masjid: sec.masjid, sort: sec.sort, slots });
    }

    const validSections = [...parsedSections.values()];

    if (validSections.length === 0) {
      console.warn("[Adams Jumuah] No time slots found in page");
      return;
    }

    for (const sec of validSections) {
      const legacyTimes = sec.slots.map(s => s.khutbah_time).join(", ");
      await pool.query(
        `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, metro, timezone, khutbahs, sort_order)
         VALUES ($1, $2, $2, 'DMV', 'America/New_York', $3, $4)
         ON CONFLICT (masjid) DO UPDATE SET
           khutbah_time = EXCLUDED.khutbah_time,
           iqama_time = EXCLUDED.iqama_time,
           metro = EXCLUDED.metro,
           timezone = EXCLUDED.timezone,
           khutbahs = EXCLUDED.khutbahs,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [sec.masjid, legacyTimes, JSON.stringify(sec.slots), sec.sort]
      ).catch((err: any) => console.error(`[Adams Jumuah] DB error for ${sec.masjid}:`, err.message));
    }

    // Validation: warn if any required main branch is missing
    const REQUIRED = ["ADAMS Sterling", "ADAMS Fairfax", "ADAMS Ashburn", "ADAMS Gainesville", "ADAMS Sully", "ADAMS Leesburg"];
    const foundNames = validSections.map(s => s.masjid);
    const missing = REQUIRED.filter(v => !foundNames.some(f => f.startsWith(v)));
    if (missing.length > 0) console.warn(`[Adams Jumuah] Missing expected venues: ${missing.join(", ")}`);
    console.log(`[Adams Jumuah] Scraped and saved ${validSections.length} venue(s): ${foundNames.join(", ")}`);
  } catch (err: any) {
    console.error("[Adams Jumuah] Scrape error:", err.message);
  }
}

function scheduleAdamsJumuahScraper(pool: pg.Pool): void {
  // Run immediately on startup
  scrapeAdamsCenterJumuah(pool).catch(err => console.error("[Adams Jumuah] Startup scrape error:", err.message));

  // Re-scrape every 24 hours, but only actually update on Thursdays
  setInterval(() => {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (nowET.getDay() === 4) {
      scrapeAdamsCenterJumuah(pool).catch(err => console.error("[Adams Jumuah] Thursday scrape error:", err.message));
    }
  }, 24 * 60 * 60 * 1000);
}

async function ensureEventOverridesTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_overrides (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(500) UNIQUE NOT NULL,
      title VARCHAR(500),
      description TEXT,
      location VARCHAR(500),
      start_time VARCHAR(100),
      end_time VARCHAR(100),
      organizer VARCHAR(255),
      image_url TEXT,
      registration_url TEXT,
      is_virtual BOOLEAN,
      is_featured BOOLEAN,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureCommunityEventsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      location VARCHAR(500),
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      organizer VARCHAR(255),
      registration_url TEXT,
      image_data TEXT,
      image_mime VARCHAR(50) DEFAULT 'image/jpeg',
      is_virtual BOOLEAN DEFAULT false,
      is_featured BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Recurrence columns
  await pool.query(`ALTER TABLE community_events ADD COLUMN IF NOT EXISTS recurrence_group_id UUID`).catch(() => {});
  await pool.query(`ALTER TABLE community_events ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(50)`).catch(() => {});
  await pool.query(`ALTER TABLE community_events ADD COLUMN IF NOT EXISTS recurrence_config JSONB`).catch(() => {});
  await pool.query(`ALTER TABLE community_events ADD COLUMN IF NOT EXISTS series_index INTEGER DEFAULT 0`).catch(() => {});
}

async function ensureAnalyticsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      event_data JSONB,
      device_id VARCHAR(100),
      platform VARCHAR(20),
      user_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_device ON analytics_events(device_id);`);
  await pool.query(`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_id INTEGER;`).catch(() => {});
}

async function ensureMasjidsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS masjids (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      address TEXT NOT NULL,
      website TEXT,
      match_terms TEXT[],
      has_iqama BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      campus_group VARCHAR(100),
      iqama_source VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS masjids_name_unique ON masjids (name);
    DO $$ BEGIN
      ALTER TABLE masjids ADD COLUMN IF NOT EXISTS campus_group VARCHAR(100);
      ALTER TABLE masjids ADD COLUMN IF NOT EXISTS iqama_source VARCHAR(255);
      ALTER TABLE masjids ADD COLUMN IF NOT EXISTS iqama_id VARCHAR(100);
      ALTER TABLE masjids ADD COLUMN IF NOT EXISTS jumuah_id VARCHAR(255);
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);
  const { rows } = await pool.query("SELECT COUNT(*) as count FROM masjids");
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, sort_order) VALUES
        ('Al-Noor Islamic Center', 35.5843, -78.7706, '6317 Sunset Lake Rd, Fuquay-Varina, NC 27526', 'https://alnooric.org', ARRAY['al-noor', 'alnoor', 'sunset lake', 'fuquay'], true, 1),
        ('Islamic Association of Raleigh (Atwater)', 35.7898, -78.6912, '808 Atwater St, Raleigh, NC 27607', 'https://raleighmasjid.org', ARRAY['iar', 'islamic association of raleigh', 'atwater'], true, 2),
        ('Islamic Association of Raleigh (Page Rd)', 35.9067, -78.8169, '3104 Page Rd, Morrisville, NC 27560', 'https://raleighmasjid.org', ARRAY['iar', 'islamic association of raleigh', 'page rd', 'page road'], true, 3),
        ('Islamic Center of Morrisville', 35.8099, -78.8228, '107 Quail Fields Ct, Morrisville, NC 27560', 'https://www.icmnc.org', ARRAY['icm', 'islamic center of morrisville', 'quail fields', 'icmnc'], true, 4),
        ('Jamaat Ibad Ar-Rahman (Fayetteville)', 35.9856, -78.8977, '3034 Fayetteville St, Durham, NC 27707', 'https://ibadarrahman.org', ARRAY['jamaat ibad', 'jiar', 'fayetteville st', 'ibad ar-rahman'], true, 5),
        ('Jamaat Ibad Ar-Rahman (Parkwood)', 35.8938, -78.9109, '5122 Revere Rd, Durham, NC 27713', 'https://ibadarrahman.org', ARRAY['parkwood', 'revere rd', 'ibad ar-rahman'], true, 6),
        ('Apex Masjid', 35.7294, -78.8415, '733 Center St, Apex, NC 27502', 'https://apexmosque.org', ARRAY['apex masjid', 'apex mosque', 'center st, apex'], false, 7),
        ('Ar-Razzaq Islamic Center', 35.9977, -78.9069, '1009 W Chapel Hill St, Durham, NC 27701', 'https://arrazzaqislamiccenter.org', ARRAY['ar-razzaq', 'arrazzaq', 'chapel hill st, durham'], false, 8),
        ('As-Salaam Islamic Center', 35.7781, -78.6075, '110 Lord Anson Dr, Raleigh, NC 27610', 'https://assalaamic.org', ARRAY['as-salaam', 'assalaam', 'lord anson'], false, 9),
        ('Chapel Hill Islamic Society', 35.9131, -79.0469, '103 Stateside Dr, Chapel Hill, NC 27514', 'https://chapelhillmasjid.org', ARRAY['chapel hill islamic', 'stateside dr', 'chapel hill masjid'], false, 10),
        ('Islamic Center of Cary', 35.7731, -78.8028, '1155 W Chatham St, Cary, NC 27511', 'https://www.carymasjid.org', ARRAY['islamic center of cary', 'chatham st', 'cary masjid'], false, 11),
        ('Masjid King Khalid', 35.7693, -78.6383, '130 Martin Luther King Jr Blvd, Raleigh, NC 27601', 'https://www.masjidkingkhalid.org', ARRAY['king khalid', 'martin luther king'], false, 12),
        ('North Raleigh Masjid', 35.8741, -78.5640, '5017 Deah Way, Raleigh, NC 27616', 'https://mycc-rdu.org', ARRAY['north raleigh masjid', 'deah way', 'mycc', 'muslim youth community center'], false, 13),
        ('San Ramon Valley Islamic Center', 37.7770, -121.9691, '2230 Camino Ramon, San Ramon, CA 94583', 'https://srvic.org', ARRAY['srvic', 'san ramon valley islamic', 'camino ramon'], true, 14),
        ('Muslim Community Association', 37.3769, -121.9595, '3003 Scott Blvd, Santa Clara, CA 95054', 'https://www.mcabayarea.org', ARRAY['mca', 'muslim community association', 'scott blvd', 'mcabayarea'], true, 15),
        ('MCA Al-Noor', 37.3530, -121.9535, '1755 Catherine St, Santa Clara, CA 95050', 'https://www.mcabayarea.org', ARRAY['mca al-noor', 'mca alnoor', 'mca noor', 'catherine st'], true, 16),
        ('Muslim Community Center of the East Bay', 37.6925, -121.9040, '5724 W Las Positas Blvd, Pleasanton, CA 94588', 'https://mcceastbay.org', ARRAY['mcc', 'mcc east bay', 'muslim community center', 'las positas', 'pleasanton'], true, 17);
    `);
    console.log("[DB] Seeded default masjids");
  } else {
    await pool.query(`UPDATE masjids SET name = 'Al-Noor Islamic Center' WHERE name = 'Al Noor Islamic Center'`);
    await pool.query(`DELETE FROM masjids WHERE name = 'Muslim Youth and Community Center'`);
    await pool.query(`DELETE FROM masjids WHERE name = 'MCA Noor'`);
    await pool.query(`UPDATE iqama_schedules SET masjid = 'MCA Al-Noor' WHERE masjid = 'MCA Noor'`);
    await pool.query(`UPDATE masjids SET name = 'Islamic Center of Fremont (ICF)' WHERE name = 'Islamic Center of Fremont'`);
    await pool.query(`UPDATE masjids SET name = 'Los Gatos Islamic Center (LGIC)' WHERE name = 'Los Gatos Islamic Center'`);
    const masjidUpserts: { name: string; lat: number; lng: number; addr: string; website: string | null; terms: string[]; iqama: boolean; sort: number; campusGroup?: string; iqamaSource?: string; iqamaId?: string; jumuahId?: string }[] = [
      { name: 'Al-Noor Islamic Center', lat: 35.5843, lng: -78.7706, addr: '6317 Sunset Lake Rd, Fuquay-Varina, NC 27526', website: 'https://alnooric.org', terms: ['al-noor', 'alnoor', 'sunset lake', 'fuquay'], iqama: true, sort: 1, iqamaId: 'Al Noor' },
      { name: 'Islamic Association of Raleigh (Atwater)', lat: 35.7898, lng: -78.6912, addr: '808 Atwater St, Raleigh, NC 27607', website: 'https://raleighmasjid.org', terms: ['iar', 'islamic association of raleigh', 'atwater'], iqama: true, sort: 2, campusGroup: 'iar', iqamaId: 'IAR', jumuahId: 'IAR (Atwater)' },
      { name: 'Islamic Association of Raleigh (Page Rd)', lat: 35.9067, lng: -78.8169, addr: '3104 Page Rd, Morrisville, NC 27560', website: 'https://raleighmasjid.org', terms: ['iar', 'islamic association of raleigh', 'page rd', 'page road'], iqama: true, sort: 3, campusGroup: 'iar', iqamaSource: 'IAR', iqamaId: 'IAR', jumuahId: 'IAR (Page Rd)' },
      { name: 'Islamic Center of Morrisville', lat: 35.8099, lng: -78.8228, addr: '107 Quail Fields Ct, Morrisville, NC 27560', website: 'https://www.icmnc.org', terms: ['icm', 'islamic center of morrisville', 'quail fields', 'icmnc'], iqama: true, sort: 4, iqamaSource: 'ICMNC', iqamaId: 'ICMNC', jumuahId: 'Islamic Center of Morrisville' },
      { name: 'Jamaat Ibad Ar-Rahman (Fayetteville)', lat: 35.9856, lng: -78.8977, addr: '3034 Fayetteville St, Durham, NC 27707', website: 'https://ibadarrahman.org', terms: ['jamaat ibad', 'jiar', 'fayetteville st', 'ibad ar-rahman'], iqama: true, sort: 5, campusGroup: 'jiar', iqamaId: 'JIAR (Fayetteville)', jumuahId: 'Jamaat Ibad Ar-Rahman (Fayetteville)' },
      { name: 'Jamaat Ibad Ar-Rahman (Parkwood)', lat: 35.8938, lng: -78.9109, addr: '5122 Revere Rd, Durham, NC 27713', website: 'https://ibadarrahman.org', terms: ['parkwood', 'revere rd', 'ibad ar-rahman'], iqama: true, sort: 6, campusGroup: 'jiar', iqamaId: 'JIAR (Parkwood)', jumuahId: 'Jamaat Ibad Ar-Rahman (Parkwood)' },
      { name: 'Apex Masjid', lat: 35.7294, lng: -78.8415, addr: '733 Center St, Apex, NC 27502', website: 'https://apexmosque.org', terms: ['apex masjid', 'apex mosque', 'center st, apex'], iqama: false, sort: 7 },
      { name: 'Ar-Razzaq Islamic Center', lat: 35.9977, lng: -78.9069, addr: '1009 W Chapel Hill St, Durham, NC 27701', website: 'https://arrazzaqislamiccenter.org', terms: ['ar-razzaq', 'arrazzaq', 'chapel hill st, durham'], iqama: false, sort: 8, jumuahId: 'Ar-Razzaq Islamic Center' },
      { name: 'As-Salaam Islamic Center', lat: 35.7781, lng: -78.6075, addr: '110 Lord Anson Dr, Raleigh, NC 27610', website: 'https://assalaamic.org', terms: ['as-salaam', 'assalaam', 'lord anson'], iqama: false, sort: 9, jumuahId: 'As-Salaam Islamic Center' },
      { name: 'Chapel Hill Islamic Society', lat: 35.9131, lng: -79.0469, addr: '103 Stateside Dr, Chapel Hill, NC 27514', website: 'https://chapelhillmasjid.org', terms: ['chapel hill islamic', 'stateside dr', 'chapel hill masjid'], iqama: false, sort: 10, jumuahId: 'Chapel Hill Islamic Society' },
      { name: 'Islamic Center of Cary', lat: 35.7731, lng: -78.8028, addr: '1155 W Chatham St, Cary, NC 27511', website: 'https://www.carymasjid.org', terms: ['islamic center of cary', 'chatham st', 'cary masjid'], iqama: false, sort: 11, jumuahId: 'Islamic Center of Cary' },
      { name: 'Masjid King Khalid', lat: 35.7693, lng: -78.6383, addr: '130 Martin Luther King Jr Blvd, Raleigh, NC 27601', website: 'https://www.masjidkingkhalid.org', terms: ['king khalid', 'martin luther king'], iqama: false, sort: 12 },
      { name: 'North Raleigh Masjid', lat: 35.8741, lng: -78.5640, addr: '5017 Deah Way, Raleigh, NC 27616', website: 'https://mycc-rdu.org', terms: ['north raleigh masjid', 'deah way', 'mycc', 'muslim youth community center'], iqama: false, sort: 13 },
      { name: 'San Ramon Valley Islamic Center', lat: 37.7770, lng: -121.9691, addr: '2230 Camino Ramon, San Ramon, CA 94583', website: 'https://srvic.org', terms: ['srvic', 'san ramon valley islamic', 'camino ramon'], iqama: true, sort: 14, iqamaId: 'SRVIC', jumuahId: 'San Ramon Valley Islamic Center (SRVIC)' },
      { name: 'Muslim Community Association', lat: 37.3769, lng: -121.9595, addr: '3003 Scott Blvd, Santa Clara, CA 95054', website: 'https://www.mcabayarea.org', terms: ['mca', 'muslim community association', 'scott blvd', 'mcabayarea'], iqama: true, sort: 15, campusGroup: 'mca', iqamaId: 'MCA', jumuahId: 'Muslim Community Association (MCA)' },
      { name: 'MCA Al-Noor', lat: 37.3530, lng: -121.9535, addr: '1755 Catherine St, Santa Clara, CA 95050', website: 'https://www.mcabayarea.org', terms: ['mca al-noor', 'mca alnoor', 'mca noor', 'catherine st'], iqama: true, sort: 16, campusGroup: 'mca', iqamaId: 'MCA Al-Noor' },
      { name: 'Muslim Community Center of the East Bay', lat: 37.6925, lng: -121.9040, addr: '5724 W Las Positas Blvd, Pleasanton, CA 94588', website: 'https://mcceastbay.org', terms: ['mcc', 'mcc east bay', 'muslim community center', 'las positas', 'pleasanton'], iqama: true, sort: 17, iqamaId: 'MCC' },
      { name: 'South Bay Islamic Association', lat: 37.3007, lng: -121.8574, addr: '325 N 3rd St, San Jose, CA 95112', website: 'https://sbia.info', terms: ['sbia', 'south bay islamic', 'south bay islamic association', 'n 3rd st', 'san jose'], iqama: true, sort: 18, iqamaId: 'SBIA', jumuahId: 'South Bay Islamic Association (SBIA)' },
      { name: 'Islamic Center of Fremont (ICF)', lat: 37.5241, lng: -121.9660, addr: '4039 Irvington Ave, Fremont, CA 94538', website: 'https://icfbayarea.com', terms: ['icf', 'islamic center of fremont', 'irvington ave', 'icfbayarea', 'fremont masjid'], iqama: true, sort: 19, campusGroup: 'icf', iqamaId: 'ICF', jumuahId: 'Islamic Center of Fremont (ICF)' },
      { name: 'Masjid Zakariya', lat: 37.5094, lng: -121.9628, addr: '42412 Albrae St, Fremont, CA 94538', website: 'https://icfbayarea.com', terms: ['zakariya', 'masjid zakariya', 'albrae st'], iqama: true, sort: 19, campusGroup: 'icf', iqamaSource: 'ICF', iqamaId: 'ICF' },
      { name: 'Berkeley Masjid', lat: 37.8672, lng: -122.2596, addr: '2519 Durant Ave, Berkeley, CA 94704', website: 'https://berkeleymasjid.org', terms: ['berkeley masjid', 'berkeley mosque', 'durant ave', 'berkeley islamic'], iqama: true, sort: 20, iqamaSource: 'Berkeley Masjid', iqamaId: 'Berkeley Masjid' },
      { name: 'Pillars Mosque', lat: 35.3086, lng: -80.7200, addr: '3116 Johnston Oehler Rd, Charlotte, NC 28269', website: 'https://pillarsmosque.org', terms: ['pillars', 'pillars mosque', 'johnston oehler', 'mcc charlotte', 'muslim community center charlotte'], iqama: true, sort: 20, iqamaId: 'Pillars Mosque' },
      { name: 'Islamic Society of Greater Charlotte', lat: 35.2025, lng: -80.7937, addr: '1700 Progress Ln, Charlotte, NC 28205', website: 'https://isgcharlotte.org', terms: ['isgc', 'islamic society of greater charlotte', 'progress ln', 'isg charlotte'], iqama: true, sort: 21, iqamaId: 'ISGC' },
      { name: 'Los Gatos Islamic Center (LGIC)', lat: 37.2358, lng: -121.9175, addr: '16769 Farley Rd, Los Gatos, CA 95032', website: 'https://wvmuslim.org', terms: ['lgic', 'los gatos islamic', 'los gatos masjid', 'wvmuslim', 'farley rd', 'west valley muslim'], iqama: true, sort: 22, campusGroup: 'lgic', iqamaId: 'LGIC' },
      { name: 'Saratoga Musalla', lat: 37.3137, lng: -122.0310, addr: '12370 Saratoga-Sunnyvale Rd, Saratoga, CA 95070', website: 'https://wvmuslim.org', terms: ['saratoga musalla', 'saratoga-sunnyvale rd', 'saratoga masjid'], iqama: true, sort: 22, campusGroup: 'lgic', iqamaSource: 'LGIC', iqamaId: 'LGIC' },
      { name: 'Al-Huda Foundation', lat: 39.9567, lng: -86.0131, addr: '12213 Lantern Rd, Fishers, IN 46038', website: 'https://alhudafoundation.org', terms: ['al-huda', 'alhuda', 'al huda foundation', 'lantern rd', 'fishers', 'aici'], iqama: true, sort: 23, iqamaSource: 'url|https://alhudafoundation.org/', iqamaId: 'Al-Huda' },
      { name: 'ADAMS Sterling', lat: 39.0057, lng: -77.4050, addr: '46903 Sugarland Rd, Sterling, VA 20164', website: 'https://adamscenter.org', terms: ['adams sterling', 'adams center sterling', 'sugarland rd', 'sterling masjid', 'adams center hq'], iqama: true, sort: 24, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Sterling' },
      { name: 'ADAMS Ashburn', lat: 39.0438, lng: -77.4874, addr: '21740 Beaumeade Circle Unit 120, Ashburn, VA 20147', website: 'https://adamscenter.org', terms: ['adams ashburn', 'adams center ashburn', 'beaumeade circle', 'ashburn masjid'], iqama: true, sort: 25, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Ashburn' },
      { name: 'ADAMS Fairfax', lat: 38.8697, lng: -77.3284, addr: '11216 Waples Mill Rd Unit 107, Fairfax, VA 22030', website: 'https://adamscenter.org', terms: ['adams fairfax', 'adams center fairfax', 'waples mill rd', 'fairfax masjid'], iqama: true, sort: 26, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Fairfax' },
      { name: 'ADAMS Gainesville', lat: 38.7004, lng: -77.5641, addr: '12655 Vint Hill Rd, Nokesville, VA 20181', website: 'https://adamscenter.org', terms: ['adams gainesville', 'adams center gainesville', 'vint hill rd', 'nokesville masjid'], iqama: true, sort: 27, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Gainesville' },
      { name: 'ADAMS Leesburg', lat: 39.1157, lng: -77.5636, addr: '19838 Sycolin Rd, Leesburg, VA 20175', website: 'https://adamscenter.org', terms: ['adams leesburg', 'adams center leesburg', 'sycolin rd', 'leesburg masjid'], iqama: true, sort: 28, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Leesburg' },
      { name: 'ADAMS Sully', lat: 38.8874, lng: -77.4282, addr: '4431 Brookfield Corporate Dr Suite F, Chantilly, VA 20151', website: 'https://adamscenter.org', terms: ['adams sully', 'adams center sully', 'brookfield corporate dr', 'chantilly masjid'], iqama: true, sort: 29, campusGroup: 'adams', iqamaSource: 'other|2026 Annual Schedule', jumuahId: 'ADAMS Sully' },
      { name: 'ISM', lat: 42.9589, lng: -87.9299, addr: '4707 South 13th Street, Milwaukee, WI 53221', website: 'https://www.ismonline.org', terms: ['ism', 'islamic society of milwaukee', 'ismonline', 'south 13th street milwaukee', 'milwaukee masjid'], iqama: true, sort: 50, campusGroup: 'ism', iqamaSource: 'athanplus', iqamaId: 'ISM', jumuahId: 'ISM' },
      { name: 'ISM University Center', lat: 43.0744, lng: -87.8819, addr: '2223 E Kenwood Blvd, Milwaukee, WI 53211', website: 'https://www.ismonline.org', terms: ['ism university', 'islamic society of milwaukee university', 'kenwood blvd milwaukee', 'ism uwm'], iqama: true, sort: 51, campusGroup: 'ism', iqamaSource: 'athanplus' },
      { name: 'ISM West (Masjid Al-Noor)', lat: 43.0663, lng: -88.1194, addr: '16670 Pheasant Dr, Brookfield, WI 53005', website: 'https://www.ismonline.org', terms: ['ism west', 'masjid al-noor brookfield', 'islamic society of milwaukee west', 'pheasant dr brookfield', 'brookfield masjid'], iqama: true, sort: 52, campusGroup: 'ism', iqamaSource: 'athanplus' },
      { name: 'Milwaukee Islamic Dawah Center', lat: 43.1103, lng: -87.9501, addr: '5135 N Teutonia Ave, Milwaukee, WI 53209', website: null, terms: ['milwaukee islamic dawah center', 'masjid ar rahman milwaukee', 'teutonia ave milwaukee', 'midc milwaukee'], iqama: false, sort: 53, campusGroup: undefined, iqamaSource: undefined },
      { name: "Al-Qur'an Mosque", lat: 43.1766, lng: -88.0582, addr: '11723 W Brown Deer Rd, Milwaukee, WI 53224', website: null, terms: ['al quran mosque milwaukee', 'brown deer rd masjid', 'milwaukee northwest masjid'], iqama: false, sort: 54, campusGroup: undefined, iqamaSource: undefined },
      { name: 'Al-Huda Mosque South Milwaukee', lat: 42.9134, lng: -87.8735, addr: '1800 16th Ave, South Milwaukee, WI 53172', website: null, terms: ['al huda mosque south milwaukee', 'al-huda south milwaukee', '16th ave south milwaukee masjid'], iqama: false, sort: 55, campusGroup: 'alhuda-mke', iqamaSource: undefined },
      { name: 'Al-Huda Mosque Greenfield', lat: 42.9525, lng: -87.9691, addr: '5075 S 43rd St, Greenfield, WI 53220', website: null, terms: ['al huda mosque greenfield', 'al-huda greenfield', '43rd st greenfield masjid', 'greenfield masjid'], iqama: false, sort: 56, campusGroup: 'alhuda-mke', iqamaSource: undefined },
      // Charlotte NC — 3rd iqama source
      { name: 'Islamic Center of Charlotte', lat: 35.2085, lng: -80.7691, addr: '1700 Progress Ln, Charlotte, NC 28205', website: 'https://iccharlotte.org', terms: ['icc charlotte', 'islamic center of charlotte', 'iccharlotte', 'progress ln charlotte'], iqama: true, sort: 57, iqamaSource: 'ICC Charlotte', iqamaId: 'ICC Charlotte' },
      // Indianapolis IN — 2nd & 3rd iqama sources
      { name: 'Masjid Al-Taqwa Indianapolis', lat: 39.6953, lng: -86.1459, addr: '4836 Mt Vernon Dr, Indianapolis, IN 46227', website: 'http://www.taqwacenter.com', terms: ['mcc indianapolis', 'masjid al taqwa indianapolis', 'taqwa center', 'mt vernon dr indianapolis'], iqama: true, sort: 58, iqamaSource: 'MCC Indianapolis', iqamaId: 'MCC Indianapolis' },
      // DFW TX
      { name: 'Valley Ranch Islamic Center', lat: 32.9173, lng: -96.9478, addr: '351 Ranchview Dr, Irving, TX 75063', website: 'https://vric.org', terms: ['vric', 'valley ranch islamic center', 'ranchview dr irving', 'valley ranch masjid'], iqama: true, sort: 59, iqamaSource: 'Valley Ranch Islamic Center', iqamaId: 'Valley Ranch Islamic Center', jumuahId: 'Valley Ranch Islamic Center' },
      { name: 'EPIC Masjid', lat: 33.0137, lng: -96.7062, addr: '4700 14th St, Plano, TX 75074', website: 'https://epicmasjid.org', terms: ['epic masjid', 'east plano islamic center', 'epic plano', '14th st plano', 'plano masjid'], iqama: true, sort: 59, iqamaSource: 'EPIC Masjid', iqamaId: 'EPIC Masjid' },
      { name: 'IANT', lat: 32.9483, lng: -96.7299, addr: '840 Abrams Rd, Richardson, TX 75081', website: 'https://iant.com', terms: ['iant', 'islamic association of north texas', 'abrams rd richardson', 'richardson masjid', 'richardson mosque'], iqama: true, sort: 59, iqamaSource: 'IANT', iqamaId: 'IANT' },
      { name: 'Islamic Center of Irving', lat: 32.8427, lng: -97.0107, addr: '2555 Esters Rd, Irving, TX 75062', website: 'https://www.irvingmasjid.org', terms: ['ici', 'islamic center of irving', 'irving masjid', 'esters rd irving', 'irving mosque'], iqama: true, sort: 60, iqamaSource: 'Islamic Center of Irving', iqamaId: 'Islamic Center of Irving' },
      // Chicago IL
      { name: 'MCC Chicago', lat: 41.9565, lng: -87.7237, addr: '4380 N Elston Ave, Chicago, IL 60641', website: 'https://mccchicago.org', terms: ['mcc chicago', 'muslim community center chicago', 'elston ave chicago'], iqama: true, sort: 60, iqamaSource: 'MCC' },
      { name: 'Mosque Foundation', lat: 41.7229, lng: -87.8030, addr: '7360 W 93rd St, Bridgeview, IL 60455', website: 'https://mosquefoundation.org', terms: ['mosque foundation', 'mosque foundation bridgeview', 'bridgeview mosque', 'w 93rd st bridgeview'], iqama: true, sort: 61, iqamaSource: 'Mosque Foundation', iqamaId: 'Mosque Foundation' },
      // Boston MA
      { name: 'ISB Roxbury', lat: 42.3309, lng: -71.0934, addr: '100 Malcolm X Blvd, Boston, MA 02120', website: 'https://isbcc.org', terms: ['isb roxbury', 'islamic society of boston roxbury', 'isbcc', 'malcolm x blvd boston'], iqama: true, sort: 62, campusGroup: 'isb', iqamaSource: 'ISB Roxbury', iqamaId: 'ISB Roxbury' },
      { name: 'ISB Cambridge', lat: 42.3703, lng: -71.1001, addr: '204 Prospect St, Cambridge, MA 02139', website: 'https://isbcc.org', terms: ['isb cambridge', 'islamic society of boston cambridge', 'prospect st cambridge masjid'], iqama: true, sort: 63, campusGroup: 'isb', iqamaSource: 'ISB Cambridge', iqamaId: 'ISB Cambridge' },
    ];
    for (const m of masjidUpserts) {
      await pool.query(
        `INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, sort_order, campus_group, iqama_source, iqama_id, jumuah_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (name) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, address=EXCLUDED.address, website=EXCLUDED.website, match_terms=EXCLUDED.match_terms, has_iqama=EXCLUDED.has_iqama, sort_order=EXCLUDED.sort_order, campus_group=EXCLUDED.campus_group, iqama_source=EXCLUDED.iqama_source, iqama_id=EXCLUDED.iqama_id, jumuah_id=EXCLUDED.jumuah_id, updated_at=NOW()`,
        [m.name, m.lat, m.lng, m.addr, m.website, m.terms, m.iqama, m.sort, m.campusGroup || null, m.iqamaSource || null, m.iqamaId || null, m.jumuahId || null]
      );
    }
    console.log("[DB] Upserted masjid data");
  }
}

async function ensureRestaurantOverridesTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurant_overrides (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER UNIQUE NOT NULL,
      override_periods JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureTickerTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticker_messages (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'urgent', 'event', 'reminder')),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticker_active ON ticker_messages(active);`);
}

async function ensurePushTokensTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      token VARCHAR(500) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
}

async function ensureJanazaAlertsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS janaza_alerts (
      id SERIAL PRIMARY KEY,
      masjid_name VARCHAR(255) NOT NULL,
      masjid_lat DOUBLE PRECISION NOT NULL,
      masjid_lng DOUBLE PRECISION NOT NULL,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS deceased_name VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(255)`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS relatives TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS prayer_time VARCHAR(255)`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS prayer_location VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS burial_info TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS org_name VARCHAR(255)`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published'`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE janaza_alerts ADD COLUMN IF NOT EXISTS sent BOOLEAN DEFAULT false`).catch(() => {});
}

async function ensureHalalRestaurantsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS halal_restaurants (
      id SERIAL PRIMARY KEY,
      external_id INTEGER,
      name VARCHAR(255) NOT NULL,
      formatted_address TEXT,
      formatted_phone VARCHAR(50),
      url TEXT,
      place_id VARCHAR(255),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      is_halal VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
      halal_comment TEXT,
      cuisine_types TEXT[],
      emoji VARCHAR(10),
      evidence TEXT[],
      considerations TEXT[],
      opening_hours JSONB,
      date_checked JSONB,
      rating DECIMAL(2,1),
      user_ratings_total INTEGER,
      website TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_halal_is_halal ON halal_restaurants(is_halal);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_halal_name ON halal_restaurants(name);`);

  const countResult = await pool.query("SELECT COUNT(*) as cnt FROM halal_restaurants");
  const count = parseInt(countResult.rows[0].cnt, 10);
  if (count === 0) {
    console.log("Halal restaurants table is empty, seeding from bundled data...");
    try {
      const seedData = halalSeedData as any[];
      for (const r of seedData) {
        await pool.query(
          `INSERT INTO halal_restaurants (external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours, rating, user_ratings_total, website)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            r.external_id, r.name, r.formatted_address, r.formatted_phone, r.url,
            r.lat, r.lng, r.is_halal, r.halal_comment,
            r.cuisine_types || null, r.emoji,
            r.evidence || null, r.considerations || null,
            r.opening_hours ? JSON.stringify(r.opening_hours) : null,
            r.rating || null, r.user_ratings_total || null, r.website || null,
          ]
        );
      }
      console.log(`Seeded ${seedData.length} halal restaurants`);
    } catch (err: any) {
      console.error("Failed to seed halal restaurants:", err.message);
    }
  }
}

const HALAL_SYNC_INTERVAL = 6 * 60 * 60 * 1000;
const HALAL_API_URL = "https://halaleatsnc.com/api/restaurants";

async function syncHalalRestaurants(pool: pg.Pool) {
  try {
    console.log("[Halal Sync] Checking for new restaurants from halaleatsnc.com...");
    const response = await fetch(HALAL_API_URL);
    if (!response.ok) {
      console.log(`[Halal Sync] API returned ${response.status}, skipping sync`);
      return;
    }
    const data = await response.json();
    const restaurants = Array.isArray(data) ? data : (data.restaurants || data.data || []);
    if (!Array.isArray(restaurants) || restaurants.length === 0) {
      console.log("[Halal Sync] No restaurants in API response, skipping");
      return;
    }

    const existingResult = await pool.query("SELECT external_id FROM halal_restaurants WHERE external_id IS NOT NULL");
    const existingIds = new Set(existingResult.rows.map((r: any) => r.external_id));

    let newCount = 0;
    for (const r of restaurants) {
      const externalId = r.id || r.external_id;
      if (externalId && existingIds.has(externalId)) continue;

      const name = r.name || r.restaurantName;
      if (!name) continue;

      const nameCheck = await pool.query("SELECT id FROM halal_restaurants WHERE LOWER(name) = LOWER($1)", [name]);
      if (nameCheck.rows.length > 0) continue;

      const syncInsert = await pool.query(
        `INSERT INTO halal_restaurants (external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          externalId || null,
          name,
          r.formattedAddress || r.formatted_address || null,
          r.formattedPhone || r.formatted_phone || null,
          r.url || null,
          r.lat || r.latitude || null,
          r.lng || r.longitude || null,
          r.isHalal || r.is_halal || "UNKNOWN",
          r.halalComment || r.halal_comment || null,
          r.cuisineTypes || r.cuisine_types || null,
          r.emoji || null,
          r.evidence || null,
          r.considerations || null,
          r.openingHours || r.opening_hours ? JSON.stringify(r.openingHours || r.opening_hours) : null,
        ]
      );
      if (syncInsert.rows[0]?.id) {
        enrichHalalRestaurantWithPlaces(syncInsert.rows[0].id).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      newCount++;
    }

    if (newCount > 0) {
      console.log(`[Halal Sync] Added ${newCount} new restaurants`);
    } else {
      console.log(`[Halal Sync] No new restaurants found (${restaurants.length} checked, ${existingIds.size} existing)`);
    }
  } catch (err: any) {
    console.log(`[Halal Sync] Sync skipped: ${err.message}`);
  }
}

function startHalalAutoSync(pool: pg.Pool) {
  setTimeout(() => {
    syncHalalRestaurants(pool).catch(err =>
      console.error("[Halal Sync] Error:", err.message)
    );
  }, 30000);

  setInterval(() => {
    syncHalalRestaurants(pool).catch(err =>
      console.error("[Halal Sync] Scheduled sync error:", err.message)
    );
  }, HALAL_SYNC_INTERVAL);
}

async function ensureBusinessesTable(pool: pg.Pool) {
  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS photo_reference TEXT`);
  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)`);
  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS instagram_url TEXT DEFAULT ''`);

  const migrationCheck = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'subcategory'`);
  if (migrationCheck.rows.length > 0) {
    const countCheck = await pool.query(`SELECT COUNT(*) as cnt FROM businesses`);
    if (parseInt(countCheck.rows[0].cnt) >= 100) {
      console.log("[DB] Businesses table already migrated to new schema");
      return;
    }
    console.log("[DB] Businesses table has new schema but only " + countCheck.rows[0].cnt + " rows, reimporting...");
    await pool.query(`DROP TABLE businesses CASCADE`);
  }

  let googleData: Record<number, any> = {};
  try {
    const tableExists = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'businesses'`);
    if (tableExists.rows.length > 0) {
      const { rows: oldRows } = await pool.query(
        `SELECT id, place_id, photo_reference, business_hours, google_url, rating, user_ratings_total FROM businesses WHERE place_id IS NOT NULL AND place_id != 'none'`
      );
      for (const r of oldRows) {
        googleData[r.id] = r;
      }
      console.log(`[DB] Preserved Google Places data for ${Object.keys(googleData).length} businesses`);
      await pool.query(`DROP TABLE businesses CASCADE`);
      console.log("[DB] Dropped old businesses table");
    }
  } catch (err: any) {
    console.log("[DB] No old businesses table to migrate:", err.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      subcategory VARCHAR(255) DEFAULT '',
      description TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      featured BOOLEAN DEFAULT false,
      location_type VARCHAR(50) DEFAULT 'physical',
      address VARCHAR(500) DEFAULT '',
      service_area_description TEXT DEFAULT '',
      phone VARCHAR(50) DEFAULT '',
      website VARCHAR(500) DEFAULT '',
      instagram_url TEXT DEFAULT '',
      booking_url TEXT DEFAULT '',
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      filter_tags TEXT[] DEFAULT '{}',
      search_aliases TEXT[] DEFAULT '{}',
      affiliation TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      google_url TEXT DEFAULT '',
      place_id VARCHAR(255),
      photo_reference TEXT,
      business_hours JSONB,
      rating DECIMAL(3,1),
      user_ratings_total INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_businesses_featured ON businesses(featured) WHERE featured = true;`);
  console.log("[DB] Created new businesses table with updated schema");

  try {
    const csvPath = path.join(process.cwd(), "attached_assets", "businesses_clean_1774627343631.csv");
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, "utf-8");

      const csvRecords: string[][] = [];
      let currentField = "";
      let currentRecord: string[] = [];
      let inQuotes = false;
      for (let ci = 0; ci < csvContent.length; ci++) {
        const ch = csvContent[ci];
        if (ch === '"') {
          if (inQuotes && ci + 1 < csvContent.length && csvContent[ci + 1] === '"') {
            currentField += '"';
            ci++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          currentRecord.push(currentField);
          currentField = "";
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
          if (ch === '\r' && ci + 1 < csvContent.length && csvContent[ci + 1] === '\n') ci++;
          currentRecord.push(currentField);
          currentField = "";
          if (currentRecord.some(f => f.trim())) csvRecords.push(currentRecord);
          currentRecord = [];
        } else {
          currentField += ch;
        }
      }
      if (currentRecord.length > 0 || currentField) {
        currentRecord.push(currentField);
        if (currentRecord.some(f => f.trim())) csvRecords.push(currentRecord);
      }

      const headers = csvRecords[0].map(h => h.trim());
      let importCount = 0;

      for (let i = 1; i < csvRecords.length; i++) {
        const fields = csvRecords[i];
        if (fields.length < 5) continue;

        try {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = (fields[idx] || "").trim(); });

        if (!row.name || !row.category) continue;

        let filterTags: string[] = [];
        let searchAliases: string[] = [];
        try {
          if (row.filter_tags) {
            const cleaned = row.filter_tags.replace(/\u201c|\u201d/g, '"');
            filterTags = JSON.parse(cleaned);
          }
        } catch { try { if (row.filter_tags) filterTags = JSON.parse(row.filter_tags.replace(/'/g, '"')); } catch {} }
        try {
          if (row.search_aliases) {
            const cleaned = row.search_aliases.replace(/\u201c|\u201d/g, '"');
            searchAliases = JSON.parse(cleaned);
          }
        } catch { try { if (row.search_aliases) searchAliases = JSON.parse(row.search_aliases.replace(/'/g, '"')); } catch {} }

        const csvId = parseInt(row.id);
        const gd = googleData[csvId];

        const businessHoursValue = gd?.business_hours ? (typeof gd.business_hours === 'string' ? gd.business_hours : JSON.stringify(gd.business_hours)) : null;

        await pool.query(
          `INSERT INTO businesses (id, name, category, subcategory, description, status, featured, location_type, address, service_area_description, phone, website, instagram_url, booking_url, lat, lng, filter_tags, search_aliases, affiliation, photo_url, rating, user_ratings_total, place_id, photo_reference, business_hours, google_url, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb, $26, $27)
           ON CONFLICT (id) DO NOTHING`,
          [
            csvId,
            row.name,
            row.category,
            row.subcategory || "",
            row.description || "",
            row.status || "approved",
            row.featured === "True",
            row.location_type || "physical",
            row.address || "",
            row.service_area_description || "",
            row.phone || "",
            row.website || "",
            row.instagram_url || "",
            row.booking_url || "",
            row.lat ? parseFloat(row.lat) : null,
            row.lng ? parseFloat(row.lng) : null,
            filterTags,
            searchAliases,
            row.affiliation || "",
            row.photo_url || "",
            gd?.rating ?? (row.rating && !isNaN(parseFloat(row.rating)) ? parseFloat(row.rating) : null),
            gd?.user_ratings_total ?? (row.user_ratings_total && !isNaN(parseInt(row.user_ratings_total)) ? parseInt(row.user_ratings_total) : null),
            gd?.place_id ?? null,
            gd?.photo_reference ?? null,
            businessHoursValue,
            gd?.google_url ?? "",
            row.created_at ? new Date(row.created_at) : new Date(),
          ]
        );
        importCount++;
        } catch (rowErr: any) {
          const row2: Record<string, string> = {};
          headers.forEach((h, idx) => { row2[h] = (fields[idx] || "").trim(); });
          console.error(`[DB] Error importing CSV row ${i} (${row2.name}): ${rowErr.message}`);
        }
      }

      const maxId = await pool.query("SELECT MAX(id) as max_id FROM businesses");
      const nextId = (maxId.rows[0].max_id || 0) + 1;
      await pool.query(`SELECT setval('businesses_id_seq', $1, false)`, [nextId]);

      console.log(`[DB] Imported ${importCount} businesses from CSV`);
    } else {
      console.log("[DB] CSV file not found, starting with empty businesses table");
    }
  } catch (err: any) {
    console.error("[DB] Error importing CSV:", err.message);
  }
}

async function ensureUserAccountsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_accounts (
      id SERIAL PRIMARY KEY,
      apple_id VARCHAR(255) UNIQUE,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_accounts_apple ON user_accounts(apple_id);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);`);
}

async function ensureOrgPortalsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_portals (
      id SERIAL PRIMARY KEY,
      org_name VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Role-based columns
  await pool.query(`ALTER TABLE org_portals ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'community_org'`).catch(() => {});
  await pool.query(`ALTER TABLE org_portals ADD COLUMN IF NOT EXISTS metro VARCHAR(255)`).catch(() => {});
  await pool.query(`ALTER TABLE org_portals ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_profiles (
      id SERIAL PRIMARY KEY,
      org_name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      website VARCHAR(500),
      address TEXT,
      logo_url TEXT,
      donation_url VARCHAR(500),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS donation_url VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS logo_data TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(100)`).catch(() => {});

  // Rename org_names to use underscores (login handles)
  await pool.query(`UPDATE org_portals SET org_name = 'The_Light_House_Project', display_name = 'The Light House Project' WHERE org_name = 'The Light House Project'`).catch(() => {});
  await pool.query(`UPDATE org_portals SET org_name = 'Islamic_Association_of_Raleigh', display_name = 'Islamic Association of Raleigh' WHERE org_name = 'Islamic Association of Raleigh'`).catch(() => {});

  const lhpKey = process.env.LIGHTHOUSE_ADMIN_KEY;
  if (lhpKey) {
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(lhpKey).digest("hex");
    await pool.query(
      `INSERT INTO org_portals (org_name, password_hash, role, display_name)
       VALUES ($1, $2, 'community_org', 'The Light House Project')
       ON CONFLICT (org_name) DO UPDATE SET password_hash = $2, role = 'community_org', display_name = 'The Light House Project'`,
      ["The_Light_House_Project", hash]
    );
  }

  const iarKey = process.env.IAR_ADMIN_KEY;
  if (iarKey) {
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(iarKey).digest("hex");
    await pool.query(
      `INSERT INTO org_portals (org_name, password_hash, role, display_name)
       VALUES ($1, $2, 'masjid', 'Islamic Association of Raleigh')
       ON CONFLICT (org_name) DO UPDATE SET password_hash = $2, role = 'masjid', display_name = 'Islamic Association of Raleigh'`,
      ["Islamic_Association_of_Raleigh", hash]
    );
  }

  // Migrate existing records that don't have a role set
  await pool.query(`UPDATE org_portals SET role = 'community_org', display_name = org_name WHERE role = 'community_org' AND display_name IS NULL`).catch(() => {});
  await pool.query(`UPDATE org_portals SET role = 'masjid' WHERE org_name = 'Islamic_Association_of_Raleigh' AND role = 'community_org'`).catch(() => {});
}

async function ensureOrganizerFollowsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizer_follows (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      organizer_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, organizer_name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_organizer_follows_user ON organizer_follows(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_organizer_follows_org ON organizer_follows(organizer_name);`);
  await pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS user_id INTEGER`);
}

async function ensureSavedEventsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      event_id VARCHAR(255) NOT NULL,
      saved_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, event_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_saved_events_user ON saved_events(user_id);`);
}

async function ensureUserRatingsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_ratings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id),
      entity_type VARCHAR(30) NOT NULL,
      entity_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, entity_type, entity_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_ratings_entity ON user_ratings(entity_type, entity_id);`);
}

async function ensureRestaurantSubmissionsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurant_submissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id),
      google_maps_url TEXT NOT NULL,
      name VARCHAR(255),
      address TEXT,
      place_id VARCHAR(255),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_restaurant_submissions_status ON restaurant_submissions(status);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS halal_verification_votes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id),
      submission_id INTEGER NOT NULL REFERENCES restaurant_submissions(id) ON DELETE CASCADE,
      halal_status VARCHAR(20) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, submission_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_halal_votes_submission ON halal_verification_votes(submission_id);`);
}

async function ensureHalalCheckinsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS halal_checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user_accounts(id),
      restaurant_id INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_halal_checkins_restaurant ON halal_checkins(restaurant_id, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS android_waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Main Google Calendar disconnected - events now managed via admin portal
  // startAutoRefresh();

  const pool = getDbPool();
  await ensureAnalyticsTable(pool).catch(err => console.error("[DB] Analytics table init error:", err.message));
  await ensureMasjidsTable(pool).catch(err => console.error("[DB] Masjids table init error:", err.message));
  await ensureJumuahTable(pool).catch(err => console.error("[DB] Jumuah table init error:", err.message));
  await ensureEventOverridesTable(pool).catch(err => console.error("[DB] Event overrides table init error:", err.message));
  await ensureRestaurantOverridesTable(pool).catch(err => console.error("[DB] Restaurant overrides table init error:", err.message));
  await ensureTickerTable(pool).catch(err => console.error("[DB] Ticker table init error:", err.message));
  await ensurePushTokensTable(pool).catch(err => console.error("[DB] Push tokens table init error:", err.message));
  await ensureHalalRestaurantsTable(pool).catch(err => console.error("[DB] Halal restaurants table init error:", err.message));
  await ensureBusinessesTable(pool).catch(err => console.error("[DB] Init error:", err.message));
  await ensureIqamaTable(pool).catch(err => console.error("[DB] Iqama table init error:", err.message));
  await seedJIARData(pool).catch(err => console.error("[DB] JIAR seed error:", err.message));
  await seedMCCData(pool).catch(err => console.error("[DB] MCC seed error:", err.message));
  await seedAdamsCenterIqama(pool).catch(err => console.error("[DB] Adams Center iqama seed error:", err.message));
  await ensureJanazaAlertsTable(pool).catch(err => console.error("[DB] Janaza alerts table init error:", err.message));
  await ensureUserAccountsTable(pool).catch(err => console.error("[DB] User accounts table init error:", err.message));
  await ensureUserRatingsTable(pool).catch(err => console.error("[DB] User ratings table init error:", err.message));
  await ensureSavedEventsTable(pool).catch(err => console.error("[DB] Saved events table init error:", err.message));
  await ensureOrgPortalsTable(pool).catch(err => console.error("[DB] Org portals table init error:", err.message));
  await ensureOrganizerFollowsTable(pool).catch(err => console.error("[DB] Organizer follows table init error:", err.message));
  await ensureHalalCheckinsTable(pool).catch(err => console.error("[DB] Halal checkins table init error:", err.message));
  await ensureRestaurantSubmissionsTable(pool).catch(err => console.error("[DB] Restaurant submissions table init error:", err.message));
  await ensureCommunityEventsTable(pool).catch(err => console.error("[DB] Community events table init error:", err.message));

  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT false").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS additional_images JSONB DEFAULT '[]'").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS submitter_name TEXT").catch(() => {});
  await pool.query("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS submitter_email TEXT").catch(() => {});
  await pool.query("ALTER TABLE event_overrides ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN").catch(() => {});
  await pool.query("ALTER TABLE event_overrides ADD COLUMN IF NOT EXISTS is_featured BOOLEAN").catch(() => {});
  await pool.query("ALTER TABLE saved_events ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false").catch(() => {});

  await pool.query("UPDATE community_events SET organizer = 'Islamic Association of Raleigh' WHERE organizer LIKE 'Islamic Association of Raleigh%' AND organizer != 'Islamic Association of Raleigh'").catch(() => {});
  await pool.query("UPDATE community_events SET organizer = 'Al-Noor Islamic Center' WHERE organizer ILIKE '%alnoor islamic center%' AND organizer != 'Al-Noor Islamic Center'").catch(() => {});

  const fishersBusinessUpserts = [
    { name: 'Affordable Tax', category: 'Services', subcategory: 'Tax Preparation', description: 'Affordable individual and business tax preparation services. Thorough study of your personal situation to maximize your refund.', phone: '317-987-6902', website: 'https://www.affordable-tax.org/', filter_tags: ['tax-preparation', 'accounting', 'tax-filing', 'business-taxes', 'individual-taxes'], search_aliases: ['affordable tax', 'tax prep indianapolis', 'sawsan tax'] },
    { name: 'Amiri Construction', category: 'Services', subcategory: 'Construction & Remodeling', description: 'Full-service construction company specializing in residential and commercial building, renovation, and remodeling projects.', phone: '', website: 'https://amiriconstruction.com/', filter_tags: ['construction', 'remodeling', 'renovation', 'contractor', 'home-improvement', 'commercial-construction'], search_aliases: ['amiri construction', 'amiri builder', 'construction fishers'] },
    { name: 'AMR Tax & Accounting', category: 'Services', subcategory: 'Tax & Accounting', description: 'Professional tax preparation, bookkeeping, payroll, and business consulting services in Fishers, IN. Expert financial solutions for individuals and businesses.', phone: '', website: 'https://www.amrtax.net/', filter_tags: ['tax-preparation', 'accounting', 'bookkeeping', 'payroll', 'business-consulting', 'cpa'], search_aliases: ['amr tax', 'amr accounting', 'tax fishers', 'bookkeeping fishers', 'payroll services'] },
    { name: 'Fort Harrison Dental - Malek Fansa DDS', category: 'Healthcare', subcategory: 'Dentist', description: 'Complete family and cosmetic dentistry including dental implants, crowns, bridges, veneers, teeth whitening, and preventive care.', phone: '317-545-6545', website: 'https://ftharrisondental.com/', filter_tags: ['dentist', 'dental', 'cosmetic-dentistry', 'dental-implants', 'family-dentist', 'teeth-whitening', 'dental-crowns'], search_aliases: ['fort harrison dental', 'ft harrison dental', 'malek fansa', 'fansa dds', 'dentist indianapolis', 'dentist lawrence'] },
    { name: 'Geist Learning Adventures', category: 'Services', subcategory: 'Childcare & Education', description: 'Early childhood education and learning center in Fishers. Programs designed to help children discover, learn, and grow.', phone: '', website: 'https://geistla.com/', filter_tags: ['childcare', 'education', 'preschool', 'daycare', 'early-learning', 'kids-programs'], search_aliases: ['geist learning', 'geistla', 'geist learning adventures', 'preschool fishers', 'daycare fishers', 'childcare fishers'] },
  ];
  for (const b of fishersBusinessUpserts) {
    const exists = await pool.query("SELECT id FROM businesses WHERE LOWER(name) = LOWER($1)", [b.name]).catch(() => ({ rows: [] }));
    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO businesses (name, category, subcategory, description, phone, website, filter_tags, search_aliases, location_type, service_area_description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'service_area', 'Indianapolis IN', 'approved')`,
        [b.name, b.category, b.subcategory, b.description, b.phone, b.website, b.filter_tags, b.search_aliases]
      ).catch((err: any) => console.error(`[DB] Error upserting business ${b.name}:`, err.message));
    }
  }
  console.log("[DB] Upserted Fishers-area businesses");

  await pool.query(`UPDATE businesses SET service_area_description = 'Triangle NC', lat = 35.7796, lng = -78.6382 WHERE location_type IN ('service_area', 'popup') AND service_area_description = 'Serves the Triangle area'`).catch(() => {});
  await pool.query(`UPDATE businesses SET service_area_description = 'Indianapolis IN', lat = 39.7684, lng = -86.1581 WHERE location_type IN ('service_area', 'popup') AND service_area_description = 'Fishers, IN Metro Area'`).catch(() => {});
  await pool.query(`UPDATE businesses SET location_type = 'virtual', service_area_description = NULL WHERE service_area_description ILIKE '%Ayden%' AND location_type = 'service_area'`).catch(() => {});
  await pool.query(`UPDATE businesses SET service_area_description = 'Triangle NC', lat = 35.7796, lng = -78.6382 WHERE location_type = 'popup' AND service_area_description ILIKE '%pop-up%'`).catch(() => {});
  console.log("[DB] Migrated service-area/popup businesses to metro format");

  const fishersRestaurantUpserts = [
    { name: 'Kanoon Smoked Meat & Steakhouse', address: '8594 East 116th Street #30, Fishers, IN 46038', lat: 39.9557, lng: -86.0055, cuisine: ['Middle Eastern', 'Persian', 'Steakhouse', 'BBQ', 'Mediterranean'], emoji: '🥩', website: 'https://kanoon-indiana.com/', comment: '100% Zabiha halal. Smoked meats, steaks, kebabs, and Mediterranean dishes.' },
    { name: 'MOTW Coffee & Pastries - Indianapolis', address: '4873 W 38th St, Indianapolis, IN 46254', lat: 39.8241, lng: -86.2069, cuisine: ['Coffee', 'Cafe', 'Pastries', 'Middle Eastern'], emoji: '☕', website: 'https://motw.coffee/', comment: 'Muslim-owned coffee and pastry shop. Middle Eastern pastries and specialty coffee.' },
    { name: 'MOTW Coffee & Pastries - Carmel', address: '12761 Old Meridian St, Carmel, IN 46032', lat: 39.9740, lng: -86.1284, cuisine: ['Coffee', 'Cafe', 'Pastries', 'Middle Eastern'], emoji: '☕', website: 'https://motw.coffee/', comment: 'Muslim-owned coffee and pastry shop. Middle Eastern pastries and specialty coffee.' },
    { name: 'MOTW Coffee & Pastries - Fishers', address: '8235 E 116th St STE 215, Fishers, IN 46038', lat: 39.9557, lng: -86.0128, cuisine: ['Coffee', 'Cafe', 'Pastries', 'Middle Eastern'], emoji: '☕', website: 'https://motw.coffee/', comment: 'Muslim-owned coffee and pastry shop. Middle Eastern pastries and specialty coffee.' },
    { name: 'MOTW Coffee & Pastries - Avon', address: '9263 E US Hwy 36, Avon, IN 46123', lat: 39.7624, lng: -86.3506, cuisine: ['Coffee', 'Cafe', 'Pastries', 'Middle Eastern'], emoji: '☕', website: 'https://motw.coffee/', comment: 'Muslim-owned coffee and pastry shop. Middle Eastern pastries and specialty coffee.' },
  ];
  for (const r of fishersRestaurantUpserts) {
    const existing = await pool.query("SELECT id FROM halal_restaurants WHERE LOWER(name) = LOWER($1)", [r.name]).catch(() => ({ rows: [] }));
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO halal_restaurants (name, formatted_address, lat, lng, is_halal, halal_comment, cuisine_types, emoji, website, url)
         VALUES ($1, $2, $3, $4, 'IS_HALAL', $5, $6, $7, $8, $9)`,
        [r.name, r.address, r.lat, r.lng, r.comment, r.cuisine, r.emoji, r.website, r.website]
      ).catch((err: any) => console.error(`[DB] Error upserting restaurant ${r.name}:`, err.message));
    }
  }
  console.log("[DB] Upserted Fishers-area restaurants");

  // Seed Qahwah Cafe as a DMV business
  const qahwahHours = JSON.stringify({
    monday: "10:00 AM - 6:00 PM", tuesday: "10:00 AM - 6:00 PM", wednesday: "10:00 AM - 6:00 PM",
    thursday: "10:00 AM - 6:00 PM", friday: "10:00 AM - 6:00 PM", saturday: "Closed", sunday: "Closed",
  });
  const qahwahExists = await pool.query("SELECT id FROM businesses WHERE LOWER(name) = 'qahwah cafe'").catch(() => ({ rows: [] }));
  if (qahwahExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO businesses (name, category, subcategory, description, address, phone, website, instagram_url, filter_tags, search_aliases, location_type, lat, lng, status, business_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'physical', $11, $12, 'approved', $13)`,
      [
        "Qahwah Cafe",
        "Cafe",
        "Coffee & Pastries",
        "Muslim-owned specialty coffee shop and cafe located inside ADAMS Center Sterling. Serving artisan coffee, Middle Eastern pastries, and light bites.",
        "46903 Sugarland Rd, Sterling, VA 20164",
        "",
        "https://www.qahwacafe.com",
        "https://www.instagram.com/qahwacafe",
        ["cafe", "coffee", "halal", "pastries", "middle-eastern", "muslim-owned"],
        ["qahwah cafe", "qahwah coffee", "qahwa cafe", "sterling cafe", "adams center cafe"],
        39.0057,
        -77.4050,
        qahwahHours,
      ]
    ).catch((err: any) => console.error("[DB] Error seeding Qahwah Cafe:", err.message));
    console.log("[DB] Seeded Qahwah Cafe business");
  } else {
    // Ensure correct category and hours on existing row
    await pool.query(
      `UPDATE businesses SET category='Cafe', subcategory='Coffee & Pastries', business_hours=$1, status='approved' WHERE LOWER(name)='qahwah cafe'`,
      [qahwahHours]
    ).catch(() => {});
  }

  startHalalAutoSync(pool);
  startIqamaSync(pool);
  scheduleAdamsJumuahScraper(pool);

  async function applyEventOverrides(events: CachedEvent[]): Promise<CachedEvent[]> {
    try {
      const { rows: overrides } = await pool.query("SELECT * FROM event_overrides");
      if (overrides.length === 0) return events;
      const overrideMap = new Map(overrides.map((o: any) => [o.event_id, o]));
      return events.map(e => {
        const o = overrideMap.get(e.id);
        if (!o) return e;
        return {
          ...e,
          title: o.title || e.title,
          description: o.description !== null && o.description !== undefined ? o.description : e.description,
          location: o.location !== null && o.location !== undefined ? o.location : e.location,
          start: o.start_time || e.start,
          end: o.end_time || e.end,
          organizer: o.organizer !== null && o.organizer !== undefined ? o.organizer : e.organizer,
          imageUrl: o.image_url !== null && o.image_url !== undefined ? o.image_url : e.imageUrl,
          registrationUrl: o.registration_url !== null && o.registration_url !== undefined ? o.registration_url : e.registrationUrl,
          isVirtual: o.is_virtual !== null && o.is_virtual !== undefined ? o.is_virtual : e.isVirtual,
          isFeatured: o.is_featured !== null && o.is_featured !== undefined ? o.is_featured : e.isFeatured,
        };
      });
    } catch (err: any) {
      console.error("[Events] Error applying overrides:", err.message);
      return events;
    }
  }

  async function getCommunityEvents(req: any): Promise<CachedEvent[]> {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM community_events WHERE status = 'approved' AND (end_time IS NULL OR end_time > NOW()) ORDER BY start_time ASC"
      );
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["host"] || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;
      return rows.map((r: any) => {
        const rawOrganizer = r.organizer || "";
        const resolvedOrgName = resolveOrgName(rawOrganizer);
        const organizer = resolvedOrgName || rawOrganizer;
        const rawLocation = r.location || "";
        const storedCoords = (r.lat && r.lng) ? { latitude: r.lat, longitude: r.lng } : null;
        const coords = storedCoords || resolveCoordinates(organizer, rawLocation);
        const location = resolveLocation(rawLocation) || resolveLocationFromOrganizer(organizer) || rawLocation;
        return {
          id: `community_${r.id}`,
          title: r.title,
          description: r.description || "",
          location,
          start: r.start_time ? new Date(r.start_time).toISOString() : "",
          end: r.end_time ? new Date(r.end_time).toISOString() : "",
          isAllDay: false,
          organizer,
          imageUrl: r.image_data ? `${baseUrl}/api/events/image/${r.id}` : "",
          additionalImageUrls: (Array.isArray(r.additional_images) ? r.additional_images : []).map((_: any, i: number) => `${baseUrl}/api/events/image/${r.id}/${i}`),
          registrationUrl: r.registration_url || "",
          speaker: "",
          latitude: coords.latitude,
          longitude: coords.longitude,
          isVirtual: !!r.is_virtual,
          isFeatured: !!r.is_featured,
        };
      });
    } catch (err: any) {
      console.error("[Events] Error fetching community events:", err.message);
      return [];
    }
  }

  app.get("/api/community-events/single/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query("SELECT * FROM community_events WHERE id = $1 AND status = 'approved'", [id]);
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      const r = rows[0];
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["host"] || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;
      const rawOrganizer = r.organizer || "";
      const resolvedOrgName = resolveOrgName(rawOrganizer);
      const organizer = resolvedOrgName || rawOrganizer;
      const rawLocation = r.location || "";
      const storedCoords = (r.lat && r.lng) ? { latitude: r.lat, longitude: r.lng } : null;
      const coords = storedCoords || resolveCoordinates(organizer, rawLocation);
      const location = resolveLocation(rawLocation) || resolveLocationFromOrganizer(organizer) || rawLocation;
      return res.json({
        id: `community_${r.id}`,
        title: r.title,
        description: r.description || "",
        location,
        start: r.start_time ? new Date(r.start_time).toISOString() : "",
        end: r.end_time ? new Date(r.end_time).toISOString() : "",
        isAllDay: false,
        organizer,
        imageUrl: r.image_data ? `${baseUrl}/api/events/image/${r.id}` : "",
        registrationUrl: r.registration_url || "",
        speaker: "",
        latitude: coords.latitude,
        longitude: coords.longitude,
        isVirtual: !!r.is_virtual,
        isFeatured: !!r.is_featured,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.get("/api/events/image/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query("SELECT image_data, image_mime FROM community_events WHERE id = $1", [id]);
      if (!rows.length || !rows[0].image_data) {
        return res.status(404).json({ error: "Image not found" });
      }
      const mime = rows[0].image_mime || "image/jpeg";
      const buffer = Buffer.from(rows[0].image_data, "base64");
      res.set("Content-Type", mime);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error: any) {
      console.error("Error serving community event image:", error.message);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  app.get("/api/events/image/:id/:index", async (req, res) => {
    try {
      const { id, index } = req.params;
      const idx = parseInt(index);
      const { rows } = await pool.query("SELECT additional_images FROM community_events WHERE id = $1", [id]);
      if (!rows.length) return res.status(404).json({ error: "Event not found" });
      const images = rows[0].additional_images || [];
      if (idx < 0 || idx >= images.length || !images[idx]?.data) {
        return res.status(404).json({ error: "Image not found" });
      }
      const mime = images[idx].mime || "image/jpeg";
      const buffer = Buffer.from(images[idx].data, "base64");
      res.set("Content-Type", mime);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error: any) {
      console.error("Error serving additional event image:", error.message);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  const MCC_EASTBAY_ICAL_URL = "https://mcceastbay.org/?post_type=tribe_events&ical=1&eventDisplay=list";
  let cachedMCCEastBayEvents: CachedEvent[] = [];
  let mccEastBayLastFetch = 0;
  const MCC_EASTBAY_CACHE_TTL = 15 * 60 * 1000;

  function parseICalDate(dtStr: string, tzid?: string): string {
    const clean = dtStr.replace(/\r/g, "").trim();
    if (clean.includes("T")) {
      const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
      const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15);
      if (clean.endsWith("Z")) {
        return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
      }
      const tz = tzid || "America/Los_Angeles";
      const local = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
      const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
      const parts = formatter.formatToParts(local);
      const offsetPart = parts.find(p => p.type === "timeZoneName");
      let offset = "-07:00";
      if (offsetPart) {
        const m = offsetPart.value.match(/GMT([+-]\d+(?::\d+)?)/);
        if (m) {
          const raw = m[1];
          offset = raw.includes(":") ? raw : (raw.length <= 3 ? raw + ":00" : raw.slice(0, 3) + ":" + raw.slice(3));
          if (offset.length === 5) offset = offset[0] + "0" + offset.slice(1);
        }
      }
      return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
    }
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
    return `${y}-${mo}-${d}`;
  }

  function parseICalFeed(icalText: string, opts: { idPrefix: string; defaultOrganizer: string; defaultLocation: string; useEventLocation?: boolean }): CachedEvent[] {
    const events: CachedEvent[] = [];
    const blocks = icalText.split("BEGIN:VEVENT");
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split("END:VEVENT")[0];
      const lines: string[] = [];
      for (const rawLine of block.split("\n")) {
        if (rawLine.startsWith(" ") || rawLine.startsWith("\t")) {
          if (lines.length > 0) lines[lines.length - 1] += rawLine.slice(1);
        } else {
          lines.push(rawLine);
        }
      }

      const getField = (key: string): string => {
        const line = lines.find(l => l.startsWith(key + ":") || l.startsWith(key + ";"));
        if (!line) return "";
        const colonIdx = line.indexOf(":");
        return colonIdx >= 0 ? line.slice(colonIdx + 1).replace(/\r/g, "").trim() : "";
      };

      const getTzField = (key: string): { value: string; tzid?: string } => {
        const line = lines.find(l => l.startsWith(key + ":") || l.startsWith(key + ";"));
        if (!line) return { value: "" };
        const tzMatch = line.match(/TZID=([^:;]+)/);
        const colonIdx = line.indexOf(":");
        const value = colonIdx >= 0 ? line.slice(colonIdx + 1).replace(/\r/g, "").trim() : "";
        return { value, tzid: tzMatch?.[1] };
      };

      const uid = getField("UID");
      const summary = getField("SUMMARY");
      const description = getField("DESCRIPTION")
        .replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
      const location = getField("LOCATION")
        .replace(/\\,/g, ",").replace(/\\\\/g, "\\");
      const url = getField("URL");
      const imageUrl = getField("ATTACH");
      const organizer = opts.defaultOrganizer;

      const dtStart = getTzField("DTSTART");
      const dtEnd = getTzField("DTEND");
      const start = parseICalDate(dtStart.value, dtStart.tzid);
      const end = dtEnd.value ? parseICalDate(dtEnd.value, dtEnd.tzid) : start;
      const isAllDay = !dtStart.value.includes("T");

      const startDate = new Date(start);
      if (startDate < now || startDate > threeMonthsLater) continue;

      let resolvedLocation = opts.defaultLocation;
      if (opts.useEventLocation && location) {
        const locLower = location.toLowerCase();
        if (locLower.includes("zakariya")) {
          resolvedLocation = "Masjid Zakariya, 42412 Albrae St, Fremont, CA 94538";
        } else if (locLower.includes("icf") || locLower.includes("irvington") || locLower.includes("islamic center of fremont")) {
          resolvedLocation = opts.defaultLocation;
        } else {
          resolvedLocation = location;
        }
      }
      const coords = resolveCoordinates(organizer, resolvedLocation);
      const registrationUrl = url || "";

      events.push({
        id: `${opts.idPrefix}_${uid || Date.now().toString() + Math.random().toString(36).slice(2)}`,
        title: summary || "Untitled Event",
        description: description.slice(0, 500),
        location: resolvedLocation,
        start,
        end,
        isAllDay,
        organizer,
        imageUrl: imageUrl || "",
        registrationUrl,
        speaker: extractSpeaker(description),
        latitude: coords.latitude,
        longitude: coords.longitude,
        isVirtual: false,
        isFeatured: false,
      });
    }

    return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  async function fetchMCCEastBayEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedMCCEastBayEvents.length > 0 && (now - mccEastBayLastFetch) < MCC_EASTBAY_CACHE_TTL) {
      return cachedMCCEastBayEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const response = await fetch(MCC_EASTBAY_ICAL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const icalText = await response.text();
      const events = parseICalFeed(icalText, {
        idPrefix: "mcc_eastbay",
        defaultOrganizer: "Muslim Community Center of the East Bay",
        defaultLocation: "5724 W Las Positas Blvd, Pleasanton, CA 94588",
      });
      cachedMCCEastBayEvents = events;
      mccEastBayLastFetch = Date.now();
      console.log(`[MCC East Bay] Fetched ${events.length} events from iCal feed`);
      return events;
    } catch (err: any) {
      console.error("[MCC East Bay] iCal fetch error:", err.message);
      return cachedMCCEastBayEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  const SRVIC_ICAL_URL = "https://srvic.org/?post_type=tribe_events&ical=1&eventDisplay=list";
  let cachedSRVICEvents: CachedEvent[] = [];
  let srvicLastFetch = 0;
  const SRVIC_CACHE_TTL = 15 * 60 * 1000;

  async function fetchSRVICEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedSRVICEvents.length > 0 && (now - srvicLastFetch) < SRVIC_CACHE_TTL) {
      return cachedSRVICEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const response = await fetch(SRVIC_ICAL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const icalText = await response.text();
      const events = parseICalFeed(icalText, {
        idPrefix: "srvic",
        defaultOrganizer: "San Ramon Valley Islamic Center",
        defaultLocation: "2232 San Ramon Valley Blvd, San Ramon, CA 94583",
      });
      cachedSRVICEvents = events;
      srvicLastFetch = Date.now();
      console.log(`[SRVIC] Fetched ${events.length} events from iCal feed`);
      return events;
    } catch (err: any) {
      console.error("[SRVIC] iCal fetch error:", err.message);
      return cachedSRVICEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  const LGIC_ICAL_URL = "https://wvmuslim.org/?ical=1&eventDisplay=list";
  let cachedLGICEvents: CachedEvent[] = [];
  let lgicLastFetch = 0;
  const LGIC_CACHE_TTL = 15 * 60 * 1000;

  async function fetchLGICEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedLGICEvents.length > 0 && (now - lgicLastFetch) < LGIC_CACHE_TTL) {
      return cachedLGICEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const response = await fetch(LGIC_ICAL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const icalText = await response.text();
      const events = parseICalFeed(icalText, {
        idPrefix: "lgic",
        defaultOrganizer: "Los Gatos Islamic Center",
        defaultLocation: "16769 Farley Rd, Los Gatos, CA 95032",
        useEventLocation: true,
      });
      cachedLGICEvents = events;
      lgicLastFetch = Date.now();
      console.log(`[LGIC] Fetched ${events.length} events from iCal feed`);
      return events;
    } catch (err: any) {
      console.error("[LGIC] iCal fetch error:", err.message);
      return cachedLGICEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  const ICF_ICAL_URL = "https://icfbayarea.com/?post_type=tribe_events&ical=1&eventDisplay=list";
  let cachedICFEvents: CachedEvent[] = [];
  let icfLastFetch = 0;
  const ICF_CACHE_TTL = 15 * 60 * 1000;

  async function fetchICFEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedICFEvents.length > 0 && (now - icfLastFetch) < ICF_CACHE_TTL) {
      return cachedICFEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const response = await fetch(ICF_ICAL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const icalText = await response.text();
      const events = parseICalFeed(icalText, {
        idPrefix: "icf",
        defaultOrganizer: "Islamic Center of Fremont",
        defaultLocation: "4039 Irvington Ave, Fremont, CA 94538",
        useEventLocation: true,
      });
      cachedICFEvents = events;
      icfLastFetch = Date.now();
      console.log(`[ICF] Fetched ${events.length} events from iCal feed`);
      return events;
    } catch (err: any) {
      console.error("[ICF] iCal fetch error:", err.message);
      return cachedICFEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  const ROOTS_DFW_CALENDAR_ID = "3vdosst5ebluhk5eucg6kgrrl8@group.calendar.google.com";
  let cachedRootsDfwEvents: CachedEvent[] = [];
  let rootsDfwLastFetch = 0;
  const ROOTS_DFW_CACHE_TTL = 5 * 60 * 1000;

  async function fetchRootsDfwEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedRootsDfwEvents.length > 0 && (now - rootsDfwLastFetch) < ROOTS_DFW_CACHE_TTL) {
      return cachedRootsDfwEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const calendar = await getUncachableGoogleCalendarClient();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      const response = await calendar.events.list({
        calendarId: ROOTS_DFW_CALENDAR_ID,
        timeMin: startOfToday.toISOString(),
        timeMax: threeMonthsLater.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      const events: CachedEvent[] = (response.data.items || []).map((event: any) => {
        const desc = event.description || "";
        const imgMatch = desc.match(/src="([^"]+)"/);
        const imageUrl = imgMatch ? imgMatch[1] : "";
        const allLinks = desc.match(/https?:\/\/[^\s)"<>]+/g) || [];
        const registrationUrl = allLinks.find((url: string) =>
          !url.includes("drive.google.com/thumbnail") &&
          (url.includes("forms.gle") || url.includes("docs.google.com/forms") ||
           url.includes("eventbrite") || url.includes("register") || url.includes("rsvp") ||
           url.includes("bit.ly") || url.includes("tinyurl.com"))
        ) || allLinks.find((url: string) => !url.includes("drive.google.com/thumbnail")) || "";

        return {
          id: `roots_dfw_${event.id}`,
          title: event.summary || "Untitled Event",
          description: cleanDescription(desc),
          location: event.location || "4200 International Pkwy, Carrollton, TX 75007",
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          isAllDay: !event.start?.dateTime,
          organizer: "Roots DFW",
          imageUrl,
          registrationUrl: registrationUrl || "https://www.rootsdfw.org/",
          speaker: extractSpeaker(desc),
          latitude: 32.9857,
          longitude: -96.7502,
          isVirtual: false,
          isFeatured: false,
        };
      });

      cachedRootsDfwEvents = events;
      rootsDfwLastFetch = Date.now();
      console.log(`[Roots DFW] Fetched ${events.length} events from Google Calendar`);
      return events.filter(e => new Date(e.end || e.start) >= new Date());
    } catch (err: any) {
      console.error("[Roots DFW] Calendar fetch error:", err.message);
      return cachedRootsDfwEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  let cachedQahwahEvents: CachedEvent[] = [];
  let qahwahLastFetch = 0;
  const QAHWAH_CACHE_TTL = 60 * 60 * 1000;

  async function fetchQahwahEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedQahwahEvents.length > 0 && (now - qahwahLastFetch) < QAHWAH_CACHE_TTL) {
      return cachedQahwahEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const nowDate = new Date();
      const months = [
        `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`,
        `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 2).padStart(2, "0")}`,
      ].map(m => {
        const [y, mo] = m.split("-").map(Number);
        if (mo > 12) return `${y + 1}-01`;
        return m;
      });

      const allItems: any[] = [];
      for (const month of months) {
        const url = `https://www.qahwacafe.com/api/open/GetItemsByMonth?month=${month}&type=events`;
        try {
          const r = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SalamYallBot/1.0)" },
            signal: AbortSignal.timeout(10000),
          });
          if (r.ok) {
            const json = await r.json() as any;
            const items = json?.items || json?.upcoming || json?.events || (Array.isArray(json) ? json : []);
            allItems.push(...items);
          }
        } catch {}
      }

      // HTML fallback: scrape events page if JSON returned no items
      if (allItems.length === 0) {
        try {
          const pageResp = await fetch("https://www.qahwacafe.com/events", {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SalamYallBot/1.0)" },
            signal: AbortSignal.timeout(12000),
          });
          if (pageResp.ok) {
            const html = await pageResp.text();
            // Extract event items from LD+JSON or structured HTML
            const ldMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
            for (const block of ldMatch) {
              try {
                const content = block.replace(/<[^>]+>/g, "");
                const data = JSON.parse(content);
                const items: any[] = Array.isArray(data) ? data : (data["@graph"] || [data]);
                for (const item of items) {
                  if (item["@type"] === "Event" && item.name) {
                    allItems.push({
                      title: item.name,
                      startDate: item.startDate ? new Date(item.startDate).getTime() : Date.now(),
                      endDate: item.endDate ? new Date(item.endDate).getTime() : undefined,
                      body: item.description || "",
                      location: item.location?.name || "46903 Sugarland Rd, Sterling, VA 20164",
                      fullUrl: item.url ? item.url.replace("https://www.qahwacafe.com", "") : "",
                      id: item.url || item.name,
                    });
                  }
                }
              } catch {}
            }
            if (allItems.length > 0) console.log(`[Qahwah] Fetched ${allItems.length} events from HTML fallback`);
          }
        } catch {}
      }

      const events: CachedEvent[] = allItems
        .filter(item => item && (item.title || item.fullUrl))
        .map((item: any, idx: number) => {
          const startMs = item.startDate || item.publishOn || Date.now();
          const endMs = item.endDate || startMs + 3600000;
          const desc = item.body ? item.body.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim() : "";
          const regUrl = item.fullUrl ? `https://www.qahwacafe.com${item.fullUrl}` : "https://www.qahwacafe.com/events";
          return {
            id: `qahwah_${item.id || idx}`,
            title: item.title || "Qahwah Cafe Event",
            description: desc,
            location: item.location || "46903 Sugarland Rd, Sterling, VA 20164",
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            isAllDay: false,
            organizer: "Qahwah Cafe",
            imageUrl: item.assetUrl || item.thumbnailUrl || "",
            registrationUrl: regUrl,
            speaker: "",
            latitude: 39.0057,
            longitude: -77.4050,
            isVirtual: false,
            isFeatured: false,
          };
        });

      cachedQahwahEvents = events;
      qahwahLastFetch = Date.now();
      if (events.length > 0) console.log(`[Qahwah] Fetched ${events.length} events`);
      // Upsert into community_events for persistence
      await upsertQahwahToDB(events);
      return events.filter(e => new Date(e.end || e.start) >= new Date());
    } catch (err: any) {
      console.error("[Qahwah] Events fetch error:", err.message);
      return cachedQahwahEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  async function upsertQahwahToDB(events: CachedEvent[]): Promise<void> {
    for (const ev of events) {
      try {
        const start = new Date(ev.start);
        const end = new Date(ev.end || ev.start);
        if (isNaN(start.getTime())) continue;
        const { rows: existing } = await pool.query(
          "SELECT id FROM community_events WHERE organizer = 'Qahwah Cafe' AND title = $1 AND start_time = $2",
          [ev.title, start]
        );
        if (existing.length > 0) {
          await pool.query(
            `UPDATE community_events SET description=$1, location=$2, end_time=$3, registration_url=$4, lat=$5, lng=$6, status='approved' WHERE id=$7`,
            [ev.description || null, ev.location || null, end, ev.registrationUrl || null, ev.latitude || null, ev.longitude || null, existing[0].id]
          );
        } else {
          await pool.query(
            `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, is_virtual, is_featured, status, lat, lng)
             VALUES ($1,$2,$3,$4,$5,'Qahwah Cafe',$6,false,false,'approved',$7,$8)`,
            [ev.title, ev.description || null, ev.location || null, start, end, ev.registrationUrl || null, ev.latitude || null, ev.longitude || null]
          );
        }
      } catch {}
    }
    if (events.length > 0) console.log(`[Qahwah] Upserted ${events.length} events into community_events`);
  }

  // Schedule weekly Qahwah refresh (every Monday at 6 AM ET)
  function scheduleQahwahEvents(): void {
    fetchQahwahEvents().catch(() => {});
    setInterval(() => {
      const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      if (nowET.getDay() === 1) {
        fetchQahwahEvents().catch(() => {});
      }
    }, 24 * 60 * 60 * 1000);
  }
  scheduleQahwahEvents();

  const MCA_CALENDAR_ID = "c_0f12fe7cae6832644dd87c48e910a7e82060b70a81d12cd9def13d6764be61bf@group.calendar.google.com";
  let cachedMCAEvents: CachedEvent[] = [];
  let mcaLastFetch = 0;
  const MCA_CACHE_TTL = 5 * 60 * 1000;

  async function fetchMCAEvents(): Promise<CachedEvent[]> {
    const now = Date.now();
    if (cachedMCAEvents.length > 0 && (now - mcaLastFetch) < MCA_CACHE_TTL) {
      return cachedMCAEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
    try {
      const calendar = await getUncachableGoogleCalendarClient();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      const response = await calendar.events.list({
        calendarId: MCA_CALENDAR_ID,
        timeMin: startOfToday.toISOString(),
        timeMax: threeMonthsLater.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });

      const events: CachedEvent[] = (response.data.items || []).map((event: any) => {
        const desc = event.description || "";
        const imgMatch = desc.match(/src="([^"]+)"/);
        const imageUrl = imgMatch ? imgMatch[1] : "";
        const allLinks = desc.match(/https?:\/\/[^\s)"<>]+/g) || [];
        const registrationUrl = allLinks.find((url: string) =>
          !url.includes("drive.google.com/thumbnail") &&
          (url.includes("forms.gle") || url.includes("docs.google.com/forms") ||
           url.includes("eventbrite") || url.includes("register") || url.includes("rsvp") ||
           url.includes("bit.ly") || url.includes("tinyurl.com") || url.includes("mcabayarea.org"))
        ) || allLinks.find((url: string) => !url.includes("drive.google.com/thumbnail")) || "";

        const rawLocation = event.location || "";
        const resolvedLocation = resolveLocation(rawLocation) || rawLocation || "3003 Scott Blvd, Santa Clara, CA 95054";
        const organizer = "Muslim Community Association";
        const coords = resolveCoordinates(organizer, resolvedLocation);

        return {
          id: `mca_${event.id}`,
          title: event.summary || "Untitled Event",
          description: cleanDescription(desc),
          location: resolvedLocation,
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          isAllDay: !event.start?.dateTime,
          organizer,
          imageUrl,
          registrationUrl: registrationUrl || "",
          speaker: extractSpeaker(desc),
          latitude: coords.latitude,
          longitude: coords.longitude,
          isVirtual: false,
          isFeatured: false,
        };
      });

      cachedMCAEvents = events;
      mcaLastFetch = Date.now();
      console.log(`[MCA] Fetched ${events.length} events from Google Calendar`);
      return events.filter(e => new Date(e.end || e.start) >= new Date());
    } catch (err: any) {
      console.error("[MCA] Calendar fetch error:", err.message);
      return cachedMCAEvents.filter(e => new Date(e.end || e.start) >= new Date());
    }
  }

  app.get("/api/events", async (req, res) => {
    try {
      const communityEvents = await getCommunityEvents(req);
      const rootsDfwEvents = await fetchRootsDfwEvents();
      const mccEastBayEvents = await fetchMCCEastBayEvents();
      const srvicEvents = await fetchSRVICEvents();
      const mcaEvents = await fetchMCAEvents();
      const icfEvents = await fetchICFEvents();
      const lgicEvents = await fetchLGICEvents();
      const qahwahEvents = await fetchQahwahEvents();
      const merged = [...communityEvents, ...rootsDfwEvents, ...mccEastBayEvents, ...srvicEvents, ...mcaEvents, ...icfEvents, ...lgicEvents, ...qahwahEvents]
        .filter(ev => !ev.title.toLowerCase().includes("private event"));
      const seen = new Set<string>();
      const allEvents = merged.filter(ev => {
        const key = `${ev.title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${new Date(ev.start).toISOString().slice(0, 10)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => {
        const aTime = new Date(a.start).getTime();
        const bTime = new Date(b.start).getTime();
        return aTime - bTime;
      });
      res.json(allEvents);
    } catch (error: any) {
      console.error("Error fetching calendar events:", error.message);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/events/refresh", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json({ refreshed: true, message: "Events are now managed through the admin portal" });
    } catch (error: any) {
      console.error("Error refreshing events:", error.message);
      res.status(500).json({ error: "Failed to refresh events" });
    }
  });

  const anthropicPublic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const publicExtractRateLimit = new Map<string, number>();
  app.post("/api/public/events/extract-flyer", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const lastReq = publicExtractRateLimit.get(clientIp) || 0;
      if (now - lastReq < 10000) {
        return res.status(429).json({ error: "Please wait a moment before trying again" });
      }
      publicExtractRateLimit.set(clientIp, now);
      if (publicExtractRateLimit.size > 1000) {
        const cutoff = now - 60000;
        for (const [k, v] of publicExtractRateLimit) { if (v < cutoff) publicExtractRateLimit.delete(k); }
      }

      const { images } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }
      if (images.length > 5) {
        return res.status(400).json({ error: "Maximum 5 images allowed" });
      }

      const imageBlocks: any[] = [];
      for (const img of images) {
        if (!img.data || typeof img.data !== "string") continue;
        if (img.data.length > 10 * 1024 * 1024) continue;
        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: (img.mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        });
      }

      if (imageBlocks.length === 0) {
        return res.status(400).json({ error: "No valid images provided" });
      }

      const message = await anthropicPublic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Extract event details from ${imageBlocks.length > 1 ? 'these flyer images (they are multiple pages/views of the same event). Combine information from ALL images to build the most complete event details.' : 'this flyer image'}. Today's date is ${new Date().toISOString().split("T")[0]}. IMPORTANT: If the flyer does not specify a year, assume the next upcoming occurrence of that date (i.e. use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1}, whichever makes the date in the future). Also look carefully for any QR codes in the image — if you find one, decode it and use the URL as the registrationUrl.

Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "title": "event title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM" (24-hour format),
  "endTime": "HH:MM" (24-hour format, null if not shown),
  "location": "full address or venue name",
  "description": "brief description of the event (2-3 sentences max)",
  "organizer": "organization or group hosting the event",
  "registrationUrl": "decoded QR code URL, or visible registration/RSVP URL"
}
Return ONLY the JSON object, no markdown, no explanation.`,
            },
          ],
        }],
      });

      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") return res.status(500).json({ error: "Failed to read flyer" });
      let extracted;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        extracted = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "Could not extract details from this flyer" });
      }
      res.json(extracted);
    } catch (error: any) {
      console.error("[Public Flyer Extract] Error:", error.message);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/public/events/submit", async (req, res) => {
    try {
      const { title, description, location, startTime, endTime, organizer, registrationUrl, image, imageMime, additionalImages, submitterName, submitterEmail } = req.body;
      if (!title || !startTime) return res.status(400).json({ error: "Title and start time are required" });

      let eventLat: number | null = null;
      let eventLng: number | null = null;
      const resolvedOrg = resolveOrgName(organizer || "") || organizer || "";
      const resolved = resolveCoordinates(resolvedOrg, location || "");
      if (resolved.latitude && resolved.longitude) {
        eventLat = resolved.latitude;
        eventLng = resolved.longitude;
      } else if (location) {
        const geocoded = await geocodeAddress(location);
        if (geocoded) { eventLat = geocoded.lat; eventLng = geocoded.lng; }
      }

      const normalizedAdditional = Array.isArray(additionalImages) ? additionalImages.map((img: any) => ({
        data: img.data,
        mime: img.mime || img.mimeType || "image/jpeg",
      })) : [];
      const addImgs = normalizedAdditional.length > 0 ? JSON.stringify(normalizedAdditional) : '[]';
      const result = await pool.query(
        `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, additional_images, is_virtual, is_featured, status, lat, lng, submitter_name, submitter_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, false, false, 'pending', $11, $12, $13, $14)
         RETURNING id`,
        [title, description || null, location || null, new Date(startTime), endTime ? new Date(endTime) : null, organizer || null, registrationUrl || null, image || null, imageMime || "image/jpeg", addImgs, eventLat, eventLng, submitterName || null, submitterEmail || null]
      );

      console.log(`[Public Event Submit] "${title}" by ${submitterName || 'anonymous'} (${submitterEmail || 'no email'}) — pending approval (ID: ${result.rows[0].id})`);
      res.json({ id: result.rows[0].id, status: "pending", message: "Event submitted for review. It will appear once approved." });
    } catch (error: any) {
      console.error("[Public Event Submit] Error:", error.message);
      res.status(500).json({ error: "Failed to submit event. Please try again." });
    }
  });

  app.post("/api/admin/import-calendar-events", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const events = await fetchAndCacheEvents();
      const withOverrides = await applyEventOverrides(events);

      let imported = 0;
      let skipped = 0;
      for (const ev of withOverrides) {
        const { rows: existing } = await pool.query(
          "SELECT id FROM community_events WHERE title = $1 AND start_time = $2",
          [ev.title, ev.start ? new Date(ev.start) : null]
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        let imageData: string | null = null;
        let imageMime = "image/jpeg";
        if (ev.imageUrl && ev.imageUrl.startsWith("http")) {
          try {
            const imgRes = await fetch(ev.imageUrl);
            if (imgRes.ok) {
              const contentType = imgRes.headers.get("content-type") || "image/jpeg";
              imageMime = contentType.split(";")[0];
              const buf = Buffer.from(await imgRes.arrayBuffer());
              imageData = buf.toString("base64");
            }
          } catch {}
        }

        const coords = resolveCoordinates(ev.organizer, ev.location);
        await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, is_virtual, is_featured, lat, lng, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'approved')`,
          [
            ev.title,
            ev.description || null,
            ev.location || null,
            ev.start ? new Date(ev.start) : null,
            ev.end ? new Date(ev.end) : null,
            ev.organizer || null,
            ev.registrationUrl || null,
            imageData,
            imageMime,
            ev.isVirtual || false,
            ev.isFeatured || false,
            coords.latitude || ev.latitude || null,
            coords.longitude || ev.longitude || null,
          ]
        );
        imported++;
      }

      console.log(`[Admin] Imported ${imported} calendar events, skipped ${skipped} duplicates`);
      res.json({ imported, skipped, total: withOverrides.length });
    } catch (error: any) {
      console.error("[Admin] Calendar import error:", error.message);
      res.status(500).json({ error: "Failed to import events: " + error.message });
    }
  });

  app.get("/api/ticker", async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, message, type, created_at, expires_at FROM ticker_messages
         WHERE active = true AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching ticker messages:", error.message);
      res.status(500).json({ error: "Failed to fetch ticker messages" });
    }
  });

  const ADMIN_KEY = process.env.ADMIN_KEY || process.env.SESSION_SECRET;

  app.post("/api/ticker", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { message, type, expires_at } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }
      const validTypes = ["info", "urgent", "event", "reminder"];
      const msgType = validTypes.includes(type) ? type : "info";
      const expiresValue = expires_at ? new Date(expires_at) : null;
      if (expires_at && (!expiresValue || isNaN(expiresValue.getTime()))) {
        return res.status(400).json({ error: "Invalid expires_at timestamp" });
      }
      const result = await pool.query(
        `INSERT INTO ticker_messages (message, type, expires_at) VALUES ($1, $2, $3) RETURNING id, message, type, created_at, expires_at`,
        [message.trim(), msgType, expiresValue]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      console.error("Error creating ticker message:", error.message);
      res.status(500).json({ error: "Failed to create ticker message" });
    }
  });

  app.delete("/api/ticker/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticker ID" });
      }
      await pool.query("UPDATE ticker_messages SET active = false WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting ticker message:", error.message);
      res.status(500).json({ error: "Failed to delete ticker message" });
    }
  });

  app.get("/api/halal-restaurants", async (req, res) => {
    try {
      const { cuisine, status, search } = req.query;
      let query = "SELECT id, external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours, rating, user_ratings_total, website, photo_reference, place_id, instagram_url FROM halal_restaurants";
      const conditions: string[] = ["is_halal != 'NOT_HALAL'", "name NOT ILIKE '%IAR Masjid%'"];
      const params: any[] = [];

      if (status && typeof status === "string" && ["IS_HALAL", "PARTIALLY_HALAL", "UNKNOWN"].includes(status)) {
        params.push(status);
        conditions.push(`is_halal = $${params.length}`);
      }

      if (cuisine && typeof cuisine === "string") {
        params.push(cuisine);
        conditions.push(`$${params.length} = ANY(cuisine_types)`);
      }

      if (search && typeof search === "string") {
        params.push(`%${search}%`);
        conditions.push(`(name ILIKE $${params.length} OR formatted_address ILIKE $${params.length})`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY name";
      const result = await pool.query(query, params);

      try {
        const { rows: overrides } = await pool.query("SELECT restaurant_id, override_periods FROM restaurant_overrides");
        if (overrides.length > 0) {
          const overrideMap = new Map(overrides.map((o: any) => [o.restaurant_id, o.override_periods]));
          for (const row of result.rows) {
            const op = overrideMap.get(row.id);
            if (op) {
              let hours = row.opening_hours;
              if (typeof hours === "string") try { hours = JSON.parse(hours); } catch { hours = {}; }
              if (!hours) hours = {};
              hours.periods = op;
              row.opening_hours = hours;
            }
          }
        }
      } catch (overrideErr: any) {
        console.error("[Halal] Error applying restaurant overrides:", overrideErr.message);
      }

      try {
        const { rows: communityRatings } = await pool.query(
          "SELECT entity_id, AVG(rating)::NUMERIC(3,2) as avg_rating, COUNT(*) as total_ratings FROM user_ratings WHERE entity_type = 'restaurant' GROUP BY entity_id"
        );
        const { rows: lastCheckins } = await pool.query(
          "SELECT DISTINCT ON (restaurant_id) restaurant_id, created_at FROM halal_checkins ORDER BY restaurant_id, created_at DESC"
        );
        const ratingMap = new Map(communityRatings.map((r: any) => [r.entity_id, { avg: parseFloat(r.avg_rating), count: parseInt(r.total_ratings) }]));
        const checkinMap = new Map(lastCheckins.map((c: any) => [c.restaurant_id, c.created_at]));
        for (const row of result.rows) {
          const cr = ratingMap.get(row.id);
          row.community_rating = cr ? cr.avg : null;
          row.community_rating_count = cr ? cr.count : 0;
          row.last_checkin = checkinMap.get(row.id) || null;
        }
      } catch (crErr: any) {
        console.error("[Halal] Error fetching community ratings:", crErr.message);
      }

      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching halal restaurants:", error.message);
      res.status(500).json({ error: "Failed to fetch halal restaurants" });
    }
  });

  app.get("/api/businesses", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, category, subcategory, description, address, phone, website, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, filter_tags, photo_url, booking_url, search_aliases, affiliation, instagram_url, google_url, location_type, service_area_description, featured FROM businesses WHERE status = 'approved' ORDER BY featured DESC, LOWER(name)"
      );

      try {
        const { rows: communityRatings } = await pool.query(
          "SELECT entity_id, AVG(rating)::NUMERIC(3,2) as avg_rating, COUNT(*) as total_ratings FROM user_ratings WHERE entity_type = 'business' GROUP BY entity_id"
        );
        const ratingMap = new Map(communityRatings.map((r: any) => [r.entity_id, { avg: parseFloat(r.avg_rating), count: parseInt(r.total_ratings) }]));
        for (const row of result.rows) {
          const cr = ratingMap.get(parseInt(row.id));
          row.community_rating = cr ? cr.avg : null;
          row.community_rating_count = cr ? cr.count : 0;
        }
      } catch (crErr: any) {
        console.error("[Business] Error fetching community ratings:", crErr.message);
      }

      for (const row of result.rows) {
        row.specialty = row.subcategory;
        row.keywords = row.filter_tags;
        row.search_tags = row.search_aliases;
        row.hospital_affiliation = row.affiliation;
      }

      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching businesses:", error.message);
      res.status(500).json({ error: "Failed to fetch businesses" });
    }
  });

  app.get("/api/halal-restaurants/single/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        "SELECT id, external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours, rating, user_ratings_total, website, photo_reference, place_id, instagram_url FROM halal_restaurants WHERE id = $1",
        [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Not found" });
      return res.json(result.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ error: "Failed to fetch restaurant" });
    }
  });

  app.get("/api/businesses/single/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        "SELECT id, name, category, subcategory, description, address, phone, website, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, filter_tags, photo_url, booking_url, search_aliases, affiliation, instagram_url, google_url, location_type, service_area_description, featured FROM businesses WHERE id = $1 AND status = 'approved'",
        [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Not found" });
      const row = result.rows[0];
      row.specialty = row.subcategory;
      row.keywords = row.filter_tags;
      return res.json(row);
    } catch (error: any) {
      return res.status(500).json({ error: "Failed to fetch business" });
    }
  });

  app.get("/api/businesses/:id/places-details", async (req, res) => {
    try {
      const { id } = req.params;
      const biz = await pool.query("SELECT * FROM businesses WHERE id = $1", [id]);
      if (biz.rows.length === 0) return res.status(404).json({ error: "Business not found" });
      const business = biz.rows[0];

      if (business.place_id) {
        return res.json({
          place_id: business.place_id,
          rating: business.rating,
          user_ratings_total: business.user_ratings_total,
          has_photo: !!business.photo_reference,
          business_hours: business.business_hours,
          lat: business.lat,
          lng: business.lng,
        });
      }

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.json({ error: "No API key configured" });

      const searchResp = await fetch(
        `https://places.googleapis.com/v1/places:searchText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.location" },
          body: JSON.stringify({ textQuery: `${business.name} ${business.address}` }),
        }
      );
      const searchData = await searchResp.json();
      const place = searchData.places?.[0];
      if (!place) {
        await pool.query(`UPDATE businesses SET place_id = 'none' WHERE id = $1`, [id]);
        return res.json({});
      }

      const photoRef = place.photos?.[0]?.name || null;
      const hours = place.regularOpeningHours?.weekdayDescriptions || null;

      await pool.query(
        `UPDATE businesses SET place_id = $1, rating = $2, user_ratings_total = $3, photo_reference = $4, business_hours = $5, lat = $6, lng = $7 WHERE id = $8`,
        [place.id, place.rating || null, place.userRatingCount || null, photoRef, hours ? JSON.stringify(hours) : null, place.location?.latitude || null, place.location?.longitude || null, id]
      );

      res.json({
        place_id: place.id,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        has_photo: !!photoRef,
        business_hours: hours,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
      });
    } catch (error: any) {
      console.error("Error fetching places details:", error.message);
      res.status(500).json({ error: "Failed to fetch details" });
    }
  });

  app.get("/api/businesses/:id/photo", async (req, res) => {
    try {
      const { id } = req.params;
      const biz = await pool.query("SELECT photo_reference FROM businesses WHERE id = $1", [id]);
      if (biz.rows.length === 0 || !biz.rows[0].photo_reference) {
        return res.status(404).json({ error: "No photo available" });
      }
      const cacheKey = `biz_${id}`;
      const cached = getPhotoFromCache(cacheKey);
      if (cached) {
        res.set("Content-Type", cached.contentType);
        res.set("Cache-Control", "public, max-age=604800");
        return res.send(cached.buffer);
      }
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No API key" });

      const photoUrl = `https://places.googleapis.com/v1/${biz.rows[0].photo_reference}/media?maxWidthPx=800&key=${apiKey}`;
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) return res.status(404).json({ error: "Photo not found" });

      const contentType = photoResp.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await photoResp.arrayBuffer());
      setPhotoCache(cacheKey, buffer, contentType);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=604800");
      res.send(buffer);
    } catch (error: any) {
      console.error("Error proxying photo:", error.message);
      res.status(500).json({ error: "Failed to load photo" });
    }
  });

  app.get("/api/halal-restaurants/:id/photo", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT photo_reference FROM halal_restaurants WHERE id = $1", [id]);
      if (result.rows.length === 0 || !result.rows[0].photo_reference) {
        return res.status(404).json({ error: "No photo available" });
      }
      const cacheKey = `halal_${id}`;
      const cached = getPhotoFromCache(cacheKey);
      if (cached) {
        res.set("Content-Type", cached.contentType);
        res.set("Cache-Control", "public, max-age=604800");
        return res.send(cached.buffer);
      }
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No API key" });

      const photoUrl = `https://places.googleapis.com/v1/${result.rows[0].photo_reference}/media?maxWidthPx=800&key=${apiKey}`;
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) return res.status(404).json({ error: "Photo not found" });

      const contentType = photoResp.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await photoResp.arrayBuffer());
      setPhotoCache(cacheKey, buffer, contentType);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=604800");
      res.send(buffer);
    } catch (error: any) {
      console.error("Error proxying halal photo:", error.message);
      res.status(500).json({ error: "Failed to load photo" });
    }
  });

  const METRO_AREAS: { name: string; lat: number; lng: number; cities: string[] }[] = [
    { name: "Atlanta GA", lat: 33.7490, lng: -84.3880, cities: ["Atlanta", "Alpharetta", "Marietta", "Duluth", "Decatur"] },
    { name: "Austin TX", lat: 30.2672, lng: -97.7431, cities: ["Austin", "Round Rock", "Cedar Park", "Pflugerville", "Georgetown"] },
    { name: "Baltimore MD", lat: 39.2904, lng: -76.6122, cities: ["Baltimore", "Towson", "Ellicott City", "Columbia", "Catonsville"] },
    { name: "Bay Area CA", lat: 37.5485, lng: -121.9886, cities: ["Fremont", "San Jose", "Sunnyvale", "Santa Clara", "Milpitas", "Oakland", "Berkeley", "San Francisco", "Hayward", "Union City"] },
    { name: "Boston MA", lat: 42.3601, lng: -71.0589, cities: ["Boston", "Cambridge", "Worcester", "Lowell", "Quincy"] },
    { name: "Charlotte NC", lat: 35.2271, lng: -80.8431, cities: ["Charlotte", "Concord", "Gastonia", "Huntersville", "Matthews"] },
    { name: "Chicago IL", lat: 41.8781, lng: -87.6298, cities: ["Chicago", "Naperville", "Schaumburg", "Skokie", "Evanston"] },
    { name: "Columbus OH", lat: 39.9612, lng: -82.9988, cities: ["Columbus", "Dublin", "Westerville", "Hilliard", "Grove City"] },
    { name: "Denver CO", lat: 39.7392, lng: -104.9903, cities: ["Denver", "Aurora", "Thornton", "Westminster", "Lakewood"] },
    { name: "Detroit MI", lat: 42.3314, lng: -83.0458, cities: ["Detroit", "Dearborn", "Canton", "Hamtramck", "Troy"] },
    { name: "DFW TX", lat: 32.7767, lng: -96.7970, cities: ["Dallas", "Fort Worth", "Plano", "Irving", "Arlington"] },
    { name: "DMV", lat: 38.9072, lng: -77.0369, cities: ["Washington DC", "Falls Church", "Silver Spring", "Fairfax", "Herndon", "Sterling", "Ashburn", "Chantilly", "Leesburg", "Nokesville", "Reston", "Manassas", "Alexandria", "Arlington"] },
    { name: "Houston TX", lat: 29.7604, lng: -95.3698, cities: ["Houston", "Sugar Land", "Katy", "Pearland", "Missouri City"] },
    { name: "Indianapolis IN", lat: 39.7684, lng: -86.1581, cities: ["Indianapolis", "Carmel", "Fishers", "Greenwood", "Plainfield"] },
    { name: "Las Vegas NV", lat: 36.1699, lng: -115.1398, cities: ["Las Vegas", "Henderson", "North Las Vegas", "Summerlin", "Enterprise"] },
    { name: "Los Angeles CA", lat: 34.0522, lng: -118.2437, cities: ["Los Angeles", "Anaheim", "Irvine", "Pasadena", "Glendale"] },
    { name: "Miami FL", lat: 25.7617, lng: -80.1918, cities: ["Miami", "Hialeah", "Pembroke Pines", "Davie", "Plantation"] },
    { name: "Milwaukee WI", lat: 43.0389, lng: -87.9065, cities: ["Milwaukee", "Wauwatosa", "West Allis", "Greenfield", "New Berlin", "Brookfield", "South Milwaukee", "Oak Creek", "Franklin"] },
    { name: "Minneapolis MN", lat: 44.9778, lng: -93.2650, cities: ["Minneapolis", "St. Paul", "Bloomington", "Brooklyn Park", "Eden Prairie"] },
    { name: "Nashville TN", lat: 36.1627, lng: -86.7816, cities: ["Nashville", "Murfreesboro", "Franklin", "Antioch", "Hendersonville"] },
    { name: "NYC Metro", lat: 40.7128, lng: -74.0060, cities: ["New York", "Jersey City", "Paterson", "Edison", "Clifton"] },
    { name: "Orlando FL", lat: 28.5383, lng: -81.3792, cities: ["Orlando", "Kissimmee", "Altamonte Springs", "Sanford", "Winter Park"] },
    { name: "Philadelphia PA", lat: 39.9526, lng: -75.1652, cities: ["Philadelphia", "Cherry Hill", "Norristown", "Camden", "Wilmington"] },
    { name: "Phoenix AZ", lat: 33.4484, lng: -112.0740, cities: ["Phoenix", "Tempe", "Chandler", "Mesa", "Scottsdale"] },
    { name: "Sacramento CA", lat: 38.5816, lng: -121.4944, cities: ["Sacramento", "Elk Grove", "Roseville", "Folsom", "Rancho Cordova"] },
    { name: "San Antonio TX", lat: 29.4241, lng: -98.4936, cities: ["San Antonio", "New Braunfels", "Schertz", "Converse", "Live Oak"] },
    { name: "San Diego CA", lat: 32.7157, lng: -117.1611, cities: ["San Diego", "El Cajon", "Chula Vista", "Escondido", "Oceanside"] },
    { name: "Seattle WA", lat: 47.6062, lng: -122.3321, cities: ["Seattle", "Redmond", "Bellevue", "Kent", "Renton"] },
    { name: "St. Louis MO", lat: 38.6270, lng: -90.1994, cities: ["St. Louis", "Florissant", "O'Fallon", "Chesterfield", "Maryland Heights"] },
    { name: "Tampa FL", lat: 27.9506, lng: -82.4572, cities: ["Tampa", "St. Petersburg", "Brandon", "Clearwater", "Riverview"] },
    { name: "Triangle NC", lat: 35.7796, lng: -78.6382, cities: ["Raleigh", "Durham", "Chapel Hill", "Cary", "Apex"] },
  ];

  function findNearestMetro(lat: number, lng: number): { name: string; cities: string[] } | null {
    let closest: typeof METRO_AREAS[0] | null = null;
    let minDist = Infinity;
    for (const metro of METRO_AREAS) {
      const dLat = metro.lat - lat;
      const dLng = metro.lng - lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < minDist) {
        minDist = dist;
        closest = metro;
      }
    }
    const MAX_DIST = 4;
    if (minDist > MAX_DIST || !closest) return null;
    return { name: closest.name, cities: closest.cities };
  }

  app.get("/api/geo/metro", (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng required" });
    }
    const metro = findNearestMetro(lat, lng);
    if (!metro) {
      return res.json({ found: false });
    }
    res.json({ found: true, metro: metro.name, cities: metro.cities });
  });

  app.get("/api/geo/metros", (_req, res) => {
    res.json(METRO_AREAS.map(m => ({ name: m.name, lat: m.lat, lng: m.lng, cities: m.cities })));
  });

  app.post("/api/android-waitlist", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email required" });
      }
      await pool.query(
        "INSERT INTO android_waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
        [email.trim().toLowerCase().slice(0, 255)]
      );
      res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error("[Waitlist] Error:", error.message);
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  });

  app.post("/api/analytics/event", async (req, res) => {
    try {
      const { event_name, event_data, device_id, platform, user_id } = req.body;
      if (!event_name || typeof event_name !== "string") {
        return res.status(400).json({ error: "event_name required" });
      }
      await pool.query(
        "INSERT INTO analytics_events (event_name, event_data, device_id, platform, user_id) VALUES ($1, $2, $3, $4, $5)",
        [event_name.slice(0, 100), event_data || null, device_id?.slice(0, 100) || null, platform?.slice(0, 20) || null, user_id || null]
      );
      res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error("[Analytics] Error:", error.message);
      res.status(500).json({ error: "Failed to log event" });
    }
  });

  app.post("/api/analytics/batch", async (req, res) => {
    try {
      const { events } = req.body;
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: "events array required" });
      }
      const limited = events.slice(0, 50);
      const values: string[] = [];
      const params: any[] = [];
      for (const evt of limited) {
        if (!evt.event_name) continue;
        const i = params.length;
        values.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
        params.push(evt.event_name.slice(0, 100), evt.event_data || null, evt.device_id?.slice(0, 100) || null, evt.platform?.slice(0, 20) || null, evt.user_id || null);
      }
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO analytics_events (event_name, event_data, device_id, platform, user_id) VALUES ${values.join(", ")}`,
          params
        );
      }
      res.status(201).json({ ok: true, count: values.length });
    } catch (error: any) {
      console.error("[Analytics] Batch error:", error.message);
      res.status(500).json({ error: "Failed to log events" });
    }
  });

  await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);

  async function getCommunityTarget(): Promise<number> {
    const result = await pool.query(`SELECT value FROM app_settings WHERE key = 'community_monthly_target'`);
    if (result.rows.length > 0) return parseInt(result.rows[0].value, 10);
    return parseInt(process.env.COMMUNITY_MONTHLY_TARGET || "10000", 10);
  }

  app.get("/api/community-goal", async (req, res) => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const prayerResult = await pool.query(
        `SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'prayer_tracked' AND created_at >= $1 AND created_at < $2`,
        [monthStart, monthEnd]
      );
      const quranResult = await pool.query(
        `SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'quran_read' AND created_at >= $1 AND created_at < $2`,
        [monthStart, monthEnd]
      );

      const prayerCount = parseInt(prayerResult.rows[0]?.count || "0");
      const quranCount = parseInt(quranResult.rows[0]?.count || "0");
      const totalCount = prayerCount + quranCount;
      const target = await getCommunityTarget();

      const monthName = now.toLocaleString("en-US", { month: "long" });

      res.json({
        prayerCount,
        quranCount,
        totalCount,
        target,
        progress: Math.min(1, totalCount / target),
        month: monthName,
      });
    } catch (error: any) {
      console.error("[Community Goal] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch community goal" });
    }
  });

  app.put("/api/community-goal", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { target } = req.body;
      if (!target || typeof target !== "number" || target < 100 || target > 100000) {
        return res.status(400).json({ error: "Target must be a number between 100 and 100,000" });
      }
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('community_monthly_target', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [String(target)]
      );
      res.json({ success: true, target, message: `Community goal updated to ${target.toLocaleString()}` });
    } catch (error: any) {
      console.error("[Community Goal Update] Error:", error.message);
      res.status(500).json({ error: "Failed to update community goal" });
    }
  });

  const lookupLimiter: Record<string, { count: number; resetAt: number }> = {};
  app.post("/api/businesses/lookup", async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      if (!lookupLimiter[clientIp] || lookupLimiter[clientIp].resetAt < now) {
        lookupLimiter[clientIp] = { count: 0, resetAt: now + 60_000 };
      }
      lookupLimiter[clientIp].count++;
      if (lookupLimiter[clientIp].count > 5) {
        return res.status(429).json({ error: "Too many lookups. Please wait a minute before trying again." });
      }

      const { url } = req.body;
      if (!url || typeof url !== "string" || url.length > 2000) {
        return res.status(400).json({ error: "Please provide a valid Google Maps link" });
      }

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Lookup service is not configured" });
      }

      let resolvedUrl = url.trim();
      if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(resolvedUrl)) {
        try {
          const redirectResp = await fetch(resolvedUrl, { method: "HEAD", redirect: "follow" });
          if (redirectResp.url) resolvedUrl = redirectResp.url;
        } catch {}
      }

      let searchQuery = "";
      try {
        const parsed = new URL(resolvedUrl);
        const pathMatch = parsed.pathname.match(/\/maps\/place\/([^/@]+)/);
        if (pathMatch) {
          searchQuery = decodeURIComponent(pathMatch[1].replace(/\+/g, " "));
        }
        if (!searchQuery) {
          const qParam = parsed.searchParams.get("q") || parsed.searchParams.get("query") || "";
          if (qParam) searchQuery = qParam;
        }
        if (!searchQuery) {
          const ftidMatch = parsed.searchParams.get("ftid");
          const nameFromPath = parsed.pathname.match(/\/place\/([^/]+)/);
          if (nameFromPath) searchQuery = decodeURIComponent(nameFromPath[1].replace(/\+/g, " "));
        }
      } catch {
        searchQuery = resolvedUrl;
      }

      if (!searchQuery) {
        return res.status(400).json({ error: "Could not parse a business name from that link. Try pasting the full Google Maps URL." });
      }

      const searchResp = await fetch(
        `https://places.googleapis.com/v1/places:searchText`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.location,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.formattedAddress",
          },
          body: JSON.stringify({ textQuery: searchQuery }),
        }
      );
      const searchData = await searchResp.json();
      const place = searchData.places?.[0];
      if (!place) {
        return res.status(404).json({ error: `No results found for "${searchQuery}". Double-check the link and try again.` });
      }

      const photoRef = place.photos?.[0]?.name || null;

      res.json({
        name: place.displayName?.text || "",
        address: place.formattedAddress || "",
        phone: place.nationalPhoneNumber || "",
        website: place.websiteUri || "",
        google_url: place.googleMapsUri || url,
        rating: place.rating || null,
        user_ratings_total: place.userRatingCount || null,
        photo_reference: photoRef || "",
        business_hours: place.regularOpeningHours?.weekdayDescriptions || null,
        lat: place.location?.latitude || null,
        lng: place.location?.longitude || null,
        place_id: place.id || null,
      });
    } catch (error: any) {
      console.error("Error looking up business:", error.message);
      res.status(500).json({ error: "Failed to look up business" });
    }
  });

  app.get("/api/businesses/address-autocomplete", async (req, res) => {
    try {
      const input = String(req.query.input || "").trim();
      if (!input || input.length < 3) {
        return res.json({ predictions: [] });
      }
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        return res.json({ predictions: [] });
      }
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${apiKey}`
      );
      const data = await resp.json();
      const predictions = (data.predictions || []).slice(0, 5).map((p: any) => ({
        description: p.description,
        place_id: p.place_id,
      }));
      res.json({ predictions });
    } catch (error: any) {
      console.error("Address autocomplete error:", error.message);
      res.json({ predictions: [] });
    }
  });

  app.post("/api/businesses/upload-photo", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "No image provided" });
      }
      const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
      if (mimeType && !allowedMimes.includes(mimeType)) {
        return res.status(400).json({ error: "Invalid image type. Allowed: JPEG, PNG, WebP" });
      }
      const buffer = Buffer.from(image, "base64");
      const maxSize = 5 * 1024 * 1024;
      if (buffer.length > maxSize) {
        return res.status(400).json({ error: "Image too large. Maximum 5MB." });
      }
      const jpgSig = buffer[0] === 0xFF && buffer[1] === 0xD8;
      const pngSig = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const webpSig = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
      if (!jpgSig && !pngSig && !webpSig) {
        return res.status(400).json({ error: "Invalid image data" });
      }
      const ext = pngSig ? "png" : webpSig ? "webp" : "jpg";
      const fileName = `biz_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`;
      const uploadDir = path.join(__dirname, "..", "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      const url = `/uploads/${fileName}`;
      res.json({ url: `${req.protocol}://${req.get("host")}${url}` });
    } catch (error: any) {
      console.error("Photo upload error:", error.message);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  app.post("/api/businesses/submit", async (req, res) => {
    try {
      const { name, category, subcategory, description, address, phone, website, google_url, filter_tags, photo_url, booking_url, affiliation, instagram_url, location_type, service_area_description, lat, lng } = req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Name and category are required" });
      }

      const validCategories = ["Food & Drink", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Services", "Events", "Creator"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      if ((category === "Healthcare" || category === "Automotive" || category === "Services" || category === "Events" || category === "Creator") && !subcategory) {
        return res.status(400).json({ error: "Subcategory is required for " + category });
      }

      const validLocationTypes = ["physical", "service_area", "virtual", "popup"];
      if (!location_type || !validLocationTypes.includes(location_type)) {
        return res.status(400).json({ error: "Location type is required. Choose: Physical Location, Service Area, Virtual, or Pop-up" });
      }
      const saValue = service_area_description || "";

      const VALID_METROS = [
        "Triangle NC", "Bay Area CA", "Los Angeles CA", "DFW TX", "Houston TX", "Chicago IL",
        "NYC Metro", "DMV", "Detroit MI", "Atlanta GA", "Philadelphia PA", "Minneapolis MN",
        "San Diego CA", "Orlando FL", "Tampa FL", "Miami FL", "Phoenix AZ", "Seattle WA",
        "Denver CO", "Charlotte NC", "Columbus OH", "Nashville TN", "San Antonio TX",
        "Austin TX", "St. Louis MO", "Sacramento CA", "Boston MA", "Baltimore MD",
        "Indianapolis IN",
      ];
      if ((location_type === "service_area" || location_type === "popup") && (!saValue || !VALID_METROS.includes(saValue) || lat == null || lng == null)) {
        return res.status(400).json({ error: "Service area and pop-up businesses require a valid metro area selection." });
      }

      const filterTagsArray = Array.isArray(filter_tags) ? filter_tags : [];

      const usedQuickAdd = !!(google_url && google_url.trim());
      const latVal = lat != null ? parseFloat(lat) : null;
      const lngVal = lng != null ? parseFloat(lng) : null;
      const result = await pool.query(
        `INSERT INTO businesses (name, category, subcategory, description, address, phone, website, google_url, filter_tags, photo_url, booking_url, affiliation, instagram_url, location_type, service_area_description, place_id, lat, lng, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending')
         RETURNING id`,
        [name, category, subcategory || "", description || "", address || "", phone || "", website || "", google_url || "", filterTagsArray, photo_url || "", booking_url || "", affiliation || "", instagram_url || "", location_type, saValue, usedQuickAdd ? null : "none", latVal, lngVal]
      );

      res.status(201).json({
        message: "Business submitted successfully! It will be reviewed before appearing in the directory.",
        id: result.rows[0].id,
      });
    } catch (error: any) {
      console.error("Error submitting business:", error.message);
      res.status(500).json({ error: "Failed to submit business" });
    }
  });

  app.post("/api/admin/businesses/lookup", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const { place_id } = req.body;
      if (!place_id || !place_id.trim()) return res.status(400).json({ error: "Place ID is required" });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured" });
      const detailResp = await fetch(
        `https://places.googleapis.com/v1/places/${place_id.trim()}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,location,rating,userRatingCount,photos,regularOpeningHours",
          },
        }
      );
      if (!detailResp.ok) {
        const errText = await detailResp.text();
        console.error("[Admin Biz Lookup] Places API error:", errText);
        return res.status(400).json({ error: "Place not found. Check the Place ID." });
      }
      const place = await detailResp.json();
      const photoRef = place.photos?.[0]?.name || null;
      const hours = place.regularOpeningHours?.weekdayDescriptions || null;
      res.json({
        name: place.displayName?.text || "",
        address: place.formattedAddress || "",
        phone: place.nationalPhoneNumber || "",
        website: place.websiteUri || "",
        google_url: place.googleMapsUri || "",
        lat: place.location?.latitude || null,
        lng: place.location?.longitude || null,
        rating: place.rating || null,
        user_ratings_total: place.userRatingCount || null,
        photo_reference: photoRef,
        business_hours: hours,
        place_id: place_id.trim(),
      });
    } catch (error: any) {
      console.error("Error looking up business place:", error.message);
      res.status(500).json({ error: "Failed to look up place" });
    }
  });

  app.post("/api/admin/businesses/add", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const { name, category, subcategory, description, address, phone, website, google_url, filter_tags, instagram_url, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, location_type, service_area_description } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
      if (!category) return res.status(400).json({ error: "Category is required" });
      const validCategories = ["Food & Drink", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Services", "Events", "Creator"];
      if (!validCategories.includes(category)) return res.status(400).json({ error: "Invalid category" });
      const validLocationTypes = ["physical", "service_area", "virtual", "popup"];
      const normalizedLocationType = validLocationTypes.includes(location_type) ? location_type : "physical";
      const validServiceAreas = ["", "Triangle Area (Raleigh, Durham, Chapel Hill)", "Raleigh Metro", "Durham / Chapel Hill", "Cary / Apex / Morrisville", "Wake County", "NC Statewide", "Nationwide / Remote"];
      const adminSaValue = service_area_description || "";
      if (adminSaValue && !validServiceAreas.includes(adminSaValue)) {
        return res.status(400).json({ error: "Invalid service area description" });
      }
      const filterTagsArray = Array.isArray(filter_tags) ? filter_tags : [];
      const result = await pool.query(
        `INSERT INTO businesses (name, category, subcategory, description, address, phone, website, google_url, filter_tags, instagram_url, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, location_type, service_area_description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'approved') RETURNING id, name`,
        [
          name.trim(),
          category,
          subcategory || "",
          description || "",
          address || "",
          phone || "",
          website || "",
          google_url || "",
          filterTagsArray,
          instagram_url || "",
          place_id || null,
          rating || null,
          user_ratings_total || null,
          photo_reference || null,
          business_hours ? JSON.stringify(business_hours) : null,
          lat || null,
          lng || null,
          normalizedLocationType,
          adminSaValue,
        ]
      );
      console.log(`[Admin] Business added: ${result.rows[0].name} (ID ${result.rows[0].id})`);
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error adding business:", error.message);
      res.status(500).json({ error: "Failed to add business" });
    }
  });

  app.get("/api/admin/businesses", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const status = (req.query.status as string) || "pending";
      const validStatuses = ["pending", "approved", "rejected"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      const result = await pool.query(
        "SELECT id, name, category, subcategory, description, address, phone, website, status, created_at, filter_tags, photo_url, booking_url, affiliation, search_aliases, place_id, google_url, instagram_url, location_type, service_area_description, featured FROM businesses WHERE status = $1 ORDER BY created_at DESC",
        [status]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching businesses for admin:", error.message);
      res.status(500).json({ error: "Failed to fetch businesses" });
    }
  });

  async function enrichBusinessWithPlaces(businessId: number) {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return;
      const biz = await pool.query("SELECT * FROM businesses WHERE id = $1", [businessId]);
      if (biz.rows.length === 0) return;
      const business = biz.rows[0];
      if (business.place_id) return;

      const searchResp = await fetch(
        `https://places.googleapis.com/v1/places:searchText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.location,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.formattedAddress" },
          body: JSON.stringify({ textQuery: `${business.name} ${business.address}` }),
        }
      );
      const searchData = await searchResp.json();
      const place = searchData.places?.[0];
      if (!place) {
        await pool.query(`UPDATE businesses SET place_id = 'none' WHERE id = $1`, [businessId]);
        return;
      }
      const photoRef = place.photos?.[0]?.name || null;
      const hours = place.regularOpeningHours?.weekdayDescriptions || null;
      const placeWebsite = place.websiteUri || null;
      const googleUrl = place.googleMapsUri || null;
      const placePhone = place.nationalPhoneNumber || null;
      const placeAddress = place.formattedAddress || null;
      await pool.query(
        `UPDATE businesses SET place_id = $1, rating = $2, user_ratings_total = $3, photo_reference = $4, business_hours = $5, lat = $6, lng = $7, website = COALESCE(NULLIF($9, ''), website), google_url = COALESCE(NULLIF($10, ''), google_url), phone = COALESCE(NULLIF($11, ''), phone), address = COALESCE(NULLIF($12, ''), address) WHERE id = $8`,
        [place.id, place.rating || null, place.userRatingCount || null, photoRef, hours ? JSON.stringify(hours) : null, place.location?.latitude || null, place.location?.longitude || null, businessId, placeWebsite || '', googleUrl || '', placePhone || '', placeAddress || '']
      );
      console.log(`[Business Enrich] Enriched business #${businessId} "${business.name}" with Places data`);
    } catch (err: any) {
      console.error(`[Business Enrich] Error enriching business #${businessId}:`, err.message);
    }
  }

  async function enrichHalalRestaurantWithPlaces(restaurantId: number) {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return;
      const res = await pool.query("SELECT * FROM halal_restaurants WHERE id = $1", [restaurantId]);
      if (res.rows.length === 0) return;
      const restaurant = res.rows[0];

      if (restaurant.place_id && restaurant.rating && restaurant.photo_reference) return;

      const searchQuery = restaurant.place_id && restaurant.place_id !== 'none'
        ? null
        : `${restaurant.name} ${restaurant.formatted_address || ''}`.trim();

      let place: any = null;

      if (restaurant.place_id && restaurant.place_id !== 'none') {
        const detailResp = await fetch(
          `https://places.googleapis.com/v1/places/${restaurant.place_id}`,
          {
            headers: {
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "id,rating,userRatingCount,photos,regularOpeningHours,location,websiteUri,googleMapsUri,nationalPhoneNumber,formattedAddress",
            },
          }
        );
        place = await detailResp.json();
        if (place.error) place = null;
      } else if (searchQuery) {
        const searchResp = await fetch(
          `https://places.googleapis.com/v1/places:searchText`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "places.id,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.location,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.formattedAddress",
            },
            body: JSON.stringify({ textQuery: searchQuery }),
          }
        );
        const searchData = await searchResp.json();
        place = searchData.places?.[0];
      }

      if (!place) {
        console.log(`[Halal Enrich] No Places result for restaurant #${restaurantId} "${restaurant.name}"`);
        return;
      }

      const photoRef = place.photos?.[0]?.name || null;
      const hours = place.regularOpeningHours?.weekdayDescriptions || null;
      await pool.query(
        `UPDATE halal_restaurants SET
          place_id = COALESCE($1, place_id),
          rating = COALESCE($2, rating),
          user_ratings_total = COALESCE($3, user_ratings_total),
          photo_reference = COALESCE(NULLIF($4, ''), photo_reference),
          opening_hours = COALESCE($5, opening_hours),
          lat = COALESCE($6, lat),
          lng = COALESCE($7, lng),
          website = COALESCE(NULLIF($8, ''), website),
          url = COALESCE(NULLIF($9, ''), url),
          formatted_phone = COALESCE(NULLIF($10, ''), formatted_phone),
          formatted_address = COALESCE(NULLIF($11, ''), formatted_address),
          hours_last_updated = NOW()
        WHERE id = $12`,
        [
          place.id || null,
          place.rating || null,
          place.userRatingCount || null,
          photoRef || '',
          hours ? JSON.stringify(hours) : null,
          place.location?.latitude || null,
          place.location?.longitude || null,
          place.websiteUri || '',
          place.googleMapsUri || '',
          place.nationalPhoneNumber || '',
          place.formattedAddress || '',
          restaurantId,
        ]
      );
      console.log(`[Halal Enrich] Enriched restaurant #${restaurantId} "${restaurant.name}" with Places data`);
    } catch (err: any) {
      console.error(`[Halal Enrich] Error enriching restaurant #${restaurantId}:`, err.message);
    }
  }

  async function dailyBusinessEnrichment() {
    try {
      const result = await pool.query(
        "SELECT id, name FROM businesses WHERE status = 'approved' AND place_id IS NULL"
      );
      if (result.rows.length > 0) {
        console.log(`[Business Enrich] Found ${result.rows.length} approved businesses to enrich`);
        for (const biz of result.rows) {
          await enrichBusinessWithPlaces(biz.id);
          await new Promise(r => setTimeout(r, 500));
        }
      }

      const missingBizData = await pool.query(
        "SELECT id, name, place_id FROM businesses WHERE status = 'approved' AND place_id IS NOT NULL AND place_id != 'none' AND ((website IS NULL OR website = '') OR (google_url IS NULL OR google_url = '') OR (phone IS NULL OR phone = '')) LIMIT 100"
      );
      if (missingBizData.rows.length > 0) {
        console.log(`[Business Enrich] Backfilling data for ${missingBizData.rows.length} businesses`);
        const bApiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (bApiKey) {
          for (const biz of missingBizData.rows) {
            try {
              const detailResp = await fetch(
                `https://places.googleapis.com/v1/places/${biz.place_id}`,
                { headers: { "X-Goog-Api-Key": bApiKey, "X-Goog-FieldMask": "websiteUri,googleMapsUri,nationalPhoneNumber" } }
              );
              const detailData = await detailResp.json();
              const updates: string[] = [];
              const vals: any[] = [];
              let idx = 1;
              if (detailData.websiteUri) { updates.push(`website = COALESCE(NULLIF(website, ''), $${idx++})`); vals.push(detailData.websiteUri); }
              if (detailData.googleMapsUri) { updates.push(`google_url = COALESCE(NULLIF(google_url, ''), $${idx++})`); vals.push(detailData.googleMapsUri); }
              if (detailData.nationalPhoneNumber) { updates.push(`phone = COALESCE(NULLIF(phone, ''), $${idx++})`); vals.push(detailData.nationalPhoneNumber); }
              if (updates.length > 0) {
                vals.push(biz.id);
                await pool.query(`UPDATE businesses SET ${updates.join(", ")} WHERE id = $${idx}`, vals);
              }
              await new Promise(r => setTimeout(r, 200));
            } catch {}
          }
        }
      }

      console.log("[Business Enrich] Daily enrichment complete");
    } catch (err: any) {
      console.error("[Business Enrich] Daily enrichment error:", err.message);
    }
  }

  async function enrichBusinessDescription(businessId: number): Promise<string | null> {
    try {
      const biz = await pool.query("SELECT id, name, category, subcategory, description, website, google_url, address, filter_tags, place_id FROM businesses WHERE id = $1", [businessId]);
      if (biz.rows.length === 0) return null;
      const business = biz.rows[0];

      let websiteText = "";
      if (business.website) {
        try {
          const resp = await fetch(business.website, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SalamYall/1.0)" },
            signal: AbortSignal.timeout(8000),
          });
          if (resp.ok) {
            const html = await resp.text();
            websiteText = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .substring(0, 3000);
          }
        } catch {}
      }

      let googleInfo = "";
      if (business.google_url && business.place_id && business.place_id !== "none") {
        try {
          const apiKey = process.env.GOOGLE_PLACES_API_KEY;
          if (apiKey) {
            const detailResp = await fetch(
              `https://places.googleapis.com/v1/places/${business.place_id}`,
              { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "displayName,editorialSummary,reviews" } }
            );
            const detailData = await detailResp.json();
            if (detailData.editorialSummary?.text) googleInfo += `Google summary: ${detailData.editorialSummary.text}\n`;
            if (detailData.reviews?.length) {
              googleInfo += "Recent Google reviews:\n" + detailData.reviews.slice(0, 3).map((r: any) => `- ${r.text?.text || ""}`).join("\n");
            }
          }
        } catch {}
      }

      const contextParts = [
        `Business name: ${business.name}`,
        `Category: ${business.category}`,
        business.subcategory ? `Subcategory: ${business.subcategory}` : "",
        business.address ? `Location: ${business.address}` : "",
        business.filter_tags?.length ? `Tags: ${business.filter_tags.join(", ")}` : "",
        websiteText ? `\nWebsite content:\n${websiteText}` : "",
        googleInfo ? `\nGoogle Places info:\n${googleInfo}` : "",
      ].filter(Boolean).join("\n");

      if (!websiteText && !googleInfo) {
        console.log(`[AI Enrich] No website or Google data for #${businessId} "${business.name}", skipping`);
        return null;
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are writing a short business description for a Muslim community directory app called "Salam Y'all" serving Muslim communities across the United States.

Based on the following information, write a concise 1-2 sentence description of this business. The tone should be warm, informative, and community-oriented. Focus on what the business offers and why community members would want to visit. Do not mention "Muslim" or "halal" unless it is genuinely central to the business. Do not include the address or phone number. Do not use quotation marks around the description.

${contextParts}

Return ONLY the description text, nothing else.`,
        }],
      });

      const desc = (message.content[0] as any).text?.trim();
      if (desc && desc.length > 10) {
        await pool.query("UPDATE businesses SET description = $1 WHERE id = $2", [desc.substring(0, 1000), businessId]);
        console.log(`[AI Enrich] Generated description for #${businessId} "${business.name}"`);
        return desc;
      }
      return null;
    } catch (err: any) {
      console.error(`[AI Enrich] Error for business #${businessId}:`, err.message);
      return null;
    }
  }

  async function enrichHalalWithPlaces(restaurantId: number, forcePhoto = false) {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return;
      const res = await pool.query("SELECT * FROM halal_restaurants WHERE id = $1", [restaurantId]);
      if (res.rows.length === 0) return;
      const restaurant = res.rows[0];
      if (restaurant.place_id && !forcePhoto) return;
      if (forcePhoto && restaurant.photo_reference) return;

      if (forcePhoto && restaurant.place_id && restaurant.place_id !== 'none') {
        const detailResp = await fetch(
          `https://places.googleapis.com/v1/places/${restaurant.place_id}`,
          {
            headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" },
          }
        );
        const detailData = await detailResp.json();
        const photoRef = detailData.photos?.[0]?.name || null;
        if (photoRef) {
          await pool.query(`UPDATE halal_restaurants SET photo_reference = $1 WHERE id = $2`, [photoRef, restaurantId]);
          console.log(`[Halal Enrich] Photo added for #${restaurantId} "${restaurant.name}"`);
        }
        return;
      }

      const searchResp = await fetch(
        `https://places.googleapis.com/v1/places:searchText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.location,places.websiteUri" },
          body: JSON.stringify({ textQuery: `${restaurant.name} ${restaurant.formatted_address || ""}` }),
        }
      );
      const searchData = await searchResp.json();
      const place = searchData.places?.[0];
      if (!place) {
        await pool.query(`UPDATE halal_restaurants SET place_id = 'none' WHERE id = $1`, [restaurantId]);
        return;
      }
      const photoRef = place.photos?.[0]?.name || null;
      const placeWebsite = place.websiteUri || null;
      const googleHours = place.regularOpeningHours || {};
      const replacedHours = {
        type: googleHours.type || null,
        openNow: googleHours.openNow || false,
        periods: googleHours.periods || [],
        weekdayDescriptions: googleHours.weekdayDescriptions || [],
        specialDays: googleHours.specialDays || null
      };
      await pool.query(
        `UPDATE halal_restaurants SET place_id = $1, rating = COALESCE($2, rating), user_ratings_total = COALESCE($3, user_ratings_total), photo_reference = $4, opening_hours = $5::jsonb, lat = COALESCE($6, lat), lng = COALESCE($7, lng), website = COALESCE($9, website) WHERE id = $8`,
        [place.id, place.rating || null, place.userRatingCount || null, photoRef, JSON.stringify(replacedHours), place.location?.latitude || null, place.location?.longitude || null, restaurantId, placeWebsite]
      );
      console.log(`[Halal Enrich] Enriched #${restaurantId} "${restaurant.name}" with Places data`);
    } catch (err: any) {
      console.error(`[Halal Enrich] Error enriching #${restaurantId}:`, err.message);
    }
  }

  async function dailyHalalEnrichment() {
    try {
      const result = await pool.query(
        "SELECT id, name FROM halal_restaurants WHERE place_id IS NULL LIMIT 50"
      );
      if (result.rows.length > 0) {
        console.log(`[Halal Enrich] Found ${result.rows.length} restaurants to enrich`);
        for (const r of result.rows) {
          await enrichHalalWithPlaces(r.id);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const missingPhotos = await pool.query(
        "SELECT id, name FROM halal_restaurants WHERE place_id IS NOT NULL AND place_id != 'none' AND (photo_reference IS NULL OR photo_reference = '') LIMIT 100"
      );
      if (missingPhotos.rows.length > 0) {
        console.log(`[Halal Enrich] Fetching photos for ${missingPhotos.rows.length} restaurants`);
        for (const r of missingPhotos.rows) {
          await enrichHalalWithPlaces(r.id, true);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS hours_last_updated TIMESTAMPTZ`);

      const missingHours = await pool.query(
        "SELECT id, name, place_id FROM halal_restaurants WHERE place_id IS NOT NULL AND place_id != 'none' AND opening_hours IS NULL LIMIT 50"
      );
      const staleHours = await pool.query(
        "SELECT id, name, place_id FROM halal_restaurants WHERE place_id IS NOT NULL AND place_id != 'none' AND opening_hours IS NOT NULL AND (hours_last_updated IS NULL OR hours_last_updated < NOW() - INTERVAL '30 days') LIMIT 50"
      );
      const hoursToFetch = [...missingHours.rows, ...staleHours.rows];
      if (hoursToFetch.length > 0) {
        console.log(`[Halal Enrich] Fetching hours for ${hoursToFetch.length} restaurants (${missingHours.rows.length} missing, ${staleHours.rows.length} stale)`);
        const hApiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (hApiKey) {
          const dayMap: Record<number, string> = {0:"SUNDAY",1:"MONDAY",2:"TUESDAY",3:"WEDNESDAY",4:"THURSDAY",5:"FRIDAY",6:"SATURDAY"};
          for (const r of hoursToFetch) {
            try {
              const detailResp = await fetch(
                `https://places.googleapis.com/v1/places/${r.place_id}`,
                { headers: { "X-Goog-Api-Key": hApiKey, "X-Goog-FieldMask": "regularOpeningHours" } }
              );
              if (!detailResp.ok) {
                console.log(`[Halal Enrich] API error ${detailResp.status} for #${r.id} "${r.name}", will retry later`);
                continue;
              }
              const detailData = await detailResp.json();
              const roh = detailData.regularOpeningHours;
              if (roh && roh.periods) {
                const periods = roh.periods.map((p: any) => ({
                  open: { day: dayMap[p.open.day] || "MONDAY", time: [p.open.hour, p.open.minute] },
                  close: { day: dayMap[p.close.day] || "MONDAY", time: [p.close.hour, p.close.minute] },
                }));
                const hoursObj: any = { periods };
                if (roh.weekdayDescriptions) hoursObj.weekdayDescriptions = roh.weekdayDescriptions;
                await pool.query("UPDATE halal_restaurants SET opening_hours = $1::jsonb, hours_last_updated = NOW() WHERE id = $2", [JSON.stringify(hoursObj), r.id]);
                console.log(`[Halal Enrich] Hours updated for #${r.id} "${r.name}"`);
              } else {
                await pool.query("UPDATE halal_restaurants SET hours_last_updated = NOW() WHERE id = $1", [r.id]);
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch {}
          }
        }
      }

      const missingWebsites = await pool.query(
        "SELECT id, name, place_id FROM halal_restaurants WHERE place_id IS NOT NULL AND place_id != 'none' AND (website IS NULL OR website = '') LIMIT 300"
      );
      if (missingWebsites.rows.length > 0) {
        console.log(`[Halal Enrich] Backfilling websites for ${missingWebsites.rows.length} restaurants`);
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (apiKey) {
          for (const r of missingWebsites.rows) {
            try {
              const detailResp = await fetch(
                `https://places.googleapis.com/v1/places/${r.place_id}`,
                { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "websiteUri" } }
              );
              const detailData = await detailResp.json();
              if (detailData.websiteUri) {
                await pool.query("UPDATE halal_restaurants SET website = $1 WHERE id = $2", [detailData.websiteUri, r.id]);
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch {}
          }
        }
      }

      if (result.rows.length === 0 && missingPhotos.rows.length === 0 && missingWebsites.rows.length === 0) {
        console.log("[Halal Enrich] All halal restaurants fully enriched");
      } else {
        console.log("[Halal Enrich] Enrichment complete");
      }
    } catch (err: any) {
      console.error("[Halal Enrich] Error:", err.message);
    }
  }

  app.post("/api/admin/enrich-halal", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    dailyHalalEnrichment().catch(() => {});
    res.json({ message: "Halal enrichment started" });
  });

  app.post("/api/admin/businesses/:id/generate-description", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid business ID" });
    try {
      const desc = await enrichBusinessDescription(id);
      if (desc) {
        res.json({ description: desc });
      } else {
        res.status(404).json({ error: "Could not generate description — no website or Google data available for this business" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automated enrichment disabled to prevent excessive Google Places API costs.
  // Use admin endpoints /api/admin/enrich-halal and /api/admin/enrich-businesses to trigger manually.
  // setTimeout(() => dailyBusinessEnrichment(), 15000);
  // setTimeout(() => dailyHalalEnrichment(), 30000);
  // setInterval(() => dailyBusinessEnrichment(), 24 * 60 * 60 * 1000);
  // setInterval(() => dailyHalalEnrichment(), 24 * 60 * 60 * 1000);

  app.patch("/api/admin/businesses/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      const { status } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      const result = await pool.query(
        "UPDATE businesses SET status = $1 WHERE id = $2 RETURNING id, name, status",
        [status, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Business not found" });
      }
      if (status === "approved") {
        enrichBusinessWithPlaces(id).catch(() => {});
      }
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error updating business status:", error.message);
      res.status(500).json({ error: "Failed to update business" });
    }
  });

  app.put("/api/admin/businesses/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      const { name, category, subcategory, description, address, phone, website, google_url, filter_tags, photo_url, booking_url, affiliation, search_aliases, disable_enrichment, instagram_url, location_type, service_area_description } = req.body;
      const validCats = ["Food & Drink", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Services", "Events", "Creator"];
      if (category !== undefined && !validCats.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(String(name).substring(0, 255)); }
      if (category !== undefined) { fields.push(`category = $${idx++}`); values.push(category); }
      if (subcategory !== undefined) { fields.push(`subcategory = $${idx++}`); values.push(String(subcategory).substring(0, 255)); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(String(description).substring(0, 1000)); }
      if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(String(address).substring(0, 500)); }
      if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(String(phone).substring(0, 50)); }
      if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(String(website).substring(0, 500)); }
      if (google_url !== undefined) { fields.push(`google_url = $${idx++}`); values.push(String(google_url).substring(0, 500)); }
      if (filter_tags !== undefined) { fields.push(`filter_tags = $${idx++}`); values.push(Array.isArray(filter_tags) ? filter_tags : []); }
      if (photo_url !== undefined) { fields.push(`photo_url = $${idx++}`); values.push(String(photo_url).substring(0, 500)); }
      if (booking_url !== undefined) { fields.push(`booking_url = $${idx++}`); values.push(String(booking_url).substring(0, 500)); }
      if (affiliation !== undefined) { fields.push(`affiliation = $${idx++}`); values.push(String(affiliation).substring(0, 255)); }
      if (search_aliases !== undefined) { fields.push(`search_aliases = $${idx++}`); values.push(Array.isArray(search_aliases) ? search_aliases : []); }
      if (instagram_url !== undefined) { fields.push(`instagram_url = $${idx++}`); values.push(String(instagram_url).substring(0, 500)); }
      if (location_type !== undefined) {
        const validLT = ["physical", "service_area", "virtual", "popup"];
        fields.push(`location_type = $${idx++}`);
        values.push(validLT.includes(location_type) ? location_type : "physical");
      }
      if (service_area_description !== undefined) {
        const validSA = [
          "", "Triangle NC", "Bay Area CA", "Los Angeles CA", "DFW TX", "Houston TX",
          "Chicago IL", "NYC Metro", "DMV", "Detroit MI", "Atlanta GA", "Philadelphia PA",
          "Minneapolis MN", "San Diego CA", "Orlando FL", "Tampa FL", "Miami FL",
          "Phoenix AZ", "Seattle WA", "Denver CO", "Charlotte NC", "Columbus OH",
          "Nashville TN", "San Antonio TX", "Austin TX", "St. Louis MO", "Sacramento CA",
          "Boston MA", "Baltimore MD", "Indianapolis IN", "Las Vegas NV",
          "Nationwide / Remote", "Virtual",
        ];
        const saVal = String(service_area_description);
        if (saVal && !validSA.includes(saVal)) {
          return res.status(400).json({ error: "Invalid service area: " + saVal });
        }
        fields.push(`service_area_description = $${idx++}`);
        values.push(saVal);
      }
      if (disable_enrichment !== undefined) { fields.push(`place_id = $${idx++}`); values.push(disable_enrichment === true ? 'none' : null); }
      if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      values.push(id);
      const result = await pool.query(
        `UPDATE businesses SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Business not found" });
      }
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error updating business:", error.message);
      res.status(500).json({ error: "Failed to update business" });
    }
  });

  app.patch("/api/admin/businesses/:id/featured", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid business ID" });
      const { featured } = req.body;
      if (typeof featured !== "boolean") return res.status(400).json({ error: "featured must be a boolean" });
      const result = await pool.query(
        "UPDATE businesses SET featured = $1 WHERE id = $2 RETURNING id, name, featured",
        [featured, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Business not found" });
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error toggling featured:", error.message);
      res.status(500).json({ error: "Failed to toggle featured" });
    }
  });

  app.delete("/api/admin/businesses/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      const result = await pool.query(
        "DELETE FROM businesses WHERE id = $1 RETURNING id",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Business not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting business:", error.message);
      res.status(500).json({ error: "Failed to delete business" });
    }
  });

  const downloadHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "download.html"),
    "utf-8"
  );
  const notFoundHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "404.html"),
    "utf-8"
  );
  const adminHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "admin.html"),
    "utf-8"
  );
  const unifiedAdminHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "unified-admin.html"),
    "utf-8"
  );
  const privacyHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "privacy-policy.html"),
    "utf-8"
  );
  const supportHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "support.html"),
    "utf-8"
  );
  const communityHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "community.html"),
    "utf-8"
  );

  app.get("/community", (_req, res) => {
    const token = (global as any).__generateScrapeToken?.() || "";
    const html = communityHtml.replace("__SCRAPE_TOKEN__", token);
    res.type("html").send(html);
  });
  app.get("/events", (_req, res) => {
    res.redirect("/community#events");
  });
  app.get("/restaurants", (_req, res) => {
    res.redirect("/community#restaurants");
  });
  app.get("/directory", (_req, res) => {
    res.redirect("/community#directory");
  });

  app.get("/api/admin/events", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const statusFilter = req.query.status as string | undefined;
      const query = statusFilter
        ? "SELECT * FROM community_events WHERE status = $1 ORDER BY created_at DESC"
        : "SELECT * FROM community_events ORDER BY created_at DESC";
      const params = statusFilter ? [statusFilter] : [];
      const { rows } = await pool.query(query, params);
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["host"] || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;
      res.json(rows.map((r: any) => ({
        ...r,
        imageUrl: r.image_data ? `${baseUrl}/api/events/image/${r.id}` : null,
      })));
    } catch (error: any) {
      console.error("Error fetching admin events:", error.message);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.put("/api/admin/events/:eventId", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const eventId = req.params.eventId;
      const { title, description, location, start_time, end_time, organizer, image_url, registration_url, is_virtual, is_featured } = req.body;

      if (is_featured) {
        const { rows: existing } = await pool.query("SELECT is_featured FROM event_overrides WHERE event_id = $1", [eventId]);
        if (!existing.length || !existing[0].is_featured) {
          const { rows: featuredCount } = await pool.query(
            "SELECT COUNT(*) as cnt FROM community_events WHERE is_featured = true AND status = 'approved'"
          );
          const { rows: overrideFeatured } = await pool.query(
            "SELECT COUNT(*) as cnt FROM event_overrides WHERE is_featured = true AND event_id != $1", [eventId]
          );
          const totalFeatured = parseInt(featuredCount[0]?.cnt || "0") + parseInt(overrideFeatured[0]?.cnt || "0");
          if (totalFeatured >= 3) {
            return res.status(400).json({ error: "Maximum of 3 featured events allowed. Please unfeature an existing event first." });
          }
        }
      }

      const fields: string[] = ["event_id"];
      const values: any[] = [eventId];
      let idx = 2;
      const updates: string[] = [];
      if (title !== undefined) { fields.push("title"); values.push(title); updates.push(`title = $${idx++}`); }
      if (description !== undefined) { fields.push("description"); values.push(description); updates.push(`description = $${idx++}`); }
      if (location !== undefined) { fields.push("location"); values.push(location); updates.push(`location = $${idx++}`); }
      if (start_time !== undefined) { fields.push("start_time"); values.push(start_time); updates.push(`start_time = $${idx++}`); }
      if (end_time !== undefined) { fields.push("end_time"); values.push(end_time); updates.push(`end_time = $${idx++}`); }
      if (organizer !== undefined) { fields.push("organizer"); values.push(organizer); updates.push(`organizer = $${idx++}`); }
      if (image_url !== undefined) { fields.push("image_url"); values.push(image_url); updates.push(`image_url = $${idx++}`); }
      if (registration_url !== undefined) { fields.push("registration_url"); values.push(registration_url); updates.push(`registration_url = $${idx++}`); }
      if (is_virtual !== undefined) { fields.push("is_virtual"); values.push(!!is_virtual); updates.push(`is_virtual = $${idx++}`); }
      if (is_featured !== undefined) { fields.push("is_featured"); values.push(!!is_featured); updates.push(`is_featured = $${idx++}`); }
      updates.push(`updated_at = NOW()`);
      if (fields.length <= 1) return res.status(400).json({ error: "No fields to update" });
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(", ");
      const result = await pool.query(
        `INSERT INTO event_overrides (${fields.join(", ")}) VALUES (${placeholders})
         ON CONFLICT (event_id) DO UPDATE SET ${updates.join(", ")}
         RETURNING *`,
        values
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error saving event override:", error.message);
      res.status(500).json({ error: "Failed to save event override" });
    }
  });

  app.delete("/api/admin/events/:eventId", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const eventId = req.params.eventId;
      await pool.query("DELETE FROM event_overrides WHERE event_id = $1", [eventId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing event override:", error.message);
      res.status(500).json({ error: "Failed to remove override" });
    }
  });

  app.post("/api/admin/restaurants/lookup", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const { place_id } = req.body;
      if (!place_id || !place_id.trim()) return res.status(400).json({ error: "Place ID is required" });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured" });
      const detailResp = await fetch(
        `https://places.googleapis.com/v1/places/${place_id.trim()}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,location,rating,userRatingCount,photos,regularOpeningHours",
          },
        }
      );
      if (!detailResp.ok) {
        const errText = await detailResp.text();
        console.error("[Admin Lookup] Places API error:", errText);
        return res.status(400).json({ error: "Place not found. Check the Place ID." });
      }
      const place = await detailResp.json();
      const photoRef = place.photos?.[0]?.name || null;
      const hours = place.regularOpeningHours || null;
      let openingHours = null;
      if (hours && hours.periods) {
        openingHours = {
          periods: hours.periods.map((p: any) => ({
            open: { day: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][p.open?.day || 0], time: [p.open?.hour || 0, p.open?.minute || 0] },
            close: p.close ? { day: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][p.close?.day || 0], time: [p.close?.hour || 0, p.close?.minute || 0] } : { day: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][p.open?.day || 0], time: [23, 59] },
          })),
        };
      }
      res.json({
        name: place.displayName?.text || "",
        formatted_address: place.formattedAddress || "",
        formatted_phone: place.nationalPhoneNumber || "",
        website: place.websiteUri || "",
        url: place.googleMapsUri || "",
        lat: place.location?.latitude || null,
        lng: place.location?.longitude || null,
        rating: place.rating || null,
        user_ratings_total: place.userRatingCount || null,
        photo_reference: photoRef,
        opening_hours: openingHours,
        place_id: place_id.trim(),
      });
    } catch (error: any) {
      console.error("Error looking up place:", error.message);
      res.status(500).json({ error: "Failed to look up place" });
    }
  });

  app.post("/api/admin/restaurants/metro-import", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const { metro, lat, lng, cities = [], radius_meters = 40000 } = req.body;
      if (!metro || !lat || !lng) return res.status(400).json({ error: "metro, lat, lng required" });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured" });

      // Extract state abbreviation from metro name (e.g. "Bay Area CA" → "CA")
      const stateMatch = metro.match(/\b([A-Z]{2})$/);
      const stateAbbr = stateMatch ? stateMatch[1] : "";

      const keywords = ["halal restaurants", "zabiha halal", "halal food", "Muslim restaurant"];
      const fieldMask = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours";

      const seen = new Set<string>();
      const toInsert: any[] = [];

      async function searchPlaces(textQuery: string, bias?: { lat: number; lng: number; radius: number }) {
        let pageToken: string | undefined;
        let pageCount = 0;
        do {
          const body: any = { textQuery, maxResultCount: 20 };
          if (bias) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radius } };
          if (pageToken) body.pageToken = pageToken;
          const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
            body: JSON.stringify(body),
          });
          const data = await resp.json();
          pageToken = data.nextPageToken;
          pageCount++;
          for (const place of (data.places || [])) {
            if (!place.id || seen.has(place.id)) continue;
            seen.add(place.id);
            toInsert.push(place);
          }
          if (pageToken && pageCount < 2) await new Promise(r => setTimeout(r, 800));
          else break;
        } while (pageToken);
        await new Promise(r => setTimeout(r, 400));
      }

      // Search metro-wide (with location bias)
      for (const kw of keywords) {
        await searchPlaces(`${kw} in ${metro}`, { lat, lng, radius: radius_meters });
      }

      // Search each sub-city by name
      const cityList: string[] = Array.isArray(cities) ? cities : [];
      for (const city of cityList) {
        const cityQuery = stateAbbr ? `${city}, ${stateAbbr}` : city;
        for (const kw of keywords) {
          await searchPlaces(`${kw} in ${cityQuery}`, { lat, lng, radius: radius_meters });
        }
      }

      let inserted = 0;
      let skipped = 0;
      for (const place of toInsert) {
        const existing = await pool.query("SELECT id FROM halal_restaurants WHERE place_id = $1 OR LOWER(name) = LOWER($2)", [place.id, place.displayName?.text || ""]);
        if (existing.rows.length > 0) { skipped++; continue; }

        const photoRef = place.photos?.[0]?.name || null;
        const hours = place.regularOpeningHours;
        let openingHours = null;
        if (hours?.periods) {
          const days = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
          openingHours = { periods: hours.periods.map((p: any) => ({
            open: { day: days[p.open?.day || 0], time: [p.open?.hour || 0, p.open?.minute || 0] },
            close: p.close ? { day: days[p.close.day || 0], time: [p.close.hour || 0, p.close.minute || 0] } : { day: days[p.open?.day || 0], time: [23, 59] },
          })) };
        }

        await pool.query(
          `INSERT INTO halal_restaurants (name, formatted_address, formatted_phone, is_halal, website, url, lat, lng, place_id, rating, user_ratings_total, photo_reference, opening_hours, hours_last_updated)
           VALUES ($1,$2,$3,'UNKNOWN',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            place.displayName?.text || "",
            place.formattedAddress || null,
            place.nationalPhoneNumber || null,
            place.websiteUri || null,
            place.googleMapsUri || null,
            place.location?.latitude || null,
            place.location?.longitude || null,
            place.id,
            place.rating || null,
            place.userRatingCount || null,
            photoRef,
            openingHours ? JSON.stringify(openingHours) : null,
            photoRef ? new Date() : null,
          ]
        );
        inserted++;
      }

      console.log(`[Metro Import] ${metro}: searched metro + ${cityList.length} cities, inserted ${inserted}, skipped ${skipped} (${toInsert.length} found total)`);
      res.json({ metro, cities_searched: cityList.length, found: toInsert.length, inserted, skipped });
    } catch (error: any) {
      console.error("Metro import error:", error.message);
      res.status(500).json({ error: "Failed to import metro restaurants" });
    }
  });

  app.post("/api/admin/restaurants", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const { name, formatted_address, formatted_phone, is_halal, halal_comment, cuisine_types, emoji, website, instagram_url, lat, lng, place_id, rating, user_ratings_total, photo_reference, opening_hours, url } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
      const result = await pool.query(
        `INSERT INTO halal_restaurants (name, formatted_address, formatted_phone, is_halal, halal_comment, cuisine_types, emoji, website, instagram_url, lat, lng, place_id, rating, user_ratings_total, photo_reference, opening_hours, url, hours_last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id, name`,
        [
          name.trim(),
          formatted_address || null,
          formatted_phone || null,
          is_halal || "IS_HALAL",
          halal_comment || null,
          cuisine_types && cuisine_types.length ? cuisine_types : null,
          emoji || null,
          website || null,
          instagram_url || null,
          lat || null,
          lng || null,
          place_id || null,
          rating || null,
          user_ratings_total || null,
          photo_reference || null,
          opening_hours ? JSON.stringify(opening_hours) : null,
          url || null,
          place_id ? new Date() : null,
        ]
      );
      console.log(`[Admin] Restaurant added: ${result.rows[0].name} (ID ${result.rows[0].id})`);
      enrichHalalRestaurantWithPlaces(result.rows[0].id).catch(() => {});
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error adding restaurant:", error.message);
      res.status(500).json({ error: "Failed to add restaurant" });
    }
  });

  app.get("/api/admin/restaurants", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const search = req.query.search as string | undefined;
      let query = "SELECT id, name, formatted_address, opening_hours, is_halal, instagram_url FROM halal_restaurants";
      const params: any[] = [];
      if (search && search.trim()) {
        params.push(`%${search.trim()}%`);
        query += ` WHERE (name ILIKE $1 OR formatted_address ILIKE $1)`;
      }
      query += " ORDER BY name";
      const result = await pool.query(query, params);

      const { rows: overrides } = await pool.query("SELECT restaurant_id, override_periods FROM restaurant_overrides");
      const overrideMap = new Map(overrides.map((o: any) => [o.restaurant_id, o.override_periods]));

      const enriched = result.rows.map((r: any) => {
        const op = overrideMap.get(r.id);
        if (op) {
          let hours = r.opening_hours;
          if (typeof hours === "string") try { hours = JSON.parse(hours); } catch { hours = {}; }
          if (!hours) hours = {};
          hours.periods = op;
          r.opening_hours = hours;
        }
        return { ...r, hasOverride: overrideMap.has(r.id) };
      });
      res.json(enriched);
    } catch (error: any) {
      console.error("Error fetching admin restaurants:", error.message);
      res.status(500).json({ error: "Failed to fetch restaurants" });
    }
  });

  app.put("/api/admin/restaurants/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) return res.status(400).json({ error: "Invalid restaurant ID" });
      const { periods } = req.body;
      if (!periods || !Array.isArray(periods)) return res.status(400).json({ error: "periods must be an array" });
      const result = await pool.query(
        `INSERT INTO restaurant_overrides (restaurant_id, override_periods) VALUES ($1, $2)
         ON CONFLICT (restaurant_id) DO UPDATE SET override_periods = $2, updated_at = NOW()
         RETURNING *`,
        [restaurantId, JSON.stringify(periods)]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error saving restaurant override:", error.message);
      res.status(500).json({ error: "Failed to save restaurant override" });
    }
  });

  app.patch("/api/admin/restaurants/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) return res.status(400).json({ error: "Invalid restaurant ID" });
      const { instagram_url } = req.body;
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (instagram_url !== undefined) { fields.push(`instagram_url = $${idx++}`); values.push(String(instagram_url).substring(0, 500)); }
      if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
      values.push(restaurantId);
      await pool.query(`UPDATE halal_restaurants SET ${fields.join(", ")} WHERE id = $${idx}`, values);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating restaurant:", error.message);
      res.status(500).json({ error: "Failed to update restaurant" });
    }
  });

  app.delete("/api/admin/restaurants/:id", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) return res.status(400).json({ error: "Invalid restaurant ID" });
      await pool.query("DELETE FROM restaurant_overrides WHERE restaurant_id = $1", [restaurantId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing restaurant override:", error.message);
      res.status(500).json({ error: "Failed to remove override" });
    }
  });

  app.get("/api/admin/analytics/summary", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const from = req.query.from as string || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const to = req.query.to as string || new Date().toISOString().slice(0, 10);
      const result = await pool.query(
        `SELECT event_name, COUNT(*)::int as count, COUNT(DISTINCT device_id)::int as unique_devices
         FROM analytics_events WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
         GROUP BY event_name ORDER BY count DESC`,
        [from, to]
      );
      const totals = await pool.query(
        `SELECT COUNT(*)::int as total_events, COUNT(DISTINCT device_id)::int as unique_devices
         FROM analytics_events WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
        [from, to]
      );
      res.json({ summary: result.rows, totals: totals.rows[0], from, to });
    } catch (error: any) {
      console.error("[Analytics] Summary error:", error.message);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/admin/analytics/dau", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const result = await pool.query(
        `SELECT d::date as date,
                COUNT(DISTINCT ae.device_id)::int as unique_devices,
                COUNT(DISTINCT ae.user_id) FILTER (WHERE ae.user_id IS NOT NULL)::int as signed_in_users
         FROM generate_series(CURRENT_DATE - ($1 || ' days')::interval, CURRENT_DATE, '1 day') d
         LEFT JOIN analytics_events ae
           ON ae.created_at >= d AND ae.created_at < d + interval '1 day'
         GROUP BY d ORDER BY d`,
        [days]
      );
      const today = result.rows.find((r: any) => r.date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10));
      const yesterday = result.rows.find((r: any) => {
        const yd = new Date(); yd.setDate(yd.getDate() - 1);
        return r.date.toISOString().slice(0, 10) === yd.toISOString().slice(0, 10);
      });
      const last7 = result.rows.slice(-7);
      const avg7 = last7.length > 0 ? Math.round(last7.reduce((s: number, r: any) => s + r.unique_devices, 0) / last7.length) : 0;
      res.json({
        daily: result.rows.map((r: any) => ({ date: r.date.toISOString().slice(0, 10), unique_devices: r.unique_devices, signed_in_users: r.signed_in_users })),
        today: today?.unique_devices || 0,
        yesterday: yesterday?.unique_devices || 0,
        avg_7d: avg7,
      });
    } catch (error: any) {
      console.error("[Analytics] DAU error:", error.message);
      res.status(500).json({ error: "Failed to fetch DAU" });
    }
  });

  app.get("/api/admin/analytics/daily", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const eventName = req.query.event as string || "screen_view";
      const from = req.query.from as string || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = req.query.to as string || new Date().toISOString().slice(0, 10);
      const result = await pool.query(
        `SELECT created_at::date as date, COUNT(*)::int as count, COUNT(DISTINCT device_id)::int as unique_devices
         FROM analytics_events WHERE event_name = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
         GROUP BY created_at::date ORDER BY date`,
        [eventName, from, to]
      );
      res.json({ daily: result.rows, event: eventName, from, to });
    } catch (error: any) {
      console.error("[Analytics] Daily error:", error.message);
      res.status(500).json({ error: "Failed to fetch daily analytics" });
    }
  });

  app.get("/api/admin/analytics/top", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const from = req.query.from as string || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const to = req.query.to as string || new Date().toISOString().slice(0, 10);
      const dateClause = "created_at >= $1::date AND created_at < ($2::date + interval '1 day')";
      const dateParams = [from, to];

      const topRestaurants = await pool.query(
        `SELECT event_data->>'name' as name, COUNT(*)::int as views
         FROM analytics_events WHERE event_name = 'restaurant_viewed' AND ${dateClause}
         AND event_data->>'name' IS NOT NULL
         GROUP BY event_data->>'name' ORDER BY views DESC LIMIT 10`,
        dateParams
      );
      const topEvents = await pool.query(
        `SELECT event_data->>'title' as title, COUNT(*)::int as clicks
         FROM analytics_events WHERE event_name = 'event_viewed' AND ${dateClause}
         AND event_data->>'title' IS NOT NULL
         GROUP BY event_data->>'title' ORDER BY clicks DESC LIMIT 10`,
        dateParams
      );
      const topSearches = await pool.query(
        `SELECT event_data->>'query' as query, COUNT(*)::int as searches
         FROM analytics_events WHERE event_name = 'search' AND ${dateClause}
         AND event_data->>'query' IS NOT NULL
         GROUP BY event_data->>'query' ORDER BY searches DESC LIMIT 10`,
        dateParams
      );
      const prayerStats = await pool.query(
        `SELECT event_data->>'prayer' as prayer, COUNT(*)::int as tracks
         FROM analytics_events WHERE event_name = 'prayer_tracked' AND ${dateClause}
         AND event_data->>'prayer' IS NOT NULL
         GROUP BY event_data->>'prayer' ORDER BY tracks DESC`,
        dateParams
      );
      const screenViews = await pool.query(
        `SELECT event_data->>'screen' as screen, COUNT(*)::int as views
         FROM analytics_events WHERE event_name = 'screen_view' AND ${dateClause}
         AND event_data->>'screen' IS NOT NULL
         GROUP BY event_data->>'screen' ORDER BY views DESC`,
        dateParams
      );
      const featureAdoption = await pool.query(
        `SELECT event_name, COUNT(DISTINCT device_id)::int as devices
         FROM analytics_events WHERE event_name IN ('masjid_selected', 'notifications_enabled', 'theme_changed', 'calc_method_changed')
         AND ${dateClause} GROUP BY event_name`,
        dateParams
      );

      res.json({
        topRestaurants: topRestaurants.rows,
        topEvents: topEvents.rows,
        topSearches: topSearches.rows,
        prayerStats: prayerStats.rows,
        screenViews: screenViews.rows,
        featureAdoption: featureAdoption.rows,
        from, to,
      });
    } catch (error: any) {
      console.error("[Analytics] Top error:", error.message);
      res.status(500).json({ error: "Failed to fetch top analytics" });
    }
  });

  app.get("/api/admin/analytics/community", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const users = await pool.query("SELECT COUNT(*)::int as count FROM user_accounts WHERE apple_id NOT LIKE 'test_%'");
      const restaurantRatings = await pool.query("SELECT COUNT(*)::int as count FROM user_ratings WHERE entity_type = 'restaurant'");
      const businessRatings = await pool.query("SELECT COUNT(*)::int as count FROM user_ratings WHERE entity_type = 'business'");
      const pendingSubmissions = await pool.query("SELECT COUNT(*)::int as count FROM restaurant_submissions WHERE status = 'pending'");
      const approvedSubmissions = await pool.query("SELECT COUNT(*)::int as count FROM restaurant_submissions WHERE status = 'approved'");
      const verificationVotes = await pool.query("SELECT COUNT(*)::int as count FROM halal_verification_votes");
      res.json({
        totalUsers: users.rows[0].count,
        restaurantRatings: restaurantRatings.rows[0].count,
        businessRatings: businessRatings.rows[0].count,
        pendingSubmissions: pendingSubmissions.rows[0].count,
        approvedSubmissions: approvedSubmissions.rows[0].count,
        verificationVotes: verificationVotes.rows[0].count,
      });
    } catch (error: any) {
      console.error("[Analytics] Community stats error:", error.message);
      res.status(500).json({ error: "Failed to fetch community stats" });
    }
  });

  app.get("/api/admin/analytics/users", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const excludeDemo = req.query.excludeDemo === "true";
      const demoDeviceIds = (req.query.demoDevices as string || "").split(",").filter(Boolean);

      let excludeClause = "";
      const params: any[] = [];

      if (excludeDemo && demoDeviceIds.length > 0) {
        const placeholders = demoDeviceIds.map((_, i) => `$${i + 1}`).join(",");
        excludeClause = `AND ae.device_id NOT IN (${placeholders})`;
        params.push(...demoDeviceIds);
      }

      const userStats = await pool.query(`
        WITH prayer_data AS (
          SELECT 
            COALESCE(ae.user_id, ua.id) as uid,
            COUNT(*) FILTER (WHERE ae.event_name = 'prayer_tracked' AND (ae.event_data->>'status')::int > 0) as prayers_tracked,
            COUNT(*) FILTER (WHERE ae.event_name = 'makeup_fast_logged') as fasts_made_up,
            COUNT(DISTINCT ae.device_id) as device_count,
            MAX(ae.created_at) as last_active
          FROM analytics_events ae
          LEFT JOIN user_accounts ua ON ae.user_id = ua.id
          WHERE ae.event_name IN ('prayer_tracked', 'makeup_fast_logged')
          ${excludeClause}
          GROUP BY COALESCE(ae.user_id, ua.id)
        ),
        device_users AS (
          SELECT 
            ae.device_id,
            COUNT(*) FILTER (WHERE ae.event_name = 'prayer_tracked' AND (ae.event_data->>'status')::int > 0) as prayers_tracked,
            COUNT(*) FILTER (WHERE ae.event_name = 'makeup_fast_logged') as fasts_made_up,
            MAX(ae.created_at) as last_active
          FROM analytics_events ae
          WHERE ae.event_name IN ('prayer_tracked', 'makeup_fast_logged')
          AND ae.user_id IS NULL
          ${excludeClause}
          GROUP BY ae.device_id
        )
        SELECT 
          ua.id as user_id,
          ua.display_name,
          ua.email,
          ua.created_at as joined,
          COALESCE(pd.prayers_tracked, 0)::int as prayers_tracked,
          COALESCE(pd.fasts_made_up, 0)::int as fasts_made_up,
          pd.last_active
        FROM user_accounts ua
        LEFT JOIN prayer_data pd ON pd.uid = ua.id
        WHERE ua.apple_id NOT LIKE 'test_%'
        ORDER BY COALESCE(pd.prayers_tracked, 0) DESC, ua.created_at DESC
      `, params);

      const anonymousDevices = await pool.query(`
        SELECT 
          ae.device_id,
          COUNT(*) FILTER (WHERE ae.event_name = 'prayer_tracked' AND (ae.event_data->>'status')::int > 0)::int as prayers_tracked,
          COUNT(*) FILTER (WHERE ae.event_name = 'makeup_fast_logged')::int as fasts_made_up,
          MAX(ae.created_at) as last_active
        FROM analytics_events ae
        WHERE ae.event_name IN ('prayer_tracked', 'makeup_fast_logged')
        AND ae.user_id IS NULL
        ${excludeClause}
        GROUP BY ae.device_id
        HAVING COUNT(*) FILTER (WHERE ae.event_name = 'prayer_tracked' AND (ae.event_data->>'status')::int > 0) > 0
           OR COUNT(*) FILTER (WHERE ae.event_name = 'makeup_fast_logged') > 0
        ORDER BY prayers_tracked DESC
      `, params);

      res.json({
        users: userStats.rows,
        anonymousDevices: anonymousDevices.rows,
      });
    } catch (error: any) {
      console.error("[Analytics] Users stats error:", error.message);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  app.get("/app", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(downloadHtml);
  });

  app.get("/download", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(downloadHtml);
  });

  app.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(unifiedAdminHtml);
  });

  // Legacy full admin panel — accessible from super admin dashboard
  app.get("/admin-full", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(adminHtml);
  });

  app.get("/privacy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(privacyHtml);
  });

  app.get("/support", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(supportHtml);
  });

  const crypto = await import("crypto");
  async function getSessionUserId(token: string): Promise<number | null> {
    try {
      const result = await pool.query("SELECT user_id FROM user_sessions WHERE token = $1", [token]);
      return result.rows.length > 0 ? result.rows[0].user_id : null;
    } catch {
      return null;
    }
  }

  app.post("/api/auth/apple", async (req, res) => {
    try {
      const { identityToken, appleId, email, displayName } = req.body;

      if (!identityToken || typeof identityToken !== "string") {
        return res.status(400).json({ error: "Identity token is required" });
      }

      let verifiedSubject: string;
      try {
        const { createRemoteJWKSet, jwtVerify, decodeJwt } = await import("jose");
        const unverified = decodeJwt(identityToken);
        const tokenAud = typeof unverified.aud === "string" ? unverified.aud : Array.isArray(unverified.aud) ? unverified.aud[0] : "";
        const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
        const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: "https://appleid.apple.com",
          audience: tokenAud,
          clockTolerance: 30,
        });
        if (!payload.sub) {
          return res.status(401).json({ error: "Invalid identity token: missing subject" });
        }
        verifiedSubject = payload.sub;
      } catch (verifyErr: any) {
        console.error("[Auth] Apple token verification failed:", verifyErr.message);
        return res.status(401).json({ error: "Invalid or expired identity token" });
      }

      const existing = await pool.query("SELECT id, email, display_name FROM user_accounts WHERE apple_id = $1", [verifiedSubject]);
      let userId: number;
      let userEmail = email || null;
      let userName = displayName || null;

      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        userEmail = existing.rows[0].email || userEmail;
        userName = existing.rows[0].display_name || userName;
        if (email || displayName) {
          await pool.query(
            "UPDATE user_accounts SET email = COALESCE($1, email), display_name = COALESCE($2, display_name) WHERE id = $3",
            [email || null, displayName || null, userId]
          );
        }
      } else {
        const result = await pool.query(
          "INSERT INTO user_accounts (apple_id, email, display_name) VALUES ($1, $2, $3) RETURNING id",
          [verifiedSubject, userEmail, userName]
        );
        userId = result.rows[0].id;
      }

      const sessionToken = crypto.randomBytes(32).toString("hex");
      await pool.query("INSERT INTO user_sessions (token, user_id) VALUES ($1, $2)", [sessionToken, userId]);

      res.json({ token: sessionToken, user: { id: userId, email: userEmail, displayName: userName } });
    } catch (error: any) {
      console.error("[Auth] Apple sign-in error:", error.message);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  if (process.env.NODE_ENV === "development") {
    app.post("/api/auth/dev-signin", async (req, res) => {
      try {
        const existing = await pool.query("SELECT id, email, display_name FROM user_accounts ORDER BY id LIMIT 1");
        let userId: number;
        let userEmail: string | null;
        let userName: string | null;

        if (existing.rows.length > 0) {
          userId = existing.rows[0].id;
          userEmail = existing.rows[0].email;
          userName = existing.rows[0].display_name;
        } else {
          const result = await pool.query(
            "INSERT INTO user_accounts (apple_id, email, display_name) VALUES ($1, $2, $3) RETURNING id",
            ["dev-user-" + Date.now(), "dev@test.com", "Dev User"]
          );
          userId = result.rows[0].id;
          userEmail = "dev@test.com";
          userName = "Dev User";
        }

        const crypto = await import("crypto");
        const sessionToken = crypto.randomBytes(32).toString("hex");
        await pool.query("INSERT INTO user_sessions (token, user_id) VALUES ($1, $2)", [sessionToken, userId]);

        res.json({ token: sessionToken, user: { id: userId, email: userEmail, displayName: userName } });
      } catch (error: any) {
        console.error("[Auth] Dev sign-in error:", error.message);
        res.status(500).json({ error: "Dev sign-in failed" });
      }
    });
  }

  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Not authenticated" });
      const token = authHeader.replace("Bearer ", "");
      const userId = await getSessionUserId(token);
      if (!userId) return res.status(401).json({ error: "Invalid session" });

      const result = await pool.query("SELECT id, email, display_name FROM user_accounts WHERE id = $1", [userId]);
      if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });

      const user = result.rows[0];
      res.json({ id: user.id, email: user.email, displayName: user.display_name });
    } catch (error: any) {
      console.error("[Auth] Session check error:", error.message);
      res.status(500).json({ error: "Failed to verify session" });
    }
  });

  app.post("/api/auth/signout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        await pool.query("DELETE FROM user_sessions WHERE token = $1", [token]);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Auth] Sign-out error:", error.message);
      res.json({ success: true });
    }
  });

  async function getUserIdFromRequest(req: any): Promise<number | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    return await getSessionUserId(token);
  }

  app.get("/api/saved-events", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.json({ savedEventIds: [] });
      const { rows } = await pool.query("SELECT event_id FROM saved_events WHERE user_id = $1", [userId]);
      res.json({ savedEventIds: rows.map((r: any) => r.event_id) });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get saved events" });
    }
  });

  app.post("/api/saved-events", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ error: "eventId is required" });
      await pool.query(
        "INSERT INTO saved_events (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING",
        [userId, eventId]
      );
      res.json({ saved: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save event" });
    }
  });

  app.delete("/api/saved-events/:eventId", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });
      const { eventId } = req.params;
      await pool.query("DELETE FROM saved_events WHERE user_id = $1 AND event_id = $2", [userId, eventId]);
      res.json({ saved: false });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to unsave event" });
    }
  });

  app.get("/api/organizer-follows", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.json({ follows: [] });
      const { rows } = await pool.query("SELECT organizer_name FROM organizer_follows WHERE user_id = $1", [userId]);
      res.json({ follows: rows.map((r: any) => r.organizer_name) });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch follows" });
    }
  });

  app.get("/api/organizer-follows/:organizer/count", async (req, res) => {
    try {
      const organizer = decodeURIComponent(req.params.organizer);
      const { rows } = await pool.query(
        "SELECT COUNT(*) as count FROM organizer_follows WHERE organizer_name = $1",
        [organizer]
      );
      res.json({ organizer, count: parseInt(rows[0].count) });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get follower count" });
    }
  });

  app.post("/api/organizer-follows", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });
      const { organizer } = req.body;
      if (!organizer || typeof organizer !== "string") return res.status(400).json({ error: "Organizer name required" });
      await pool.query(
        "INSERT INTO organizer_follows (user_id, organizer_name) VALUES ($1, $2) ON CONFLICT (user_id, organizer_name) DO NOTHING",
        [userId, organizer.trim()]
      );
      res.json({ following: true, organizer: organizer.trim() });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to follow organizer" });
    }
  });

  app.delete("/api/organizer-follows/:organizer", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });
      const organizer = decodeURIComponent(req.params.organizer);
      await pool.query("DELETE FROM organizer_follows WHERE user_id = $1 AND organizer_name = $2", [userId, organizer]);
      res.json({ following: false, organizer });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to unfollow organizer" });
    }
  });

  app.post("/api/ratings", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });

      const { entityType, entityId, rating } = req.body;
      if (!entityType || !entityId || !rating) {
        return res.status(400).json({ error: "entityType, entityId, and rating are required" });
      }
      if (!["restaurant", "business"].includes(entityType)) {
        return res.status(400).json({ error: "entityType must be 'restaurant' or 'business'" });
      }
      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }

      await pool.query(
        `INSERT INTO user_ratings (user_id, entity_type, entity_id, rating) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET rating = $4, created_at = NOW()`,
        [userId, entityType, parseInt(entityId), ratingNum]
      );

      const avgResult = await pool.query(
        "SELECT AVG(rating)::NUMERIC(3,2) as avg_rating, COUNT(*) as count FROM user_ratings WHERE entity_type = $1 AND entity_id = $2",
        [entityType, parseInt(entityId)]
      );

      res.json({
        success: true,
        avgRating: parseFloat(avgResult.rows[0].avg_rating),
        totalRatings: parseInt(avgResult.rows[0].count),
      });
    } catch (error: any) {
      console.error("[Ratings] Error:", error.message);
      res.status(500).json({ error: "Failed to submit rating" });
    }
  });

  app.get("/api/ratings/:entityType/:entityId", async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const userId = await getUserIdFromRequest(req);

      const avgResult = await pool.query(
        "SELECT AVG(rating)::NUMERIC(3,2) as avg_rating, COUNT(*) as count FROM user_ratings WHERE entity_type = $1 AND entity_id = $2",
        [entityType, parseInt(entityId)]
      );

      let userRating = null;
      if (userId) {
        const userResult = await pool.query(
          "SELECT rating FROM user_ratings WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3",
          [userId, entityType, parseInt(entityId)]
        );
        if (userResult.rows.length > 0) {
          userRating = userResult.rows[0].rating;
        }
      }

      res.json({
        avgRating: avgResult.rows[0].avg_rating ? parseFloat(avgResult.rows[0].avg_rating) : null,
        totalRatings: parseInt(avgResult.rows[0].count),
        userRating,
      });
    } catch (error: any) {
      console.error("[Ratings] Fetch error:", error.message);
      res.status(500).json({ error: "Failed to fetch ratings" });
    }
  });

  app.post("/api/checkins", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });

      const { restaurantId, comment, halalStatus } = req.body;
      if (!restaurantId) {
        return res.status(400).json({ error: "restaurantId is required" });
      }

      const validStatuses = ["IS_HALAL", "PARTIALLY_HALAL", "NOT_HALAL"];
      const status = validStatuses.includes(halalStatus) ? halalStatus : null;

      await pool.query(
        "INSERT INTO halal_checkins (user_id, restaurant_id, comment, halal_status) VALUES ($1, $2, $3, $4)",
        [userId, parseInt(restaurantId), comment || null, status]
      );

      const latestResult = await pool.query(
        "SELECT created_at FROM halal_checkins WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 1",
        [parseInt(restaurantId)]
      );
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM halal_checkins WHERE restaurant_id = $1",
        [parseInt(restaurantId)]
      );

      res.json({
        success: true,
        lastCheckin: latestResult.rows[0]?.created_at,
        totalCheckins: parseInt(countResult.rows[0].count),
      });
    } catch (error: any) {
      console.error("[Checkins] Error:", error.message);
      res.status(500).json({ error: "Failed to submit check-in" });
    }
  });

  app.get("/api/checkins/:restaurantId", async (req, res) => {
    try {
      const restaurantId = parseInt(req.params.restaurantId);
      const latestResult = await pool.query(
        "SELECT hc.created_at, hc.comment, hc.halal_status, ua.display_name FROM halal_checkins hc JOIN user_accounts ua ON hc.user_id = ua.id WHERE hc.restaurant_id = $1 ORDER BY hc.created_at DESC LIMIT 5",
        [restaurantId]
      );
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM halal_checkins WHERE restaurant_id = $1",
        [restaurantId]
      );

      const statusCounts = await pool.query(
        "SELECT halal_status, COUNT(*) as count FROM halal_checkins WHERE restaurant_id = $1 AND halal_status IS NOT NULL GROUP BY halal_status ORDER BY count DESC",
        [restaurantId]
      );

      res.json({
        checkins: latestResult.rows.map((r: any) => ({
          date: r.created_at,
          comment: r.comment,
          displayName: r.display_name,
          halalStatus: r.halal_status,
        })),
        totalCheckins: parseInt(countResult.rows[0].count),
        lastCheckin: latestResult.rows[0]?.created_at || null,
        statusCounts: statusCounts.rows.map((r: any) => ({ status: r.halal_status, count: parseInt(r.count) })),
      });
    } catch (error: any) {
      console.error("[Checkins] Fetch error:", error.message);
      res.status(500).json({ error: "Failed to fetch check-ins" });
    }
  });

  app.post("/api/restaurant-submissions", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });

      const { googleMapsUrl, name, address, placeId, lat, lng } = req.body;
      if (!googleMapsUrl) {
        return res.status(400).json({ error: "Google Maps URL is required" });
      }

      const existing = await pool.query(
        "SELECT id FROM restaurant_submissions WHERE google_maps_url = $1 AND status = 'pending'",
        [googleMapsUrl]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "This restaurant has already been submitted and is awaiting verification" });
      }

      let resolvedName = name || null;
      let resolvedAddress = address || null;
      let resolvedPlaceId = placeId || null;
      let resolvedLat = lat || null;
      let resolvedLng = lng || null;

      if (!resolvedName) {
        try {
          const apiKey = process.env.GOOGLE_PLACES_API_KEY;
          if (apiKey) {
            let resolvedUrl = googleMapsUrl;
            if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(resolvedUrl)) {
              try {
                const redirectResp = await fetch(resolvedUrl, { method: "HEAD", redirect: "follow" });
                if (redirectResp.url) resolvedUrl = redirectResp.url;
              } catch {}
            }
            let searchQuery = "";
            try {
              const parsed = new URL(resolvedUrl);
              const pathMatch = parsed.pathname.match(/\/maps\/place\/([^/@]+)/);
              if (pathMatch) searchQuery = decodeURIComponent(pathMatch[1].replace(/\+/g, " "));
              if (!searchQuery) {
                const qParam = parsed.searchParams.get("q") || parsed.searchParams.get("query") || "";
                if (qParam) searchQuery = qParam;
              }
            } catch {}
            if (searchQuery) {
              const searchResp = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.id,places.location" },
                body: JSON.stringify({ textQuery: searchQuery }),
              });
              const searchData = await searchResp.json();
              const place = searchData.places?.[0];
              if (place) {
                resolvedName = place.displayName?.text || null;
                if (!resolvedAddress) resolvedAddress = place.formattedAddress || null;
                if (!resolvedPlaceId) resolvedPlaceId = place.id || null;
                if (!resolvedLat && place.location) resolvedLat = place.location.latitude;
                if (!resolvedLng && place.location) resolvedLng = place.location.longitude;
              }
            }
          }
        } catch {}
      }

      const result = await pool.query(
        `INSERT INTO restaurant_submissions (user_id, google_maps_url, name, address, place_id, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, googleMapsUrl, resolvedName, resolvedAddress, resolvedPlaceId, resolvedLat, resolvedLng]
      );

      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (error: any) {
      console.error("[Restaurant Submissions] Error:", error.message);
      res.status(500).json({ error: "Failed to submit restaurant" });
    }
  });

  app.get("/api/restaurant-submissions/pending", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      const submissions = await pool.query(
        `SELECT rs.*, 
          (SELECT COUNT(*) FROM halal_verification_votes WHERE submission_id = rs.id) as vote_count,
          CASE WHEN $1::int IS NOT NULL THEN (SELECT halal_status FROM halal_verification_votes WHERE submission_id = rs.id AND user_id = $1) ELSE NULL END as user_vote
         FROM restaurant_submissions rs WHERE rs.status = 'pending' ORDER BY rs.created_at DESC`,
        [userId || null]
      );
      res.json(submissions.rows);
    } catch (error: any) {
      console.error("[Restaurant Submissions] Fetch error:", error.message);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.post("/api/restaurant-submissions/:id/vote", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });

      const submissionId = parseInt(req.params.id);
      const { halalStatus, description } = req.body;
      if (!halalStatus || !["halal", "partial", "not_halal"].includes(halalStatus)) {
        return res.status(400).json({ error: "halalStatus must be 'halal', 'partial', or 'not_halal'" });
      }

      await pool.query(
        `INSERT INTO halal_verification_votes (user_id, submission_id, halal_status, description)
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, submission_id) DO UPDATE SET halal_status = $3, description = $4`,
        [userId, submissionId, halalStatus, description || null]
      );

      const votes = await pool.query(
        "SELECT halal_status, COUNT(*) as cnt FROM halal_verification_votes WHERE submission_id = $1 GROUP BY halal_status",
        [submissionId]
      );

      let autoApproved = false;
      for (const v of votes.rows) {
        if (parseInt(v.cnt) >= 3) {
          const submission = await pool.query("SELECT * FROM restaurant_submissions WHERE id = $1", [submissionId]);
          if (submission.rows.length > 0) {
            const sub = submission.rows[0];
            const halalMap: Record<string, string> = { halal: "IS_HALAL", partial: "PARTIALLY_HALAL", not_halal: "NOT_HALAL" };
            const isHalal = halalMap[v.halal_status] || "UNKNOWN";
            await pool.query(
              `INSERT INTO halal_restaurants (name, formatted_address, url, lat, lng, is_halal, place_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [sub.name || "Community Submitted", sub.address, sub.google_maps_url, sub.lat, sub.lng, isHalal, sub.place_id]
            );
            await pool.query("UPDATE restaurant_submissions SET status = 'approved' WHERE id = $1", [submissionId]);
            autoApproved = true;
          }
          break;
        }
      }

      res.json({
        success: true,
        autoApproved,
        votes: votes.rows.map((v: any) => ({ status: v.halal_status, count: parseInt(v.cnt) })),
      });
    } catch (error: any) {
      console.error("[Verification Vote] Error:", error.message);
      res.status(500).json({ error: "Failed to submit vote" });
    }
  });

  app.get("/api/admin/restaurant-submissions", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const status = (req.query.status as string) || "pending";
      const submissions = await pool.query(
        `SELECT rs.*,
          (SELECT COUNT(*) FROM halal_verification_votes WHERE submission_id = rs.id) as vote_count
         FROM restaurant_submissions rs WHERE rs.status = $1 ORDER BY rs.created_at DESC`,
        [status]
      );
      res.json(submissions.rows);
    } catch (error: any) {
      console.error("[Admin Restaurant Submissions] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.post("/api/admin/restaurant-submissions/:id/approve", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const submissionId = parseInt(req.params.id);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid ID" });

      const sub = await pool.query("SELECT * FROM restaurant_submissions WHERE id = $1", [submissionId]);
      if (sub.rows.length === 0) return res.status(404).json({ error: "Submission not found" });
      const s = sub.rows[0];

      const halalStatus = (req.body.halalStatus as string) || "IS_HALAL";

      const insertResult = await pool.query(
        `INSERT INTO halal_restaurants (name, formatted_address, url, lat, lng, is_halal, place_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
        [s.name || "Community Submitted", s.address, s.google_maps_url, s.lat, s.lng, halalStatus, s.place_id]
      );
      await pool.query("UPDATE restaurant_submissions SET status = 'approved' WHERE id = $1", [submissionId]);

      if (insertResult.rows[0]?.id) {
        enrichHalalRestaurantWithPlaces(insertResult.rows[0].id).catch(() => {});
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Admin Approve Restaurant] Error:", error.message);
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  app.post("/api/admin/restaurant-submissions/:id/reject", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const submissionId = parseInt(req.params.id);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid ID" });

      await pool.query("UPDATE restaurant_submissions SET status = 'rejected' WHERE id = $1", [submissionId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Admin Reject Restaurant] Error:", error.message);
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  app.get("/api/user/stats", async (req, res) => {
    try {
      const userId = await getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Sign in required" });

      const ratingsResult = await pool.query(
        `SELECT entity_type, COUNT(*) as cnt FROM user_ratings WHERE user_id = $1 GROUP BY entity_type`,
        [userId]
      );
      const ratingsHistory = await pool.query(
        `SELECT ur.entity_type, ur.entity_id, ur.rating, ur.created_at,
          CASE WHEN ur.entity_type = 'restaurant' THEN (SELECT name FROM halal_restaurants WHERE id = ur.entity_id)
               WHEN ur.entity_type = 'business' THEN (SELECT name FROM businesses WHERE id = ur.entity_id)
          END as name
         FROM user_ratings ur WHERE ur.user_id = $1 ORDER BY ur.created_at DESC LIMIT 20`,
        [userId]
      );

      let restaurantRatings = 0;
      let businessRatings = 0;
      for (const r of ratingsResult.rows) {
        if (r.entity_type === "restaurant") restaurantRatings = parseInt(r.cnt);
        if (r.entity_type === "business") businessRatings = parseInt(r.cnt);
      }

      res.json({
        restaurantRatings,
        businessRatings,
        totalRatings: restaurantRatings + businessRatings,
        ratingHistory: ratingsHistory.rows.map((r: any) => ({
          entityType: r.entity_type,
          entityId: r.entity_id,
          rating: r.rating,
          name: r.name,
          createdAt: r.created_at,
        })),
      });
    } catch (error: any) {
      console.error("[User Stats] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  const adminSessions = new Set<string>();

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (!password || password !== ADMIN_KEY) {
      return res.status(401).json({ error: "Invalid password" });
    }
    const sessionToken = crypto.randomBytes(32).toString("hex");
    adminSessions.add(sessionToken);
    res.json({ token: sessionToken });
  });

  function isAdminAuthorized(req: any): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const token = authHeader.replace("Bearer ", "");
    return adminSessions.has(token) || token === ADMIN_KEY;
  }

  app.get("/api/admin/verify", (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ valid: false });
    }
    res.json({ valid: true });
  });

  // ─── Unified Admin Auth ───────────────────────────────────────────────────
  // Single login endpoint for all admin roles. Returns role, orgName, metro.
  const unifiedSessions = new Map<string, { role: string; orgName: string; metro: string | null; displayName: string }>();

  function getUnifiedSession(req: any): { role: string; orgName: string; metro: string | null; displayName: string } | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    return unifiedSessions.get(token) || null;
  }

  function requireUnifiedRole(req: any, ...roles: string[]) {
    const session = getUnifiedSession(req);
    if (!session) return null;
    if (roles.length && !roles.includes(session.role)) return null;
    return session;
  }

  app.post("/api/auth/admin-login", async (req, res) => {
    const { orgName, password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    try {
      // No orgName → try super admin password
      if (!orgName || orgName.trim() === "") {
        if (password !== ADMIN_KEY) return res.status(401).json({ error: "Invalid credentials" });
        const tok = crypto.randomBytes(32).toString("hex");
        unifiedSessions.set(tok, { role: "super_admin", orgName: "admin", metro: null, displayName: "Super Admin" });
        // Also add to legacy adminSessions so existing /api/admin/* routes still work
        adminSessions.add(tok);
        return res.json({ token: tok, role: "super_admin", orgName: "admin", metro: null, displayName: "Super Admin" });
      }
      // Org login
      const { rows } = await pool.query(
        "SELECT id, org_name, password_hash, role, metro, display_name FROM org_portals WHERE org_name = $1",
        [orgName.trim()]
      );
      if (!rows.length) return res.status(401).json({ error: "Organization not found" });
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      if (hash !== rows[0].password_hash) return res.status(401).json({ error: "Invalid credentials" });
      const tok = crypto.randomBytes(32).toString("hex");
      const session = {
        role: rows[0].role || "community_org",
        orgName: rows[0].org_name,
        metro: rows[0].metro || null,
        displayName: rows[0].display_name || rows[0].org_name,
      };
      unifiedSessions.set(tok, session);
      // Also add to legacy portalSessions using display_name so portal data routes query correctly
      portalSessions.set(tok, rows[0].display_name || rows[0].org_name);
      return res.json({ token: tok, ...session });
    } catch (err: any) {
      console.error("[UnifiedAuth] Login error:", err.message);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/admin-verify", (req, res) => {
    const session = getUnifiedSession(req);
    if (!session) return res.status(401).json({ valid: false });
    res.json({ valid: true, ...session });
  });

  app.post("/api/auth/admin-logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const tok = authHeader.replace("Bearer ", "");
      unifiedSessions.delete(tok);
      adminSessions.delete(tok);
      portalSessions.delete(tok);
    }
    res.json({ ok: true });
  });

  // ─── Account Management (super_admin only) ────────────────────────────────
  app.get("/api/admin/accounts", async (req, res) => {
    const session = requireUnifiedRole(req, "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        "SELECT id, org_name, role, metro, display_name, created_at FROM org_portals ORDER BY role, org_name"
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list accounts" });
    }
  });

  app.post("/api/admin/accounts", async (req, res) => {
    const session = requireUnifiedRole(req, "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { orgName, password, role, metro, displayName } = req.body;
    if (!orgName || !password || !role) return res.status(400).json({ error: "orgName, password, and role are required" });
    const validRoles = ["metro_manager", "community_org", "masjid"];
    if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });
    try {
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      const { rows } = await pool.query(
        `INSERT INTO org_portals (org_name, password_hash, role, metro, display_name)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, org_name, role, metro, display_name`,
        [orgName.trim(), hash, role, metro || null, displayName || orgName.trim()]
      );
      res.json(rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "An account with that name already exists" });
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.put("/api/admin/accounts/:id", async (req, res) => {
    const session = requireUnifiedRole(req, "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { orgName, password, role, metro, displayName } = req.body;
    try {
      const updates: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (orgName) { updates.push(`org_name = $${idx++}`); vals.push(orgName.trim()); }
      if (password) { updates.push(`password_hash = $${idx++}`); vals.push(crypto.createHash("sha256").update(password).digest("hex")); }
      if (role) { updates.push(`role = $${idx++}`); vals.push(role); }
      if (metro !== undefined) { updates.push(`metro = $${idx++}`); vals.push(metro || null); }
      if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); vals.push(displayName || null); }
      if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
      vals.push(id);
      await pool.query(`UPDATE org_portals SET ${updates.join(", ")} WHERE id = $${idx}`, vals);
      res.json({ updated: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  app.delete("/api/admin/accounts/:id", async (req, res) => {
    const session = requireUnifiedRole(req, "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await pool.query("DELETE FROM org_portals WHERE id = $1 RETURNING id, org_name", [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: "Account not found" });
      res.json({ deleted: true, orgName: result.rows[0].org_name });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ─── Metro Manager Account Creation ──────────────────────────────────────
  app.post("/api/metro-admin/accounts", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { orgName, password, role, displayName } = req.body;
    if (!orgName || !password || !role) return res.status(400).json({ error: "orgName, password, and role are required" });
    if (!["community_org", "masjid"].includes(role)) return res.status(400).json({ error: "Metro managers can only create community_org or masjid accounts" });
    try {
      const metro = session.metro;
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      const { rows } = await pool.query(
        `INSERT INTO org_portals (org_name, password_hash, role, metro, display_name)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, org_name, role, metro, display_name`,
        [orgName.trim(), hash, role, metro, displayName || orgName.trim()]
      );
      res.json(rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "An account with that name already exists" });
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // ─── Metro Manager Scoped APIs ───────────────────────────────────────────
  app.get("/api/metro-admin/businesses", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const metro = (req.query.metro as string) || session.metro || "";
      const { rows } = await pool.query(
        `SELECT id, name, category, subcategory, address, service_area_description, status, featured, phone, website, created_at
         FROM businesses
         WHERE (address ILIKE $1 OR service_area_description ILIKE $1)
         ORDER BY created_at DESC LIMIT 200`,
        [`%${metro}%`]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list businesses" });
    }
  });

  app.patch("/api/metro-admin/businesses/:id", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { status, featured, name, description, address, phone, website } = req.body;
      const updates: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (status !== undefined) { updates.push(`status = $${idx++}`); vals.push(status); }
      if (featured !== undefined) { updates.push(`featured = $${idx++}`); vals.push(featured); }
      if (name !== undefined) { updates.push(`name = $${idx++}`); vals.push(name); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); vals.push(description); }
      if (address !== undefined) { updates.push(`address = $${idx++}`); vals.push(address); }
      if (phone !== undefined) { updates.push(`phone = $${idx++}`); vals.push(phone); }
      if (website !== undefined) { updates.push(`website = $${idx++}`); vals.push(website); }
      if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
      vals.push(id);
      await pool.query(`UPDATE businesses SET ${updates.join(", ")} WHERE id = $${idx}`, vals);
      res.json({ updated: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update business" });
    }
  });

  app.post("/api/metro-admin/businesses/add", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { name, category, subcategory, description, address, phone, website, filter_tags, location_type, service_area_description } = req.body;
      if (!name || !category) return res.status(400).json({ error: "Name and category are required" });
      const metro = session.metro || service_area_description || "";
      const { rows } = await pool.query(
        `INSERT INTO businesses (name, category, subcategory, description, address, phone, website, filter_tags, location_type, service_area_description, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved') RETURNING id`,
        [name, category, subcategory || null, description || null, address || null, phone || null, website || null, filter_tags || [], location_type || "physical", service_area_description || metro]
      );
      res.json({ id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to add business" });
    }
  });

  app.delete("/api/metro-admin/businesses/:id", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM businesses WHERE id = $1", [req.params.id]);
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete business" });
    }
  });

  app.get("/api/metro-admin/events", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const metro = session.metro || "";
      // Get orgs in this metro plus events with location matching metro
      const { rows } = await pool.query(
        `SELECT id, title, description, location, start_time, end_time, organizer, status, created_at,
         CASE WHEN image_data IS NOT NULL THEN '/api/community-events/' || id || '/image' ELSE NULL END as image_url
         FROM community_events
         WHERE (location ILIKE $1 OR organizer IN (
           SELECT org_name FROM org_portals WHERE metro = $2
         ))
         ORDER BY start_time DESC LIMIT 200`,
        [`%${metro}%`, metro]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list events" });
    }
  });

  app.post("/api/metro-admin/events/publish", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, startTime, endTime, organizer, registrationUrl, image, imageMime, recurrenceType, recurrenceConfig, recurring } = req.body;
      if (!title || !startTime) return res.status(400).json({ error: "Title and start time are required" });

      let eventLat: number | null = null, eventLng: number | null = null;
      if (location) {
        const geo = await geocodeAddress(location);
        if (geo) { eventLat = geo.lat; eventLng = geo.lng; }
      }

      const rType = recurrenceType || (recurring ? "weekly" : "none");
      const rConfig = recurrenceConfig || (recurring ? { count: 12 } : {});
      const baseStart = new Date(startTime);
      const baseEnd = endTime ? new Date(endTime) : null;
      const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;
      const dates = generateRecurrenceDates(baseStart, rType, rConfig);
      const groupId = dates.length > 1 ? crypto.randomUUID() : null;
      const ids: number[] = [];

      for (let i = 0; i < dates.length; i++) {
        const wStart = dates[i];
        if (rType === "monthly_calendar" || rType === "monthly_weekday") {
          wStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        }
        const wEnd = baseEnd ? new Date(wStart.getTime() + durationMs) : null;
        const result = await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, is_virtual, is_featured, status, lat, lng, recurrence_group_id, recurrence_type, recurrence_config, series_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false,'approved',$10,$11,$12,$13,$14::jsonb,$15) RETURNING id`,
          [title, description || null, location || null, wStart, wEnd, organizer || null, registrationUrl || null, image || null, imageMime || "image/jpeg", eventLat, eventLng, groupId, rType === "none" ? null : rType, rType === "none" ? null : JSON.stringify(rConfig), i]
        );
        ids.push(result.rows[0].id);
      }

      res.json({ id: ids[0], count: dates.length, ids });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to publish event: " + err.message });
    }
  });

  app.delete("/api/metro-admin/events/:id", async (req, res) => {
    const session = requireUnifiedRole(req, "metro_manager", "super_admin");
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM community_events WHERE id = $1", [req.params.id]);
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // ─── Portal Stats (unified) ───────────────────────────────────────────────
  app.get("/api/portal-admin/stats", async (req, res) => {
    const session = getUnifiedSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    try {
      const orgName = session.displayName || session.orgName;
      const [followers, events] = await Promise.all([
        pool.query("SELECT COUNT(*) as count FROM organizer_follows WHERE organizer_name = $1", [orgName]),
        pool.query("SELECT COUNT(*) as count FROM community_events WHERE organizer = $1", [orgName]),
      ]);
      res.json({
        followers: parseInt(followers.rows[0].count),
        totalEvents: parseInt(events.rows[0].count),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // ─── Recurrence Helpers ──────────────────────────────────────────────────
  function getNthWeekdayOfMonth(year: number, month: number, dow: number, nth: number): Date | null {
    if (nth === -1) {
      // Last occurrence
      const d = new Date(year, month + 1, 0);
      while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
      return d;
    }
    const d = new Date(year, month, 1);
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + (nth - 1) * 7);
    return d.getMonth() === month ? d : null;
  }

  function generateRecurrenceDates(baseStart: Date, type: string, config: any): Date[] {
    if (!type || type === "none") return [baseStart];
    const count = config?.count || 1;
    if (type === "daily") {
      return Array.from({ length: Math.min(count, 90) }, (_, i) =>
        new Date(baseStart.getTime() + i * 86400000)
      );
    }
    if (type === "weekly") {
      return Array.from({ length: Math.min(count, 52) }, (_, i) =>
        new Date(baseStart.getTime() + i * 7 * 86400000)
      );
    }
    if (type === "monthly_calendar") {
      const results: Date[] = [];
      for (let i = 0; i < Math.min(count, 12); i++) {
        const d = new Date(baseStart);
        const origDay = baseStart.getDate();
        d.setMonth(d.getMonth() + i);
        // Clamp overflow (Jan 31 + 1 month → Feb 28)
        if (d.getDate() !== origDay) d.setDate(0);
        results.push(new Date(d));
      }
      return results;
    }
    if (type === "monthly_weekday") {
      const results: Date[] = [];
      for (let i = 0; i < Math.min(count, 12); i++) {
        const d = new Date(baseStart);
        d.setDate(1);
        d.setMonth(d.getMonth() + i);
        const occ = getNthWeekdayOfMonth(d.getFullYear(), d.getMonth(), config?.dayOfWeek ?? 0, config?.nth ?? 1);
        if (occ) results.push(occ);
      }
      return results;
    }
    return [baseStart];
  }

  app.post("/api/push-token", async (req, res) => {
    try {
      const { token, lat, lng } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required" });
      }
      const isExpoToken = /^Expo(nent)?PushToken\[.+\]$/.test(token);
      if (!isExpoToken) {
        return res.status(400).json({ error: "Invalid push token format" });
      }
      const userId = await getUserIdFromRequest(req);
      if (lat != null && lng != null && typeof lat === "number" && typeof lng === "number") {
        await pool.query(
          `INSERT INTO push_tokens (token, lat, lng, user_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (token) DO UPDATE SET lat = $2, lng = $3, user_id = COALESCE($4, push_tokens.user_id)`,
          [token, lat, lng, userId]
        );
      } else {
        await pool.query(
          `INSERT INTO push_tokens (token, user_id) VALUES ($1, $2)
           ON CONFLICT (token) DO UPDATE SET user_id = COALESCE($2, push_tokens.user_id)`,
          [token, userId]
        );
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving push token:", error.message);
      res.status(500).json({ error: "Failed to save token" });
    }
  });

  app.post("/api/admin/push", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { title, body, url } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "Title and body are required" });
      }
      const result = await pool.query("SELECT token FROM push_tokens");
      const tokens = result.rows.map((r: any) => r.token);
      if (!tokens.length) {
        return res.json({ sent: 0, message: "No devices registered for push notifications" });
      }
      const data = url ? { type: "url", url } : undefined;
      const pushResult = await sendPushToTokens(tokens, title, body, data);
      res.json(pushResult);
    } catch (error: any) {
      console.error("Error sending push:", error.message);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function sendPushToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>) {
    let sent = 0;
    const expiredTokens: string[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      chunks.push(tokens.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      try {
        const messages = chunk.map((token: string) => ({
          to: token,
          sound: "default",
          title,
          body,
          data: data || undefined,
        }));
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
        const respData = await response.json() as any;
        const tickets = respData.data || [];
        for (let i = 0; i < tickets.length; i++) {
          if (tickets[i].status === "ok") sent++;
          else if (tickets[i].details?.error === "DeviceNotRegistered") expiredTokens.push(chunk[i]);
        }
      } catch (err: any) {
        console.error("Push send error:", err.message);
      }
    }
    if (expiredTokens.length > 0) {
      await pool.query("DELETE FROM push_tokens WHERE token = ANY($1)", [expiredTokens]);
    }
    return { sent, total: tokens.length };
  }

  app.post("/api/admin/push/janaza", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { masjidName, masjidLat, masjidLng, details } = req.body;
      if (!masjidName || !details || masjidLat == null || masjidLng == null) {
        return res.status(400).json({ error: "Masjid name, location, and details are required" });
      }
      if (typeof masjidLat !== "number" || typeof masjidLng !== "number" || isNaN(masjidLat) || isNaN(masjidLng)) {
        return res.status(400).json({ error: "Invalid masjid coordinates" });
      }

      await pool.query(
        "INSERT INTO janaza_alerts (masjid_name, masjid_lat, masjid_lng, details) VALUES ($1, $2, $3, $4)",
        [masjidName, masjidLat, masjidLng, details]
      );

      const result = await pool.query("SELECT token, lat, lng FROM push_tokens WHERE lat IS NOT NULL AND lng IS NOT NULL");
      const nearbyTokens = result.rows
        .filter((r: any) => haversineDistance(r.lat, r.lng, masjidLat, masjidLng) <= 50)
        .map((r: any) => r.token);

      if (!nearbyTokens.length) {
        return res.json({ sent: 0, total: 0, message: "Alert stored but no devices within 50 miles" });
      }

      const pushResult = await sendPushToTokens(
        nearbyTokens,
        "Inna Lillahi wa Inna Ilayhi Raji'un",
        `Janaza at ${masjidName}: ${details}`,
        { type: "janaza" }
      );

      res.json(pushResult);
    } catch (error: any) {
      console.error("[Janaza] Push error:", error.message);
      res.status(500).json({ error: "Failed to send Janaza alert" });
    }
  });

  app.post("/api/admin/janaza/extract", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { image, mimeType } = req.body;
      if (!image) return res.status(400).json({ error: "Image data is required" });
      const mediaType = (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: `Extract janaza (funeral) prayer details from this image. Today's date is ${new Date().toISOString().split("T")[0]}.
IMPORTANT: If the image does not specify a year, assume the current year ${new Date().getFullYear()}.

Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "deceasedName": "full name of the deceased (include title like Sr./Br. if shown)",
  "countryOfOrigin": "country of origin if mentioned",
  "relatives": "relationship info (e.g. 'Wife of ...' or 'Son of ...')",
  "prayerTime": "when the janaza prayer is (e.g. 'Saturday 03/21 After Dhuhr - 1:35 PM')",
  "prayerLocation": "where the janaza prayer will be held (full address if available)",
  "burialInfo": "burial location and details (full address if available)",
  "masjidName": "name of the masjid if mentioned"
}
Return ONLY the JSON object, no markdown, no explanation.`,
            },
          ],
        }],
      });
      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") return res.status(500).json({ error: "No text response from AI" });
      let extracted;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        extracted = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }
      res.json(extracted);
    } catch (error: any) {
      console.error("[Admin] Janaza extract error:", error.message);
      res.status(500).json({ error: "Failed to extract janaza details" });
    }
  });

  app.post("/api/admin/janaza/publish", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { masjidName, deceasedName, countryOfOrigin, relatives, prayerTime, prayerLocation, burialInfo, scheduledAt } = req.body;
      if (!deceasedName) return res.status(400).json({ error: "Deceased name is required" });
      if (!masjidName) return res.status(400).json({ error: "Masjid is required" });

      const masjidLookup = KNOWN_COORDINATES[masjidName] || KNOWN_COORDINATES["Islamic Association of Raleigh"];
      const lat = masjidLookup?.lat || 35.7898;
      const lng = masjidLookup?.lng || -78.6912;

      const details = [
        deceasedName,
        countryOfOrigin ? `Country: ${countryOfOrigin}` : null,
        relatives || null,
        prayerTime ? `Prayer: ${prayerTime}` : null,
        prayerLocation ? `Location: ${prayerLocation}` : null,
        burialInfo ? `Burial: ${burialInfo}` : null,
      ].filter(Boolean).join(" | ");

      const status = scheduledAt ? "scheduled" : "published";
      const sent = !scheduledAt;

      const { rows } = await pool.query(
        `INSERT INTO janaza_alerts (masjid_name, masjid_lat, masjid_lng, details, deceased_name, country_of_origin, relatives, prayer_time, prayer_location, burial_info, org_name, status, scheduled_at, sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [masjidName, lat, lng, details, deceasedName, countryOfOrigin || null, relatives || null, prayerTime || null, prayerLocation || null, burialInfo || null, masjidName, status, scheduledAt || null, sent]
      );

      if (!scheduledAt) {
        const result = await pool.query("SELECT token, lat, lng FROM push_tokens WHERE lat IS NOT NULL AND lng IS NOT NULL");
        const nearbyTokens = result.rows
          .filter((r: any) => haversineDistance(r.lat, r.lng, lat, lng) <= 50)
          .map((r: any) => r.token);

        if (nearbyTokens.length > 0) {
          const pushBody = `Janaza for ${deceasedName}${prayerTime ? ` — ${prayerTime}` : ""}${prayerLocation ? ` at ${prayerLocation}` : ""}`;
          await sendPushToTokens(nearbyTokens, "Inna Lillahi wa Inna Ilayhi Raji'un", pushBody, { type: "janaza" });
          console.log(`[Admin] Janaza alert sent to ${nearbyTokens.length} devices for ${deceasedName}`);
          res.json({ id: rows[0].id, sent: nearbyTokens.length, status: "published" });
        } else {
          res.json({ id: rows[0].id, sent: 0, status: "published", message: "Alert stored but no devices within 50 miles" });
        }
      } else {
        console.log(`[Admin] Janaza alert scheduled for ${scheduledAt} for ${deceasedName}`);
        res.json({ id: rows[0].id, sent: 0, status: "scheduled", scheduledAt });
      }
    } catch (error: any) {
      console.error("[Admin] Janaza publish error:", error.message);
      res.status(500).json({ error: "Failed to publish janaza alert" });
    }
  });

  app.get("/api/admin/janaza", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        `SELECT id, masjid_name, deceased_name, country_of_origin, relatives, prayer_time, prayer_location, burial_info, status, scheduled_at, sent, created_at
         FROM janaza_alerts ORDER BY created_at DESC LIMIT 30`
      );
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch janaza alerts" });
    }
  });

  app.delete("/api/admin/janaza/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM janaza_alerts WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete janaza alert" });
    }
  });

  app.post("/api/admin/push/event", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { eventId } = req.body;
      if (!eventId) {
        return res.status(400).json({ error: "Event ID is required" });
      }

      const overriddenEvents = await applyEventOverrides([...cachedEvents]);
      let event = overriddenEvents.find((e: CachedEvent) => e.id === String(eventId));
      if (!event && String(eventId).startsWith("community_")) {
        const communityId = String(eventId).replace("community_", "");
        const { rows } = await pool.query("SELECT * FROM community_events WHERE id = $1", [communityId]);
        if (rows.length) {
          const r = rows[0];
          event = {
            id: `community_${r.id}`,
            title: r.title,
            description: r.description || "",
            location: r.location || "",
            start: r.start_time ? new Date(r.start_time).toISOString() : "",
            end: r.end_time ? new Date(r.end_time).toISOString() : "",
            isAllDay: false,
            organizer: r.organizer || "",
            imageUrl: "",
            registrationUrl: r.registration_url || "",
            speaker: "",
            latitude: null,
            longitude: null,
            isVirtual: !!r.is_virtual,
            isFeatured: !!r.is_featured,
          };
        }
      }
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const result = await pool.query("SELECT token FROM push_tokens");
      const tokens = result.rows.map((r: any) => r.token);
      if (!tokens.length) {
        return res.json({ sent: 0, total: 0, message: "No devices registered" });
      }

      const pushResult = await sendPushToTokens(
        tokens,
        "Community Event",
        event.title,
        { type: "event", eventId: String(eventId) }
      );

      res.json(pushResult);
    } catch (error: any) {
      console.error("[Event Push] Error:", error.message);
      res.status(500).json({ error: "Failed to send event alert" });
    }
  });

  app.get("/api/janaza-history", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, masjid_name, details, created_at FROM janaza_alerts ORDER BY created_at DESC LIMIT 5"
      );
      res.json(rows);
    } catch (error: any) {
      console.error("[Janaza] History error:", error.message);
      res.status(500).json({ error: "Failed to fetch Janaza history" });
    }
  });

  app.get("/api/masjids", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, name, latitude, longitude, address, website, match_terms, has_iqama, campus_group, iqama_source, iqama_id, jumuah_id FROM masjids WHERE active = true ORDER BY name"
      );
      const masjids = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
        address: r.address,
        website: r.website || undefined,
        matchTerms: r.match_terms || [],
        hasIqama: r.has_iqama || false,
        campusGroup: r.campus_group || undefined,
        iqamaSource: r.iqama_source || undefined,
        iqamaId: r.iqama_id || undefined,
        jumuahId: r.jumuah_id || undefined,
      }));
      res.json(masjids);
    } catch (error: any) {
      console.error("[Masjids] Fetch error:", error.message);
      res.status(500).json({ error: "Failed to fetch masjids" });
    }
  });

  app.get("/api/admin/masjids", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query("SELECT * FROM masjids ORDER BY name");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch masjids" });
    }
  });

  app.post("/api/admin/masjids", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { name, latitude, longitude, address, website, match_terms, has_iqama, iqama_source } = req.body;
      if (!name || !latitude || !longitude || !address) {
        return res.status(400).json({ error: "name, latitude, longitude, and address are required" });
      }
      const { rows } = await pool.query(
        `INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, iqama_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, latitude, longitude, address, website || null, match_terms || [], has_iqama ?? true, iqama_source || null]
      );
      res.status(201).json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create masjid" });
    }
  });

  app.put("/api/admin/masjids/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { name, latitude, longitude, address, website, match_terms, has_iqama, iqama_source, active } = req.body;
      const { rows } = await pool.query(
        `UPDATE masjids SET name = COALESCE($1, name), latitude = COALESCE($2, latitude), longitude = COALESCE($3, longitude),
         address = COALESCE($4, address), website = CASE WHEN $5::boolean THEN $6 ELSE website END, match_terms = COALESCE($7, match_terms),
         has_iqama = COALESCE($8, has_iqama), iqama_source = CASE WHEN $9::boolean THEN $10 ELSE iqama_source END,
         active = COALESCE($11, active),
         updated_at = NOW() WHERE id = $12 RETURNING *`,
        [name, latitude, longitude, address, website !== undefined, website !== undefined ? (website || null) : null, match_terms, has_iqama, iqama_source !== undefined, iqama_source !== undefined ? (iqama_source || null) : null, active, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Masjid not found" });
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update masjid" });
    }
  });

  app.delete("/api/admin/masjids/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query("DELETE FROM masjids WHERE id = $1", [id]);
      if (rowCount === 0) return res.status(404).json({ error: "Masjid not found" });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete masjid" });
    }
  });

  app.get("/api/iqama-times", async (_req, res) => {
    try {
      const rawDays = parseInt((_req.query.days as string) || "7");
      const days = isNaN(rawDays) || rawDays < 1 ? 7 : Math.min(rawDays, 30);
      const schedules = await getIqamaSchedules(pool, days);
      res.json(schedules);
    } catch (error: any) {
      console.error("Error fetching iqama times:", error.message);
      res.status(500).json({ error: "Failed to fetch iqama times" });
    }
  });

  app.get("/api/jumuah-schedules", async (req, res) => {
    try {
      const metro = req.query.metro as string | undefined;
      let query = "SELECT id, masjid, khutbah_time, iqama_time, speaker, topic, metro, timezone, khutbahs FROM jumuah_schedules WHERE active = true";
      const params: any[] = [];
      if (metro) {
        query += ` AND metro = $1`;
        params.push(metro);
      }
      query += " ORDER BY sort_order ASC";
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching jumuah schedules:", error.message);
      res.status(500).json({ error: "Failed to fetch jumuah schedules" });
    }
  });

  app.get("/api/admin/jumuah", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await pool.query("SELECT * FROM jumuah_schedules ORDER BY sort_order ASC, id ASC");
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/jumuah", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { masjid, khutbah_time, iqama_time, speaker, topic, sort_order, metro, timezone, khutbahs } = req.body;
      if (!masjid) {
        return res.status(400).json({ error: "masjid is required" });
      }
      // Build khutbahs JSONB from slots if provided, otherwise from legacy fields
      let khutbahsJson: any[] | null = null;
      if (khutbahs && Array.isArray(khutbahs)) {
        khutbahsJson = khutbahs;
      } else if (khutbah_time && iqama_time) {
        const kTimes = (khutbah_time as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        const iTimes = (iqama_time as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        khutbahsJson = kTimes.map((kt: string, i: number) => {
          const slot: any = { khutbah_time: kt, iqama_time: iTimes[i] || iTimes[0] || "" };
          if (speaker) slot.speaker = speaker;
          if (topic) slot.topic = topic;
          return slot;
        });
      }
      const legacyKhutbah = khutbahsJson ? khutbahsJson.map((s: any) => s.khutbah_time).join(", ") : (khutbah_time || "");
      const legacyIqama = khutbahsJson ? khutbahsJson.map((s: any) => s.iqama_time).join(", ") : (iqama_time || "");
      const result = await pool.query(
        "INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, speaker, topic, sort_order, metro, timezone, khutbahs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
        [masjid, legacyKhutbah, legacyIqama, speaker || null, topic || null, sort_order || 0, metro || null, timezone || null, khutbahsJson ? JSON.stringify(khutbahsJson) : null]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/jumuah/:id", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { masjid, khutbah_time, iqama_time, speaker, topic, active, sort_order, metro, timezone, khutbahs } = req.body;
      const setClauses: string[] = ["updated_at = NOW()"];
      const params: any[] = [];
      let paramIdx = 1;
      if (masjid !== undefined) { setClauses.push(`masjid = $${paramIdx++}`); params.push(masjid); }
      if (khutbah_time !== undefined) { setClauses.push(`khutbah_time = $${paramIdx++}`); params.push(khutbah_time); }
      if (iqama_time !== undefined) { setClauses.push(`iqama_time = $${paramIdx++}`); params.push(iqama_time); }
      if (speaker !== undefined) { setClauses.push(`speaker = $${paramIdx++}`); params.push(speaker); }
      if (topic !== undefined) { setClauses.push(`topic = $${paramIdx++}`); params.push(topic); }
      if (active !== undefined) { setClauses.push(`active = $${paramIdx++}`); params.push(active); }
      if (sort_order !== undefined) { setClauses.push(`sort_order = $${paramIdx++}`); params.push(sort_order); }
      if (metro !== undefined) { setClauses.push(`metro = $${paramIdx++}`); params.push(metro); }
      if (timezone !== undefined) { setClauses.push(`timezone = $${paramIdx++}`); params.push(timezone); }
      if (khutbahs !== undefined) {
        setClauses.push(`khutbahs = $${paramIdx++}`);
        params.push(JSON.stringify(khutbahs));
        // Keep legacy fields in sync: derive from first slot, or join all
        if (Array.isArray(khutbahs) && khutbahs.length > 0) {
          const legacyKt = khutbahs.map((s: any) => s.khutbah_time).join(", ");
          const legacyIt = khutbahs.map((s: any) => s.iqama_time).join(", ");
          const firstSpeaker = khutbahs.find((s: any) => s.speaker)?.speaker || null;
          const firstTopic = khutbahs.find((s: any) => s.topic)?.topic || null;
          setClauses.push(`khutbah_time = $${paramIdx++}`); params.push(legacyKt);
          setClauses.push(`iqama_time = $${paramIdx++}`); params.push(legacyIt);
          setClauses.push(`speaker = $${paramIdx++}`); params.push(firstSpeaker);
          setClauses.push(`topic = $${paramIdx++}`); params.push(firstTopic);
        }
      }
      params.push(id);
      const result = await pool.query(
        `UPDATE jumuah_schedules SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/jumuah/:id", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM jumuah_schedules WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Address autocomplete proxy (keeps API key server-side)
  app.get("/api/admin/places/autocomplete", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) return res.json({ suggestions: [] });
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured" });
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=establishment|geocode&key=${apiKey}`;
      const r = await fetch(url);
      const data = await r.json();
      const suggestions = (data.predictions || []).map((p: any) => ({
        description: p.description,
        placeId: p.place_id,
      }));
      res.json({ suggestions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resolve a place ID to lat/lng + formatted address
  app.get("/api/admin/places/details", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const placeId = (req.query.placeId as string || "").trim();
    if (!placeId) return res.status(400).json({ error: "placeId required" });
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured" });
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address&key=${apiKey}`;
      const r = await fetch(url);
      const data = await r.json();
      const loc = data.result?.geometry?.location;
      if (!loc) return res.status(404).json({ error: "Place not found" });
      res.json({ lat: loc.lat, lng: loc.lng, address: data.result?.formatted_address || "" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resolve a Google Maps short URL (maps.app.goo.gl) to extract the Place ID
  app.get("/api/admin/places/resolve-url", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const rawUrl = (req.query.url as string || "").trim();
    if (!rawUrl) return res.status(400).json({ error: "url required" });
    try {
      const r = await fetch(rawUrl, { redirect: "follow" });
      const finalUrl = r.url;
      // Try !1sChIJ... pattern (desktop share links)
      let m = finalUrl.match(/!1s(ChIJ[^!%]+)/);
      if (m) return res.json({ place_id: m[1], final_url: finalUrl });
      // Try ?place_id=... query param
      const u = new URL(finalUrl);
      const pid = u.searchParams.get("place_id");
      if (pid && pid.startsWith("ChIJ")) return res.json({ place_id: pid, final_url: finalUrl });
      return res.status(404).json({ error: "Could not extract Place ID from that link. Try copying the URL from maps.google.com instead." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/iqama", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const masjid = req.query.masjid as string;
      const startDate = req.query.start as string;
      const endDate = req.query.end as string;
      let query = "SELECT id, masjid, date::text, fajr, dhuhr, asr, maghrib, isha, updated_at FROM iqama_schedules";
      const params: any[] = [];
      const conditions: string[] = [];
      if (masjid) { conditions.push(`masjid = $${params.length + 1}`); params.push(masjid); }
      if (startDate) { conditions.push(`date >= $${params.length + 1}`); params.push(startDate); }
      if (endDate) { conditions.push(`date <= $${params.length + 1}`); params.push(endDate); }
      if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
      query += " ORDER BY masjid, date LIMIT 500";
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/iqama", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { masjid, date, fajr, dhuhr, asr, maghrib, isha } = req.body;
      if (!masjid || !date || !fajr || !dhuhr || !asr || !maghrib || !isha) {
        return res.status(400).json({ error: "All fields are required" });
      }
      const result = await pool.query(
        `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()
         RETURNING *`,
        [masjid, date, fajr, dhuhr, asr, maghrib, isha]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/iqama/bulk", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { entries } = req.body;
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: "entries array is required" });
      }
      let inserted = 0;
      for (const entry of entries) {
        const { masjid, date, fajr, dhuhr, asr, maghrib, isha } = entry;
        if (!masjid || !date || !fajr || !dhuhr || !asr || !maghrib || !isha) continue;
        await pool.query(
          `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
          [masjid, date, fajr, dhuhr, asr, maghrib, isha]
        );
        inserted++;
      }
      res.json({ success: true, inserted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/iqama/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM iqama_schedules WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Prayer Times Ingest Agent ────────────────────────────────────────────
  // Uses Claude with tool-use to browse a masjid's website and extract iqama
  // times automatically.  Progress streams back to admin via SSE.

  interface IngestJob {
    id: string;
    status: "running" | "done" | "error";
    logs: Array<{ level: "info" | "success" | "warn" | "error"; msg: string; ts: number }>;
    result?: { saved: number };
    error?: string;
    sseClients: Set<(data: string) => void>;
  }
  const ingestJobs = new Map<string, IngestJob>();

  function jobLog(job: IngestJob, level: IngestJob["logs"][0]["level"], msg: string) {
    const entry = { level, msg, ts: Date.now() };
    job.logs.push(entry);
    const payload = JSON.stringify({ type: "log", ...entry });
    job.sseClients.forEach(send => send(payload));
  }

  function jobFinish(job: IngestJob, result: { saved: number }) {
    job.status = "done";
    job.result = result;
    const payload = JSON.stringify({ type: "done", saved: result.saved });
    job.sseClients.forEach(send => send(payload));
  }

  function jobError(job: IngestJob, msg: string) {
    job.status = "error";
    job.error = msg;
    const payload = JSON.stringify({ type: "error", msg });
    job.sseClients.forEach(send => send(payload));
  }

  function isAdminAuthorizedSse(req: any): boolean {
    if (isAdminAuthorized(req)) return true;
    const q = (req.query.auth as string) || "";
    return adminSessions.has(q) || q === ADMIN_KEY;
  }

  // SSE stream endpoint
  app.get("/api/admin/iqama/ingest-agent/:jobId/stream", (req, res) => {
    if (!isAdminAuthorizedSse(req)) return res.status(401).end();
    const job = ingestJobs.get(req.params.jobId);
    if (!job) return res.status(404).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Replay existing logs so late-connecting clients catch up
    for (const entry of job.logs) {
      res.write(`data: ${JSON.stringify({ type: "log", ...entry })}\n\n`);
    }
    if (job.status === "done") {
      res.write(`data: ${JSON.stringify({ type: "done", saved: job.result?.saved ?? 0 })}\n\n`);
      return res.end();
    }
    if (job.status === "error") {
      res.write(`data: ${JSON.stringify({ type: "error", msg: job.error })}\n\n`);
      return res.end();
    }

    const send = (data: string) => res.write(`data: ${data}\n\n`);
    job.sseClients.add(send);
    req.on("close", () => job.sseClients.delete(send));
  });

  // Job status (non-SSE fallback)
  app.get("/api/admin/iqama/ingest-agent/:jobId", (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const job = ingestJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ id: job.id, status: job.status, logs: job.logs, result: job.result, error: job.error });
  });

  // Start agent job
  app.post("/api/admin/iqama/ingest-agent", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const { masjidName, websiteUrl, timezone } = req.body;
    if (!masjidName || !websiteUrl || !timezone) {
      return res.status(400).json({ error: "masjidName, websiteUrl, and timezone required" });
    }

    const jobId = `iqama-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const job: IngestJob = { id: jobId, status: "running", logs: [], sseClients: new Set() };
    ingestJobs.set(jobId, job);

    // Clean old jobs (keep last 20)
    if (ingestJobs.size > 20) {
      const oldest = [...ingestJobs.keys()].slice(0, ingestJobs.size - 20);
      oldest.forEach(k => ingestJobs.delete(k));
    }

    res.json({ jobId });

    // Run agent asynchronously
    runIqamaIngestAgent(job, masjidName, websiteUrl, timezone, pool).catch(() => {});
  });

  async function runIqamaIngestAgent(job: IngestJob, masjidName: string, websiteUrl: string, timezone: string, db: pg.Pool) {
    const agentAnthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!agentAnthropicKey) {
      return jobError(job, "Anthropic API key not configured.");
    }
    const agentClient = new Anthropic({
      apiKey: agentAnthropicKey,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    const tools: Anthropic.Tool[] = [
      {
        name: "fetch_page",
        description: "Fetches the HTML content of a URL. Use this to browse the masjid's website and find prayer/iqama time data. Returns the text content of the page (HTML tags stripped). If the page has links to a dedicated prayer times page, fetch that URL next.",
        input_schema: {
          type: "object" as const,
          properties: {
            url: { type: "string", description: "The full URL to fetch" },
          },
          required: ["url"],
        },
      },
      {
        name: "save_iqama_times",
        description: "Saves extracted iqama (congregation prayer) times to the database. Call this once you have extracted the times. Times must be in 12-hour format like '6:15 AM'. Each entry covers one calendar date.",
        input_schema: {
          type: "object" as const,
          properties: {
            days: {
              type: "array",
              description: "Array of day entries",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  fajr: { type: "string", description: "Fajr iqama time, e.g. '6:15 AM'" },
                  dhuhr: { type: "string", description: "Dhuhr iqama time, e.g. '1:30 PM'" },
                  asr: { type: "string", description: "Asr iqama time, e.g. '5:00 PM'" },
                  maghrib: { type: "string", description: "Maghrib iqama time, e.g. '7:45 PM' (usually at or after sunset)" },
                  isha: { type: "string", description: "Isha iqama time, e.g. '9:00 PM'" },
                },
                required: ["date", "fajr", "dhuhr", "asr", "maghrib", "isha"],
              },
            },
          },
          required: ["days"],
        },
      },
      {
        name: "save_jumuah_times",
        description: "Saves extracted Jumuah (Friday prayer) times and optional khateeb/topic to the database. Use this when you find Jumuah schedule information on the masjid's website. Times must be in 12-hour format like '1:00 PM'. Extract speaker/khateeb name and topic if visible on the page.",
        input_schema: {
          type: "object" as const,
          properties: {
            masjid: { type: "string", description: "The masjid name" },
            metro: { type: "string", description: "Metro area identifier, e.g. 'Raleigh-Durham NC', 'Bay Area CA', 'Indianapolis IN', 'Las Vegas NV'" },
            timezone: { type: "string", description: "IANA timezone, e.g. 'America/New_York', 'America/Los_Angeles'" },
            slots: {
              type: "array",
              description: "One or more Jumuah time slots (some masjids have multiple Jumuah prayers)",
              items: {
                type: "object",
                properties: {
                  khutbah_time: { type: "string", description: "Khutbah start time, e.g. '1:00 PM'" },
                  iqama_time: { type: "string", description: "Iqama (congregation prayer start) time, e.g. '1:30 PM'" },
                  speaker: { type: "string", description: "Khateeb/speaker name if shown" },
                  topic: { type: "string", description: "Khutbah topic if shown" },
                },
                required: ["khutbah_time", "iqama_time"],
              },
            },
          },
          required: ["masjid", "slots"],
        },
      },
    ];

    const systemPrompt = `You are a prayer times extraction agent for a Muslim community app. Your job is to:
1. Visit a masjid's website and find their iqama (congregation prayer) times — NOT adhan times.
2. Extract the times for as many dates as possible (ideally the current and next month).
3. Save them using the save_iqama_times tool.
4. If you find Jumuah (Friday prayer) schedule info (khutbah time, iqama time, speaker/khateeb, topic), also save it using save_jumuah_times.

Important notes:
- Iqama times are when the congregation prayer begins, typically 10-20 minutes after adhan.
- If only one set of times is shown (no adhan/iqama distinction), treat them as iqama times.
- Times may vary by date (especially Fajr and Maghrib), so extract per-date when available.
- If times are given as a monthly schedule, extract all dates.
- If times change weekly or seasonally, duplicate the same time across all relevant dates.
- Today is ${new Date().toISOString().split("T")[0]}. Extract data for current month onward.
- The masjid's timezone is ${timezone}.
- Always fetch the main URL first, then follow links to prayer schedule pages.
- Limit yourself to fetching at most 4 pages. Stop once you have the times.
- For Jumuah: extract khateeb/speaker and topic if shown on the page. Some masjids have multiple Jumuah times — extract all slots.`;

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Please extract iqama times for ${masjidName}. Their website is: ${websiteUrl}\n\nStart by fetching the main page, find where the prayer/iqama schedule is, then extract and save the times.`,
      },
    ];

    jobLog(job, "info", `Starting agent for ${masjidName} (${websiteUrl})`);

    let totalSaved = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const response = await agentClient.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages,
        });

        // Add assistant response to message history
        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "end_turn") {
          // Agent is done — extract any final text message
          const finalText = response.content.find((b: any) => b.type === "text")?.text;
          if (finalText) jobLog(job, "info", `Agent: ${finalText.slice(0, 300)}`);
          break;
        }

        // Process tool calls
        const toolUses = response.content.filter((b: any) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
        if (toolUses.length === 0) break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          if (toolUse.name === "fetch_page") {
            const { url } = toolUse.input as { url: string };
            jobLog(job, "info", `Fetching: ${url}`);
            try {
              const pageRes = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; SalamYallBot/1.0)" },
                signal: AbortSignal.timeout(15000),
              });
              if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
              const rawHtml = await pageRes.text();
              // Strip HTML tags, collapse whitespace, truncate to 15k chars
              const text = rawHtml
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim()
                .slice(0, 15000);
              jobLog(job, "info", `  → Got ${text.length} chars of content`);
              toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: text });
            } catch (err: any) {
              jobLog(job, "warn", `  → Fetch failed: ${err.message}`);
              toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Error: ${err.message}`, is_error: true });
            }
          } else if (toolUse.name === "save_iqama_times") {
            const { days } = toolUse.input as { days: Array<{ date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }> };
            jobLog(job, "info", `Saving ${days.length} day(s) of iqama times for ${masjidName}...`);
            let saved = 0;
            for (const d of days) {
              if (!d.date || !d.fajr || !d.dhuhr || !d.asr || !d.maghrib || !d.isha) continue;
              try {
                await db.query(
                  `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
                  [masjidName, d.date, d.fajr, d.dhuhr, d.asr, d.maghrib, d.isha]
                );
                saved++;
              } catch (err: any) {
                jobLog(job, "warn", `  Skipped ${d.date}: ${err.message}`);
              }
            }
            totalSaved += saved;
            jobLog(job, "success", `  ✓ Saved ${saved} days (${totalSaved} total)`);
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Successfully saved ${saved} days of iqama times for ${masjidName}.` });
          } else if (toolUse.name === "save_jumuah_times") {
            const { masjid: jMasjid, metro: jMetro, timezone: jTimezone, slots } = toolUse.input as {
              masjid: string;
              metro?: string;
              timezone?: string;
              slots: Array<{ khutbah_time: string; iqama_time: string; speaker?: string; topic?: string }>;
            };
            if (!jMasjid || !slots || slots.length === 0) {
              toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Error: masjid and slots are required.", is_error: true });
              continue;
            }
            jobLog(job, "info", `Saving Jumuah schedule for ${jMasjid} (${slots.length} slot(s))...`);
            try {
              const legacyKhutbah = slots.map(s => s.khutbah_time).join(", ");
              const legacyIqama = slots.map(s => s.iqama_time).join(", ");
              const firstSpeaker = slots.find(s => s.speaker)?.speaker || null;
              const firstTopic = slots.find(s => s.topic)?.topic || null;
              await db.query(
                `INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, speaker, topic, metro, timezone, khutbahs, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
                 ON CONFLICT (masjid) DO UPDATE SET
                   khutbah_time = EXCLUDED.khutbah_time,
                   iqama_time = EXCLUDED.iqama_time,
                   speaker = EXCLUDED.speaker,
                   topic = EXCLUDED.topic,
                   metro = COALESCE(EXCLUDED.metro, jumuah_schedules.metro),
                   timezone = COALESCE(EXCLUDED.timezone, jumuah_schedules.timezone),
                   khutbahs = EXCLUDED.khutbahs,
                   updated_at = NOW()`,
                [jMasjid, legacyKhutbah, legacyIqama, firstSpeaker, firstTopic, jMetro || null, jTimezone || timezone, JSON.stringify(slots)]
              );
              jobLog(job, "success", `  ✓ Saved Jumuah schedule for ${jMasjid}`);
              toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Successfully saved Jumuah schedule for ${jMasjid}.` });
            } catch (err: any) {
              jobLog(job, "warn", `  Failed to save Jumuah: ${err.message}`);
              toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Error: ${err.message}`, is_error: true });
            }
          }
        }

        messages.push({ role: "user", content: toolResults });
      }

      if (totalSaved > 0) {
        jobLog(job, "success", `Done! Saved ${totalSaved} days of iqama times for ${masjidName}.`);
        jobFinish(job, { saved: totalSaved });
      } else {
        jobError(job, `Agent completed but no iqama times were saved. The website may not have a machine-readable prayer schedule, or the format was unrecognised.`);
      }
    } catch (err: any) {
      jobLog(job, "error", `Agent error: ${err.message}`);
      jobError(job, err.message);
    }
  }
  // ── End Prayer Times Ingest Agent ───────────────────────────────────────

  let weatherCache: { data: any; timestamp: number; key: string } | null = null;
  const tafsirCache = new Map<string, { data: any; timestamp: number }>();
  const TAFSIR_CACHE_MS = 24 * 60 * 60 * 1000;
  const TAFSIR_CACHE_MAX = 500;

  app.get("/api/tafsir/:surah/:ayah", async (req, res) => {
    try {
      const { surah, ayah } = req.params;
      const cacheKey = `${surah}:${ayah}`;
      const cached = tafsirCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < TAFSIR_CACHE_MS) {
        return res.json(cached.data);
      }
      const resp = await fetch(`https://api.quran.com/api/v4/tafsirs/169/by_ayah/${surah}:${ayah}`);
      if (!resp.ok) {
        return res.status(resp.status).json({ error: "Failed to fetch tafsir" });
      }
      const json = await resp.json();
      const tafsirText = json.tafsir?.text || json.tafsirs?.[0]?.text || "";
      const result = { surah: parseInt(surah), ayah: parseInt(ayah), text: tafsirText };
      if (tafsirCache.size >= TAFSIR_CACHE_MAX) {
        const oldest = tafsirCache.keys().next().value;
        if (oldest) tafsirCache.delete(oldest);
      }
      tafsirCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (err) {
      console.error("[Tafsir] Error:", err);
      res.status(500).json({ error: "Failed to fetch tafsir" });
    }
  });

  const WEATHER_CACHE_MS = 30 * 60 * 1000;

  app.get("/api/weather", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string) || 35.7796;
      const lon = parseFloat(req.query.lon as string) || -78.6382;
      const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
      if (weatherCache && weatherCache.key === cacheKey && Date.now() - weatherCache.timestamp < WEATHER_CACHE_MS) {
        return res.json(weatherCache.data);
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Weather API error");
      const json = await resp.json();
      const current = json.current;
      const result = {
        temperature: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
      };
      weatherCache = { data: result, timestamp: Date.now(), key: cacheKey };
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  const crescentSvg = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z" fill="#1B6B4A"/><path d="M18.5 6C13.806 6 10 9.806 10 14.5S13.806 23 18.5 23c1.908 0 3.666-.63 5.084-1.693A10.96 10.96 0 0116 24C10.477 24 6 19.523 6 14S10.477 4 16 4c2.761 0 5.262 1.143 7.044 2.98A8.45 8.45 0 0018.5 6z" fill="#D4A843"/><circle cx="22" cy="8" r="1.5" fill="#D4A843"/></svg>`;

  const calendarSvg = `<svg viewBox="0 0 14 14"><rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M1 5.5h12" stroke="#6B7280" stroke-width="1.2"/><path d="M4.5 1v3M9.5 1v3" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  const pinSvg = `<svg viewBox="0 0 14 14"><path d="M7 1.5C4.79 1.5 3 3.29 3 5.5 3 8.75 7 12.5 7 12.5s4-3.75 4-7c0-2.21-1.79-4-4-4zm0 5.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" fill="#6B7280"/></svg>`;
  const clockSvg = `<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M7 4v3.5l2.5 1.5" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const personSvg = `<svg viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M2.5 12.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg>`;
  const starSvg = `<svg viewBox="0 0 14 14" width="14" height="14"><path d="M7 1l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.07l-3.52 1.78.67-3.93L1.3 5.14l3.94-.57L7 1z" fill="#D4A843"/></svg>`;

  const WEST_COAST_ORGS = new Set([
    "San Ramon Valley Islamic Center",
    "Muslim Community Association",
    "Muslim Community Center of the East Bay",
    "MCA Al-Noor",
    "Taleef Collective",
  ]);
  const CENTRAL_ORGS = new Set([
    "Roots DFW",
    "Roots Community",
    "ISM",
  ]);

  function resolveTimezone(organizer: string): string {
    if (WEST_COAST_ORGS.has(organizer)) return "America/Los_Angeles";
    if (CENTRAL_ORGS.has(organizer)) return "America/Chicago";
    return "America/New_York";
  }

  function formatShareDate(dateStr: string, organizer?: string): string {
    try {
      const d = new Date(dateStr);
      const tz = resolveTimezone(organizer || "");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: tz });
    } catch { return ""; }
  }
  function formatShareTime(dateStr: string, organizer?: string): string {
    try {
      const d = new Date(dateStr);
      const tz = resolveTimezone(organizer || "");
      const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
      if (tz !== "America/New_York") {
        const abbr = tz === "America/Los_Angeles" ? "PT" : "CT";
        return `${timeStr} ${abbr}`;
      }
      return timeStr;
    } catch { return ""; }
  }

  app.get("/share/event/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let event: CachedEvent | undefined = cachedEvents.find(e => e.id === id);
      if (!event && id.startsWith("community_")) {
        const communityId = id.replace("community_", "");
        const { rows } = await pool.query("SELECT * FROM community_events WHERE id = $1", [communityId]);
        if (rows.length) {
          const r = rows[0];
          const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
          const hostHeader = req.headers["host"] || "localhost:5000";
          const baseUrl = `${protocol}://${hostHeader}`;
          event = {
            id: `community_${r.id}`,
            title: r.title,
            description: r.description || "",
            location: r.location || "",
            start: r.start_time ? new Date(r.start_time).toISOString() : "",
            end: r.end_time ? new Date(r.end_time).toISOString() : "",
            isAllDay: false,
            organizer: r.organizer || "",
            imageUrl: r.image_data ? `${baseUrl}/api/events/image/${r.id}` : "",
            registrationUrl: r.registration_url || "",
            speaker: "",
            latitude: null,
            longitude: null,
            isVirtual: !!r.is_virtual,
            isFeatured: !!r.is_featured,
          };
        }
      }
      const title = event ? event.title : "Community Event";
      const description = event
        ? (event.description || "").substring(0, 200) || `Event at ${event.organizer || "Salam Y'all"}`
        : "Check out this event on Salam Y'all";
      const imageUrl = event?.imageUrl || "";
      const host = (req.get("host") || "salamyall.net").replace(/[^a-zA-Z0-9._:-]/g, "");
      const safeId = encodeURIComponent(id);
      const pageUrl = `https://${host}/share/event/${safeId}`;
      const deepLink = `salamyall://event/${safeId}`;
      const webLink = `https://${host}/community?open=event&id=${safeId}`;

      const eventOrg = event?.organizer || "";
      const dateStr = event ? formatShareDate(event.start, eventOrg) : "";
      const timeStr = event ? `${formatShareTime(event.start, eventOrg)}${event.end ? " – " + formatShareTime(event.end, eventOrg) : ""}` : "";
      const location = event?.location || "";
      const organizer = event?.organizer || "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Salam Y'all">
  <meta property="og:image" content="${imageUrl ? escapeHtml(imageUrl) : `https://${host}/assets/images/og-share.png`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${imageUrl ? escapeHtml(imageUrl) : `https://${host}/assets/images/og-share.png`}">
  <link rel="stylesheet" href="/assets/brand.css">
</head>
<body class="sy-share-page">
  <div class="sy-share-brand"><img src="/assets/images/icon.png" alt="Salam Y'all"><span class="sy-share-brand-name">Salam Y'all</span></div>
  <div class="sy-share-card">
    ${imageUrl ? `<img class="sy-share-card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}">` : `<div class="sy-share-card-placeholder">📅</div>`}
    <div class="sy-share-card-body">
      <span class="sy-share-badge sy-share-badge-event">Event</span>
      <h1>${escapeHtml(title)}</h1>
      <div class="sy-share-meta">
        ${dateStr ? `<div class="sy-share-meta-row">${calendarSvg}<span>${escapeHtml(dateStr)}</span></div>` : ""}
        ${timeStr ? `<div class="sy-share-meta-row">${clockSvg}<span>${escapeHtml(timeStr)}</span></div>` : ""}
        ${location ? `<div class="sy-share-meta-row">${pinSvg}<span>${escapeHtml(location)}</span></div>` : ""}
        ${organizer ? `<div class="sy-share-meta-row">${personSvg}<span>${escapeHtml(organizer)}</span></div>` : ""}
      </div>
      ${description ? `<p class="sy-share-desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="sy-share-cta" id="open">Open in Salam Y'all</a>
      <a href="${webLink}" class="sy-share-web-cta">View on web</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="sy-share-get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="sy-share-footer">Salam Y'all — Your Muslim Community App</div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/restaurant/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, formatted_address, halal_comment, is_halal, rating, user_ratings_total, cuisine_types, emoji, photo_reference FROM halal_restaurants WHERE id = $1", [id]);
      const restaurant = result.rows[0];
      const title = restaurant ? restaurant.name : "Halal Restaurant";
      const description = restaurant
        ? (restaurant.halal_comment || restaurant.formatted_address || `${restaurant.is_halal === "IS_HALAL" ? "Halal" : "Halal restaurant"} on Salam Y'all`)
        : "Check out this restaurant on Salam Y'all";
      const host = (req.get("host") || "salamyall.net").replace(/[^a-zA-Z0-9._:-]/g, "");
      const safeId = encodeURIComponent(id);
      const pageUrl = `https://${host}/share/restaurant/${safeId}`;
      const deepLink = `salamyall://restaurant/${safeId}`;
      const webLink = `https://${host}/community?open=restaurant&id=${safeId}`;

      const address = restaurant?.formatted_address || "";
      const rating = restaurant?.rating ? parseFloat(restaurant.rating) : 0;
      const totalRatings = restaurant?.user_ratings_total || 0;
      const emoji = restaurant?.emoji || "🍽️";
      const isHalal = restaurant?.is_halal === "IS_HALAL";
      const cuisines = restaurant?.cuisine_types || [];
      const cuisineLabel = cuisines.length > 0 ? cuisines[0].replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : "";
      const restaurantImageUrl = restaurant?.photo_reference ? `https://${host}/api/halal-restaurants/${safeId}/photo` : "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Salam Y'all">
  <meta property="og:image" content="${restaurantImageUrl || `https://${host}/assets/images/og-share.png`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${restaurantImageUrl || `https://${host}/assets/images/og-share.png`}">
  <link rel="stylesheet" href="/assets/brand.css">
</head>
<body class="sy-share-page">
  <div class="sy-share-brand"><img src="/assets/images/icon.png" alt="Salam Y'all"><span class="sy-share-brand-name">Salam Y'all</span></div>
  <div class="sy-share-card">
    ${restaurantImageUrl ? `<img class="sy-share-card-image" src="${restaurantImageUrl}" alt="${escapeHtml(title)}">` : `<div class="sy-share-card-placeholder">${escapeHtml(emoji)}</div>`}
    <div class="sy-share-card-body">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="sy-share-badge sy-share-badge-restaurant">${escapeHtml(cuisineLabel || "Restaurant")}</span>
        ${isHalal ? `<span class="sy-share-badge sy-share-badge-halal">Halal</span>` : ""}
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${rating > 0 ? `<div class="sy-share-rating">${starSvg}<span>${rating.toFixed(1)}</span><span style="color:var(--text-muted)">(${totalRatings})</span></div>` : ""}
      <div class="sy-share-meta">
        ${address ? `<div class="sy-share-meta-row">${pinSvg}<span>${escapeHtml(address)}</span></div>` : ""}
      </div>
      ${description ? `<p class="sy-share-desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="sy-share-cta" id="open">Open in Salam Y'all</a>
      <a href="${webLink}" class="sy-share-web-cta">View on web</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="sy-share-get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="sy-share-footer">Salam Y'all — Your Muslim Community App</div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/business/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, category, description, address, phone, website, photo_reference, photo_url FROM businesses WHERE id = $1 AND status = 'approved'", [id]);
      const business = result.rows[0];
      const title = business ? business.name : "Local Business";
      const description = business
        ? (business.description || `${business.category} business in ${business.address || "the Triangle area"}`)
        : "Check out this business on Salam Y'all";
      const host = (req.get("host") || "salamyall.net").replace(/[^a-zA-Z0-9._:-]/g, "");
      const safeId = encodeURIComponent(id);
      const pageUrl = `https://${host}/share/business/${safeId}`;
      const deepLink = `salamyall://business/${safeId}`;
      const webLink = `https://${host}/community?open=business&id=${safeId}`;

      const category = business?.category || "Business";
      const address = business?.address || "";
      const businessImageUrl = business?.photo_reference ? `https://${host}/api/businesses/${safeId}/photo` : (business?.photo_url || "");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Salam Y'all">
  <meta property="og:image" content="${businessImageUrl || `https://${host}/assets/images/og-share.png`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${businessImageUrl || `https://${host}/assets/images/og-share.png`}">
  <link rel="stylesheet" href="/assets/brand.css">
</head>
<body class="sy-share-page">
  <div class="sy-share-brand"><img src="/assets/images/icon.png" alt="Salam Y'all"><span class="sy-share-brand-name">Salam Y'all</span></div>
  <div class="sy-share-card">
    ${businessImageUrl ? `<img class="sy-share-card-image" src="${escapeHtml(businessImageUrl)}" alt="${escapeHtml(title)}">` : `<div class="sy-share-card-placeholder">🏢</div>`}
    <div class="sy-share-card-body">
      <span class="sy-share-badge sy-share-badge-business">${escapeHtml(category)}</span>
      <h1>${escapeHtml(title)}</h1>
      <div class="sy-share-meta">
        ${address ? `<div class="sy-share-meta-row">${pinSvg}<span>${escapeHtml(address)}</span></div>` : ""}
      </div>
      ${description ? `<p class="sy-share-desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="sy-share-cta" id="open">Open in Salam Y'all</a>
      <a href="${webLink}" class="sy-share-web-cta">View on web</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="sy-share-get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="sy-share-footer">Salam Y'all — Your Muslim Community App</div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  const anthropic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  app.post("/api/admin/events/extract-flyer", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { image, mimeType, images } = req.body;
      if (!image && (!images || !Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const imageBlocks: any[] = [];
      if (images && Array.isArray(images) && images.length > 0) {
        for (const img of images) {
          imageBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: (img.mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: img.data,
            },
          });
        }
      } else {
        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: image,
          },
        });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Extract event details from ${imageBlocks.length > 1 ? 'these flyer images (they are multiple pages/views of the same event)' : 'this flyer image'}. Today's date is ${new Date().toISOString().split("T")[0]}. IMPORTANT: If the flyer does not specify a year, assume the next upcoming occurrence of that date (i.e. use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1}, whichever makes the date in the future). Also look carefully for any QR codes in the image — if you find one, decode it and use the URL as the registrationUrl. QR codes on event flyers typically link to registration or RSVP pages. If both a visible text URL and a QR code URL are present, prefer the QR code URL.${imageBlocks.length > 1 ? ' Combine information from ALL images to build the most complete event details.' : ''}

Also detect if this is a recurring event (phrases like "every Wednesday", "monthly", "3rd Thursday of each month", "bi-monthly", "weekly", etc.).

Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "title": "event title",
  "date": "YYYY-MM-DD (first/next occurrence)",
  "startTime": "HH:MM (24-hour)",
  "endTime": "HH:MM (24-hour, null if not shown)",
  "location": "full address or venue name",
  "description": "brief description of the event (2-3 sentences max)",
  "organizer": "organization or group hosting the event",
  "registrationUrl": "decoded QR code URL, or visible registration/RSVP URL",
  "isRecurring": true or false,
  "recurring": {
    "description": "human-readable pattern, e.g. 'Every 3rd Thursday' or 'Every Wednesday'",
    "type": "weekly" | "monthly_nth_weekday" | "bimonthly_nth_weekday" | "custom",
    "dayOfWeek": 0-6 (0=Sunday, 1=Monday ... 6=Saturday),
    "weekOfMonth": 1-4 or null (which week of the month, for monthly/bimonthly),
    "nthWeekdays": [1,2] or null (list of week-of-month numbers, for bimonthly — e.g. [1,2] means 1st and 2nd),
    "intervalMonths": 1 or 2 (1=monthly, 2=every other month, for bimonthly)
  }
}
Set "isRecurring": false and "recurring": null if it is a one-time event.
Return ONLY the JSON object, no markdown, no explanation.`,
            },
          ],
        }],
      });

      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ error: "No text response from AI" });
      }

      let extracted;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        extracted = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }

      res.json(extracted);
    } catch (error: any) {
      console.error("[Flyer Extract] Error:", error.message);
      res.status(500).json({ error: "Failed to extract event details: " + error.message });
    }
  });

  app.post("/api/admin/events/ingest-email", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const emailHtml = req.body.html || req.body.emailHtml || req.body.htmlContent;
      const defaultOrganizer = req.body.organizer || req.body.defaultOrganizer || "";
      if (!emailHtml || typeof emailHtml !== "string" || emailHtml.trim().length === 0) {
        return res.status(400).json({ error: "HTML email body is required" });
      }
      if (emailHtml.length > 100000) {
        return res.status(400).json({ error: "Email HTML is too large. Maximum 100KB allowed." });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `You are an event extraction agent for a Muslim community app. Extract ALL events from this newsletter/email HTML. Today's date is ${new Date().toISOString().split("T")[0]}.

RULES:
- If the email does not specify a year, assume the next upcoming occurrence (use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1}).
- Only extract events that are in the future.
- Each event must have at minimum a title and date.
- If you find registration/RSVP links, include them.
- If the organizer is obvious from the email, include it. Otherwise use "${defaultOrganizer || "Unknown"}".
- For recurring events (e.g. "every Friday"), create ONE entry with the next occurrence.

Return ONLY a JSON array of event objects. Each object should have these fields (use null for any field you cannot determine):
{
  "title": "event title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM" (24-hour format),
  "endTime": "HH:MM" (24-hour format, null if not shown),
  "location": "full address or venue name",
  "description": "brief description of the event (2-3 sentences max)",
  "organizer": "organization or group hosting the event",
  "registrationUrl": "registration/RSVP URL if found"
}

If no events are found, return an empty array [].
Return ONLY the JSON array, no markdown, no explanation.

EMAIL CONTENT:
${emailHtml.slice(0, 50000)}`,
        }],
      });

      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ error: "No text response from AI" });
      }

      let events;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        events = JSON.parse(jsonStr);
        if (!Array.isArray(events)) events = [events];
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }

      for (const ev of events) {
        if (ev.organizer) {
          const resolved = resolveOrgName(ev.organizer);
          if (resolved) ev.organizer = resolved;
        }
      }

      console.log(`[Email Ingest] Extracted ${events.length} events from newsletter`);
      res.json({ events, source: "email" });
    } catch (error: any) {
      console.error("[Email Ingest] Error:", error.message);
      res.status(500).json({ error: "Failed to extract events from email: " + error.message });
    }
  });

  app.post("/api/admin/events/ingest-instagram", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { handle } = req.body;
      console.log(`[IG Ingest] Starting Instagram ingest for handle: ${handle}`);
      
      if (!handle || typeof handle !== "string" || handle.trim().length === 0) {
        return res.status(400).json({ error: "Instagram handle is required" });
      }

      const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(cleanHandle)) {
        return res.status(400).json({ error: "Invalid Instagram handle. Use only letters, numbers, dots, and underscores (max 30 characters)." });
      }
      const profileUrl = `https://www.instagram.com/${cleanHandle}/`;
      console.log(`[IG Ingest] Fetching profile: ${profileUrl}`);

      let profileHtml: string;
      try {
        const response = await fetch(profileUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          redirect: "follow",
        });
        if (!response.ok) {
          console.error(`[IG Ingest] HTTP error: ${response.status}`);
          return res.status(400).json({ error: `Could not fetch Instagram profile for @${cleanHandle}. The profile may be private or not exist. (HTTP ${response.status})` });
        }
        profileHtml = await response.text();
        console.log(`[IG Ingest] Fetched HTML: ${profileHtml.length} bytes`);
      } catch (fetchError: any) {
        console.error(`[IG Ingest] Fetch error: ${fetchError.message}`);
        return res.status(400).json({ error: `Failed to fetch Instagram profile: ${fetchError.message}` });
      }

      const metaDescMatch = profileHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)
        || profileHtml.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
      const ogDescMatch = profileHtml.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)
        || profileHtml.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"[^>]*>/i);
      const ogImageMatch = profileHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i)
        || profileHtml.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:image"[^>]*>/i);
      const titleMatch = profileHtml.match(/<title[^>]*>([^<]*)<\/title>/i);

      const scriptDataMatches = profileHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
      let ldJsonData = "";
      if (scriptDataMatches) {
        ldJsonData = scriptDataMatches.map(m => {
          const inner = m.replace(/<\/?script[^>]*>/gi, "");
          return inner;
        }).join("\n");
      }

      interface PostData {
        caption: string;
        imageUrl: string;
        timestamp: string;
      }
      let posts: PostData[] = [];

      const captionRegex = /"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]*?)"\}\}\]/g;
      const displayUrlRegex = /"display_url":"([^"]+)"/g;
      const captionMatches: string[] = [];
      const imageUrls: string[] = [];
      let capMatch;
      while ((capMatch = captionRegex.exec(profileHtml)) !== null && captionMatches.length < 30) {
        captionMatches.push(capMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      }
      let dispMatch;
      while ((dispMatch = displayUrlRegex.exec(profileHtml)) !== null && imageUrls.length < 30) {
        imageUrls.push(dispMatch[1].replace(/\\u0026/g, "&"));
      }

      if (captionMatches.length > 0 || imageUrls.length > 0) {
        const maxLen = Math.max(captionMatches.length, imageUrls.length);
        for (let i = 0; i < maxLen; i++) {
          posts.push({
            caption: captionMatches[i] || "",
            imageUrl: imageUrls[i] || "",
            timestamp: "",
          });
        }
      }

      const sharedDataMatch = profileHtml.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
        || profileHtml.match(/<script type="text\/javascript">window\._sharedData\s*=\s*(\{[\s\S]*?\});<\/script>/);
      if (posts.length === 0 && sharedDataMatch) {
        try {
          const sharedData = JSON.parse(sharedDataMatch[1]);
          const edges = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_owner_to_timeline_media?.edges || [];
          posts = edges.slice(0, 30).map((e: any) => ({
            caption: e.node?.edge_media_to_caption?.edges?.[0]?.node?.text || "",
            imageUrl: e.node?.display_url || e.node?.thumbnail_src || "",
            timestamp: e.node?.taken_at_timestamp ? new Date(e.node.taken_at_timestamp * 1000).toISOString() : "",
          })).filter((p: PostData) => p.caption.length > 10 || p.imageUrl);
        } catch {}
      }

      const additionalScripts = profileHtml.match(/\"edge_owner_to_timeline_media\"[\s\S]*?\"edges\":\s*\[([\s\S]*?)\]\s*\}/);
      if (posts.length === 0 && additionalScripts) {
        try {
          const edgesStr = "[" + additionalScripts[1] + "]";
          const edges = JSON.parse(edgesStr);
          posts = edges.slice(0, 30).map((e: any) => ({
            caption: e.node?.edge_media_to_caption?.edges?.[0]?.node?.text || "",
            imageUrl: e.node?.display_url || e.node?.thumbnail_src || "",
            timestamp: e.node?.taken_at_timestamp ? new Date(e.node.taken_at_timestamp * 1000).toISOString() : "",
          })).filter((p: PostData) => p.caption.length > 10 || p.imageUrl);
        } catch {}
      }

      const altTexts: string[] = [];
      const altRegex = /alt="([^"]{20,})"/gi;
      let altMatch;
      while ((altMatch = altRegex.exec(profileHtml)) !== null && altTexts.length < 30) {
        const text = altMatch[1];
        if (!text.includes("profile picture") && !text.includes("may contain")) {
          altTexts.push(text);
        }
      }

      const postsSummary = posts.length > 0
        ? posts.map((p, i) => {
            let entry = `[Post ${i + 1}]`;
            if (p.timestamp) entry += ` (${p.timestamp})`;
            if (p.imageUrl) entry += `\nImage: ${p.imageUrl}`;
            if (p.caption) entry += `\nCaption: ${p.caption}`;
            return entry;
          }).join("\n\n")
        : "";

      const profileInfo = [
        metaDescMatch ? `Meta description: ${metaDescMatch[1]}` : "",
        ogDescMatch ? `OG description: ${ogDescMatch[1]}` : "",
        ogImageMatch ? `Profile/OG image: ${ogImageMatch[1]}` : "",
        titleMatch ? `Page title: ${titleMatch[1]}` : "",
        ldJsonData ? `Structured data: ${ldJsonData.slice(0, 2000)}` : "",
        postsSummary ? `Recent posts with images:\n${postsSummary}` : "",
        altTexts.length > 0 ? `Image alt texts:\n${altTexts.map((a, i) => `Image ${i + 1}: ${a}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");

      console.log(`[IG Ingest] Parsed posts: ${posts.length}, altTexts: ${altTexts.length}`);
      console.log(`[IG Ingest] Profile info length: ${profileInfo.trim().length}`);
      
      if (profileInfo.trim().length < 20) {
        console.error(`[IG Ingest] Not enough profile content (${profileInfo.trim().length} bytes)`);
        return res.status(400).json({
          error: `Could not extract meaningful content from @${cleanHandle}'s Instagram profile. The profile may be private, empty, or Instagram may be blocking access. Try pasting their post captions manually via the email ingest instead.`,
        });
      }

      const resolvedOrgFromHandle = resolveOrgName(cleanHandle) || resolveOrgName(cleanHandle.replace(/[._]/g, " "));
      const profileTitle = titleMatch ? titleMatch[1].replace(/\(.*\)/, "").replace(/@\w+/g, "").replace(/•.*/, "").trim() : "";
      const resolvedOrgFromTitle = profileTitle ? resolveOrgName(profileTitle) : "";
      const defaultOrganizer = resolvedOrgFromHandle || resolvedOrgFromTitle || cleanHandle;
      console.log(`[IG Ingest] Resolved organizer: ${defaultOrganizer}`);

      console.log(`[IG Ingest] Sending to Claude...`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `You are an event extraction agent for a Muslim community app. Analyze this Instagram profile data for @${cleanHandle} and extract any UPCOMING event announcements from their posts, captions, and images. Today's date is ${new Date().toISOString().split("T")[0]}.

RULES:
- Only extract posts that announce specific upcoming events with dates, times, or locations.
- Ignore general announcements, quotes, motivational content, or past event recaps.
- If dates are relative ("this Friday", "next Saturday"), calculate the actual date.
- If a year is not specified, assume ${new Date().getFullYear()} (or ${new Date().getFullYear() + 1} if the date has already passed).
- Only include future events.
- Look at both captions AND image URLs (event flyers often contain dates/times).

Return ONLY a JSON array of event objects. Each object should have these fields (use null for any field you cannot determine):
{
  "title": "event title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM" (24-hour format),
  "endTime": "HH:MM" (24-hour format, null if not shown),
  "location": "full address or venue name",
  "description": "brief description of the event (2-3 sentences max)",
  "organizer": "the full official name of the organization (e.g. 'Islamic Association of Raleigh', NOT just the Instagram handle). Use the profile name/bio to determine the full org name. Default to: ${defaultOrganizer}",
  "registrationUrl": "registration or RSVP URL if found",
  "imageUrl": "URL of the post image/flyer if available"
}

If no events are found, return an empty array [].
Return ONLY the JSON array, no markdown, no explanation.

INSTAGRAM PROFILE DATA:
${profileInfo.slice(0, 30000)}`,
        }],
      });

      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ error: "No text response from AI" });
      }

      let events;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        events = JSON.parse(jsonStr);
        if (!Array.isArray(events)) events = [events];
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }

      for (const ev of events) {
        if (ev.organizer) {
          const resolved = resolveOrgName(ev.organizer);
          if (resolved) ev.organizer = resolved;
        }
      }

      console.log(`[Instagram Ingest] Extracted ${events.length} events from @${cleanHandle}`);
      res.json({ events, source: "instagram", handle: cleanHandle, postsScanned: posts.length });
    } catch (error: any) {
      console.error("[Instagram Ingest] Error:", error.message);
      res.status(500).json({ error: "Failed to extract events from Instagram: " + error.message });
    }
  });

  app.post("/api/admin/events/publish", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, startTime, endTime, organizer, registrationUrl, image, imageMime, additionalImages, isVirtual, isFeatured, recurring, recurrenceType, recurrenceConfig } = req.body;
      if (!title || !startTime) return res.status(400).json({ error: "Title and start time are required" });

      if (isFeatured) {
        const { rows: featuredCount } = await pool.query(
          "SELECT COUNT(*) as cnt FROM community_events WHERE is_featured = true AND status = 'approved'"
        );
        const { rows: overrideFeatured } = await pool.query(
          "SELECT COUNT(*) as cnt FROM event_overrides WHERE is_featured = true"
        );
        const totalFeatured = parseInt(featuredCount[0]?.cnt || "0") + parseInt(overrideFeatured[0]?.cnt || "0");
        if (totalFeatured >= 3) {
          return res.status(400).json({ error: "Maximum of 3 featured events allowed. Please unfeature an existing event first." });
        }
      }

      let eventLat: number | null = null;
      let eventLng: number | null = null;
      const resolvedOrg = resolveOrgName(organizer || "") || organizer || "";
      const resolved = resolveCoordinates(resolvedOrg, location || "");
      if (resolved.latitude && resolved.longitude) {
        eventLat = resolved.latitude;
        eventLng = resolved.longitude;
      } else if (location) {
        const geocoded = await geocodeAddress(location);
        if (geocoded) { eventLat = geocoded.lat; eventLng = geocoded.lng; }
      }

      // Resolve recurrence: support new recurrenceType/recurrenceConfig OR legacy recurring boolean
      const rType = recurrenceType || (recurring ? "weekly" : "none");
      const rConfig = recurrenceConfig || (recurring ? { count: 12 } : {});

      const baseStart = new Date(startTime);
      const baseEnd = endTime ? new Date(endTime) : null;
      const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;
      const dates = generateRecurrenceDates(baseStart, rType, rConfig);
      const addImgs = Array.isArray(additionalImages) && additionalImages.length > 0 ? JSON.stringify(additionalImages) : '[]';
      const groupId = dates.length > 1 ? crypto.randomUUID() : null;
      const ids: number[] = [];

      for (let i = 0; i < dates.length; i++) {
        const wStart = dates[i];
        // Preserve original time-of-day for monthly recurrence types
        if (rType === "monthly_calendar" || rType === "monthly_weekday") {
          wStart.setHours(baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), 0);
        }
        const wEnd = baseEnd ? new Date(wStart.getTime() + durationMs) : null;
        const result = await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, additional_images, is_virtual, is_featured, status, lat, lng, recurrence_group_id, recurrence_type, recurrence_config, series_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, 'approved', $13, $14, $15, $16, $17::jsonb, $18)
           RETURNING id`,
          [title, description || null, location || null, wStart, wEnd, organizer || null, registrationUrl || null, image || null, imageMime || "image/jpeg", addImgs, !!isVirtual, !!isFeatured, eventLat, eventLng, groupId, rType === "none" ? null : rType, rType === "none" ? null : JSON.stringify(rConfig), i]
        );
        ids.push(result.rows[0].id);
      }

      console.log(`[Community Events] Published: "${title}" (${dates.length} event${dates.length > 1 ? 's' : ''}, type=${rType}, IDs ${ids.join(', ')})`);
      res.json({ id: ids[0], title, start_time: baseStart, status: "approved", count: dates.length });
    } catch (error: any) {
      console.error("[Community Events] Publish error:", error.message);
      res.status(500).json({ error: "Failed to publish event" });
    }
  });

  app.post("/api/admin/events/publish-recurring", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, organizer, registrationUrl, image, imageMime, additionalImages, startTime, endTime, recurring, rangeEnd } = req.body;
      if (!title || !startTime || !recurring) return res.status(400).json({ error: "title, startTime, and recurring pattern are required" });

      const resolvedOrg = resolveOrgName(organizer || "") || organizer || "";
      let eventLat: number | null = null, eventLng: number | null = null;
      const resolved = resolveCoordinates(resolvedOrg, location || "");
      if (resolved.latitude && resolved.longitude) { eventLat = resolved.latitude; eventLng = resolved.longitude; }
      else if (location) { const geo = await geocodeAddress(location); if (geo) { eventLat = geo.lat; eventLng = geo.lng; } }

      const baseStart = new Date(startTime);
      const baseEnd = endTime ? new Date(endTime) : null;
      const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;
      const rangeEndDate = rangeEnd ? new Date(rangeEnd) : new Date(baseStart.getFullYear() + 1, baseStart.getMonth(), baseStart.getDate());
      const addImgs = Array.isArray(additionalImages) && additionalImages.length > 0 ? JSON.stringify(additionalImages) : '[]';

      function getNthWD(year: number, month: number, wd: number, n: number): Date {
        const d = new Date(year, month, 1); let count = 0;
        while (d.getMonth() === month) { if (d.getDay() === wd && ++count === n) return new Date(d); d.setDate(d.getDate() + 1); }
        return new Date(NaN);
      }

      const occurrences: {start: Date; end: Date | null}[] = [];
      const { type, dayOfWeek, weekOfMonth, nthWeekdays, intervalMonths } = recurring;

      if (type === "weekly") {
        const cur = new Date(baseStart);
        while (cur <= rangeEndDate) {
          occurrences.push({ start: new Date(cur), end: baseEnd ? new Date(cur.getTime() + durationMs) : null });
          cur.setDate(cur.getDate() + 7);
        }
      } else if (type === "monthly_nth_weekday") {
        let y = baseStart.getFullYear(), m = baseStart.getMonth();
        while (y < rangeEndDate.getFullYear() || (y === rangeEndDate.getFullYear() && m <= rangeEndDate.getMonth())) {
          const occ = getNthWD(y, m, dayOfWeek, weekOfMonth);
          if (!isNaN(occ.getTime())) {
            const s = new Date(y, m, occ.getDate(), baseStart.getHours(), baseStart.getMinutes());
            if (s >= baseStart && s <= rangeEndDate) occurrences.push({ start: s, end: baseEnd ? new Date(s.getTime() + durationMs) : null });
          }
          m++; if (m > 11) { m = 0; y++; }
        }
      } else if (type === "bimonthly_nth_weekday") {
        const interval = intervalMonths || 2;
        let y = baseStart.getFullYear(), m = baseStart.getMonth();
        while (y < rangeEndDate.getFullYear() || (y === rangeEndDate.getFullYear() && m <= rangeEndDate.getMonth())) {
          for (const n of (nthWeekdays || [weekOfMonth])) {
            const occ = getNthWD(y, m, dayOfWeek, n);
            if (!isNaN(occ.getTime())) {
              const s = new Date(y, m, occ.getDate(), baseStart.getHours(), baseStart.getMinutes());
              if (s >= baseStart && s <= rangeEndDate) occurrences.push({ start: s, end: baseEnd ? new Date(s.getTime() + durationMs) : null });
            }
          }
          m += interval; if (m > 11) { m -= 12; y++; }
        }
      }

      const ids: number[] = [];
      for (const { start, end } of occurrences) {
        const ex = await pool.query("SELECT id FROM community_events WHERE title = $1 AND start_time = $2", [title, start]);
        if (ex.rows.length > 0) continue;
        const result = await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, additional_images, is_virtual, is_featured, status, lat, lng)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,false,false,'approved',$11,$12) RETURNING id`,
          [title, description || null, location || null, start, end, resolvedOrg || null, registrationUrl || null, image || null, imageMime || "image/jpeg", addImgs, eventLat, eventLng]
        );
        ids.push(result.rows[0].id);
      }

      console.log(`[Recurring Publish] "${title}" — ${ids.length} events created (${recurring.description})`);
      res.json({ count: ids.length, ids, pattern: recurring.description });
    } catch (error: any) {
      console.error("[Recurring Publish] Error:", error.message);
      res.status(500).json({ error: "Failed to publish recurring events: " + error.message });
    }
  });

  app.get("/api/admin/community-events/pending", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        "SELECT id, title, description, location, start_time, end_time, organizer, registration_url, is_virtual, status, created_at, submitter_name, submitter_email, CASE WHEN image_data IS NOT NULL THEN true ELSE false END as has_image FROM community_events WHERE status = 'pending' ORDER BY created_at DESC"
      );
      res.json(rows);
    } catch (error: any) {
      console.error("[Community Events] Pending list error:", error.message);
      res.status(500).json({ error: "Failed to list pending events" });
    }
  });

  app.get("/api/admin/community-events", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        "SELECT id, title, description, location, start_time, end_time, organizer, registration_url, is_virtual, is_featured, status, created_at, CASE WHEN image_data IS NOT NULL THEN true ELSE false END as has_image, COALESCE(jsonb_array_length(additional_images), 0) as additional_image_count, additional_images FROM community_events ORDER BY start_time ASC"
      );
      const normalized = rows.map((r: any) => {
        const resolved = resolveOrgName(r.organizer || "");
        if (resolved) r.organizer = resolved;
        return r;
      });
      res.json(normalized);
    } catch (error: any) {
      console.error("[Community Events] List error:", error.message);
      res.status(500).json({ error: "Failed to list community events" });
    }
  });

  app.put("/api/admin/community-events/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, additional_images, is_virtual, is_featured } = req.body;

      if (is_featured) {
        const { rows: current } = await pool.query("SELECT is_featured FROM community_events WHERE id = $1", [id]);
        if (!current.length || !current[0].is_featured) {
          const { rows: featuredCount } = await pool.query(
            "SELECT COUNT(*) as cnt FROM community_events WHERE is_featured = true AND status = 'approved' AND id != $1", [id]
          );
          const { rows: overrideFeatured } = await pool.query("SELECT COUNT(*) as cnt FROM event_overrides WHERE is_featured = true");
          const totalFeatured = parseInt(featuredCount[0]?.cnt || "0") + parseInt(overrideFeatured[0]?.cnt || "0");
          if (totalFeatured >= 3) {
            return res.status(400).json({ error: "Maximum of 3 featured events allowed. Please unfeature an existing event first." });
          }
        }
      }

      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
      if (location !== undefined) { fields.push(`location = $${idx++}`); values.push(location); }
      if (start_time !== undefined) { fields.push(`start_time = $${idx++}`); values.push(start_time); }
      if (end_time !== undefined) { fields.push(`end_time = $${idx++}`); values.push(end_time || null); }
      if (organizer !== undefined) { fields.push(`organizer = $${idx++}`); values.push(organizer); }
      if (registration_url !== undefined) { fields.push(`registration_url = $${idx++}`); values.push(registration_url); }
      if (image_data !== undefined) { fields.push(`image_data = $${idx++}`); values.push(image_data || null); }
      if (image_mime !== undefined) { fields.push(`image_mime = $${idx++}`); values.push(image_mime || 'image/jpeg'); }
      if (additional_images !== undefined) { fields.push(`additional_images = $${idx++}::jsonb`); values.push(JSON.stringify(additional_images || [])); }
      if (is_virtual !== undefined) { fields.push(`is_virtual = $${idx++}`); values.push(!!is_virtual); }
      if (is_featured !== undefined) { fields.push(`is_featured = $${idx++}`); values.push(!!is_featured); }
      if (req.body.status !== undefined && ["approved", "rejected", "pending"].includes(req.body.status)) {
        fields.push(`status = $${idx++}`); values.push(req.body.status);
      }
      if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
      values.push(id);
      const result = await pool.query(
        `UPDATE community_events SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`,
        values
      );
      if (!result.rows.length) return res.status(404).json({ error: "Event not found" });
      console.log(`[Community Events] Updated event ID ${id}`);
      res.json({ updated: true });
    } catch (error: any) {
      console.error("[Community Events] Update error:", error.message);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/admin/community-events/:id", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const result = await pool.query("DELETE FROM community_events WHERE id = $1 RETURNING id", [id]);
      if (!result.rows.length) return res.status(404).json({ error: "Event not found" });
      console.log(`[Community Events] Deleted event ID ${id}`);
      res.json({ deleted: true });
    } catch (error: any) {
      console.error("[Community Events] Delete error:", error.message);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  const LIGHTHOUSE_ORG = "The Light House Project";

  const portalSessions = new Map<string, string>();

  function getPortalOrg(req: any): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    if (portalSessions.has(token)) return portalSessions.get(token)!;
    return null;
  }

  function isPortalAuthorized(req: any, orgName: string): boolean {
    const org = getPortalOrg(req);
    return org === orgName;
  }

  app.post("/api/portal/:org/login", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    const { password } = req.body;
    if (!password) return res.status(401).json({ error: "Password required" });
    try {
      const { rows } = await pool.query("SELECT password_hash, display_name FROM org_portals WHERE org_name = $1", [orgName]);
      if (!rows.length) return res.status(401).json({ error: "Organization not found" });
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      if (hash !== rows[0].password_hash) return res.status(401).json({ error: "Invalid password" });
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const displayName = rows[0].display_name || orgName;
      portalSessions.set(sessionToken, displayName);
      res.json({ token: sessionToken, org: orgName });
    } catch (error: any) {
      console.error(`[Portal] Login error for ${orgName}:`, error.message);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/portal/:org/verify", (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ valid: false });
    res.json({ valid: true, org: orgName });
  });

  app.get("/api/org-profiles/:orgName", async (req, res) => {
    try {
      const orgName = decodeURIComponent(req.params.orgName);
      const { rows } = await pool.query(
        "SELECT org_name, description, website, address, logo_url, donation_url, updated_at, CASE WHEN logo_data IS NOT NULL THEN true ELSE false END as has_logo FROM org_profiles WHERE org_name = $1",
        [orgName]
      );
      if (rows.length > 0) {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["host"] || "localhost:5000";
        const baseUrl = `${protocol}://${host}`;
        const row = rows[0];
        if (row.has_logo) {
          row.logo_url = `${baseUrl}/api/org-profiles/${encodeURIComponent(orgName)}/logo`;
        }
        delete row.has_logo;
        res.json(row);
      } else {
        res.json(null);
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch org profile" });
    }
  });

  app.get("/api/org-profiles/:orgName/logo", async (req, res) => {
    try {
      const orgName = decodeURIComponent(req.params.orgName);
      const { rows } = await pool.query(
        "SELECT logo_data, logo_mime FROM org_profiles WHERE org_name = $1 AND logo_data IS NOT NULL",
        [orgName]
      );
      if (!rows.length) return res.status(404).json({ error: "Logo not found" });
      const buffer = Buffer.from(rows[0].logo_data, "base64");
      res.set("Content-Type", rows[0].logo_mime || "image/png");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch logo" });
    }
  });

  app.post("/api/portal/:org/logo", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { image, imageMime } = req.body;
      if (!image) return res.status(400).json({ error: "Image data required" });
      await pool.query(
        `INSERT INTO org_profiles (org_name, logo_data, logo_mime, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (org_name) DO UPDATE SET
           logo_data = $2, logo_mime = $3, updated_at = NOW()`,
        [orgName, image, imageMime || "image/png"]
      );
      console.log(`[Portal:${orgName}] Logo uploaded`);
      res.json({ uploaded: true });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Logo upload error:`, error.message);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  app.delete("/api/portal/:org/logo", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query(
        "UPDATE org_profiles SET logo_data = NULL, logo_mime = NULL, logo_url = NULL, updated_at = NOW() WHERE org_name = $1",
        [orgName]
      );
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete logo" });
    }
  });

  app.post("/api/portal/:org/events/publish", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, startTime, endTime, registrationUrl, image, imageMime, recurring, recurrenceType, recurrenceConfig } = req.body;
      if (!title || !startTime) return res.status(400).json({ error: "Title and start time are required" });

      let eventLat: number | null = null;
      let eventLng: number | null = null;
      const resolved = resolveCoordinates(orgName, location || "");
      if (resolved.latitude && resolved.longitude) {
        eventLat = resolved.latitude; eventLng = resolved.longitude;
      } else if (location) {
        const geocoded = await geocodeAddress(location);
        if (geocoded) { eventLat = geocoded.lat; eventLng = geocoded.lng; }
      }

      // Resolve recurrence: support new recurrenceType/recurrenceConfig OR legacy recurring boolean
      const rType = recurrenceType || (recurring ? "weekly" : "none");
      const rConfig = recurrenceConfig || (recurring ? { count: 12 } : {});

      const baseStart = new Date(startTime);
      const baseEnd = endTime ? new Date(endTime) : null;
      const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;
      const dates = generateRecurrenceDates(baseStart, rType, rConfig);
      const groupId = dates.length > 1 ? crypto.randomUUID() : null;
      const ids: number[] = [];

      for (let i = 0; i < dates.length; i++) {
        const wStart = dates[i];
        if (rType === "monthly_calendar" || rType === "monthly_weekday") {
          wStart.setHours(baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), 0);
        }
        const wEnd = baseEnd ? new Date(wStart.getTime() + durationMs) : null;
        const result = await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, is_virtual, is_featured, status, lat, lng, recurrence_group_id, recurrence_type, recurrence_config, series_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, false, 'approved', $10, $11, $12, $13, $14::jsonb, $15)
           RETURNING id`,
          [title, description || null, location || null, wStart, wEnd, orgName, registrationUrl || null, image || null, imageMime || "image/jpeg", eventLat, eventLng, groupId, rType === "none" ? null : rType, rType === "none" ? null : JSON.stringify(rConfig), i]
        );
        ids.push(result.rows[0].id);
      }

      console.log(`[Portal:${orgName}] Published: "${title}" (${dates.length} event${dates.length > 1 ? 's' : ''}, type=${rType}, IDs ${ids.join(', ')})`);

      try {
        const { rows: followerTokens } = await pool.query(
          `SELECT DISTINCT pt.token FROM push_tokens pt
           INNER JOIN organizer_follows of2 ON pt.user_id = of2.user_id
           WHERE of2.organizer_name = $1 AND pt.token IS NOT NULL`,
          [orgName]
        );
        const tokens = followerTokens.map((r: any) => r.token);
        if (tokens.length > 0) {
          const pushDate = baseStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          await sendPushToTokens(tokens, `New Event from ${orgName}`, `${title} — ${pushDate}`, { type: "event", eventId: `community_${ids[0]}` });
          console.log(`[Portal:${orgName}] Notified ${tokens.length} followers about "${title}"`);
        }
      } catch (pushErr: any) {
        console.error(`[Portal:${orgName}] Auto-push error:`, pushErr.message);
      }

      res.json({ id: ids[0], title, start_time: baseStart, status: "approved", count: dates.length });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Publish error:`, error.message);
      res.status(500).json({ error: "Failed to publish event" });
    }
  });

  app.get("/api/portal/:org/events", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        `SELECT id, title, description, location, start_time, end_time, registration_url, status, created_at,
         CASE WHEN image_data IS NOT NULL THEN '/api/community-events/' || id || '/image' ELSE NULL END as image_url
         FROM community_events WHERE organizer = $1 ORDER BY start_time DESC`,
        [orgName]
      );
      res.json(rows);
    } catch (error: any) {
      console.error(`[Portal:${orgName}] List error:`, error.message);
      res.status(500).json({ error: "Failed to list events" });
    }
  });

  app.put("/api/portal/:org/events/:id", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { title, description, location, startTime, endTime, registrationUrl } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });

      const { rows: existing } = await pool.query(
        "SELECT id, location, start_time, end_time, registration_url FROM community_events WHERE id = $1 AND organizer = $2",
        [id, orgName]
      );
      if (!existing.length) return res.status(404).json({ error: "Event not found or not yours" });

      let eventLat: number | null = null;
      let eventLng: number | null = null;
      if (location) {
        const resolved = resolveCoordinates(orgName, location);
        if (resolved.latitude && resolved.longitude) {
          eventLat = resolved.latitude; eventLng = resolved.longitude;
        } else {
          const geocoded = await geocodeAddress(location);
          if (geocoded) { eventLat = geocoded.lat; eventLng = geocoded.lng; }
        }
      }

      await pool.query(
        `UPDATE community_events SET title = $1, description = $2, location = $3,
         start_time = $4, end_time = $5, registration_url = $6, lat = $7, lng = $8
         WHERE id = $9 AND organizer = $10`,
        [title, description || null, location || null,
         startTime ? new Date(startTime) : existing[0].start_time,
         endTime ? new Date(endTime) : null,
         registrationUrl || null, eventLat, eventLng, id, orgName]
      );

      console.log(`[Portal:${orgName}] Updated event ID ${id}: "${title}"`);

      try {
        const { rows: saverTokens } = await pool.query(
          `SELECT DISTINCT pt.token FROM push_tokens pt
           INNER JOIN saved_events se ON pt.user_id = se.user_id
           WHERE se.event_id = $1 AND pt.token IS NOT NULL`,
          [`community_${id}`]
        );
        const saverTokenList = saverTokens.map((r: any) => r.token);
        if (saverTokenList.length > 0) {
          await sendPushToTokens(saverTokenList, "Event Updated", `"${title}" has been updated — tap to see what's new`, { type: "event", eventId: `community_${id}` });
          console.log(`[Portal:${orgName}] Notified ${saverTokenList.length} savers about update to event ${id}`);
        }
      } catch (notifErr: any) {
        console.error(`[Portal:${orgName}] Update notification error:`, notifErr.message);
      }

      res.json({ updated: true, id: parseInt(id as string) });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Update error:`, error.message);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/portal/:org/events/:id", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const result = await pool.query(
        "DELETE FROM community_events WHERE id = $1 AND organizer = $2 RETURNING id",
        [id, orgName]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Event not found or not yours" });
      console.log(`[Portal:${orgName}] Deleted event ID ${id}`);
      res.json({ deleted: true });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Delete error:`, error.message);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  app.get("/api/portal/:org/followers/count", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*) as count FROM organizer_follows WHERE organizer_name = $1",
        [orgName]
      );
      res.json({ count: parseInt(rows[0].count) });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get follower count" });
    }
  });

  app.post("/api/portal/:org/push", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, body, link } = req.body;
      if (!title || !body) return res.status(400).json({ error: "Title and message are required" });

      const { rows: followerTokens } = await pool.query(
        `SELECT DISTINCT pt.token FROM push_tokens pt
         INNER JOIN organizer_follows of2 ON pt.user_id = of2.user_id
         WHERE of2.organizer_name = $1 AND pt.token IS NOT NULL`,
        [orgName]
      );
      const tokens = followerTokens.map((r: any) => r.token);
      if (!tokens.length) return res.json({ sent: 0, total: 0, message: "No followers with push notifications enabled" });
      const pushData: Record<string, string> = {};
      if (link) { pushData.url = link; pushData.type = "url"; }
      const pushResult = await sendPushToTokens(tokens, title, body, Object.keys(pushData).length > 0 ? pushData : undefined);
      console.log(`[Portal:${orgName}] Custom push sent: "${title}" to ${pushResult.sent} followers${link ? ` with link: ${link}` : ""}`);
      res.json(pushResult);
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Push error:`, error.message);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/portal/:org/extract-flyer", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { image, mimeType, images } = req.body;
      if (!image && (!images || !Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: "Image data is required" });
      }
      const imageBlocks: any[] = [];
      if (images && Array.isArray(images) && images.length > 0) {
        for (const img of images) {
          imageBlocks.push({ type: "image", source: { type: "base64", media_type: (img.mimeType || "image/jpeg") as any, data: img.data } });
        }
      } else {
        imageBlocks.push({ type: "image", source: { type: "base64", media_type: (mimeType || "image/jpeg") as any, data: image } });
      }
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Extract event details from ${imageBlocks.length > 1 ? "these flyer images (they are multiple pages/views of the same event)" : "this flyer image"}. Today's date is ${new Date().toISOString().split("T")[0]}. IMPORTANT: If the flyer does not specify a year, assume the next upcoming occurrence of that date (i.e. use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1}, whichever makes the date in the future). Also look carefully for any QR codes in the image — if you find one, decode it and use the URL as the registrationUrl.${imageBlocks.length > 1 ? " Combine information from ALL images to build the most complete event details." : ""}

Also detect if this is a recurring event (phrases like "every Wednesday", "monthly", "3rd Thursday of each month", "bi-monthly", "weekly", etc.).

Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "title": "event title",
  "date": "YYYY-MM-DD (first/next occurrence)",
  "startTime": "HH:MM (24-hour)",
  "endTime": "HH:MM (24-hour, null if not shown)",
  "location": "full address or venue name",
  "description": "brief description of the event (2-3 sentences max)",
  "registrationUrl": "decoded QR code URL, or visible registration/RSVP URL",
  "isRecurring": true or false,
  "recurring": {
    "description": "human-readable pattern, e.g. 'Every 3rd Thursday' or 'Every Wednesday'",
    "type": "weekly" | "monthly_nth_weekday" | "bimonthly_nth_weekday" | "custom",
    "dayOfWeek": 0-6 (0=Sunday, 1=Monday ... 6=Saturday),
    "weekOfMonth": 1-4 or null,
    "nthWeekdays": [1,2] or null,
    "intervalMonths": 1 or 2
  }
}
Set "isRecurring": false and "recurring": null if it is a one-time event.
Return ONLY the JSON object, no markdown, no explanation.`,
            },
          ],
        }],
      });
      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") return res.status(500).json({ error: "No text response from AI" });
      let extracted;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        extracted = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }
      res.json(extracted);
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Flyer extract error:`, error.message);
      res.status(500).json({ error: "Failed to extract flyer details" });
    }
  });

  app.post("/api/portal/:org/events/publish-recurring", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, registrationUrl, image, imageMime, additionalImages, startTime, endTime, recurring, rangeEnd } = req.body;
      if (!title || !startTime || !recurring) return res.status(400).json({ error: "title, startTime, and recurring pattern are required" });

      let eventLat: number | null = null, eventLng: number | null = null;
      const resolved = resolveCoordinates(orgName, location || "");
      if (resolved.latitude && resolved.longitude) { eventLat = resolved.latitude; eventLng = resolved.longitude; }
      else if (location) { const geo = await geocodeAddress(location); if (geo) { eventLat = geo.lat; eventLng = geo.lng; } }

      const baseStart = new Date(startTime);
      const baseEnd = endTime ? new Date(endTime) : null;
      const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;
      const rangeEndDate = rangeEnd ? new Date(rangeEnd) : new Date(baseStart.getFullYear() + 1, baseStart.getMonth(), baseStart.getDate());
      const addImgs = Array.isArray(additionalImages) && additionalImages.length > 0 ? JSON.stringify(additionalImages) : "[]";

      function getNthWD(year: number, month: number, wd: number, n: number): Date {
        const d = new Date(year, month, 1); let count = 0;
        while (d.getMonth() === month) { if (d.getDay() === wd && ++count === n) return new Date(d); d.setDate(d.getDate() + 1); }
        return new Date(NaN);
      }

      const occurrences: { start: Date; end: Date | null }[] = [];
      const { type, dayOfWeek, weekOfMonth, nthWeekdays, intervalMonths } = recurring;

      if (type === "weekly") {
        const cur = new Date(baseStart);
        while (cur <= rangeEndDate) {
          occurrences.push({ start: new Date(cur), end: baseEnd ? new Date(cur.getTime() + durationMs) : null });
          cur.setDate(cur.getDate() + 7);
        }
      } else if (type === "monthly_nth_weekday") {
        let y = baseStart.getFullYear(), m = baseStart.getMonth();
        while (y < rangeEndDate.getFullYear() || (y === rangeEndDate.getFullYear() && m <= rangeEndDate.getMonth())) {
          const occ = getNthWD(y, m, dayOfWeek, weekOfMonth);
          if (!isNaN(occ.getTime())) {
            const s = new Date(y, m, occ.getDate(), baseStart.getHours(), baseStart.getMinutes());
            if (s >= baseStart && s <= rangeEndDate) occurrences.push({ start: s, end: baseEnd ? new Date(s.getTime() + durationMs) : null });
          }
          m++; if (m > 11) { m = 0; y++; }
        }
      } else if (type === "bimonthly_nth_weekday") {
        const interval = intervalMonths || 2;
        let y = baseStart.getFullYear(), m = baseStart.getMonth();
        while (y < rangeEndDate.getFullYear() || (y === rangeEndDate.getFullYear() && m <= rangeEndDate.getMonth())) {
          for (const n of (nthWeekdays || [weekOfMonth])) {
            const occ = getNthWD(y, m, dayOfWeek, n);
            if (!isNaN(occ.getTime())) {
              const s = new Date(y, m, occ.getDate(), baseStart.getHours(), baseStart.getMinutes());
              if (s >= baseStart && s <= rangeEndDate) occurrences.push({ start: s, end: baseEnd ? new Date(s.getTime() + durationMs) : null });
            }
          }
          m += interval; if (m > 11) { m -= 12; y++; }
        }
      }

      const ids: number[] = [];
      for (const { start, end } of occurrences) {
        const ex = await pool.query("SELECT id FROM community_events WHERE title = $1 AND start_time = $2 AND organizer = $3", [title, start, orgName]);
        if (ex.rows.length > 0) continue;
        const result = await pool.query(
          `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, additional_images, is_virtual, is_featured, status, lat, lng)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,false,false,'approved',$11,$12) RETURNING id`,
          [title, description || null, location || null, start, end, orgName, registrationUrl || null, image || null, imageMime || "image/jpeg", addImgs, eventLat, eventLng]
        );
        ids.push(result.rows[0].id);
      }

      console.log(`[Portal:${orgName}] Recurring publish: "${title}" — ${ids.length} events (${recurring.description})`);
      res.json({ count: ids.length, ids, pattern: recurring.description });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Recurring publish error:`, error.message);
      res.status(500).json({ error: "Failed to publish recurring events" });
    }
  });

  app.post("/api/portal/:org/janaza/extract", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { image, mimeType } = req.body;
      if (!image) return res.status(400).json({ error: "Image data is required" });
      const mediaType = (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: `Extract janaza (funeral) prayer details from this image. Today's date is ${new Date().toISOString().split("T")[0]}.
IMPORTANT: If the image does not specify a year, assume the current year ${new Date().getFullYear()}.

Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "deceasedName": "full name of the deceased (include title like Sr./Br. if shown)",
  "countryOfOrigin": "country of origin if mentioned",
  "relatives": "relationship info (e.g. 'Wife of ...' or 'Son of ...')",
  "prayerTime": "when the janaza prayer is (e.g. 'Saturday 03/21 After Dhuhr - 1:35 PM')",
  "prayerLocation": "where the janaza prayer will be held (full address if available)",
  "burialInfo": "burial location and details (full address if available)",
  "masjidName": "name of the masjid if mentioned"
}
Return ONLY the JSON object, no markdown, no explanation.`,
            },
          ],
        }],
      });
      const textContent = message.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") return res.status(500).json({ error: "No text response from AI" });
      let extracted;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        extracted = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: textContent.text });
      }
      res.json(extracted);
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Janaza extract error:`, error.message);
      res.status(500).json({ error: "Failed to extract janaza details" });
    }
  });

  app.post("/api/portal/:org/janaza/publish", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { deceasedName, countryOfOrigin, relatives, prayerTime, prayerLocation, burialInfo, scheduledAt } = req.body;
      if (!deceasedName) return res.status(400).json({ error: "Deceased name is required" });

      const masjidLookup = KNOWN_COORDINATES[orgName] || KNOWN_COORDINATES["Islamic Association of Raleigh"];
      const lat = masjidLookup?.lat || 35.7898;
      const lng = masjidLookup?.lng || -78.6912;

      const details = [
        deceasedName,
        countryOfOrigin ? `Country: ${countryOfOrigin}` : null,
        relatives || null,
        prayerTime ? `Prayer: ${prayerTime}` : null,
        prayerLocation ? `Location: ${prayerLocation}` : null,
        burialInfo ? `Burial: ${burialInfo}` : null,
      ].filter(Boolean).join(" | ");

      const status = scheduledAt ? "scheduled" : "published";
      const sent = scheduledAt ? false : true;

      const { rows } = await pool.query(
        `INSERT INTO janaza_alerts (masjid_name, masjid_lat, masjid_lng, details, deceased_name, country_of_origin, relatives, prayer_time, prayer_location, burial_info, org_name, status, scheduled_at, sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [orgName, lat, lng, details, deceasedName, countryOfOrigin || null, relatives || null, prayerTime || null, prayerLocation || null, burialInfo || null, orgName, status, scheduledAt || null, sent]
      );

      if (!scheduledAt) {
        const result = await pool.query("SELECT token, lat, lng FROM push_tokens WHERE lat IS NOT NULL AND lng IS NOT NULL");
        const nearbyTokens = result.rows
          .filter((r: any) => haversineDistance(r.lat, r.lng, lat, lng) <= 50)
          .map((r: any) => r.token);

        if (nearbyTokens.length > 0) {
          const pushBody = `Janaza for ${deceasedName}${prayerTime ? ` — ${prayerTime}` : ""}${prayerLocation ? ` at ${prayerLocation}` : ""}`;
          await sendPushToTokens(nearbyTokens, "Inna Lillahi wa Inna Ilayhi Raji'un", pushBody, { type: "janaza" });
          console.log(`[Portal:${orgName}] Janaza alert sent to ${nearbyTokens.length} devices for ${deceasedName}`);
          res.json({ id: rows[0].id, sent: nearbyTokens.length, status: "published" });
        } else {
          res.json({ id: rows[0].id, sent: 0, status: "published", message: "Alert stored but no devices within 50 miles" });
        }
      } else {
        console.log(`[Portal:${orgName}] Janaza alert scheduled for ${scheduledAt} for ${deceasedName}`);
        res.json({ id: rows[0].id, sent: 0, status: "scheduled", scheduledAt });
      }
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Janaza publish error:`, error.message);
      res.status(500).json({ error: "Failed to publish janaza alert" });
    }
  });

  app.get("/api/portal/:org/janaza", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        `SELECT id, deceased_name, country_of_origin, relatives, prayer_time, prayer_location, burial_info, status, scheduled_at, sent, created_at
         FROM janaza_alerts WHERE org_name = $1 ORDER BY created_at DESC LIMIT 20`,
        [orgName]
      );
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch janaza alerts" });
    }
  });

  app.put("/api/portal/:org/janaza/:id", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { deceasedName, countryOfOrigin, relatives, prayerTime, prayerLocation, burialInfo, scheduledAt } = req.body;
      const details = [
        deceasedName,
        countryOfOrigin ? `Country: ${countryOfOrigin}` : null,
        relatives || null,
        prayerTime ? `Prayer: ${prayerTime}` : null,
        prayerLocation ? `Location: ${prayerLocation}` : null,
        burialInfo ? `Burial: ${burialInfo}` : null,
      ].filter(Boolean).join(" | ");

      await pool.query(
        `UPDATE janaza_alerts SET deceased_name=$1, country_of_origin=$2, relatives=$3, prayer_time=$4, prayer_location=$5, burial_info=$6, details=$7, scheduled_at=$8, status=$9
         WHERE id=$10 AND org_name=$11`,
        [deceasedName, countryOfOrigin || null, relatives || null, prayerTime || null, prayerLocation || null, burialInfo || null, details, scheduledAt || null, scheduledAt ? "scheduled" : "published", req.params.id, orgName]
      );
      res.json({ updated: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update janaza alert" });
    }
  });

  app.delete("/api/portal/:org/janaza/:id", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      await pool.query("DELETE FROM janaza_alerts WHERE id=$1 AND org_name=$2", [req.params.id, orgName]);
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete janaza alert" });
    }
  });

  app.put("/api/portal/:org/organization", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { description, website, address, donationUrl } = req.body;
      await pool.query(
        `INSERT INTO org_profiles (org_name, description, website, address, donation_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (org_name) DO UPDATE SET
           description = COALESCE($2, org_profiles.description),
           website = COALESCE($3, org_profiles.website),
           address = COALESCE($4, org_profiles.address),
           donation_url = COALESCE($5, org_profiles.donation_url),
           updated_at = NOW()`,
        [orgName, description || null, website || null, address || null, donationUrl || null]
      );
      console.log(`[Portal:${orgName}] Updated organization profile`);
      res.json({ updated: true });
    } catch (error: any) {
      console.error(`[Portal:${orgName}] Org profile update error:`, error.message);
      res.status(500).json({ error: "Failed to update organization profile" });
    }
  });

  app.get("/api/portal/:org/stats", async (req, res) => {
    const orgName = decodeURIComponent(req.params.org);
    if (!isPortalAuthorized(req, orgName)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const [followers, events] = await Promise.all([
        pool.query("SELECT COUNT(*) as count FROM organizer_follows WHERE organizer_name = $1", [orgName]),
        pool.query("SELECT COUNT(*) as count FROM community_events WHERE organizer = $1", [orgName]),
      ]);
      res.json({
        followers: parseInt(followers.rows[0].count),
        totalEvents: parseInt(events.rows[0].count),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.get("/lighthouse-admin", (_req, res) => res.redirect("/admin"));

  app.get("/iar-admin", (_req, res) => res.redirect("/admin"));

  setInterval(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, masjid_name, masjid_lat, masjid_lng, deceased_name, prayer_time, prayer_location, details
         FROM janaza_alerts WHERE status = 'scheduled' AND sent = false AND scheduled_at <= NOW()`
      );
      for (const alert of rows) {
        const result = await pool.query("SELECT token, lat, lng FROM push_tokens WHERE lat IS NOT NULL AND lng IS NOT NULL");
        const nearbyTokens = result.rows
          .filter((r: any) => haversineDistance(r.lat, r.lng, alert.masjid_lat, alert.masjid_lng) <= 50)
          .map((r: any) => r.token);

        if (nearbyTokens.length > 0) {
          const pushBody = `Janaza for ${alert.deceased_name}${alert.prayer_time ? ` — ${alert.prayer_time}` : ""}${alert.prayer_location ? ` at ${alert.prayer_location}` : ""}`;
          await sendPushToTokens(nearbyTokens, "Inna Lillahi wa Inna Ilayhi Raji'un", pushBody, { type: "janaza" });
          console.log(`[Janaza Scheduler] Sent scheduled alert for ${alert.deceased_name} to ${nearbyTokens.length} devices`);
        }
        await pool.query("UPDATE janaza_alerts SET sent = true, status = 'published' WHERE id = $1", [alert.id]);
      }
    } catch (err: any) {
      console.error("[Janaza Scheduler] Error:", err.message);
    }
  }, 60000);

  let eventReminderRunning = false;
  setInterval(async () => {
    if (eventReminderRunning) return;
    eventReminderRunning = true;
    try {
      await pool.query(
        `UPDATE saved_events SET reminder_sent = true
         WHERE reminder_sent = false
           AND event_id LIKE 'community_%'
           AND CAST(REPLACE(event_id, 'community_', '') AS INTEGER) IN (
             SELECT id FROM community_events WHERE start_time < NOW() - INTERVAL '1 hour'
           )`
      ).catch(() => {});
      const { rows: unsent } = await pool.query(
        `SELECT se.id AS saved_id, se.event_id, se.user_id
         FROM saved_events se
         WHERE se.reminder_sent = false`
      );
      if (unsent.length === 0) return;

      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      const communityIds = unsent
        .filter(r => r.event_id.startsWith("community_"))
        .map(r => parseInt(r.event_id.replace("community_", "")))
        .filter(n => Number.isInteger(n) && n > 0);
      const communityMap: Record<number, { title: string; start_time: Date; location: string }> = {};
      if (communityIds.length > 0) {
        const { rows: ces } = await pool.query(
          `SELECT id, title, start_time, location FROM community_events
           WHERE id = ANY($1) AND status = 'approved'
             AND start_time > NOW() AND start_time <= NOW() + INTERVAL '1 hour'`,
          [communityIds]
        );
        for (const ce of ces) communityMap[ce.id] = ce;
      }

      const externalEventIds = [...new Set(unsent.filter(r => !r.event_id.startsWith("community_")).map(r => r.event_id))];
      const externalMap: Record<string, { title: string; start: string; location: string }> = {};
      if (externalEventIds.length > 0) {
        const allExternal: CachedEvent[] = [];
        const results = await Promise.allSettled([
          fetchRootsDfwEvents(), fetchMCCEastBayEvents(), fetchSRVICEvents(), fetchMCAEvents(), fetchICFEvents(), fetchLGICEvents()
        ]);
        for (const r of results) {
          if (r.status === "fulfilled") {
            allExternal.push(...r.value);
          } else {
            console.warn("[Event Reminder] External feed fetch failed:", r.reason?.message || r.reason);
          }
        }
        const pastExternalIds: number[] = [];
        for (const eid of externalEventIds) {
          const found = allExternal.find(e => e.id === eid);
          if (found && found.start) {
            const startMs = new Date(found.start).getTime();
            if (startMs > now && startMs <= now + oneHour) {
              externalMap[eid] = { title: found.title, start: found.start, location: found.location || "" };
            } else if (startMs < now - 60 * 60 * 1000) {
              const pastRows = unsent.filter(r => r.event_id === eid);
              pastExternalIds.push(...pastRows.map(r => r.saved_id));
            }
          }
        }
        if (pastExternalIds.length > 0) {
          await pool.query("UPDATE saved_events SET reminder_sent = true WHERE id = ANY($1)", [pastExternalIds]);
        }
      }

      const dueRows = unsent.filter(row => {
        if (row.event_id.startsWith("community_")) {
          const numId = parseInt(row.event_id.replace("community_", ""));
          return !!communityMap[numId];
        }
        return !!externalMap[row.event_id];
      });
      if (dueRows.length === 0) return;

      const userIds = [...new Set(dueRows.map(r => r.user_id))];
      const tokenRows = await pool.query(
        `SELECT user_id, token FROM push_tokens WHERE user_id = ANY($1) AND token IS NOT NULL`,
        [userIds]
      );
      const tokensByUser: Record<number, string[]> = {};
      for (const t of tokenRows.rows) {
        if (!tokensByUser[t.user_id]) tokensByUser[t.user_id] = [];
        tokensByUser[t.user_id].push(t.token);
      }

      const sentIds: number[] = [];
      for (const row of dueRows) {
        const userTokens = tokensByUser[row.user_id];
        if (!userTokens || userTokens.length === 0) continue;

        let eventInfo: { title: string; startTime: Date; location: string } | null = null;
        if (row.event_id.startsWith("community_")) {
          const numId = parseInt(row.event_id.replace("community_", ""));
          const ce = communityMap[numId];
          if (ce) eventInfo = { title: ce.title, startTime: new Date(ce.start_time), location: ce.location || "" };
        } else {
          const ext = externalMap[row.event_id];
          if (ext) eventInfo = { title: ext.title, startTime: new Date(ext.start), location: ext.location };
        }
        if (!eventInfo) continue;

        const isDfw = row.event_id.startsWith("roots_dfw_");
        const isCalifornia = row.event_id.startsWith("mcc_eastbay_") || row.event_id.startsWith("srvic_") || row.event_id.startsWith("mca_");
        const tz = isCalifornia ? "America/Los_Angeles" : isDfw ? "America/Chicago" : "America/New_York";
        const timeStr = eventInfo.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
        const body = `Starting at ${timeStr}${eventInfo.location ? ` — ${eventInfo.location}` : ""}`;
        try {
          const result = await sendPushToTokens(userTokens, `📅 ${eventInfo.title}`, body, { type: "event", eventId: row.event_id });
          if (result.sent > 0) {
            sentIds.push(row.saved_id);
          } else {
            console.warn(`[Event Reminder] Push failed for user ${row.user_id} event "${eventInfo.title}", will retry`);
          }
        } catch (sendErr: any) {
          console.error(`[Event Reminder] Send error for user ${row.user_id}:`, sendErr.message);
        }
      }

      if (sentIds.length > 0) {
        await pool.query(
          "UPDATE saved_events SET reminder_sent = true WHERE id = ANY($1) AND reminder_sent = false",
          [sentIds]
        );
        console.log(`[Event Reminder] Marked ${sentIds.length} reminder(s) as sent`);
      }
    } catch (err: any) {
      console.error("[Event Reminder] Error:", err.message);
    } finally {
      eventReminderRunning = false;
    }
  }, 60000);

  app.use((_req, res) => {
    res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(notFoundHtml);
  });

  const httpServer = createServer(app);
  return httpServer;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
