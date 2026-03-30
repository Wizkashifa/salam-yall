import { Platform, NativeModules } from "react-native";

const APP_GROUP = "group.app.ummahconnect";
const PRAYER_DATA_KEY = "prayerData";

export interface WidgetPrayerEntry {
  name: string;
  athan: string;
  iqama: string | null;
  status: "completed" | "at_masjid" | "made_up" | "excused" | "missed" | null;
}

export interface WidgetPrayerData {
  date: string;
  prayers: WidgetPrayerEntry[];
}

function statusFromCode(code: number): WidgetPrayerEntry["status"] {
  switch (code) {
    case 1: return "completed";
    case 2: return "at_masjid";
    case 3: return "made_up";
    case 4: return "excused";
    case 0: return null;
    default: return null;
  }
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeString(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function writeToAppGroup(data: WidgetPrayerData): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const SharedGroupPreferences = (await import("react-native-shared-group-preferences")).default;
    await SharedGroupPreferences.setItem(PRAYER_DATA_KEY, data, APP_GROUP);
  } catch (e) {
    console.warn("[WidgetStorage] Failed to write to App Group:", e);
  }
}

async function readFromAppGroup(): Promise<WidgetPrayerData | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const SharedGroupPreferences = (await import("react-native-shared-group-preferences")).default;
    const raw = await SharedGroupPreferences.getItem(PRAYER_DATA_KEY, APP_GROUP);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn("[WidgetStorage] Failed to read from App Group:", e);
    return null;
  }
}

async function reloadWidgets(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    if (NativeModules.WidgetKitHelper?.reloadAllTimelines) {
      NativeModules.WidgetKitHelper.reloadAllTimelines();
    }
  } catch (e) {
    console.warn("[WidgetStorage] WidgetKit reload not available:", e);
  }
}

export async function savePrayerTimes(
  times: { name: string; time: Date }[],
  iqamaMap?: Record<string, string | undefined>,
  todayLog?: Record<string, number>
): Promise<void> {
  if (Platform.OS !== "ios") return;

  const prayerNames = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const existing = await readFromAppGroup();
  const dateKey = formatDateKey(new Date());

  const prayers: WidgetPrayerEntry[] = prayerNames.map((pName) => {
    const displayName = pName.charAt(0).toUpperCase() + pName.slice(1);
    const prayerTime = times.find(
      (t) => t.name.toLowerCase() === pName.toLowerCase()
    );
    const existingPrayer = existing?.date === dateKey
      ? existing.prayers.find((p) => p.name === displayName)
      : null;

    return {
      name: displayName,
      athan: prayerTime ? formatTimeString(prayerTime.time) : "",
      iqama: iqamaMap?.[pName] || existingPrayer?.iqama || null,
      status: todayLog?.[pName] !== undefined
        ? statusFromCode(todayLog[pName])
        : existingPrayer?.status || null,
    };
  });

  const data: WidgetPrayerData = { date: dateKey, prayers };
  await writeToAppGroup(data);
  await reloadWidgets();
}

export async function savePrayerCompletion(
  prayerName: string,
  statusCode: number
): Promise<void> {
  if (Platform.OS !== "ios") return;

  const existing = await readFromAppGroup();
  const dateKey = formatDateKey(new Date());
  const displayName = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);

  if (existing && existing.date === dateKey) {
    const idx = existing.prayers.findIndex((p) => p.name === displayName);
    if (idx >= 0) {
      existing.prayers[idx].status = statusFromCode(statusCode);
    }
    await writeToAppGroup(existing);
  } else {
    const prayers: WidgetPrayerEntry[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((name) => ({
      name,
      athan: "",
      iqama: null,
      status: name === displayName ? statusFromCode(statusCode) : null,
    }));
    await writeToAppGroup({ date: dateKey, prayers });
  }

  await reloadWidgets();
}

export async function getPrayerCompletions(): Promise<Record<string, string | null>> {
  const data = await readFromAppGroup();
  if (!data) return {};

  const result: Record<string, string | null> = {};
  for (const p of data.prayers) {
    result[p.name.toLowerCase()] = p.status;
  }
  return result;
}

function statusToCode(status: string | null): number {
  switch (status) {
    case "completed": return 1;
    case "at_masjid": return 2;
    case "made_up": return 3;
    case "excused": return 4;
    default: return 0;
  }
}

export async function getWidgetCompletionsAsCodes(): Promise<Record<string, number> | null> {
  if (Platform.OS !== "ios") return null;

  const data = await readFromAppGroup();
  if (!data) return null;

  const today = new Date();
  const todayKey = formatDateKey(today);
  if (data.date !== todayKey) return null;

  const result: Record<string, number> = {};
  for (const p of data.prayers) {
    result[p.name.toLowerCase()] = statusToCode(p.status);
  }
  return result;
}
