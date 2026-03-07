import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "prayer_tracker";

export type PrayerStatus = 0 | 1 | 2;

export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

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

export async function cyclePrayerStatus(
  date: Date,
  prayer: PrayerName
): Promise<DayLog> {
  const data = await loadAll();
  const key = formatDateKey(date);
  const existing = data[key] ?? { ...DEFAULT_DAY_LOG };
  const current = existing[prayer];
  const next: PrayerStatus = current === 0 ? 1 : current === 1 ? 2 : 0;
  existing[prayer] = next;
  data[key] = existing;
  await saveAll(data);
  return existing;
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

export { formatDateKey };
