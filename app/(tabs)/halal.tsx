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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useTheme } from "@/lib/theme-context";

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
  } | null;
  rating: number | null;
  user_ratings_total: number | null;
  website: string | null;
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
  const half = rating - full >= 0.3 && rating - full < 0.8;
  let stars = "★".repeat(full);
  if (half) stars += "½";
  return stars;
}

export default function HalalScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [halalFilter, setHalalFilter] = useState("ALL");
  const [cuisineFilter, setCuisineFilter] = useState("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [showCuisineDropdown, setShowCuisineDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

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

  const openMaps = useCallback((restaurant: HalalRestaurant) => {
    if (restaurant.lat && restaurant.lng) {
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(restaurant.name)}@${restaurant.lat},${restaurant.lng}`,
        android: `geo:0,0?q=${restaurant.lat},${restaurant.lng}(${encodeURIComponent(restaurant.name)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`,
      });
      Linking.openURL(url);
    } else if (restaurant.formatted_address) {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.formatted_address)}`
      );
    }
  }, []);

  const renderRestaurant = useCallback(
    ({ item }: { item: HalalRestaurant }) => {
      const badge = getHalalBadge(item.is_halal);
      const openStatus = isCurrentlyOpen(item.opening_hours);
      const cuisines = item.cuisine_types
        ? item.cuisine_types.map(formatCuisine).join(", ")
        : "";

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
          onPress={() => openMaps(item)}
          testID={`restaurant-${item.id}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              {item.emoji ? (
                <Text style={styles.emoji}>{item.emoji}</Text>
              ) : (
                <Ionicons name="restaurant" size={20} color={colors.gold} />
              )}
              <View style={styles.titleAndMeta}>
                <Text
                  style={[styles.restaurantName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
                <View style={styles.metaRow}>
                  {item.rating && item.rating > 0 ? (
                    <View style={styles.ratingContainer}>
                      <Text style={[styles.ratingScore, { color: colors.gold }]}>
                        {Number(item.rating).toFixed(1)}
                      </Text>
                      <Text style={styles.ratingStars}>
                        {renderStars(Number(item.rating))}
                      </Text>
                      {item.user_ratings_total ? (
                        <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
                          ({item.user_ratings_total.toLocaleString()})
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {item._distance !== undefined ? (
                    <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                      {formatDistance(item._distance)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={[styles.halalBadge, { backgroundColor: isDark ? badge.bg + "40" : badge.bg }]}>
              <Text style={[styles.halalBadgeText, { color: isDark ? (badge.color === "#166534" ? "#86EFAC" : badge.color === "#92400E" ? "#FCD34D" : badge.color) : badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {cuisines ? (
            <Text
              style={[styles.cuisineText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {cuisines}
            </Text>
          ) : null}

          {item.formatted_address ? (
            <View style={styles.infoRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[styles.infoText, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {item.formatted_address}
              </Text>
            </View>
          ) : null}

          <View style={styles.cardFooter}>
            {item.formatted_phone ? (
              <Pressable
                style={({ pressed }) => [
                  styles.actionChip,
                  { backgroundColor: colors.emerald + "12", opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  Linking.openURL(`tel:${item.formatted_phone}`);
                }}
              >
                <Ionicons name="call-outline" size={13} color={colors.emerald} />
                <Text style={[styles.actionChipText, { color: colors.emerald }]}>
                  Call
                </Text>
              </Pressable>
            ) : null}

            {item.website ? (
              <Pressable
                style={({ pressed }) => [
                  styles.actionChip,
                  { backgroundColor: colors.gold + "15", opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  Linking.openURL(item.website!);
                }}
              >
                <Ionicons name="globe-outline" size={13} color={colors.gold} />
                <Text style={[styles.actionChipText, { color: colors.gold }]}>
                  Website
                </Text>
              </Pressable>
            ) : null}

            {openStatus !== null ? (
              <View
                style={[
                  styles.openBadge,
                  {
                    backgroundColor: openStatus
                      ? (isDark ? "#16653420" : "#DCFCE7")
                      : (isDark ? "#991B1B20" : "#FEE2E2"),
                  },
                ]}
              >
                <View
                  style={[
                    styles.openDot,
                    { backgroundColor: openStatus ? "#22C55E" : "#EF4444" },
                  ]}
                />
                <Text
                  style={[
                    styles.openText,
                    { color: openStatus ? (isDark ? "#86EFAC" : "#166534") : (isDark ? "#FCA5A5" : "#991B1B") },
                  ]}
                >
                  {openStatus ? "Open" : "Closed"}
                </Text>
              </View>
            ) : null}
          </View>

          {item.considerations && item.considerations.length > 0 ? (
            <View style={styles.considerationsRow}>
              {item.considerations.map((c) => (
                <View
                  key={c}
                  style={[styles.considerationChip, { backgroundColor: isDark ? "#92400E20" : "#FEF3C7" }]}
                >
                  <Text style={[styles.considerationText, { color: isDark ? "#FCD34D" : "#92400E" }]}>
                    {c === "SERVES_ALCOHOL"
                      ? "Serves Alcohol"
                      : c.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ")}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors, isDark, openMaps]
  );

  const selectedCuisineLabel = CUISINE_FILTERS.find((c) => c.key === cuisineFilter)?.label || "All Cuisines";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Halal Eats</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {restaurants.length} restaurants in NC
          {userLocation ? " · Sorted by distance" : ""}
        </Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search restaurants or addresses..."
          placeholderTextColor={colors.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          testID="halal-search"
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {HALAL_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  halalFilter === f.key
                    ? colors.emerald
                    : colors.surface,
                borderColor:
                  halalFilter === f.key ? colors.emerald : colors.border,
              },
            ]}
            onPress={() => setHalalFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color:
                    halalFilter === f.key ? "#fff" : colors.textSecondary,
                },
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
              backgroundColor:
                cuisineFilter !== "ALL"
                  ? colors.gold + "20"
                  : colors.surface,
              borderColor:
                cuisineFilter !== "ALL" ? colors.gold : colors.border,
            },
          ]}
          onPress={() => setShowCuisineDropdown(!showCuisineDropdown)}
        >
          <Text
            style={[
              styles.filterChipText,
              {
                color:
                  cuisineFilter !== "ALL" ? colors.gold : colors.textSecondary,
              },
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
                      color:
                        cuisineFilter === c.key
                          ? colors.emerald
                          : colors.text,
                      fontFamily:
                        cuisineFilter === c.key
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
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

      <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
      </Text>

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
            { paddingBottom: Platform.OS === "web" ? 34 : 20 },
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
          testID="halal-list"
        />
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 12,
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
    paddingHorizontal: 20,
    paddingVertical: 10,
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
    marginHorizontal: 20,
    marginBottom: 4,
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
  resultCount: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  listContent: {
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },
  titleAndMeta: {
    flex: 1,
  },
  emoji: {
    fontSize: 20,
    marginTop: 2,
  },
  restaurantName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingScore: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  ratingStars: {
    fontSize: 11,
    color: "#F59E0B",
  },
  ratingCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  distanceText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  halalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  halalBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cuisineText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginLeft: 28,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
    flexWrap: "wrap",
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  actionChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  considerationsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  considerationChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  considerationText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
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
    paddingVertical: 8,
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
});
