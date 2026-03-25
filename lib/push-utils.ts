import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function registerPushToken() {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (token) {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status: locStatus } = await Location.getForegroundPermissionsAsync();
        if (locStatus === "granted") {
          const loc = await Location.getLastKnownPositionAsync();
          if (loc) {
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        }
      } catch {}
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const sessionToken = await AsyncStorage.getItem("auth_session_token");
        if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
      } catch {}
      const baseUrl = getApiUrl();
      await fetch(new URL("/api/push-token", baseUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ token, lat, lng }),
      });
    }
  } catch (err) {
    console.log("Push token registration skipped:", err);
  }
}
