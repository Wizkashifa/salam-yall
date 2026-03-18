import AsyncStorage from "@react-native-async-storage/async-storage";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "quran_reading_tracker";
const KHATAM_KEY = "quran_khatam_tracker";
const TOTAL_SURAHS = 114;

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadDates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveDates(dates: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dates));
}

export async function logQuranRead(date?: Date): Promise<void> {
  const key = formatDateKey(date ?? new Date());
  const dates = await loadDates();
  if (!dates.includes(key)) {
    dates.push(key);
    await saveDates(dates);
  }
  trackEvent("quran_read", { date: key });
}

export async function hasReadToday(): Promise<boolean> {
  const key = formatDateKey(new Date());
  const dates = await loadDates();
  return dates.includes(key);
}

export async function getReadingDates(): Promise<string[]> {
  return loadDates();
}

export async function getReadingStreak(): Promise<number> {
  const dates = new Set(await loadDates());
  let streak = 0;
  const d = new Date();

  if (dates.has(formatDateKey(d))) {
    streak = 1;
    d.setDate(d.getDate() - 1);
  } else {
    d.setDate(d.getDate() - 1);
    if (!dates.has(formatDateKey(d))) return 0;
  }

  while (dates.has(formatDateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

export interface KhatamProgress {
  readSurahIds: number[];
  completedCount: number;
  totalSurahs: number;
  isComplete: boolean;
  completedKhatams: number;
}

async function loadKhatam(): Promise<{ current: number[]; completed: number }> {
  try {
    const raw = await AsyncStorage.getItem(KHATAM_KEY);
    if (!raw) return { current: [], completed: 0 };
    return JSON.parse(raw);
  } catch {
    return { current: [], completed: 0 };
  }
}

async function saveKhatam(data: { current: number[]; completed: number }): Promise<void> {
  await AsyncStorage.setItem(KHATAM_KEY, JSON.stringify(data));
}

export async function markSurahRead(surahId: number): Promise<KhatamProgress> {
  const data = await loadKhatam();
  if (!data.current.includes(surahId)) {
    data.current.push(surahId);
  }

  if (data.current.length >= TOTAL_SURAHS) {
    data.completed += 1;
    data.current = [];
  }

  await saveKhatam(data);
  return {
    readSurahIds: data.current,
    completedCount: data.current.length,
    totalSurahs: TOTAL_SURAHS,
    isComplete: data.current.length === 0 && data.completed > 0,
    completedKhatams: data.completed,
  };
}

export async function getKhatamProgress(): Promise<KhatamProgress> {
  const data = await loadKhatam();
  return {
    readSurahIds: data.current,
    completedCount: data.current.length,
    totalSurahs: TOTAL_SURAHS,
    isComplete: false,
    completedKhatams: data.completed,
  };
}

export async function resetKhatam(): Promise<void> {
  const data = await loadKhatam();
  data.current = [];
  await saveKhatam(data);
}

const SURAH_PROGRESS_KEY = "quran_surah_progress";

export async function saveSurahProgress(surahId: number, readUpToIndex: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SURAH_PROGRESS_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    data[String(surahId)] = readUpToIndex;
    await AsyncStorage.setItem(SURAH_PROGRESS_KEY, JSON.stringify(data));
  } catch {
  }
}

export async function getSurahProgress(surahId: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SURAH_PROGRESS_KEY);
    if (!raw) return -1;
    const data: Record<string, number> = JSON.parse(raw);
    return data[String(surahId)] ?? -1;
  } catch {
    return -1;
  }
}

export async function resetSurahProgress(surahId: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SURAH_PROGRESS_KEY);
    if (!raw) return;
    const data: Record<string, number> = JSON.parse(raw);
    delete data[String(surahId)];
    await AsyncStorage.setItem(SURAH_PROGRESS_KEY, JSON.stringify(data));
  } catch {
  }
}

const QURAN_STATS_KEY = "quran_reading_stats";

export interface QuranReadingStats {
  totalPagesRead: number;
  totalAyahsRead: number;
}

async function loadStats(): Promise<QuranReadingStats> {
  try {
    const raw = await AsyncStorage.getItem(QURAN_STATS_KEY);
    if (!raw) return { totalPagesRead: 0, totalAyahsRead: 0 };
    return JSON.parse(raw);
  } catch {
    return { totalPagesRead: 0, totalAyahsRead: 0 };
  }
}

async function saveStats(stats: QuranReadingStats): Promise<void> {
  await AsyncStorage.setItem(QURAN_STATS_KEY, JSON.stringify(stats));
}

export async function getQuranStats(): Promise<QuranReadingStats> {
  return loadStats();
}

export async function addQuranReading(pages: number, ayahs: number): Promise<QuranReadingStats> {
  const stats = await loadStats();
  stats.totalPagesRead += pages;
  stats.totalAyahsRead += ayahs;
  await saveStats(stats);
  await logQuranRead();
  return stats;
}

export async function logPhysicalSurahReading(
  startSurah: number,
  startAyah: number,
  endSurah: number,
  endAyah: number,
  surahVersesCounts: number[]
): Promise<void> {
  let totalAyahs = 0;
  if (startSurah === endSurah) {
    totalAyahs = Math.max(0, endAyah - startAyah + 1);
  } else {
    totalAyahs += surahVersesCounts[startSurah - 1] - startAyah + 1;
    for (let s = startSurah + 1; s < endSurah; s++) {
      totalAyahs += surahVersesCounts[s - 1];
    }
    totalAyahs += endAyah;
  }

  const pages = Math.max(1, Math.round(totalAyahs / 15));

  for (let s = startSurah; s <= endSurah; s++) {
    const surahTotal = surahVersesCounts[s - 1];
    const startsAtBeginning = s === startSurah ? startAyah === 1 : true;
    const endsAtEnd = s === endSurah ? endAyah >= surahTotal : true;
    if (startsAtBeginning && endsAtEnd) {
      await markSurahRead(s);
    }
  }
  await addQuranReading(pages, totalAyahs);
}

export async function logPhysicalPageReading(startPage: number, endPage: number): Promise<void> {
  const pages = Math.max(1, endPage - startPage + 1);
  const estimatedAyahs = pages * 15;
  await addQuranReading(pages, estimatedAyahs);
}

const READING_POS_KEY = "quran_reading_position";

export interface ReadingPosition {
  surahId: number;
  surahName: string;
  surahNameArabic: string;
  page: number;
  verseKey: string;
  verseNumber: number;
  totalVerses: number;
}

export async function saveReadingPosition(pos: ReadingPosition | null): Promise<void> {
  if (!pos) {
    await AsyncStorage.removeItem(READING_POS_KEY);
    return;
  }
  await AsyncStorage.setItem(READING_POS_KEY, JSON.stringify(pos));
}

export async function getReadingPosition(): Promise<ReadingPosition | null> {
  try {
    const raw = await AsyncStorage.getItem(READING_POS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReadingPosition;
  } catch {
    return null;
  }
}
