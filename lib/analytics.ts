import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const DEVICE_ID_KEY = "analytics_device_id";
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 30000;

let deviceId: string | null = null;
let currentUserId: number | null = null;
let queue: Array<{ event_name: string; event_data?: any; device_id?: string; platform?: string; user_id?: number | null }> = [];

export function setAnalyticsUserId(userId: number | null) {
  currentUserId = userId;
}
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      deviceId = stored;
      return stored;
    }
  } catch {}
  const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  deviceId = newId;
  try { await AsyncStorage.setItem(DEVICE_ID_KEY, newId); } catch {}
  return newId;
}

async function flushQueue() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/analytics/batch", baseUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) {
      queue.unshift(...batch);
    }
  } catch {
    queue.unshift(...batch);
    if (queue.length > 200) queue.length = 200;
  }
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushQueue();
  }, FLUSH_INTERVAL);
}

const IMMEDIATE_EVENTS = new Set(["app_open"]);

export async function trackEvent(eventName: string, eventData?: Record<string, any>) {
  try {
    const id = await getDeviceId();
    queue.push({
      event_name: eventName,
      event_data: eventData || undefined,
      device_id: id,
      platform: Platform.OS,
      user_id: currentUserId,
    });
    startFlushTimer();
    if (queue.length >= BATCH_SIZE || IMMEDIATE_EVENTS.has(eventName)) {
      flushQueue();
    }
  } catch {
    // never block UI
  }
}

export function trackScreenView(screen: string) {
  trackEvent("screen_view", { screen });
}
