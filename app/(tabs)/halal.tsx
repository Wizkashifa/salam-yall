import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  ActivityIndicator,
  Pressable,
  Linking,
  TextInput,
  RefreshControl,
  ScrollView,
  Image,
  Modal,
  Dimensions,
  Share,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { GlassModalContainer } from "@/components/GlassModal";
import { useRouter } from "expo-router";
import { useDeepLink } from "@/lib/deeplink-context";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { trackEvent, trackScreenView } from "@/lib/analytics";

interface HalalRestaurant {
  id: number;
  external_id: number;
  name: string;
  formatted_address: string | null;
  formatted_phone: string | null;
  url: string | null;
  lat: number | null;
  lng: number | null;
  is_halal: string;
  halal_comment: string | null;
  cuisine_types: string[] | null;
  emoji: string | null;
  evidence: string[] | null;
  considerations: string[] | null;
  opening_hours: {
    openNow: boolean;
    periods: Array<{
      open: { day: string; time: number[] };
      close: { day: string; time: number[] };
    }>;
    weekdayDescriptions?: string[];
  } | null;
  rating: number | null;
  user_ratings_total: number | null;
  website: string | null;
  photo_reference: string | null;
  place_id: string | null;
  instagram_url?: string | null;
  community_rating?: number | null;
  community_rating_count?: number;
  last_checkin?: string | null;
  _distance?: number;
}

const HALAL_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "IS_HALAL", label: "Halal" },
  { key: "PARTIALLY_HALAL", label: "Partial" },
];

const CUISINE_FILTERS = [
  { key: "ALL", label: "All Cuisines" },
  { key: "CAFE", label: "Cafe" },
  { key: "INDIAN_PAKISTANI", label: "Indian/Pakistani" },
  { key: "MEDITERRANEAN", label: "Mediterranean" },
  { key: "MIDDLE_EASTERN", label: "Middle Eastern" },
  { key: "TURKISH", label: "Turkish" },
  { key: "AMERICAN", label: "American" },
  { key: "ITALIAN", label: "Italian" },
  { key: "MEXICAN", label: "Mexican" },
  { key: "EAST_ASIAN", label: "East Asian" },
  { key: "CHINESE", label: "Chinese" },
  { key: "JAPANESE", label: "Japanese" },
  { key: "CENTRAL_ASIAN", label: "Central Asian" },
  { key: "SENEGALESE", label: "Senegalese" },
  { key: "GREEK", label: "Greek" },
  { key: "SOUTH_INDIAN", label: "South Indian" },
  { key: "NEPALI", label: "Nepali" },
];

function formatCuisine(cuisine: string): string {
  return cuisine
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function getHalalBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "IS_HALAL":
      return { label: "Halal", color: "#166534", bg: "#DCFCE7" };
    case "PARTIALLY_HALAL":
      return { label: "Partially Halal", color: "#92400E", bg: "#FEF3C7" };
    case "NOT_HALAL":
      return { label: "Not Halal", color: "#991B1B", bg: "#FEE2E2" };
    default:
      return { label: "Unknown", color: "#6B7280", bg: "#F3F4F6" };
  }
}

function getRaleighNow(): { dayName: string; dayIndex: number; minutes: number } {
  const now = new Date();
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value || "Mon";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const dayIndex = dayMap[weekday] ?? 1;
    return {
      dayName: dayNames[dayIndex],
      dayIndex,
      minutes: (hour === 24 ? 0 : hour) * 60 + minute,
    };
  } catch {
    return { dayName: dayNames[now.getDay()], dayIndex: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

function isCurrentlyOpen(hours: HalalRestaurant["opening_hours"]): boolean | null {
  try {
    if (!hours) return null;
    if (!hours.periods || !Array.isArray(hours.periods) || hours.periods.length === 0) return null;
    const { dayName, minutes: currentMinutes } = getRaleighNow();

    const todayPeriods = hours.periods.filter(
      (p) => p && p.open && typeof p.open.day === "string" && p.open.day === dayName
    );
    if (todayPeriods.length === 0) return false;

    for (const period of todayPeriods) {
      if (!period.open?.time || !Array.isArray(period.open.time) || period.open.time.length < 2) continue;
      if (!period.close?.time || !Array.isArray(period.close.time) || period.close.time.length < 2) return true;

      const openMinutes = period.open.time[0] * 60 + period.open.time[1];
      const closeMinutes = period.close.time[0] * 60 + period.close.time[1];

      if (closeMinutes <= openMinutes) {
        if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) return true;
      } else {
        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return "< 0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatTimings(openingHours: HalalRestaurant["opening_hours"]): string[] | null {
  if (!openingHours) return null;
  if (openingHours.weekdayDescriptions && openingHours.weekdayDescriptions.length > 0) {
    return openingHours.weekdayDescriptions;
  }
  if (!openingHours.periods || openingHours.periods.length === 0) return null;
  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const formatTime = (t: number[]) => {
    const h = t[0];
    const m = t[1];
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };
  return dayOrder.map((day) => {
    const periods = openingHours.periods?.filter((p) => p?.open?.day === day) || [];
    if (periods.length === 0) return `${day.charAt(0) + day.slice(1).toLowerCase()}: Closed`;
    const ranges = periods.map((p) => {
      if (!p.close?.time) return `${formatTime(p.open.time)} – Open 24 hrs`;
      return `${formatTime(p.open.time)} – ${formatTime(p.close.time)}`;
    });
    return `${day.charAt(0) + day.slice(1).toLowerCase()}: ${ranges.join(", ")}`;
  });
}

function StarRatingInput({ value, onChange, size = 28, color = "#F59E0B" }: {
  value: number; onChange: (v: number) => void; size?: number; color?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => { onChange(star); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={4}>
          <Ionicons name={star <= value ? "star" : "star-outline"} size={size} color={star <= value ? color : "#D1D5DB"} />
        </Pressable>
      ))}
    </View>
  );
}

function RestaurantDetailModal({ restaurant, visible, onClose, colors, isDark }: {
  restaurant: HalalRestaurant | null; visible: boolean; onClose: () => void; colors: any; isDark: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { user, signInWithApple, getAuthHeaders } = useAuth();
  const [userRating, setUserRating] = useState(0);
  const [communityRating, setCommunityRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [checkinData, setCheckinData] = useState<{ lastCheckin: string | null; totalCheckins: number; recentComments: Array<{ comment: string; displayName: string; date: string }> }>({ lastCheckin: null, totalCheckins: 0, recentComments: [] });
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinComment, setCheckinComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [submittingCheckin, setSubmittingCheckin] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useEffect(() => {
    if (!restaurant || !visible) {
      setDetailsExpanded(false);
      return;
    }
    setDetailsExpanded(false);
    const headers = getAuthHeaders();
    const baseUrl = getApiUrl();

    fetch(new URL(`/api/ratings/restaurant/${restaurant.id}`, baseUrl).toString(), {
      headers: headers.Authorization ? headers : {},
    }).then(r => r.json()).then(data => {
      setCommunityRating({ avg: data.avgRating, count: data.totalRatings });
      if (data.userRating) setUserRating(data.userRating);
    }).catch(() => {});

    fetch(new URL(`/api/checkins/${restaurant.id}`, baseUrl).toString())
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const recentComments = (data.checkins || [])
            .filter((c: any) => c.comment)
            .slice(0, 3)
            .map((c: any) => ({ comment: c.comment, displayName: c.displayName || "Community member", date: c.date }));
          setCheckinData({ lastCheckin: data.lastCheckin, totalCheckins: data.totalCheckins, recentComments });
        }
      })
      .catch(() => {});
  }, [restaurant?.id, visible]);

  useEffect(() => {
    if (!visible) {
      setUserRating(0);
      setCommunityRating({ avg: null, count: 0 });
      setCheckinData({ lastCheckin: null, totalCheckins: 0, recentComments: [] });
      setShowCheckinForm(false);
      setCheckinComment("");
    }
  }, [visible]);

  const handleRate = useCallback(async (rating: number) => {
    let authHeaders = getAuthHeaders();
    if (!user) {
      if (Platform.OS === "web") {
        Alert.alert("Sign In Required", "Use the mobile app to sign in with Apple and rate restaurants.");
        return;
      }
      try {
        const freshToken = await signInWithApple();
        authHeaders = { Authorization: `Bearer ${freshToken}` };
      } catch { return; }
    }
    setUserRating(rating);
    setSubmittingRating(true);
    try {
      const response = await apiRequest("POST", "/api/ratings", {
        entityType: "restaurant",
        entityId: restaurant?.id,
        rating,
      }, authHeaders);
      const data = await response.json();
      setCommunityRating({ avg: data.avgRating, count: data.totalRatings });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not submit your rating. Please try again.");
    }
    setSubmittingRating(false);
  }, [user, restaurant?.id, signInWithApple, getAuthHeaders]);

  const handleCheckin = useCallback(async () => {
    let authHeaders = getAuthHeaders();
    if (!user) {
      if (Platform.OS === "web") {
        Alert.alert("Sign In Required", "Use the mobile app to sign in with Apple to check in.");
        return;
      }
      try {
        const freshToken = await signInWithApple();
        authHeaders = { Authorization: `Bearer ${freshToken}` };
      } catch { return; }
    }
    setSubmittingCheckin(true);
    try {
      const response = await apiRequest("POST", "/api/checkins", {
        restaurantId: restaurant?.id,
        comment: checkinComment.trim() || null,
      }, authHeaders);
      const data = await response.json();
      const newComment = checkinComment.trim();
      const updatedComments = newComment && user
        ? [{ comment: newComment, displayName: user.displayName || "Community member", date: new Date().toISOString() }, ...checkinData.recentComments].slice(0, 3)
        : checkinData.recentComments;
      setCheckinData({ lastCheckin: data.lastCheckin, totalCheckins: data.totalCheckins, recentComments: updatedComments });
      setShowCheckinForm(false);
      setCheckinComment("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent("halal_checkin", { restaurant_id: restaurant?.id, restaurant_name: restaurant?.name });
    } catch {
      Alert.alert("Error", "Could not submit your check-in. Please try again.");
    }
    setSubmittingCheckin(false);
  }, [user, restaurant?.id, checkinComment, signInWithApple, getAuthHeaders]);

  if (!restaurant) return null;

  const badge = getHalalBadge(restaurant.is_halal);
  const openStatus = isCurrentlyOpen(restaurant.opening_hours);
  const cuisines = restaurant.cuisine_types ? restaurant.cuisine_types.map(formatCuisine).join(" · ") : "";
  const hasPhoto = !!restaurant.photo_reference;
  const photoUrl = hasPhoto ? new URL(`/api/halal-restaurants/${restaurant.id}/photo`, getApiUrl()).toString() : null;
  const rating = restaurant.rating != null ? Number(restaurant.rating) : null;
  const hours = formatTimings(restaurant.opening_hours);

  const openMaps = () => {
    if (restaurant.lat && restaurant.lng) {
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(restaurant.name)}@${restaurant.lat},${restaurant.lng}`,
        android: `geo:0,0?q=${restaurant.lat},${restaurant.lng}(${encodeURIComponent(restaurant.name)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`,
      });
      if (url) Linking.openURL(url);
    } else if (restaurant.formatted_address) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.formatted_address)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GlassModalContainer style={styles.modalContainer}>
        <View style={[styles.detailHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, justifyContent: "space-between" }]}>
          <Pressable onPress={onClose} hitSlop={8} style={[styles.closeButton, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
          <Pressable onPress={() => {
            const shareUrl = `https://salamyall.net/share/restaurant/${restaurant.id}`;
            Share.share({ message: `Salam Y'all check out this restaurant - "${restaurant.name}" - ${shareUrl}` });
          }} hitSlop={8} style={[styles.closeButton, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} bounces={false}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.detailPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.detailPhotoPlaceholder, { backgroundColor: colors.prayerIconBg }]}>
              <Ionicons name="restaurant" size={48} color={colors.emerald} />
            </View>
          )}

          <View style={styles.detailContent}>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <View style={[styles.halalPill, { backgroundColor: badge.bg }]}>
                <Text style={[styles.halalPillText, { color: badge.color }]}>{badge.label}</Text>
              </View>
              {openStatus !== null && (
                <View style={[styles.halalPill, { backgroundColor: openStatus ? "#DCFCE7" : "#FEE2E2" }]}>
                  <View style={[styles.openDot, { backgroundColor: openStatus ? "#22C55E" : "#EF4444" }]} />
                  <Text style={[styles.halalPillText, { color: openStatus ? "#166534" : "#991B1B" }]}>
                    {openStatus ? "Open" : "Closed"}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.detailName, { color: colors.text }]}>{restaurant.name}</Text>

            {cuisines ? (
              <Text style={[styles.detailCuisine, { color: colors.textSecondary }]}>{cuisines}</Text>
            ) : null}

            {(() => {
              const actions: Array<{ icon: string; label: string; color: string; onPress: () => void }> = [];
              if (restaurant.formatted_phone) actions.push({ icon: "call", label: "Call", color: colors.emerald, onPress: () => Linking.openURL(`tel:${restaurant.formatted_phone}`) });
              actions.push({ icon: "navigate", label: "Directions", color: colors.gold, onPress: openMaps });
              if (restaurant.website) actions.push({ icon: "globe", label: "Website", color: isDark ? "#4B5563" : "#374151", onPress: () => Linking.openURL(restaurant.website!) });
              if (restaurant.instagram_url) actions.push({ icon: "logo-instagram", label: "Instagram", color: "#E1306C", onPress: () => Linking.openURL(restaurant.instagram_url!) });
              const iconOnly = actions.length > 3;
              return (
                <View style={styles.detailActions}>
                  {actions.map((a, i) => (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: a.color, opacity: pressed ? 0.8 : 1, paddingVertical: iconOnly ? 14 : 12 }]}
                      onPress={a.onPress}
                    >
                      <Ionicons name={a.icon as any} size={iconOnly ? 22 : 18} color="#fff" />
                      {!iconOnly && <Text style={styles.detailActionText}>{a.label}</Text>}
                    </Pressable>
                  ))}
                </View>
              );
            })()}

            <View style={[styles.communitySection, { borderTopColor: colors.divider }]}>
              <Text style={[styles.communitySectionTitle, { color: colors.text }]}>Community Rating</Text>
              {communityRating.avg != null && communityRating.count > 0 ? (
                <View style={styles.communityRatingRow}>
                  <Text style={[styles.communityAvg, { color: colors.gold }]}>{communityRating.avg.toFixed(1)}</Text>
                  <Text style={styles.communityStars}>{renderStars(communityRating.avg)}</Text>
                  <Text style={[styles.communityCount, { color: colors.textTertiary }]}>
                    ({communityRating.count} {communityRating.count === 1 ? "rating" : "ratings"})
                  </Text>
                </View>
              ) : (
                <Text style={[styles.communityEmpty, { color: colors.textTertiary }]}>No community ratings yet</Text>
              )}
              <View style={styles.userRatingRow}>
                <Text style={[styles.userRatingLabel, { color: colors.textSecondary }]}>Your rating:</Text>
                <StarRatingInput value={userRating} onChange={handleRate} size={24} />
              </View>
            </View>

            {rating != null && !isNaN(rating) && rating > 0 ? (
              <View style={[styles.communitySection, { borderTopColor: colors.divider }]}>
                <Text style={[styles.communitySectionTitle, { color: colors.text }]}>Google Rating</Text>
                <View style={styles.detailRatingRow}>
                  <Text style={[styles.detailRatingScore, { color: colors.gold }]}>{rating.toFixed(1)}</Text>
                  <Text style={styles.detailStars}>{renderStars(rating)}</Text>
                  {restaurant.user_ratings_total ? (
                    <Text style={[styles.detailRatingCount, { color: colors.textTertiary }]}>
                      ({restaurant.user_ratings_total.toLocaleString()} reviews)
                    </Text>
                  ) : null}
                </View>
                {restaurant.halal_comment ? (
                  <Text style={[styles.detailDesc, { color: colors.textSecondary, marginTop: 8 }]}>{restaurant.halal_comment}</Text>
                ) : null}
              </View>
            ) : restaurant.halal_comment ? (
              <View style={[styles.communitySection, { borderTopColor: colors.divider }]}>
                <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{restaurant.halal_comment}</Text>
              </View>
            ) : null}

            {(restaurant.is_halal === "IS_HALAL" || restaurant.is_halal === "PARTIALLY_HALAL") ? (
              <View style={[styles.communitySection, { borderTopColor: colors.divider }]}>
                <View style={styles.checkinHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.communitySectionTitle, { color: colors.text }]}>Halal Verification</Text>
                    {checkinData.lastCheckin ? (
                      <>
                        <Text style={[styles.lastVerified, { color: colors.emerald }]}>
                          Last verified {new Date(checkinData.lastCheckin).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {checkinData.totalCheckins > 1 ? ` (${checkinData.totalCheckins} check-ins)` : ""}
                        </Text>
                        {checkinData.recentComments.length > 0 ? (
                          <View style={{ marginTop: 6, gap: 4 }}>
                            {checkinData.recentComments.map((c, i) => (
                              <Text key={i} style={[styles.checkinCommentText, { color: colors.textSecondary }]}>
                                "{c.comment}" — {c.displayName}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Text style={[styles.communityEmpty, { color: colors.textTertiary }]}>Not yet verified by the community</Text>
                    )}
                  </View>
                  {!showCheckinForm ? (
                    <Pressable
                      style={({ pressed }) => [styles.checkinBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
                      onPress={() => {
                        if (!user && Platform.OS === "web") {
                          Alert.alert("Sign In Required", "Use the mobile app to sign in with Apple to check in.");
                          return;
                        }
                        setShowCheckinForm(true);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text style={styles.checkinBtnText}>Reverify</Text>
                    </Pressable>
                  ) : null}
                </View>
                {showCheckinForm ? (
                  <View style={styles.checkinForm}>
                    <TextInput
                      style={[styles.checkinInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                      placeholder="Optional: How's the halal status?"
                      placeholderTextColor={colors.textTertiary}
                      value={checkinComment}
                      onChangeText={setCheckinComment}
                      multiline
                      numberOfLines={2}
                    />
                    <View style={styles.checkinFormActions}>
                      <Pressable
                        style={[styles.checkinFormBtn, { backgroundColor: colors.surfaceSecondary }]}
                        onPress={() => { setShowCheckinForm(false); setCheckinComment(""); }}
                      >
                        <Text style={[styles.checkinFormBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.checkinFormBtn, { backgroundColor: colors.emerald, opacity: submittingCheckin ? 0.6 : 1 }]}
                        onPress={handleCheckin}
                        disabled={submittingCheckin}
                      >
                        <Text style={[styles.checkinFormBtnText, { color: "#fff" }]}>
                          {submittingCheckin ? "Submitting..." : "Confirm"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {(restaurant.formatted_address || restaurant.formatted_phone || restaurant.website) ? (
              <View style={[styles.detailSection, { borderTopColor: colors.divider }]}>
                <Pressable
                  style={styles.expandableHeader}
                  onPress={() => setDetailsExpanded(!detailsExpanded)}
                >
                  <Ionicons name="information-circle-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.expandableHeaderText, { color: colors.text }]}>Details</Text>
                  <Ionicons name={detailsExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} />
                </Pressable>

                {detailsExpanded ? (
                  <View style={{ marginTop: 8 }}>
                    {restaurant.formatted_address ? (
                      <Pressable style={styles.detailInfoRow} onPress={openMaps}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.text }]}>{restaurant.formatted_address}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : null}

                    {restaurant.formatted_phone ? (
                      <Pressable style={styles.detailInfoRow} onPress={() => Linking.openURL(`tel:${restaurant.formatted_phone}`)}>
                        <Ionicons name="call-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.text }]}>{restaurant.formatted_phone}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : null}

                    {restaurant.website ? (
                      <Pressable style={styles.detailInfoRow} onPress={() => Linking.openURL(restaurant.website!)}>
                        <Ionicons name="globe-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.text }]} numberOfLines={1}>
                          {restaurant.website.replace(/^https?:\/\//, "")}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {hours && hours.length > 0 ? (
              <View style={[styles.hoursSection, { borderTopColor: colors.divider }]}>
                <View style={styles.hoursSectionHeader}>
                  <Ionicons name="time-outline" size={18} color={colors.gold} />
                  <Text style={[styles.hoursSectionTitle, { color: colors.text }]}>Hours</Text>
                </View>
                {hours.map((h: string, i: number) => {
                  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
                  const isToday = h.toLowerCase().startsWith(todayName.toLowerCase());
                  return (
                    <Text
                      key={i}
                      style={[
                        styles.hoursText,
                        { color: isToday ? colors.text : colors.textSecondary },
                        isToday && { fontFamily: "Inter_600SemiBold" },
                      ]}
                    >
                      {h}
                    </Text>
                  );
                })}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </GlassModalContainer>
    </Modal>
  );
}

function SubmitRestaurantModal({ visible, onClose, colors, pendingCount }: { visible: boolean; onClose: () => void; colors: any; pendingCount?: number }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setPendingTarget } = useDeepLink();
  const { user, signInWithApple, getAuthHeaders } = useAuth();
  const qc = useQueryClient();
  const [googleUrl, setGoogleUrl] = useState("");
  const [halalStatus, setHalalStatus] = useState<"halal" | "partial" | "not_halal" | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [activeTab, setActiveTab] = useState<"verify" | "submit">("verify");
  const [votingId, setVotingId] = useState<number | null>(null);
  const [voteStatus, setVoteStatus] = useState<string | null>(null);
  const [voteDescription, setVoteDescription] = useState("");

  const pendingSubmissionsQuery = useQuery<Array<{
    id: number; name: string | null; google_maps_url: string; address: string | null;
    vote_count: number; user_vote: string | null; created_at: string;
  }>>({
    queryKey: ["/api/restaurant-submissions/pending"],
    enabled: visible && !!user,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/restaurant-submissions/pending", baseUrl).toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const pendingList = (pendingSubmissionsQuery.data || []).filter(s => !s.user_vote);

  const handleVote = useCallback(async (submissionId: number, status: string, desc: string) => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL(`/api/restaurant-submissions/${submissionId}/vote`, baseUrl).toString(), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ halalStatus: status, description: desc.trim() || null }),
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
          qc.invalidateQueries({ queryKey: ["/api/halal-restaurants"] });
        }
      }
    } catch {
      Alert.alert("Error", "Failed to submit vote. Please try again.");
    }
  }, [getAuthHeaders, qc]);

  useEffect(() => {
    if (!visible) {
      setGoogleUrl("");
      setHalalStatus(null);
      setDescription("");
      setSuccess(false);
      setRestaurantName("");
      setVotingId(null);
      setVoteStatus(null);
      setVoteDescription("");
      setActiveTab(pendingList.length > 0 ? "verify" : "submit");
    }
  }, [visible]);

  const handleLookup = async () => {
    if (!googleUrl.trim()) return;
    setLookingUp(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/businesses/lookup", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: googleUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.name) setRestaurantName(data.name);
      }
    } catch {}
    setLookingUp(false);
  };

  const handleSubmit = async () => {
    if (!googleUrl.trim() || !halalStatus) {
      Alert.alert("Missing Info", "Please provide a Google Maps link and select a halal status.");
      return;
    }
    if (!user) {
      try {
        await signInWithApple();
      } catch {
        return;
      }
    }
    setSubmitting(true);
    try {
      const baseUrl = getApiUrl();
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const subRes = await fetch(new URL("/api/restaurant-submissions", baseUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ googleMapsUrl: googleUrl.trim(), name: restaurantName || null }),
      });
      if (!subRes.ok) {
        const err = await subRes.json();
        Alert.alert("Error", err.error || "Failed to submit");
        setSubmitting(false);
        return;
      }
      const subData = await subRes.json();
      await fetch(new URL(`/api/restaurant-submissions/${subData.id}/vote`, baseUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ halalStatus, description: description.trim() || null }),
      });
      setSuccess(true);
    } catch (e: any) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const statusChips: { key: "halal" | "partial" | "not_halal"; label: string; color: string; icon: string }[] = [
    { key: "halal", label: "Halal", color: "#2E7D32", icon: "checkmark-circle" },
    { key: "partial", label: "Partial", color: "#F57C00", icon: "alert-circle" },
    { key: "not_halal", label: "Not Halal", color: "#C62828", icon: "close-circle" },
  ];

  const verifyStatusChips: { key: string; label: string; color: string; icon: string }[] = [
    { key: "halal", label: "Halal", color: "#2E7D32", icon: "checkmark-circle" },
    { key: "partial", label: "Partial", color: "#F57C00", icon: "alert-circle" },
    { key: "not_halal", label: "Not Halal", color: "#C62828", icon: "close-circle" },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GlassModalContainer>
        <View style={{ paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 20 : insets.top + 10, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>Community Restaurants</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 0 }}>
            <Pressable
              onPress={() => setActiveTab("verify")}
              style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === "verify" ? colors.emerald : "transparent" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontFamily: activeTab === "verify" ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 14, color: activeTab === "verify" ? colors.emerald : colors.textSecondary }}>Verify</Text>
                {pendingList.length > 0 && (
                  <View style={{ backgroundColor: colors.emerald, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff" }}>{pendingList.length}</Text>
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("submit")}
              style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === "submit" ? colors.emerald : "transparent" }}
            >
              <Text style={{ fontFamily: activeTab === "submit" ? "Inter_600SemiBold" : "Inter_400Regular", fontSize: 14, color: activeTab === "submit" ? colors.emerald : colors.textSecondary }}>Submit New</Text>
            </Pressable>
          </View>
        </View>

        {activeTab === "verify" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {!user ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Ionicons name="shield-checkmark-outline" size={48} color={colors.textTertiary} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginTop: 16, textAlign: "center" }}>Sign in to verify restaurants</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
                  Help the community by confirming halal status of submitted restaurants.
                </Text>
              </View>
            ) : pendingList.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.emerald} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginTop: 16, textAlign: "center" }}>All caught up!</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
                  No restaurants need verification right now. Submit a new one to get started.
                </Text>
                <Pressable onPress={() => setActiveTab("submit")} style={{ marginTop: 20, backgroundColor: colors.emerald, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>Submit a Restaurant</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 }}>
                  Help verify these restaurants. Once 3 people confirm, they'll be added to Halal Eats.
                </Text>
                {pendingList.map((sub) => (
                  <View key={sub.id} style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
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
                          {verifyStatusChips.map((chip) => (
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
          </ScrollView>
        ) : success ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
            <Ionicons name="checkmark-circle" size={64} color={colors.emerald} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text, marginTop: 16, textAlign: "center" }}>Thank You!</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
              Your submission is now awaiting community verification. Once 3 people confirm the halal status, it will be automatically added.
            </Text>
            <Pressable onPress={onClose} style={{ marginTop: 24, backgroundColor: colors.emerald, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" }}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text, marginBottom: 8 }}>Google Maps Link</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text }}
                placeholder="Paste Google Maps URL..."
                placeholderTextColor={colors.textTertiary}
                value={googleUrl}
                onChangeText={setGoogleUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={handleLookup}
                style={{ backgroundColor: colors.emerald, width: 44, borderRadius: 10, justifyContent: "center", alignItems: "center", opacity: lookingUp ? 0.6 : 1 }}
                disabled={lookingUp}
              >
                <Ionicons name={lookingUp ? "hourglass" : "search"} size={20} color="#fff" />
              </Pressable>
            </View>
            {restaurantName ? (
              <View style={{ marginTop: 10, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary }}>Found:</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text, marginTop: 2 }}>{restaurantName}</Text>
              </View>
            ) : null}

            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text, marginTop: 24, marginBottom: 8 }}>Halal Verification</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
              Based on your experience, how would you classify this restaurant's halal status?
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {statusChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={() => { setHalalStatus(chip.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    paddingVertical: 12, borderRadius: 10, borderWidth: 2,
                    borderColor: halalStatus === chip.key ? chip.color : colors.border,
                    backgroundColor: halalStatus === chip.key ? chip.color + "18" : colors.surface,
                  }}
                >
                  <Ionicons name={chip.icon as any} size={18} color={halalStatus === chip.key ? chip.color : colors.textSecondary} />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: halalStatus === chip.key ? chip.color : colors.textSecondary }}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text, marginTop: 24, marginBottom: 8 }}>Description (Optional)</Text>
            <TextInput
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
              placeholder="Any details about their halal status..."
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 20, lineHeight: 18 }}>
              Once three (3) people have verified a restaurant's halal status it will be added.
            </Text>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !googleUrl.trim() || !halalStatus}
              style={{
                marginTop: 16, backgroundColor: colors.emerald, paddingVertical: 14, borderRadius: 12, alignItems: "center",
                opacity: submitting || !googleUrl.trim() || !halalStatus ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>{submitting ? "Submitting..." : "Submit Restaurant"}</Text>
            </Pressable>
          </ScrollView>
        )}
      </GlassModalContainer>
    </Modal>
  );
}

export default function HalalScreen() {
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { user, getAuthHeaders } = useAuth();
  const [searchText, setSearchText] = useState("");
  const [halalFilter, setHalalFilter] = useState("ALL");
  const [cuisineFilter, setCuisineFilter] = useState("ALL");
  const [openNowFilter, setOpenNowFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<HalalRestaurant | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const { pendingTarget, consumeTarget } = useDeepLink();
  const [headerHeight, setHeaderHeight] = useState(0);

  const pendingCountQuery = useQuery<number>({
    queryKey: ["/api/restaurant-submissions/pending-count"],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/restaurant-submissions/pending", baseUrl).toString(), { headers: getAuthHeaders() });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.filter((s: any) => !s.user_vote).length;
    },
  });
  const pendingCount = pendingCountQuery.data || 0;

  useEffect(() => { trackScreenView("HalalEats"); }, []);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!searchText || searchText.length < 2) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { trackEvent("search", { query: searchText, context: "halal" }); }, 1500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchText]);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => {}
            );
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        }
      } catch {}
    })();
  }, []);

  const { data: restaurants = [], isLoading } = useQuery<HalalRestaurant[]>({
    queryKey: ["/api/halal-restaurants"],
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (restaurants.length === 0) return;
    if (!pendingTarget || pendingTarget.type !== "restaurant") return;
    const targetId = consumeTarget("restaurant");
    if (targetId) {
      const r = restaurants.find((rest) => String(rest.id) === targetId);
      if (r) setSelectedRestaurant(r);
    }
  }, [restaurants, pendingTarget]);

  const filtered = useMemo(() => {
    let result = restaurants.map((r) => {
      if (userLocation && r.lat && r.lng) {
        return { ...r, _distance: haversineDistance(userLocation.lat, userLocation.lng, r.lat, r.lng) };
      }
      return { ...r, _distance: undefined };
    });

    if (halalFilter !== "ALL") {
      result = result.filter((r) => r.is_halal === halalFilter);
    }

    if (cuisineFilter !== "ALL") {
      result = result.filter(
        (r) => r.cuisine_types && r.cuisine_types.includes(cuisineFilter)
      );
    }

    if (openNowFilter) {
      result = result.filter((r) => isCurrentlyOpen(r.opening_hours) === true);
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.formatted_address && r.formatted_address.toLowerCase().includes(q))
      );
    }

    if (userLocation) {
      result.sort((a, b) => (a._distance ?? 9999) - (b._distance ?? 9999));
    }

    return result;
  }, [restaurants, halalFilter, cuisineFilter, openNowFilter, searchText, userLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/halal-restaurants"] });
    setRefreshing(false);
  }, [queryClient]);

  const renderRestaurant = useCallback(
    ({ item }: { item: HalalRestaurant }) => {
      const badge = getHalalBadge(item.is_halal);
      const openStatus = isCurrentlyOpen(item.opening_hours);
      const cuisines = item.cuisine_types
        ? item.cuisine_types.map(formatCuisine).join(" · ")
        : "";
      const hasPhoto = !!item.photo_reference;
      const photoUrl = hasPhoto ? new URL(`/api/halal-restaurants/${item.id}/photo`, getApiUrl()).toString() : null;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.95 : 1 },
          ]}
          onPress={() => { setSelectedRestaurant(item); trackEvent("restaurant_viewed", { name: item.name, id: item.id }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          testID={`restaurant-${item.id}`}
        >
          <View style={styles.cardRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.cardThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.cardThumbPlaceholder, { backgroundColor: colors.prayerIconBg }]}>
                <Ionicons name="restaurant" size={22} color={colors.emerald} />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={[styles.restaurantName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>

              <View style={styles.metaRow}>
                {cuisines ? (
                  <Text style={[styles.cuisineText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {cuisines}
                  </Text>
                ) : null}
              </View>

              <View style={styles.badgeRow}>
                <View style={[styles.smallBadge, { backgroundColor: isDark ? badge.bg + "90" : badge.bg }]}>
                  <Text style={[styles.smallBadgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
                {openStatus !== null && (
                  <View style={[styles.smallBadge, { backgroundColor: openStatus ? "#DCFCE7" : "#FEE2E2" }]}>
                    <View style={[styles.openDot, { backgroundColor: openStatus ? "#22C55E" : "#EF4444" }]} />
                    <Text style={[styles.smallBadgeText, { color: openStatus ? "#166534" : "#991B1B" }]}>
                      {openStatus ? "Open" : "Closed"}
                    </Text>
                  </View>
                )}
                {item._distance !== undefined ? (
                  <Text style={[styles.distanceText, { color: colors.textTertiary }]}>
                    {formatDistance(item._distance)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.ratingRow}>
                {item.community_rating != null && item.community_rating > 0 ? (
                  <>
                    <Ionicons name="star" size={12} color={colors.gold} />
                    <Text style={[styles.ratingScore, { color: colors.gold }]}>
                      {Number(item.community_rating).toFixed(1)}
                    </Text>
                    <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
                      ({item.community_rating_count} {item.community_rating_count === 1 ? "rating" : "ratings"})
                    </Text>
                  </>
                ) : item.rating && Number(item.rating) > 0 ? (
                  <>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={[styles.ratingScore, { color: colors.text }]}>
                      {Number(item.rating).toFixed(1)}
                    </Text>
                    {item.user_ratings_total ? (
                      <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
                        ({item.user_ratings_total.toLocaleString()})
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {item.last_checkin ? (
                  <Text style={[styles.lastVerifiedText, { color: colors.emerald }]}>
                    Verified {new Date(item.last_checkin).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, isDark]
  );

  const activeFilterCount = (halalFilter !== "ALL" ? 1 : 0) + (cuisineFilter !== "ALL" ? 1 : 0) + (openNowFilter ? 1 : 0);
  const filterLabel = activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters";
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Halal Eats</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Halal-certified restaurants nearby
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", opacity: pressed ? 0.8 : 1 }]}
            onPress={() => { setShowSubmitModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            {pendingCount > 0 && (
              <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#EF4444", borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" }}>{pendingCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <TickerBanner />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={styles.searchFilterRow}>
            <View style={[styles.searchBar, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.6)" />
              <TextInput
                style={[styles.searchInput, { color: "#FFFFFF" }]}
                placeholder="Search restaurants..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={searchText}
                onChangeText={setSearchText}
                returnKeyType="search"
                testID="halal-search"
              />
              {searchText ? (
                <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[styles.dropdownTrigger, { backgroundColor: activeFilterCount > 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)", borderColor: activeFilterCount > 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)" }]}
              onPress={() => {
                setShowFilterDropdown(!showFilterDropdown);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              testID="halal-filter-dropdown"
            >
              <Ionicons name="options-outline" size={16} color={activeFilterCount > 0 ? "#FFFFFF" : "rgba(255,255,255,0.6)"} />
              <Text style={[styles.dropdownTriggerText, { color: activeFilterCount > 0 ? "#FFFFFF" : "rgba(255,255,255,0.6)" }]} numberOfLines={1}>
                {filterLabel}
              </Text>
              <Ionicons name={showFilterDropdown ? "chevron-up" : "chevron-down"} size={14} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        </View>
      </GlassHeader>

      {showFilterDropdown ? (
        <>
          <Pressable style={styles.filterOverlay} onPress={() => setShowFilterDropdown(false)} />
          <View style={[styles.filterDropdownMenu, { top: headerHeight + 4, backgroundColor: colors.surface, borderColor: colors.border, ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.15)" } as any : {}) }]}>
            <ScrollView nestedScrollEnabled bounces={false}>
              <Text style={[styles.filterSectionTitle, { color: colors.textTertiary }]}>Halal Status</Text>
              {HALAL_FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.filterDropdownItem, halalFilter === f.key && { backgroundColor: colors.prayerIconBg }]}
                  onPress={() => { setHalalFilter(f.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name={f.key === "ALL" ? "grid-outline" : f.key === "IS_HALAL" ? "checkmark-circle-outline" : "ellipse-outline"} size={18} color={halalFilter === f.key ? colors.emerald : colors.textSecondary} />
                  <Text style={[styles.filterDropdownItemText, { color: halalFilter === f.key ? colors.emerald : colors.text }]}>{f.label}</Text>
                  {halalFilter === f.key ? <Ionicons name="checkmark" size={16} color={colors.emerald} style={{ marginLeft: "auto" }} /> : null}
                </Pressable>
              ))}

              <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />

              <Pressable
                style={[styles.filterDropdownItem, openNowFilter && { backgroundColor: colors.prayerIconBg }]}
                onPress={() => { setOpenNowFilter(!openNowFilter); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Ionicons name="time-outline" size={18} color={openNowFilter ? colors.emerald : colors.textSecondary} />
                <Text style={[styles.filterDropdownItemText, { color: openNowFilter ? colors.emerald : colors.text }]}>Open Now</Text>
                {openNowFilter ? <Ionicons name="checkmark" size={16} color={colors.emerald} style={{ marginLeft: "auto" }} /> : null}
              </Pressable>

              <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />

              <Text style={[styles.filterSectionTitle, { color: colors.textTertiary }]}>Cuisine</Text>
              {CUISINE_FILTERS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.filterDropdownItem, cuisineFilter === c.key && { backgroundColor: colors.prayerIconBg }]}
                  onPress={() => { setCuisineFilter(c.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.filterDropdownItemText, { color: cuisineFilter === c.key ? colors.emerald : colors.text }]}>{c.label}</Text>
                  {cuisineFilter === c.key ? <Ionicons name="checkmark" size={16} color={colors.emerald} style={{ marginLeft: "auto" }} /> : null}
                </Pressable>
              ))}

              {activeFilterCount > 0 ? (
                <>
                  <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
                  <Pressable
                    style={styles.filterDropdownItem}
                    onPress={() => { setHalalFilter("ALL"); setCuisineFilter("ALL"); setOpenNowFilter(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                    <Text style={[styles.filterDropdownItemText, { color: colors.textSecondary }]}>Clear All Filters</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </>
      ) : null}

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderRestaurant}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight + 12, paddingBottom: isWeb ? 34 : 100 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant-outline" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                No restaurants found
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Try adjusting your filters or search
              </Text>
            </View>
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <View style={[styles.creditBar, { borderTopColor: colors.border }]}>
                <Text style={[styles.creditText, { color: colors.textTertiary }]}>
                  Data from{" "}
                </Text>
                <Pressable onPress={() => Linking.openURL("https://halaleatsnc.com")}>
                  <Text style={[styles.creditLink, { color: colors.gold }]}>
                    HalalEatsNC.com
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
          testID="halal-list"
        />
      )}

      <RestaurantDetailModal
        restaurant={selectedRestaurant}
        visible={!!selectedRestaurant}
        onClose={() => { setSelectedRestaurant(null); }}
        colors={colors}
        isDark={isDark}
      />
      <SubmitRestaurantModal
        visible={showSubmitModal}
        onClose={() => { setShowSubmitModal(false); pendingCountQuery.refetch(); }}
        colors={colors}
        pendingCount={pendingCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchFilterRow: {
    flexDirection: "row" as const,
    gap: 10,
    alignItems: "center" as const,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 42,
    paddingVertical: 0,
  },
  dropdownTrigger: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 6,
    minWidth: 90,
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  filterOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 98,
  },
  filterDropdownMenu: {
    position: "absolute" as const,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 400,
    overflow: "hidden" as const,
    zIndex: 99,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterDropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
  },
  filterDropdownItemText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  filterDivider: {
    height: 1,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardThumb: {
    width: 80,
    height: 80,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  cardThumbPlaceholder: {
    width: 80,
    height: 80,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  restaurantName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  cuisineText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  smallBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  smallBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  distanceText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingScore: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  ratingCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginLeft: 2,
  },
  lastVerifiedText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  creditBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  creditText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  creditLink: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  modalContainer: {
    flex: 1,
  },
  detailHeader: {
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
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  detailPhoto: {
    width: SCREEN_WIDTH,
    height: 220,
  },
  detailPhotoPlaceholder: {
    width: SCREEN_WIDTH,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  detailContent: {
    padding: 20,
  },
  halalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  halalPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  detailName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  detailCuisine: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  detailRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  detailRatingScore: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  detailStars: {
    fontSize: 14,
    color: "#F59E0B",
  },
  detailRatingCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  detailDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 8,
  },
  detailSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  expandableHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 4,
  },
  expandableHeaderText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  detailInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  detailInfoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  hoursSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  hoursSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  hoursSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  hoursText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingVertical: 3,
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  detailActionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  communitySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 14,
  },
  communitySectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  communityRatingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 4,
  },
  communityAvg: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  communityStars: {
    fontSize: 14,
    color: "#F59E0B",
  },
  communityCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  communityEmpty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic" as const,
    marginBottom: 4,
  },
  userRatingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginTop: 8,
  },
  userRatingLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  checkinHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  lastVerified: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  checkinCommentText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic" as const,
    lineHeight: 17,
  },
  checkinBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  checkinBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  checkinForm: {
    marginTop: 12,
    gap: 10,
  },
  checkinInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    textAlignVertical: "top" as const,
  },
  checkinFormActions: {
    flexDirection: "row" as const,
    gap: 10,
    justifyContent: "flex-end" as const,
  },
  checkinFormBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  checkinFormBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
