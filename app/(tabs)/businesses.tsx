import { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  Pressable,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";

interface Business {
  id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  phone: string;
  website: string;
}

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  Restaurant: { icon: "restaurant-outline", color: "#DC2626" },
  Grocery: { icon: "cart-outline", color: "#0891B2" },
  Finance: { icon: "cash-outline", color: "#059669" },
  Retail: { icon: "bag-handle-outline", color: "#7C3AED" },
  Automotive: { icon: "car-outline", color: "#EA580C" },
  "Real Estate": { icon: "home-outline", color: "#2563EB" },
};

function getCategoryInfo(category: string) {
  return CATEGORY_ICONS[category] || { icon: "business-outline", color: "#6B7280" };
}

const CATEGORIES = ["All", "Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate"];

export default function BusinessesScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const { data: businesses, isLoading } = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
    staleTime: 10 * 60 * 1000,
  });

  const filtered = businesses
    ? selectedCategory === "All"
      ? businesses
      : businesses.filter((b) => b.category === selectedCategory)
    : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
    setRefreshing(false);
  }, [queryClient]);

  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  const handleDirections = useCallback((address: string) => {
    const encoded = encodeURIComponent(address);
    if (Platform.OS === "ios") {
      Linking.openURL(`maps://maps.apple.com/?q=${encoded}`);
    } else {
      Linking.openURL(`https://maps.google.com/?q=${encoded}`);
    }
  }, []);

  const handleWebsite = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Business }) => {
      const catInfo = getCategoryInfo(item.category);

      return (
        <View style={[styles.businessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.categoryBadgeBg(catInfo.color) }]}>
              <Ionicons name={catInfo.icon as any} size={16} color={catInfo.color} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.businessName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.categoryLabel, { color: catInfo.color }]}>{item.category}</Text>
            </View>
          </View>

          <Text style={[styles.businessDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>

          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.address}
            </Text>
          </View>

          <View style={[styles.actionRow, { borderTopColor: colors.divider }]}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.actionButtonBg, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => handleCall(item.phone)}
            >
              <Ionicons name="call-outline" size={18} color={colors.emerald} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.actionButtonBg, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => handleDirections(item.address)}
            >
              <Ionicons name="navigate-outline" size={18} color={colors.emerald} />
            </Pressable>
            {item.website ? (
              <Pressable
                style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.actionButtonBg, opacity: pressed ? 0.7 : 1 }]}
                onPress={() => handleWebsite(item.website)}
              >
                <Ionicons name="globe-outline" size={18} color={colors.emerald} />
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [colors, handleCall, handleDirections, handleWebsite]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.headerSection,
          { paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Muslim Businesses</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Support local Muslim-owned businesses
        </Text>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const isActive = item === selectedCategory;
            return (
              <Pressable
                style={[
                  styles.filterChip,
                  isActive
                    ? { backgroundColor: colors.gold }
                    : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => {
                  setSelectedCategory(item);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isActive ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <MaterialCommunityIcons name="store-off-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No businesses found</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Try selecting a different category
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 14,
  },
  filterRow: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 34 : 100,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  businessCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  businessName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
  businessDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
