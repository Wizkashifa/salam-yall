import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { getUncachableGoogleCalendarClient } from "./google-calendar";

const CALENDAR_ID = "5c6138b3c670e90f28b9ec65a6650268569a070eff5ae0ae919129f763d216af@group.calendar.google.com";

const NAME_MATCHES: [string, string][] = [
  ["islamic association of raleigh", "Islamic Association of Raleigh"],
  ["iar", "Islamic Association of Raleigh"],
  ["islamic center of morrisville", "Islamic Center of Morrisville"],
  ["icm", "Islamic Center of Morrisville"],
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
  ["raleigh convention", "Raleigh Convention Center"],
  ["dorton arena", "NC State Fairgrounds"],
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
];

const CALENDAR_LEVEL_NAMES = new Set([
  "triangle muslim events",
]);

function resolveOrganizer(event: any): string {
  const location = (event.location || "").toLowerCase();
  const description = (event.description || "").toLowerCase();
  const title = (event.summary || "").toLowerCase();
  const combined = location + " " + title + " " + description;

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

  const orgName = event.organizer?.displayName || event.creator?.displayName || "";
  if (orgName && !CALENDAR_LEVEL_NAMES.has(orgName.toLowerCase())) {
    return orgName;
  }

  return "";
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/events", async (_req, res) => {
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

      const events = (response.data.items || []).map((event: any) => {
        const desc = event.description || "";
        const imgMatch = desc.match(/src="([^"]+)"/);
        const imageUrl = imgMatch ? imgMatch[1] : "";
        const cleanDesc = desc.replace(/<img[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<a[^>]*>View Full Image<\/a>/gi, "");

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
          description: cleanDesc,
          location: event.location || "",
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          isAllDay: !event.start?.dateTime,
          organizer: resolveOrganizer(event),
          imageUrl,
          registrationUrl,
        };
      });

      res.json(events);
    } catch (error: any) {
      console.error("Error fetching calendar events:", error.message);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/businesses", (_req, res) => {
    res.json(businesses);
  });

  const httpServer = createServer(app);
  return httpServer;
}

const businesses = [
  {
    id: "1",
    name: "Neomonde Mediterranean",
    category: "Restaurant",
    description: "Authentic Mediterranean bakery and restaurant with fresh pita and shawarma.",
    address: "9610 Forum Dr, Raleigh, NC 27615",
    phone: "(919) 861-4860",
    website: "https://neomonde.com",
  },
  {
    id: "2",
    name: "Bosphorus Turkish Cuisine",
    category: "Restaurant",
    description: "Family-owned Turkish restaurant offering traditional kebabs and mezes.",
    address: "907 W Main St, Durham, NC 27701",
    phone: "(919) 682-0007",
    website: "",
  },
  {
    id: "3",
    name: "Al-Amir Halal Meat & Grocery",
    category: "Grocery",
    description: "Full-service halal grocery with fresh meats, spices, and imported goods.",
    address: "1205 E Chatham St, Cary, NC 27511",
    phone: "(919) 467-2220",
    website: "",
  },
  {
    id: "4",
    name: "Jasmin & Olivz Mediterranean Bistro",
    category: "Restaurant",
    description: "Fast-casual Mediterranean cuisine with bowls, wraps, and platters.",
    address: "8111 Tryon Woods Dr, Cary, NC 27518",
    phone: "(919) 439-0099",
    website: "https://jasminandolivz.com",
  },
  {
    id: "5",
    name: "Noor Islamic Finance",
    category: "Finance",
    description: "Sharia-compliant financial advisory and home financing services.",
    address: "3700 National Dr, Raleigh, NC 27612",
    phone: "(919) 555-0123",
    website: "",
  },
  {
    id: "6",
    name: "Kabob & Curry",
    category: "Restaurant",
    description: "Pakistani and Indian cuisine with halal meats and traditional recipes.",
    address: "4512 Falls of Neuse Rd, Raleigh, NC 27609",
    phone: "(919) 790-9992",
    website: "",
  },
  {
    id: "7",
    name: "Salam Boutique",
    category: "Retail",
    description: "Modest fashion boutique with hijabs, abayas, and Islamic gifts.",
    address: "2020 Walnut St, Cary, NC 27518",
    phone: "(919) 555-0456",
    website: "",
  },
  {
    id: "8",
    name: "Tariqa Auto Services",
    category: "Automotive",
    description: "Muslim-owned auto repair and maintenance shop, fair pricing guaranteed.",
    address: "1400 Buck Jones Rd, Raleigh, NC 27606",
    phone: "(919) 555-0789",
    website: "",
  },
  {
    id: "9",
    name: "Baraka Realty",
    category: "Real Estate",
    description: "Muslim-friendly real estate services for homes near masjids and Islamic schools.",
    address: "5000 Falls of Neuse Rd, Raleigh, NC 27609",
    phone: "(919) 555-0321",
    website: "",
  },
  {
    id: "10",
    name: "Mediterranean Deli",
    category: "Restaurant",
    description: "Bakery and deli with halal options, fresh bread, and imported Mediterranean goods.",
    address: "410 W Franklin St, Chapel Hill, NC 27516",
    phone: "(919) 967-2666",
    website: "https://mediterraneandeli.com",
  },
];
