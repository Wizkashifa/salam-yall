import { useCallback, useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  Linking,
  TextInput,
  Alert,
  Share,
  LayoutAnimation,
  UIManager,
  PanResponder,
  Animated,
  Dimensions,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import {
  NEARBY_MASJIDS,
  CALC_METHOD_LABELS,
  matchEventsToMasjid,
  getAllMasjidsByDistance,
  type CalcMethodKey,
  type Masjid,
} from "@/lib/prayer-utils";
import { getApiUrl } from "@/lib/query-client";
import { useRouter, useFocusEffect } from "expo-router";
import { useDeepLink } from "@/lib/deeplink-context";
import { getMonthLogs, cyclePrayerStatus, getMonthMissedFasts, toggleMissedFast, getAllLogs, getPrayerStreak, getMissedPrayerCount, type DayLog, type PrayerName, type PrayerStatus } from "@/lib/prayer-tracker";
import { DHIKR_PRESETS, getDhikrCounts, incrementDhikr, resetDhikr, type DhikrDayData } from "@/lib/dhikr-tracker";
import { trackEvent, trackScreenView } from "@/lib/analytics";
import { MasjidMap } from "@/components/MasjidMap";
import { computeBadges, BADGES, type BadgeState } from "@/lib/prayer-badges";
import ViewShot, { captureRef } from "react-native-view-shot";
import { useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QuranReader, type QuranReaderHandle } from "@/components/QuranReader";
import { getReadingStreak, getReadingDates, getKhatamProgress } from "@/lib/quran-tracker";

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

type SettingsSection = "main" | "calcMethod" | "masjids" | "masjidDetail" | "feedback" | "prayerTracker" | "janazaHistory" | "profile" | "dhikrCounter" | "athanAlerts" | "quranReader" | "personalGrowth";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode, ramadanMode, setRamadanMode } = useTheme();
  const router = useRouter();
  const { calcMethod, setCalcMethod, notificationsEnabled, setNotificationsEnabled, iqamaAlertsEnabled, setIqamaAlertsEnabled, preferredMasjid, setPreferredMasjid, consumePendingSettingsSection, hijriOffset, setHijriOffset, asrCalc, setAsrCalc } = useSettings();
  const { user, signInWithApple, devSignIn, signOut, isLoading: authLoading, getAuthHeaders } = useAuth();
  const qc = useQueryClient();
  const [section, setSectionRaw] = useState<SettingsSection>("main");
  const sectionRef = useRef<SettingsSection>("main");
  const setSection = (s: SettingsSection) => {
    sectionRef.current = s;
    LayoutAnimation.configureNext(LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setSectionRaw(s);
  };

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get("window").width;
  const EDGE_WIDTH = 30;
  const quranReaderRef = useRef<QuranReaderHandle>(null);

  const handleSwipeBack = useCallback(() => {
    if (sectionRef.current === "quranReader" && quranReaderRef.current) {
      const consumed = quranReaderRef.current.goBack();
      if (consumed) return;
    }
    setSection("main");
  }, []);

  const swipePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (Platform.OS !== "ios") return false;
        if (sectionRef.current === "main") return false;
        return evt.nativeEvent.pageX < EDGE_WIDTH && gestureState.dx > 10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          swipeAnim.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > screenWidth * 0.35 || gestureState.vx > 0.5) {
          Animated.timing(swipeAnim, {
            toValue: screenWidth,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            swipeAnim.setValue(0);
            handleSwipeBack();
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const [growthTab, setGrowthTab] = useState<"statistics" | "badges">("statistics");
  const [selectedMasjid, setSelectedMasjid] = useState<Masjid | null>(null);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [selectedDhikrId, setSelectedDhikrId] = useState(DHIKR_PRESETS[0].id);
  const [dhikrCounts, setDhikrCounts] = useState<DhikrDayData>({});

  const { consumeTarget, setPendingTarget } = useDeepLink();

  useEffect(() => { trackScreenView("Settings"); }, []);

  useFocusEffect(useCallback(() => {
    const pending = consumePendingSettingsSection();
    if (pending) {
      setSection(pending as SettingsSection);
    }
    getMissedPrayerCount().then(setMissedPrayerCount);
  }, [consumePendingSettingsSection]));

  useEffect(() => {
    const janazaTarget = consumeTarget("janaza");
    if (janazaTarget !== null) {
      setSection("janazaHistory");
    }
  }, [consumeTarget]);

  useEffect(() => {
    const verificationTarget = consumeTarget("verification");
    if (verificationTarget !== null) {
      setSection("profile");
    }
  }, [consumeTarget]);

  useEffect(() => {
    if (section === "dhikrCounter") {
      getDhikrCounts(new Date()).then(setDhikrCounts).catch(() => {});
    }
  }, [section]);

  const now = new Date();
  const [trackerYear, setTrackerYear] = useState(now.getFullYear());
  const [trackerMonth, setTrackerMonth] = useState(now.getMonth() + 1);
  const [monthLogs, setMonthLogs] = useState<{ [dateKey: string]: DayLog }>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [missedFasts, setMissedFasts] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  const [badgeStates, setBadgeStates] = useState<BadgeState[]>([]);
  const [newBadgeKey, setNewBadgeKey] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<{ date: string; fajr: PrayerStatus; dhuhr: PrayerStatus; asr: PrayerStatus; maghrib: PrayerStatus; isha: PrayerStatus }[]>([]);
  const [missedPrayerCount, setMissedPrayerCount] = useState(0);
  const [showTrackerOnboarding, setShowTrackerOnboarding] = useState(false);
  const badgeShareRef = useRef<ViewShot | null>(null);
  const [sharingBadgeKey, setSharingBadgeKey] = useState<string | null>(null);

  useEffect(() => {
    if (section === "masjids" && !locationRequested) {
      setLocationRequested(true);
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        } catch {}
      })();
    }
  }, [section, locationRequested]);

  const { data: fetchedMasjids } = useQuery<Masjid[]>({
    queryKey: ["/api/masjids"],
    staleTime: 60 * 60 * 1000,
  });
  const masjidList = fetchedMasjids && fetchedMasjids.length > 0 ? fetchedMasjids : NEARBY_MASJIDS;

  const sortedMasjids = useMemo(() => {
    if (userLocation) {
      return getAllMasjidsByDistance(userLocation.latitude, userLocation.longitude, masjidList);
    }
    return masjidList.map((m) => ({ masjid: m, distanceMiles: 0, driveMinutes: 0 }));
  }, [userLocation, masjidList]);

  useEffect(() => {
    if (section === "prayerTracker") {
      getMonthLogs(trackerYear, trackerMonth).then(setMonthLogs);
      getMonthMissedFasts(trackerYear, trackerMonth).then(setMissedFasts);
      getMissedPrayerCount().then(setMissedPrayerCount);
      (async () => {
        const allLogs = await getAllLogs();
        const today = new Date();
        const heatmapDays = 30;
        const hData: typeof heatmapData = [];
        for (let i = heatmapDays - 1; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const log = allLogs[key];
          hData.push({ date: key, fajr: log?.fajr ?? 0, dhuhr: log?.dhuhr ?? 0, asr: log?.asr ?? 0, maghrib: log?.maghrib ?? 0, isha: log?.isha ?? 0 });
        }
        setHeatmapData(hData);
      })();
      (async () => {
        const APP_VERSION = "1.1.1";
        const ONBOARDING_KEY = "prayer_tracker_onboarding_shown";
        const shown = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (shown !== APP_VERSION) {
          setShowTrackerOnboarding(true);
        }
      })();
    }
  }, [section, trackerYear, trackerMonth]);

  useEffect(() => {
    if (section === "prayerTracker" || section === "profile" || section === "personalGrowth") {
      computeBadges().then(({ badges, newlyEarned }) => {
        setBadgeStates(badges);
        if (newlyEarned.length > 0) {
          setNewBadgeKey(newlyEarned[0]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => setNewBadgeKey(null), 3000);
        }
      });
    }
  }, [section]);

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 5 * 60 * 1000,
  });

  const userStatsQuery = useQuery<{
    restaurantRatings: number; businessRatings: number; totalRatings: number;
    ratingHistory: Array<{ entityType: string; entityId: number; rating: number; name: string | null; createdAt: string }>;
  }>({
    queryKey: ["/api/user/stats"],
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/user/stats", baseUrl).toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleToggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Notifications Permission", "Please enable notifications in your device settings.");
          return;
        }
        setNotificationsEnabled(true);
        trackEvent("notifications_enabled", { enabled: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else {
      setNotificationsEnabled(false);
      Notifications.cancelAllScheduledNotificationsAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notificationsEnabled, setNotificationsEnabled]);

  const handleToggleIqamaAlerts = useCallback(async () => {
    if (!iqamaAlertsEnabled) {
      if (!preferredMasjid) {
        Alert.alert("No Masjid Selected", "Please select a preferred masjid with iqama timings first from the Masjid Directory.");
        return;
      }
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Notifications Permission", "Please enable notifications in your device settings.");
          return;
        }
        setIqamaAlertsEnabled(true);
        trackEvent("iqama_alerts_enabled", { enabled: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else {
      setIqamaAlertsEnabled(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [iqamaAlertsEnabled, setIqamaAlertsEnabled, preferredMasjid]);

  const openMasjidDirections = useCallback(async (address: string) => {
    const encoded = encodeURIComponent(address);
    try {
      if (Platform.OS === "ios") {
        const mapsUrl = `maps://maps.apple.com/?daddr=${encoded}&dirflg=d`;
        const canOpen = await Linking.canOpenURL(mapsUrl);
        await Linking.openURL(canOpen ? mapsUrl : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      } else {
        await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      }
    } catch {
      Alert.alert("Unable to Open Maps", "Could not open a maps application.");
    }
  }, []);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedbackText.trim()) {
      Alert.alert("Required", "Please describe your feedback");
      return;
    }
    const subject = feedbackType === "bug" ? "Bug Report" : "Feature Request";
    const body = `${subject}\n\n${feedbackText}\n\nFrom: ${feedbackEmail || "Anonymous"}`;
    const mailUrl = `mailto:feedback@salamyall.net?subject=${encodeURIComponent(`[Salam Y'all] ${subject}`)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailUrl).catch(() => {
      Alert.alert("Feedback Noted", "Thank you for your feedback!");
    });
    setFeedbackText("");
    setFeedbackEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [feedbackType, feedbackText, feedbackEmail]);

  const masjidEvents = useMemo(() => {
    if (!selectedMasjid || !events) return [];
    const indices = matchEventsToMasjid(selectedMasjid, events);
    return indices.map(i => events[i]);
  }, [selectedMasjid, events]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithApple();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Sign In Failed", err.message || "Could not sign in with Apple. Please try again.");
      }
    }
  }, [signInWithApple]);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { signOut(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
    ]);
  }, [signOut]);

  const renderMain = () => (
    <>
      {user ? (
        <Pressable
          style={({ pressed }) => [styles.accountCard, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
          onPress={() => { setSection("profile"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.accountAvatar, { backgroundColor: colors.emerald + "20" }]}>
            <Ionicons name="person" size={24} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuLabel, { color: colors.text }]}>{user.displayName || "User"}</Text>
            <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>
              {userStatsQuery.data ? `${userStatsQuery.data.totalRatings} rating${userStatsQuery.data.totalRatings !== 1 ? "s" : ""}` : user.email || "Signed in with Apple"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : Platform.OS !== "web" ? (
        <>
          <Pressable
            style={({ pressed }) => [styles.appleSignInButton, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleSignIn}
            disabled={authLoading}
          >
            <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
            <Text style={styles.appleSignInText}>Sign in with Apple</Text>
          </Pressable>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textTertiary, textAlign: "center", marginTop: 8, marginBottom: 4 }}>
            Sign in to rate and add businesses/restaurants
          </Text>
        </>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
          onPress={async () => {
            if (__DEV__) {
              try { await devSignIn(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) { Alert.alert("Dev Sign-In Failed", String(e)); }
            }
          }}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
            <Ionicons name={__DEV__ ? "code-slash" : "phone-portrait-outline"} size={20} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuLabel, { color: colors.text }]}>{__DEV__ ? "Dev Sign In" : "Sign In"}</Text>
            <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>{__DEV__ ? "Tap to sign in as dev user" : "Use the mobile app to sign in"}</Text>
          </View>
          {__DEV__ && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
        </Pressable>
      )}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>WORSHIP</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("prayerTracker"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="calendar" size={20} color={colors.emerald} />
          {missedPrayerCount > 0 && (
            <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff" }}>{missedPrayerCount}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>{trackerTitle}</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>View your prayer history</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("dhikrCounter"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="counter" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Dhikr Counter</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Track your daily remembrance</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("quranReader"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="book-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Quran</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Read, search & track daily reading</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("personalGrowth"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="trending-up" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Personal Growth</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Prayer trends & Quran reading insights</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("athanAlerts"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="notifications-outline" size={20} color={colors.emerald} />
          {!notificationsEnabled && (
            <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff" }}>!</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Athan & Alerts</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Notifications, calculation & Hijri settings</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <View style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.5 }]}>
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="sunny-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Morning & Evening Adhkar</Text>
          <Text style={[styles.menuSublabel, { color: colors.gold }]}>Coming Soon</Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>COMMUNITY</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("masjids"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="mosque" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Masjid Directory</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Select a masjid for iqamah timings</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("janazaHistory"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="heart-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Janaza History</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Recent janaza announcements</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

    </>
  );

  const renderCalcMethod = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("athanAlerts"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Calculation Method</Text>
      </Pressable>

      {(Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[]).map((key) => {
        const isActive = calcMethod === key;
        return (
          <Pressable
            key={key}
            style={[styles.calcRow, { backgroundColor: isActive ? (isDark ? colors.actionButtonBg : colors.prayerIconBg) : colors.surface, borderColor: colors.border }]}
            onPress={() => { setCalcMethod(key); trackEvent("calc_method_changed", { method: key }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSection("athanAlerts"); }}
          >
            <Text style={[styles.calcText, { color: isActive ? colors.emerald : colors.text }]}>
              {CALC_METHOD_LABELS[key]}
            </Text>
            {isActive ? <Ionicons name="checkmark" size={20} color={colors.emerald} /> : null}
          </Pressable>
        );
      })}
    </>
  );

  const HIJRI_OPTIONS = [
    { value: -1, label: "-1 Day" },
    { value: 0, label: "Default" },
    { value: 1, label: "+1 Day" },
  ] as const;

  const renderAthanAlerts = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Athan & Alerts</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 4 }]}>NOTIFICATIONS</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={handleToggleNotifications}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="notifications-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Adhan Alerts</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Get notified at prayer times</Text>
        </View>
        <View style={[styles.toggle, notificationsEnabled ? { backgroundColor: colors.emerald } : { backgroundColor: colors.border }]}>
          <View style={[styles.toggleKnob, notificationsEnabled ? { transform: [{ translateX: 16 }] } : {}]} />
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={handleToggleIqamaAlerts}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="mosque" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Iqama Alerts</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>10 min before Dhuhr, Asr & Isha iqama</Text>
        </View>
        <View style={[styles.toggle, iqamaAlertsEnabled ? { backgroundColor: colors.emerald } : { backgroundColor: colors.border }]}>
          <View style={[styles.toggleKnob, iqamaAlertsEnabled ? { transform: [{ translateX: 16 }] } : {}]} />
        </View>
      </Pressable>

      <Text style={[styles.settingHint, { color: colors.textTertiary, marginTop: 4 }]}>
        Requires a preferred masjid with iqama timings. Select one from the Masjid Directory.
      </Text>

      {!notificationsEnabled && (
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.gold + "15", marginTop: 12, borderWidth: 1, borderColor: colors.gold + "30" }}
          onPress={async () => {
            if (Platform.OS !== "web") {
              const { status } = await Notifications.getPermissionsAsync();
              if (status === "denied") {
                Linking.openSettings();
              } else {
                handleToggleNotifications();
              }
            } else {
              handleToggleNotifications();
            }
          }}
        >
          <Ionicons name="notifications-off-outline" size={20} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.gold }}>Adhan notifications are off</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              {Platform.OS !== "web" ? "Tap to enable, or open Settings if previously denied." : "Tap to enable prayer time reminders."}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.gold} />
        </Pressable>
      )}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PRAYER CALCULATION</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("calcMethod"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="calculator-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Calculation Method</Text>
          <Text style={[styles.menuSublabel, { color: colors.gold }]}>{CALC_METHOD_LABELS[calcMethod]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SELECT A MADHAB</Text>

      {([
        { key: "standard" as const, label: "Shafi, Maliki, Hanbali" },
        { key: "hanafi" as const, label: "Hanafi" },
      ]).map(({ key, label }, idx) => {
        const isActive = asrCalc === key;
        return (
          <Pressable
            key={key}
            style={[styles.calcRow, { backgroundColor: isActive ? (isDark ? colors.actionButtonBg : colors.prayerIconBg) : colors.surface, borderColor: colors.border }]}
            onPress={() => { setAsrCalc(key); trackEvent("asr_calc_changed", { method: key }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text style={[styles.calcText, { color: isActive ? colors.emerald : colors.text }]}>
              {label}
            </Text>
            {isActive ? <Ionicons name="checkmark" size={20} color={colors.emerald} /> : null}
          </Pressable>
        );
      })}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>HIJRI DATE OFFSET</Text>
      <Text style={[styles.settingHint, { color: colors.textTertiary }]}>
        Adjust the Hijri date if it doesn't match your local moon sighting.
      </Text>

      <View style={[styles.themeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {HIJRI_OPTIONS.map(({ value, label }) => {
          const isActive = hijriOffset === value;
          return (
            <Pressable
              key={value}
              style={[styles.themeOption, isActive && { backgroundColor: colors.emerald }, { flex: 1 }]}
              onPress={() => { setHijriOffset(value); trackEvent("hijri_offset_changed", { offset: value }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.themeOptionText, { color: isActive ? "#fff" : colors.text }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const mapRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      };
    }
    const lats = masjidList.map(m => m.latitude);
    const lngs = masjidList.map(m => m.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * 1.4 + 0.02,
      longitudeDelta: (maxLng - minLng) * 1.4 + 0.02,
    };
  }, [masjidList, userLocation]);

  const handleMapSelectMasjid = useCallback((m: Masjid) => {
    setSelectedMasjid(m);
    setSection("masjidDetail");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const renderMasjids = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Masjid Directory</Text>
      </Pressable>

      <MasjidMap
        masjids={sortedMasjids}
        preferredMasjid={preferredMasjid}
        region={mapRegion}
        hasUserLocation={!!userLocation}
        onSelectMasjid={handleMapSelectMasjid}
        borderColor={colors.border}
        emeraldColor={colors.emerald}
      />

      <View style={styles.mapLegend}>
        <View style={styles.legendItem}>
          <MaterialCommunityIcons name="mosque" size={14} color={colors.gold} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Iqama times available</Text>
        </View>
        <View style={[styles.legendItem, { marginTop: 4 }]}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={[styles.legendText, { color: colors.textTertiary, flex: 1 }]}>Starring a masjid with iqama times will show those times on your Home Screen</Text>
        </View>
      </View>

      {sortedMasjids.map((entry, i) => {
        const masjid = entry.masjid;
        const isPreferred = preferredMasjid === masjid.name;
        const distanceLabel = userLocation && entry.distanceMiles > 0
          ? `${entry.distanceMiles < 10 ? entry.distanceMiles.toFixed(1) : Math.round(entry.distanceMiles)} mi`
          : null;
        return (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.masjidRow, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
            onPress={() => { setSelectedMasjid(masjid); setSection("masjidDetail"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.masjidIcon, { backgroundColor: masjid.hasIqama ? colors.gold + "20" : colors.prayerIconBg }]}>
              <MaterialCommunityIcons name="mosque" size={16} color={masjid.hasIqama ? colors.gold : colors.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.masjidName, { color: colors.text }]} numberOfLines={1}>{masjid.name}</Text>
              <Text style={[styles.masjidAddr, { color: colors.textSecondary }]} numberOfLines={1}>{masjid.address}</Text>
            </View>
            {distanceLabel ? (
              <View style={styles.distanceBadge}>
                <Ionicons name="location-outline" size={12} color={colors.emerald} />
                <Text style={[styles.distanceText, { color: colors.emerald }]}>{distanceLabel}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!isPreferred && !masjid.hasIqama) {
                  Alert.alert(
                    "No Iqama Times Available",
                    `${masjid.name} does not publish iqama times. Your Home Screen will show iqama times from the Islamic Association of Raleigh (IAR) instead.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "OK", onPress: () => { setPreferredMasjid(masjid.name); trackEvent("masjid_selected", { masjid: masjid.name }); } },
                    ]
                  );
                } else {
                  setPreferredMasjid(isPreferred ? null : masjid.name);
                  if (!isPreferred) trackEvent("masjid_selected", { masjid: masjid.name });
                }
              }}
              hitSlop={8}
              style={{ padding: 4, marginRight: 4 }}
            >
              <Ionicons name={isPreferred ? "star" : "star-outline"} size={20} color={isPreferred ? colors.gold : colors.textSecondary} />
            </Pressable>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        );
      })}
    </>
  );

  const renderMasjidDetail = () => {
    if (!selectedMasjid) return null;
    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("masjids"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>Masjid Directory</Text>
        </Pressable>

        <View style={styles.masjidDetailHeader}>
          <View style={[styles.masjidDetailIcon, { backgroundColor: colors.prayerIconBg }]}>
            <MaterialCommunityIcons name="mosque" size={28} color={colors.emerald} />
          </View>
          <Text style={[styles.masjidDetailName, { color: colors.text }]}>{selectedMasjid.name}</Text>
        </View>

        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={styles.detailRow} onPress={() => openMasjidDirections(selectedMasjid.address)}>
            <Ionicons name="location-outline" size={18} color={colors.emerald} />
            <Text style={[styles.detailText, { color: colors.text, flex: 1 }]}>{selectedMasjid.address}</Text>
            <Ionicons name="navigate-outline" size={14} color={colors.gold} />
          </Pressable>
          {selectedMasjid.website ? (
            <Pressable style={styles.detailRow} onPress={() => Linking.openURL(selectedMasjid.website!).catch(() => {})}>
              <Ionicons name="globe-outline" size={18} color={colors.emerald} />
              <Text style={[styles.detailText, { color: colors.gold, flex: 1 }]} numberOfLines={1}>
                {selectedMasjid.website!.replace(/^https?:\/\/(www\.)?/, "")}
              </Text>
              <Ionicons name="open-outline" size={14} color={colors.gold} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>UPCOMING EVENTS</Text>
        {masjidEvents.length > 0 ? masjidEvents.map((ev) => {
          const date = new Date(ev.start);
          const time = ev.isAllDay ? "All Day" : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          return (
            <View key={ev.id} style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.eventBadge, { backgroundColor: isDark ? colors.actionButtonBg : colors.prayerIconBg }]}>
                <Text style={[styles.eventDay, { color: colors.emerald }]}>{date.getDate()}</Text>
                <Text style={[styles.eventMonth, { color: colors.emerald }]}>{date.toLocaleDateString("en-US", { month: "short" })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>{ev.title}</Text>
                <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{time}</Text>
              </View>
            </View>
          );
        }) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No upcoming events</Text>
          </View>
        )}
      </>
    );
  };

  const renderFeedback = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Bug / Feature Request</Text>
      </Pressable>

      <View style={[styles.typeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["bug", "feature"] as const).map((type) => {
          const isActive = feedbackType === type;
          return (
            <Pressable
              key={type}
              style={[styles.typeBtn, isActive && { backgroundColor: colors.emerald }]}
              onPress={() => { setFeedbackType(type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name={type === "bug" ? "bug-outline" : "bulb-outline"} size={16} color={isActive ? "#fff" : colors.textSecondary} />
              <Text style={[styles.typeText, { color: isActive ? "#fff" : colors.text }]}>
                {type === "bug" ? "Bug Report" : "Feature Request"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder={feedbackType === "bug" ? "Describe the bug..." : "Describe the feature..."}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackEmail}
        onChangeText={setFeedbackEmail}
        placeholder="Email (optional)"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Pressable
        style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
        onPress={handleSubmitFeedback}
      >
        <Ionicons name="send" size={16} color="#fff" />
        <Text style={styles.submitText}>Send Feedback</Text>
      </Pressable>
    </>
  );

  const PRAYER_NAMES: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const PRAYER_LABELS: Record<PrayerName, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const calendarDays = useMemo(() => {
    const firstDay = new Date(trackerYear, trackerMonth - 1, 1).getDay();
    const daysInMonth = new Date(trackerYear, trackerMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [trackerYear, trackerMonth]);

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const handlePrevMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDay(null);
    if (trackerMonth === 1) { setTrackerMonth(12); setTrackerYear(y => y - 1); }
    else setTrackerMonth(m => m - 1);
  }, [trackerMonth]);

  const handleNextMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDay(null);
    if (trackerMonth === 12) { setTrackerMonth(1); setTrackerYear(y => y + 1); }
    else setTrackerMonth(m => m + 1);
  }, [trackerMonth]);

  const isRamadan = useMemo(() => {
    const d = new Date();
    const gY = d.getFullYear();
    const gM = d.getMonth() + 1;
    const gD = d.getDate();
    let jd: number;
    if (gM <= 2) {
      const adjY = gY - 1;
      const adjM = gM + 12;
      const A = Math.floor(adjY / 100);
      const B = 2 - A + Math.floor(A / 4);
      jd = Math.floor(365.25 * (adjY + 4716)) + Math.floor(30.6001 * (adjM + 1)) + gD + B - 1524.5;
    } else {
      const A = Math.floor(gY / 100);
      const B = 2 - A + Math.floor(A / 4);
      jd = Math.floor(365.25 * (gY + 4716)) + Math.floor(30.6001 * (gM + 1)) + gD + B - 1524.5;
    }
    const L = Math.floor(jd - 1948439.5) + 10632;
    const N = Math.floor((L - 1) / 10631);
    const Lr = L - 10631 * N + 354;
    const J = Math.floor((10985 - Lr) / 5316) * Math.floor((50 * Lr) / 17719) + Math.floor(Lr / 5670) * Math.floor((43 * Lr) / 15238);
    const Ld = Lr - Math.floor((30 - J) / 15) * Math.floor((17719 * J) / 50) - Math.floor(J / 16) * Math.floor((15238 * J) / 43) + 29;
    const hM = Math.floor((24 * Ld) / 709);
    return hM === 9;
  }, []);

  const trackerTitle = isRamadan ? "Fast & Prayer Tracker" : "Prayer Tracker";

  const renderPrayerTracker = () => {
    const selectedLog = selectedDay ? monthLogs[selectedDay] : null;
    const gcBg = isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)";
    const gcBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)";
    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("main"); setSelectedDay(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>{trackerTitle}</Text>
        </Pressable>

        <>
            {heatmapData.length > 0 && (
              <View style={{ backgroundColor: gcBg, borderRadius: 16, borderWidth: 1, borderColor: gcBorder, padding: 12, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="grid" size={16} color={colors.emerald} />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>Prayer Heatmap</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, marginLeft: "auto" }}>Last 35 days</Text>
                </View>
                {(() => {
                  const labelW = 48;
                  const availableW = screenWidth - 66 - 24 - labelW;
                  const gap = 2;
                  const dotSize = Math.floor((availableW - (34 * gap)) / 35);
                  const clampedDot = Math.min(Math.max(dotSize, 5), 10);
                  return (["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((prayer) => (
                    <View key={prayer} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.textSecondary, width: labelW, textTransform: "capitalize" }}>
                        {prayer}
                      </Text>
                      <View style={{ flexDirection: "row", gap, flexWrap: "nowrap", flex: 1 }}>
                        {heatmapData.map((day, di) => {
                          const status = day[prayer];
                          let dotColor = colors.surfaceSecondary;
                          if (status === 1) dotColor = colors.emerald;
                          else if (status === 2) dotColor = colors.gold;
                          else if (status === 3) dotColor = colors.emerald + "50";
                          else if (status === 4) dotColor = "#EF4444";
                          return (
                            <View
                              key={di}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                maxWidth: clampedDot,
                                maxHeight: clampedDot,
                                borderRadius: 1.5,
                                backgroundColor: dotColor,
                              }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ));
                })()}
                <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {[
                    { color: colors.emerald, label: "On time" },
                    { color: colors.gold, label: "Masjid" },
                    { color: colors.emerald + "50", label: "Made up" },
                    { color: "#EF4444", label: "Excused" },
                    { color: colors.surfaceSecondary, label: "Missed" },
                  ].map(l => (
                    <View key={l.label} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: l.color }} />
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: colors.textSecondary }}>{l.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={[styles.calMonthRow, { backgroundColor: gcBg, borderColor: gcBorder, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }]}>
              <Pressable onPress={handlePrevMonth} hitSlop={12}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={[styles.calMonthText, { color: colors.text }]}>
                {MONTH_NAMES[trackerMonth - 1]} {trackerYear}
              </Text>
              <Pressable onPress={handleNextMonth} hitSlop={12}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={[styles.calGrid, { backgroundColor: gcBg, borderColor: gcBorder, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }]}>
              {DAY_HEADERS.map(d => (
                <View key={d} style={styles.calHeaderCell}>
                  <Text style={[styles.calHeaderText, { color: colors.textSecondary }]}>{d}</Text>
                </View>
              ))}
              {calendarDays.map((day, idx) => {
                if (day === null) return <View key={`e${idx}`} style={styles.calCell} />;
                const dateKey = `${trackerYear}-${String(trackerMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const log = monthLogs[dateKey];
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === selectedDay;
                const isMissedFast = missedFasts.has(dateKey);
                return (
                  <Pressable
                    key={dateKey}
                    style={[
                      styles.calCell,
                      isMissedFast && { backgroundColor: isDark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.12)", borderRadius: 6 },
                      isToday && !isMissedFast && { backgroundColor: isDark ? colors.actionButtonBg : colors.prayerIconBg, borderRadius: 6 },
                      isSelected && { backgroundColor: colors.emerald, borderRadius: 6 },
                    ]}
                    onPress={() => { setSelectedDay(isSelected ? null : dateKey); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    onLongPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      await toggleMissedFast(dateKey);
                      const updated = await getMonthMissedFasts(trackerYear, trackerMonth);
                      setMissedFasts(updated);
                      const updatedLogs = await getMonthLogs(trackerYear, trackerMonth);
                      setMonthLogs(updatedLogs);
                      getMissedPrayerCount().then(setMissedPrayerCount);
                    }}
                    delayLongPress={400}
                  >
                    <Text style={[styles.calDayText, { color: isSelected ? "#fff" : isMissedFast ? "#EF4444" : isToday ? colors.emerald : colors.text }]}>{day}</Text>
                    <View style={styles.calDots}>
                      {log ? PRAYER_NAMES.map(p => {
                        const s = log[p];
                        if (s === 0) return <View key={p} style={[styles.calDot, { backgroundColor: "transparent" }]} />;
                        if (s === 4) return <View key={p} style={[styles.calDot, { backgroundColor: "#EF4444" }]} />;
                        return <View key={p} style={[styles.calDot, { backgroundColor: s === 1 ? colors.gold : s === 3 ? colors.gold + "60" : colors.emerald }]} />;
                      }) : isMissedFast ? (
                        <View style={[styles.calDot, { backgroundColor: "#EF4444", width: 5, height: 5, borderRadius: 2.5 }]} />
                      ) : <View style={{ height: 5 }} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {selectedDay && (
              <View style={[styles.dayDetail, { backgroundColor: gcBg, borderColor: gcBorder, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }]}>
                <Text style={[styles.dayDetailTitle, { color: colors.text }]}>
                  {new Date(trackerYear, trackerMonth - 1, parseInt(selectedDay.split("-")[2])).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Text>
                <Text style={[styles.dayDetailHint, { color: colors.textTertiary }]}>Tap a prayer to update its status</Text>
                {PRAYER_NAMES.map(p => {
                  const status = selectedLog ? selectedLog[p] : 0;
                  const statusLabel = status === 0 ? "Not tracked" : status === 1 ? "Completed" : status === 2 ? "At masjid" : status === 3 ? "Made up" : "Excused";
                  const statusColor = status === 0 ? colors.textTertiary : status === 1 ? colors.gold : status === 2 ? colors.emerald : status === 3 ? colors.gold + "80" : "#EF4444";
                  return (
                    <Pressable
                      key={p}
                      style={({ pressed }) => [styles.dayDetailRow, pressed && { opacity: 0.6 }]}
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const parts = selectedDay.split("-");
                        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        await cyclePrayerStatus(date, p);
                        const updated = await getMonthLogs(trackerYear, trackerMonth);
                        setMonthLogs(updated);
                        getMissedPrayerCount().then(setMissedPrayerCount);
                        getAllLogs().then(allLogs => {
                          const today = new Date();
                          const hData: typeof heatmapData = [];
                          for (let i = 29; i >= 0; i--) {
                            const dd = new Date(today);
                            dd.setDate(dd.getDate() - i);
                            const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
                            const log = allLogs[key];
                            hData.push({ date: key, fajr: log?.fajr ?? 0, dhuhr: log?.dhuhr ?? 0, asr: log?.asr ?? 0, maghrib: log?.maghrib ?? 0, isha: log?.isha ?? 0 });
                          }
                          setHeatmapData(hData);
                        });
                      }}
                    >
                      <View style={[styles.dayDetailDot, { backgroundColor: status === 0 ? colors.border : statusColor }]} />
                      <Text style={[styles.dayDetailPrayer, { color: colors.text }]}>{PRAYER_LABELS[p]}</Text>
                      <Text style={[styles.dayDetailStatus, { color: statusColor }]}>{statusLabel}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={[styles.calLegend, { backgroundColor: gcBg, borderColor: gcBorder }]}>
              {[
                { color: colors.gold, label: "Completed" },
                { color: colors.emerald, label: "At masjid" },
                { color: colors.gold + "60", label: "Made up" },
                { color: "#EF4444", label: isRamadan ? "Missed fast" : "Excused" },
              ].map(l => (
                <View key={l.label} style={styles.calLegendItem}>
                  <View style={[styles.calLegendDot, { backgroundColor: l.color }]} />
                  <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>{l.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.calLegendText, { color: colors.textTertiary, textAlign: "center", marginTop: 6, fontSize: 10 }]}>
              {isRamadan ? "Long-press a day to mark/unmark a missed fast" : "Long-press a day to mark/unmark an excused day"}
            </Text>
          </>

        {showTrackerOnboarding && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24, zIndex: 999 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", borderWidth: 1, borderColor: colors.border }}>
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.emerald + "20", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Ionicons name="grid" size={24} color={colors.emerald} />
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, textAlign: "center" }}>How the Prayer Tracker Works</Text>
              </View>
              <View style={{ gap: 12, marginBottom: 20 }}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <Ionicons name="home-outline" size={18} color={colors.gold} style={{ marginTop: 2 }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                    Tap prayer pills on the Home screen to log prayers — including made up prayers for past times.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <Ionicons name="grid-outline" size={18} color={colors.emerald} style={{ marginTop: 2 }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                    The heatmap shows your prayer consistency over the last 30 days at a glance.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <Ionicons name="calendar-outline" size={18} color={colors.gold} style={{ marginTop: 2 }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                    Tap any day on the calendar to update individual prayer statuses, or long-press to mark {isRamadan ? "a missed fast" : "an excused day"}.
                  </Text>
                </View>
              </View>
              <Pressable
                style={{ backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                onPress={async () => {
                  setShowTrackerOnboarding(false);
                  await AsyncStorage.setItem("prayer_tracker_onboarding_shown", "1.1.1");
                }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF" }}>Got it!</Text>
              </Pressable>
            </View>
          </View>
        )}
      </>
    );
  };

  const handleShareBadge = async (badge: BadgeState) => {
    const def = BADGES.find(b => b.key === badge.key);
    if (!def || !badge.earned) return;
    setSharingBadgeKey(badge.key);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (badgeShareRef.current) {
        const uri = await captureRef(badgeShareRef.current, { format: "png", quality: 1 });
        await Share.share({
          message: `I earned the ${def.title} badge on Salam Y'all! ${def.description}\n\nTrack your prayer progress: https://apps.apple.com/us/app/salam-yall/id6760231963`,
          url: Platform.OS === "ios" ? uri : undefined,
        });
        trackEvent("badge_shared", { badge: badge.key });
      }
    } catch (e) {
      // user cancelled share
    } finally {
      setSharingBadgeKey(null);
    }
  };

  const renderBadgesContent = () => {
    const earnedCount = badgeStates.filter(b => b.earned).length;
    return (
      <>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gold + "20", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Ionicons name="trophy" size={32} color={colors.gold} />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>{earnedCount} / {BADGES.length}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Badges Earned</Text>
        </View>

        {badgeStates.map((badge) => {
          const def = BADGES.find(b => b.key === badge.key)!;
          const isNew = newBadgeKey === badge.key;
          return (
            <View
              key={badge.key}
              style={[
                {
                  backgroundColor: badge.earned ? colors.surface : colors.surfaceSecondary,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isNew ? colors.gold : badge.earned ? colors.border : colors.border + "80",
                  padding: 16,
                  marginBottom: 12,
                  opacity: badge.earned ? 1 : 0.6,
                },
                isNew && { shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: badge.earned ? colors.gold + "20" : colors.textTertiary + "15",
                  alignItems: "center", justifyContent: "center", marginRight: 14,
                }}>
                  <Ionicons
                    name={def.icon as any}
                    size={24}
                    color={badge.earned ? colors.gold : colors.textTertiary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: badge.earned ? colors.text : colors.textTertiary }}>
                    {def.title}
                    {isNew && <Text style={{ color: colors.gold }}> NEW!</Text>}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: badge.earned ? colors.textSecondary : colors.textTertiary, marginTop: 2 }}>
                    {def.description}
                  </Text>
                  {badge.earned && badge.earnedAt && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                      {badge.key === "tasbeeh_fatima" && badge.progress > 0
                        ? `Completed ${badge.progress} time${badge.progress === 1 ? "" : "s"} · First on ${badge.earnedAt}`
                        : `Earned ${badge.earnedAt}`}
                    </Text>
                  )}
                </View>
                {badge.earned ? (
                  <Pressable
                    onPress={() => handleShareBadge(badge)}
                    hitSlop={8}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name="share-outline" size={20} color={colors.emerald} />
                  </Pressable>
                ) : (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textTertiary }}>
                      {badge.progress}/{badge.total}
                    </Text>
                    <View style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: colors.textTertiary + "20", marginTop: 4, overflow: "hidden" }}>
                      <View style={{ width: `${Math.min(100, (badge.progress / badge.total) * 100)}%` as any, height: "100%", backgroundColor: colors.gold, borderRadius: 2 }} />
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {sharingBadgeKey && (() => {
          const def = BADGES.find(b => b.key === sharingBadgeKey)!;
          const badge = badgeStates.find(b => b.key === sharingBadgeKey);
          return (
            <View style={{ position: "absolute", left: -9999, top: 0 }}>
              <ViewShot ref={badgeShareRef as any} options={{ format: "png", quality: 1 }}>
                <View style={{ width: 400, padding: 32, backgroundColor: "#0A1A0F", alignItems: "center", borderRadius: 20 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#D4AF37", letterSpacing: 2, marginBottom: 16 }}>SALAM Y'ALL</Text>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#D4AF3720", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <Ionicons name={def.icon as any} size={40} color="#D4AF37" />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFFFFF", textAlign: "center" }}>{def.title}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#FFFFFFAA", textAlign: "center", marginTop: 8 }}>{def.description}</Text>
                  {user?.displayName && (
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#10B981", marginTop: 16 }}>Earned by {user.displayName}</Text>
                  )}
                  {badge?.earnedAt && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#FFFFFF66", marginTop: 6 }}>{badge.earnedAt}</Text>
                  )}
                </View>
              </ViewShot>
            </View>
          );
        })()}
      </>
    );
  };

  const renderDhikrCounter = () => {
    const selected = DHIKR_PRESETS.find(d => d.id === selectedDhikrId) || DHIKR_PRESETS[0];
    const count = dhikrCounts[selectedDhikrId] ?? 0;
    const goalReached = selected.goal ? count >= selected.goal : false;
    const progress = selected.goal ? Math.min(count / selected.goal, 1) : 0;

    const handleTap = async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const updated = await incrementDhikr(new Date(), selectedDhikrId);
        setDhikrCounts(updated);
        trackEvent("dhikr_increment", { dhikr: selectedDhikrId });
      } catch {
        setDhikrCounts(prev => ({ ...prev, [selectedDhikrId]: (prev[selectedDhikrId] ?? 0) + 1 }));
      }
    };

    const handleReset = () => {
      Alert.alert("Reset Counter", `Reset ${selected.transliteration} count to 0?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              const updated = await resetDhikr(new Date(), selectedDhikrId);
              setDhikrCounts(updated);
            } catch {
              setDhikrCounts(prev => ({ ...prev, [selectedDhikrId]: 0 }));
            }
          },
        },
      ]);
    };

    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>Dhikr Counter</Text>
        </Pressable>

        <Pressable
          onPress={handleTap}
          onLongPress={handleReset}
          style={({ pressed }) => [
            {
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              borderRadius: 24,
              backgroundColor: goalReached ? colors.emerald + "15" : colors.surface,
              borderWidth: 1,
              borderColor: goalReached ? colors.emerald + "40" : colors.border,
              marginBottom: 24,
            },
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={{ fontSize: 24, color: colors.text, marginBottom: 8, textAlign: "center" as const }}>
            {selected.arabic}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginBottom: 20 }}>
            {selected.transliteration}
          </Text>
          <Text style={{ fontSize: 64, fontFamily: "Inter_700Bold", color: goalReached ? colors.emerald : colors.gold, marginBottom: 4 }}>
            {count}
          </Text>
          {selected.goal ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 120, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" as const }}>
                <View style={{ width: `${progress * 100}%` as any, height: 6, borderRadius: 3, backgroundColor: goalReached ? colors.emerald : colors.gold }} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textTertiary }}>
                {goalReached ? "Done!" : `${count}/${selected.goal}`}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textTertiary }}>Free count</Text>
          )}
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textTertiary, marginTop: 16 }}>
            Tap to count · Long press to reset
          </Text>
        </Pressable>

        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center" as const, marginBottom: 16 }}>
          {selected.translation}
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SELECT DHIKR</Text>
        {DHIKR_PRESETS.map((item) => {
          const itemCount = dhikrCounts[item.id] ?? 0;
          const isActive = item.id === selectedDhikrId;
          const itemGoalReached = item.goal ? itemCount >= item.goal : false;
          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: isActive ? colors.prayerIconBg : (pressed ? colors.surfaceSecondary : colors.surface),
                  borderColor: isActive ? colors.emerald + "40" : colors.border,
                },
              ]}
              onPress={() => {
                setSelectedDhikrId(item.id);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.menuIcon, { backgroundColor: itemGoalReached ? colors.emerald + "20" : colors.prayerIconBg }]}>
                {itemGoalReached ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                ) : (
                  <MaterialCommunityIcons name="counter" size={20} color={colors.emerald} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.transliteration}</Text>
                <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>
                  {item.goal ? `${itemCount}/${item.goal}` : `${itemCount} counted`}
                </Text>
              </View>
              {isActive && <Ionicons name="radio-button-on" size={20} color={colors.emerald} />}
            </Pressable>
          );
        })}
      </>
    );
  };

  const renderProfile = () => {
    const stats = userStatsQuery.data;
    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("main"); setVotingId(null); setVoteStatus(null); setVoteDescription(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>My Profile</Text>
        </Pressable>

        <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
          <View style={[styles.accountAvatar, { backgroundColor: colors.emerald + "20" }]}>
            <Ionicons name="person" size={24} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuLabel, { color: colors.text }]}>{user?.displayName || "User"}</Text>
            <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>{user?.email || "Signed in with Apple"}</Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: colors.emerald }}>{stats?.restaurantRatings ?? 0}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Restaurant Ratings</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: colors.emerald }}>{stats?.businessRatings ?? 0}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Business Ratings</Text>
          </View>
        </View>

        {badgeStates.length > 0 && (() => {
          const earned = badgeStates.filter(b => b.earned);
          return (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PRAYER BADGES</Text>
              {earned.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                  {earned.map((badge) => {
                    const def = BADGES.find(b => b.key === badge.key)!;
                    return (
                      <View key={badge.key} style={{ alignItems: "center", width: 72 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold + "20", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                          <Ionicons name={def.icon as any} size={22} color={colors.gold} />
                        </View>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: colors.text, textAlign: "center" }} numberOfLines={1}>{def.title}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textTertiary, marginBottom: 16 }}>
                  No badges earned yet. Track prayers to unlock achievements!
                </Text>
              )}
              <Pressable
                style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border, marginBottom: 16 }]}
                onPress={() => { setSection("personalGrowth"); setGrowthTab("badges"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.gold + "20" }]}>
                  <Ionicons name="trophy" size={18} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: colors.text }]}>View All Badges</Text>
                  <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>{earned.length}/{BADGES.length} earned</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            </>
          );
        })()}

        {stats && stats.ratingHistory.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 8 }]}>RATING HISTORY</Text>
            {stats.ratingHistory.map((r, i) => (
              <Pressable
                key={i}
                style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setPendingTarget({ type: r.entityType === "restaurant" ? "restaurant" : "business", id: String(r.entityId) });
                  router.navigate(r.entityType === "restaurant" ? "/(tabs)/halal" : "/(tabs)/businesses");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
                  <Ionicons name={r.entityType === "restaurant" ? "restaurant-outline" : "storefront-outline"} size={18} color={colors.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: colors.text }]}>{r.name || "Unknown"}</Text>
                  <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name={s <= r.rating ? "star" : "star-outline"} size={14} color={s <= r.rating ? colors.gold : colors.textTertiary} />
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </>
        )}
      </>
    );
  };

  const janazaHistoryQuery = useQuery<{ id: number; masjid_name: string; details: string; created_at: string }[]>({
    queryKey: ["/api/janaza-history"],
    enabled: section === "janazaHistory",
  });

  const renderJanazaHistory = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Janaza History</Text>
      </Pressable>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 20, lineHeight: 18 }}>
        Inna Lillahi wa Inna Ilayhi Raji'un. Recent janaza announcements from our community.
      </Text>
      {janazaHistoryQuery.isLoading && (
        <Text style={{ color: colors.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 40 }}>Loading...</Text>
      )}
      {janazaHistoryQuery.data && janazaHistoryQuery.data.length === 0 && (
        <View style={{ alignItems: "center", marginTop: 40 }}>
          <Ionicons name="heart-outline" size={40} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 12, textAlign: "center" }}>
            No janaza announcements yet
          </Text>
        </View>
      )}
      {(janazaHistoryQuery.data || []).map((alert) => {
        const date = new Date(alert.created_at);
        const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " at " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return (
          <View key={alert.id} style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", alignItems: "flex-start", paddingVertical: 14 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <MaterialCommunityIcons name="mosque" size={16} color={colors.emerald} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text, marginLeft: 8 }}>{alert.masjid_name}</Text>
            </View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{alert.details}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, marginTop: 8 }}>{formatted}</Text>
          </View>
        );
      })}
    </>
  );

  const [growthData, setGrowthData] = useState<{
    quranStreak: number;
    quranConsistency: number;
    quranTotalDays: number;
    khatamProgress: number;
    nextBadge: { title: string; progress: number; total: number; remaining: number } | null;
    prayerStreak: number;
    totalPrayed: number;
    totalMasjid: number;
    totalElapsed: number;
    prayedPct: number;
    masjidPct: number;
  } | null>(null);

  useEffect(() => {
    if (section === "personalGrowth") {
      (async () => {
        try {
          const prayerRaw = await AsyncStorage.getItem("prayer_tracker");
          const prayerData: { [dateKey: string]: DayLog } = prayerRaw ? JSON.parse(prayerRaw) : {};

          const today = new Date();

          let totalPrayed = 0;
          let totalMasjid = 0;
          let totalExcused = 0;
          let totalDaysWithData = 0;
          const pNames: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
          for (const [, log] of Object.entries(prayerData)) {
            let dayHasData = false;
            for (const p of pNames) {
              if (log[p] === 1 || log[p] === 3) { totalPrayed++; dayHasData = true; }
              else if (log[p] === 2) { totalPrayed++; totalMasjid++; dayHasData = true; }
              else if (log[p] === 4) { totalExcused++; dayHasData = true; }
            }
            if (dayHasData) totalDaysWithData++;
          }
          const totalElapsed = Math.max(0, totalDaysWithData * 5 - totalExcused);
          const prayedPct = totalElapsed > 0 ? Math.round((totalPrayed / totalElapsed) * 100) : 0;
          const masjidPct = totalElapsed > 0 ? Math.round((totalMasjid / totalElapsed) * 100) : 0;

          const prayerStreak = await getPrayerStreak();

          const quranStreak = await getReadingStreak();
          const quranDates = await getReadingDates();
          const last30 = new Set<string>();
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (quranDates.includes(key)) last30.add(key);
          }
          const quranConsistency = Math.round((last30.size / 30) * 100);

          const khatam = await getKhatamProgress();
          const khatamProgress = khatam.completedCount;

          const { badges } = await computeBadges();
          const unearnedBadges = badges.filter(b => !b.earned && b.total > 0);
          let nextBadge: { title: string; progress: number; total: number; remaining: number } | null = null;
          if (unearnedBadges.length > 0) {
            const closest = unearnedBadges.reduce((best, b) => {
              const ratio = b.progress / b.total;
              const bestRatio = best.progress / best.total;
              return ratio > bestRatio ? b : best;
            });
            const def = BADGES.find(b => b.key === closest.key);
            if (def) {
              nextBadge = {
                title: def.title,
                progress: closest.progress,
                total: closest.total,
                remaining: closest.total - closest.progress,
              };
            }
          }

          setGrowthData({
            quranStreak,
            quranConsistency,
            quranTotalDays: quranDates.length,
            khatamProgress,
            nextBadge,
            prayerStreak,
            totalPrayed,
            totalMasjid,
            totalElapsed,
            prayedPct,
            masjidPct,
          });
        } catch {}
      })();
    }
  }, [section]);

  const renderPersonalGrowth = () => {
    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("main"); setGrowthTab("statistics"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>Personal Growth</Text>
        </Pressable>

        <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4, marginBottom: 16 }}>
          {(["statistics", "badges"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => { setGrowthTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (tab === "badges") trackEvent("badges_opened"); }}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                backgroundColor: growthTab === tab ? colors.emerald : "transparent",
              }}
            >
              <Text style={{
                fontFamily: "Inter_600SemiBold", fontSize: 14,
                color: growthTab === tab ? "#FFFFFF" : colors.textSecondary,
              }}>
                {tab === "statistics" ? "Statistics" : "Badges"}
              </Text>
            </Pressable>
          ))}
        </View>

        {growthTab === "badges" && renderBadgesContent()}

        {growthTab === "statistics" && (
          !growthData ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary }}>Loading insights...</Text>
            </View>
          ) : (
            <>
              <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Ionicons name="moon" size={18} color={colors.emerald} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>Prayer Statistics</Text>
                </View>

                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.gold }}>{growthData.prayedPct}%</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Completion</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>{growthData.totalPrayed}/{growthData.totalElapsed}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.emerald }}>{growthData.masjidPct}%</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>At Masjid</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>{growthData.totalMasjid}/{growthData.totalElapsed}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text }}>{growthData.prayerStreak}</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Day Streak</Text>
                  </View>
                </View>
              </View>

              <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Ionicons name="book-outline" size={18} color={colors.gold} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>Quran Reading</Text>
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.gold }}>{growthData.quranStreak}</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Day Streak</Text>
                  </View>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.emerald }}>{growthData.quranConsistency}%</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>30-Day Consistency</Text>
                  </View>
                  <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text }}>{growthData.quranTotalDays}</Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Total Days</Text>
                  </View>
                </View>

                <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceSecondary }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>Khatm Progress</Text>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.gold }}>{growthData.khatamProgress}/114</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.textTertiary + "20", overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.min(100, (growthData.khatamProgress / 114) * 100)}%` as any, backgroundColor: colors.gold, borderRadius: 3 }} />
                  </View>
                </View>
              </View>

              {growthData.nextBadge && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Ionicons name="ribbon" size={18} color={colors.gold} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>Next Badge</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text, marginBottom: 8 }}>
                    {growthData.nextBadge.title}
                  </Text>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.textTertiary + "20", overflow: "hidden", marginBottom: 8 }}>
                    <View style={{ height: "100%", width: `${Math.min(100, (growthData.nextBadge.progress / growthData.nextBadge.total) * 100)}%` as any, backgroundColor: colors.gold, borderRadius: 4 }} />
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary }}>
                    {growthData.nextBadge.progress}/{growthData.nextBadge.total} — {growthData.nextBadge.remaining} more to go!
                  </Text>
                </View>
              )}

              <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.emerald + "12", marginBottom: 16 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.emerald, textAlign: "center", lineHeight: 20 }}>
                  {growthData.quranStreak >= 7
                    ? "MashaAllah! Your consistency with the Quran is inspiring."
                    : growthData.quranStreak >= 3
                      ? `Keep going — ${7 - growthData.quranStreak} more days to your Daily Reader badge!`
                      : growthData.totalPrayed > 0
                        ? "Every prayer counts. You're building a beautiful habit."
                        : "Start tracking today — small steps lead to great rewards."}
                </Text>
              </View>
            </>
          )
        )}
      </>
    );
  };

  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        {section === "quranReader" ? (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }}>
            <Pressable onPress={() => setSection("main")} style={{ marginRight: 8 }}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFFFFF" }}>Quran</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }}>
              <View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Worship</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                  Your spiritual tools
                </Text>
              </View>
            </View>
            <TickerBanner />
          </>
        )}
      </GlassHeader>
      <Animated.View
        style={{ flex: 1, transform: [{ translateX: section !== "main" ? swipeAnim : 0 }] }}
        {...(section !== "main" ? swipePanResponder.panHandlers : {})}
      >
        {section === "quranReader" ? (
          <View style={{ flex: 1, padding: 20, paddingTop: headerHeight + 12, paddingBottom: Platform.OS === "web" ? 34 : 100 }}>
            <QuranReader ref={quranReaderRef} colors={colors} onBack={() => setSection("main")} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: headerHeight + 12, paddingBottom: Platform.OS === "web" ? 34 : 100 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {section === "main" && renderMain()}
            {section === "athanAlerts" && renderAthanAlerts()}
            {section === "calcMethod" && renderCalcMethod()}
            {section === "masjids" && renderMasjids()}
            {section === "masjidDetail" && renderMasjidDetail()}
            {section === "feedback" && renderFeedback()}
            {section === "prayerTracker" && renderPrayerTracker()}
            {section === "dhikrCounter" && renderDhikrCounter()}
            {section === "janazaHistory" && renderJanazaHistory()}
            {section === "profile" && renderProfile()}
            {section === "personalGrowth" && renderPersonalGrowth()}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  backLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  menuSublabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  settingHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginBottom: 10,
    marginTop: -4,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    padding: 2,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  themeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  themeOptionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  calcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  calcText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  masjidRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  masjidIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  masjidName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  masjidAddr: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  masjidDetailHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  masjidDetailIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  masjidDetailName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    gap: 12,
  },
  eventBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  eventDay: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  eventMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  eventTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  typeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  typeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  textArea: {
    height: 120,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 30,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row" as const,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center" as const,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  statPct: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center" as const,
  },
  statSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  attributionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  attributionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 14,
  },
  attributionDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  attributionName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  attributionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  calMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  calMonthText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 8,
  },
  calHeaderCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 3,
  },
  calHeaderText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  calCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 4,
    minHeight: 38,
    justifyContent: "center",
  },
  calDayText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  calDots: {
    flexDirection: "row",
    gap: 1.5,
    marginTop: 2,
    height: 5,
    alignItems: "center",
  },
  calDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  dayDetail: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  dayDetailTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  dayDetailHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  dayDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  dayDetailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  dayDetailPrayer: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  dayDetailStatus: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  calLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    flexWrap: "wrap",
  },
  calLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  calLegendText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: "#1B6B4A",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbActive: {
    alignSelf: "flex-end" as const,
  },
  distanceBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(27, 107, 74, 0.1)",
  },
  distanceText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mapLegend: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 12,
    marginTop: -8,
  },
  legendItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  accountCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
  },
  accountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  appleSignInButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#000000",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  appleSignInText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
