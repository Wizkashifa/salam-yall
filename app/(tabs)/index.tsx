import { useEffect, useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  Pressable,
  ActivityIndicator,
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
import { useTheme } from "@/lib/theme-context";
import { useSettings } from "@/lib/settings-context";
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
  const arrowRotation = `${rotation}deg`;

  return (
    <View style={[styles.compassContainer, { backgroundColor: isDark ? "#1C2E24" : "#E8F0EC", borderColor: colors.border }]}>
      <View style={[styles.compassRing, { borderColor: colors.gold }]}>
        <View style={[styles.compassArrowWrap, { transform: [{ rotate: arrowRotation }] }]}>
          <View style={[styles.compassArrow, { backgroundColor: colors.emerald }]} />
          <View style={[styles.compassArrowHead, { borderBottomColor: colors.emerald }]} />
        </View>
        <View style={[styles.compassDot, { backgroundColor: colors.gold }]} />
      </View>
      <View style={styles.compassLabels}>
        <Text style={[styles.compassTitle, { color: colors.text }]}>Qibla</Text>
        <Text style={[styles.compassBearing, { color: colors.textSecondary }]}>{Math.round(qiblaBearing)}°</Text>
      </View>
    </View>
  );
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { calcMethod, notificationsEnabled, setNotificationsEnabled, openMenu } = useSettings();
  const [prayers, setPrayers] = useState<PrayerTimeEntry[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTimeEntry | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [hijriDate, setHijriDate] = useState("");
  const [nearestMasjid, setNearestMasjid] = useState<{ name: string; distanceMiles: number; masjid: Masjid } | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [qiblaBearing, setQiblaBearing] = useState(58.5);
  const [userCoords, setUserCoords] = useState({ lat: 35.7796, lon: -78.6382 });
  const [nearMosque, setNearMosque] = useState<Masjid | null>(null);
  const [silenceAlertDismissed, setSilenceAlertDismissed] = useState(false);

  const loadDefaultPrayers = useCallback((lat = 35.7796, lon = -78.6382) => {
    const now = new Date();
    const todayPrayers = getPrayerTimes(lat, lon, now, calcMethod);
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
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow, calcMethod);
      setNextPrayer(tomorrowPrayers[0]);
      setCountdown(getCountdown(tomorrowPrayers[0].time, now));
    }
  }, [calcMethod]);

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

  useEffect(() => {
    if (userCoords.lat && prayers.length > 0) {
      loadDefaultPrayers(userCoords.lat, userCoords.lon);
    }
  }, [calcMethod]);

  const schedulePrayerNotifications = useCallback(async (prayerList: PrayerTimeEntry[], lat: number, lon: number) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const now = new Date();
      const todayPrayers = prayerList.filter(p => p.name !== "sunrise" && p.time > now);

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow, calcMethod).filter(p => p.name !== "sunrise");

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
  }, [calcMethod]);

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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (prayers.length > 0) {
          await schedulePrayerNotifications(prayers, userCoords.lat, userCoords.lon);
        }
      } catch (err) {
        console.error("Error enabling notifications:", err);
      }
    } else {
      setNotificationsEnabled(false);
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notificationsEnabled, prayers, schedulePrayerNotifications, setNotificationsEnabled]);

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
    <View
      style={[styles.container, {
        backgroundColor: colors.background,
        paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
        paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 56,
      }]}
    >
      <View style={styles.headerSection}>
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [styles.menuButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { openMenu(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            testID="menu-button"
            hitSlop={8}
          >
            <Ionicons name="menu" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{gregorianDate}</Text>
            {hijriDate ? (
              <Text style={[styles.hijriDate, { color: colors.gold }]}>{hijriDate}</Text>
            ) : null}
          </View>
          <QiblaCompass qiblaBearing={qiblaBearing} colors={colors} isDark={isDark} />
        </View>
      </View>

      {nearMosque && !silenceAlertDismissed ? (
        <View style={[styles.silenceAlert, { backgroundColor: isDark ? "#3D2323" : "#FEF2F2", borderColor: isDark ? "#5C3333" : "#FECACA" }]}>
          <View style={styles.silenceAlertContent}>
            <MaterialCommunityIcons name="volume-off" size={18} color={isDark ? "#F87171" : "#DC2626"} />
            <Text style={[styles.silenceAlertTitle, { color: isDark ? "#F87171" : "#DC2626", flex: 1 }]}>
              Near {nearMosque.name} — silence your phone
            </Text>
            <Pressable onPress={dismissSilenceAlert} hitSlop={8}>
              <Ionicons name="close" size={18} color={isDark ? "#FCA5A5" : "#991B1B"} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.countdownCard}
      >
        <View style={styles.countdownGoldAccent} />
        {nextPrayer ? (
          <>
            <View style={styles.countdownTopRow}>
              <Text style={styles.countdownLabel}>Next Prayer</Text>
              <Text style={styles.countdownTime}>at {formatTime(nextPrayer.time)}</Text>
            </View>
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
          </>
        ) : (
          <Text style={styles.countdownLabel}>All prayers completed for today</Text>
        )}
      </LinearGradient>

      {nearestMasjid ? (
        <Pressable
          style={[styles.masjidStrip, { backgroundColor: colors.surface }]}
          onPress={openMasjidDirections}
          testID="directions-button"
        >
          <MaterialCommunityIcons name="mosque" size={14} color={colors.emerald} />
          <Text style={[styles.masjidStripText, { color: colors.textSecondary }]} numberOfLines={1}>
            {nearestMasjid.name}
          </Text>
          <Text style={[styles.masjidStripDist, { color: colors.gold }]}>
            {nearestMasjid.distanceMiles.toFixed(1)} mi
          </Text>
          <Ionicons name="navigate" size={12} color={colors.emerald} />
        </Pressable>
      ) : null}

      {locationPermission === false ? (
        <Pressable
          style={[styles.permissionBanner, { backgroundColor: colors.bannerBg }]}
          onPress={loadPrayerData}
        >
          <Ionicons name="location-outline" size={14} color={colors.bannerText} />
          <Text style={{ color: colors.bannerText, fontSize: 12, flex: 1, marginLeft: 6, fontFamily: "Inter_500Medium" }}>
            Enable location for accurate prayer times
          </Text>
        </Pressable>
      ) : null}

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
              size={14}
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
                  size={16}
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
    </View>
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
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  hijriDate: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginTop: 1,
  },
  countdownCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 8,
    overflow: "hidden",
  },
  countdownGoldAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#D4A843",
  },
  countdownTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  countdownLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  countdownPrayerName: {
    color: "#D4A843",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  countdownTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  countdownUnit: {
    alignItems: "center",
    minWidth: 44,
  },
  countdownNumber: {
    color: "#fff",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  countdownUnitLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: -2,
  },
  countdownSeparator: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginHorizontal: 2,
    marginTop: -6,
  },
  countdownTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  silenceAlert: {
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  silenceAlertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  silenceAlertTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  masjidStrip: {
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  masjidStripText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  masjidStripDist: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  permissionBanner: {
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  compassContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  compassRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  compassArrowWrap: {
    position: "absolute",
    width: 10,
    height: 26,
    alignItems: "center",
  },
  compassArrow: {
    width: 2,
    height: 10,
    borderRadius: 1,
  },
  compassArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
    transform: [{ rotate: "180deg" }],
  },
  compassDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    position: "absolute",
  },
  compassLabels: {
    alignItems: "center",
  },
  compassTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  compassBearing: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
  prayerListSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  prayerListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  notifToggle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 5,
  },
  prayerIconBg: {
    width: 30,
    height: 30,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 10,
  },
  prayerTime: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
