import type { Express } from "express";
import { createServer, type Server } from "node:http";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { getUncachableGoogleCalendarClient } from "./google-calendar";

const CALENDAR_ID = "5c6138b3c670e90f28b9ec65a6650268569a070eff5ae0ae919129f763d216af@group.calendar.google.com";

const NAME_MATCHES: [string, string][] = [
  ["islamic association of raleigh", "Islamic Association of Raleigh"],
  ["iar masjid", "Islamic Association of Raleigh"],
  ["islamic center of morrisville", "Islamic Center of Morrisville"],
  ["icm,", "Islamic Center of Morrisville"],
  ["islamic center of cary", "Islamic Center of Cary"],
  ["masjid king khalid", "Masjid King Khalid"],
  ["shaw university mosque", "Masjid King Khalid"],
  ["as-salaam islamic", "As-Salaam Islamic Center"],
  ["north raleigh masjid", "North Raleigh Masjid"],
  ["al-noor islamic", "Al-Noor Islamic Center"],
  ["apex masjid", "Apex Masjid"],
  ["apex mosque", "Apex Masjid"],
  ["chapel hill islamic", "Chapel Hill Islamic Society"],
  ["ar-razzaq", "Ar-Razzaq Islamic Center"],
  ["jamaat ibad", "Jamaat Ibad Ar-Rahman"],
  ["jiar", "Jamaat Ibad Ar-Rahman"],
  ["parkwood masjid", "Parkwood Masjid (JIAR)"],
  ["rumman room", "Rumman Room"],
  ["light house project", "Lighthouse Project"],
  ["lighthouse project", "Lighthouse Project"],
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
  ["nw maynard", "Lighthouse Project"],
  ["kildaire farm", "Lighthouse Project"],
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
    location: event.location || "",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    isAllDay: !event.start?.dateTime,
    organizer: resolveOrganizer(event),
    imageUrl,
    registrationUrl,
  };
}

async function fetchAndCacheEvents(): Promise<CachedEvent[]> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: now.toISOString(),
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
        `INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, status) VALUES ($1, $2, $3, $4, $5, $6, 'admin@ummahconnect.app', 'approved')`,
        [b.name, b.category, b.description, b.address, b.phone, b.website]
      );
    }
    console.log(`[DB] Seeded ${seed.length} businesses`);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  startAutoRefresh();

  const pool = getDbPool();
  await ensureTickerTable(pool).catch(err => console.error("[DB] Ticker table init error:", err.message));
  await ensurePushTokensTable(pool).catch(err => console.error("[DB] Push tokens table init error:", err.message));
  await ensureBusinessesTable(pool).catch(err => console.error("[DB] Init error:", err.message));

  app.get("/api/events", async (_req, res) => {
    try {
      const now = Date.now();
      if (cachedEvents.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
        return res.json(cachedEvents);
      }
      const events = await fetchAndCacheEvents();
      res.json(events);
    } catch (error: any) {
      console.error("Error fetching calendar events:", error.message);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/events/refresh", async (_req, res) => {
    try {
      const events = await fetchAndCacheEvents();
      res.json({ refreshed: true, count: events.length });
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

  const ADMIN_KEY = process.env.SESSION_SECRET || "";

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

  app.get("/api/businesses", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, category, description, address, phone, website FROM businesses WHERE status = 'approved' ORDER BY name"
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching businesses:", error.message);
      res.status(500).json({ error: "Failed to fetch businesses" });
    }
  });

  app.post("/api/businesses/submit", async (req, res) => {
    try {
      const { name, category, description, address, phone, website, email } = req.body;

      if (!name || !category || !address || !email) {
        return res.status(400).json({ error: "Name, category, address, and email are required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      const validCategories = ["Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Technology"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      const result = await pool.query(
        `INSERT INTO businesses (name, category, description, address, phone, website, submitted_by_email, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING id`,
        [name, category, description || "", address, phone || "", website || "", email]
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

  const adminHtml = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "admin.html"),
    "utf-8"
  );

  app.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(adminHtml);
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

  const httpServer = createServer(app);
  return httpServer;
}
