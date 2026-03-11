import pg from "pg";
import { generateJIARSchedule } from "./jiar-iqama-data";

const IAR_API_URL = "https://raleighmasjid.org/API/prayer/month/";
const ICMNC_API_URL = "https://www.icmnc.org/wp-json/dpt/v1/prayertime";
const SRVIC_API_URL = "https://srvic.org/wp-json/dpt/v1/prayertime";
const MCA_SCHEDULE_URL = "https://www.mcabayarea.org/prayerschedule-mca/";
const MCA_NOOR_SCHEDULE_URL = "https://www.mcabayarea.org/prayerschedule-noor/";
const ALNOOR_URL = "https://alnooric.org/monthly-prayer-times/";

export interface DayIqama {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface MasjidIqamaSchedule {
  masjid: string;
  date: string;
  iqama: DayIqama;
}

interface IARDayData {
  hijri: { day: number; year: number; month_numeric: number; month: string };
  adhan: { Fajr: string; Shuruq: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string };
  iqamah: { Fajr: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string };
}

function to12h(time24: string): string {
  const [hh, mm] = time24.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return time24;
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  const suffix = hh >= 12 ? "PM" : "AM";
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function getRaleighDateRange(days: number): { dates: string[]; year: number; month: number } {
  const results: string[] = [];
  const now = new Date();
  const raleighNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  for (let i = 0; i < days; i++) {
    const d = new Date(raleighNow);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    results.push(`${y}-${m}-${day}`);
  }

  return { dates: results, year: raleighNow.getFullYear(), month: raleighNow.getMonth() + 1 };
}

export async function ensureIqamaTable(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iqama_schedules (
      id SERIAL PRIMARY KEY,
      masjid TEXT NOT NULL,
      date DATE NOT NULL,
      fajr TEXT NOT NULL,
      dhuhr TEXT NOT NULL,
      asr TEXT NOT NULL,
      maghrib TEXT NOT NULL,
      isha TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(masjid, date)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_iqama_masjid_date ON iqama_schedules(masjid, date);`);
}

export async function seedJIARData(pool: pg.Pool) {
  const { rows } = await pool.query(
    "SELECT COUNT(*) as count FROM iqama_schedules WHERE masjid LIKE 'JIAR%'"
  );
  if (parseInt(rows[0].count) > 0) return;

  const schedule = generateJIARSchedule();
  console.log(`[Iqama] Seeding ${schedule.length} days of JIAR schedule data...`);

  const batchSize = 50;
  for (let i = 0; i < schedule.length; i += batchSize) {
    const batch = schedule.slice(i, i + batchSize);
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const day of batch) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push("JIAR (Fayetteville)", day.date, day.fajr, day.dhuhr, day.asrFV, day.maghrib, day.isha);
      idx += 7;

      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push("JIAR (Parkwood)", day.date, day.fajr, day.dhuhr, day.asrPK, day.maghrib, day.isha);
      idx += 7;
    }

    await pool.query(
      `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
       ON CONFLICT (masjid, date) DO NOTHING`,
      values
    );
  }

  console.log(`[Iqama] Seeded JIAR Parkwood + Fayetteville schedules (${schedule.length} days each)`);
}

async function fetchAndStoreIAR(pool: pg.Pool, year: number, month: number): Promise<void> {
  try {
    const url = `${IAR_API_URL}?year=${year}&month=${month}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Iqama] IAR API returned ${resp.status}`);
      return;
    }

    const json = await resp.json() as Record<string, IARDayData>;
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const [dateKey, dayData] of Object.entries(json)) {
      if (!dayData?.iqamah?.Fajr || !dayData?.iqamah?.Isha) continue;
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push("IAR", dateKey, dayData.iqamah.Fajr, dayData.iqamah.Dhuhr, dayData.iqamah.Asr, dayData.iqamah.Maghrib, dayData.iqamah.Isha);
      idx += 7;
    }

    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
         ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
        values
      );
      console.log(`[Iqama] Synced ${placeholders.length} IAR days for ${month}/${year}`);
    }
  } catch (err: any) {
    console.error("[Iqama] Error syncing IAR:", err.message);
  }
}

async function fetchAndStoreICMNC(pool: pg.Pool): Promise<void> {
  try {
    const resp = await fetch(`${ICMNC_API_URL}?filter=today`);
    if (!resp.ok) {
      console.error(`[Iqama] ICMNC API returned ${resp.status}`);
      return;
    }

    const json = await resp.json() as any[];
    if (!json || json.length === 0) return;

    const today = json[0];
    if (!today.fajr_jamah || !today.isha_jamah) return;

    const now = new Date();
    const raleigh = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const year = raleigh.find(p => p.type === "year")!.value;
    const month = raleigh.find(p => p.type === "month")!.value;
    const day = raleigh.find(p => p.type === "day")!.value;
    const dateKey = `${year}-${month}-${day}`;

    await pool.query(
      `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
      ["ICMNC", dateKey, to12h(today.fajr_jamah), to12h(today.zuhr_jamah), to12h(today.asr_jamah), to12h(today.maghrib_jamah), to12h(today.isha_jamah)]
    );
    console.log(`[Iqama] Synced ICMNC for ${dateKey}`);
  } catch (err: any) {
    console.error("[Iqama] Error syncing ICMNC:", err.message);
  }
}

async function fetchAndStoreSRVIC(pool: pg.Pool): Promise<void> {
  try {
    const resp = await fetch(`${SRVIC_API_URL}?filter=month`);
    if (!resp.ok) {
      console.error(`[Iqama] SRVIC API returned ${resp.status}`);
      return;
    }

    const json = await resp.json() as any;
    if (!json || !Array.isArray(json) || json.length === 0) return;

    const monthObj = json[0];
    const days: any[] = [];
    for (const key of Object.keys(monthObj)) {
      const entry = monthObj[key];
      if (Array.isArray(entry) && entry.length > 0 && entry[0].d_date) {
        days.push(entry[0]);
      } else if (entry && entry.d_date) {
        days.push(entry);
      }
    }

    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const day of days) {
      if (!day.d_date || !day.fajr_jamah || !day.isha_jamah) continue;
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push(
        "SRVIC",
        day.d_date,
        to12h(day.fajr_jamah),
        to12h(day.zuhr_jamah),
        to12h(day.asr_jamah),
        to12h(day.maghrib_jamah),
        to12h(day.isha_jamah)
      );
      idx += 7;
    }

    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
         ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
        values
      );
      console.log(`[Iqama] Synced ${placeholders.length} SRVIC days`);
    }
  } catch (err: any) {
    console.error("[Iqama] Error syncing SRVIC:", err.message);
  }
}

async function parseMCASchedulePage(pool: pg.Pool, url: string, masjidName: string, monthNum?: number): Promise<void> {
  try {
    const now = new Date();
    const caNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const month = monthNum ?? (caNow.getMonth() + 1);
    const year = caNow.getFullYear();
    const monthStr = String(month).padStart(2, "0");

    const fullUrl = `${url}?month=${monthStr}`;
    const resp = await fetch(fullUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) {
      console.error(`[Iqama] ${masjidName} page returned ${resp.status}`);
      return;
    }

    const html = await resp.text();
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    let trMatch;

    while ((trMatch = trRegex.exec(html)) !== null) {
      const row = trMatch[1];
      const tdRegex2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let td;
      while ((td = tdRegex2.exec(row)) !== null) {
        cells.push(td[1].replace(/<[^>]+>/g, "").trim());
      }
      if (cells.length < 10) continue;

      const dateCell = cells[0];
      const dayMatch = dateCell.match(/(\w+?)(\d+)/);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[2], 10);
      if (isNaN(day) || day < 1 || day > 31) continue;
      const dateKey = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;

      const timeRegex = /(\d{1,2}:\d{2}\s*[AP]M)/i;
      const extractTime = (cell: string): string => {
        const m = cell.match(timeRegex);
        return m ? m[1].replace(/\s+/g, " ").trim() : "";
      };

      const fajrIqama = extractTime(cells[3]);
      const dhuhrIqama = extractTime(cells[6]);
      const asrIqama = extractTime(cells[8]);
      const maghribIqama = extractTime(cells[10]);
      const ishaIqama = extractTime(cells[12]);

      if (!fajrIqama || !ishaIqama) continue;

      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push(masjidName, dateKey, fajrIqama, dhuhrIqama, asrIqama, maghribIqama, ishaIqama);
      idx += 7;
    }

    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
         ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
        values
      );
      console.log(`[Iqama] Synced ${placeholders.length} ${masjidName} days for month ${monthStr}`);
    }
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${masjidName}:`, err.message);
  }
}

async function fetchAndStoreMCA(pool: pg.Pool, monthNum?: number): Promise<void> {
  await parseMCASchedulePage(pool, MCA_SCHEDULE_URL, "MCA", monthNum);
}

async function fetchAndStoreMCANoor(pool: pg.Pool, monthNum?: number): Promise<void> {
  await parseMCASchedulePage(pool, MCA_NOOR_SCHEDULE_URL, "MCA Noor", monthNum);
}

const MONTH_ABBRS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

async function fetchAndStoreAlNoor(pool: pg.Pool): Promise<void> {
  try {
    const resp = await fetch(ALNOOR_URL);
    if (!resp.ok) {
      console.error(`[Iqama] Al Noor page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
      const cells: string[] = [];
      let tdMatch;
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
        cells.push(tdMatch[1].replace(/<[^>]*>/g, "").trim());
      }
      if (cells.length >= 13) rows.push(cells);
    }

    if (rows.length === 0) {
      console.error("[Iqama] Al Noor: no table rows found");
      return;
    }

    const now = new Date();
    const raleighNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const currentYear = raleighNow.getFullYear();

    const seen = new Map<string, { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }>();

    for (const cells of rows) {
      const dateParts = cells[0].split(" ");
      if (dateParts.length < 2) continue;
      const dayNum = parseInt(dateParts[0]);
      const monthAbbr = dateParts[1];
      const monthNum = MONTH_ABBRS[monthAbbr];
      if (!monthNum || isNaN(dayNum)) continue;

      const dateKey = `${currentYear}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

      const fajrIqamah = cells[3];
      const dhuhrIqamah = cells[6];
      const asrIqamah = cells[8];
      const maghribIqamah = cells[10];
      const ishaIqamah = cells[12];

      if (!fajrIqamah || !ishaIqamah) continue;
      if (!seen.has(dateKey)) {
        seen.set(dateKey, { fajr: fajrIqamah, dhuhr: dhuhrIqamah, asr: asrIqamah, maghrib: maghribIqamah, isha: ishaIqamah });
      }
    }

    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const [dateKey, times] of seen) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      values.push("Al Noor", dateKey, times.fajr, times.dhuhr, times.asr, times.maghrib, times.isha);
      idx += 7;
    }

    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
         ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
        values
      );
      console.log(`[Iqama] Synced ${placeholders.length} Al Noor days for current month`);
    }
  } catch (err: any) {
    console.error("[Iqama] Error syncing Al Noor:", err.message);
  }
}

export async function syncExternalIqama(pool: pg.Pool): Promise<void> {
  const { year, month } = getRaleighDateRange(1);
  await Promise.all([
    fetchAndStoreIAR(pool, year, month),
    fetchAndStoreICMNC(pool),
    fetchAndStoreSRVIC(pool),
    fetchAndStoreMCA(pool),
    fetchAndStoreMCANoor(pool),
    fetchAndStoreAlNoor(pool),
  ]);

  const nextMonthDate = new Date(year, month, 1);
  const now = new Date();
  const raleighNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const daysLeft = new Date(year, month, 0).getDate() - raleighNow.getDate();
  if (daysLeft <= 7) {
    await fetchAndStoreIAR(pool, nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1);
    const nextMonth = (month % 12) + 1;
    await fetchAndStoreMCA(pool, nextMonth);
    await fetchAndStoreMCANoor(pool, nextMonth);
  }
}

export async function getIqamaSchedules(pool: pg.Pool, days: number = 7): Promise<MasjidIqamaSchedule[]> {
  const { dates } = getRaleighDateRange(days);
  const result = await pool.query(
    `SELECT masjid, date::text, fajr, dhuhr, asr, maghrib, isha 
     FROM iqama_schedules 
     WHERE date >= $1 AND date <= $2
     ORDER BY masjid, date`,
    [dates[0], dates[dates.length - 1]]
  );

  return result.rows.map((row: any) => ({
    masjid: row.masjid,
    date: row.date,
    iqama: {
      fajr: row.fajr,
      dhuhr: row.dhuhr,
      asr: row.asr,
      maghrib: row.maghrib,
      isha: row.isha,
    },
  }));
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startIqamaSync(pool: pg.Pool) {
  syncExternalIqama(pool).catch(err => console.error("[Iqama] Initial sync error:", err.message));

  syncInterval = setInterval(() => {
    syncExternalIqama(pool).catch(err => console.error("[Iqama] Sync error:", err.message));
  }, 6 * 60 * 60 * 1000);
}
