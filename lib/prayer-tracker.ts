import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "prayer_tracker";
const MISSED_FASTS_KEY = "missed_fasts";
const CACHED_PRAYER_TIMES_KEY = "cached_prayer_times";
const FIRST_USE_KEY = "prayer_tracker_first_use";

export type PrayerStatus = 0 | 1 | 2 | 3 | 4;

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

export type PrayerTimesMap = { fajr?: Date; dhuhr?: Date; asr?: Date; maghrib?: Date; isha?: Date };

interface CachedPrayerTimesRaw {
  dateKey: string;
  fajr?: string;
  dhuhr?: string;
  asr?: string;
  maghrib?: string;
  isha?: string;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function cacheTodayPrayerTimes(times: PrayerTimesMap): Promise<void> {
  const raw: CachedPrayerTimesRaw = {
    dateKey: formatDateKey(new Date()),
    fajr: times.fajr?.toISOString(),
    dhuhr: times.dhuhr?.toISOString(),
    asr: times.asr?.toISOString(),
    maghrib: times.maghrib?.toISOString(),
    isha: times.isha?.toISOString(),
  };
  await AsyncStorage.setItem(CACHED_PRAYER_TIMES_KEY, JSON.stringify(raw));
}

async function getCachedPrayerTimes(): Promise<PrayerTimesMap | undefined> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_PRAYER_TIMES_KEY);
    if (!raw) return undefined;
    const parsed: CachedPrayerTimesRaw = JSON.parse(raw);
    if (parsed.dateKey !== formatDateKey(new Date())) return undefined;
    return {
      fajr: parsed.fajr ? new Date(parsed.fajr) : undefined,
      dhuhr: parsed.dhuhr ? new Date(parsed.dhuhr) : undefined,
      asr: parsed.asr ? new Date(parsed.asr) : undefined,
      maghrib: parsed.maghrib ? new Date(parsed.maghrib) : undefined,
      isha: parsed.isha ? new Date(parsed.isha) : undefined,
    };
  } catch {
    return undefined;
  }
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

export async function getFirstUseDate(): Promise<string | null> {
  return AsyncStorage.getItem(FIRST_USE_KEY);
}

export async function ensureFirstUseDate(): Promise<string> {
  const existing = await AsyncStorage.getItem(FIRST_USE_KEY);
  if (existing) return existing;
  const today = formatDateKey(new Date());
  await AsyncStorage.setItem(FIRST_USE_KEY, today);
  return today;
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

  if (dateKey > todayKey) return false;

  if (dateKey < todayKey) {
    if (prayer === "isha") {
      const yesterdayKey = formatDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
      if (dateKey === yesterdayKey) {
        const cutoff = new Date(today);
        cutoff.setHours(2, 0, 0, 0);
        return now >= cutoff;
      }
    }
    return true;
  }

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
  prayerTimesForDate?: PrayerTimesMap
): Promise<DayLog> {
  const data = await loadAll();
  const key = formatDateKey(date);
  const existing = data[key] ?? { ...DEFAULT_DAY_LOG };
  const current = existing[prayer];

  const times = prayerTimesForDate ?? (formatDateKey(date) === formatDateKey(new Date()) ? await getCachedPrayerTimes() : undefined);
  const expired = isPrayerExpired(prayer, date, times);

  let next: PrayerStatus;
  if (expired) {
    next = current === 0 ? 1 : current === 1 ? 2 : current === 2 ? 3 : current === 3 ? 4 : 0;
  } else {
    next = current === 0 ? 1 : current === 1 ? 2 : current === 2 ? 4 : 0;
  }

  existing[prayer] = next;
  data[key] = existing;
  await saveAll(data);
  return existing;
}

export async function getMissedPrayerCount(days: number = 7): Promise<number> {
  const data = await loadAll();
  const todayPrayerTimes = await getCachedPrayerTimes();
  const firstUse = await getFirstUseDate();
  let count = 0;
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    if (firstUse && key < firstUse) break;
    const log = data[key] ?? { ...DEFAULT_DAY_LOG };
    for (const p of PRAYER_ORDER) {
      if (log[p] !== 0) continue;
      const timesForDay = i === 0 ? todayPrayerTimes : undefined;
      if (isPrayerExpired(p, d, timesForDay)) {
        count++;
      }
    }
  }

  return count;
}

export type MissedPrayerCounts = Record<PrayerName, number>;

export async function getMissedPrayersByType(): Promise<MissedPrayerCounts> {
  const data = await loadAll();
  const todayPrayerTimes = await getCachedPrayerTimes();
  const firstUse = await getFirstUseDate();
  const counts: MissedPrayerCounts = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const today = new Date();

  if (!firstUse) return counts;

  const startParts = firstUse.split("-");
  const startDate = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
  const d = new Date(startDate);

  while (d <= today) {
    const key = formatDateKey(d);
    const log = data[key] ?? { ...DEFAULT_DAY_LOG };
    const isToday = key === formatDateKey(today);
    for (const p of PRAYER_ORDER) {
      if (log[p] !== 0) continue;
      const timesForDay = isToday ? todayPrayerTimes : undefined;
      if (isPrayerExpired(p, d, timesForDay)) {
        counts[p]++;
      }
    }
    d.setDate(d.getDate() + 1);
  }

  return counts;
}

export async function makeUpOldestMissedPrayer(prayer: PrayerName): Promise<boolean> {
  const data = await loadAll();
  const todayPrayerTimes = await getCachedPrayerTimes();
  const firstUse = await getFirstUseDate();
  const today = new Date();

  if (!firstUse) return false;

  const startParts = firstUse.split("-");
  const startDate = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
  const d = new Date(startDate);
  const todayKey = formatDateKey(today);

  while (d <= today) {
    const key = formatDateKey(d);
    const log = data[key] ?? { ...DEFAULT_DAY_LOG };
    if (log[prayer] === 0) {
      const isToday = key === todayKey;
      const timesForDay = isToday ? todayPrayerTimes : undefined;
      if (isPrayerExpired(prayer, d, timesForDay)) {
        log[prayer] = 3;
        data[key] = log;
        await saveAll(data);
        return true;
      }
    }
    d.setDate(d.getDate() + 1);
  }

  return false;
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
  const data = await loadAll();
  const idx = dates.indexOf(dateKey);
  if (idx >= 0) {
    dates.splice(idx, 1);
    if (data[dateKey]) {
      for (const p of PRAYER_ORDER) {
        if (data[dateKey][p] === 4) data[dateKey][p] = 0;
      }
      await saveAll(data);
    }
    await saveMissedFasts(dates);
    return { dates, isMissed: false };
  } else {
    dates.push(dateKey);
    const log = data[dateKey] ?? { ...DEFAULT_DAY_LOG };
    for (const p of PRAYER_ORDER) {
      if (log[p] === 0) log[p] = 4;
    }
    data[dateKey] = log;
    await saveAll(data);
    await saveMissedFasts(dates);
    return { dates, isMissed: true };
  }
}

export async function toggleExcusedDay(dateKey: string): Promise<boolean> {
  const data = await loadAll();
  const log = data[dateKey] ?? { ...DEFAULT_DAY_LOG };
  const allExcused = PRAYER_ORDER.every(p => log[p] === 4);
  for (const p of PRAYER_ORDER) {
    log[p] = allExcused ? 0 : (log[p] === 0 ? 4 : log[p]);
  }
  data[dateKey] = log;
  await saveAll(data);
  return !allExcused;
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

export async function getOnTimeStreak(): Promise<number> {
  const data = await loadAll();
  let streak = 0;
  const today = new Date();
  const d = new Date(today);
  d.setDate(d.getDate() - 1);

  while (true) {
    const key = formatDateKey(d);
    const log = data[key];
    if (!log) break;
    const allOnTime = (log.fajr === 1 || log.fajr === 2) && (log.dhuhr === 1 || log.dhuhr === 2) && (log.asr === 1 || log.asr === 2) && (log.maghrib === 1 || log.maghrib === 2) && (log.isha === 1 || log.isha === 2);
    if (!allOnTime) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const todayLog = data[formatDateKey(today)];
  if (todayLog) {
    const allToday = (todayLog.fajr === 1 || todayLog.fajr === 2) && (todayLog.dhuhr === 1 || todayLog.dhuhr === 2) && (todayLog.asr === 1 || todayLog.asr === 2) && (todayLog.maghrib === 1 || todayLog.maghrib === 2) && (todayLog.isha === 1 || todayLog.isha === 2);
    if (allToday) streak++;
  }

  return streak;
}

export async function syncFromWidgetData(widgetCodes: Record<string, number>): Promise<DayLog | null> {
  const data = await loadAll();
  const key = formatDateKey(new Date());
  const existing = data[key] ?? { ...DEFAULT_DAY_LOG };
  let changed = false;

  for (const p of PRAYER_ORDER) {
    const widgetStatus = widgetCodes[p] as PrayerStatus | undefined;
    if (widgetStatus !== undefined && widgetStatus !== existing[p]) {
      existing[p] = widgetStatus;
      changed = true;
    }
  }

  if (changed) {
    data[key] = existing;
    await saveAll(data);
    return existing;
  }
  return null;
}

export { formatDateKey };
