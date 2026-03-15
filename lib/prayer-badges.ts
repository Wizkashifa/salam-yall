import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DhikrDayData } from "./dhikr-tracker";

const BADGES_KEY = "prayer_badges_earned";

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  icon: string;
  requirement: string;
  threshold: number;
  category?: "prayer" | "quran" | "dhikr";
}

export interface BadgeState {
  key: string;
  earned: boolean;
  earnedAt: string | null;
  progress: number;
  total: number;
}

export const BADGES: BadgeDefinition[] = [
  { key: "first_step", title: "First Step", description: "Track your first prayer", icon: "footsteps", requirement: "Track 1 prayer", threshold: 1, category: "prayer" },
  { key: "full_day", title: "Full Day", description: "Complete all 5 prayers in a day", icon: "sunny", requirement: "5/5 prayers in one day", threshold: 5, category: "prayer" },
  { key: "fajr_warrior", title: "Fajr Warrior", description: "Pray Fajr for 7 days straight", icon: "moon", requirement: "7 consecutive Fajr prayers", threshold: 7, category: "prayer" },
  { key: "consistency_king", title: "Consistency King", description: "All 5 prayers daily for a week", icon: "flame", requirement: "7 days of 5/5 prayers", threshold: 7, category: "prayer" },
  { key: "masjid_regular", title: "Masjid Regular", description: "Pray at the masjid daily for a week", icon: "home", requirement: "7 days with masjid prayer", threshold: 7, category: "prayer" },
  { key: "monthly_champion", title: "Monthly Champion", description: "90%+ completion in a month", icon: "trophy", requirement: "90% prayers in a month", threshold: 90, category: "prayer" },
  { key: "iron_streak", title: "Iron Streak", description: "All 5 prayers daily for 30 days", icon: "shield-checkmark", requirement: "30 days of 5/5 prayers", threshold: 30, category: "prayer" },
  { key: "tasbeeh_fatima", title: "Tasbeeh Fatima", description: "Complete SubhanAllah ×33, Alhamdulillah ×33, Allahu Akbar ×34", icon: "sparkles", requirement: "Complete Tasbeeh Fatima", threshold: 1, category: "dhikr" },
  { key: "first_read", title: "First Read", description: "Open the Quran reader for the first time", icon: "book-outline", requirement: "Open Quran once", threshold: 1, category: "quran" },
  { key: "daily_reader", title: "Daily Reader", description: "Read Quran for 7 consecutive days", icon: "ribbon-outline", requirement: "7-day reading streak", threshold: 7, category: "quran" },
  { key: "juz_scholar", title: "Juz Scholar", description: "Read all surahs that span a juz", icon: "school-outline", requirement: "Read all surahs in a juz", threshold: 1, category: "quran" },
  { key: "khatm", title: "Khatm", description: "Complete reading all 114 surahs of the Quran", icon: "star", requirement: "Complete all 114 surahs", threshold: 114, category: "quran" },
];

interface DayLog {
  fajr: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

interface TrackerData {
  [dateKey: string]: DayLog;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prevDay(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

function dayFullyCompleted(log: DayLog | undefined): boolean {
  if (!log) return false;
  return log.fajr > 0 && log.dhuhr > 0 && log.asr > 0 && log.maghrib > 0 && log.isha > 0;
}

function dayHasMasjid(log: DayLog | undefined): boolean {
  if (!log) return false;
  return log.fajr === 2 || log.dhuhr === 2 || log.asr === 2 || log.maghrib === 2 || log.isha === 2;
}

function countConsecutiveFullDays(data: TrackerData): { streak: number; firstDay: string } {
  let key = formatDateKey(new Date());
  let streak = 0;
  let firstDay = key;
  while (dayFullyCompleted(data[key])) {
    streak++;
    firstDay = key;
    key = prevDay(key);
  }
  return { streak, firstDay };
}

function countConsecutiveFajr(data: TrackerData): { streak: number; firstDay: string } {
  let key = formatDateKey(new Date());
  let streak = 0;
  let firstDay = key;
  while (data[key] && data[key].fajr > 0) {
    streak++;
    firstDay = key;
    key = prevDay(key);
  }
  return { streak, firstDay };
}

function countConsecutiveMasjidDays(data: TrackerData): { streak: number; firstDay: string } {
  let key = formatDateKey(new Date());
  let streak = 0;
  let firstDay = key;
  while (dayHasMasjid(data[key])) {
    streak++;
    firstDay = key;
    key = prevDay(key);
  }
  return { streak, firstDay };
}

function findBestMonthCompletion(data: TrackerData): { pct: number; month: string } {
  const months: { [m: string]: { prayed: number; total: number } } = {};
  for (const [key, log] of Object.entries(data)) {
    const month = key.slice(0, 7);
    if (!months[month]) months[month] = { prayed: 0, total: 0 };
    const prayers = [log.fajr, log.dhuhr, log.asr, log.maghrib, log.isha];
    months[month].total += 5;
    months[month].prayed += prayers.filter(s => s > 0).length;
  }
  let best = { pct: 0, month: "" };
  for (const [month, stats] of Object.entries(months)) {
    if (stats.total < 25) continue;
    const pct = Math.round((stats.prayed / stats.total) * 100);
    if (pct > best.pct) best = { pct, month };
  }
  return best;
}

interface DhikrStorageData {
  [dateKey: string]: DhikrDayData;
}

function countTasbeehFatimaCompletions(dhikrData: DhikrStorageData): { count: number; firstDate: string | null } {
  let count = 0;
  let firstDate: string | null = null;
  for (const [dateKey, day] of Object.entries(dhikrData)) {
    const subhan = day["subhanallah"] ?? 0;
    const alhamd = day["alhamdulillah"] ?? 0;
    const akbar = day["allahuakbar"] ?? 0;
    if (subhan >= 33 && alhamd >= 33 && akbar >= 34) {
      count++;
      if (!firstDate || dateKey < firstDate) firstDate = dateKey;
    }
  }
  return { count, firstDate };
}

function hasAnyPrayer(data: TrackerData): boolean {
  for (const log of Object.values(data)) {
    if (log.fajr > 0 || log.dhuhr > 0 || log.asr > 0 || log.maghrib > 0 || log.isha > 0) return true;
  }
  return false;
}

function hasFullDay(data: TrackerData): string | null {
  for (const [key, log] of Object.entries(data)) {
    if (dayFullyCompleted(log)) return key;
  }
  return null;
}

const JUZ_SURAH_RANGES: number[][] = [
  [1, 2],
  [2],
  [2, 3],
  [3, 4],
  [4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10, 11],
  [11, 12],
  [12, 13, 14],
  [15, 16],
  [17, 18],
  [18, 19, 20],
  [21, 22],
  [23, 24, 25],
  [25, 26, 27],
  [27, 28, 29],
  [29, 30, 31, 32, 33],
  [33, 34, 35, 36],
  [36, 37, 38, 39],
  [39, 40, 41],
  [41, 42, 43, 44, 45],
  [46, 47, 48, 49, 50, 51],
  [51, 52, 53, 54, 55, 56, 57],
  [58, 59, 60, 61, 62, 63, 64, 65, 66],
  [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
  [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114],
];

function hasCompletedAnyJuz(readSurahIds: number[]): boolean {
  const readSet = new Set(readSurahIds);
  for (const juzSurahs of JUZ_SURAH_RANGES) {
    const uniqueSurahs = [...new Set(juzSurahs)];
    if (uniqueSurahs.every(s => readSet.has(s))) return true;
  }
  return false;
}

function getJuzProgress(readSurahIds: number[]): { bestProgress: number; bestTotal: number } {
  const readSet = new Set(readSurahIds);
  let bestProgress = 0;
  let bestTotal = 1;
  for (const juzSurahs of JUZ_SURAH_RANGES) {
    const uniqueSurahs = [...new Set(juzSurahs)];
    const completed = uniqueSurahs.filter(s => readSet.has(s)).length;
    const ratio = completed / uniqueSurahs.length;
    if (ratio > bestProgress / bestTotal) {
      bestProgress = completed;
      bestTotal = uniqueSurahs.length;
    }
  }
  return { bestProgress, bestTotal };
}

interface EarnedBadges {
  [key: string]: string;
}

async function loadEarned(): Promise<EarnedBadges> {
  const raw = await AsyncStorage.getItem(BADGES_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function saveEarned(earned: EarnedBadges): Promise<void> {
  await AsyncStorage.setItem(BADGES_KEY, JSON.stringify(earned));
}

export async function computeBadges(): Promise<{ badges: BadgeState[]; newlyEarned: string[] }> {
  const raw = await AsyncStorage.getItem("prayer_tracker");
  const data: TrackerData = raw ? JSON.parse(raw) : {};
  const dhikrRaw = await AsyncStorage.getItem("dhikr_tracker");
  const dhikrData: DhikrStorageData = dhikrRaw ? JSON.parse(dhikrRaw) : {};
  const earned = await loadEarned();
  const today = formatDateKey(new Date());
  const newlyEarned: string[] = [];

  const fullDayStreak = countConsecutiveFullDays(data);
  const fajrStreak = countConsecutiveFajr(data);
  const masjidStreak = countConsecutiveMasjidDays(data);
  const bestMonth = findBestMonthCompletion(data);
  const tasbeehFatima = countTasbeehFatimaCompletions(dhikrData);

  const quranDatesRaw = await AsyncStorage.getItem("quran_reading_tracker");
  const quranDates: string[] = quranDatesRaw ? JSON.parse(quranDatesRaw) : [];
  const quranDateSet = new Set(quranDates);
  const hasOpenedQuran = quranDates.length > 0;

  let quranStreak = 0;
  {
    const d = new Date();
    if (quranDateSet.has(formatDateKey(d))) {
      quranStreak = 1;
      d.setDate(d.getDate() - 1);
    } else {
      d.setDate(d.getDate() - 1);
      if (!quranDateSet.has(formatDateKey(d))) {
        quranStreak = 0;
      }
    }
    if (quranStreak > 0 || quranDateSet.has(formatDateKey(d))) {
      while (quranDateSet.has(formatDateKey(d))) {
        quranStreak++;
        d.setDate(d.getDate() - 1);
      }
    }
  }

  const khatamRaw = await AsyncStorage.getItem("quran_khatam_tracker");
  const khatamData: { current: number[]; completed: number } = khatamRaw ? JSON.parse(khatamRaw) : { current: [], completed: 0 };
  const readSurahIds = khatamData.current;
  const completedKhatams = khatamData.completed;
  const hasKhatm = completedKhatams > 0;
  const totalSurahsRead = hasKhatm ? 114 : readSurahIds.length;

  const juzComplete = hasCompletedAnyJuz(readSurahIds) || hasKhatm;
  const juzProgress = getJuzProgress(readSurahIds);

  const checks: { key: string; isEarned: boolean; progress: number; total: number; earnDate: string }[] = [
    { key: "first_step", isEarned: hasAnyPrayer(data), progress: hasAnyPrayer(data) ? 1 : 0, total: 1, earnDate: Object.keys(data).sort()[0] || today },
    { key: "full_day", isEarned: hasFullDay(data) !== null, progress: hasFullDay(data) !== null ? 5 : Math.max(...Object.values(data).map(l => [l.fajr, l.dhuhr, l.asr, l.maghrib, l.isha].filter(s => s > 0).length), 0), total: 5, earnDate: hasFullDay(data) || today },
    { key: "fajr_warrior", isEarned: fajrStreak.streak >= 7, progress: Math.min(fajrStreak.streak, 7), total: 7, earnDate: today },
    { key: "consistency_king", isEarned: fullDayStreak.streak >= 7, progress: Math.min(fullDayStreak.streak, 7), total: 7, earnDate: today },
    { key: "masjid_regular", isEarned: masjidStreak.streak >= 7, progress: Math.min(masjidStreak.streak, 7), total: 7, earnDate: today },
    { key: "monthly_champion", isEarned: bestMonth.pct >= 90, progress: bestMonth.pct, total: 90, earnDate: bestMonth.month ? bestMonth.month + "-01" : today },
    { key: "iron_streak", isEarned: fullDayStreak.streak >= 30, progress: Math.min(fullDayStreak.streak, 30), total: 30, earnDate: today },
    { key: "tasbeeh_fatima", isEarned: tasbeehFatima.count >= 1, progress: tasbeehFatima.count, total: 1, earnDate: tasbeehFatima.firstDate || today },
    { key: "first_read", isEarned: hasOpenedQuran, progress: hasOpenedQuran ? 1 : 0, total: 1, earnDate: quranDates.sort()[0] || today },
    { key: "daily_reader", isEarned: quranStreak >= 7, progress: Math.min(quranStreak, 7), total: 7, earnDate: today },
    { key: "juz_scholar", isEarned: juzComplete, progress: juzComplete ? 1 : 0, total: 1, earnDate: today },
    { key: "khatm", isEarned: hasKhatm, progress: totalSurahsRead, total: 114, earnDate: today },
  ];

  for (const check of checks) {
    if (check.isEarned && !earned[check.key]) {
      earned[check.key] = check.earnDate;
      newlyEarned.push(check.key);
    }
  }

  if (newlyEarned.length > 0) {
    await saveEarned(earned);
  }

  const badges: BadgeState[] = checks.map(c => ({
    key: c.key,
    earned: !!earned[c.key],
    earnedAt: earned[c.key] || null,
    progress: earned[c.key] ? c.total : c.progress,
    total: c.total,
  }));

  return { badges, newlyEarned };
}

export function getBadgeDefinition(key: string): BadgeDefinition | undefined {
  return BADGES.find(b => b.key === key);
}
