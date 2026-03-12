import AsyncStorage from "@react-native-async-storage/async-storage";

const BADGES_KEY = "prayer_badges_earned";

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  icon: string;
  requirement: string;
  threshold: number;
}

export interface BadgeState {
  key: string;
  earned: boolean;
  earnedAt: string | null;
  progress: number;
  total: number;
}

export const BADGES: BadgeDefinition[] = [
  { key: "first_step", title: "First Step", description: "Track your first prayer", icon: "footsteps", requirement: "Track 1 prayer", threshold: 1 },
  { key: "full_day", title: "Full Day", description: "Complete all 5 prayers in a day", icon: "sunny", requirement: "5/5 prayers in one day", threshold: 5 },
  { key: "fajr_warrior", title: "Fajr Warrior", description: "Pray Fajr for 7 days straight", icon: "moon", requirement: "7 consecutive Fajr prayers", threshold: 7 },
  { key: "consistency_king", title: "Consistency King", description: "All 5 prayers daily for a week", icon: "flame", requirement: "7 days of 5/5 prayers", threshold: 7 },
  { key: "masjid_regular", title: "Masjid Regular", description: "Pray at the masjid daily for a week", icon: "home", requirement: "7 days with masjid prayer", threshold: 7 },
  { key: "monthly_champion", title: "Monthly Champion", description: "90%+ completion in a month", icon: "trophy", requirement: "90% prayers in a month", threshold: 90 },
  { key: "iron_streak", title: "Iron Streak", description: "All 5 prayers daily for 30 days", icon: "shield-checkmark", requirement: "30 days of 5/5 prayers", threshold: 30 },
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
  const earned = await loadEarned();
  const today = formatDateKey(new Date());
  const newlyEarned: string[] = [];

  const fullDayStreak = countConsecutiveFullDays(data);
  const fajrStreak = countConsecutiveFajr(data);
  const masjidStreak = countConsecutiveMasjidDays(data);
  const bestMonth = findBestMonthCompletion(data);

  const checks: { key: string; isEarned: boolean; progress: number; total: number; earnDate: string }[] = [
    { key: "first_step", isEarned: hasAnyPrayer(data), progress: hasAnyPrayer(data) ? 1 : 0, total: 1, earnDate: Object.keys(data).sort()[0] || today },
    { key: "full_day", isEarned: hasFullDay(data) !== null, progress: hasFullDay(data) !== null ? 5 : Math.max(...Object.values(data).map(l => [l.fajr, l.dhuhr, l.asr, l.maghrib, l.isha].filter(s => s > 0).length), 0), total: 5, earnDate: hasFullDay(data) || today },
    { key: "fajr_warrior", isEarned: fajrStreak.streak >= 7, progress: Math.min(fajrStreak.streak, 7), total: 7, earnDate: today },
    { key: "consistency_king", isEarned: fullDayStreak.streak >= 7, progress: Math.min(fullDayStreak.streak, 7), total: 7, earnDate: today },
    { key: "masjid_regular", isEarned: masjidStreak.streak >= 7, progress: Math.min(masjidStreak.streak, 7), total: 7, earnDate: today },
    { key: "monthly_champion", isEarned: bestMonth.pct >= 90, progress: bestMonth.pct, total: 90, earnDate: bestMonth.month ? bestMonth.month + "-01" : today },
    { key: "iron_streak", isEarned: fullDayStreak.streak >= 30, progress: Math.min(fullDayStreak.streak, 30), total: 30, earnDate: today },
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
