import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  Modal,
  Image,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { useSettings } from "@/lib/settings-context";
import { registerPushToken } from "@/lib/push-utils";
import {
  getPrayerTimes,
  getNextPrayer,
  getCountdown,
  formatTime,
  toHijriDate,
  findNearestMasjid,
  getAllMasjidsByDistance,
  calculateQiblaBearing,
  checkNearMosque,
  matchEventsToMasjid,
  NEARBY_MASJIDS,
  type PrayerTimeEntry,
  type Masjid,
} from "@/lib/prayer-utils";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
  organizer: string;
  imageUrl: string;
  registrationUrl: string;
}

const MASJID_KEYWORDS = [
  "masjid", "mosque", "islamic association", "islamic center", "islamic society",
  "as-salaam", "al-noor", "ar-razzaq", "king khalid", "jamaat ibad",
  "chapel hill islamic", "parkwood", "apex masjid",
];

function isMasjidOrganizer(organizer: string): boolean {
  const lower = organizer.toLowerCase();
  return MASJID_KEYWORDS.some((kw) => lower.includes(kw));
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function HomeEventDetailModal({ event, visible, onClose }: { event: CalendarEvent | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  if (!event) return null;

  const date = new Date(event.start);
  const fullDate = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = event.isAllDay
    ? "All Day"
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endTime = event.end && !event.isAllDay
    ? new Date(event.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;
  const timeRange = endTime ? `${time} – ${endTime}` : time;
  const cleanDescription = (event.description ?? "").trim();

  const openMaps = () => {
    if (event.location) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ position: "absolute", top: Platform.OS === "web" ? 67 : insets.top + 12, right: 16, zIndex: 10 }}>
          <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 }} resizeMode="cover" />
          ) : (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.5, justifyContent: "center", alignItems: "center", backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }}>
              <Ionicons name="calendar" size={48} color={colors.emerald} />
            </View>
          )}
          <View style={{ padding: 20 }}>
            {event.organizer ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.gold + "20", marginBottom: 12 }}>
                <MaterialCommunityIcons name={isMasjidOrganizer(event.organizer) ? "mosque" : "office-building-outline"} size={12} color={colors.gold} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.gold }}>{event.organizer}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 16 }}>{event.title}</Text>
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 14, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}>{fullDate}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="time-outline" size={18} color={colors.emerald} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}>{timeRange}</Text>
              </View>
              {event.location ? (
                <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 12 }} onPress={openMaps}>
                  <Ionicons name="location-outline" size={18} color={colors.emerald} />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text, flex: 1 }}>{event.location}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
            {cleanDescription ? (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, marginTop: 16, paddingTop: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, marginBottom: 8 }}>Details</Text>
                <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 22 }}>{cleanDescription}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              {event.registrationUrl ? (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(event.registrationUrl); }}
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 })}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" }}>Register / RSVP</Text>
                </Pressable>
              ) : null}
              {event.location ? (
                <Pressable
                  onPress={openMaps}
                  style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 })}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" }}>Directions</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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

function QiblaCompassSmall({ qiblaBearing, colors, isDark }: { qiblaBearing: number; colors: any; isDark: boolean }) {
  const { heading, available } = useCompassHeading();
  const rotation = available ? qiblaBearing - heading : qiblaBearing;
  const arrowRotation = `${rotation}deg`;

  return (
    <Pressable
      onPress={() => Linking.openURL("https://qiblafinder.withgoogle.com/intl/en/finder/ar")}
      style={[styles.qiblaSmall, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }]}
    >
      <View style={[styles.qiblaRing, { borderColor: colors.gold }]}>
        <View style={[styles.qiblaArrowWrap, { transform: [{ rotate: arrowRotation }] }]}>
          <View style={[styles.qiblaArrowHead, { borderBottomColor: colors.emerald }]} />
          <View style={[styles.qiblaArrowBody, { backgroundColor: colors.emerald }]} />
        </View>
      </View>
      <Text style={[styles.qiblaLabel, { color: colors.textSecondary }]}>Qibla</Text>
    </Pressable>
  );
}

interface HalalRestaurant {
  id: number;
  name: string;
  cuisine_types: string[] | null;
  rating: number | null;
  user_ratings_total: number | null;
  _distance?: number;
  formatted_address: string | null;
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { calcMethod, notificationsEnabled, setNotificationsEnabled } = useSettings();
  const router = useRouter();
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
  const [masjidsExpanded, setMasjidsExpanded] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const { data: calendarEvents } = useQuery<any[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: halalRestaurants } = useQuery<HalalRestaurant[]>({
    queryKey: ["/api/halal-restaurants"],
    staleTime: 5 * 60 * 1000,
  });

  const nearbyMasjids = useMemo(() => {
    return getAllMasjidsByDistance(userCoords.lat, userCoords.lon).slice(0, 5);
  }, [userCoords]);

  const tonightEvents = useMemo(() => {
    if (!calendarEvents) return [];
    const now = new Date();
    const endOfTonight = new Date(now);
    endOfTonight.setDate(endOfTonight.getDate() + 1);
    endOfTonight.setHours(2, 0, 0, 0);

    const allNearby = getAllMasjidsByDistance(userCoords.lat, userCoords.lon).slice(0, 8);

    return calendarEvents
      .filter((ev: any) => {
        const start = new Date(ev.start);
        const end = ev.end ? new Date(ev.end) : start;
        return !ev.isAllDay && ((start >= now && start <= endOfTonight) || (start <= now && end >= now));
      })
      .slice(0, 4)
      .map((ev: any) => {
        let venue = "";
        for (const item of allNearby) {
          const matched = matchEventsToMasjid(item.masjid, [ev]);
          if (matched.length > 0) {
            venue = item.masjid.name.replace(/\s*\(.*\)/, "");
            break;
          }
        }
        if (!venue) {
          venue = ev.organizer || (ev.location || "").split(",")[0] || "";
        }
        return {
          id: ev.id,
          title: ev.title,
          masjidName: venue,
          time: new Date(ev.start),
        };
      });
  }, [calendarEvents, userCoords]);

  const nearbyHalalPreview = useMemo(() => {
    if (!halalRestaurants) return [];
    return halalRestaurants
      .filter((r) => r._distance !== undefined)
      .sort((a, b) => (a._distance ?? 999) - (b._distance ?? 999))
      .slice(0, 6);
  }, [halalRestaurants]);

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

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Location timeout")), 5000)
      );
      let latitude = 35.7796;
      let longitude = -78.6382;
      try {
        const location = await Promise.race([locationPromise, timeoutPromise]);
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
        if (lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        }
      }

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
        registerPushToken();
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

  const dismissSilenceAlert = useCallback(() => {
    setSilenceAlertDismissed(true);
  }, []);

  const openMasjidNav = useCallback(async (masjid: Masjid) => {
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
  }, []);

  const now = new Date();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const padNum = (n: number) => n.toString().padStart(2, "0");

  const isWeb = Platform.OS === "web";
  const headerTopPad = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.headerBar, { paddingTop: headerTopPad + 10 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ummah Connect</Text>
          {hijriDate ? (
            <Text style={styles.headerSubtitle}>{hijriDate}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={toggleNotifications}
          testID="notification-toggle"
          hitSlop={8}
          style={styles.headerNotifBtn}
        >
          <Ionicons
            name={notificationsEnabled ? "notifications" : "notifications-outline"}
            size={20}
            color={notificationsEnabled ? colors.gold : "rgba(255,255,255,0.7)"}
          />
        </Pressable>
      </LinearGradient>
      <TickerBanner />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContent}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 90 }}
        showsVerticalScrollIndicator={false}
      >
        {nearMosque && !silenceAlertDismissed ? (
          <View style={[styles.silenceAlert, { backgroundColor: isDark ? "#2A1818" : "#FEF2F2", borderColor: isDark ? "#3D2323" : "#FECACA" }]}>
            <View style={styles.silenceAlertContent}>
              <MaterialCommunityIcons name="volume-off" size={16} color={isDark ? "#F87171" : "#DC2626"} />
              <Text style={[styles.silenceAlertText, { color: isDark ? "#F87171" : "#DC2626" }]} numberOfLines={1}>
                Near {nearMosque.name} — silence your phone
              </Text>
              <Pressable onPress={dismissSilenceAlert} hitSlop={8}>
                <Ionicons name="close" size={16} color={isDark ? "#FCA5A5" : "#991B1B"} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={[styles.prayerCard, { backgroundColor: colors.surface }]}>
          <View style={styles.prayerCardInner}>
            <View style={styles.prayerTimesColumn}>
              {prayers.filter(p => p.name !== "sunrise").map((prayer) => {
                const isNext = nextPrayer?.name === prayer.name;
                const isPast = prayer.time < now && !isNext;
                return (
                  <View key={prayer.name} style={styles.prayerCompactRow}>
                    <Text style={[
                      styles.prayerCompactName,
                      { color: isNext ? colors.emerald : isPast ? colors.textTertiary : colors.text },
                      isNext && { fontFamily: "Inter_700Bold" },
                    ]}>
                      {prayer.label}
                    </Text>
                    <Text style={[
                      styles.prayerCompactTime,
                      { color: isNext ? colors.emerald : isPast ? colors.textTertiary : colors.text },
                      isNext && { fontFamily: "Inter_700Bold" },
                    ]}>
                      {formatTime(prayer.time)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.prayerCardRight}>
              <MaterialCommunityIcons name="mosque" size={60} color={isDark ? "#1A4A35" : "#D6EDE2"} />
              {nextPrayer ? (
                <View style={styles.nextPrayerBadge}>
                  <Text style={[styles.nextPrayerBadgeLabel, { color: colors.textSecondary }]}>Next</Text>
                  <Text style={[styles.nextPrayerBadgeName, { color: colors.emerald }]}>{nextPrayer.label}</Text>
                  <Text style={[styles.nextPrayerBadgeTime, { color: colors.gold }]}>
                    {padNum(countdown.hours)}:{padNum(countdown.minutes)}:{padNum(countdown.seconds)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <QiblaCompassSmall qiblaBearing={qiblaBearing} colors={colors} isDark={isDark} />
        </View>

        {locationPermission === false ? (
          <Pressable
            style={[styles.permissionBanner, { backgroundColor: colors.bannerBg }]}
            onPress={loadPrayerData}
          >
            <Ionicons name="location-outline" size={14} color={colors.bannerText} />
            <Text style={{ color: colors.bannerText, fontSize: 12, flex: 1, marginLeft: 8, fontFamily: "Inter_500Medium" }}>
              Enable location for accurate prayer times
            </Text>
          </Pressable>
        ) : null}


        {masjidsExpanded ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionCardHeader}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]}>Masjids Nearby</Text>
              <Pressable onPress={() => setMasjidsExpanded(false)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            {nearbyMasjids.map((item, idx) => (
              <Pressable
                key={item.masjid.name}
                style={({ pressed }) => [
                  styles.masjidRow,
                  idx < nearbyMasjids.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => openMasjidNav(item.masjid)}
              >
                <View style={[styles.masjidIcon, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }]}>
                  <MaterialCommunityIcons name="mosque" size={18} color={colors.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.masjidName, { color: colors.text }]} numberOfLines={1}>
                    {item.masjid.name.replace(/\s*\(.*\)/, "")}
                  </Text>
                  <Text style={[styles.masjidDist, { color: colors.textSecondary }]}>
                    {item.distanceMiles.toFixed(1)} mi
                  </Text>
                </View>
                <Ionicons name="navigate-outline" size={16} color={colors.emerald} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {tonightEvents.length > 0 ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionCardHeader}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]}>Tonight in the Community</Text>
            </View>
            {tonightEvents.map((ev, idx) => {
              const title = (ev.title ?? "").toLowerCase();
              let iconName: keyof typeof Ionicons.glyphMap = "calendar";
              let iconBg = isDark ? "#2A2318" : "#FFF8E7";
              if (title.includes("quran") || title.includes("halaqa") || title.includes("tafsir") || title.includes("study")) {
                iconName = "book";
                iconBg = isDark ? "#1A2E22" : "#EDF5F0";
              } else if (title.includes("iftar") || title.includes("suhoor") || title.includes("dinner") || title.includes("potluck") || title.includes("food")) {
                iconName = "restaurant";
                iconBg = isDark ? "#2E2318" : "#FEF3E7";
              } else if (title.includes("bazaar") || title.includes("market") || title.includes("shop") || title.includes("fundrais")) {
                iconName = "bag-handle";
                iconBg = isDark ? "#1A2638" : "#EDF2FA";
              } else if (title.includes("workshop") || title.includes("lecture") || title.includes("talk") || title.includes("seminar") || title.includes("speaker") || title.includes("khutbah")) {
                iconName = "mic";
                iconBg = isDark ? "#2A1A38" : "#F5EDF9";
              } else if (title.includes("youth") || title.includes("kids") || title.includes("children")) {
                iconName = "people";
                iconBg = isDark ? "#1A3038" : "#EDF8FA";
              } else if (title.includes("prayer") || title.includes("salah") || title.includes("taraweeh") || title.includes("tahajjud") || title.includes("qiyam")) {
                iconName = "moon";
                iconBg = isDark ? "#2A2318" : "#FFF8E7";
              } else if (title.includes("fitness") || title.includes("sports") || title.includes("basketball") || title.includes("soccer") || title.includes("gym")) {
                iconName = "fitness";
                iconBg = isDark ? "#1A2E22" : "#EDF5F0";
              }
              const onPress = () => {
                const fullEvent = calendarEvents?.find((e: any) => e.id === ev.id);
                if (fullEvent) {
                  setSelectedEvent(fullEvent as CalendarEvent);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              };
              return (
                <Pressable
                  key={ev.id}
                  onPress={onPress}
                  style={({ pressed }) => [
                    styles.eventRow,
                    idx < tonightEvents.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.eventIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={iconName} size={14} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
                    {ev.masjidName ? (
                      <Text style={[styles.eventVenue, { color: colors.textSecondary }]} numberOfLines={1}>
                        {ev.masjidName}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.eventTime, { color: colors.gold }]}>
                    {ev.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {nearbyHalalPreview.length > 0 ? (
          <View style={styles.halalSection}>
            <View style={styles.halalSectionHeader}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]}>Halal Restaurants Near You</Text>
              <Pressable onPress={() => router.push("/(tabs)/halal")} hitSlop={8}>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.halalScrollContent}
            >
              {nearbyHalalPreview.map((restaurant) => (
                <View key={restaurant.id} style={[styles.halalCard, { backgroundColor: colors.surface }]}>
                  <View style={[styles.halalCardImage, { backgroundColor: isDark ? "#1A2E22" : "#E8F5EE" }]}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={28} color={isDark ? "#2A5A40" : "#8DC4A8"} />
                  </View>
                  <View style={styles.halalCardInfo}>
                    <Text style={[styles.halalCardName, { color: colors.text }]} numberOfLines={1}>
                      {restaurant.name}
                    </Text>
                    <Text style={[styles.halalCardCuisine, { color: colors.textSecondary }]} numberOfLines={1}>
                      {restaurant.cuisine_types?.join(", ") || "Restaurant"}
                    </Text>
                    <View style={styles.halalCardMeta}>
                      {restaurant._distance !== undefined ? (
                        <Text style={[styles.halalCardDistance, { color: colors.textSecondary }]}>
                          {restaurant._distance.toFixed(1)} mi
                        </Text>
                      ) : null}
                      {restaurant.rating ? (
                        <View style={styles.halalRatingRow}>
                          <Ionicons name="star" size={12} color={colors.gold} />
                          <Text style={[styles.halalRating, { color: colors.gold }]}>{restaurant.rating.toFixed(1)}</Text>
                          {restaurant.user_ratings_total ? (
                            <Text style={[styles.halalRatingCount, { color: colors.textTertiary }]}>
                              ({restaurant.user_ratings_total})
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

      </ScrollView>
      <HomeEventDetailModal
        event={selectedEvent}
        visible={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
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
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  headerNotifBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    flex: 1,
  },
  silenceAlert: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  silenceAlertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  silenceAlertText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  prayerCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  prayerCardInner: {
    flexDirection: "row",
  },
  prayerTimesColumn: {
    flex: 1,
    gap: 8,
  },
  prayerCompactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 16,
  },
  prayerCompactName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  prayerCompactTime: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  prayerCardRight: {
    alignItems: "center",
    justifyContent: "center",
    width: 100,
  },
  nextPrayerBadge: {
    alignItems: "center",
    marginTop: 6,
  },
  nextPrayerBadgeLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  nextPrayerBadgeName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginTop: 1,
  },
  nextPrayerBadgeTime: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  qiblaSmall: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  qiblaRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  qiblaArrowWrap: {
    position: "absolute",
    width: 8,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  qiblaArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  qiblaArrowBody: {
    width: 1.5,
    height: 7,
    borderRadius: 1,
  },
  qiblaLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  permissionBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  sectionCard: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionCardTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  masjidRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  masjidIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  masjidName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  masjidDist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },
  eventIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  eventVenue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  eventTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 8,
  },
  halalSection: {
    marginTop: 18,
  },
  halalSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  halalScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  halalCard: {
    width: 160,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  halalCardImage: {
    height: 90,
    justifyContent: "center",
    alignItems: "center",
  },
  halalCardInfo: {
    padding: 10,
  },
  halalCardName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  halalCardCuisine: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  halalCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  halalCardDistance: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  halalRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  halalRating: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  halalRatingCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
