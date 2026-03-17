import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "prayer_tracker";
const MISSED_FASTS_KEY = "missed_fasts";

export type PrayerStatus = 0 | 1 | 2 | 3;

export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

const PRAYER_ORDER: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export interface DayLog {
  fajr: PrayerStatus;
  dhuhr: PrayerStatus;
  asr: PrayerStatus;
  maghrib: PrayerStatus;
  isha: PrayerStatus;
}

export interface PrayerTrackerData {
  [dateKey: string]: DayLog;
}

const DEFAULT_DAY_LOG: DayLog = {
  fajr: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadAll(): Promise<PrayerTrackerData> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PrayerTrackerData;
  } catch {
    return {};
  }
}

async function saveAll(data: PrayerTrackerData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function getPrayerLog(date: Date): Promise<DayLog> {
  const data = await loadAll();
  const key = formatDateKey(date);
  return data[key] ?? { ...DEFAULT_DAY_LOG };
}

export async function setPrayerStatus(
  date: Date,
  prayer: PrayerName,
  status: PrayerStatus
): Promise<DayLog> {
  const data = await loadAll();
  const key = formatDateKey(date);
  const existing = data[key] ?? { ...DEFAULT_DAY_LOG };
  existing[prayer] = status;
  data[key] = existing;
  await saveAll(data);
  return existing;
}

export function isPrayerExpired(
  prayer: PrayerName,
  date: Date,
  prayerTimesForDate?: { fajr?: Date; dhuhr?: Date; asr?: Date; maghrib?: Date; isha?: Date }
): boolean {
  const now = new Date();
  const today = new Date();
  const dateKey = formatDateKey(date);
  const todayKey = formatDateKey(today);

  if (dateKey < todayKey) return true;
  if (dateKey > todayKey) return false;

  if (!prayerTimesForDate) return false;

  const prayerIdx = PRAYER_ORDER.indexOf(prayer);
  if (prayerIdx < 0) return false;

  if (prayer === "isha") {
    const tomorrow2am = new Date(today);
    tomorrow2am.setDate(tomorrow2am.getDate() + 1);
    tomorrow2am.setHours(2, 0, 0, 0);
    return now >= tomorrow2am;
  }

  const nextPrayerName = PRAYER_ORDER[prayerIdx + 1];
  const nextTime = prayerTimesForDate[nextPrayerName];
  if (nextTime && now >= nextTime) return true;

  return false;
}

export async function cyclePrayerStatus(
  date: Date,
  prayer: PrayerName,
  prayerTimesForDate?: { fajr?: Date; dhuhr?: Date; asr?: Date; maghrib?: Date; isha?: Date }
): Promise<DayLog> {
  const data = await loadAll();
  const key = formatDateKey(date);
  const existing = data[key] ?? { ...DEFAULT_DAY_LOG };
  const current = existing[prayer];

  const expired = isPrayerExpired(prayer, date, prayerTimesForDate);

  let next: PrayerStatus;
  if (expired) {
    next = current === 0 ? 3 : current === 3 ? 2 : 0;
  } else {
    next = current === 0 ? 1 : current === 1 ? 2 : 0;
  }

  existing[prayer] = next;
  data[key] = existing;
  await saveAll(data);
  return existing;
}

export async function getMissedPrayerCount(days: number = 7): Promise<number> {
  const data = await loadAll();
  let count = 0;
  const today = new Date();
  const todayKey = formatDateKey(today);

  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    const log = data[key];
    if (!log) continue;
    for (const p of PRAYER_ORDER) {
      if (log[p] === 0 || log[p] === 2) count++;
    }
  }

  const todayLog = data[todayKey];
  if (todayLog) {
    for (const p of PRAYER_ORDER) {
      if (todayLog[p] === 2) count++;
    }
  }

  return count;
}

export async function getAllLogs(): Promise<PrayerTrackerData> {
  return loadAll();
}

export async function getMonthLogs(
  year: number,
  month: number
): Promise<{ [dateKey: string]: DayLog }> {
  const data = await loadAll();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const result: { [dateKey: string]: DayLog } = {};
  for (const key of Object.keys(data)) {
    if (key.startsWith(prefix)) {
      result[key] = data[key];
    }
  }
  return result;
}

async function loadMissedFasts(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(MISSED_FASTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveMissedFasts(dates: string[]): Promise<void> {
  await AsyncStorage.setItem(MISSED_FASTS_KEY, JSON.stringify(dates));
}

export async function getMissedFastDates(): Promise<string[]> {
  return loadMissedFasts();
}

export async function toggleMissedFast(dateKey: string): Promise<{ dates: string[]; isMissed: boolean }> {
  const dates = await loadMissedFasts();
  const idx = dates.indexOf(dateKey);
  if (idx >= 0) {
    dates.splice(idx, 1);
    await saveMissedFasts(dates);
    return { dates, isMissed: false };
  } else {
    dates.push(dateKey);
    await saveMissedFasts(dates);
    return { dates, isMissed: true };
  }
}

export async function getMissedFastCount(): Promise<number> {
  const dates = await loadMissedFasts();
  return dates.length;
}

export async function logMakeupFast(): Promise<number> {
  const dates = await loadMissedFasts();
  if (dates.length > 0) {
    dates.shift();
    await saveMissedFasts(dates);
  }
  return dates.length;
}

export async function getMonthMissedFasts(year: number, month: number): Promise<Set<string>> {
  const dates = await loadMissedFasts();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return new Set(dates.filter(d => d.startsWith(prefix)));
}

export async function getPrayerStreak(): Promise<number> {
  const data = await loadAll();
  let streak = 0;
  const today = new Date();
  const d = new Date(today);
  d.setDate(d.getDate() - 1);

  while (true) {
    const key = formatDateKey(d);
    const log = data[key];
    if (!log) break;
    const allPrayed = log.fajr >= 1 && log.dhuhr >= 1 && log.asr >= 1 && log.maghrib >= 1 && log.isha >= 1;
    if (!allPrayed) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const todayLog = data[formatDateKey(today)];
  if (todayLog) {
    const allToday = todayLog.fajr >= 1 && todayLog.dhuhr >= 1 && todayLog.asr >= 1 && todayLog.maghrib >= 1 && todayLog.isha >= 1;
    if (allToday) streak++;
  }

  return streak;
}

export { formatDateKey };
