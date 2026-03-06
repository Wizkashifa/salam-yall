import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { getUncachableGoogleCalendarClient } from "./google-calendar";

const CALENDAR_ID = "5c6138b3c670e90f28b9ec65a6650268569a070eff5ae0ae919129f763d216af@group.calendar.google.com";

const ADDRESS_TO_ORG: Record<string, string> = {
  "808 atwater": "Islamic Association of Raleigh (IAR)",
  "2635 avent ferry": "Islamic Center of Raleigh",
  "514 e martin": "Masjid Al-Iman",
  "304 alexander": "Islamic Society of Durham",
  "5501 sunnybrook": "As-Salaam Islamic Center",
  "921 s east": "Masjid Ar-Razzaq",
  "2523 noble": "Al Furqaan Islamic Center",
  "1009 w chapel hill": "Muslim American Society",
  "1315 w main": "Islamic Center of Durham",
  "200 e davie": "Raleigh Convention Center",
  "dorton arena": "NC State Fairgrounds",
  "1025 blue ridge": "Al-Iman School",
  "raleigh convention": "Raleigh Convention Center",
  "cary towne center": "Cary Community",
};

function resolveOrganizer(event: any): string {
  if (event.organizer?.displayName && event.organizer.displayName !== event.summary) {
    return event.organizer.displayName;
  }

  if (event.creator?.displayName) {
    return event.creator.displayName;
  }

  const location = (event.location || "").toLowerCase();
  const description = (event.description || "").toLowerCase();
  const combined = location + " " + description;

  for (const [keyword, org] of Object.entries(ADDRESS_TO_ORG)) {
    if (combined.includes(keyword)) {
      return org;
    }
  }

  if (event.summary) {
    const title = event.summary.toLowerCase();
    for (const [keyword, org] of Object.entries(ADDRESS_TO_ORG)) {
      if (title.includes(keyword)) {
        return org;
      }
    }
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

      const events = (response.data.items || []).map((event: any) => ({
        id: event.id,
        title: event.summary || "Untitled Event",
        description: event.description || "",
        location: event.location || "",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        isAllDay: !event.start?.dateTime,
        organizer: resolveOrganizer(event),
      }));

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
