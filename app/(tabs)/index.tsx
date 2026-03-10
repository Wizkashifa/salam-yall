import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  Animated,
  Linking,
  Alert,
  Modal,
  Image,
  Dimensions,
  TextInput,
  FlatList,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { LinearGradient } from "expo-linear-gradient";
import { Magnetometer } from "expo-sensors";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { useDeepLink } from "@/lib/deeplink-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
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
  checkNearMosque,
  matchEventsToMasjid,
  calculateQiblaBearing,
  isRamadan,
  NEARBY_MASJIDS,
  type PrayerTimeEntry,
  type Masjid,
} from "@/lib/prayer-utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cyclePrayerStatus, getPrayerLog, type DayLog, type PrayerName as TrackerPrayerName } from "@/lib/prayer-tracker";
import { getDailyVerse, isFriday, type DailyVerse } from "@/lib/daily-content";
import { trackEvent, trackScreenView } from "@/lib/analytics";

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
  speaker: string;
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
        <View style={{ position: "absolute", top: Platform.OS === "web" ? 67 : insets.top + 12, left: 16, right: 16, zIndex: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
          <Pressable onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const shareUrl = `${getApiUrl()}share/event/${encodeURIComponent(event.id)}`;
            Share.share({ message: `Salam Y'all check out this event - "${event.title}" - ${shareUrl}` });
          }} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }}>
            <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 }} resizeMode="cover" />
          ) : (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.5, justifyContent: "center", alignItems: "center", backgroundColor: colors.prayerIconBg }}>
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
                <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 22 }}>
                  {event.speaker && cleanDescription.includes(event.speaker) ? (
                    <>
                      {cleanDescription.split(event.speaker).map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <Text style={{ fontFamily: "Inter_700Bold" }}>{event.speaker}</Text>
                          )}
                        </React.Fragment>
                      ))}
                    </>
                  ) : cleanDescription}
                </Text>
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


interface HalalRestaurant {
  id: number;
  name: string;
  cuisine_types: string[] | null;
  rating: number | null;
  user_ratings_total: number | null;
  _distance?: number;
  formatted_address: string | null;
}

const USE_NATIVE_DRIVER = Platform.OS !== "web";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}


function SkeletonHomeScreen({ colors, isDark, insets }: { colors: any; isDark: boolean; insets: any }) {
  const skeletonBg = isDark ? "#252525" : "#E5E5E5";
  const pulseOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.7, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulseOpacity, { toValue: 0.3, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseOpacity]);

  const Bone = ({ style }: { style: any }) => <Animated.View style={[style, { opacity: pulseOpacity }]} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassHeader>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }}>
          <Bone style={{ width: 180, height: 20, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.2)" }} />
          <Bone style={{ width: 120, height: 12, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 6 }} />
        </View>
      </GlassHeader>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={[styles.glassCard, { backgroundColor: isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)", borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)" }]}>
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Bone style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: skeletonBg }} />
            <Bone style={{ width: 100, height: 14, borderRadius: 4, backgroundColor: skeletonBg, marginTop: 12 }} />
            <Bone style={{ width: 140, height: 28, borderRadius: 6, backgroundColor: skeletonBg, marginTop: 8 }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
            {[1, 2, 3, 4, 5].map(i => (
              <View key={i} style={{ alignItems: "center", gap: 4 }}>
                <Bone style={{ width: 40, height: 12, borderRadius: 3, backgroundColor: skeletonBg }} />
                <Bone style={{ width: 36, height: 12, borderRadius: 3, backgroundColor: skeletonBg }} />
              </View>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 20 }}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ alignItems: "center", gap: 6 }}>
              <Bone style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: skeletonBg }} />
              <Bone style={{ width: 40, height: 10, borderRadius: 3, backgroundColor: skeletonBg }} />
            </View>
          ))}
        </View>
        <View style={[styles.glassCard, { backgroundColor: isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)", borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)", marginTop: 20 }]}>
          {[1, 2, 3].map(i => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
              <Bone style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: skeletonBg }} />
              <View style={{ flex: 1 }}>
                <Bone style={{ width: "70%", height: 14, borderRadius: 4, backgroundColor: skeletonBg }} />
                <Bone style={{ width: "40%", height: 10, borderRadius: 3, backgroundColor: skeletonBg, marginTop: 4 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function getWeatherIcon(code: number, isDay: boolean): { name: string; lib: "ionicons" | "mci" } {
  if (code <= 1) return { name: isDay ? "sunny" : "moon", lib: "ionicons" };
  if (code <= 3) return { name: isDay ? "partly-sunny" : "cloudy-night", lib: "ionicons" };
  if (code <= 48) return { name: "cloud", lib: "ionicons" };
  if (code <= 67) return { name: "rainy", lib: "ionicons" };
  if (code <= 77) return { name: "snow", lib: "ionicons" };
  if (code <= 82) return { name: "rainy", lib: "ionicons" };
  if (code <= 86) return { name: "snow", lib: "ionicons" };
  return { name: "thunderstorm", lib: "ionicons" };
}

function CountdownRing({ colors, isDark, progress, qiblaBearing, hasRealLocation, onRequestLocation }: {
  colors: any; isDark: boolean; progress: number; qiblaBearing: number; hasRealLocation: boolean; onRequestLocation?: () => void;
}) {
  const size = 72;
  const half = size / 2;
  const strokeWidth = 3;
  const trackColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const fillColor = hasRealLocation
    ? (isDark ? colors.gold : colors.emerald)
    : (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)");
  const bgColor = hasRealLocation
    ? (isDark ? colors.gold + "30" : colors.emerald + "18")
    : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)");
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const deg = clampedProgress * 360;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!hasRealLocation && onRequestLocation) {
          onRequestLocation();
        } else {
          Linking.openURL("https://qiblafinder.withgoogle.com/intl/en/finder/ar");
        }
      }}
      style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}
    >
      <View style={{
        position: "absolute", width: size, height: size, borderRadius: half,
        borderWidth: strokeWidth, borderColor: trackColor, backgroundColor: bgColor,
      }} />
      {deg > 0 && deg <= 180 && (
        <View style={{ position: "absolute", width: size, height: size }}>
          <View style={{
            position: "absolute", width: size, height: size, borderRadius: half,
            borderWidth: strokeWidth, borderColor: "transparent",
            borderTopColor: fillColor,
            borderRightColor: deg > 90 ? fillColor : "transparent",
            transform: [{ rotate: `${deg - 90}deg` }],
          }} />
        </View>
      )}
      {deg > 180 && (
        <View style={{ position: "absolute", width: size, height: size }}>
          <View style={{
            position: "absolute", width: size, height: size, borderRadius: half,
            borderWidth: strokeWidth, borderColor: "transparent",
            borderTopColor: fillColor, borderRightColor: fillColor,
            transform: [{ rotate: "90deg" }],
          }} />
          <View style={{
            position: "absolute", width: size, height: size, borderRadius: half,
            borderWidth: strokeWidth, borderColor: "transparent",
            borderTopColor: fillColor,
            borderRightColor: (deg - 180) > 90 ? fillColor : "transparent",
            transform: [{ rotate: `${deg - 90}deg` }],
          }} />
        </View>
      )}
      {hasRealLocation ? (
        <View style={{ transform: [{ rotate: `${qiblaBearing}deg` }] }}>
          <Ionicons name="navigate" size={24} color={fillColor} />
        </View>
      ) : (
        <Ionicons name="location-outline" size={22} color={fillColor} />
      )}
      <Text style={{ fontSize: 7, fontFamily: "Inter_600SemiBold", color: fillColor, marginTop: 1 }}>
        {hasRealLocation ? "QIBLA" : "LOCATE"}
      </Text>
    </Pressable>
  );
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { calcMethod, notificationsEnabled, setNotificationsEnabled, preferredMasjid } = useSettings();
  const router = useRouter();
  const { setPendingTarget } = useDeepLink();
  const [prayers, setPrayers] = useState<PrayerTimeEntry[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTimeEntry | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [hijriDate, setHijriDate] = useState("");
  const [nearestMasjid, setNearestMasjid] = useState<{ name: string; distanceMiles: number; masjid: Masjid } | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCoords, setUserCoords] = useState({ lat: 35.7796, lon: -78.6382 });
  const [hasRealLocation, setHasRealLocation] = useState(false);
  const [nearMosque, setNearMosque] = useState<Masjid | null>(null);
  const [silenceAlertDismissed, setSilenceAlertDismissed] = useState(false);
  const [masjidsExpanded, setMasjidsExpanded] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [todayLog, setTodayLog] = useState<DayLog>({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });
  const [ramadanActive, setRamadanActive] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const tafsirAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { trackScreenView("Home"); return () => { if (tafsirAbortRef.current) tafsirAbortRef.current.abort(); }; }, []);

  const { data: calendarEvents } = useQuery<any[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: halalRestaurants } = useQuery<HalalRestaurant[]>({
    queryKey: ["/api/halal-restaurants"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: businessesData } = useQuery<{ id: string; name: string; category: string; description: string }[]>({
    queryKey: ["/api/businesses"],
    staleTime: 5 * 60 * 1000,
  });

  interface IqamaSchedule {
    masjid: string;
    date: string;
    iqama: { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string };
  }

  const [cachedIqama, setCachedIqama] = useState<IqamaSchedule[] | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("iqama_cache").then(raw => {
      if (raw) {
        try { setCachedIqama(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const { data: fetchedIqama } = useQuery<IqamaSchedule[]>({
    queryKey: ["/api/iqama-times?days=7"],
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (fetchedIqama && fetchedIqama.length > 0) {
      setCachedIqama(fetchedIqama);
      AsyncStorage.setItem("iqama_cache", JSON.stringify(fetchedIqama)).catch(() => {});
    }
  }, [fetchedIqama]);

  const iqamaData = fetchedIqama || cachedIqama;

  const { data: weatherData } = useQuery<{ temperature: number; weatherCode: number; isDay: boolean }>({
    queryKey: [`/api/weather?lat=${userCoords.lat.toFixed(2)}&lon=${userCoords.lon.toFixed(2)}`],
    staleTime: 30 * 60 * 1000,
  });

  const { data: fetchedMasjids } = useQuery<Masjid[]>({
    queryKey: ["/api/masjids"],
    staleTime: 60 * 60 * 1000,
  });
  const masjidList = fetchedMasjids && fetchedMasjids.length > 0 ? fetchedMasjids : NEARBY_MASJIDS;

  const nearbyMasjids = useMemo(() => {
    return getAllMasjidsByDistance(userCoords.lat, userCoords.lon, masjidList).slice(0, 5);
  }, [userCoords, masjidList]);

  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClockTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [clockTick]);

  const activeIqama = useMemo(() => {
    if (!iqamaData || iqamaData.length === 0) return null;

    let targetMasjid = "IAR";
    if (preferredMasjid) {
      const pref = preferredMasjid.toLowerCase();
      if (pref.includes("parkwood")) {
        targetMasjid = "JIAR (Parkwood)";
      } else if (pref.includes("fayetteville") && pref.includes("jamaat")) {
        targetMasjid = "JIAR (Fayetteville)";
      } else if (pref.includes("morrisville") || pref.includes("icm")) {
        targetMasjid = "ICMNC";
      } else if (pref.includes("al-noor") || pref.includes("alnoor") || pref.includes("al noor")) {
        targetMasjid = "Al Noor";
      }
    }

    const todayEntry = iqamaData.find(s => s.masjid === targetMasjid && s.date === todayDateStr);
    if (todayEntry) return todayEntry;

    const anyEntry = iqamaData.find(s => s.masjid === targetMasjid);
    if (anyEntry) return anyEntry;

    return iqamaData.find(s => s.masjid === "IAR" && s.date === todayDateStr)
      || iqamaData.find(s => s.masjid === "IAR")
      || iqamaData[0];
  }, [iqamaData, preferredMasjid, todayDateStr]);

  const isBeforeFivePM = useMemo(() => new Date().getHours() < 17, [clockTick]);

  const communityEvents = useMemo(() => {
    if (!calendarEvents) return [];
    const now = new Date();
    const endOfTonight = new Date(now);
    endOfTonight.setDate(endOfTonight.getDate() + 1);
    endOfTonight.setHours(2, 0, 0, 0);

    const fivePM = new Date(now);
    fivePM.setHours(17, 0, 0, 0);

    const allNearby = getAllMasjidsByDistance(userCoords.lat, userCoords.lon, masjidList).slice(0, 8);

    return calendarEvents
      .filter((ev: any) => {
        const start = new Date(ev.start);
        const end = ev.end ? new Date(ev.end) : start;
        if (ev.isAllDay) return false;
        const isHappeningOrUpcoming = (start >= now && start <= endOfTonight) || (start <= now && end >= now);
        if (!isHappeningOrUpcoming) return false;
        if (!isBeforeFivePM) {
          return start >= fivePM || end >= fivePM;
        }
        return true;
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
  }, [calendarEvents, userCoords, isBeforeFivePM]);

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
        let gotLocation = false;
        try {
          if (navigator.geolocation) {
            const pos = await Promise.race([
              new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
              }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("geo timeout")), 4000)),
            ]);
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            gotLocation = true;
            setLocationPermission(true);
            const nearest = findNearestMasjid(lat, lon);
            setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
          } else {
            setLocationPermission(false);
          }
        } catch {
          setLocationPermission(false);
        }
        setHasRealLocation(gotLocation);
        loadDefaultPrayers(lat, lon);
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationPermission(false);
        setHasRealLocation(false);
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
      let gotNativeLocation = false;
      try {
        const location = await Promise.race([locationPromise, timeoutPromise]);
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
        gotNativeLocation = true;
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
        if (lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
          gotNativeLocation = true;
        }
      }
      setHasRealLocation(gotNativeLocation);

      loadDefaultPrayers(latitude, longitude);

      const nearest = findNearestMasjid(latitude, longitude);
      setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
    } catch (err) {
      console.error("Error loading prayer data:", err);
      setHasRealLocation(false);
      loadDefaultPrayers();
    } finally {
      setLoading(false);
    }
  }, [loadDefaultPrayers]);

  useEffect(() => {
    loadPrayerData();
  }, [loadPrayerData]);

  useEffect(() => {
    getPrayerLog(new Date()).then(setTodayLog);
    setRamadanActive(isRamadan());
  }, []);

  const handlePrayerPillPress = useCallback(async (prayerName: string) => {
    const trackerName = prayerName as TrackerPrayerName;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await cyclePrayerStatus(new Date(), trackerName);
    setTodayLog(updated);
    trackEvent("prayer_tracked", { prayer: prayerName, status: updated[trackerName] });
  }, []);

  const dailyVerse = useMemo(() => getDailyVerse(), []);
  const [showVerseModal, setShowVerseModal] = useState(false);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);

  const openVerseModal = useCallback(async () => {
    if (tafsirAbortRef.current) tafsirAbortRef.current.abort();
    const controller = new AbortController();
    tafsirAbortRef.current = controller;
    setShowVerseModal(true);
    setTafsirText(null);
    setTafsirLoading(true);
    try {
      const url = new URL(`/api/tafsir/${dailyVerse.surah}/${dailyVerse.ayah}`, getApiUrl());
      const resp = await fetch(url.toString(), { signal: controller.signal });
      if (resp.ok) {
        const data = await resp.json();
        setTafsirText(data.text || "Tafsir not available for this verse.");
      } else {
        setTafsirText("Unable to load tafsir at this time.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setTafsirText("Unable to load tafsir at this time.");
    } finally {
      if (!controller.signal.aborted) setTafsirLoading(false);
    }
  }, [dailyVerse]);

  const shareVerse = useCallback(() => {
    const msg = `${dailyVerse.arabic}\n\n"${dailyVerse.translation}"\n\n— ${dailyVerse.source}\n(Dr. Mustafa Khattab, The Clear Quran)\n\nShared via Salam Y'all`;
    Share.share({ message: msg });
  }, [dailyVerse]);

  const fridayMode = useMemo(() => isFriday(), []);

  interface JumuahSchedule {
    id: number;
    masjid: string;
    khutbah_time: string;
    iqama_time: string;
    speaker: string | null;
    topic: string | null;
  }

  const { data: jumuahSchedules = [] } = useQuery<JumuahSchedule[]>({
    queryKey: ["/api/jumuah-schedules"],
    enabled: fridayMode,
    staleTime: 60 * 60 * 1000,
  });

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

  const qiblaBearing = useMemo(() => {
    return calculateQiblaBearing(userCoords.lat, userCoords.lon);
  }, [userCoords]);

  const [compassHeading, setCompassHeading] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Magnetometer.setUpdateInterval(200);
    const sub = Magnetometer.addListener((data) => {
      const { x, y } = data;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle = (90 - angle + 360) % 360;
      setCompassHeading(angle);
    });
    return () => sub.remove();
  }, []);

  const qiblaRotation = useMemo(() => {
    if (Platform.OS === "web") return qiblaBearing;
    return (qiblaBearing - compassHeading + 360) % 360;
  }, [qiblaBearing, compassHeading]);

  const countdownProgress = useMemo(() => {
    if (!nextPrayer || prayers.length === 0) return 0;
    const now2 = new Date();
    const nextTime = nextPrayer.time.getTime();
    const idx = prayers.findIndex(p => p.name === nextPrayer.name);
    let prevTime: number;
    if (idx <= 0) {
      const yesterday = new Date(now2);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(prayers[prayers.length - 1].time.getHours(), prayers[prayers.length - 1].time.getMinutes(), 0, 0);
      prevTime = yesterday.getTime();
    } else {
      prevTime = prayers[idx - 1].time.getTime();
    }
    const total = nextTime - prevTime;
    const elapsed = now2.getTime() - prevTime;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, elapsed / total));
  }, [prayers, nextPrayer, countdown]);

  const now = new Date();

  if (loading) {
    return <SkeletonHomeScreen colors={colors} isDark={isDark} insets={insets} />;
  }

  const padNum = (n: number) => n.toString().padStart(2, "0");

  const greeting = getGreeting();

  const glassCardBg = isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)";
  const glassCardBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>As-salamu alaykum</Text>
            <Text style={styles.headerSubtitle}>
              {greeting}{hijriDate ? ` · ${hijriDate}` : ""}
            </Text>
            {preferredMasjid ? (
              <Text style={styles.headerMasjid}>{preferredMasjid}</Text>
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
        </View>
        <TickerBanner />
      </GlassHeader>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContent}
        contentContainerStyle={{ paddingTop: headerHeight + 12, paddingBottom: Platform.OS === "web" ? 34 : 90 }}
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

        {ramadanActive ? (
          <View style={[styles.glassCard, styles.ramadanCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder }]}>
            <View style={styles.ramadanHeader}>
              <MaterialCommunityIcons name="moon-waning-crescent" size={22} color={colors.gold} />
              <Text style={[styles.ramadanTitle, { color: colors.gold }]}>Ramadan Mubarak</Text>
            </View>
            <View style={styles.ramadanTimesRow}>
              <View style={styles.ramadanTimeBlock}>
                <Text style={[styles.ramadanTimeLabel, { color: colors.textSecondary }]}>Suhoor Ends</Text>
                <Text style={[styles.ramadanTimeValue, { color: colors.text }]}>
                  {prayers.find(p => p.name === "fajr") ? formatTime(prayers.find(p => p.name === "fajr")!.time) : "--:--"}
                </Text>
              </View>
              <View style={[styles.ramadanDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]} />
              <View style={styles.ramadanTimeBlock}>
                <Text style={[styles.ramadanTimeLabel, { color: colors.textSecondary }]}>Iftar</Text>
                <Text style={[styles.ramadanTimeValue, { color: colors.text }]}>
                  {prayers.find(p => p.name === "maghrib") ? formatTime(prayers.find(p => p.name === "maghrib")!.time) : "--:--"}
                </Text>
              </View>
            </View>
            {(() => {
              const fajr = prayers.find(p => p.name === "fajr");
              const maghrib = prayers.find(p => p.name === "maghrib");
              if (!fajr || !maghrib) return null;
              let targetLabel: string;
              let targetTime: Date;
              if (now < fajr.time) {
                targetLabel = "Suhoor ends";
                targetTime = fajr.time;
              } else if (now < maghrib.time) {
                targetLabel = "Iftar";
                targetTime = maghrib.time;
              } else {
                targetLabel = "Suhoor ends";
                const tomorrowFajr = new Date(fajr.time);
                tomorrowFajr.setDate(tomorrowFajr.getDate() + 1);
                targetTime = tomorrowFajr;
              }
              const cd = getCountdown(targetTime, now);
              return (
                <Text style={[styles.ramadanCountdown, { color: colors.gold }]}>
                  {targetLabel} in {padNum(cd.hours)}:{padNum(cd.minutes)}:{padNum(cd.seconds)}
                </Text>
              );
            })()}
          </View>
        ) : null}

        <View style={[styles.glassCard, styles.prayerCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder }]}>
          <View style={styles.prayerHero}>
            <CountdownRing colors={colors} isDark={isDark} progress={countdownProgress} qiblaBearing={qiblaRotation} hasRealLocation={hasRealLocation} onRequestLocation={loadPrayerData} />
            {nextPrayer ? (
              <View style={styles.prayerHeroText}>
                <Text style={[styles.prayerHeroName, { color: isDark ? "#FFFFFF" : colors.emerald }]} allowFontScaling={false}>{nextPrayer.label}</Text>
                <Text style={[styles.prayerHeroCountdown, { color: isDark ? colors.gold : colors.text }]} allowFontScaling={false}>
                  {padNum(countdown.hours)}:{padNum(countdown.minutes)}:{padNum(countdown.seconds)}
                </Text>
              </View>
            ) : null}
            {weatherData ? (
              <View style={{ alignItems: "center", gap: 2 }}>
                <Ionicons name={getWeatherIcon(weatherData.weatherCode, weatherData.isDay).name as any} size={22} color={isDark ? colors.gold : colors.textSecondary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: isDark ? colors.gold : colors.text }}>{weatherData.temperature}°F</Text>
              </View>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.prayerPillRow, { borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]} contentContainerStyle={styles.prayerPillRowContent}>
            {prayers.filter(p => p.name !== "sunrise").map((prayer) => {
              const isNext = nextPrayer?.name === prayer.name;
              const isPast = prayer.time < now && !isNext;
              const trackerKey = prayer.name as TrackerPrayerName;
              const status = todayLog[trackerKey] ?? 0;
              const isGold = status === 1;
              const isGreen = status === 2;
              const pillBg = isGold
                ? (isDark ? colors.gold + "20" : colors.gold + "15")
                : isGreen
                  ? (isDark ? colors.emerald + "25" : colors.emerald + "12")
                  : undefined;
              const iqamaTime = !preferredMasjid ? undefined : activeIqama?.iqama?.[prayer.name as keyof typeof activeIqama.iqama];
              return (
                <Pressable
                  key={prayer.name}
                  onPress={() => handlePrayerPillPress(prayer.name)}
                  style={({ pressed }) => [
                    styles.prayerPill,
                    pillBg ? { backgroundColor: pillBg } : undefined,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[
                    styles.prayerPillName,
                    { color: isPast ? colors.textTertiary : colors.textSecondary },
                  ]} allowFontScaling={false}>
                    {prayer.label}
                  </Text>
                  <Text style={[
                    styles.prayerPillTime,
                    { color: isPast ? colors.textTertiary : colors.text },
                  ]} allowFontScaling={false}>
                    {formatTime(prayer.time)}
                  </Text>
                  {iqamaTime ? (
                    <Text style={[styles.prayerIqamaTime, { color: isPast ? colors.textTertiary : (isDark ? colors.gold : "#9A7B2A") }]} allowFontScaling={false}>
                      {iqamaTime}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Pressable
          onPress={() => { setSearchVisible(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <Text style={[styles.searchPlaceholder, { color: colors.textTertiary }]}>Search events, restaurants, businesses...</Text>
        </Pressable>

        {locationPermission === false ? (
          <Pressable
            style={[styles.permissionBanner, { backgroundColor: colors.bannerBg }]}
            onPress={loadPrayerData}
          >
            <Ionicons name="location-outline" size={14} color={colors.bannerText} />
            <Text style={{ color: colors.bannerText, fontSize: 12, flex: 1, marginLeft: 8, fontFamily: "Inter_500Medium" }}>
              Enable location for accurate prayer times & Qibla direction
            </Text>
          </Pressable>
        ) : null}

        {fridayMode ? (
          <View style={[styles.glassCard, styles.dailyContentCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder }]}>
            <View style={styles.dailyContentHeader}>
              <MaterialCommunityIcons name="mosque" size={18} color={colors.emerald} />
              <Text style={[styles.dailyContentType, { color: colors.emerald }]}>Jumu'ah Prayer</Text>
            </View>
            <Text style={[styles.jumuahVerse, { color: colors.text }]}>
              "O you who believe, when the call to prayer is made on Friday, hasten to the remembrance of Allah."
            </Text>
            <Text style={[styles.dailyContentSource, { color: colors.textTertiary, marginBottom: 12 }]}>
              — Surah Al-Jumu'ah 62:9
            </Text>
            {jumuahSchedules.map((j, idx) => (
              <View
                key={j.id}
                style={[
                  styles.jumuahRow,
                  idx < jumuahSchedules.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
                ]}
              >
                <Text style={[styles.jumuahMasjid, { color: colors.text }]} numberOfLines={1}>{j.masjid}</Text>
                <View style={styles.jumuahTimesCol}>
                  <Text style={[styles.jumuahTime, { color: colors.textSecondary }]}>{j.khutbah_time}</Text>
                  <Text style={[styles.jumuahTimeLabel, { color: colors.textTertiary }]}>Khutbah</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Pressable
            onPress={openVerseModal}
            style={({ pressed }) => [styles.glassCard, styles.dailyContentCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.dailyContentHeader}>
              <Ionicons name="book" size={16} color={colors.gold} />
              <Text style={[styles.dailyContentType, { color: colors.gold }]}>Daily Verse</Text>
            </View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 22, color: colors.text, textAlign: "right" as const, lineHeight: 38, marginBottom: 12, writingDirection: "rtl" as const }}>
              {dailyVerse.arabic}
            </Text>
            <Text style={[styles.dailyContentText, { color: colors.text }]}>
              "{dailyVerse.translation}"
            </Text>
            <Text style={[styles.dailyContentSource, { color: colors.textTertiary }]}>
              — {dailyVerse.source} · Dr. Mustafa Khattab
            </Text>
          </Pressable>
        )}

        {masjidsExpanded ? (
          <View style={[styles.glassCard, styles.sectionCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder }]}>
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
                <View style={[styles.masjidIcon, { backgroundColor: colors.prayerIconBg }]}>
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

        {communityEvents.length > 0 ? (
          <View style={[styles.glassCard, styles.sectionCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder }]}>
            <View style={styles.sectionCardHeader}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]}>{isBeforeFivePM ? "Today" : "Tonight"} in the Community</Text>
            </View>
            {communityEvents.map((ev, idx) => {
              const title = (ev.title ?? "").toLowerCase();
              let iconName: keyof typeof Ionicons.glyphMap = "calendar";
              let iconBg = isDark ? "#2A2318" : "#FFF8E7";
              if (title.includes("quran") || title.includes("halaqa") || title.includes("tafsir") || title.includes("study")) {
                iconName = "book";
                iconBg = colors.prayerIconBg;
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
                iconBg = colors.prayerIconBg;
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
                    idx < communityEvents.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
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
                <View key={restaurant.id} style={[styles.halalCard, { backgroundColor: glassCardBg, borderColor: glassCardBorder, borderWidth: 1 }]}>
                  <View style={[styles.halalCardImage, { backgroundColor: colors.prayerIconBg }]}>
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
      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSearchVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, paddingBottom: 12, gap: 10, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: 10, paddingHorizontal: 10, height: 40 }}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                autoFocus
                placeholder="Search..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, marginLeft: 8, fontSize: 16, fontFamily: "Inter_400Regular", color: colors.text }}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => { setSearchVisible(false); setSearchQuery(""); }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.emerald }}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {(() => {
              const q = searchQuery.toLowerCase().trim();
              if (q.length < 2) return (
                <Text style={{ textAlign: "center", marginTop: 40, color: colors.textTertiary, fontFamily: "Inter_400Regular", fontSize: 14 }}>Type at least 2 characters to search</Text>
              );
              const simpleMatch = (text: string | null | undefined, query: string): boolean => {
                if (!text) return false;
                const t = text.toLowerCase();
                return t.includes(query);
              };
              const fuzzyMatch = (text: string | null | undefined, query: string): boolean => {
                if (!text) return false;
                const t = text.toLowerCase();
                if (t.includes(query)) return true;
                const words = query.split(/\s+/);
                if (words.length > 1 && words.every(w => t.includes(w))) return true;
                const tWords = t.split(/\s+/);
                for (const tw of tWords) {
                  for (const qw of words) {
                    if (qw.length < 3) continue;
                    if (tw.startsWith(qw.slice(0, Math.ceil(qw.length * 0.7)))) return true;
                    if (qw.length >= 4) {
                      let matches = 0;
                      const shorter = qw.length < tw.length ? qw : tw;
                      const longer = qw.length < tw.length ? tw : qw;
                      for (let i = 0; i < shorter.length; i++) {
                        if (longer.includes(shorter[i])) matches++;
                      }
                      if (matches / shorter.length >= 0.75 && Math.abs(tw.length - qw.length) <= 2) return true;
                    }
                  }
                }
                return false;
              };
              const eventResults = (calendarEvents || []).filter((e: any) => simpleMatch(e.title, q) || simpleMatch(e.description, q) || simpleMatch(e.organizer, q)).slice(0, 5);
              const restaurantResults = (halalRestaurants || []).filter((r: HalalRestaurant) => simpleMatch(r.name, q) || (r.cuisine_types || []).some(c => simpleMatch(c, q)) || simpleMatch(r.formatted_address, q)).slice(0, 5);
              const businessResults = (businessesData || []).filter((b: any) => simpleMatch(b.name, q) || simpleMatch(b.category, q) || simpleMatch(b.description, q) || (b.search_tags && b.search_tags.some((t: string) => fuzzyMatch(t, q)))).slice(0, 5);
              const totalResults = eventResults.length + restaurantResults.length + businessResults.length;
              if (totalResults === 0) return (
                <Text style={{ textAlign: "center", marginTop: 40, color: colors.textTertiary, fontFamily: "Inter_400Regular", fontSize: 14 }}>No results found</Text>
              );
              return (
                <>
                  {eventResults.length > 0 && (
                    <>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 8 }}>Events</Text>
                      {eventResults.map((ev: any) => (
                        <Pressable key={ev.id} onPress={() => { setSearchVisible(false); setSearchQuery(""); setPendingTarget({ type: "event", id: ev.id }); router.push("/(tabs)/events"); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 8, gap: 12 }, pressed && { opacity: 0.7 }]}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.prayerIconBg, justifyContent: "center", alignItems: "center" }}>
                            <Ionicons name="calendar" size={16} color={colors.emerald} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>{ev.title}</Text>
                            {ev.organizer ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary }} numberOfLines={1}>{ev.organizer}</Text> : null}
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </Pressable>
                      ))}
                    </>
                  )}
                  {restaurantResults.length > 0 && (
                    <>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8, marginTop: eventResults.length > 0 ? 12 : 0, marginBottom: 8 }}>Restaurants</Text>
                      {restaurantResults.map((r: HalalRestaurant) => (
                        <Pressable key={r.id} onPress={() => { setSearchVisible(false); setSearchQuery(""); setPendingTarget({ type: "restaurant", id: String(r.id) }); router.push("/(tabs)/halal"); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 8, gap: 12 }, pressed && { opacity: 0.7 }]}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? "#2E2318" : "#FEF3E7", justifyContent: "center", alignItems: "center" }}>
                            <Ionicons name="restaurant" size={16} color={colors.gold} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>{r.name}</Text>
                            {r.cuisine_types && r.cuisine_types.length > 0 ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary }} numberOfLines={1}>{r.cuisine_types.join(", ")}</Text> : null}
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </Pressable>
                      ))}
                    </>
                  )}
                  {businessResults.length > 0 && (
                    <>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8, marginTop: (eventResults.length > 0 || restaurantResults.length > 0) ? 12 : 0, marginBottom: 8 }}>Businesses</Text>
                      {businessResults.map((b: any) => (
                        <Pressable key={b.id} onPress={() => { setSearchVisible(false); setSearchQuery(""); setPendingTarget({ type: "business", id: String(b.id) }); router.push("/(tabs)/businesses"); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 8, gap: 12 }, pressed && { opacity: 0.7 }]}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.prayerIconBg, justifyContent: "center", alignItems: "center" }}>
                            <Ionicons name="storefront" size={16} color={colors.emerald} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>{b.name}</Text>
                            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary }} numberOfLines={1}>{b.category}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </Pressable>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showVerseModal} transparent animationType="slide" onRequestClose={() => { if (tafsirAbortRef.current) tafsirAbortRef.current.abort(); setShowVerseModal(false); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: colors.text }}>Daily Verse</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{dailyVerse.source}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Pressable onPress={shareVerse} hitSlop={8}>
                  <Ionicons name="share-outline" size={22} color={colors.emerald} />
                </Pressable>
                <Pressable onPress={() => { if (tafsirAbortRef.current) tafsirAbortRef.current.abort(); setShowVerseModal(false); }} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              <View style={{ backgroundColor: colors.gold + "0D", borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.gold + "20" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 26, color: colors.text, textAlign: "right" as const, lineHeight: 48, writingDirection: "rtl" as const }}>
                  {dailyVerse.arabic}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.emerald + "0D", borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.emerald + "20" }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.emerald, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 8 }}>Translation</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 16, color: colors.text, lineHeight: 26 }}>
                  "{dailyVerse.translation}"
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textTertiary, marginTop: 8 }}>
                  Dr. Mustafa Khattab · The Clear Quran
                </Text>
              </View>
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.gold, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 12 }}>Tafsir Ibn Kathir</Text>
                {tafsirLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 20 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textTertiary }}>Loading tafsir...</Text>
                  </View>
                ) : tafsirText ? (
                  <View>
                    {tafsirText
                      .replace(/<h[1-6][^>]*>/gi, "\n### ")
                      .replace(/<\/h[1-6]>/gi, "\n")
                      .replace(/<br\s*\/?>/gi, "\n")
                      .replace(/<\/p>/gi, "\n\n")
                      .replace(/<p[^>]*>/gi, "")
                      .replace(/<li[^>]*>/gi, "\n• ")
                      .replace(/<\/?[uo]l[^>]*>/gi, "\n")
                      .replace(/<\/li>/gi, "")
                      .replace(/<[^>]*>/g, "")
                      .replace(/&amp;/g, "&")
                      .replace(/&lt;/g, "<")
                      .replace(/&gt;/g, ">")
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .replace(/&nbsp;/g, " ")
                      .replace(/\n{3,}/g, "\n\n")
                      .trim()
                      .split("\n\n")
                      .filter((p: string) => p.trim().length > 0)
                      .map((paragraph: string, idx: number) => {
                        const isHeading = paragraph.trim().startsWith("### ");
                        const text = isHeading ? paragraph.trim().replace("### ", "") : paragraph.trim();
                        return (
                          <Text
                            key={idx}
                            style={{
                              fontFamily: isHeading ? "Inter_600SemiBold" : "Inter_400Regular",
                              fontSize: isHeading ? 15 : 14,
                              color: isHeading ? colors.text : colors.textSecondary,
                              lineHeight: isHeading ? 22 : 22,
                              marginBottom: 12,
                            }}
                          >
                            {text}
                          </Text>
                        );
                      })}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  headerMasjid: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 3,
  },
  headerNotifBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
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
  glassCard: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  prayerCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
  },
  prayerHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingBottom: 16,
  },
  prayerHeroText: {
    flex: 1,
  },
  prayerHeroLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  prayerHeroName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
  },
  prayerHeroCountdown: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
    letterSpacing: 1,
    fontVariant: ["tabular-nums" as const],
  },
  prayerPillRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  prayerPillRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexGrow: 1,
  },
  prayerPill: {
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    minWidth: 54,
  },
  prayerPillName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  prayerPillTime: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginTop: 3,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  searchPlaceholder: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  prayerIqamaTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 3,
  },
  iqamaSource: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    marginTop: 8,
  },
  prayerStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
  ramadanCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  ramadanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  ramadanTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  ramadanTimesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  ramadanTimeBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  ramadanTimeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  ramadanTimeValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  ramadanDivider: {
    width: 1,
    height: 36,
  },
  ramadanCountdown: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center" as const,
    marginTop: 10,
  },
  dailyContentCard: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
  },
  dailyContentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  dailyContentType: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  dailyContentText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    lineHeight: 22,
    fontStyle: "italic" as const,
  },
  dailyContentSource: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  jumuahVerse: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    fontStyle: "italic" as const,
    marginBottom: 4,
  },
  jumuahRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  jumuahMasjid: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
    marginRight: 12,
  },
  jumuahTimesCol: {
    alignItems: "center",
  },
  jumuahTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  jumuahTimeLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
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
    padding: 16,
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
    borderRadius: 16,
    overflow: "hidden",
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
