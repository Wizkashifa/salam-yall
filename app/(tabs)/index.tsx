import { useEffect, useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/lib/theme-context";
import {
  getPrayerTimes,
  getNextPrayer,
  getCountdown,
  formatTime,
  toHijriDate,
  findNearestMasjid,
  calculateQiblaBearing,
  checkNearMosque,
  type PrayerTimeEntry,
  type Masjid,
} from "@/lib/prayer-utils";

const NOTIF_PREF_KEY = "prayer_notifications_enabled";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function useCompassHeading() {
  const [heading, setHeading] = useState(0);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let subscription: any = null;

    (async () => {
      try {
        const { Magnetometer } = await import("expo-sensors");
        const isAvail = await Magnetometer.isAvailableAsync();
        if (!isAvail) return;
        setAvailable(true);

        Magnetometer.setUpdateInterval(100);
        subscription = Magnetometer.addListener((data) => {
          let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angle = (angle + 360) % 360;
          setHeading(angle);
        });
      } catch {}
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  return { heading, available };
}

function QiblaCompass({ qiblaBearing, colors, isDark }: { qiblaBearing: number; colors: any; isDark: boolean }) {
  const { heading, available } = useCompassHeading();
  const rotation = available ? qiblaBearing - heading : qiblaBearing;

  const compassSize = 160;
  const arrowRotation = `${rotation}deg`;

  return (
    <View style={[styles.compassContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.compassTitle, { color: colors.text }]}>Qibla Direction</Text>
      <View style={[styles.compassOuter, { borderColor: colors.gold }]}>
        <View style={[styles.compassInner, { backgroundColor: isDark ? "#1C2E24" : "#E8F0EC" }]}>
          {["N", "E", "S", "W"].map((dir, i) => (
            <Text
              key={dir}
              style={[
                styles.compassCardinal,
                { color: colors.textSecondary },
                i === 0 && { top: 8, left: compassSize / 2 - 6 },
                i === 1 && { right: 8, top: compassSize / 2 - 8 },
                i === 2 && { bottom: 8, left: compassSize / 2 - 6 },
                i === 3 && { left: 8, top: compassSize / 2 - 8 },
              ]}
            >
              {dir}
            </Text>
          ))}

          <View style={[styles.compassArrowContainer, { transform: [{ rotate: arrowRotation }] }]}>
            <View style={[styles.compassArrow, { backgroundColor: colors.emerald }]} />
            <View style={[styles.compassArrowHead, { borderBottomColor: colors.emerald }]} />
          </View>

          <View style={[styles.compassCenter, { backgroundColor: colors.gold }]}>
            <MaterialCommunityIcons name="star-four-points" size={14} color="#fff" />
          </View>
        </View>
      </View>
      <Text style={[styles.compassBearing, { color: colors.textSecondary }]}>
        {Math.round(qiblaBearing)}° from North
      </Text>
      {Platform.OS === "web" ? (
        <Text style={[styles.compassHint, { color: colors.textSecondary }]}>
          Static direction — use a physical device for live compass
        </Text>
      ) : !available ? (
        <Text style={[styles.compassHint, { color: colors.textSecondary }]}>
          Compass sensor not available on this device
        </Text>
      ) : null}
    </View>
  );
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [prayers, setPrayers] = useState<PrayerTimeEntry[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTimeEntry | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [hijriDate, setHijriDate] = useState("");
  const [nearestMasjid, setNearestMasjid] = useState<{ name: string; distanceMiles: number; masjid: Masjid } | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qiblaBearing, setQiblaBearing] = useState(58.5);
  const [userCoords, setUserCoords] = useState({ lat: 35.7796, lon: -78.6382 });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [nearMosque, setNearMosque] = useState<Masjid | null>(null);
  const [silenceAlertDismissed, setSilenceAlertDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((val) => {
      if (val === "true") setNotificationsEnabled(true);
    });
  }, []);

  const loadDefaultPrayers = useCallback((lat = 35.7796, lon = -78.6382) => {
    const now = new Date();
    const todayPrayers = getPrayerTimes(lat, lon, now);
    setPrayers(todayPrayers);
    setHijriDate(toHijriDate(now));
    setQiblaBearing(calculateQiblaBearing(lat, lon));
    setUserCoords({ lat, lon });

    const nearMosqueCheck = checkNearMosque(lat, lon);
    setNearMosque(nearMosqueCheck);

    const next = getNextPrayer(todayPrayers, now);
    if (next) {
      setNextPrayer(next);
      setCountdown(getCountdown(next.time, now));
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow);
      setNextPrayer(tomorrowPrayers[0]);
      setCountdown(getCountdown(tomorrowPrayers[0].time, now));
    }
  }, []);

  const loadPrayerData = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        let lat = 35.7796;
        let lon = -78.6382;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          setLocationPermission(true);
          const nearest = findNearestMasjid(lat, lon);
          setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
        } catch {
          setLocationPermission(false);
        }
        loadDefaultPrayers(lat, lon);
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationPermission(false);
        loadDefaultPrayers();
        setLoading(false);
        return;
      }
      setLocationPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;

      loadDefaultPrayers(latitude, longitude);

      const nearest = findNearestMasjid(latitude, longitude);
      setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
    } catch (err) {
      console.error("Error loading prayer data:", err);
      loadDefaultPrayers();
    } finally {
      setLoading(false);
    }
  }, [loadDefaultPrayers]);

  useEffect(() => {
    loadPrayerData();
  }, [loadPrayerData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (nextPrayer) {
        const now = new Date();
        const cd = getCountdown(nextPrayer.time, now);
        setCountdown(cd);
        if (cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0) {
          loadPrayerData();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextPrayer, loadPrayerData]);

  const schedulePrayerNotifications = useCallback(async (prayerList: PrayerTimeEntry[], lat: number, lon: number) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const now = new Date();
      const todayPrayers = prayerList.filter(p => p.name !== "sunrise" && p.time > now);

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow).filter(p => p.name !== "sunrise");

      const allPrayers = [...todayPrayers, ...tomorrowPrayers];

      for (const prayer of allPrayers) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${prayer.label} Prayer Time`,
            body: `It's time for ${prayer.label} prayer (${formatTime(prayer.time)})`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: prayer.time,
          },
        });
      }
    } catch (err) {
      console.error("Error scheduling notifications:", err);
    }
  }, []);

  useEffect(() => {
    if (notificationsEnabled && prayers.length > 0) {
      schedulePrayerNotifications(prayers, userCoords.lat, userCoords.lon);
    }
  }, [notificationsEnabled, prayers, schedulePrayerNotifications, userCoords]);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Notifications Permission",
            "Please enable notifications in your device settings to receive prayer time alerts.",
            [{ text: "OK" }]
          );
          return;
        }
        setNotificationsEnabled(true);
        await AsyncStorage.setItem(NOTIF_PREF_KEY, "true");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (prayers.length > 0) {
          await schedulePrayerNotifications(prayers, userCoords.lat, userCoords.lon);
        }
      } catch (err) {
        console.error("Error enabling notifications:", err);
      }
    } else {
      setNotificationsEnabled(false);
      await AsyncStorage.setItem(NOTIF_PREF_KEY, "false");
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notificationsEnabled, prayers, schedulePrayerNotifications]);

  const openMasjidDirections = useCallback(async () => {
    if (!nearestMasjid) return;
    const { masjid } = nearestMasjid;
    const encoded = encodeURIComponent(masjid.address);

    try {
      if (Platform.OS === "ios") {
        const mapsUrl = `maps://maps.apple.com/?daddr=${encoded}&dirflg=d`;
        const canOpen = await Linking.canOpenURL(mapsUrl);
        if (canOpen) {
          await Linking.openURL(mapsUrl);
        } else {
          await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
        }
      } else {
        await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      }
    } catch {
      Alert.alert("Unable to Open Maps", "Could not open a maps application for directions.");
    }
  }, [nearestMasjid]);

  const dismissSilenceAlert = useCallback(() => {
    setSilenceAlertDismissed(true);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSilenceAlertDismissed(false);
    await loadPrayerData();
    setRefreshing(false);
  }, [loadPrayerData]);

  const now = new Date();
  const gregorianDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const padNum = (n: number) => n.toString().padStart(2, "0");

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
        paddingBottom: Platform.OS === "web" ? 34 : 100,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
      }
    >
      <View style={styles.headerSection}>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>{gregorianDate}</Text>
        {hijriDate ? (
          <Text style={[styles.hijriDate, { color: colors.gold }]}>{hijriDate}</Text>
        ) : null}
      </View>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.countdownCard}
      >
        <View style={styles.countdownGoldAccent} />
        {nextPrayer ? (
          <>
            <Text style={styles.countdownLabel}>Next Prayer</Text>
            <Text style={styles.countdownPrayerName}>{nextPrayer.label}</Text>
            <View style={styles.countdownTimerRow}>
              <View style={styles.countdownUnit}>
                <Text style={styles.countdownNumber}>{padNum(countdown.hours)}</Text>
                <Text style={styles.countdownUnitLabel}>hrs</Text>
              </View>
              <Text style={styles.countdownSeparator}>:</Text>
              <View style={styles.countdownUnit}>
                <Text style={styles.countdownNumber}>{padNum(countdown.minutes)}</Text>
                <Text style={styles.countdownUnitLabel}>min</Text>
              </View>
              <Text style={styles.countdownSeparator}>:</Text>
              <View style={styles.countdownUnit}>
                <Text style={styles.countdownNumber}>{padNum(countdown.seconds)}</Text>
                <Text style={styles.countdownUnitLabel}>sec</Text>
              </View>
            </View>
            <Text style={styles.countdownTime}>at {formatTime(nextPrayer.time)}</Text>
          </>
        ) : (
          <Text style={styles.countdownLabel}>All prayers completed for today</Text>
        )}
      </LinearGradient>

      {nearMosque && !silenceAlertDismissed ? (
        <View style={[styles.silenceAlert, { backgroundColor: isDark ? "#3D2323" : "#FEF2F2", borderColor: isDark ? "#5C3333" : "#FECACA" }]}>
          <View style={styles.silenceAlertContent}>
            <MaterialCommunityIcons name="volume-off" size={22} color={isDark ? "#F87171" : "#DC2626"} />
            <View style={styles.silenceAlertText}>
              <Text style={[styles.silenceAlertTitle, { color: isDark ? "#F87171" : "#DC2626" }]}>
                You're near {nearMosque.name}
              </Text>
              <Text style={[styles.silenceAlertBody, { color: isDark ? "#FCA5A5" : "#991B1B" }]}>
                Please silence your phone
              </Text>
            </View>
            <Pressable onPress={dismissSilenceAlert} hitSlop={8}>
              <Ionicons name="close" size={20} color={isDark ? "#FCA5A5" : "#991B1B"} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {nearestMasjid ? (
        <View style={[styles.masjidCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.masjidIconContainer, { backgroundColor: colors.prayerIconBg }]}>
            <MaterialCommunityIcons name="mosque" size={22} color={colors.emerald} />
          </View>
          <View style={styles.masjidInfo}>
            <Text style={[styles.masjidLabel, { color: colors.textSecondary }]}>Nearest Masjid</Text>
            <Text style={[styles.masjidName, { color: colors.text }]} numberOfLines={1}>
              {nearestMasjid.name}
            </Text>
          </View>
          <View style={styles.masjidRight}>
            <View style={styles.masjidDistance}>
              <Text style={[styles.distanceValue, { color: colors.gold }]}>
                {nearestMasjid.distanceMiles.toFixed(1)}
              </Text>
              <Text style={[styles.distanceUnit, { color: colors.textSecondary }]}>mi</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.directionsButton, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
              onPress={openMasjidDirections}
              testID="directions-button"
            >
              <Ionicons name="navigate" size={14} color="#fff" />
              <Text style={styles.directionsButtonText}>Directions</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {locationPermission === false ? (
        <Pressable
          style={[styles.permissionBanner, { backgroundColor: colors.bannerBg }]}
          onPress={loadPrayerData}
        >
          <Ionicons name="location-outline" size={18} color={colors.bannerText} />
          <Text style={{ color: colors.bannerText, fontSize: 13, flex: 1, marginLeft: 8, fontFamily: "Inter_500Medium" }}>
            Enable location for accurate prayer times and masjid distance
          </Text>
        </Pressable>
      ) : null}

      <QiblaCompass qiblaBearing={qiblaBearing} colors={colors} isDark={isDark} />

      <View style={styles.prayerListSection}>
        <View style={styles.prayerListHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prayer Times</Text>
          <Pressable
            style={[styles.notifToggle, { backgroundColor: notificationsEnabled ? colors.emerald : colors.surface, borderColor: colors.border, borderWidth: notificationsEnabled ? 0 : 1 }]}
            onPress={toggleNotifications}
            testID="notification-toggle"
          >
            <Ionicons
              name={notificationsEnabled ? "notifications" : "notifications-outline"}
              size={16}
              color={notificationsEnabled ? "#fff" : colors.textSecondary}
            />
          </Pressable>
        </View>
        {prayers.map((prayer) => {
          const isNext = nextPrayer?.name === prayer.name;
          const isPast = prayer.time < now && !isNext;

          return (
            <View
              key={prayer.name}
              style={[
                styles.prayerRow,
                { backgroundColor: colors.surface },
                isNext && { borderWidth: 1.5, borderColor: colors.gold },
              ]}
            >
              <View style={[styles.prayerIconBg, isNext ? { backgroundColor: colors.prayerActiveBg } : { backgroundColor: colors.prayerIconBg }]}>
                <MaterialCommunityIcons
                  name={prayer.icon as any}
                  size={18}
                  color={isNext ? colors.prayerActiveText : colors.emerald}
                />
              </View>
              <Text
                style={[
                  styles.prayerName,
                  { color: isPast ? colors.textSecondary : colors.text },
                  isNext && { color: colors.gold, fontFamily: "Inter_700Bold" },
                ]}
              >
                {prayer.label}
              </Text>
              <Text
                style={[
                  styles.prayerTime,
                  { color: isPast ? colors.textSecondary : colors.text },
                  isNext && { color: colors.gold, fontFamily: "Inter_700Bold" },
                ]}
              >
                {formatTime(prayer.time)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  hijriDate: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  countdownCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  countdownGoldAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#D4A843",
  },
  countdownLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  countdownPrayerName: {
    color: "#D4A843",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  countdownTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  countdownUnit: {
    alignItems: "center",
    minWidth: 52,
  },
  countdownNumber: {
    color: "#fff",
    fontSize: 40,
    fontFamily: "Inter_700Bold",
  },
  countdownUnitLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -2,
  },
  countdownSeparator: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    marginHorizontal: 4,
    marginTop: -8,
  },
  countdownTime: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginTop: 12,
  },
  silenceAlert: {
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  silenceAlertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  silenceAlertText: {
    flex: 1,
  },
  silenceAlertTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  silenceAlertBody: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  masjidCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
  },
  masjidIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  masjidInfo: {
    flex: 1,
    marginLeft: 12,
  },
  masjidLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  masjidName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
  masjidRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  masjidDistance: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  distanceValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  distanceUnit: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  directionsButtonText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  permissionBanner: {
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  compassContainer: {
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
  },
  compassTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  compassOuter: {
    width: 172,
    height: 172,
    borderRadius: 86,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  compassInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  compassCardinal: {
    position: "absolute",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  compassArrowContainer: {
    position: "absolute",
    width: 20,
    height: 120,
    alignItems: "center",
  },
  compassArrow: {
    width: 3,
    height: 50,
    borderRadius: 2,
  },
  compassArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2,
    transform: [{ rotate: "180deg" }],
  },
  compassCenter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
  },
  compassBearing: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 12,
  },
  compassHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "center",
  },
  prayerListSection: {
    paddingHorizontal: 20,
  },
  prayerListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  notifToggle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  prayerIconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 12,
  },
  prayerTime: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
