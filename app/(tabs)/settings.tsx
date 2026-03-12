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
  Image,
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
import { useRouter } from "expo-router";
import { useDeepLink } from "@/lib/deeplink-context";
import { getMonthLogs, cyclePrayerStatus, getMonthMissedFasts, toggleMissedFast, type DayLog, type PrayerName } from "@/lib/prayer-tracker";
import { trackEvent, trackScreenView } from "@/lib/analytics";
import { MasjidMap } from "@/components/MasjidMap";
import { computeBadges, BADGES, type BadgeState } from "@/lib/prayer-badges";
import ViewShot, { captureRef } from "react-native-view-shot";
import { useRef } from "react";

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

type SettingsSection = "main" | "calcMethod" | "masjids" | "masjidDetail" | "feedback" | "prayerTracker" | "janazaHistory" | "profile";
type TrackerTab = "calendar" | "badges";

export default function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode, ramadanMode, setRamadanMode } = useTheme();
  const router = useRouter();
  const { calcMethod, setCalcMethod, notificationsEnabled, setNotificationsEnabled, preferredMasjid, setPreferredMasjid } = useSettings();
  const { user, signInWithApple, devSignIn, signOut, isLoading: authLoading, getAuthHeaders } = useAuth();
  const qc = useQueryClient();
  const [section, setSection] = useState<SettingsSection>("main");
  const [selectedMasjid, setSelectedMasjid] = useState<Masjid | null>(null);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  const { consumeTarget, setPendingTarget } = useDeepLink();

  useEffect(() => { trackScreenView("Settings"); }, []);

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
  const badgeShareRef = useRef<ViewShot | null>(null);
  const [sharingBadgeKey, setSharingBadgeKey] = useState<string | null>(null);
  const [trackerTab, setTrackerTab] = useState<TrackerTab>("calendar");

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
    }
  }, [section, trackerYear, trackerMonth]);

  useEffect(() => {
    if (section === "prayerTracker" || section === "profile") {
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

  const pendingSubmissionsQuery = useQuery<Array<{
    id: number; name: string | null; google_maps_url: string; address: string | null;
    vote_count: number; user_vote: string | null; created_at: string;
  }>>({
    queryKey: ["/api/restaurant-submissions/pending"],
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/restaurant-submissions/pending", baseUrl).toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const [votingId, setVotingId] = useState<number | null>(null);
  const [voteStatus, setVoteStatus] = useState<string | null>(null);
  const [voteDescription, setVoteDescription] = useState("");

  const handleVote = useCallback(async (submissionId: number, halalStatus: string, desc: string) => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL(`/api/restaurant-submissions/${submissionId}/vote`, baseUrl).toString(), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ halalStatus, description: desc.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        qc.invalidateQueries({ queryKey: ["/api/restaurant-submissions/pending"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setVotingId(null);
        setVoteStatus(null);
        setVoteDescription("");
        if (data.autoApproved) {
          Alert.alert("Restaurant Approved!", "This restaurant received enough votes and has been added to Halal Eats.");
        }
      }
    } catch {
      Alert.alert("Error", "Failed to submit vote. Please try again.");
    }
  }, [getAuthHeaders, qc]);

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

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("prayerTracker"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="calendar" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Prayer Tracker</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>View your prayer history</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

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

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PRAYER</Text>

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

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>APPEARANCE</Text>
      <View style={[styles.themeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["system", "light", "dark"] as const).map((mode) => {
          const isActive = themeMode === mode;
          const icons = { system: "phone-portrait-outline", light: "sunny-outline", dark: "moon-outline" } as const;
          const labels = { system: "System", light: "Light", dark: "Dark" };
          return (
            <Pressable
              key={mode}
              style={[styles.themeOption, isActive && { backgroundColor: colors.emerald }]}
              onPress={() => { setThemeMode(mode); trackEvent("theme_changed", { theme: mode }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name={icons[mode]} size={16} color={isActive ? "#fff" : colors.textSecondary} />
              <Text style={[styles.themeOptionText, { color: isActive ? "#fff" : colors.text }]}>{labels[mode]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border, marginTop: 10 }]}
        onPress={() => { setRamadanMode(!ramadanMode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: ramadanMode ? "#6B3FA020" : colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="moon-waning-crescent" size={20} color={ramadanMode ? "#6B3FA0" : colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Ramadan Mode</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Purple theme for the blessed month</Text>
        </View>
        <View style={[styles.toggleTrack, ramadanMode && styles.toggleTrackActive, ramadanMode && { backgroundColor: "#6B3FA0" }]}>
          <View style={[styles.toggleThumb, ramadanMode && styles.toggleThumbActive]} />
        </View>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LEGAL / APPLICATION</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/privacy")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Privacy Policy</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/support")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="help-circle-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Support</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("feedback"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Bug / Feature Request</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ATTRIBUTIONS</Text>

      <View style={[styles.attributionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable style={styles.attributionRow} onPress={() => Linking.openURL("https://halaleatsnc.com")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg, marginRight: 0 }]}>
            <Ionicons name="restaurant-outline" size={18} color="#DC2626" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.attributionName, { color: colors.text }]}>HalalEats NC</Text>
            <Text style={[styles.attributionDesc, { color: colors.textSecondary }]}>Halal restaurant directory for North Carolina</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
        <View style={[styles.attributionDivider, { backgroundColor: colors.divider }]} />
        <Pressable style={styles.attributionRow} onPress={() => Linking.openURL("https://www.nctrianglemuslims.org")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg, marginRight: 0 }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.attributionName, { color: colors.text }]}>NC Triangle Muslims</Text>
            <Text style={[styles.attributionDesc, { color: colors.textSecondary }]}>Community events and gatherings</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={[styles.versionText, { color: colors.textTertiary }]}>Salam Y'all v1.1</Text>
    </>
  );

  const renderCalcMethod = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Calculation Method</Text>
      </Pressable>

      {(Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[]).map((key) => {
        const isActive = calcMethod === key;
        return (
          <Pressable
            key={key}
            style={[styles.calcRow, { backgroundColor: isActive ? (isDark ? colors.actionButtonBg : colors.prayerIconBg) : colors.surface, borderColor: colors.border }]}
            onPress={() => { setCalcMethod(key); trackEvent("calc_method_changed", { method: key }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSection("main"); }}
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
                setPreferredMasjid(isPreferred ? null : masjid.name);
                if (!isPreferred) trackEvent("masjid_selected", { masjid: masjid.name });
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

  const trackerStats = useMemo(() => {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentHour = now.getHours();
    const daysInMonth = new Date(trackerYear, trackerMonth, 0).getDate();

    const isFutureMonth = trackerYear > currentYear || (trackerYear === currentYear && trackerMonth > currentMonth);
    if (isFutureMonth) {
      return { prayedCount: 0, masjidCount: 0, elapsedPrayers: 0, prayedPct: 0, masjidPct: 0 };
    }

    const isCurrentMonth = trackerYear === currentYear && trackerMonth === currentMonth;
    const fullDays = isCurrentMonth ? Math.max(0, currentDay - 1) : daysInMonth;

    let missedFastFullDays = 0;
    for (let d = 1; d <= (isCurrentMonth ? Math.max(0, currentDay - 1) : daysInMonth); d++) {
      const dateKey = `${trackerYear}-${String(trackerMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (missedFasts.has(dateKey)) missedFastFullDays++;
    }

    let todayElapsedPrayers = 0;
    let todayIsMissedFast = false;
    if (isCurrentMonth) {
      const todayDateKey = `${trackerYear}-${String(trackerMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;
      todayIsMissedFast = missedFasts.has(todayDateKey);
      if (!todayIsMissedFast) {
        if (currentHour >= 5) todayElapsedPrayers++;
        if (currentHour >= 13) todayElapsedPrayers++;
        if (currentHour >= 16) todayElapsedPrayers++;
        if (currentHour >= 18) todayElapsedPrayers++;
        if (currentHour >= 20) todayElapsedPrayers++;
      }
    }

    const elapsedPrayers = ((fullDays - missedFastFullDays) * 5) + todayElapsedPrayers;

    let prayedCount = 0;
    let masjidCount = 0;
    const countDays = isCurrentMonth ? currentDay : daysInMonth;

    for (let d = 1; d <= countDays; d++) {
      const dateKey = `${trackerYear}-${String(trackerMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (missedFasts.has(dateKey)) continue;
      const log = monthLogs[dateKey];
      if (log) {
        for (const p of PRAYER_NAMES) {
          if (log[p] === 1) prayedCount++;
          if (log[p] === 2) { prayedCount++; masjidCount++; }
        }
      }
    }

    const prayedPct = elapsedPrayers > 0 ? Math.round((prayedCount / elapsedPrayers) * 100) : 0;
    const masjidPct = elapsedPrayers > 0 ? Math.round((masjidCount / elapsedPrayers) * 100) : 0;

    return { prayedCount, masjidCount, elapsedPrayers, prayedPct, masjidPct };
  }, [monthLogs, missedFasts, trackerYear, trackerMonth, now]);

  const renderPrayerTracker = () => {
    const selectedLog = selectedDay ? monthLogs[selectedDay] : null;
    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("main"); setSelectedDay(null); setTrackerTab("calendar"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>Prayer Tracker</Text>
        </Pressable>

        <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4, marginBottom: 16 }}>
          {(["calendar", "badges"] as TrackerTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => { setTrackerTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (tab === "badges") trackEvent("badges_opened"); }}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                backgroundColor: trackerTab === tab ? colors.emerald : "transparent",
              }}
            >
              <Text style={{
                fontFamily: "Inter_600SemiBold", fontSize: 14,
                color: trackerTab === tab ? "#FFFFFF" : colors.textSecondary,
              }}>
                {tab === "calendar" ? "Calendar" : "Badges"}
              </Text>
            </Pressable>
          ))}
        </View>

        {trackerTab === "badges" && renderBadgesContent()}

        {trackerTab === "calendar" && trackerStats.elapsedPrayers > 0 && (
          <View style={[styles.statsRow, { marginBottom: 12 }]}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statCircle, { borderColor: colors.gold }]}>
                <Text style={[styles.statPct, { color: colors.gold }]}>{trackerStats.prayedPct}%</Text>
              </View>
              <Text style={[styles.statLabel, { color: colors.text }]}>Prayers Completed</Text>
              <Text style={[styles.statSub, { color: colors.textSecondary }]}>{trackerStats.prayedCount} of {trackerStats.elapsedPrayers}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statCircle, { borderColor: colors.emerald }]}>
                <Text style={[styles.statPct, { color: colors.emerald }]}>{trackerStats.masjidPct}%</Text>
              </View>
              <Text style={[styles.statLabel, { color: colors.text }]}>At the Masjid</Text>
              <Text style={[styles.statSub, { color: colors.textSecondary }]}>{trackerStats.masjidCount} of {trackerStats.elapsedPrayers}</Text>
            </View>
          </View>
        )}

        {trackerTab === "calendar" && (
          <>
            <View style={[styles.calMonthRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable onPress={handlePrevMonth} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={[styles.calMonthText, { color: colors.text }]}>
                {MONTH_NAMES[trackerMonth - 1]} {trackerYear}
              </Text>
              <Pressable onPress={handleNextMonth} hitSlop={12}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={[styles.calGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                      isMissedFast && { backgroundColor: isDark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.12)", borderRadius: 8 },
                      isToday && !isMissedFast && { backgroundColor: isDark ? colors.actionButtonBg : colors.prayerIconBg, borderRadius: 8 },
                      isSelected && { backgroundColor: colors.emerald, borderRadius: 8 },
                    ]}
                    onPress={() => { setSelectedDay(isSelected ? null : dateKey); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    onLongPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      await toggleMissedFast(dateKey);
                      const updated = await getMonthMissedFasts(trackerYear, trackerMonth);
                      setMissedFasts(updated);
                    }}
                    delayLongPress={400}
                  >
                    <Text style={[styles.calDayText, { color: isSelected ? "#fff" : isMissedFast ? "#EF4444" : isToday ? colors.emerald : colors.text }]}>{day}</Text>
                    <View style={styles.calDots}>
                      {isMissedFast ? (
                        <View style={[styles.calDot, { backgroundColor: "#EF4444", width: 6, height: 6, borderRadius: 3 }]} />
                      ) : log ? PRAYER_NAMES.map(p => {
                        const s = log[p];
                        if (s === 0) return <View key={p} style={[styles.calDot, { backgroundColor: "transparent" }]} />;
                        return <View key={p} style={[styles.calDot, { backgroundColor: s === 1 ? colors.gold : colors.emerald }]} />;
                      }) : <View style={{ height: 6 }} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {selectedDay && (
              <View style={[styles.dayDetail, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.dayDetailTitle, { color: colors.text }]}>
                  {new Date(trackerYear, trackerMonth - 1, parseInt(selectedDay.split("-")[2])).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Text>
                <Text style={[styles.dayDetailHint, { color: colors.textTertiary }]}>Tap a prayer to update its status</Text>
                {PRAYER_NAMES.map(p => {
                  const status = selectedLog ? selectedLog[p] : 0;
                  const statusLabel = status === 0 ? "Not tracked" : status === 1 ? "Completed" : "At masjid";
                  const statusColor = status === 0 ? colors.textTertiary : status === 1 ? colors.gold : colors.emerald;
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

            <View style={[styles.calLegend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.calLegendItem}>
                <View style={[styles.calLegendDot, { backgroundColor: colors.gold }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>Completed</Text>
              </View>
              <View style={styles.calLegendItem}>
                <View style={[styles.calLegendDot, { backgroundColor: colors.emerald }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>At masjid</Text>
              </View>
              <View style={styles.calLegendItem}>
                <View style={[styles.calLegendDot, { backgroundColor: "#EF4444" }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>Missed fast</Text>
              </View>
            </View>
            <Text style={[styles.calLegendText, { color: colors.textTertiary, textAlign: "center", marginTop: 8, fontSize: 11 }]}>
              Long-press a day to mark/unmark a missed fast
            </Text>
          </>
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
                      Earned {badge.earnedAt}
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

  const renderProfile = () => {
    const stats = userStatsQuery.data;
    const pending = (pendingSubmissionsQuery.data || []).filter(s => !s.user_vote);
    const statusChips: { key: string; label: string; color: string; icon: string }[] = [
      { key: "halal", label: "Halal", color: "#2E7D32", icon: "checkmark-circle" },
      { key: "partial", label: "Partial", color: "#F57C00", icon: "alert-circle" },
      { key: "not_halal", label: "Not Halal", color: "#C62828", icon: "close-circle" },
    ];
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
                onPress={() => { setSection("prayerTracker"); setTrackerTab("badges"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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

        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>HELP VERIFY</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
              Can you help us verify these restaurants are halal?
            </Text>
            {pending.map((sub) => (
              <View key={sub.id} style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", alignItems: "stretch", paddingVertical: 14 }]}>
                <Pressable onPress={() => { setVotingId(votingId === sub.id ? null : sub.id); setVoteStatus(null); setVoteDescription(""); }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="restaurant-outline" size={18} color={colors.emerald} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>{sub.name || "Unknown Restaurant"}</Text>
                      {sub.address ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>{sub.address}</Text> : null}
                    </View>
                    <View style={{ backgroundColor: colors.emerald + "20", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.emerald }}>{sub.vote_count} vote{parseInt(String(sub.vote_count)) !== 1 ? "s" : ""}</Text>
                    </View>
                  </View>
                </Pressable>
                {votingId === sub.id && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {statusChips.map((chip) => (
                        <Pressable
                          key={chip.key}
                          onPress={() => { setVoteStatus(chip.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          style={{
                            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                            paddingVertical: 10, borderRadius: 8, borderWidth: 2,
                            borderColor: voteStatus === chip.key ? chip.color : colors.border,
                            backgroundColor: voteStatus === chip.key ? chip.color + "18" : "transparent",
                          }}
                        >
                          <Ionicons name={chip.icon as any} size={16} color={voteStatus === chip.key ? chip.color : colors.textSecondary} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: voteStatus === chip.key ? chip.color : colors.textSecondary }}>{chip.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, marginTop: 8 }}
                      placeholder="Optional description..."
                      placeholderTextColor={colors.textTertiary}
                      value={voteDescription}
                      onChangeText={setVoteDescription}
                    />
                    <Pressable
                      onPress={() => voteStatus && handleVote(sub.id, voteStatus, voteDescription)}
                      disabled={!voteStatus}
                      style={{ marginTop: 8, backgroundColor: voteStatus ? colors.emerald : colors.border, paddingVertical: 10, borderRadius: 8, alignItems: "center" }}
                    >
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>Submit Vote</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

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

  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }}>
          <View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>More</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Customize your experience
            </Text>
          </View>
          <Image
            source={require("@/assets/images/splash-logo.png")}
            style={{ width: 40, height: 40, borderRadius: 10, opacity: 0.9 }}
            resizeMode="contain"
          />
        </View>
        <TickerBanner />
      </GlassHeader>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: headerHeight + 12, paddingBottom: Platform.OS === "web" ? 34 : 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {section === "main" && renderMain()}
        {section === "calcMethod" && renderCalcMethod()}
        {section === "masjids" && renderMasjids()}
        {section === "masjidDetail" && renderMasjidDetail()}
        {section === "feedback" && renderFeedback()}
        {section === "prayerTracker" && renderPrayerTracker()}
        {section === "janazaHistory" && renderJanazaHistory()}
        {section === "profile" && renderProfile()}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  calMonthText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    borderWidth: 1,
    padding: 6,
    marginBottom: 12,
  },
  calHeaderCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 6,
  },
  calHeaderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  calCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 6,
    minHeight: 48,
    justifyContent: "center",
  },
  calDayText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  calDots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 3,
    height: 6,
    alignItems: "center",
  },
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
    gap: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  calLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calLegendText: {
    fontSize: 12,
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
