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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { useDeepLink } from "@/lib/deeplink-context";
import { getApiUrl } from "@/lib/query-client";
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

function RestaurantDetailModal({ restaurant, visible, onClose, colors, isDark }: {
  restaurant: HalalRestaurant | null; visible: boolean; onClose: () => void; colors: any; isDark: boolean;
}) {
  const insets = useSafeAreaInsets();
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
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.detailHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, justifyContent: "space-between" }]}>
          <Pressable onPress={onClose} hitSlop={8} style={[styles.closeButton, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
          <Pressable onPress={() => {
            const shareUrl = `${getApiUrl()}share/restaurant/${restaurant.id}`;
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

            {rating != null && !isNaN(rating) && rating > 0 ? (
              <View style={styles.detailRatingRow}>
                <Text style={[styles.detailRatingScore, { color: colors.gold }]}>{rating.toFixed(1)}</Text>
                <Text style={styles.detailStars}>{renderStars(rating)}</Text>
                {restaurant.user_ratings_total ? (
                  <Text style={[styles.detailRatingCount, { color: colors.textTertiary }]}>
                    ({restaurant.user_ratings_total.toLocaleString()} reviews)
                  </Text>
                ) : null}
              </View>
            ) : null}

            {restaurant.halal_comment ? (
              <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{restaurant.halal_comment}</Text>
            ) : null}

            <View style={[styles.detailSection, { borderTopColor: colors.divider }]}>
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
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function HalalScreen() {
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [halalFilter, setHalalFilter] = useState("ALL");
  const [cuisineFilter, setCuisineFilter] = useState("ALL");
  const [openNowFilter, setOpenNowFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<HalalRestaurant | null>(null);
  const { pendingTarget, consumeTarget } = useDeepLink();
  const [headerHeight, setHeaderHeight] = useState(0);

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
            { backgroundColor: colors.surface, opacity: pressed ? 0.95 : 1 },
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

              {item.rating && Number(item.rating) > 0 ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={[styles.ratingScore, { color: colors.text }]}>
                    {Number(item.rating).toFixed(1)}
                  </Text>
                  {item.user_ratings_total ? (
                    <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
                      ({item.user_ratings_total.toLocaleString()})
                    </Text>
                  ) : null}
                </View>
              ) : null}
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

      <View style={{ height: headerHeight }} />

      {showFilterDropdown ? (
        <>
          <Pressable style={styles.filterOverlay} onPress={() => setShowFilterDropdown(false)} />
          <View style={[styles.filterDropdownMenu, { backgroundColor: colors.surface, borderColor: colors.border, ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.15)" } as any : {}) }]}>
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
            { paddingBottom: isWeb ? 34 : 100 },
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
        onClose={() => setSelectedRestaurant(null)}
        colors={colors}
        isDark={isDark}
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
    marginHorizontal: 16,
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
    paddingTop: 12,
  },
  card: {
    borderRadius: 12,
    marginBottom: 10,
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
});
