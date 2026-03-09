import type { Express } from "express";
import { createServer, type Server } from "node:http";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { getUncachableGoogleCalendarClient } from "./google-calendar";
import halalSeedData from "./halal-seed-data.json";
import { ensureIqamaTable, seedJIARData, startIqamaSync, getIqamaSchedules } from "./iqama-scraper";

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

  await pool.query(`UPDATE businesses SET specialty = 'Optometry' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND (name ILIKE '%OD%' OR name ILIKE '%MyEyeDr%')`);
  await pool.query(`UPDATE businesses SET specialty = 'Dermatology' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND name ILIKE '%Dermatology%'`);
  await pool.query(`UPDATE businesses SET specialty = 'Dentistry' WHERE category = 'Healthcare' AND (specialty IS NULL OR specialty = '') AND name ILIKE '%Dentistry%'`);

  await pool.query(`UPDATE businesses SET website = 'https://curatestudioevents.com/' WHERE name ILIKE '%Curate Studio%' AND (website IS NULL OR website = '')`);

  const attorneySeeds = [
    { name: "Mousa Alshanteer, Associate Attorney - Brooks Pierce", desc: "Healthcare, Business, Corporate, Mergers & Acquisitions, Transactional", addr: "230 North Elm Street, 2000 Renaissance Plaza, Greensboro, NC 27401", phone: "(336) 373-8850", web: "https://www.brookspierce.com/people-mousa-alshanteer" },
    { name: "The Law Office of Neubia L. Harris, PLLC", desc: "Education Law, Civil Rights", addr: "312 W. Millbrook Road, Ste. 141, Raleigh, NC 27609", phone: "(919) 526-0500", web: "https://www.neubiaharrislaw.com" },
    { name: "Patterson Harkavy LLP", desc: "Civil Rights, Employment, Workers' Compensation, Labor, Police Misconduct", addr: "100 Europa Drive, Suite 420, Chapel Hill, NC 27517", phone: "(919) 942-5200", web: "https://www.pathlaw.com" },
    { name: "Ayeshinaye Smith, Esq. - Smith Dominguez, PLLC", desc: "Family Law, Estates (Planning, Administration, and Guardianship)", addr: "4816 Six Forks Road, Suite 202, Raleigh, NC 27609", phone: "(919) 390-3512", web: "https://www.smithdominguez.com" },
    { name: "The Law Office of Derrick J. Hensley, PLLC", desc: "Child Welfare/Adoptions, Immigration, International Family Law", addr: "401 Meadowlands Dr. Ste. 201, Hillsborough, NC 27278", phone: "(919) 480-1999", web: "https://www.LODJH.com" },
    { name: "Safwan Ali - Ali Law Firm PLLC", desc: "Immigration, Traffic", addr: "PO Box 1046, Henderson, NC 27536", phone: "(919) 213-1945", web: "https://www.alilawfirm.net" },
    { name: "Omar Baloch - The Law Offices of Omar Baloch, PLLC", desc: "Immigration", addr: "8801 Fast Park Drive, Suite 313, Raleigh, NC 27617", phone: "(919) 834-3535", web: "https://www.balochlaw.com" },
    { name: "Nigel Edwards - The Law Offices of Omar Baloch, PLLC", desc: "Immigration (excluding business immigration)", addr: "8801 Fast Park Drive, Suite 313, Raleigh, NC 27617", phone: "(919) 834-3535", web: "https://www.balochlaw.com" },
    { name: "Pooyan Ordoubadi - Law Office of Pooyan Ordoubadi", desc: "Immigration (Removal Defense and Federal Appeals), Criminal Defense, Family Law", addr: "33 Hillsboro Street, Pittsboro, NC 27312", phone: "(919) 351-1101", web: "https://pordolaw.com" },
    { name: "Sammy Naji - Triangle Legal", desc: "Personal Injury, Wills, Trusts, Litigation, Business Law", addr: "2500 Regency Parkway, Cary, NC 27518", phone: "(919) 590-3647", web: "https://www.triangle.legal/" },
    { name: "Nada Mohamed - Law Office of Nada Mohamed, PLLC", desc: "Estate Planning, Real Estate Transactions", addr: "64 Forest View Place, Durham, NC 27713", phone: "(919) 808-0067", web: "https://nrmlawoffice.com" },
    { name: "Hay'ralah Alghorazi - Triangle Legal", desc: "Estate Planning", addr: "2500 Regency Parkway, Cary, NC 27518", phone: "(919) 590-3647", web: "https://www.triangle.legal/" },
  ];
  for (const a of attorneySeeds) {
    const exists = await pool.query("SELECT id FROM businesses WHERE name = $1", [a.name]);
    if (exists.rows.length === 0) {
      await pool.query(
        "INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, status, member_note, search_tags, place_id) VALUES ($1, 'Services', $2, $3, $4, $5, 'admin@salamyall.net', 'approved', 'Member of NC Muslim Bar', '{lawyer,attorney,legal}', 'none')",
        [a.name, a.desc, a.addr, a.phone, a.web]
      );
    }
  }
  await pool.query(`UPDATE businesses SET member_note = 'Member of NC Muslim Bar', search_tags = '{lawyer,attorney,legal}', place_id = 'none' WHERE name IN (${attorneySeeds.map((_, i) => `$${i+1}`).join(',')})`, attorneySeeds.map(a => a.name));

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

export async function registerRoutes(app: Express): Promise<Server> {
  startAutoRefresh();

  const pool = getDbPool();
  await ensureJumuahTable(pool).catch(err => console.error("[DB] Jumuah table init error:", err.message));
  await ensureEventOverridesTable(pool).catch(err => console.error("[DB] Event overrides table init error:", err.message));
  await ensureTickerTable(pool).catch(err => console.error("[DB] Ticker table init error:", err.message));
  await ensurePushTokensTable(pool).catch(err => console.error("[DB] Push tokens table init error:", err.message));
  await ensureHalalRestaurantsTable(pool).catch(err => console.error("[DB] Halal restaurants table init error:", err.message));
  await ensureBusinessesTable(pool).catch(err => console.error("[DB] Init error:", err.message));
  await ensureIqamaTable(pool).catch(err => console.error("[DB] Iqama table init error:", err.message));
  await seedJIARData(pool).catch(err => console.error("[DB] JIAR seed error:", err.message));

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

  app.get("/api/events", async (_req, res) => {
    try {
      const now = Date.now();
      let events: CachedEvent[];
      if (cachedEvents.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
        events = cachedEvents;
      } else {
        events = await fetchAndCacheEvents();
      }
      const withOverrides = await applyEventOverrides(events);
      res.json(withOverrides);
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

  const ADMIN_KEY = process.env.ADMIN_KEY || process.env.SESSION_SECRET || "change-me-in-production";

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
      let query = "SELECT id, external_id, name, formatted_address, formatted_phone, url, lat, lng, is_halal, halal_comment, cuisine_types, emoji, evidence, considerations, opening_hours, rating, user_ratings_total, website, photo_reference, place_id FROM halal_restaurants";
      const conditions: string[] = [];
      const params: any[] = [];

      if (status && typeof status === "string" && ["IS_HALAL", "PARTIALLY_HALAL", "NOT_HALAL", "UNKNOWN"].includes(status)) {
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
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching halal restaurants:", error.message);
      res.status(500).json({ error: "Failed to fetch halal restaurants" });
    }
  });

  app.get("/api/businesses", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, category, description, address, phone, website, place_id, rating, user_ratings_total, photo_reference, business_hours, lat, lng, specialty, keywords, photo_url, booking_url, search_tags, member_note, hospital_affiliation FROM businesses WHERE status = 'approved' AND category != 'Restaurant' ORDER BY name"
      );
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

  app.post("/api/businesses/submit", async (req, res) => {
    try {
      const { name, category, description, address, phone, website, email, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation } = req.body;

      if (!name || !category || !email) {
        return res.status(400).json({ error: "Name, category, and email are required" });
      }

      if (!address && !google_url) {
        return res.status(400).json({ error: "Please provide either an address or a Google Maps URL" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      const validCategories = ["Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Technology"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      if (category === "Healthcare" && !specialty) {
        return res.status(400).json({ error: "Specialty is required for healthcare providers" });
      }

      const keywordsArray = Array.isArray(keywords) ? keywords : [];

      const result = await pool.query(
        `INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
         RETURNING id`,
        [name, category, description || "", address || "", phone || "", website || "", email, google_url || "", specialty || "", keywordsArray, photo_url || "", booking_url || "", hospital_affiliation || ""]
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
        "SELECT id, name, category, description, address, phone, website, submitted_by_email, status, created_at, specialty, keywords, photo_url, booking_url, hospital_affiliation, member_note, search_tags, place_id, google_url FROM businesses WHERE status = $1 ORDER BY created_at DESC",
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

      const missingHours = await pool.query(
        "SELECT id, name, place_id FROM halal_restaurants WHERE place_id IS NOT NULL AND place_id != 'none' AND opening_hours IS NULL LIMIT 50"
      );
      if (missingHours.rows.length > 0) {
        console.log(`[Halal Enrich] Backfilling hours for ${missingHours.rows.length} restaurants`);
        const hApiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (hApiKey) {
          const dayMap: Record<number, string> = {0:"SUNDAY",1:"MONDAY",2:"TUESDAY",3:"WEDNESDAY",4:"THURSDAY",5:"FRIDAY",6:"SATURDAY"};
          for (const r of missingHours.rows) {
            try {
              const detailResp = await fetch(
                `https://places.googleapis.com/v1/places/${r.place_id}`,
                { headers: { "X-Goog-Api-Key": hApiKey, "X-Goog-FieldMask": "regularOpeningHours" } }
              );
              const detailData = await detailResp.json();
              const roh = detailData.regularOpeningHours;
              if (roh && roh.periods) {
                const periods = roh.periods.map((p: any) => ({
                  open: { day: dayMap[p.open.day] || "MONDAY", time: [p.open.hour, p.open.minute] },
                  close: { day: dayMap[p.close.day] || "MONDAY", time: [p.close.hour, p.close.minute] },
                }));
                const hoursObj: any = { periods };
                if (roh.weekdayDescriptions) hoursObj.weekdayDescriptions = roh.weekdayDescriptions;
                await pool.query("UPDATE halal_restaurants SET opening_hours = $1::jsonb WHERE id = $2", [JSON.stringify(hoursObj), r.id]);
                console.log(`[Halal Enrich] Hours added for #${r.id} "${r.name}"`);
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
      const { name, category, description, address, phone, website, google_url, specialty, keywords, photo_url, booking_url, hospital_affiliation, member_note, search_tags, disable_enrichment } = req.body;
      const validCats = ["Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Technology"];
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
      const { token } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required" });
      }
      const isExpoToken = /^Expo(nent)?PushToken\[.+\]$/.test(token);
      if (!isExpoToken) {
        return res.status(400).json({ error: "Invalid push token format" });
      }
      await pool.query(
        `INSERT INTO push_tokens (token) VALUES ($1) ON CONFLICT (token) DO NOTHING`,
        [token]
      );
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
          }));
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(messages),
          });
          const data = await response.json() as any;
          const tickets = data.data || [];
          for (let i = 0; i < tickets.length; i++) {
            if (tickets[i].status === "ok") {
              sent++;
            } else if (tickets[i].details?.error === "DeviceNotRegistered") {
              expiredTokens.push(chunk[i]);
            }
          }
        } catch (err: any) {
          console.error("Push send error:", err.message);
        }
      }

      if (expiredTokens.length > 0) {
        await pool.query(
          "DELETE FROM push_tokens WHERE token = ANY($1)",
          [expiredTokens]
        );
      }

      res.json({ sent, total: tokens.length });
    } catch (error: any) {
      console.error("Error sending push:", error.message);
      res.status(500).json({ error: "Failed to send notifications" });
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

  app.get("/share/event/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const event = cachedEvents.find(e => e.id === id);
      const title = event ? event.title : "Community Event";
      const description = event
        ? (event.description || "").substring(0, 200) || `Event at ${event.organizer || "Salam Y'all"}`
        : "Check out this event on Salam Y'all";
      const imageUrl = event?.imageUrl || "";
      const host = req.get("host") || "salamyall.net";
      const pageUrl = `https://${host}/share/event/${id}`;
      const deepLink = `salamyall://event/${id}`;

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
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ""}
  <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0A1F16;color:#fff;text-align:center;padding:20px}
  .card{max-width:400px;background:#142E22;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
  h1{font-size:24px;margin:0 0 8px}p{color:#9CA3AF;font-size:14px;margin:0 0 24px;line-height:1.5}
  a{display:inline-block;background:#10B981;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;font-size:16px}</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description.substring(0, 150))}${description.length > 150 ? "..." : ""}</p>
    <a href="${deepLink}" id="open">Open in App</a>
  </div>
  <script>
    setTimeout(function(){window.location.href="${deepLink}"},500);
    setTimeout(function(){document.getElementById("open").textContent="Download Salam Y'all"},3000);
  </script>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/restaurant/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, formatted_address, halal_comment, is_halal FROM halal_restaurants WHERE id = $1", [id]);
      const restaurant = result.rows[0];
      const title = restaurant ? restaurant.name : "Halal Restaurant";
      const description = restaurant
        ? (restaurant.halal_comment || restaurant.formatted_address || `${restaurant.is_halal === "IS_HALAL" ? "Halal" : "Halal restaurant"} on Salam Y'all`)
        : "Check out this restaurant on Salam Y'all";
      const host = req.get("host") || "salamyall.net";
      const pageUrl = `https://${host}/share/restaurant/${id}`;
      const deepLink = `salamyall://restaurant/${id}`;

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
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0A1F16;color:#fff;text-align:center;padding:20px}
  .card{max-width:400px;background:#142E22;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
  h1{font-size:24px;margin:0 0 8px}p{color:#9CA3AF;font-size:14px;margin:0 0 24px;line-height:1.5}
  a{display:inline-block;background:#10B981;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;font-size:16px}</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description.substring(0, 150))}${description.length > 150 ? "..." : ""}</p>
    <a href="${deepLink}" id="open">Open in App</a>
  </div>
  <script>
    setTimeout(function(){window.location.href="${deepLink}"},500);
    setTimeout(function(){document.getElementById("open").textContent="Download Salam Y'all"},3000);
  </script>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
    }
  });

  app.get("/share/business/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query("SELECT id, name, category, description, address FROM businesses WHERE id = $1 AND status = 'approved'", [id]);
      const business = result.rows[0];
      const title = business ? business.name : "Local Business";
      const description = business
        ? (business.description || `${business.category} business in ${business.address || "the Triangle area"}`)
        : "Check out this business on Salam Y'all";
      const host = req.get("host") || "salamyall.net";
      const pageUrl = `https://${host}/share/business/${id}`;
      const deepLink = `salamyall://business/${id}`;

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
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0A1F16;color:#fff;text-align:center;padding:20px}
  .card{max-width:400px;background:#142E22;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
  h1{font-size:24px;margin:0 0 8px}p{color:#9CA3AF;font-size:14px;margin:0 0 24px;line-height:1.5}
  a{display:inline-block;background:#10B981;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;font-size:16px}</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description.substring(0, 150))}${description.length > 150 ? "..." : ""}</p>
    <a href="${deepLink}" id="open">Open in App</a>
  </div>
  <script>
    setTimeout(function(){window.location.href="${deepLink}"},500);
    setTimeout(function(){document.getElementById("open").textContent="Download Salam Y'all"},3000);
  </script>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error loading share page");
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
