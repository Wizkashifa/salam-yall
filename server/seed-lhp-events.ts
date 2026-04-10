import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ORGANIZER = "The Light House Project";
const LOCATION = "1127 Kildaire Farm Rd, Cary NC";
const LAT = 35.7672;
const LNG = -78.7811;
const REG_URL = "https://lhproj.com/events";

const ASSETS_DIR = path.join(__dirname, "..", "attached_assets");

function readImageAsBase64(filename: string): string {
  const filePath = path.join(ASSETS_DIR, filename);
  const data = fs.readFileSync(filePath);
  return data.toString("base64");
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const date = new Date(year, month, 1);
  let count = 0;
  while (date.getMonth() === month) {
    if (date.getDay() === weekday) {
      count++;
      if (count === n) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }
  return new Date(NaN);
}

function generateNthWeekdayOccurrences(
  weekday: number,
  n: number,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  rangeStart: Date,
  rangeEnd: Date
): Array<{ start: Date; end: Date }> {
  const results: Array<{ start: Date; end: Date }> = [];
  let year = rangeStart.getFullYear();
  let month = rangeStart.getMonth();
  const endYear = rangeEnd.getFullYear();
  const endMonth = rangeEnd.getMonth();

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const occ = getNthWeekdayOfMonth(year, month, weekday, n);
    if (!isNaN(occ.getTime())) {
      const start = new Date(year, month, occ.getDate(), startHour, startMin, 0);
      const end = new Date(year, month, occ.getDate(), endHour, endMin, 0);
      if (start >= rangeStart && start <= rangeEnd) {
        results.push({ start, end });
      }
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return results;
}

function generateWeeklyOccurrences(
  weekday: number,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  rangeStart: Date,
  rangeEnd: Date
): Array<{ start: Date; end: Date }> {
  const results: Array<{ start: Date; end: Date }> = [];
  const current = new Date(rangeStart);
  while (current.getDay() !== weekday) {
    current.setDate(current.getDate() + 1);
  }
  while (current <= rangeEnd) {
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate(), startHour, startMin, 0);
    const end = new Date(current.getFullYear(), current.getMonth(), current.getDate(), endHour, endMin, 0);
    results.push({ start, end });
    current.setDate(current.getDate() + 7);
  }
  return results;
}

function generateBiMonthlyNthWeekdayOccurrences(
  weekday: number,
  nList: number[],
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  rangeStart: Date,
  rangeEnd: Date,
  startMonth: number,
  startYear: number
): Array<{ start: Date; end: Date }> {
  const results: Array<{ start: Date; end: Date }> = [];
  let year = startYear;
  let month = startMonth;

  while (
    year < rangeEnd.getFullYear() ||
    (year === rangeEnd.getFullYear() && month <= rangeEnd.getMonth())
  ) {
    for (const n of nList) {
      const occ = getNthWeekdayOfMonth(year, month, weekday, n);
      if (!isNaN(occ.getTime())) {
        const start = new Date(year, month, occ.getDate(), startHour, startMin, 0);
        const end = new Date(year, month, occ.getDate(), endHour, endMin, 0);
        if (start >= rangeStart && start <= rangeEnd) {
          results.push({ start, end });
        }
      }
    }
    month += 2;
    if (month > 11) { month = month - 12; year++; }
  }
  return results;
}

async function upsertEvent(
  title: string,
  description: string,
  imageBase64: string,
  start: Date,
  end: Date
) {
  const existing = await pool.query(
    `SELECT id FROM community_events WHERE title = $1 AND start_time = $2`,
    [title, start]
  );
  if (existing.rows.length > 0) return;
  await pool.query(
    `INSERT INTO community_events
       (title, description, location, start_time, end_time, organizer, registration_url,
        image_data, image_mime, is_virtual, is_featured, status, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'image/jpeg',false,false,'approved',$9,$10)`,
    [title, description, LOCATION, start, end, ORGANIZER, REG_URL, imageBase64, LAT, LNG]
  );
}

async function main() {
  const now = new Date();
  const pastStart = new Date(2025, 0, 1);
  const futureEnd = new Date(now.getFullYear() + 1, now.getMonth() + 1, 0, 23, 59, 59);

  const seniorsBrunchImg = readImageAsBase64("92b0157d-4116-492d-a059-c727b872df61_1775852323009.jpeg");
  const convertCareImg = readImageAsBase64("91398bad-6d61-49df-aff1-c5cd78a50bcd_1775852323009.jpeg");
  const backToBasicsImg = readImageAsBase64("0a1fbcd3-3ec2-44cf-89c8-03e0442dffa7_1775852323009.jpeg");
  const lovingTheBelovedImg = readImageAsBase64("f716679d-e0a1-47d8-b35d-b7dd19346cbc_1775852323009.jpeg");
  const afterHoursImg = readImageAsBase64("0005194a-eaff-4e39-8934-2ec5e4e5cf02_1775852323009.jpeg");

  const seniorsBrunch = generateNthWeekdayOccurrences(4, 3, 10, 30, 12, 0, pastStart, futureEnd);
  console.log(`Senior's Brunch: ${seniorsBrunch.length} occurrences`);
  for (const { start, end } of seniorsBrunch) {
    await upsertEvent(
      "Senior's Brunch",
      "A monthly brunch gathering for seniors hosted by The Light House Project. Every month, 3rd Thursday, 10:30 AM – 12:00 PM.",
      seniorsBrunchImg,
      start,
      end
    );
  }

  const convertCare = generateNthWeekdayOccurrences(0, 2, 13, 0, 14, 30, pastStart, futureEnd);
  console.log(`Convert Care: ${convertCare.length} occurrences`);
  for (const { start, end } of convertCare) {
    await upsertEvent(
      "Convert Care",
      "A monthly gathering for convert brothers and sisters. A space to build community, share stories, and grow together in faith. Every month, 2nd Sunday, 1:00–2:30 PM.",
      convertCareImg,
      start,
      end
    );
  }

  const b2bStart = new Date(2026, 0, 7);
  const backToBasics = generateWeeklyOccurrences(3, 19, 0, 20, 30, b2bStart, futureEnd);
  console.log(`Back To Basics: ${backToBasics.length} occurrences`);
  for (const { start, end } of backToBasics) {
    await upsertEvent(
      "Back To Basics",
      "Fard Ayn (Obligatory Knowledge) – Every Wednesday 7–8:30 PM, starting January 7, 2026. Instructors: Arbaz Chanda & Amaan Hussein, Students of Sheikh Omar Mohsin.",
      backToBasicsImg,
      start,
      end
    );
  }

  const lovingStart = new Date(2026, 3, 17);
  const lovingTheBeloved = generateNthWeekdayOccurrences(5, 3, 19, 0, 21, 0, lovingStart, futureEnd);
  console.log(`Loving the Beloved: ${lovingTheBeloved.length} occurrences`);
  for (const { start, end } of lovingTheBeloved) {
    await upsertEvent(
      "Loving the Beloved",
      "Virtues of the beloved Prophet ﷺ – A monthly transformative journey learning about the traits, attributes, and character of our beloved Prophet ﷺ. Every month, 3rd Friday, 7–9 PM.",
      lovingTheBelovedImg,
      start,
      end
    );
  }

  const ahStart = new Date(2026, 3, 7);
  const afterHours = generateBiMonthlyNthWeekdayOccurrences(2, [1, 2], 19, 0, 21, 0, ahStart, futureEnd, 3, 2026);
  console.log(`After Hours: ${afterHours.length} occurrences`);
  for (const { start, end } of afterHours) {
    await upsertEvent(
      "After Hours",
      "For Young Professionals, By Young Professionals. Led by Abdo Tagel-Din – a chill evening of open discussion, connection, refreshments, entertainment, and more! Every 1st & 2nd Tuesday, bi-monthly, 7–9 PM.",
      afterHoursImg,
      start,
      end
    );
  }

  console.log("LHP events seeded successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
