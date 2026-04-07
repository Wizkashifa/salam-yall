import pg from "pg";
import fs from "fs";
import path from "path";
import { generateJIARSchedule } from "./jiar-iqama-data";
import { generateMCCSchedule } from "./mcc-iqama-data";

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

type IqamaSourceType = "dpt" | "iar" | "mca-html" | "alnoor-html" | "sbia-html" | "icf-html" | "athanplus" | "alhuda-html" | "berkeley-json" | "mcc-html" | "epic-html" | "masjidapps" | "iar-jumuah" | "icmnc-jumuah";

interface IqamaSource {
  name: string;
  type: IqamaSourceType;
  url: string;
  timezone: string;
  filter?: "today" | "month";
  maghribOffset?: number;
  /** Day-of-week numbers (0=Sun…6=Sat) to run this sync. Omit = run every day. */
  syncDays?: number[];
}

const IQAMA_SOURCES: IqamaSource[] = [
  {
    name: "IAR",
    type: "iar",
    url: "https://raleighmasjid.org/API/prayer/month/",
    timezone: "America/New_York",
  },
  {
    name: "IAR Jumuah",
    type: "iar-jumuah",
    url: "https://raleighmasjid.org",
    timezone: "America/New_York",
    syncDays: [4, 5, 6], // Thu/Fri/Sat — site updates by Thursday
  },
  {
    name: "ICMNC Jumuah",
    type: "icmnc-jumuah",
    url: "https://www.icmnc.org",
    timezone: "America/New_York",
    syncDays: [4, 5, 6], // Thu/Fri/Sat — site updates by Thursday
  },
  {
    name: "ICMNC",
    type: "dpt",
    url: "https://www.icmnc.org/wp-json/dpt/v1/prayertime",
    timezone: "America/New_York",
    filter: "today",
  },
  {
    name: "SRVIC",
    type: "dpt",
    url: "https://srvic.org/wp-json/dpt/v1/prayertime",
    timezone: "America/Los_Angeles",
    filter: "month",
  },
  {
    name: "MCA",
    type: "mca-html",
    url: "https://www.mcabayarea.org/prayerschedule-mca/",
    timezone: "America/Los_Angeles",
  },
  {
    name: "MCA Al-Noor",
    type: "mca-html",
    url: "https://www.mcabayarea.org/prayerschedule-noor/",
    timezone: "America/Los_Angeles",
  },
  {
    name: "Al Noor",
    type: "alnoor-html",
    url: "https://alnooric.org/monthly-prayer-times/",
    timezone: "America/New_York",
  },
  {
    name: "SBIA",
    type: "sbia-html",
    url: "https://sbia.info/",
    timezone: "America/Los_Angeles",
  },
  {
    name: "ICF",
    type: "icf-html",
    url: "https://icfbayarea.com/",
    timezone: "America/Los_Angeles",
  },
  {
    name: "LGIC",
    type: "dpt",
    url: "https://wvmuslim.org/wp-json/dpt/v1/prayertime",
    timezone: "America/Los_Angeles",
    filter: "today",
  },
  {
    name: "Pillars Mosque",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=xdyqvadX",
    timezone: "America/New_York",
    maghribOffset: 3,
  },
  {
    name: "ISGC",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=MA582zLr",
    timezone: "America/New_York",
    maghribOffset: 5,
  },
  {
    name: "Al-Huda",
    type: "alhuda-html",
    url: "https://alhudafoundation.org/",
    timezone: "America/Indiana/Indianapolis",
  },
  {
    name: "Berkeley Masjid",
    type: "berkeley-json",
    url: "https://berkeleymasjid.org/prayer-times-display/timetable.json",
    timezone: "America/Los_Angeles",
  },
  {
    name: "MCC",
    type: "mcc-html",
    url: "https://mccchicago.org/",
    timezone: "America/Chicago",
  },
  {
    name: "ISM",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=nzKzJoKO",
    timezone: "America/Chicago",
    maghribOffset: 0,
  },
  // Charlotte NC
  {
    name: "ICC Charlotte",
    type: "dpt",
    url: "https://iccharlotte.org/wp-json/dpt/v1/prayertime",
    timezone: "America/New_York",
    filter: "today",
  },
  // Indianapolis IN
  {
    name: "MCC Indianapolis",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=RKxy6lLO",
    timezone: "America/Indiana/Indianapolis",
  },
  // DFW TX
  {
    name: "Valley Ranch Islamic Center",
    type: "masjidapps",
    url: "https://portal.masjidapps.com/public/readOnlySalahTimes?id=MQ2&code=NzY1ZjcxZmQtZjE0NS00OGFjLTljYTgtMjBiYmRlYjdkZGRj0",
    timezone: "America/Chicago",
  },
  {
    name: "EPIC Masjid",
    type: "epic-html",
    url: "https://epicmasjid.org",
    timezone: "America/Chicago",
  },
  {
    name: "IANT",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=xdy03lAX",
    timezone: "America/Chicago",
  },
  {
    name: "Islamic Center of Irving",
    type: "dpt",
    url: "https://www.irvingmasjid.org/wp-json/dpt/v1/prayertime",
    timezone: "America/Chicago",
    filter: "today",
  },
  // Chicago IL
  {
    name: "Mosque Foundation",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=pQKM3ABE",
    timezone: "America/Chicago",
  },
  // Boston MA
  {
    name: "ISB Roxbury",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=zVKp9PLP",
    timezone: "America/New_York",
  },
  {
    name: "ISB Cambridge",
    type: "athanplus",
    url: "https://timing.athanplus.com/masjid/widgets/monthly?theme=1&masjid_id=kAk28BLq",
    timezone: "America/New_York",
  },
];

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

function getDateInTz(tz: string): { year: number; month: number; day: number; dateKey: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value);
  const day = parseInt(parts.find(p => p.type === "day")!.value);
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dateKey };
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

async function bulkUpsert(pool: pg.Pool, rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const row of rows) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
    values.push(row.masjid, row.date, row.fajr, row.dhuhr, row.asr, row.maghrib, row.isha);
    idx += 7;
  }
  await pool.query(
    `INSERT INTO iqama_schedules (masjid, date, fajr, dhuhr, asr, maghrib, isha) VALUES ${placeholders.join(", ")}
     ON CONFLICT (masjid, date) DO UPDATE SET fajr=EXCLUDED.fajr, dhuhr=EXCLUDED.dhuhr, asr=EXCLUDED.asr, maghrib=EXCLUDED.maghrib, isha=EXCLUDED.isha, updated_at=NOW()`,
    values
  );
  return rows.length;
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
    const rows: any[] = [];
    for (const day of batch) {
      rows.push({ masjid: "JIAR (Fayetteville)", date: day.date, fajr: day.fajr, dhuhr: day.dhuhr, asr: day.asrFV, maghrib: day.maghrib, isha: day.isha });
      rows.push({ masjid: "JIAR (Parkwood)", date: day.date, fajr: day.fajr, dhuhr: day.dhuhr, asr: day.asrPK, maghrib: day.maghrib, isha: day.isha });
    }
    await bulkUpsert(pool, rows);
  }

  console.log(`[Iqama] Seeded JIAR Parkwood + Fayetteville schedules (${schedule.length} days each)`);
}

export async function seedMCCData(pool: pg.Pool) {
  const schedule = generateMCCSchedule();

  const batchSize = 50;
  for (let i = 0; i < schedule.length; i += batchSize) {
    const batch = schedule.slice(i, i + batchSize);
    const batchRows = batch.map(day => ({
      masjid: "MCC", date: day.date, fajr: day.fajr, dhuhr: day.dhuhr, asr: day.asr, maghrib: day.maghrib, isha: day.isha,
    }));
    await bulkUpsert(pool, batchRows);
  }

  console.log(`[Iqama] Refreshed MCC static schedule (${schedule.length} days)`);
}

export async function seedAdamsCenterIqama(pool: pg.Pool) {
  const { rows: countRows } = await pool.query(
    "SELECT COUNT(*) as count FROM iqama_schedules WHERE masjid LIKE 'ADAMS%'"
  );
  if (parseInt(countRows[0].count) >= 300) return;

  const csvPath = path.join(process.cwd(), "server", "data", "adams-center-iqama-2026.csv");
  let csvText: string;
  try {
    csvText = fs.readFileSync(csvPath, "utf-8");
  } catch (err: any) {
    console.error("[Iqama] Adams Center CSV not found:", err.message);
    return;
  }

  const branches = [
    "ADAMS Sterling",
    "ADAMS Fairfax",
    "ADAMS Ashburn",
    "ADAMS Gainesville",
    "ADAMS Sully",
    "ADAMS Leesburg",
  ];

  const lines = csvText.split("\n").slice(1);
  const parsed: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(",");
    if (cols.length < 14) continue;
    const dateParts = cols[0].split("/");
    if (dateParts.length !== 3) continue;
    const month = dateParts[0].padStart(2, "0");
    const day = dateParts[1].padStart(2, "0");
    const year = dateParts[2].trim();
    if (!year || year.length !== 4) continue;
    const dateKey = `${year}-${month}-${day}`;
    const fajr = cols[4].trim();
    const dhuhr = cols[7].trim();
    const asr = cols[9].trim();
    const maghrib = cols[11].trim();
    const isha = cols[13].trim();
    if (!fajr || !isha) continue;
    for (const branch of branches) {
      parsed.push({ masjid: branch, date: dateKey, fajr, dhuhr, asr, maghrib, isha });
    }
  }

  const dayCount = parsed.length / branches.length;
  console.log(`[Iqama] Seeding ${dayCount} days × ${branches.length} ADAMS Center branches...`);

  const batchSize = 300;
  for (let i = 0; i < parsed.length; i += batchSize) {
    await bulkUpsert(pool, parsed.slice(i, i + batchSize));
  }

  console.log("[Iqama] Adams Center iqama schedule seeded successfully");
}

async function fetchDPT(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const filterParam = source.filter || "month";
    const resp = await fetch(`${source.url}?filter=${filterParam}`);
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} API returned ${resp.status}`);
      return;
    }

    const json = await resp.json() as any;

    if (filterParam === "today") {
      const arr = Array.isArray(json) ? json : [json];
      if (arr.length === 0) return;
      const today = arr[0];
      if (!today.fajr_jamah || !today.isha_jamah) return;
      const { dateKey } = getDateInTz(source.timezone);
      const count = await bulkUpsert(pool, [{
        masjid: source.name,
        date: dateKey,
        fajr: to12h(today.fajr_jamah),
        dhuhr: to12h(today.zuhr_jamah),
        asr: to12h(today.asr_jamah),
        maghrib: to12h(today.maghrib_jamah),
        isha: to12h(today.isha_jamah),
      }]);
      console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);
      // Update jumuah_schedules with live Jumuah iqama times
      if (Array.isArray(today.jumuah) && today.jumuah.length > 0) {
        const slots = today.jumuah.map((t: string) => ({ khutbah_time: to12h(t), iqama_time: to12h(t) }));
        const times = slots.map((s: any) => s.iqama_time).join(", ");
        await pool.query(
          `UPDATE jumuah_schedules SET khutbahs=$1, khutbah_time=$2, iqama_time=$3, updated_at=NOW() WHERE masjid=$4`,
          [JSON.stringify(slots), times, times, source.name]
        );
      }
      return;
    }

    const data = Array.isArray(json) ? json : [json];
    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];

    for (const monthObj of data) {
      const days: any[] = [];
      for (const key of Object.keys(monthObj)) {
        const entry = monthObj[key];
        if (Array.isArray(entry) && entry.length > 0 && entry[0].d_date) {
          days.push(entry[0]);
        } else if (entry && entry.d_date) {
          days.push(entry);
        }
      }
      for (const day of days) {
        if (!day.d_date || !day.fajr_jamah || !day.isha_jamah) continue;
        rows.push({
          masjid: source.name,
          date: day.d_date,
          fajr: to12h(day.fajr_jamah),
          dhuhr: to12h(day.zuhr_jamah),
          asr: to12h(day.asr_jamah),
          maghrib: to12h(day.maghrib_jamah),
          isha: to12h(day.isha_jamah),
        });
      }
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchIAR(pool: pg.Pool, source: IqamaSource, year: number, month: number): Promise<void> {
  try {
    const url = `${source.url}?year=${year}&month=${month}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} API returned ${resp.status}`);
      return;
    }

    const json = await resp.json() as Record<string, IARDayData>;
    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];

    for (const [dateKey, dayData] of Object.entries(json)) {
      if (!dayData?.iqamah?.Fajr || !dayData?.iqamah?.Isha) continue;
      rows.push({
        masjid: source.name,
        date: dateKey,
        fajr: dayData.iqamah.Fajr,
        dhuhr: dayData.iqamah.Dhuhr,
        asr: dayData.iqamah.Asr,
        maghrib: dayData.iqamah.Maghrib,
        isha: dayData.iqamah.Isha,
      });
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days for ${month}/${year}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchMCAHtml(pool: pg.Pool, source: IqamaSource, monthNum?: number): Promise<void> {
  try {
    const { year, month: currentMonth } = getDateInTz(source.timezone);
    const month = monthNum ?? currentMonth;
    const monthStr = String(month).padStart(2, "0");

    const fullUrl = `${source.url}?month=${monthStr}`;
    const resp = await fetch(fullUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }

    const html = await resp.text();
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];
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
      rows.push({ masjid: source.name, date: dateKey, fajr: fajrIqama, dhuhr: dhuhrIqama, asr: asrIqama, maghrib: maghribIqama, isha: ishaIqama });
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days for month ${monthStr}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

const MONTH_ABBRS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const MONTH_NAMES_FULL: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

async function fetchAlNoorHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url);
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tableRows: string[][] = [];
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
      const cells: string[] = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
        cells.push(tdMatch[1].replace(/<[^>]*>/g, "").trim());
      }
      if (cells.length >= 13) tableRows.push(cells);
    }

    if (tableRows.length === 0) {
      console.error(`[Iqama] ${source.name}: no table rows found`);
      return;
    }

    const { year } = getDateInTz(source.timezone);
    const seen = new Map<string, { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }>();

    for (const cells of tableRows) {
      const dateParts = cells[0].split(" ");
      if (dateParts.length < 2) continue;
      const dayNum = parseInt(dateParts[0]);
      const monthAbbr = dateParts[1];
      const monthNum = MONTH_ABBRS[monthAbbr];
      if (!monthNum || isNaN(dayNum)) continue;

      const dateKey = `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (!cells[3] || !cells[12]) continue;
      if (!seen.has(dateKey)) {
        seen.set(dateKey, { fajr: cells[3], dhuhr: cells[6], asr: cells[8], maghrib: cells[10], isha: cells[12] });
      }
    }

    const rows = Array.from(seen.entries()).map(([dateKey, times]) => ({
      masjid: source.name, date: dateKey, ...times,
    }));
    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days for current month`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchAthanPlus(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const { year, month } = getDateInTz(source.timezone);
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }});
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} AthanPlus returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const prayerSection = html.slice(0, html.indexOf('iqamah-table') > -1 ? html.indexOf('iqamah-table') : html.length);
    const spanRegex = /<span>([^<]*)<\/span>/gi;
    const spans: string[] = [];
    let m;
    while ((m = spanRegex.exec(prayerSection)) !== null) {
      spans.push(m[1].trim());
    }

    const adhanByDay: Record<number, { maghrib: string }> = {};
    for (let i = 0; i < spans.length; i++) {
      const dayNum = parseInt(spans[i]);
      if (dayNum >= 1 && dayNum <= 31 && spans[i] === String(dayNum)) {
        const maghribVal = spans[i + 7];
        if (maghribVal && /^\d{1,2}:\d{2}/.test(maghribVal)) {
          adhanByDay[dayNum] = { maghrib: maghribVal.trim() };
        }
      }
    }

    const iqStart = html.indexOf('iqamah-table');
    if (iqStart === -1) {
      console.error(`[Iqama] ${source.name}: no iqamah table found`);
      return;
    }
    const iqEnd = html.indexOf('</table>', iqStart);
    const iqTable = html.slice(iqStart, iqEnd);

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const allCells: string[] = [];
    while ((m = tdRegex.exec(iqTable)) !== null) {
      allCells.push(m[1].replace(/<[^>]+>/g, "").trim());
    }
    const headerIdx = allCells.findIndex(c => /^[A-Z]{3},/.test(c));
    if (headerIdx === -1) {
      console.error(`[Iqama] ${source.name}: no iqamah data rows found`);
      return;
    }
    const dataCells = allCells.slice(headerIdx);
    const changeEntries: { day: number; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];
    for (let i = 0; i + 5 < dataCells.length; i += 6) {
      const dateStr = dataCells[i];
      const dayMatch = dateStr.match(/(\d+)/);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[1]);

      const normalize = (t: string): string => {
        const clean = t.trim();
        if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(clean)) return clean;
        const tm = clean.match(/^(\d{1,2}):(\d{2})\s*$/);
        if (!tm) return clean;
        let h = parseInt(tm[1]);
        const min = tm[2];
        if (h >= 1 && h <= 6) return `${h}:${min} AM`;
        if (h >= 7 && h <= 11) return `${h}:${min} PM`;
        if (h === 12) return `12:${min} PM`;
        return `${h - 12}:${min} PM`;
      };

      changeEntries.push({
        day,
        fajr: normalize(dataCells[i + 1]),
        dhuhr: normalize(dataCells[i + 2]),
        asr: normalize(dataCells[i + 3]),
        maghrib: dataCells[i + 4],
        isha: normalize(dataCells[i + 5]),
      });
    }

    if (changeEntries.length === 0) {
      console.error(`[Iqama] ${source.name}: no iqamah change entries parsed`);
      return;
    }
    changeEntries.sort((a, b) => a.day - b.day);

    const daysInMonth = new Date(year, month, 0).getDate();
    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      let active = changeEntries[0];
      for (const entry of changeEntries) {
        if (entry.day <= d) active = entry;
        else break;
      }

      let maghrib = active.maghrib;
      if (/sunset/i.test(maghrib)) {
        const adhan = adhanByDay[d];
        if (adhan) {
          const tm = adhan.maghrib.match(/^(\d{1,2}):(\d{2})/);
          if (tm) {
            let h = parseInt(tm[1]);
            let min = parseInt(tm[2]) + (source.maghribOffset || 5);
            if (min >= 60) { min -= 60; h++; }
            maghrib = `${h}:${String(min).padStart(2, "0")} PM`;
          }
        }
      }

      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      rows.push({ masjid: source.name, date: dateKey, fajr: active.fajr, dhuhr: active.dhuhr, asr: active.asr, maghrib, isha: active.isha });
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days for month ${String(month).padStart(2, "0")}`);

    // Extract Jumuah times from juma2-sec section
    const jumaMatch = html.match(/juma2-sec[\s\S]*?(?=<\/table>|class="footer|<\/body>)/i);
    if (jumaMatch) {
      const timeRegex = /(\d{1,2}:\d{2}\s*[AP]M)/gi;
      const jumuahTimes: string[] = [];
      let tm;
      while ((tm = timeRegex.exec(jumaMatch[0])) !== null) jumuahTimes.push(tm[1].trim());
      if (jumuahTimes.length > 0) {
        const slots = jumuahTimes.map(t => ({ khutbah_time: t, iqama_time: t }));
        const times = jumuahTimes.join(", ");
        await pool.query(
          `UPDATE jumuah_schedules SET khutbahs=$1, khutbah_time=$2, iqama_time=$3, updated_at=NOW() WHERE masjid=$4`,
          [JSON.stringify(slots), times, times, source.name]
        );
        console.log(`[Iqama] Updated ${source.name} Jumuah times: ${times}`);
      }
    }
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchICFHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }});
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const prayerMap: Record<string, string> = {};
    const rowRegex = /mptsi-row[^"]*">([\s\S]*?)<\/div>\s*<\/div>/gi;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const content = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const timeMatch = content.match(/(Fajr|Dhuhr|Asr|Maghrib|Isha)\s+(\d{1,2}:\d{2}\s*[AP]M)\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (timeMatch) {
        const prayer = timeMatch[1].toLowerCase();
        const icfTime = timeMatch[3].trim();
        prayerMap[prayer] = icfTime;
      }
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse prayer times (found: ${Object.keys(prayerMap).join(", ")})`);
      return;
    }

    const { dateKey } = getDateInTz(source.timezone);
    const count = await bulkUpsert(pool, [{
      masjid: source.name,
      date: dateKey,
      fajr: prayerMap.fajr,
      dhuhr: prayerMap.dhuhr || "",
      asr: prayerMap.asr || "",
      maghrib: prayerMap.maghrib || "",
      isha: prayerMap.isha,
    }]);
    if (count > 0) console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchSBIAHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const prayerMap: Record<string, string> = {};
    const headerRegex = /<h5[^>]*>(.*?)<\/h5>\s*<h4[^>]*>(.*?)<\/h4>/gi;
    let match;
    while ((match = headerRegex.exec(html)) !== null) {
      const label = match[1].replace(/<[^>]+>/g, "").trim().toUpperCase();
      const time = match[2].replace(/<[^>]+>/g, "").trim();
      if (/FAJR/i.test(label)) prayerMap.fajr = time;
      else if (/DHUHR|ZUHR/i.test(label)) prayerMap.dhuhr = time;
      else if (/ASR/i.test(label)) prayerMap.asr = time;
      else if (/MAGHRIB/i.test(label)) prayerMap.maghrib = time;
      else if (/ISHA/i.test(label)) prayerMap.isha = time;
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse prayer times from HTML`);
      return;
    }

    const normalize = (t: string): string => {
      const m = t.match(/(\d{1,2}:\d{2})\s*(AM|PM)/i);
      if (m) return `${m[1]} ${m[2].toUpperCase()}`;
      return t;
    };

    const { dateKey } = getDateInTz(source.timezone);
    const count = await bulkUpsert(pool, [{
      masjid: source.name,
      date: dateKey,
      fajr: normalize(prayerMap.fajr),
      dhuhr: normalize(prayerMap.dhuhr || ""),
      asr: normalize(prayerMap.asr || ""),
      maghrib: normalize(prayerMap.maghrib || ""),
      isha: normalize(prayerMap.isha),
    }]);
    if (count > 0) console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchAlHudaHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    } });
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    const prayerMap: Record<string, string> = {};
    const prayerNames = [
      { pattern: /Fajr\s*[\d:]+\s*(?:AM|PM)\s*([\d:]+\s*(?:AM|PM))/i, key: "fajr" },
      { pattern: /Zuhr\s*[\d:]+\s*(?:AM|PM)\s*([\d:]+\s*(?:AM|PM))/i, key: "dhuhr" },
      { pattern: /Asr\s*[\d:]+\s*(?:AM|PM)\s*([\d:]+\s*(?:AM|PM))/i, key: "asr" },
      { pattern: /Magrib\s*[\d:]+\s*(?:AM|PM)\s*([\d:]+\s*(?:AM|PM))/i, key: "maghrib" },
      { pattern: /Isha\s*[\d:]+\s*(?:AM|PM)\s*([\d:]+\s*(?:AM|PM))/i, key: "isha" },
    ];

    const textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const { pattern, key } of prayerNames) {
      const match = textContent.match(pattern);
      if (match) prayerMap[key] = match[1].trim();
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse prayer times from HTML`);
      return;
    }

    const normalize = (t: string): string => {
      const m = t.match(/(\d{1,2}:\d{2})\s*(AM|PM)/i);
      if (m) return `${m[1]} ${m[2].toUpperCase()}`;
      return t;
    };

    const { dateKey } = getDateInTz(source.timezone);
    const count = await bulkUpsert(pool, [{
      masjid: source.name,
      date: dateKey,
      fajr: normalize(prayerMap.fajr),
      dhuhr: normalize(prayerMap.dhuhr || ""),
      asr: normalize(prayerMap.asr || ""),
      maghrib: normalize(prayerMap.maghrib || ""),
      isha: normalize(prayerMap.isha),
    }]);
    if (count > 0) console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchBerkeleyJson(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url);
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} timetable returned ${resp.status}`);
      return;
    }
    const json = await resp.json() as Record<string, any>;

    const { year, month } = getDateInTz(source.timezone);
    const monthStr = String(month).padStart(2, "0");
    const monthPrefix = `${year}${monthStr}`;

    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];

    for (const [dateKey8, dayData] of Object.entries(json)) {
      if (!dateKey8.startsWith(monthPrefix)) continue;

      const yyyy = dateKey8.slice(0, 4);
      const mm = dateKey8.slice(4, 6);
      const dd = dateKey8.slice(6, 8);
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const fajrIqama = dayData.fajr?.[1];
      const dhuhrIqama = dayData.dhuhr?.[1];
      const asrIqama = dayData.asr?.[1];
      const maghribAdhan = dayData.maghrib?.[0];
      const maghribIqamaRaw = dayData.maghrib?.[1];
      const ishaIqama = dayData.isha?.[1];

      if (!fajrIqama || !ishaIqama) continue;

      let maghribIqama = "";
      const offsetMatch = maghribIqamaRaw?.match(/^\+(\d+)\s*min/i);
      if (offsetMatch) {
        const offset = parseInt(offsetMatch[1]);
        const adhanMatch = maghribAdhan?.match(/^(\d{1,2}):(\d{2})$/);
        if (adhanMatch) {
          let h = parseInt(adhanMatch[1]);
          let m = parseInt(adhanMatch[2]) + offset;
          if (m >= 60) { m -= 60; h++; }
          maghribIqama = to12h(`${h}:${String(m).padStart(2, "0")}`);
        } else {
          maghribIqama = to12h(maghribAdhan || "");
        }
      } else if (maghribIqamaRaw) {
        maghribIqama = to12h(maghribIqamaRaw);
      } else {
        maghribIqama = to12h(maghribAdhan || "");
      }

      rows.push({
        masjid: source.name,
        date: dateKey,
        fajr: to12h(fajrIqama),
        dhuhr: to12h(dhuhrIqama || ""),
        asr: to12h(asrIqama || ""),
        maghrib: maghribIqama,
        isha: to12h(ishaIqama),
      });
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days for ${monthPrefix}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchMCCHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    // Extract MCC (time-r) prayer times — each <li> has the label in pull-left and times in pull-right
    const prayerMap: Record<string, string> = {};
    const liRegex = /<div class="pull-left">([^<&]+)<\/div>[\s\S]*?<div class="time-r">([^<]+)<\/div>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(html)) !== null) {
      const label = liMatch[1].trim();
      const time = liMatch[2].trim();
      if (/fajr/i.test(label)) prayerMap.fajr = time;
      else if (/zuhr|dhuhr/i.test(label)) prayerMap.dhuhr = time;
      else if (/asr/i.test(label)) prayerMap.asr = time;
      else if (/mag/i.test(label)) prayerMap.maghrib = time;
      else if (/isha/i.test(label)) prayerMap.isha = time;
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse MCC prayer times from page`);
      return;
    }

    const { year } = getDateInTz(source.timezone);

    // Parse the date range shown: "April 1st - April 15th"
    const dateRangeMatch = html.match(/<strong>(\w+ \d+\w* - \w+ \d+\w*)<\/strong>/);
    if (!dateRangeMatch) {
      // Fallback: just write today's times
      const { dateKey } = getDateInTz(source.timezone);
      const count = await bulkUpsert(pool, [{ masjid: source.name, date: dateKey, fajr: prayerMap.fajr, dhuhr: prayerMap.dhuhr || "", asr: prayerMap.asr || "", maghrib: prayerMap.maghrib || "", isha: prayerMap.isha }]);
      if (count > 0) console.log(`[Iqama] Synced ${source.name} for today (fallback)`);
      return;
    }

    const rangeParts = dateRangeMatch[1].split(" - ");
    const parseRangeDate = (s: string): { month: number; day: number } | null => {
      const m = s.trim().match(/^(\w+)\s+(\d+)/);
      if (!m) return null;
      const monthNum = MONTH_NAMES_FULL[m[1]];
      if (!monthNum) return null;
      return { month: monthNum, day: parseInt(m[2]) };
    };

    const start = parseRangeDate(rangeParts[0]);
    const end = parseRangeDate(rangeParts[1] || rangeParts[0]);
    if (!start || !end) {
      const { dateKey } = getDateInTz(source.timezone);
      const count = await bulkUpsert(pool, [{ masjid: source.name, date: dateKey, fajr: prayerMap.fajr, dhuhr: prayerMap.dhuhr || "", asr: prayerMap.asr || "", maghrib: prayerMap.maghrib || "", isha: prayerMap.isha }]);
      if (count > 0) console.log(`[Iqama] Synced ${source.name} for today (range parse fallback)`);
      return;
    }

    // Expand the range into individual day rows (handles cross-month ranges)
    const rows: { masjid: string; date: string; fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }[] = [];
    let cur = new Date(year, start.month - 1, start.day);
    const endDate = new Date(year, end.month - 1, end.day);
    while (cur <= endDate) {
      const mm = String(cur.getMonth() + 1).padStart(2, "0");
      const dd = String(cur.getDate()).padStart(2, "0");
      rows.push({ masjid: source.name, date: `${year}-${mm}-${dd}`, fajr: prayerMap.fajr, dhuhr: prayerMap.dhuhr || "", asr: prayerMap.asr || "", maghrib: prayerMap.maghrib || "", isha: prayerMap.isha });
      cur.setDate(cur.getDate() + 1);
    }

    const count = await bulkUpsert(pool, rows);
    if (count > 0) console.log(`[Iqama] Synced ${count} ${source.name} days (${dateRangeMatch[1]})`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchEPICHtml(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }});
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    // Find <table class="prayer_table"> and extract iqamah column (3rd <td>)
    const tableMatch = html.match(/<table[^>]*class="[^"]*prayer_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) {
      console.error(`[Iqama] ${source.name}: prayer_table not found`);
      return;
    }
    const tableHtml = tableMatch[1];

    const prayerMap: Record<string, string> = {};
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      if (cells.length < 3) continue;
      const label = cells[0].toLowerCase();
      const iqamah = cells[2].trim();
      if (!iqamah || iqamah === "—" || iqamah === "-") continue;
      if (/fajr/.test(label)) prayerMap.fajr = iqamah;
      else if (/dhuhr|zuhr/.test(label)) prayerMap.dhuhr = iqamah;
      else if (/asr/.test(label)) prayerMap.asr = iqamah;
      else if (/maghrib/.test(label)) prayerMap.maghrib = iqamah;
      else if (/isha/.test(label)) prayerMap.isha = iqamah;
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse prayer times (found: ${Object.keys(prayerMap).join(", ")})`);
      return;
    }

    const { dateKey } = getDateInTz(source.timezone);
    const count = await bulkUpsert(pool, [{
      masjid: source.name,
      date: dateKey,
      fajr: prayerMap.fajr,
      dhuhr: prayerMap.dhuhr || "",
      asr: prayerMap.asr || "",
      maghrib: prayerMap.maghrib || "",
      isha: prayerMap.isha,
    }]);
    if (count > 0) console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchMasjidApps(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }});
    if (!resp.ok) {
      console.error(`[Iqama] ${source.name} page returned ${resp.status}`);
      return;
    }
    const html = await resp.text();

    // Table has columns: Salah | Adhan | Iqamah
    const prayerMap: Record<string, string> = {};
    const jumuahSlots: { khutbah_time: string; iqama_time: string; speaker?: string }[] = [];
    let lastJumuahIdx = -1;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      if (cells.length < 2) continue;
      const label = cells[0].toLowerCase();
      const col1 = cells[1]?.trim() || "";
      const col2 = cells[2]?.trim() || "";

      if (/fajr/.test(label) && col2) prayerMap.fajr = col2;
      else if (/dhuhr|zuhr/.test(label) && col2) prayerMap.dhuhr = col2;
      else if (/asr/.test(label) && col2) prayerMap.asr = col2;
      else if (/maghrib/.test(label) && col2) prayerMap.maghrib = col2;
      else if (/isha/.test(label) && col2) prayerMap.isha = col2;
      else if (/jum(m?u?a?h?|aa)/.test(label) && col1 && col2) {
        // Jummah / Jummah 2 / Jummah 3 — khutbah in col1, iqama in col2
        lastJumuahIdx = jumuahSlots.length;
        jumuahSlots.push({ khutbah_time: col1, iqama_time: col2 });
      } else if (/khateeb/.test(label) && col1 && lastJumuahIdx >= 0) {
        // Khateeb row follows its Jummah row — attach speaker to that slot
        jumuahSlots[lastJumuahIdx].speaker = col1;
        lastJumuahIdx = -1;
      }
    }

    if (!prayerMap.fajr || !prayerMap.isha) {
      console.error(`[Iqama] ${source.name}: could not parse prayer times (found: ${Object.keys(prayerMap).join(", ")})`);
      return;
    }

    const { dateKey } = getDateInTz(source.timezone);
    const count = await bulkUpsert(pool, [{
      masjid: source.name,
      date: dateKey,
      fajr: prayerMap.fajr,
      dhuhr: prayerMap.dhuhr || "",
      asr: prayerMap.asr || "",
      maghrib: prayerMap.maghrib || "",
      isha: prayerMap.isha,
    }]);
    if (count > 0) console.log(`[Iqama] Synced ${source.name} for ${dateKey}`);

    // Update jumuah_schedules with live slot times + speaker names
    if (jumuahSlots.length > 0) {
      const khutbahTimes = jumuahSlots.map(s => s.khutbah_time).join(", ");
      const iqamaTimes = jumuahSlots.map(s => s.iqama_time).join(", ");
      await pool.query(
        `UPDATE jumuah_schedules SET khutbahs=$1, khutbah_time=$2, iqama_time=$3, updated_at=NOW() WHERE masjid=$4`,
        [JSON.stringify(jumuahSlots), khutbahTimes, iqamaTimes, source.name]
      );
      console.log(`[Iqama] Updated ${source.name} Jumuah slots with speakers`);
    }
  } catch (err: any) {
    console.error(`[Iqama] Error syncing ${source.name}:`, err.message);
  }
}

async function fetchIARJumuah(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }});
    if (!resp.ok) { console.error(`[Jumuah] IAR homepage returned ${resp.status}`); return; }
    const html = await resp.text();

    // Strip tags, collapse whitespace into lines for pattern matching
    const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ");

    // Each shift block: "Nth Shift · [Campus] Campus ... time ... speaker"
    // We'll collect slots per campus name
    const campusSlots: Record<string, { khutbah_time: string; iqama_time: string; speaker?: string }[]> = {};

    const shiftRegex = /(\d+)(?:st|nd|rd|th)\s+Shift\s*[·•]\s*(Atwater|Page(?:\s+Rd)?)\s+Campus\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s+(?:[^<\n]*?)\s+((?!Speaker to be|Title to be)[A-Z][a-zA-Z\s.'-]{3,}?)(?=\s+\d+(?:st|nd|rd|th)\s+Shift|\s*$)/gi;

    let m;
    while ((m = shiftRegex.exec(text)) !== null) {
      const campus = m[2].toLowerCase().includes("page") ? "page" : "atwater";
      const timeRaw = m[3].trim();
      const time = /[AP]M/i.test(timeRaw) ? timeRaw : to12h(timeRaw + ":00");
      const speaker = m[4].trim();
      if (!campusSlots[campus]) campusSlots[campus] = [];
      campusSlots[campus].push({ khutbah_time: time, iqama_time: time, speaker: speaker || undefined });
    }

    // Simpler fallback: find all shifts, times, and h6-like speaker sections
    if (Object.keys(campusSlots).length === 0) {
      const blocks = [...text.matchAll(/(\d+)(?:st|nd|rd|th)\s+Shift\s*[·•]\s*(Atwater|Page)[^0-9]*(\d{1,2}:\d{2})/gi)];
      for (const block of blocks) {
        const campus = block[2].toLowerCase().includes("page") ? "page" : "atwater";
        const time = to12h(block[3] + ":00");
        if (!campusSlots[campus]) campusSlots[campus] = [];
        campusSlots[campus].push({ khutbah_time: time, iqama_time: time });
      }
    }

    const masjidMap: Record<string, string> = {
      atwater: "Islamic Association of Raleigh (Atwater)",
      page: "Islamic Association of Raleigh (Page Rd)",
    };

    for (const [campus, slots] of Object.entries(campusSlots)) {
      if (slots.length === 0) continue;
      const masjidName = masjidMap[campus];
      if (!masjidName) continue;
      const khutbahStr = slots.map(s => s.khutbah_time).join(", ");
      const iqamaStr = slots.map(s => s.iqama_time).join(", ");
      await pool.query(
        `UPDATE jumuah_schedules SET khutbahs=$1, khutbah_time=$2, iqama_time=$3, updated_at=NOW() WHERE masjid=$4`,
        [JSON.stringify(slots), khutbahStr, iqamaStr, masjidName]
      );
      const speakerNames = slots.filter(s => s.speaker).map(s => s.speaker).join(", ");
      console.log(`[Jumuah] Updated IAR ${campus}: ${slots.length} shifts${speakerNames ? ` (${speakerNames})` : ""}`);
    }
  } catch (err: any) {
    console.error(`[Jumuah] Error syncing IAR Jumuah:`, err.message);
  }
}

async function fetchICMNCJumuah(pool: pg.Pool, source: IqamaSource): Promise<void> {
  try {
    const resp = await fetch(source.url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }});
    if (!resp.ok) { console.error(`[Jumuah] ICMNC homepage returned ${resp.status}`); return; }
    const html = await resp.text();

    // Find the Friday Prayer Schedule table (Time | Speaker | Topic)
    // The table appears after "Friday Prayer Schedule" heading
    const fridaySection = html.match(/Friday\s+Prayer\s+Schedule[\s\S]{0,500}?(<table[\s\S]*?<\/table>)/i);
    if (!fridaySection) {
      console.warn(`[Jumuah] ICMNC: could not find Friday Prayer Schedule table`);
      return;
    }
    const tableHtml = fridaySection[1];

    // Parse rows: skip header row (Time|Speaker|Topic), grab data rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const slots: { khutbah_time: string; iqama_time: string; speaker?: string; topic?: string }[] = [];
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, "").trim());
      if (cells.length < 2) continue;
      const [timeStr, speaker, topic] = cells;
      // Skip header row
      if (/time/i.test(timeStr) || /speaker/i.test(timeStr)) continue;
      if (!timeStr || !/\d/.test(timeStr)) continue;
      slots.push({
        khutbah_time: timeStr,
        iqama_time: timeStr,
        speaker: speaker || undefined,
        topic: topic || undefined,
      });
    }

    if (slots.length === 0) {
      console.warn(`[Jumuah] ICMNC: no slots parsed from Friday table`);
      return;
    }

    const khutbahStr = slots.map(s => s.khutbah_time).join(", ");
    const iqamaStr = slots.map(s => s.iqama_time).join(", ");
    await pool.query(
      `UPDATE jumuah_schedules SET khutbahs=$1, khutbah_time=$2, iqama_time=$3, updated_at=NOW() WHERE masjid=$4`,
      [JSON.stringify(slots), khutbahStr, iqamaStr, "Islamic Center of Morrisville"]
    );
    const speakerNames = slots.filter(s => s.speaker).map(s => s.speaker).join(", ");
    console.log(`[Jumuah] Updated ICMNC: ${slots.length} slots${speakerNames ? ` (${speakerNames})` : ""}`);
  } catch (err: any) {
    console.error(`[Jumuah] Error syncing ICMNC Jumuah:`, err.message);
  }
}

async function syncSource(pool: pg.Pool, source: IqamaSource, year: number, month: number): Promise<void> {
  // Check syncDays restriction (day-of-week in the source's timezone)
  if (source.syncDays && source.syncDays.length > 0) {
    const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: source.timezone }));
    const dayOfWeek = nowInTz.getDay();
    if (!source.syncDays.includes(dayOfWeek)) return;
  }

  switch (source.type) {
    case "dpt":
      await fetchDPT(pool, source);
      break;
    case "iar":
      await fetchIAR(pool, source, year, month);
      break;
    case "mca-html":
      await fetchMCAHtml(pool, source);
      break;
    case "alnoor-html":
      await fetchAlNoorHtml(pool, source);
      break;
    case "sbia-html":
      await fetchSBIAHtml(pool, source);
      break;
    case "icf-html":
      await fetchICFHtml(pool, source);
      break;
    case "athanplus":
      await fetchAthanPlus(pool, source);
      break;
    case "alhuda-html":
      await fetchAlHudaHtml(pool, source);
      break;
    case "berkeley-json":
      await fetchBerkeleyJson(pool, source);
      break;
    case "mcc-html":
      await fetchMCCHtml(pool, source);
      break;
    case "epic-html":
      await fetchEPICHtml(pool, source);
      break;
    case "masjidapps":
      await fetchMasjidApps(pool, source);
      break;
    case "iar-jumuah":
      await fetchIARJumuah(pool, source);
      break;
    case "icmnc-jumuah":
      await fetchICMNCJumuah(pool, source);
      break;
  }
}

export async function syncExternalIqama(pool: pg.Pool): Promise<void> {
  const { year, month } = getRaleighDateRange(1);
  await Promise.all(IQAMA_SOURCES.map(source => syncSource(pool, source, year, month)));

  const now = new Date();
  const raleighNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const daysLeft = new Date(year, month, 0).getDate() - raleighNow.getDate();
  if (daysLeft <= 7) {
    const nextMonthDate = new Date(year, month, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth() + 1;

    for (const source of IQAMA_SOURCES) {
      if (source.type === "iar") {
        await fetchIAR(pool, source, nextYear, nextMonth);
      } else if (source.type === "mca-html") {
        await fetchMCAHtml(pool, source, nextMonth);
      }
    }
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

export function getIqamaSources(): { name: string; type: string; url: string }[] {
  return IQAMA_SOURCES.map(s => ({ name: s.name, type: s.type, url: s.url }));
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startIqamaSync(pool: pg.Pool) {
  syncExternalIqama(pool).catch(err => console.error("[Iqama] Initial sync error:", err.message));

  syncInterval = setInterval(() => {
    syncExternalIqama(pool).catch(err => console.error("[Iqama] Sync error:", err.message));
  }, 6 * 60 * 60 * 1000);
}
