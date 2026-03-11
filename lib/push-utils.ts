import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { apiRequest } from "@/lib/query-client";

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
      await apiRequest("POST", "/api/push-token", { token, lat, lng });
    }
  } catch (err) {
    console.log("Push token registration skipped:", err);
  }
}
