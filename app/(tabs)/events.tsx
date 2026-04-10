import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Image,
  Modal,
  Dimensions,
  Linking,
  Share,
  Alert,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { useDeepLink } from "@/lib/deeplink-context";
import * as Location from "expo-location";
import { useLocationOverride } from "@/lib/location-override-context";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { EventsMap } from "@/components/EventsMap";
import { GlassModalContainer } from "@/components/GlassModal";
import { trackEvent, trackScreenView } from "@/lib/analytics";
import { getDistanceKm, kmToMiles, COMMUNITY_ORGS } from "@/lib/prayer-utils";

type DistanceFilter = 10 | 25 | 50 | 100 | "all";
const DISTANCE_OPTIONS: { label: string; value: DistanceFilter }[] = [
  { label: "10 mi", value: 10 },
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
  { label: "All", value: "all" },
];

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
  additionalImageUrls?: string[];
  registrationUrl: string;
  speaker: string;
  latitude: number | null;
  longitude: number | null;
  isVirtual?: boolean;
  isFeatured?: boolean;
}

function formatEventDate(dateStr: string, isAllDay: boolean): { day: string; month: string; weekday: string; time: string; fullDate: string } {
  const date = new Date(dateStr);
  const day = date.getDate().toString();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const time = isAllDay
    ? "All Day"
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const fullDate = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return { day, month, weekday, time, fullDate };
}

const MASJID_KEYWORDS = [
  "masjid", "mosque", "islamic association", "islamic center", "islamic society",
  "as-salaam", "al-noor", "ar-razzaq", "king khalid", "jamaat ibad",
  "chapel hill islamic", "parkwood", "apex masjid",
];

function isMasjid(organizer: string): boolean {
  const lower = organizer.toLowerCase();
  return MASJID_KEYWORDS.some((kw) => lower.includes(kw));
}

function getOrgLogo(organizer: string): any {
  if (!organizer) return null;
  const lower = organizer.toLowerCase();
  for (const org of COMMUNITY_ORGS) {
    for (const term of org.matchTerms) {
      if (lower.includes(term)) return org.logo || null;
    }
  }
  return null;
}

function groupEventsByDate(events: CalendarEvent[]): { dateLabel: string; dateKey: string; events: CalendarEvent[] }[] {
  const groups: Record<string, CalendarEvent[]> = {};
  const keyOrder: string[] = [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const event of events) {
    const startDate = new Date(event.start);
    const displayDate = startDate < todayStart ? todayStart : startDate;
    const key = displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups[key]) {
      groups[key] = [];
      keyOrder.push(key);
    }
    groups[key].push(event);
  }
  return keyOrder.map((dateLabel) => ({ dateLabel, dateKey: dateLabel, events: groups[dateLabel] }));
}

function isToday(dateLabel: string): boolean {
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return dateLabel === todayLabel;
}

function isTomorrow(dateLabel: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return dateLabel === tomorrowLabel;
}

function getRelativeLabel(dateLabel: string): string {
  if (isToday(dateLabel)) return "Today";
  if (isTomorrow(dateLabel)) return "Tomorrow";
  return dateLabel;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildEventDateMap(events: CalendarEvent[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const ev of events) {
    const d = new Date(ev.start);
    const key = toDateKey(d);
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

function EventCalendar({
  events,
  selectedDate,
  onSelectDate,
  colors,
  isDark,
}: {
  events: CalendarEvent[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const eventDateMap = useMemo(() => buildEventDateMap(events), [events]);
  const { firstDay, daysInMonth } = getMonthDays(viewMonth.year, viewMonth.month);
  const todayKey = toDateKey(new Date());
  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMonth((prev) => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
  };
  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMonth((prev) => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const gcBg = isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)";
  const gcBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)";

  return (
    <View style={[calStyles.container, { backgroundColor: gcBg, borderColor: gcBorder, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }]}>
      <View style={calStyles.header}>
        <Pressable onPress={prevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => {
          const now = new Date();
          setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
        }}>
          <Text style={[calStyles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
        </Pressable>
        <Pressable onPress={nextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={calStyles.weekdayRow}>
        {WEEKDAYS.map((wd) => (
          <View key={wd} style={calStyles.weekdayCell}>
            <Text style={[calStyles.weekdayText, { color: colors.textSecondary }]}>{wd}</Text>
          </View>
        ))}
      </View>

      <View style={calStyles.grid}>
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`empty-${i}`} style={calStyles.dayCell} />;
          }
          const dateKey = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEvents = !!eventDateMap[dateKey];
          const isSelected = selectedDate === dateKey;
          const isToday = dateKey === todayKey;

          return (
            <Pressable
              key={dateKey}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelectDate(isSelected ? null : dateKey);
              }}
              style={[
                calStyles.dayCell,
                isToday && !isSelected && { backgroundColor: isDark ? colors.actionButtonBg : colors.prayerIconBg, borderRadius: 6 },
                isSelected && { backgroundColor: colors.emerald, borderRadius: 6 },
              ]}
            >
              <Text style={[
                calStyles.dayText,
                { color: isSelected ? "#fff" : isToday ? colors.emerald : colors.text },
                !hasEvents && !isToday && !isSelected && { color: colors.textTertiary },
              ]}>
                {day}
              </Text>
              {hasEvents && (
                <View style={[calStyles.eventDot, { backgroundColor: isSelected ? "#fff" : colors.gold }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {selectedDate && (
        <Pressable
          onPress={() => onSelectDate(null)}
          style={[calStyles.clearFilter, { backgroundColor: colors.emerald + "18" }]}
        >
          <Text style={[calStyles.clearFilterText, { color: colors.emerald }]}>Show all events</Text>
        </Pressable>
      )}
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    paddingBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  monthLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingHorizontal: 0,
  },
  weekdayCell: {
    width: "14.28%",
    alignItems: "center",
    paddingBottom: 3,
  },
  weekdayText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 0,
  },
  dayCell: {
    width: "14.28%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    paddingVertical: 4,
  },
  dayText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 5,
  },
  clearFilter: {
    marginHorizontal: 10,
    marginTop: 2,
    marginBottom: 2,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: "center",
  },
  clearFilterText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});

const BOOKMARK_DISCLAIMER_KEY = "event_bookmark_disclaimer_shown";


function OrganizerFollowButton({ organizer }: { organizer: string }) {
  const { colors } = useTheme();
  const { user, getAuthHeaders } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setIsFollowing(false); return; }
    const baseUrl = getApiUrl();
    fetch(new URL("/api/organizer-follows", baseUrl).toString(), { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.follows && data.follows.includes(organizer)) setIsFollowing(true);
        else setIsFollowing(false);
      })
      .catch(() => {});
  }, [user, organizer]);

  const toggle = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to follow organizers and get notified about their new events.", [{ text: "OK" }]);
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const baseUrl = getApiUrl();
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isFollowing) {
        const res = await fetch(new URL(`/api/organizer-follows/${encodeURIComponent(organizer)}`, baseUrl).toString(), { method: "DELETE", headers });
        if (res.ok) setIsFollowing(false);
        else Alert.alert("Error", "Could not unfollow. Please try again.");
      } else {
        const res = await fetch(new URL("/api/organizer-follows", baseUrl).toString(), { method: "POST", headers, body: JSON.stringify({ organizer }) });
        if (res.ok) setIsFollowing(true);
        else Alert.alert("Error", "Could not follow. Please try again.");
      }
    } catch { Alert.alert("Error", "Connection error. Please try again."); }
    setLoading(false);
  };

  return (
    <Pressable onPress={toggle} disabled={loading} hitSlop={6}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: isFollowing ? colors.emerald + "20" : "transparent", borderWidth: 1, borderColor: isFollowing ? colors.emerald + "40" : colors.gold + "30" }}>
      <Ionicons name={isFollowing ? "notifications" : "notifications-outline"} size={12} color={isFollowing ? colors.emerald : colors.gold} />
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isFollowing ? colors.emerald : colors.gold }}>{isFollowing ? "Following" : "Follow"}</Text>
    </Pressable>
  );
}

function SubmitEventModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [flyerImages, setFlyerImages] = useState<Array<{ uri: string; base64: string; mime: string }>>([]);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" | "loading" } | null>(null);

  const resetForm = () => {
    setFlyerImages([]);
    setTitle("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setDescription("");
    setOrganizer("");
    setRegistrationUrl("");
    setSubmitterName("");
    setSubmitterEmail("");
    setShowForm(false);
    setStatusMsg(null);
    setExtracting(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const pickImages = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Photo upload is only available on mobile devices.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to upload flyer images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newImages = result.assets
        .filter(a => a.base64)
        .map(a => ({
          uri: a.uri,
          base64: a.base64!,
          mime: a.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        }));
      setFlyerImages(prev => [...prev, ...newImages].slice(0, 5));
    }
  };

  const extractFromFlyer = async () => {
    if (flyerImages.length === 0) return;
    setExtracting(true);
    setStatusMsg({ text: "Extracting details from flyer...", type: "loading" });
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/public/events/extract-flyer", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: flyerImages.map(img => ({ data: img.base64, mimeType: img.mime })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Extraction failed");
      }
      const data = await res.json();
      if (data.title) setTitle(data.title);
      if (data.date) setDate(data.date);
      if (data.startTime) setStartTime(data.startTime);
      if (data.endTime) setEndTime(data.endTime);
      if (data.location) setLocation(data.location);
      if (data.description) setDescription(data.description);
      if (data.organizer) setOrganizer(data.organizer);
      if (data.registrationUrl) setRegistrationUrl(data.registrationUrl);
      setShowForm(true);
      setStatusMsg({ text: "Details extracted — review and submit below", type: "success" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setStatusMsg({ text: e.message || "Could not extract details. Try entering manually.", type: "error" });
      setShowForm(true);
    }
    setExtracting(false);
  };

  const submitEvent = async () => {
    if (!title.trim()) { setStatusMsg({ text: "Please enter an event title.", type: "error" }); return; }
    if (!date || !startTime) { setStatusMsg({ text: "Please enter a date and start time.", type: "error" }); return; }
    setSubmitting(true);
    setStatusMsg({ text: "Submitting your event...", type: "loading" });
    try {
      const startISO = `${date}T${startTime}:00`;
      const endISO = endTime ? `${date}T${endTime}:00` : null;
      const mainImage = flyerImages.length > 0 ? flyerImages[0].base64 : null;
      const mainMime = flyerImages.length > 0 ? flyerImages[0].mime : null;
      const additionalImages = flyerImages.length > 1
        ? flyerImages.slice(1).map(f => ({ data: f.base64, mimeType: f.mime }))
        : [];

      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/public/events/submit", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          startTime: startISO,
          endTime: endISO,
          organizer: organizer.trim() || null,
          registrationUrl: registrationUrl.trim() || null,
          image: mainImage,
          imageMime: mainMime,
          additionalImages,
          submitterName: submitterName.trim() || null,
          submitterEmail: submitterEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Submission failed");
      }
      setStatusMsg({ text: "Event submitted! It will appear once approved by our team.", type: "success" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent("event_submitted", { title: title.trim() });
      setTimeout(() => handleClose(), 2000);
    } catch (e: any) {
      setStatusMsg({ text: e.message || "Something went wrong. Try again.", type: "error" });
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <GlassModalContainer style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text }}>Submit an Event</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, marginBottom: 16 }}>
              Upload your event flyer and we'll fill in the details for you. All submissions are reviewed before being listed.
            </Text>

            {/* Flyer upload area */}
            <Pressable
              onPress={pickImages}
              style={({ pressed }) => ({
                borderWidth: 2,
                borderStyle: "dashed" as const,
                borderColor: flyerImages.length > 0 ? colors.emerald + "60" : colors.border,
                borderRadius: 14,
                padding: 20,
                alignItems: "center" as const,
                backgroundColor: pressed ? colors.surface : "transparent",
                marginBottom: 12,
              })}
            >
              <Ionicons name="cloud-upload-outline" size={28} color={flyerImages.length > 0 ? colors.emerald : colors.textTertiary} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.text, marginTop: 6 }}>
                {flyerImages.length > 0 ? `${flyerImages.length} image${flyerImages.length > 1 ? "s" : ""} selected` : "Tap to upload flyer images"}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textTertiary, marginTop: 2 }}>
                JPG or PNG · Up to 5 images
              </Text>
            </Pressable>

            {flyerImages.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {flyerImages.map((img, idx) => (
                  <View key={idx} style={{ marginRight: 8, position: "relative" as const }}>
                    <Image source={{ uri: img.uri }} style={{ width: 70, height: 70, borderRadius: 10 }} />
                    <Pressable
                      onPress={() => setFlyerImages(prev => prev.filter((_, i) => i !== idx))}
                      style={{ position: "absolute" as const, top: -6, right: -6, backgroundColor: colors.text, borderRadius: 10, width: 20, height: 20, alignItems: "center" as const, justifyContent: "center" as const }}
                    >
                      <Ionicons name="close" size={12} color={colors.background} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {flyerImages.length > 0 && !showForm ? (
              <Pressable
                onPress={extractFromFlyer}
                disabled={extracting}
                style={({ pressed }) => ({
                  backgroundColor: extracting ? colors.emerald + "80" : colors.emerald,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                  marginBottom: 14,
                })}
              >
                {extracting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Extract Details from Flyer</Text>
                )}
              </Pressable>
            ) : null}

            {!showForm && flyerImages.length === 0 ? (
              <Pressable
                onPress={() => setShowForm(true)}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.emerald }}>Or enter details manually</Text>
              </Pressable>
            ) : null}

            {showForm ? (
              <View style={{ gap: 12 }}>
                <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, paddingBottom: 4, marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textTertiary, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                    {flyerImages.length > 0 ? "Review & complete" : "Event details"}
                  </Text>
                </View>

                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>Event Title *</Text>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Community Iftar Dinner"
                  placeholderTextColor={colors.textTertiary}
                />

                <View style={{ flexDirection: "row" as const, gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 }}>Date *</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                      value={date}
                      onChangeText={setDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 }}>Start Time *</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row" as const, gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 }}>End Time</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                      value={endTime}
                      onChangeText={setEndTime}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 }}>Organizer</Text>
                    <TextInput
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                      value={organizer}
                      onChangeText={setOrganizer}
                      placeholder="Organization name"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>Location</Text>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Venue name or full address"
                  placeholderTextColor={colors.textTertiary}
                />

                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>Description</Text>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text, minHeight: 80 }}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Brief event description"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />

                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>Registration / RSVP Link</Text>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                  value={registrationUrl}
                  onChangeText={setRegistrationUrl}
                  placeholder="https://"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="url"
                  autoCapitalize="none"
                />

                <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 4 }}>Your Name (optional)</Text>
                  <TextInput
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                    value={submitterName}
                    onChangeText={setSubmitterName}
                    placeholder="So we know who submitted"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, marginTop: 10, marginBottom: 4 }}>Your Email (optional)</Text>
                  <TextInput
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text }}
                    value={submitterEmail}
                    onChangeText={setSubmitterEmail}
                    placeholder="For follow-up if needed"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <Pressable
                  onPress={submitEvent}
                  disabled={submitting}
                  style={({ pressed }) => ({
                    backgroundColor: submitting ? colors.emerald + "80" : colors.emerald,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center" as const,
                    opacity: pressed ? 0.8 : 1,
                    marginTop: 8,
                  })}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>Submit for Approval</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {statusMsg ? (
              <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: statusMsg.type === "success" ? colors.emerald + "15" : statusMsg.type === "error" ? "#ff4444" + "15" : colors.surface }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: statusMsg.type === "success" ? colors.emerald : statusMsg.type === "error" ? "#ff4444" : colors.text, textAlign: "center" as const }}>
                  {statusMsg.text}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </GlassModalContainer>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EventDetailModal({ event, visible, onClose, isSaved, onToggleSave }: { event: CalendarEvent | null; visible: boolean; onClose: () => void; isSaved: boolean; onToggleSave: (event: CalendarEvent) => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  if (!event) return null;

  const dateInfo = formatEventDate(event.start, event.isAllDay);
  const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
  const timeRange = endInfo && !event.isAllDay
    ? `${dateInfo.time} – ${endInfo.time}`
    : dateInfo.time;

  const cleanDescription = event.description.trim();

  const openMaps = () => {
    if (event.location) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GlassModalContainer style={styles.modalContainer}>
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, justifyContent: "space-between" }]}>
          <Pressable onPress={onClose} hitSlop={8} style={[styles.modalCloseBtn, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { onToggleSave(event); }} hitSlop={8} style={[styles.modalCloseBtn, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? colors.gold : (isDark ? "#fff" : "#374151")} />
            </Pressable>
            <Pressable onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const shareUrl = `https://salamyall.net/share/event/${encodeURIComponent(event.id)}`;
              Share.share({ message: `Check out this event - "${event.title}" - ${shareUrl}` });
            }} hitSlop={8} style={[styles.modalCloseBtn, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
              <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : "#374151"} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} bounces={false} showsVerticalScrollIndicator={false}>
          <EventImageGallery event={event} colors={colors} isDark={isDark} getOrgLogo={getOrgLogo} />

          <View style={styles.modalBody}>
            {event.organizer ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <View style={[styles.modalOrganizerPill, { backgroundColor: colors.categoryBadgeBg ? colors.categoryBadgeBg(colors.gold) : (colors.gold + "20"), marginBottom: 0 }]}>
                  <MaterialCommunityIcons
                    name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                    size={12}
                    color={colors.gold}
                  />
                  <Text style={[styles.modalOrganizerText, { color: colors.gold }]}>{event.organizer}</Text>
                </View>
                <OrganizerFollowButton organizer={event.organizer} />
              </View>
            ) : null}

            <Text style={[styles.modalTitle, { color: colors.text }]}>{event.title}</Text>

            <View style={[styles.modalInfoSection, { borderTopColor: colors.divider }]}>
              <View style={styles.modalInfoRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{dateInfo.fullDate}</Text>
              </View>
              <View style={styles.modalInfoRow}>
                <Ionicons name="time-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{timeRange}</Text>
              </View>
              {event.isVirtual ? (
                <View style={styles.modalInfoRow}>
                  <Ionicons name="videocam" size={18} color={colors.emerald} />
                  <Text style={[styles.modalInfoText, { color: colors.emerald, fontFamily: "Inter_600SemiBold" }]}>Virtual Event</Text>
                </View>
              ) : null}
              {event.location ? (
                <Pressable style={styles.modalInfoRow} onPress={openMaps}>
                  <Ionicons name="location-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.modalInfoText, { color: colors.text }]}>{event.location}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>

            {cleanDescription ? (
              <View style={[styles.modalDescriptionSection, { borderTopColor: colors.divider }]}>
                <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Details</Text>
                <Text style={[styles.modalDescription, { color: colors.text }]}>
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

            <View style={styles.modalActions}>
              {event.registrationUrl ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(event.registrationUrl);
                  }}
                  style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={styles.modalActionText}>Register / RSVP</Text>
                </Pressable>
              ) : null}
              {event.location ? (
                <Pressable
                  style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 }]}
                  onPress={openMaps}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.modalActionText}>Directions</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </GlassModalContainer>
    </Modal>
  );
}

function EventImageGallery({ event, colors, isDark, getOrgLogo }: { event: CalendarEvent; colors: any; isDark: boolean; getOrgLogo: (org: string) => any }) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const allImages: string[] = [];
  if (event.imageUrl) allImages.push(event.imageUrl);
  if (event.additionalImageUrls?.length) allImages.push(...event.additionalImageUrls);

  if (allImages.length > 1) {
    return (
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: SCREEN_WIDTH }}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setActiveIdx(idx);
          }}
        >
          {allImages.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={[styles.modalImage, { width: SCREEN_WIDTH }]} resizeMode="cover" />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8, marginBottom: 4 }}>
          {allImages.map((_, i) => (
            <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === activeIdx ? colors.gold : (isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)") }} />
          ))}
        </View>
      </View>
    );
  } else if (allImages.length === 1) {
    return <Image source={{ uri: allImages[0] }} style={styles.modalImage} resizeMode="cover" />;
  } else if (getOrgLogo(event.organizer)) {
    return <Image source={getOrgLogo(event.organizer)} style={styles.modalImage} resizeMode="cover" />;
  } else {
    return (
      <View style={[styles.modalImagePlaceholder, { backgroundColor: colors.prayerIconBg }]}>
        <Ionicons name="calendar" size={48} color={colors.emerald} />
      </View>
    );
  }
}

export default function EventsScreen() {
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { user, getAuthHeaders } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { pendingTarget, consumeTarget } = useDeepLink();
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>(50);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => { trackScreenView("Events"); }, []);

  const { getEffectiveLocation, isOverrideActive } = useLocationOverride();

  useEffect(() => {
    if (isOverrideActive) {
      const { lat, lng } = getEffectiveLocation(0, 0);
      setUserLocation({ latitude: lat, longitude: lng });
      return;
    }
    setUserLocation(null);
  }, [isOverrideActive, getEffectiveLocation]);

  useEffect(() => {
    if (isOverrideActive || userLocation) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {}
    })();
  }, [isOverrideActive, userLocation]);

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: savedData } = useQuery<{ savedEventIds: string[] }>({
    queryKey: ["/api/saved-events"],
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/saved-events", baseUrl).toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const savedEventIds = useMemo(() => new Set(savedData?.savedEventIds || []), [savedData]);

  const toggleSave = useCallback(async (event: CalendarEvent) => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to save events.", [{ text: "OK" }]);
      return;
    }
    const headers = getAuthHeaders();
    const alreadySaved = savedEventIds.has(event.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (alreadySaved) {
      await apiRequest("DELETE", `/api/saved-events/${encodeURIComponent(event.id)}`, undefined, headers);
      queryClient.invalidateQueries({ queryKey: ["/api/saved-events"] });
      trackEvent("event_unsaved", { title: event.title });
    } else {
      const disclaimerShown = await AsyncStorage.getItem(BOOKMARK_DISCLAIMER_KEY);
      const doSave = async () => {
        await apiRequest("POST", "/api/saved-events", { eventId: event.id }, headers);
        queryClient.invalidateQueries({ queryKey: ["/api/saved-events"] });
        trackEvent("event_saved", { title: event.title });

        if (event.organizer && user) {
          try {
            const orgKey = `org_save_count_${event.organizer}`;
            const dismissKey = `org_follow_dismissed_${event.organizer}`;
            const dismissed = await AsyncStorage.getItem(dismissKey);
            if (!dismissed) {
              const countStr = await AsyncStorage.getItem(orgKey);
              const newCount = (parseInt(countStr || "0") || 0) + 1;
              await AsyncStorage.setItem(orgKey, String(newCount));
              if (newCount >= 3) {
                const baseUrl = getApiUrl();
                const followRes = await fetch(new URL("/api/organizer-follows", baseUrl).toString(), { headers: getAuthHeaders() });
                const followData = await followRes.json();
                const alreadyFollowing = followData.follows?.includes(event.organizer);
                if (!alreadyFollowing) {
                  Alert.alert(
                    "Follow " + event.organizer + "?",
                    `We noticed you enjoy events from ${event.organizer}. Follow them to get notified about every new event!`,
                    [
                      { text: "Not Now", style: "cancel", onPress: () => AsyncStorage.setItem(dismissKey, "true") },
                      {
                        text: "Follow",
                        onPress: async () => {
                          const fHeaders = { ...getAuthHeaders(), "Content-Type": "application/json" };
                          await fetch(new URL("/api/organizer-follows", baseUrl).toString(), { method: "POST", headers: fHeaders, body: JSON.stringify({ organizer: event.organizer }) });
                          await AsyncStorage.setItem(dismissKey, "true");
                        },
                      },
                    ]
                  );
                }
              }
            }
          } catch {}
        }
      };

      if (!disclaimerShown) {
        Alert.alert(
          "Saving Event",
          "Saving an event will send you a reminder 1 hour before it starts. This does not count as registration — you may need to register separately with the organizer.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Got It",
              onPress: async () => {
                await AsyncStorage.setItem(BOOKMARK_DISCLAIMER_KEY, "true");
                await doSave();
              },
            },
          ]
        );
      } else {
        await doSave();
      }
    }
  }, [user, savedEventIds, getAuthHeaders, queryClient]);

  useEffect(() => {
    if (!events || events.length === 0) return;
    if (!pendingTarget || pendingTarget.type !== "event") return;
    const targetId = consumeTarget("event");
    if (targetId) {
      const ev = events.find((e) => e.id === targetId);
      if (ev) setSelectedEvent(ev);
    }
  }, [events, pendingTarget]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/saved-events"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);


  const onSelectDate = useCallback((dateKey: string | null) => {
    setSelectedDate(dateKey);
  }, []);

  const now = new Date();
  const activeEvents = events
    ? events.filter((ev) => {
        const end = ev.end ? new Date(ev.end) : new Date(ev.start);
        return end >= now;
      })
    : [];

  const featuredEvents = useMemo(() => {
    return activeEvents.filter((ev) => ev.isFeatured).slice(0, 3);
  }, [activeEvents]);

  const featuredIds = useMemo(() => new Set(featuredEvents.map((e) => e.id)), [featuredEvents]);

  const distanceFilteredEvents = useMemo(() => {
    const nonFeatured = activeEvents.filter((ev) => !featuredIds.has(ev.id));
    if (distanceFilter === "all" || !userLocation) return nonFeatured;
    return nonFeatured.filter((ev) => {
      if (ev.isVirtual) return true;
      if (ev.latitude == null || ev.longitude == null) return distanceFilter >= 100;
      const km = getDistanceKm(userLocation.latitude, userLocation.longitude, ev.latitude, ev.longitude);
      const miles = kmToMiles(km);
      return miles <= distanceFilter;
    });
  }, [activeEvents, distanceFilter, userLocation, featuredIds]);

  const filteredEvents = selectedDate
    ? distanceFilteredEvents.filter((ev) => toDateKey(new Date(ev.start)) === selectedDate)
    : distanceFilteredEvents;
  const grouped = groupEventsByDate(filteredEvents);

  const [headerHeight, setHeaderHeight] = useState(0);

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Community Events</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {selectedDateLabel ? `Showing ${selectedDateLabel}` : "Programs and events in the local area"}
            </Text>
          </View>
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 8 }}>
            <Pressable
              onPress={() => { setShowSubmitModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: pressed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)",
                alignItems: "center" as const,
                justifyContent: "center" as const,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => { setShowCalendar(!showCalendar); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: pressed ? "rgba(255,255,255,0.2)" : (showCalendar ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)"),
                alignItems: "center" as const,
                justifyContent: "center" as const,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name={showCalendar ? "calendar" : "map"} size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {DISTANCE_OPTIONS.map((opt) => {
              const isActive = distanceFilter === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    setDistanceFilter(opt.value);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: isActive ? colors.emerald : "rgba(255,255,255,0.12)",
                    borderWidth: 1,
                    borderColor: isActive ? colors.emerald : "rgba(255,255,255,0.2)",
                    alignItems: "center" as const,
                    justifyContent: "center" as const,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{
                    fontSize: 13,
                    fontFamily: "Inter_600SemiBold",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                  }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TickerBanner />
      </GlassHeader>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 34 : 100,
          paddingTop: headerHeight + 12,
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
      >
        {!isLoading && !error && activeEvents.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            {showCalendar ? (
              <EventCalendar
                events={activeEvents}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                colors={colors}
                isDark={isDark}
              />
            ) : (
              <EventsMap
                events={distanceFilteredEvents
                  .filter((e) => (e.latitude != null && e.longitude != null) || e.isVirtual)
                  .map((e) => ({
                    id: e.id,
                    title: e.title,
                    latitude: e.latitude ?? 0,
                    longitude: e.longitude ?? 0,
                    isVirtual: e.isVirtual,
                    organizer: e.organizer,
                  }))}
                userLocation={userLocation}
                borderColor={isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)"}
                backgroundColor={isDark ? "rgba(22,22,22,0.9)" : "rgba(255,255,255,0.85)"}
                emeraldColor={colors.emerald}
                goldColor={colors.gold}
                distanceFilter={distanceFilter}
                onSelectEvent={(eventId) => {
                  const ev = distanceFilteredEvents.find((e) => e.id === eventId);
                  if (ev) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedEvent(ev);
                  }
                }}
              />
            )}
          </View>
        )}

        {!isLoading && !error && featuredEvents.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 10, gap: 6 }}>
              <Ionicons name="star" size={14} color={colors.gold} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.gold, letterSpacing: 0.3 }}>FEATURED</Text>
            </View>
            {featuredEvents.map((event) => {
              const dateInfo = formatEventDate(event.start, event.isAllDay);
              const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
              const cardTimeRange = endInfo && !event.isAllDay
                ? `${dateInfo.time} – ${endInfo.time}`
                : dateInfo.time;

              return (
                <Pressable
                  key={event.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedEvent(event);
                    trackEvent("event_viewed", { title: event.title });
                  }}
                  style={({ pressed }) => ({
                    marginHorizontal: 16,
                    borderRadius: 14,
                    overflow: "hidden",
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: colors.gold + "40",
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.92 : 1,
                    shadowColor: colors.gold,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 8,
                    elevation: 3,
                  })}
                >
                  <View style={styles.eventCardRow}>
                    {event.imageUrl ? (
                      <Image source={{ uri: event.imageUrl }} style={styles.eventThumb} resizeMode="cover" />
                    ) : getOrgLogo(event.organizer) ? (
                      <Image source={getOrgLogo(event.organizer)} style={styles.eventThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.eventThumbPlaceholder, { backgroundColor: colors.gold + "18" }]}>
                        <Ionicons name="star" size={24} color={colors.gold} />
                      </View>
                    )}
                    <View style={styles.eventCardBody}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.eventTitle, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                          {event.title}
                        </Text>
                      </View>
                      <Text style={[styles.eventTimeText, { color: colors.gold }]} numberOfLines={1}>
                        {cardTimeRange}
                      </Text>
                      {event.isVirtual ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="videocam" size={12} color={colors.emerald} />
                          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.emerald }}>Virtual Event</Text>
                        </View>
                      ) : event.location ? (
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                          <Text style={[styles.locationText, { color: colors.textTertiary }]} numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "center", gap: 4, marginRight: 4 }}>
                      {user && savedEventIds.has(event.id) ? (
                        <Pressable onPress={(e) => { e.stopPropagation?.(); toggleSave(event); }} hitSlop={8}>
                          <Ionicons name="bookmark" size={18} color={colors.gold} />
                        </Pressable>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.emerald} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.errorText, { color: colors.text }]}>Unable to load events</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
              onPress={onRefresh}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : grouped.length === 0 && featuredEvents.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {selectedDate ? "No events on this day" : "No upcoming events"}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              {selectedDate ? "Tap another day or clear the filter" : "Pull down to refresh"}
            </Text>
            {selectedDate && (
              <Pressable
                onPress={() => setSelectedDate(null)}
                style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1, marginTop: 12 }]}
              >
                <Text style={styles.retryButtonText}>Show All</Text>
              </Pressable>
            )}
          </View>
        ) : (
          grouped.map((group, groupIdx) => {
            const relativeLabel = getRelativeLabel(group.dateLabel);
            const isTodayGroup = isToday(group.dateLabel);

            return (
              <View key={group.dateKey} style={[styles.dateGroup, groupIdx === 0 && { marginTop: 0 }]}>
                <View style={styles.dateHeaderRow}>
                  {isTodayGroup ? (
                    <View style={[styles.todayDot, { backgroundColor: isDark ? colors.gold : colors.emerald }]} />
                  ) : null}
                  <Text style={[
                    styles.dateGroupLabel,
                    { color: isTodayGroup ? (isDark ? colors.gold : colors.emerald) : colors.textSecondary },
                  ]}>
                    {relativeLabel}
                  </Text>
                </View>

                {group.events.map((event) => {
                  const dateInfo = formatEventDate(event.start, event.isAllDay);
                  const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
                  const cardTimeRange = endInfo && !event.isAllDay
                    ? `${dateInfo.time} – ${endInfo.time}`
                    : dateInfo.time;

                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedEvent(event);
                        trackEvent("event_viewed", { title: event.title });
                      }}
                      style={({ pressed }) => [
                        styles.eventCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: pressed ? 0.92 : 1,
                          shadowColor: colors.cardShadow,
                        },
                      ]}
                    >
                      <View style={styles.eventCardRow}>
                        {event.imageUrl ? (
                          <Image
                            source={{ uri: event.imageUrl }}
                            style={styles.eventThumb}
                            resizeMode="cover"
                          />
                        ) : getOrgLogo(event.organizer) ? (
                          <Image
                            source={getOrgLogo(event.organizer)}
                            style={styles.eventThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.eventThumbPlaceholder, { backgroundColor: colors.prayerIconBg }]}>
                            <Ionicons name="calendar" size={24} color={colors.emerald} />
                          </View>
                        )}

                        <View style={styles.eventCardBody}>
                          <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>
                            {event.title}
                          </Text>

                          <Text style={[styles.eventTimeText, { color: colors.gold }]} numberOfLines={1}>
                            {cardTimeRange}
                          </Text>

                          {event.organizer ? (
                            <View style={styles.organizerRow}>
                              <MaterialCommunityIcons
                                name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                                size={13}
                                color={colors.gold}
                              />
                              <Text style={[styles.organizerText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {event.organizer}
                              </Text>
                            </View>
                          ) : null}

                          {event.isVirtual ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="videocam" size={12} color={colors.emerald} />
                              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.emerald }}>Virtual Event</Text>
                            </View>
                          ) : event.location ? (
                            <View style={styles.locationRow}>
                              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                              <Text style={[styles.locationText, { color: colors.textTertiary }]} numberOfLines={1}>
                                {event.location}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={{ alignItems: "center", gap: 4, marginRight: 4 }}>
                          {user && savedEventIds.has(event.id) ? (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                toggleSave(event);
                              }}
                              hitSlop={8}
                            >
                              <Ionicons name="bookmark" size={18} color={colors.gold} />
                            </Pressable>
                          ) : (
                            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      <EventDetailModal
        event={selectedEvent}
        visible={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        isSaved={!!selectedEvent && savedEventIds.has(selectedEvent.id)}
        onToggleSave={toggleSave}
      />

      <SubmitEventModal
        visible={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 14,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 14,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  dateGroup: {
    marginTop: 24,
    marginBottom: 4,
  },
  dateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 6,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dateGroupLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  eventCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  eventCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventThumb: {
    width: 85,
    height: 85,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  eventThumbPlaceholder: {
    width: 85,
    height: 85,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  eventCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  eventTimeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  organizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  organizerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },

  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    flex: 1,
  },
  modalImage: {
    width: SCREEN_WIDTH,
    aspectRatio: 1,
  },
  modalImagePlaceholder: {
    width: SCREEN_WIDTH,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBody: {
    padding: 20,
  },
  modalOrganizerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  modalOrganizerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    marginBottom: 4,
  },
  modalInfoSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  modalInfoText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
    lineHeight: 20,
  },
  modalDescriptionSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalActionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
