import { Platform } from 'react-native';

interface PrayerWidgetPayload {
  prayers: Array<{
    name: string;
    label: string;
    time: number;
    iqamaTime?: number;
  }>;
  nextPrayerIndex: number;
  masjidName?: string;
  locationName?: string;
}

let nativeModule: any = null;

function getModule() {
  if (nativeModule !== undefined && nativeModule !== null) return nativeModule;
  if (Platform.OS !== 'ios') {
    nativeModule = null;
    return null;
  }
  try {
    nativeModule = require('./src/PrayerWidgetBridgeModule').default;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export async function updateWidgetData(payload: PrayerWidgetPayload): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    const jsonString = JSON.stringify({
      ...payload,
      lastUpdated: Date.now(),
    });
    return await mod.updateWidgetData(jsonString);
  } catch {
    return false;
  }
}

export async function reloadWidgetTimelines(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    return await mod.reloadTimelines();
  } catch {
    return false;
  }
}
