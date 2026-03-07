import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiRequest } from "@/lib/query-client";

export async function registerPushToken() {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (token) {
      await apiRequest("POST", "/api/push-token", { token });
    }
  } catch (err) {
    console.log("Push token registration skipped:", err);
  }
}
