import { useState, useCallback, useMemo, useEffect } from "react";
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
  _distance?: number;
}

const HALAL_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "IS_HALAL", label: "Halal" },
  { key: "PARTIALLY_HALAL", label: "Partial" },
];

const CUISINE_FILTERS = [
  { key: "ALL", label: "All Cuisines" },
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

function isCurrentlyOpen(hours: HalalRestaurant["opening_hours"]): boolean | null {
  if (!hours || !hours.periods || hours.periods.length === 0) return null;
  const now = new Date();
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const today = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todayPeriod = hours.periods.find((p) => p.open.day === today);
  if (!todayPeriod) return false;

  const openMinutes = todayPeriod.open.time[0] * 60 + todayPeriod.open.time[1];
  const closeMinutes = todayPeriod.close.time[0] * 60 + todayPeriod.close.time[1];

  if (closeMinutes < openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
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
    const periods = openingHours.periods?.filter((p) => p.open.day === day) || [];
    if (periods.length === 0) return `${day.charAt(0) + day.slice(1).toLowerCase()}: Closed`;
    const ranges = periods.map((p) => `${formatTime(p.open.time)} – ${formatTime(p.close.time)}`);
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
            Share.share({ message: `${restaurant.name} — check it out on Salam Y'all! ${shareUrl}` });
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
                  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
                  const isToday = h.toLowerCase().startsWith(today.toLowerCase());
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

            <View style={styles.detailActions}>
              {restaurant.formatted_phone ? (
                <Pressable
                  style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => Linking.openURL(`tel:${restaurant.formatted_phone}`)}
                >
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.detailActionText}>Call</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: colors.gold, opacity: pressed ? 0.8 : 1 }]}
                onPress={openMaps}
              >
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={styles.detailActionText}>Directions</Text>
              </Pressable>
              {restaurant.website ? (
                <Pressable
                  style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: isDark ? "#4B5563" : "#374151", opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => Linking.openURL(restaurant.website!)}
                >
                  <Ionicons name="globe" size={18} color="#fff" />
                  <Text style={styles.detailActionText}>Website</Text>
                </Pressable>
              ) : null}
            </View>
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
  const [showSearch, setShowSearch] = useState(false);
  const [halalFilter, setHalalFilter] = useState("ALL");
  const [cuisineFilter, setCuisineFilter] = useState("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [showCuisineDropdown, setShowCuisineDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<HalalRestaurant | null>(null);
  const { pendingTarget, consumeTarget } = useDeepLink();
  const [headerHeight, setHeaderHeight] = useState(0);

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
  }, [restaurants, halalFilter, cuisineFilter, searchText, userLocation]);

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
          onPress={() => { setSelectedRestaurant(item); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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

  const selectedCuisineLabel = CUISINE_FILTERS.find((c) => c.key === cuisineFilter)?.label || "All Cuisines";
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
            onPress={() => setShowSearch(!showSearch)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name={showSearch ? "close" : "search"} size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </GlassHeader>

      <View style={{ paddingTop: headerHeight }}>
        <TickerBanner />
      </View>

      {showSearch && (
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search restaurants..."
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            autoFocus
            testID="halal-search"
          />
          {searchText ? (
            <Pressable onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {HALAL_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: halalFilter === f.key ? colors.emerald : colors.surface,
                  borderColor: halalFilter === f.key ? colors.emerald : colors.border,
                },
              ]}
              onPress={() => setHalalFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: halalFilter === f.key ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={[
              styles.filterChip,
              styles.cuisineChip,
              {
                backgroundColor: cuisineFilter !== "ALL" ? colors.gold + "20" : colors.surface,
                borderColor: cuisineFilter !== "ALL" ? colors.gold : colors.border,
              },
            ]}
            onPress={() => setShowCuisineDropdown(!showCuisineDropdown)}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: cuisineFilter !== "ALL" ? colors.gold : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {selectedCuisineLabel}
            </Text>
            <Ionicons
              name={showCuisineDropdown ? "chevron-up" : "chevron-down"}
              size={14}
              color={cuisineFilter !== "ALL" ? colors.gold : colors.textTertiary}
            />
          </Pressable>
        </ScrollView>
      </View>

      {showCuisineDropdown ? (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView nestedScrollEnabled bounces={false}>
            {CUISINE_FILTERS.map((c) => (
              <Pressable
                key={c.key}
                style={({ pressed }) => [
                  styles.dropdownItem,
                  {
                    backgroundColor:
                      cuisineFilter === c.key
                        ? colors.emerald + "15"
                        : pressed
                        ? colors.borderLight
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  setCuisineFilter(c.key);
                  setShowCuisineDropdown(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    {
                      color: cuisineFilter === c.key ? colors.emerald : colors.text,
                      fontFamily: cuisineFilter === c.key ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {c.label}
                </Text>
                {cuisineFilter === c.key ? (
                  <Ionicons name="checkmark" size={16} color={colors.emerald} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
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
            { paddingBottom: isWeb ? 34 : 20 },
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  filtersRow: {
    marginTop: 10,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  cuisineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dropdown: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 250,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  dropdownText: {
    fontSize: 14,
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
