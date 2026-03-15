import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "dhikr_tracker";

export interface DhikrItem {
  id: string;
  arabic: string;
  transliteration: string;
  translation: string;
  goal: number | null;
}

export const DHIKR_PRESETS: DhikrItem[] = [
  { id: "subhanallah", arabic: "سُبْحَانَ ٱللَّهِ", transliteration: "SubhanAllah", translation: "Glory be to Allah", goal: 33 },
  { id: "alhamdulillah", arabic: "ٱلْحَمْدُ لِلَّهِ", transliteration: "Alhamdulillah", translation: "All praise is due to Allah", goal: 33 },
  { id: "allahuakbar", arabic: "ٱللَّهُ أَكْبَرُ", transliteration: "Allahu Akbar", translation: "Allah is the Greatest", goal: 34 },
  { id: "lailaha", arabic: "لَا إِلَٰهَ إِلَّا ٱللَّهُ", transliteration: "La ilaha illallah", translation: "There is no god but Allah", goal: null },
  { id: "astaghfirullah", arabic: "أَسْتَغْفِرُ ٱللَّهَ", transliteration: "Astaghfirullah", translation: "I seek forgiveness from Allah", goal: 100 },
  { id: "subhanallahiwabihamdihi", arabic: "سُبْحَانَ ٱللَّهِ وَبِحَمْدِهِ", transliteration: "SubhanAllahi wa bihamdihi", translation: "Glory and praise be to Allah", goal: 100 },
  { id: "lahawla", arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّهِ", transliteration: "La hawla wa la quwwata illa billah", translation: "There is no power nor strength except with Allah", goal: null },
];

export interface DhikrDayData {
  [dhikrId: string]: number;
}

interface DhikrStorageData {
  [dateKey: string]: DhikrDayData;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    writeQueue = writeQueue.then(() => fn().then(resolve, reject)).catch(() => fn().then(resolve, reject));
  });
}

async function loadAll(): Promise<DhikrStorageData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DhikrStorageData;
  } catch {
    return {};
  }
}

async function saveAll(data: DhikrStorageData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function getDhikrCounts(date: Date): Promise<DhikrDayData> {
  const data = await loadAll();
  return data[formatDateKey(date)] ?? {};
}

export function incrementDhikr(date: Date, dhikrId: string): Promise<DhikrDayData> {
  return enqueue(async () => {
    const data = await loadAll();
    const key = formatDateKey(date);
    const day = data[key] ?? {};
    day[dhikrId] = (day[dhikrId] ?? 0) + 1;
    data[key] = day;
    await saveAll(data);
    return day;
  });
}

export function resetDhikr(date: Date, dhikrId: string): Promise<DhikrDayData> {
  return enqueue(async () => {
    const data = await loadAll();
    const key = formatDateKey(date);
    const day = data[key] ?? {};
    day[dhikrId] = 0;
    data[key] = day;
    await saveAll(data);
    return day;
  });
}
