import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import {
  getPrayerTimes,
  getNextPrayer,
  getCountdown,
  formatTime,
  toHijriDate,
  findNearestMasjid,
  type PrayerTimeEntry,
} from "@/lib/prayer-utils";

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [prayers, setPrayers] = useState<PrayerTimeEntry[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTimeEntry | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [hijriDate, setHijriDate] = useState("");
  const [nearestMasjid, setNearestMasjid] = useState<{ name: string; distanceMiles: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDefaultPrayers = useCallback((lat = 35.7796, lon = -78.6382) => {
    const now = new Date();
    const todayPrayers = getPrayerTimes(lat, lon, now);
    setPrayers(todayPrayers);
    setHijriDate(toHijriDate(now));

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
          setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles });
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
      setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles });
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          <View style={styles.masjidDistance}>
            <Text style={[styles.distanceValue, { color: colors.gold }]}>
              {nearestMasjid.distanceMiles.toFixed(1)}
            </Text>
            <Text style={[styles.distanceUnit, { color: colors.textSecondary }]}>mi</Text>
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

      <View style={styles.prayerListSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Prayer Times</Text>
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
  masjidDistance: {
    alignItems: "flex-end",
  },
  distanceValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  distanceUnit: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -2,
  },
  permissionBanner: {
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  prayerListSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
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
