import type { Express } from "express";
import { createServer, type Server } from "node:http";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { getUncachableGoogleCalendarClient } from "./google-calendar";
import halalSeedData from "./halal-seed-data.json";
import { ensureIqamaTable, seedJIARData, startIqamaSync, getIqamaSchedules } from "./iqama-scraper";
import Anthropic from "@anthropic-ai/sdk";

const CALENDAR_ID = "5c6138b3c670e90f28b9ec65a6650268569a070eff5ae0ae919129f763d216af@group.calendar.google.com";

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
  ["light house project", "Light House Project"],
  ["lighthouse project", "Light House Project"],
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
  ["nw maynard", "Light House Project"],
  ["kildaire farm", "Light House Project"],
  ["jones franklin", "Muslim American Society (MAS Raleigh)"],
  ["rock quarry", "Raleigh Islamic Institute"],
  ["new hope rd", "Madinah Quran & Youth Center"],
  ["ridge rd, raleigh", "Madinah Quran & Youth Center"],
  ["ridge rd., raleigh", "Madinah Quran & Youth Center"],
  ["barber mill", "Islamic Center of Clayton"],
  ["method road", "Triangle Islamic Center"],
  ["method rd", "Triangle Islamic Center"],
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
};

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

  return {
    id: event.id,
    title: event.summary || "Untitled Event",
    description: cleanDescription(desc),
    location: resolveLocation(event.location || ""),
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    isAllDay: !event.start?.dateTime,
    organizer: resolveOrganizer(event),
    imageUrl,
    registrationUrl,
    speaker: extractSpeaker(desc),
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
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
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
  const { rows } = await pool.query("SELECT COUNT(*) as count FROM jumuah_schedules");
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, sort_order) VALUES
        ('IAR (Atwater)', '1:00 PM', '1:30 PM', 1),
        ('IAR (Page Rd)', '1:00 PM', '1:30 PM', 2),
        ('Islamic Center of Morrisville', '12:30 PM', '1:00 PM', 3),
        ('Islamic Center of Cary', '1:00 PM', '1:30 PM', 4),
        ('As-Salaam Islamic Center', '1:15 PM', '1:45 PM', 5),
        ('Chapel Hill Islamic Society', '1:00 PM', '1:30 PM', 6),
        ('Ar-Razzaq Islamic Center', '1:15 PM', '1:45 PM', 7),
        ('Jamaat Ibad Ar-Rahman (Fayetteville)', '1:00 PM', '1:30 PM', 8),
        ('Jamaat Ibad Ar-Rahman (Parkwood)', '12:10 PM, 1:10 PM, 2:10 PM', '12:40 PM, 1:40 PM, 2:40 PM', 9);
    `);
    console.log("[DB] Seeded default Jumuah schedules");
  }
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
      status VARCHAR(20) DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureAnalyticsTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      event_data JSONB,
      device_id VARCHAR(100),
      platform VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_device ON analytics_events(device_id);`);
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS masjids_name_unique ON masjids (name);
  `);
  const { rows } = await pool.query("SELECT COUNT(*) as count FROM masjids");
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, sort_order) VALUES
        ('Al-Noor Islamic Center', 35.7636, -78.7443, '1501 Buck Jones Rd, Raleigh, NC 27606', NULL, ARRAY['al-noor', 'alnoor'], true, 1),
        ('Islamic Association of Raleigh (Atwater)', 35.7898, -78.6912, '808 Atwater St, Raleigh, NC 27607', 'https://www.raleighmasjid.org', ARRAY['iar', 'islamic association of raleigh', 'atwater'], true, 2),
        ('Islamic Association of Raleigh (Page Rd)', 35.9067, -78.8169, '3104 Page Rd, Morrisville, NC 27560', 'https://www.raleighmasjid.org', ARRAY['iar', 'islamic association of raleigh', 'page rd', 'page road'], true, 3),
        ('Islamic Center of Morrisville', 35.8099, -78.8228, '107 Quail Fields Ct, Morrisville, NC 27560', 'https://www.icmorrisville.org', ARRAY['icm', 'islamic center of morrisville', 'quail fields'], true, 4),
        ('Jamaat Ibad Ar-Rahman (Fayetteville)', 35.9856, -78.8977, '3034 Fayetteville St, Durham, NC 27707', 'https://www.jiar.org', ARRAY['jamaat ibad', 'jiar', 'fayetteville st'], true, 5),
        ('Jamaat Ibad Ar-Rahman (Parkwood)', 35.8938, -78.9109, '5122 Revere Rd, Durham, NC 27713', 'https://www.jiar.org', ARRAY['parkwood', 'revere rd'], true, 6),
        ('Apex Masjid', 35.7294, -78.8415, '733 Center St, Apex, NC 27502', NULL, ARRAY['apex masjid', 'center st, apex'], false, 7),
        ('Ar-Razzaq Islamic Center', 35.9966, -78.9155, '1920 Chapel Hill Rd, Durham, NC 27707', NULL, ARRAY['ar-razzaq', 'arrazzaq', 'chapel hill rd, durham'], false, 8),
        ('As-Salaam Islamic Center', 35.7781, -78.6075, '110 Lord Anson Dr, Raleigh, NC 27610', 'https://www.assalaam.org', ARRAY['as-salaam', 'assalaam', 'lord anson'], false, 9),
        ('Chapel Hill Islamic Society', 35.9406, -79.0164, '1717 Legion Rd, Chapel Hill, NC 27517', 'https://www.chapelhillmasjid.org', ARRAY['chapel hill islamic', 'legion rd'], false, 10),
        ('Islamic Center of Cary', 35.7731, -78.8028, '1155 W Chatham St, Cary, NC 27511', 'https://www.icocary.org', ARRAY['islamic center of cary', 'chatham st'], false, 11),
        ('Masjid King Khalid', 35.7693, -78.6383, '130 Martin Luther King Jr Blvd, Raleigh, NC 27601', NULL, ARRAY['king khalid', 'martin luther king'], false, 12),
        ('North Raleigh Masjid', 35.8520, -78.5571, '7424 Deah Way, Raleigh, NC 27616', NULL, ARRAY['north raleigh masjid', 'deah way', 'mycc', 'muslim youth community center'], false, 13),
        ('San Ramon Valley Islamic Center', 37.7770, -121.9691, '2230 Camino Ramon, San Ramon, CA 94583', 'https://srvic.org', ARRAY['srvic', 'san ramon valley islamic', 'camino ramon'], true, 14),
        ('Muslim Community Association', 37.3769, -121.9595, '3003 Scott Blvd, Santa Clara, CA 95054', 'https://www.mcabayarea.org', ARRAY['mca', 'muslim community association', 'scott blvd', 'mcabayarea'], true, 15),
        ('MCA Al-Noor', 37.3530, -121.9535, '1755 Catherine St, Santa Clara, CA 95050', 'https://www.mcabayarea.org', ARRAY['mca al-noor', 'mca alnoor', 'mca noor', 'catherine st'], true, 16);
    `);
    console.log("[DB] Seeded default masjids");
  } else {
    await pool.query(`UPDATE masjids SET name = 'Al-Noor Islamic Center' WHERE name = 'Al Noor Islamic Center'`);
    await pool.query(`DELETE FROM masjids WHERE name = 'Muslim Youth and Community Center'`);
    await pool.query(`DELETE FROM masjids WHERE name = 'MCA Noor'`);
    await pool.query(`UPDATE iqama_schedules SET masjid = 'MCA Al-Noor' WHERE masjid = 'MCA Noor'`);
    const masjidUpserts = [
      { name: 'Al-Noor Islamic Center', lat: 35.7636, lng: -78.7443, addr: '1501 Buck Jones Rd, Raleigh, NC 27606', website: null, terms: ['al-noor', 'alnoor'], iqama: true, sort: 1 },
      { name: 'Islamic Association of Raleigh (Atwater)', lat: 35.7898, lng: -78.6912, addr: '808 Atwater St, Raleigh, NC 27607', website: 'https://www.raleighmasjid.org', terms: ['iar', 'islamic association of raleigh', 'atwater'], iqama: true, sort: 2 },
      { name: 'Islamic Association of Raleigh (Page Rd)', lat: 35.9067, lng: -78.8169, addr: '3104 Page Rd, Morrisville, NC 27560', website: 'https://www.raleighmasjid.org', terms: ['iar', 'islamic association of raleigh', 'page rd', 'page road'], iqama: true, sort: 3 },
      { name: 'Islamic Center of Morrisville', lat: 35.8099, lng: -78.8228, addr: '107 Quail Fields Ct, Morrisville, NC 27560', website: 'https://www.icmorrisville.org', terms: ['icm', 'islamic center of morrisville', 'quail fields'], iqama: true, sort: 4 },
      { name: 'Jamaat Ibad Ar-Rahman (Fayetteville)', lat: 35.9856, lng: -78.8977, addr: '3034 Fayetteville St, Durham, NC 27707', website: 'https://www.jiar.org', terms: ['jamaat ibad', 'jiar', 'fayetteville st'], iqama: true, sort: 5 },
      { name: 'Jamaat Ibad Ar-Rahman (Parkwood)', lat: 35.8938, lng: -78.9109, addr: '5122 Revere Rd, Durham, NC 27713', website: 'https://www.jiar.org', terms: ['parkwood', 'revere rd'], iqama: true, sort: 6 },
      { name: 'Apex Masjid', lat: 35.7294, lng: -78.8415, addr: '733 Center St, Apex, NC 27502', website: null, terms: ['apex masjid', 'center st, apex'], iqama: false, sort: 7 },
      { name: 'Ar-Razzaq Islamic Center', lat: 35.9966, lng: -78.9155, addr: '1920 Chapel Hill Rd, Durham, NC 27707', website: null, terms: ['ar-razzaq', 'arrazzaq', 'chapel hill rd, durham'], iqama: false, sort: 8 },
      { name: 'As-Salaam Islamic Center', lat: 35.7781, lng: -78.6075, addr: '110 Lord Anson Dr, Raleigh, NC 27610', website: 'https://www.assalaam.org', terms: ['as-salaam', 'assalaam', 'lord anson'], iqama: false, sort: 9 },
      { name: 'Chapel Hill Islamic Society', lat: 35.9406, lng: -79.0164, addr: '1717 Legion Rd, Chapel Hill, NC 27517', website: 'https://www.chapelhillmasjid.org', terms: ['chapel hill islamic', 'legion rd'], iqama: false, sort: 10 },
      { name: 'Islamic Center of Cary', lat: 35.7731, lng: -78.8028, addr: '1155 W Chatham St, Cary, NC 27511', website: 'https://www.icocary.org', terms: ['islamic center of cary', 'chatham st'], iqama: false, sort: 11 },
      { name: 'Masjid King Khalid', lat: 35.7693, lng: -78.6383, addr: '130 Martin Luther King Jr Blvd, Raleigh, NC 27601', website: null, terms: ['king khalid', 'martin luther king'], iqama: false, sort: 12 },
      { name: 'North Raleigh Masjid', lat: 35.8520, lng: -78.5571, addr: '7424 Deah Way, Raleigh, NC 27616', website: null, terms: ['north raleigh masjid', 'deah way', 'mycc', 'muslim youth community center'], iqama: false, sort: 13 },
      { name: 'San Ramon Valley Islamic Center', lat: 37.7770, lng: -121.9691, addr: '2230 Camino Ramon, San Ramon, CA 94583', website: 'https://srvic.org', terms: ['srvic', 'san ramon valley islamic', 'camino ramon'], iqama: true, sort: 14 },
      { name: 'Muslim Community Association', lat: 37.3769, lng: -121.9595, addr: '3003 Scott Blvd, Santa Clara, CA 95054', website: 'https://www.mcabayarea.org', terms: ['mca', 'muslim community association', 'scott blvd', 'mcabayarea'], iqama: true, sort: 15 },
      { name: 'MCA Al-Noor', lat: 37.3530, lng: -121.9535, addr: '1755 Catherine St, Santa Clara, CA 95050', website: 'https://www.mcabayarea.org', terms: ['mca al-noor', 'mca alnoor', 'mca noor', 'catherine st'], iqama: true, sort: 16 },
    ];
    for (const m of masjidUpserts) {
      await pool.query(
        `INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, address=EXCLUDED.address, website=EXCLUDED.website, match_terms=EXCLUDED.match_terms, has_iqama=EXCLUDED.has_iqama, sort_order=EXCLUDED.sort_order, updated_at=NOW()`,
        [m.name, m.lat, m.lng, m.addr, m.website, m.terms, m.iqama, m.sort]
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

      await pool.query(
        `INSERT INTO halal_restaurants (external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      address VARCHAR(500) NOT NULL,
      phone VARCHAR(50) DEFAULT '',
      website VARCHAR(500) DEFAULT '',
      submitted_by_email VARCHAR(255) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);`);

  const colCheck = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'place_id'`);
  if (colCheck.rows.length === 0) {
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS rating DECIMAL(2,1)`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS photo_reference TEXT`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_hours JSONB`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    console.log("[DB] Added Google Places columns to businesses table");
  }

  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_url TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ALTER COLUMN address DROP NOT NULL`);
  await pool.query(`ALTER TABLE businesses ALTER COLUMN address SET DEFAULT ''`);

  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS specialty VARCHAR(255) DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_url TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS search_tags TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS member_note TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hospital_affiliation TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instagram_url TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS instagram_url TEXT DEFAULT ''`);

  await pool.query(`UPDATE businesses SET specialty = 'Optometry' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND (name ILIKE '%OD%' OR name ILIKE '%MyEyeDr%')`);
  await pool.query(`UPDATE businesses SET specialty = 'Dermatology' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND name ILIKE '%Dermatology%'`);
  await pool.query(`UPDATE businesses SET specialty = 'Dentistry' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND name ILIKE '%Dentistry%'`);

  await pool.query(`UPDATE businesses SET website = 'https://curatestudioevents.com/' WHERE name ILIKE '%Curate Studio%' AND (website IS NULL OR website = '')`);
  await pool.query(`UPDATE businesses SET category = 'Services' WHERE category = 'Finance'`);
  await pool.query(`UPDATE businesses SET category = 'Services' WHERE category = 'Technology'`);
  await pool.query(`UPDATE businesses SET category = 'Events', keywords = ARRAY['Venue'] WHERE name ILIKE '%Curate Studio%' AND category != 'Events'`);

  const attorneyDupes = [
    "Mousa Alshanteer, Associate Attorney - Brooks Pierce",
    "Ayeshinaye Smith, Esq. - Smith Dominguez, PLLC",
    "The Law Office of Neubia L. Harris, PLLC",
    "Safwan Ali - Ali Law Firm PLLC",
    "Omar Baloch - The Law Offices of Omar Baloch, PLLC",
    "Nigel Edwards - The Law Offices of Omar Baloch, PLLC",
    "Pooyan Ordoubadi - Law Office of Pooyan Ordoubadi",
    "Sammy Naji - Triangle Legal",
    "Nada Mohamed - Law Office of Nada Mohamed, PLLC",
    "Hay'ralah Alghorazi - Triangle Legal",
  ];
  for (const dupeName of attorneyDupes) {
    await pool.query("DELETE FROM businesses WHERE name = $1", [dupeName]);
  }

  const attorneySeeds = [
    { name: "Mousa Alshanteer, Associate Attorney - Brooks Pierce", match: "Mousa Alshanteer", desc: "Healthcare, Business, Corporate, Mergers & Acquisitions, Transactional", addr: "230 North Elm Street, 2000 Renaissance Plaza, Greensboro, NC 27401", phone: "(336) 373-8850", web: "https://www.brookspierce.com/people-mousa-alshanteer" },
    { name: "The Law Office of Neubia L. Harris, PLLC", match: "Neubia", desc: "Education Law, Civil Rights", addr: "312 W. Millbrook Road, Ste. 141, Raleigh, NC 27609", phone: "(919) 526-0500", web: "https://www.neubiaharrislaw.com" },
    { name: "Patterson Harkavy LLP", match: "Patterson Harkavy", desc: "Civil Rights, Employment, Workers' Compensation, Labor, Police Misconduct", addr: "100 Europa Drive, Suite 420, Chapel Hill, NC 27517", phone: "(919) 942-5200", web: "https://www.pathlaw.com" },
    { name: "Ayeshinaye Smith, Esq. - Smith Dominguez, PLLC", match: "Ayeshinaye", desc: "Family Law, Estates (Planning, Administration, and Guardianship)", addr: "4816 Six Forks Road, Suite 202, Raleigh, NC 27609", phone: "(919) 390-3512", web: "https://www.smithdominguez.com" },
    { name: "The Law Office of Derrick J. Hensley, PLLC", match: "Hensley", desc: "Child Welfare/Adoptions, Immigration, International Family Law", addr: "401 Meadowlands Dr. Ste. 201, Hillsborough, NC 27278", phone: "(919) 480-1999", web: "https://www.LODJH.com" },
    { name: "Safwan Ali - Ali Law Firm PLLC", match: "Safwan Ali", desc: "Immigration, Traffic", addr: "PO Box 1046, Henderson, NC 27536", phone: "(919) 213-1945", web: "https://www.alilawfirm.net" },
    { name: "Omar Baloch - The Law Offices of Omar Baloch, PLLC", match: "Omar Baloch", desc: "Immigration", addr: "8801 Fast Park Drive, Suite 313, Raleigh, NC 27617", phone: "(919) 834-3535", web: "https://www.balochlaw.com" },
    { name: "Nigel Edwards - The Law Offices of Omar Baloch, PLLC", match: "Nigel Edwards", desc: "Immigration (excluding business immigration)", addr: "8801 Fast Park Drive, Suite 313, Raleigh, NC 27617", phone: "(919) 834-3535", web: "https://www.balochlaw.com" },
    { name: "Pooyan Ordoubadi - Law Office of Pooyan Ordoubadi", match: "Pooyan Ordoubadi", desc: "Immigration (Removal Defense and Federal Appeals), Criminal Defense, Family Law", addr: "33 Hillsboro Street, Pittsboro, NC 27312", phone: "(919) 351-1101", web: "https://pordolaw.com" },
    { name: "Sammy Naji - Triangle Legal", match: "Sammy Naji", desc: "Personal Injury, Wills, Trusts, Litigation, Business Law", addr: "2500 Regency Parkway, Cary, NC 27518", phone: "(919) 590-3647", web: "https://www.triangle.legal/" },
    { name: "Nada Mohamed - Law Office of Nada Mohamed, PLLC", match: "Nada Mohamed", desc: "Estate Planning, Real Estate Transactions", addr: "64 Forest View Place, Durham, NC 27713", phone: "(919) 808-0067", web: "https://nrmlawoffice.com" },
    { name: "Hay'ralah Alghorazi - Triangle Legal", match: "Alghorazi", desc: "Estate Planning", addr: "2500 Regency Parkway, Cary, NC 27518", phone: "(919) 590-3647", web: "https://www.triangle.legal/" },
  ];
  for (const a of attorneySeeds) {
    const exists = await pool.query("SELECT id FROM businesses WHERE name ILIKE $1", ['%' + a.match + '%']);
    if (exists.rows.length === 0) {
      await pool.query(
        "INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, status, member_note, search_tags, place_id) VALUES ($1, 'Services', $2, $3, $4, $5, 'admin@salamyall.net', 'approved', 'Member of NC Muslim Bar', '{lawyer,attorney,legal}', 'none')",
        [a.name, a.desc, a.addr, a.phone, a.web]
      );
    }
  }
  const allAttorneyNames = attorneySeeds.map(a => a.match);
  const matchConditions = allAttorneyNames.map((_, i) => `name ILIKE '%' || $${i+1} || '%'`).join(' OR ');
  await pool.query(`UPDATE businesses SET member_note = 'Member of NC Muslim Bar', search_tags = '{lawyer,attorney,legal}', place_id = 'none' WHERE ${matchConditions}`, allAttorneyNames);

  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS photo_reference TEXT`);
  await pool.query(`ALTER TABLE halal_restaurants ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)`);

  const { rows } = await pool.query("SELECT COUNT(*) as count FROM businesses");
  if (parseInt(rows[0].count) === 0) {
    const seed = [
      { name: "Neomonde Mediterranean", category: "Restaurant", description: "Authentic Mediterranean bakery and restaurant with fresh pita and shawarma.", address: "9610 Forum Dr, Raleigh, NC 27615", phone: "(919) 861-4860", website: "https://neomonde.com" },
      { name: "Bosphorus Turkish Cuisine", category: "Restaurant", description: "Family-owned Turkish restaurant offering traditional kebabs and mezes.", address: "907 W Main St, Durham, NC 27701", phone: "(919) 682-0007", website: "" },
      { name: "Al-Amir Halal Meat & Grocery", category: "Grocery", description: "Full-service halal grocery with fresh meats, spices, and imported goods.", address: "1205 E Chatham St, Cary, NC 27511", phone: "(919) 467-2220", website: "" },
      { name: "Jasmin & Olivz Mediterranean Bistro", category: "Restaurant", description: "Fast-casual Mediterranean cuisine with bowls, wraps, and platters.", address: "8111 Tryon Woods Dr, Cary, NC 27518", phone: "(919) 439-0099", website: "https://jasminandolivz.com" },
      { name: "Noor Islamic Finance", category: "Finance", description: "Sharia-compliant financial advisory and home financing services.", address: "3700 National Dr, Raleigh, NC 27612", phone: "(919) 555-0123", website: "" },
      { name: "Kabob & Curry", category: "Restaurant", description: "Pakistani and Indian cuisine with halal meats and traditional recipes.", address: "4512 Falls of Neuse Rd, Raleigh, NC 27609", phone: "(919) 790-9992", website: "" },
      { name: "Salam Boutique", category: "Retail", description: "Modest fashion boutique with hijabs, abayas, and Islamic gifts.", address: "2020 Walnut St, Cary, NC 27518", phone: "(919) 555-0456", website: "" },
      { name: "Tariqa Auto Services", category: "Automotive", description: "Muslim-owned auto repair and maintenance shop, fair pricing guaranteed.", address: "1400 Buck Jones Rd, Raleigh, NC 27606", phone: "(919) 555-0789", website: "" },
      { name: "Baraka Realty", category: "Real Estate", description: "Muslim-friendly real estate services for homes near masjids and Islamic schools.", address: "5000 Falls of Neuse Rd, Raleigh, NC 27609", phone: "(919) 555-0321", website: "" },
      { name: "Mediterranean Deli", category: "Restaurant", description: "Bakery and deli with halal options, fresh bread, and imported Mediterranean goods.", address: "410 W Franklin St, Chapel Hill, NC 27516", phone: "(919) 967-2666", website: "https://mediterraneandeli.com" },
    ];
    for (const b of seed) {
      await pool.query(
        `INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, status) VALUES ($1, $2, $3, $4, $5, $6, 'admin@salamyall.net', 'approved')`,
        [b.name, b.category, b.description, b.address, b.phone, b.website]
      );
    }
    console.log(`[DB] Seeded ${seed.length} businesses`);
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
}

export async function registerRoutes(app: Express): Promise<Server> {
  startAutoRefresh();

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
  await ensureJanazaAlertsTable(pool).catch(err => console.error("[DB] Janaza alerts table init error:", err.message));
  await ensureUserAccountsTable(pool).catch(err => console.error("[DB] User accounts table init error:", err.message));
  await ensureUserRatingsTable(pool).catch(err => console.error("[DB] User ratings table init error:", err.message));
  await ensureHalalCheckinsTable(pool).catch(err => console.error("[DB] Halal checkins table init error:", err.message));
  await ensureRestaurantSubmissionsTable(pool).catch(err => console.error("[DB] Restaurant submissions table init error:", err.message));
  await ensureCommunityEventsTable(pool).catch(err => console.error("[DB] Community events table init error:", err.message));

  startHalalAutoSync(pool);
  startIqamaSync(pool);

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
      return rows.map((r: any) => ({
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
      }));
    } catch (err: any) {
      console.error("[Events] Error fetching community events:", err.message);
      return [];
    }
  }

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

  app.get("/api/events", async (req, res) => {
    try {
      const now = Date.now();
      let events: CachedEvent[];
      if (cachedEvents.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
        events = cachedEvents;
      } else {
        events = await fetchAndCacheEvents();
      }
      const withOverrides = await applyEventOverrides(events);
      const communityEvents = await getCommunityEvents(req);
      const allEvents = [...withOverrides, ...communityEvents].sort((a, b) => {
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

  app.post("/api/events/refresh", async (_req, res) => {
    try {
      const events = await fetchAndCacheEvents();
      const withOverrides = await applyEventOverrides(events);
      res.json({ refreshed: true, count: withOverrides.length });
    } catch (error: any) {
      console.error("Error refreshing events:", error.message);
      res.status(500).json({ error: "Failed to refresh events" });
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
        "SELECT id, name, category, description, address, phone, website, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, specialty, keywords, photo_url, booking_url, search_tags, member_note, hospital_affiliation, instagram_url FROM businesses WHERE status = 'approved' AND category != 'Restaurant' ORDER BY name"
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

      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching businesses:", error.message);
      res.status(500).json({ error: "Failed to fetch businesses" });
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
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No API key" });

      const photoUrl = `https://places.googleapis.com/v1/${biz.rows[0].photo_reference}/media?maxWidthPx=800&key=${apiKey}`;
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) return res.status(404).json({ error: "Photo not found" });

      res.set("Content-Type", photoResp.headers.get("content-type") || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await photoResp.arrayBuffer());
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
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No API key" });

      const photoUrl = `https://places.googleapis.com/v1/${result.rows[0].photo_reference}/media?maxWidthPx=800&key=${apiKey}`;
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) return res.status(404).json({ error: "Photo not found" });

      res.set("Content-Type", photoResp.headers.get("content-type") || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await photoResp.arrayBuffer());
      res.send(buffer);
    } catch (error: any) {
      console.error("Error proxying halal photo:", error.message);
      res.status(500).json({ error: "Failed to load photo" });
    }
  });

  app.post("/api/analytics/event", async (req, res) => {
    try {
      const { event_name, event_data, device_id, platform } = req.body;
      if (!event_name || typeof event_name !== "string") {
        return res.status(400).json({ error: "event_name required" });
      }
      await pool.query(
        "INSERT INTO analytics_events (event_name, event_data, device_id, platform) VALUES ($1, $2, $3, $4)",
        [event_name.slice(0, 100), event_data || null, device_id?.slice(0, 100) || null, platform?.slice(0, 20) || null]
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
        values.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`);
        params.push(evt.event_name.slice(0, 100), evt.event_data || null, evt.device_id?.slice(0, 100) || null, evt.platform?.slice(0, 20) || null);
      }
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO analytics_events (event_name, event_data, device_id, platform) VALUES ${values.join(", ")}`,
          params
        );
      }
      res.status(201).json({ ok: true, count: values.length });
    } catch (error: any) {
      console.error("[Analytics] Batch error:", error.message);
      res.status(500).json({ error: "Failed to log events" });
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

  app.post("/api/businesses/submit", async (req, res) => {
    try {
      const { name, category, description, address, phone, website, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation, instagram_url } = req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Name and category are required" });
      }

      const validCategories = ["Restaurant", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Events", "Creator"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      if ((category === "Healthcare" || category === "Events" || category === "Creator") && !specialty) {
        return res.status(400).json({ error: "Specialty/type is required for " + category });
      }

      const keywordsArray = Array.isArray(keywords) ? keywords : [];

      const result = await pool.query(
        `INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation, instagram_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
         RETURNING id`,
        [name, category, description || "", address || "", phone || "", website || "", "", google_url || "", specialty || "", keywordsArray, photo_url || "", booking_url || "", hospital_affiliation || "", instagram_url || ""]
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
      const { name, category, description, address, phone, website, google_url, specialty, keywords, instagram_url, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
      if (!category) return res.status(400).json({ error: "Category is required" });
      const validCategories = ["Restaurant", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Events", "Creator"];
      if (!validCategories.includes(category)) return res.status(400).json({ error: "Invalid category" });
      const keywordsArray = Array.isArray(keywords) ? keywords : [];
      const result = await pool.query(
        `INSERT INTO businesses (name, category, description, address, phone, website, google_url, specialty, keywords, instagram_url, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, submitted_by_email, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'admin@salamyall.net', 'approved') RETURNING id, name`,
        [
          name.trim(),
          category,
          description || "",
          address || "",
          phone || "",
          website || "",
          google_url || "",
          specialty || "",
          keywordsArray,
          instagram_url || "",
          place_id || null,
          rating || null,
          user_ratings_total || null,
          photo_reference || null,
          business_hours ? JSON.stringify(business_hours) : null,
          lat || null,
          lng || null,
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
        "SELECT id, name, category, description, address, phone, website, submitted_by_email, status, created_at, specialty, keywords, photo_url, booking_url, hospital_affiliation, member_note, search_tags, place_id, google_url, instagram_url FROM businesses WHERE status = $1 ORDER BY created_at DESC",
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

  setTimeout(() => dailyBusinessEnrichment(), 15000);
  setTimeout(() => dailyHalalEnrichment(), 30000);
  setInterval(() => dailyBusinessEnrichment(), 24 * 60 * 60 * 1000);
  setInterval(() => dailyHalalEnrichment(), 24 * 60 * 60 * 1000);

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
      const { name, category, description, address, phone, website, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation, member_note, search_tags, disable_enrichment, instagram_url } = req.body;
      const validCats = ["Restaurant", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Events", "Creator"];
      if (category !== undefined && !validCats.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(String(name).substring(0, 255)); }
      if (category !== undefined) { fields.push(`category = $${idx++}`); values.push(category); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(String(description).substring(0, 1000)); }
      if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(String(address).substring(0, 500)); }
      if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(String(phone).substring(0, 50)); }
      if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(String(website).substring(0, 500)); }
      if (google_url !== undefined) { fields.push(`google_url = $${idx++}`); values.push(String(google_url).substring(0, 500)); }
      if (specialty !== undefined) { fields.push(`specialty = $${idx++}`); values.push(String(specialty).substring(0, 255)); }
      if (keywords !== undefined) { fields.push(`keywords = $${idx++}`); values.push(Array.isArray(keywords) ? keywords : []); }
      if (photo_url !== undefined) { fields.push(`photo_url = $${idx++}`); values.push(String(photo_url).substring(0, 500)); }
      if (booking_url !== undefined) { fields.push(`booking_url = $${idx++}`); values.push(String(booking_url).substring(0, 500)); }
      if (hospital_affiliation !== undefined) { fields.push(`hospital_affiliation = $${idx++}`); values.push(String(hospital_affiliation).substring(0, 255)); }
      if (member_note !== undefined) { fields.push(`member_note = $${idx++}`); values.push(String(member_note).substring(0, 255)); }
      if (search_tags !== undefined) { fields.push(`search_tags = $${idx++}`); values.push(Array.isArray(search_tags) ? search_tags : []); }
      if (instagram_url !== undefined) { fields.push(`instagram_url = $${idx++}`); values.push(String(instagram_url).substring(0, 500)); }
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
  const adminHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "admin.html"),
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

  app.get("/api/admin/events", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const now = Date.now();
      let events: CachedEvent[];
      if (cachedEvents.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
        events = cachedEvents;
      } else {
        events = await fetchAndCacheEvents();
      }
      const withOverrides = await applyEventOverrides(events);
      const { rows: overrides } = await pool.query("SELECT event_id FROM event_overrides");
      const overrideSet = new Set(overrides.map((o: any) => o.event_id));
      const enriched = withOverrides.map(e => ({ ...e, hasOverride: overrideSet.has(e.id) }));
      res.json(enriched);
    } catch (error: any) {
      console.error("Error fetching admin events:", error.message);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.put("/api/admin/events/:eventId", async (req, res) => {
    try {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
      const eventId = req.params.eventId;
      const { title, description, location, start_time, end_time, organizer, image_url, registration_url } = req.body;
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

  app.get("/app", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(downloadHtml);
  });

  app.get("/admin", (_req, res) => {
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

      const { restaurantId, comment } = req.body;
      if (!restaurantId) {
        return res.status(400).json({ error: "restaurantId is required" });
      }

      await pool.query(
        "INSERT INTO halal_checkins (user_id, restaurant_id, comment) VALUES ($1, $2, $3)",
        [userId, parseInt(restaurantId), comment || null]
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
        "SELECT hc.created_at, hc.comment, ua.display_name FROM halal_checkins hc JOIN user_accounts ua ON hc.user_id = ua.id WHERE hc.restaurant_id = $1 ORDER BY hc.created_at DESC LIMIT 5",
        [restaurantId]
      );
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM halal_checkins WHERE restaurant_id = $1",
        [restaurantId]
      );

      res.json({
        checkins: latestResult.rows.map((r: any) => ({
          date: r.created_at,
          comment: r.comment,
          displayName: r.display_name,
        })),
        totalCheckins: parseInt(countResult.rows[0].count),
        lastCheckin: latestResult.rows[0]?.created_at || null,
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

      const result = await pool.query(
        `INSERT INTO restaurant_submissions (user_id, google_maps_url, name, address, place_id, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, googleMapsUrl, name || null, address || null, placeId || null, lat || null, lng || null]
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
      if (lat != null && lng != null && typeof lat === "number" && typeof lng === "number") {
        await pool.query(
          `INSERT INTO push_tokens (token, lat, lng) VALUES ($1, $2, $3)
           ON CONFLICT (token) DO UPDATE SET lat = $2, lng = $3`,
          [token, lat, lng]
        );
      } else {
        await pool.query(
          `INSERT INTO push_tokens (token) VALUES ($1) ON CONFLICT (token) DO NOTHING`,
          [token]
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
      const { title, body } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: "Title and body are required" });
      }
      const result = await pool.query("SELECT token FROM push_tokens");
      const tokens = result.rows.map((r: any) => r.token);
      if (!tokens.length) {
        return res.json({ sent: 0, message: "No devices registered for push notifications" });
      }
      const pushResult = await sendPushToTokens(tokens, title, body);
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
        "SELECT id, name, latitude, longitude, address, website, match_terms, has_iqama FROM masjids WHERE active = true ORDER BY sort_order, name"
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
      const { rows } = await pool.query("SELECT * FROM masjids ORDER BY sort_order, name");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch masjids" });
    }
  });

  app.post("/api/admin/masjids", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { name, latitude, longitude, address, website, match_terms, has_iqama, sort_order } = req.body;
      if (!name || !latitude || !longitude || !address) {
        return res.status(400).json({ error: "name, latitude, longitude, and address are required" });
      }
      const { rows } = await pool.query(
        `INSERT INTO masjids (name, latitude, longitude, address, website, match_terms, has_iqama, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, latitude, longitude, address, website || null, match_terms || [], has_iqama || false, sort_order || 0]
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
      const { name, latitude, longitude, address, website, match_terms, has_iqama, active, sort_order } = req.body;
      const { rows } = await pool.query(
        `UPDATE masjids SET name = COALESCE($1, name), latitude = COALESCE($2, latitude), longitude = COALESCE($3, longitude),
         address = COALESCE($4, address), website = CASE WHEN $5::boolean THEN $6 ELSE website END, match_terms = COALESCE($7, match_terms),
         has_iqama = COALESCE($8, has_iqama), active = COALESCE($9, active), sort_order = COALESCE($10, sort_order),
         updated_at = NOW() WHERE id = $11 RETURNING *`,
        [name, latitude, longitude, address, website !== undefined, website !== undefined ? (website || null) : null, match_terms, has_iqama, active, sort_order, id]
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

  app.get("/api/jumuah-schedules", async (_req, res) => {
    try {
      const pool = getDbPool();
      const result = await pool.query(
        "SELECT id, masjid, khutbah_time, iqama_time, speaker, topic FROM jumuah_schedules WHERE active = true ORDER BY sort_order ASC"
      );
      res.json(result.rows);
      pool.end();
    } catch (error: any) {
      console.error("Error fetching jumuah schedules:", error.message);
      res.status(500).json({ error: "Failed to fetch jumuah schedules" });
    }
  });

  app.get("/api/admin/jumuah", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const pool = getDbPool();
      const result = await pool.query("SELECT * FROM jumuah_schedules ORDER BY sort_order ASC");
      res.json(result.rows);
      pool.end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/jumuah", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { masjid, khutbah_time, iqama_time, speaker, topic, sort_order } = req.body;
      if (!masjid || !khutbah_time || !iqama_time) {
        return res.status(400).json({ error: "masjid, khutbah_time, and iqama_time are required" });
      }
      const pool = getDbPool();
      const result = await pool.query(
        "INSERT INTO jumuah_schedules (masjid, khutbah_time, iqama_time, speaker, topic, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        [masjid, khutbah_time, iqama_time, speaker || null, topic || null, sort_order || 0]
      );
      res.json(result.rows[0]);
      pool.end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/jumuah/:id", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { id } = req.params;
      const { masjid, khutbah_time, iqama_time, speaker, topic, active, sort_order } = req.body;
      const pool = getDbPool();
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
      params.push(id);
      const result = await pool.query(
        `UPDATE jumuah_schedules SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(result.rows[0]);
      pool.end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/jumuah/:id", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const pool = getDbPool();
      await pool.query("DELETE FROM jumuah_schedules WHERE id = $1", [req.params.id]);
      res.json({ success: true });
      pool.end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  let weatherCache: { data: any; timestamp: number; key: string } | null = null;
  const tafsirCache = new Map<string, { data: any; timestamp: number }>();
  const TAFSIR_CACHE_MS = 24 * 60 * 60 * 1000;

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

  const sharePageStyles = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;background:#0A1F16;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:24px}
    .brand svg{width:32px;height:32px}
    .brand-name{font-size:20px;font-weight:700;color:#D4A843;letter-spacing:0.5px}
    .card{max-width:420px;width:100%;background:linear-gradient(145deg,#142E22 0%,#0F2A1E 100%);border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(27,107,74,0.2)}
    .card-image{width:100%;height:200px;object-fit:cover}
    .card-image-placeholder{width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1B6B4A 0%,#0F3D2B 100%);font-size:48px}
    .card-body{padding:24px}
    .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px}
    .badge-event{background:rgba(27,107,74,0.25);color:#34D399;border:1px solid rgba(27,107,74,0.4)}
    .badge-restaurant{background:rgba(212,168,67,0.15);color:#D4A843;border:1px solid rgba(212,168,67,0.3)}
    .badge-business{background:rgba(99,102,241,0.15);color:#A5B4FC;border:1px solid rgba(99,102,241,0.3)}
    .badge-halal{background:rgba(34,197,94,0.15);color:#4ADE80;border:1px solid rgba(34,197,94,0.3);margin-left:6px}
    h1{font-size:22px;font-weight:700;line-height:1.3;margin-bottom:8px;color:#F5F5F5}
    .meta{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
    .meta-row{display:flex;align-items:center;gap:8px;font-size:13px;color:#9CA3AF}
    .meta-row svg{width:14px;height:14px;flex-shrink:0;fill:#6B7280}
    .desc{font-size:14px;color:#9CA3AF;line-height:1.6;margin-bottom:20px}
    .rating{display:flex;align-items:center;gap:4px;font-size:13px;color:#D4A843;margin-bottom:12px}
    .cta{display:block;text-align:center;background:linear-gradient(135deg,#1B6B4A 0%,#15573D 100%);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:16px;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 4px 12px rgba(27,107,74,0.3)}
    .cta:active{transform:scale(0.98)}
    .get-app{display:block;text-align:center;margin-top:12px;font-size:13px;color:#6B7280;text-decoration:none}
    .get-app:hover{color:#9CA3AF}
    .footer{margin-top:24px;font-size:11px;color:#4B5563;text-align:center}
  `;

  const crescentSvg = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z" fill="#1B6B4A"/><path d="M18.5 6C13.806 6 10 9.806 10 14.5S13.806 23 18.5 23c1.908 0 3.666-.63 5.084-1.693A10.96 10.96 0 0116 24C10.477 24 6 19.523 6 14S10.477 4 16 4c2.761 0 5.262 1.143 7.044 2.98A8.45 8.45 0 0018.5 6z" fill="#D4A843"/><circle cx="22" cy="8" r="1.5" fill="#D4A843"/></svg>`;

  const calendarSvg = `<svg viewBox="0 0 14 14"><rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M1 5.5h12" stroke="#6B7280" stroke-width="1.2"/><path d="M4.5 1v3M9.5 1v3" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  const pinSvg = `<svg viewBox="0 0 14 14"><path d="M7 1.5C4.79 1.5 3 3.29 3 5.5 3 8.75 7 12.5 7 12.5s4-3.75 4-7c0-2.21-1.79-4-4-4zm0 5.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" fill="#6B7280"/></svg>`;
  const clockSvg = `<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M7 4v3.5l2.5 1.5" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const personSvg = `<svg viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="#6B7280" stroke-width="1.2" fill="none"/><path d="M2.5 12.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="#6B7280" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg>`;
  const starSvg = `<svg viewBox="0 0 14 14" width="14" height="14"><path d="M7 1l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.07l-3.52 1.78.67-3.93L1.3 5.14l3.94-.57L7 1z" fill="#D4A843"/></svg>`;

  function formatShareDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }
  function formatShareTime(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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

      const dateStr = event ? formatShareDate(event.start) : "";
      const timeStr = event ? `${formatShareTime(event.start)}${event.end ? " – " + formatShareTime(event.end) : ""}` : "";
      const location = event?.location || "";
      const organizer = event?.organizer || "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
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
  <style>${sharePageStyles}</style>
</head>
<body>
  <div class="brand">${crescentSvg}<span class="brand-name">Salam Y'all</span></div>
  <div class="card">
    ${imageUrl ? `<img class="card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}">` : `<div class="card-image-placeholder">📅</div>`}
    <div class="card-body">
      <span class="badge badge-event">Event</span>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        ${dateStr ? `<div class="meta-row">${calendarSvg}<span>${escapeHtml(dateStr)}</span></div>` : ""}
        ${timeStr ? `<div class="meta-row">${clockSvg}<span>${escapeHtml(timeStr)}</span></div>` : ""}
        ${location ? `<div class="meta-row">${pinSvg}<span>${escapeHtml(location)}</span></div>` : ""}
        ${organizer ? `<div class="meta-row">${personSvg}<span>${escapeHtml(organizer)}</span></div>` : ""}
      </div>
      ${description ? `<p class="desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="cta" id="open">Open in Salam Y'all</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="footer">Salam Y'all — Your Triangle Muslim Community App</div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/restaurant/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, formatted_address, halal_comment, is_halal, rating, user_ratings_total, cuisine_types, emoji FROM halal_restaurants WHERE id = $1", [id]);
      const restaurant = result.rows[0];
      const title = restaurant ? restaurant.name : "Halal Restaurant";
      const description = restaurant
        ? (restaurant.halal_comment || restaurant.formatted_address || `${restaurant.is_halal === "IS_HALAL" ? "Halal" : "Halal restaurant"} on Salam Y'all`)
        : "Check out this restaurant on Salam Y'all";
      const host = (req.get("host") || "salamyall.net").replace(/[^a-zA-Z0-9._:-]/g, "");
      const safeId = encodeURIComponent(id);
      const pageUrl = `https://${host}/share/restaurant/${safeId}`;
      const deepLink = `salamyall://restaurant/${safeId}`;

      const address = restaurant?.formatted_address || "";
      const rating = restaurant?.rating ? parseFloat(restaurant.rating) : 0;
      const totalRatings = restaurant?.user_ratings_total || 0;
      const emoji = restaurant?.emoji || "🍽️";
      const isHalal = restaurant?.is_halal === "IS_HALAL";
      const cuisines = restaurant?.cuisine_types || [];
      const cuisineLabel = cuisines.length > 0 ? cuisines[0].replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Salam Y'all">
  <meta property="og:image" content="https://${host}/assets/images/og-share.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://${host}/assets/images/og-share.png">
  <style>${sharePageStyles}</style>
</head>
<body>
  <div class="brand">${crescentSvg}<span class="brand-name">Salam Y'all</span></div>
  <div class="card">
    <div class="card-image-placeholder">${escapeHtml(emoji)}</div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="badge badge-restaurant">${escapeHtml(cuisineLabel || "Restaurant")}</span>
        ${isHalal ? `<span class="badge badge-halal">Halal</span>` : ""}
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${rating > 0 ? `<div class="rating">${starSvg}<span>${rating.toFixed(1)}</span><span style="color:#6B7280">(${totalRatings})</span></div>` : ""}
      <div class="meta">
        ${address ? `<div class="meta-row">${pinSvg}<span>${escapeHtml(address)}</span></div>` : ""}
      </div>
      ${description ? `<p class="desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="cta" id="open">Open in Salam Y'all</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="footer">Salam Y'all — Your Triangle Muslim Community App</div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/business/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, category, description, address, phone, website FROM businesses WHERE id = $1 AND status = 'approved'", [id]);
      const business = result.rows[0];
      const title = business ? business.name : "Local Business";
      const description = business
        ? (business.description || `${business.category} business in ${business.address || "the Triangle area"}`)
        : "Check out this business on Salam Y'all";
      const host = (req.get("host") || "salamyall.net").replace(/[^a-zA-Z0-9._:-]/g, "");
      const safeId = encodeURIComponent(id);
      const pageUrl = `https://${host}/share/business/${safeId}`;
      const deepLink = `salamyall://business/${safeId}`;

      const category = business?.category || "Business";
      const address = business?.address || "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Salam Y'all</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Salam Y'all">
  <meta property="og:image" content="https://${host}/assets/images/og-share.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="675">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://${host}/assets/images/og-share.png">
  <style>${sharePageStyles}</style>
</head>
<body>
  <div class="brand">${crescentSvg}<span class="brand-name">Salam Y'all</span></div>
  <div class="card">
    <div class="card-image-placeholder">🏢</div>
    <div class="card-body">
      <span class="badge badge-business">${escapeHtml(category)}</span>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        ${address ? `<div class="meta-row">${pinSvg}<span>${escapeHtml(address)}</span></div>` : ""}
      </div>
      ${description ? `<p class="desc">${escapeHtml(description.substring(0, 180))}${description.length > 180 ? "..." : ""}</p>` : ""}
      <a href="${deepLink}" class="cta" id="open">Open in Salam Y'all</a>
      <a href="https://apps.apple.com/us/app/salam-yall/id6760231963" class="get-app">Don't have the app? Get Salam Y'all</a>
    </div>
  </div>
  <div class="footer">Salam Y'all — Your Triangle Muslim Community App</div>
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
      const { image, mimeType } = req.body;
      if (!image) return res.status(400).json({ error: "Image data is required" });

      const mediaType = (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image,
              },
            },
            {
              type: "text",
              text: `Extract event details from this flyer image. Today's date is ${new Date().toISOString().split("T")[0]}. IMPORTANT: If the flyer does not specify a year, assume the next upcoming occurrence of that date (i.e. use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1}, whichever makes the date in the future). Also look carefully for any QR codes in the image — if you find one, decode it and use the URL as the registrationUrl. QR codes on event flyers typically link to registration or RSVP pages. If both a visible text URL and a QR code URL are present, prefer the QR code URL.

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

  app.post("/api/admin/events/publish", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { title, description, location, startTime, endTime, organizer, registrationUrl, image, imageMime } = req.body;
      if (!title || !startTime) return res.status(400).json({ error: "Title and start time are required" });

      const result = await pool.query(
        `INSERT INTO community_events (title, description, location, start_time, end_time, organizer, registration_url, image_data, image_mime, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')
         RETURNING id, title, start_time, status, created_at`,
        [title, description || null, location || null, new Date(startTime), endTime ? new Date(endTime) : null, organizer || null, registrationUrl || null, image || null, imageMime || "image/jpeg"]
      );
      console.log(`[Community Events] Published: "${title}" (ID ${result.rows[0].id})`);
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("[Community Events] Publish error:", error.message);
      res.status(500).json({ error: "Failed to publish event" });
    }
  });

  app.get("/api/admin/community-events", async (req, res) => {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { rows } = await pool.query(
        "SELECT id, title, description, location, start_time, end_time, organizer, registration_url, status, created_at, CASE WHEN image_data IS NOT NULL THEN true ELSE false END as has_image FROM community_events ORDER BY created_at DESC"
      );
      res.json(rows);
    } catch (error: any) {
      console.error("[Community Events] List error:", error.message);
      res.status(500).json({ error: "Failed to list community events" });
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
