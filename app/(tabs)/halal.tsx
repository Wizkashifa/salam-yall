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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";

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

const FOOD_PHOTOS: Record<string, string> = {
  INDIAN_PAKISTANI: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop",
  MEDITERRANEAN: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop",
  MIDDLE_EASTERN: "https://images.unsplash.com/photo-1547424850-28ac9e2aece5?w=400&h=300&fit=crop",
  TURKISH: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop",
  AMERICAN: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
  ITALIAN: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop",
  MEXICAN: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop",
  EAST_ASIAN: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop",
  CHINESE: "https://images.unsplash.com/photo-1552611052-33e04de1b100?w=400&h=300&fit=crop",
  JAPANESE: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&h=300&fit=crop",
  CENTRAL_ASIAN: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=400&h=300&fit=crop",
  SENEGALESE: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=300&fit=crop",
  GREEK: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
  SOUTH_INDIAN: "https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&h=300&fit=crop",
  NEPALI: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop",
  DEFAULT: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
};

function getFoodPhoto(cuisineTypes: string[] | null): string {
  if (cuisineTypes && cuisineTypes.length > 0) {
    for (const c of cuisineTypes) {
      if (FOOD_PHOTOS[c]) return FOOD_PHOTOS[c];
    }
  }
  return FOOD_PHOTOS.DEFAULT;
}

export default function HalalScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
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
        ? item.cuisine_types.map(formatCuisine).join(" · ")
        : "";
      const photoUrl = getFoodPhoto(item.cuisine_types);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.surface,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
          onPress={() => openMaps(item)}
          testID={`restaurant-${item.id}`}
        >
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: photoUrl }}
              style={styles.foodPhoto}
              resizeMode="cover"
            />
            <View style={[styles.halalBadgeOverlay, { backgroundColor: isDark ? badge.bg + "E0" : badge.bg }]}>
              <Text style={[styles.halalBadgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
            {openStatus !== null && (
              <View
                style={[
                  styles.openBadgeOverlay,
                  {
                    backgroundColor: openStatus ? "#DCFCE7E0" : "#FEE2E2E0",
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
                    styles.openBadgeText,
                    { color: openStatus ? "#166534" : "#991B1B" },
                  ]}
                >
                  {openStatus ? "Open" : "Closed"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <Text
              style={[styles.restaurantName, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            <View style={styles.metaRow}>
              {cuisines ? (
                <Text
                  style={[styles.cuisineText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {cuisines}
                </Text>
              ) : null}
              {item._distance !== undefined && cuisines ? (
                <Text style={[styles.metaSeparator, { color: colors.textTertiary }]}>·</Text>
              ) : null}
              {item._distance !== undefined ? (
                <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                  {formatDistance(item._distance)}
                </Text>
              ) : null}
            </View>

            <View style={styles.ratingRow}>
              {item.rating && item.rating > 0 ? (
                <>
                  <Ionicons name="star" size={14} color="#F59E0B" />
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

              <View style={{ flex: 1 }} />

              {item.formatted_phone ? (
                <Pressable
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(`tel:${item.formatted_phone}`);
                  }}
                >
                  <Ionicons name="call-outline" size={18} color={colors.emerald} />
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
                onPress={(e) => {
                  e.stopPropagation();
                  openMaps(item);
                }}
              >
                <Ionicons name="navigate-outline" size={18} color={colors.emerald} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, isDark, openMaps]
  );

  const selectedCuisineLabel = CUISINE_FILTERS.find((c) => c.key === cuisineFilter)?.label || "All Cuisines";

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <TickerBanner />
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.emerald,
            paddingTop: (Platform.OS === "web" ? webTopPadding : 0) + 8,
          },
        ]}
      >
        <Text style={styles.headerTitle}>Halal Eats</Text>
        <Pressable
          onPress={() => setShowSearch(!showSearch)}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name={showSearch ? "close" : "search"} size={22} color="#FFFFFF" />
        </Pressable>
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
                  backgroundColor:
                    halalFilter === f.key ? colors.emerald : colors.surface,
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
                    color: halalFilter === f.key ? "#fff" : colors.textSecondary,
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
                  cuisineFilter !== "ALL" ? colors.gold + "20" : colors.surface,
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
                  color: cuisineFilter !== "ALL" ? colors.gold : colors.textSecondary,
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
                      color:
                        cuisineFilter === c.key ? colors.emerald : colors.text,
                      fontFamily:
                        cuisineFilter === c.key ? "Inter_600SemiBold" : "Inter_400Regular",
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
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
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
    }),
  },
  photoContainer: {
    width: "100%",
    height: 180,
    position: "relative",
  },
  foodPhoto: {
    width: "100%",
    height: "100%",
  },
  halalBadgeOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  halalBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  openBadgeOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardBody: {
    padding: 14,
  },
  restaurantName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  cuisineText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  metaSeparator: {
    fontSize: 13,
    marginHorizontal: 6,
  },
  distanceText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingScore: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  ratingCount: {
    fontSize: 12,
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
});
