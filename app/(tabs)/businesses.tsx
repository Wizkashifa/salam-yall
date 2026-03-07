import { useCallback, useState, useEffect } from "react";
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
  Modal,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Image,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Business {
  id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  phone: string;
  website: string;
  place_id?: string;
  rating?: number;
  user_ratings_total?: number;
  photo_reference?: string;
  business_hours?: string[];
  lat?: number;
  lng?: number;
}

interface PlacesDetails {
  place_id?: string;
  rating?: number;
  user_ratings_total?: number;
  has_photo?: boolean;
  business_hours?: string[];
  lat?: number;
  lng?: number;
}

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  Restaurant: { icon: "restaurant-outline", color: "#DC2626" },
  Grocery: { icon: "cart-outline", color: "#0891B2" },
  Finance: { icon: "cash-outline", color: "#059669" },
  Retail: { icon: "bag-handle-outline", color: "#7C3AED" },
  Automotive: { icon: "car-outline", color: "#EA580C" },
  "Real Estate": { icon: "home-outline", color: "#2563EB" },
  Healthcare: { icon: "medkit-outline", color: "#DB2777" },
  Education: { icon: "school-outline", color: "#0D9488" },
  Services: { icon: "construct-outline", color: "#6366F1" },
  Technology: { icon: "hardware-chip-outline", color: "#4F46E5" },
};

function getCategoryInfo(category: string) {
  return CATEGORY_ICONS[category] || { icon: "business-outline", color: "#6B7280" };
}

const CATEGORIES = ["All", "Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Technology"];
const SUBMIT_CATEGORIES = ["Restaurant", "Grocery", "Finance", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Technology"];

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.3 && rating - full < 0.8;
  let stars = "\u2605".repeat(full);
  if (half) stars += "\u00BD";
  return stars;
}

function BusinessDetailModal({ business, visible, onClose, colors, isDark }: { business: Business | null; visible: boolean; onClose: () => void; colors: any; isDark: boolean }) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<PlacesDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!visible || !business) {
      setDetails(null);
      return;
    }
    const controller = new AbortController();
    const bizId = business.id;
    setLoadingDetails(true);
    const baseUrl = getApiUrl();
    const fetchUrl = `${baseUrl}/api/businesses/${bizId}/places-details`;
    fetch(fetchUrl, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (!controller.signal.aborted && d && !d.error) { setDetails(d); setLoadingDetails(false); } else if (!controller.signal.aborted) { setLoadingDetails(false); } })
      .catch(() => { if (!controller.signal.aborted) setLoadingDetails(false); });
    return () => controller.abort();
  }, [visible, business?.id]);

  if (!business) return null;

  const catInfo = getCategoryInfo(business.category);
  const rawRating = details?.rating ?? business.rating;
  const rating = rawRating != null ? Number(rawRating) : null;
  const reviewCount = details?.user_ratings_total || business.user_ratings_total;
  const hasPhoto = details?.has_photo || !!business.photo_reference;
  const photoUrl = hasPhoto ? `${getApiUrl()}/api/businesses/${business.id}/photo` : null;
  const hours = details?.business_hours || business.business_hours;

  const openMaps = () => {
    const lat = details?.lat || business.lat;
    const lng = details?.lng || business.lng;
    if (lat && lng) {
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(business.name)}@${lat},${lng}`,
        android: `geo:0,0?q=${lat},${lng}(${encodeURIComponent(business.name)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      });
      Linking.openURL(url);
    } else {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.detailHeader, { borderBottomColor: colors.divider, paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={8} style={[styles.closeButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.detailPhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.detailPhotoPlaceholder, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }]}>
              <Ionicons name={catInfo.icon as any} size={48} color={catInfo.color} />
            </View>
          )}

          <View style={styles.detailContent}>
            <View style={[styles.categoryPill, { backgroundColor: colors.categoryBadgeBg(catInfo.color) }]}>
              <Ionicons name={catInfo.icon as any} size={12} color={catInfo.color} />
              <Text style={[styles.categoryPillText, { color: catInfo.color }]}>{business.category}</Text>
            </View>

            <Text style={[styles.detailName, { color: colors.text }]}>{business.name}</Text>

            {rating != null && !isNaN(rating) && rating > 0 ? (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingScore, { color: colors.gold }]}>{Number(rating).toFixed(1)}</Text>
                <Text style={styles.ratingStars}>{renderStars(Number(rating))}</Text>
                {reviewCount ? (
                  <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>({(reviewCount || 0).toLocaleString()} reviews)</Text>
                ) : null}
              </View>
            ) : loadingDetails ? (
              <ActivityIndicator size="small" color={colors.gold} style={{ marginVertical: 4 }} />
            ) : null}

            {business.description ? (
              <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{business.description}</Text>
            ) : null}

            <View style={[styles.detailSection, { borderTopColor: colors.divider }]}>
              <Pressable style={styles.detailInfoRow} onPress={openMaps}>
                <Ionicons name="location-outline" size={18} color={colors.emerald} />
                <Text style={[styles.detailInfoText, { color: colors.text }]}>{business.address}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>

              {business.phone ? (
                <Pressable style={styles.detailInfoRow} onPress={() => Linking.openURL(`tel:${business.phone}`)}>
                  <Ionicons name="call-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.detailInfoText, { color: colors.text }]}>{business.phone}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : null}

              {business.website ? (
                <Pressable style={styles.detailInfoRow} onPress={() => Linking.openURL(business.website)}>
                  <Ionicons name="globe-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.detailInfoText, { color: colors.text }]} numberOfLines={1}>{business.website.replace(/^https?:\/\//, "")}</Text>
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
              {business.phone ? (
                <Pressable
                  style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => Linking.openURL(`tel:${business.phone}`)}
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
              {business.website ? (
                <Pressable
                  style={({ pressed }) => [styles.detailActionBtn, { backgroundColor: isDark ? "#4B5563" : "#374151", opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => Linking.openURL(business.website)}
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

function SubmitBusinessModal({ visible, onClose, colors, isDark }: { visible: boolean; onClose: () => void; colors: any; isDark: boolean }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/businesses/submit", {
        name, category, description, address, phone, website, email,
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
    },
    onError: (err: any) => {
      Alert.alert("Submission Error", err.message || "Failed to submit business. Please try again.");
    },
  });

  const resetForm = useCallback(() => {
    setName("");
    setCategory("");
    setDescription("");
    setAddress("");
    setPhone("");
    setWebsite("");
    setEmail("");
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) { Alert.alert("Required", "Please enter the business name"); return; }
    if (!category) { Alert.alert("Required", "Please select a category"); return; }
    if (!address.trim()) { Alert.alert("Required", "Please enter the business address"); return; }
    if (!email.trim()) { Alert.alert("Required", "Please enter your email for verification"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { Alert.alert("Invalid Email", "Please enter a valid email address"); return; }
    submitMutation.mutate();
  }, [name, category, address, email, submitMutation]);

  if (submitted) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.divider, paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Submitted!</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: colors.prayerIconBg }]}>
              <Ionicons name="checkmark-circle" size={48} color={colors.emerald} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Thank you!</Text>
            <Text style={[styles.successMessage, { color: colors.textSecondary }]}>
              Your business has been submitted for review. Once verified, it will appear in the directory. We'll contact you at {email} if we need more information.
            </Text>
            <Pressable
              style={[styles.successButton, { backgroundColor: colors.emerald }]}
              onPress={handleClose}
            >
              <Text style={styles.successButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.divider, paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Submit Your Business</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.formNote, { color: colors.textSecondary }]}>
              All submissions are reviewed before being listed in the directory.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Business Name *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Enter business name"
              placeholderTextColor={colors.textSecondary}
              testID="business-name-input"
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Category *</Text>
            <View style={styles.categoryGrid}>
              {SUBMIT_CATEGORIES.map((cat) => {
                const info = getCategoryInfo(cat);
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryOption,
                      { backgroundColor: colors.surface, borderColor: isSelected ? colors.emerald : colors.border },
                      isSelected && { borderWidth: 2 },
                    ]}
                    onPress={() => {
                      setCategory(cat);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons name={info.icon as any} size={16} color={isSelected ? colors.emerald : info.color} />
                    <Text style={[styles.categoryOptionText, { color: isSelected ? colors.emerald : colors.text }]}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your business"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Address *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Full business address"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Phone Number</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="(919) 555-0000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Website</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yourbusiness.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Your Email *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={[styles.emailHint, { color: colors.textSecondary }]}>
              Used for verification purposes only
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : submitMutation.isPending ? 0.6 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={submitMutation.isPending}
              testID="submit-business-button"
            >
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Submit for Review</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function BusinessesScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

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

  const renderItem = useCallback(
    ({ item }: { item: Business }) => {
      const catInfo = getCategoryInfo(item.category);
      const rating = item.rating ? Number(item.rating) : null;

      return (
        <Pressable
          style={({ pressed }) => [styles.businessCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.95 : 1 }]}
          onPress={() => {
            setSelectedBusiness(item);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          testID={`business-${item.id}`}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.categoryBadgeBg(catInfo.color) }]}>
              <Ionicons name={catInfo.icon as any} size={16} color={catInfo.color} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.businessName, { color: colors.text }]}>{item.name}</Text>
              <View style={styles.cardSubRow}>
                <Text style={[styles.categoryLabel, { color: catInfo.color }]}>{item.category}</Text>
                {rating && rating > 0 ? (
                  <View style={styles.cardRatingRow}>
                    <Text style={[styles.cardRatingScore, { color: colors.gold }]}>{rating.toFixed(1)}</Text>
                    <Text style={styles.cardRatingStars}>{renderStars(rating)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>

          {item.description ? (
            <Text style={[styles.businessDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.address}
            </Text>
          </View>
        </Pressable>
      );
    },
    [colors]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TickerBanner />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ paddingHorizontal: 20, paddingVertical: 14 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Muslim Businesses</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Support local Muslim-owned businesses
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, { backgroundColor: "rgba(255,255,255,0.2)", opacity: pressed ? 0.8 : 1 }]}
            onPress={() => {
              setShowSubmitModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            testID="add-business-button"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

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
      </LinearGradient>

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

      <BusinessDetailModal
        business={selectedBusiness}
        visible={!!selectedBusiness}
        onClose={() => setSelectedBusiness(null)}
        colors={colors}
        isDark={isDark}
      />

      <SubmitBusinessModal
        visible={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
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
    paddingBottom: Platform.OS === "web" ? 34 : 20,
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
  cardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  cardRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  cardRatingScore: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  cardRatingStars: {
    fontSize: 10,
    color: "#F59E0B",
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
  },
  addressText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
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
    position: "absolute",
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
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  categoryPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  detailName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  ratingScore: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  ratingStars: {
    fontSize: 13,
    color: "#F59E0B",
  },
  ratingCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  detailDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 16,
  },
  detailSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 8,
  },
  detailInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  detailInfoText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  hoursSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 16,
  },
  hoursSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  hoursSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  hoursText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  },
  detailActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  detailActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryOptionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  emailHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  successButton: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  successButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
