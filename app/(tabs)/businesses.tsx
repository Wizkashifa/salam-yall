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
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { useDeepLink } from "@/lib/deeplink-context";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { trackEvent, trackScreenView } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { expandSearchTerms } from "@/lib/search-synonyms";

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
  specialty?: string;
  keywords?: string[];
  photo_url?: string;
  booking_url?: string;
  search_tags?: string[];
  member_note?: string;
  hospital_affiliation?: string;
  instagram_url?: string;
  community_rating?: number | null;
  community_rating_count?: number;
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
  Retail: { icon: "bag-handle-outline", color: "#7C3AED" },
  Automotive: { icon: "car-outline", color: "#EA580C" },
  "Real Estate": { icon: "home-outline", color: "#2563EB" },
  Healthcare: { icon: "medkit-outline", color: "#DB2777" },
  Education: { icon: "school-outline", color: "#0D9488" },
  Services: { icon: "construct-outline", color: "#6366F1" },
  Events: { icon: "calendar-outline", color: "#D946EF" },
  Creator: { icon: "videocam-outline", color: "#F59E0B" },
};

function getCategoryInfo(category: string) {
  return CATEGORY_ICONS[category] || { icon: "business-outline", color: "#6B7280" };
}

const CATEGORIES = ["All", "Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Events", "Creator"];
const SUBMIT_CATEGORIES = ["Grocery", "Retail", "Automotive", "Real Estate", "Healthcare", "Education", "Services", "Events", "Creator"];

const SPECIALTIES: Record<string, string[]> = {
  Healthcare: [
    "Primary Care", "Dentistry", "Optometry", "Ophthalmology", "Dermatology",
    "Pediatrics", "OB/GYN", "Cardiology", "Orthopedics", "Psychiatry",
    "Psychology", "Therapy / Counseling", "Chiropractic", "Physical Therapy",
    "Pharmacy", "Urgent Care", "Internal Medicine", "ENT",
    "Allergy / Immunology", "Nutrition / Dietetics", "Other",
  ],
  Events: [
    "Venue", "Caterer", "Photography", "Videography",
    "Decorator", "Florist", "DJ / Entertainment",
    "Henna Artist", "Wedding Planner",
  ],
  Creator: [
    "Artist", "Content Creator", "Photographer", "Videographer",
    "Graphic Designer", "Social Media", "Podcast", "YouTube", "Blogger",
  ],
};

const UNIVERSAL_TAGS = [
  "Women-owned", "Arabic-speaking", "Urdu-speaking", "Spanish-speaking",
];

const BUSINESS_KEYWORDS: Record<string, string[]> = {
  Healthcare: [
    "Female provider", "Male provider",
    "Accepts insurance", "Cash / self-pay", "Sliding scale",
    "Telehealth available", "Walk-ins welcome", "By appointment only",
    "Pediatric", "Halal medications",
    "Mental health", "Women's health", "Sports medicine",
    ...UNIVERSAL_TAGS,
  ],
  Restaurant: [
    "Halal-certified", "Zabiha", "Dine-in", "Takeout",
    "Delivery", "Catering", "Late night",
    ...UNIVERSAL_TAGS,
  ],
  Grocery: [
    "Halal meat", "Zabiha", "Imported goods",
    "Middle Eastern", "South Asian", "African", "Bakery",
    ...UNIVERSAL_TAGS,
  ],
  Events: [
    ...UNIVERSAL_TAGS,
  ],
  Creator: [
    ...UNIVERSAL_TAGS,
  ],
  _default: [
    ...UNIVERSAL_TAGS,
    "Veteran-owned", "By appointment only", "Walk-ins welcome",
    "Islamic finance", "Halal investing", "Financial planning",
  ],
};

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.3 && rating - full < 0.8;
  let stars = "\u2605".repeat(full);
  if (half) stars += "\u00BD";
  return stars;
}

function StarRatingInput({ value, onChange, size = 28, color = "#F59E0B" }: { value: number; onChange: (v: number) => void; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
          <Ionicons name={star <= value ? "star" : "star-outline"} size={size} color={star <= value ? color : "#D1D5DB"} />
        </Pressable>
      ))}
    </View>
  );
}

function BusinessDetailModal({ business, visible, onClose, colors, isDark }: { business: Business | null; visible: boolean; onClose: () => void; colors: any; isDark: boolean }) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<PlacesDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const { user, signInWithApple, getAuthHeaders } = useAuth();
  const [communityRating, setCommunityRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [userRating, setUserRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    if (!visible || !business) {
      setDetails(null);
      setCommunityRating({ avg: null, count: 0 });
      setUserRating(0);
      return;
    }
    const baseUrl = getApiUrl();
    const headers = getAuthHeaders();
    fetch(new URL(`/api/ratings/business/${business.id}`, baseUrl).toString(), {
      headers: headers.Authorization ? headers : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCommunityRating({ avg: data.avgRating, count: data.totalRatings });
          if (data.userRating) setUserRating(data.userRating);
        }
      })
      .catch(() => {});
  }, [visible, business?.id]);

  const handleRate = useCallback(async (rating: number) => {
    let authHeaders = getAuthHeaders();
    if (!user) {
      if (Platform.OS === "web") {
        Alert.alert("Sign In Required", "Use the mobile app to sign in with Apple and rate businesses.");
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
        entityType: "business",
        entityId: business?.id,
        rating,
      }, authHeaders);
      const data = await response.json();
      setCommunityRating({ avg: data.avgRating, count: data.totalRatings });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to submit rating");
    }
    setSubmittingRating(false);
  }, [user, business?.id, signInWithApple, getAuthHeaders]);

  useEffect(() => {
    if (!visible || !business) {
      setDetails(null);
      return;
    }
    const controller = new AbortController();
    const bizId = business.id;
    setLoadingDetails(true);
    const baseUrl = getApiUrl();
    const fetchUrl = new URL(`/api/businesses/${bizId}/places-details`, baseUrl).toString();
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
  const googlePhotoUrl = hasPhoto ? new URL(`/api/businesses/${business.id}/photo`, getApiUrl()).toString() : null;
  const photoUrl = business.photo_url || googlePhotoUrl;
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
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address || business.name)}`);
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
            const shareUrl = `${getApiUrl()}share/business/${business.id}`;
            Share.share({ message: `Salam Y'all check out this ${(business.category || "local").toLowerCase()} business - "${business.name}" - ${shareUrl}` });
          }} hitSlop={8} style={[styles.closeButton, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
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
            <View style={[styles.detailPhotoPlaceholder, { backgroundColor: colors.prayerIconBg }]}>
              <Ionicons name={catInfo.icon as any} size={48} color={catInfo.color} />
            </View>
          )}

          <View style={styles.detailContent}>
            <View style={[styles.categoryPill, { backgroundColor: colors.categoryBadgeBg(catInfo.color) }]}>
              <Ionicons name={catInfo.icon as any} size={12} color={catInfo.color} />
              <Text style={[styles.categoryPillText, { color: catInfo.color }]}>{business.category}</Text>
            </View>

            <Text style={[styles.detailName, { color: colors.text }]}>{business.name}</Text>

            {business.category !== "Services" && business.category !== "Healthcare" && rating != null && !isNaN(rating) && rating > 0 ? (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingScore, { color: colors.gold }]}>{Number(rating).toFixed(1)}</Text>
                <Text style={styles.ratingStars}>{renderStars(Number(rating))}</Text>
                {reviewCount ? (
                  <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>({(reviewCount || 0).toLocaleString()} Google reviews)</Text>
                ) : null}
              </View>
            ) : business.category !== "Services" && business.category !== "Healthcare" && loadingDetails ? (
              <ActivityIndicator size="small" color={colors.gold} style={{ marginVertical: 4 }} />
            ) : null}

            <View style={[styles.communitySection, { borderTopColor: colors.border }]}>
              {communityRating.avg != null && communityRating.count > 0 ? (
                <View style={styles.ratingRow}>
                  <Text style={[styles.ratingScore, { color: colors.gold }]}>{communityRating.avg.toFixed(1)}</Text>
                  <Text style={styles.ratingStars}>{renderStars(communityRating.avg)}</Text>
                  <Text style={[styles.ratingCount, { color: colors.textTertiary }]}>
                    ({communityRating.count} community {communityRating.count === 1 ? "rating" : "ratings"})
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>Rate this business:</Text>
                <StarRatingInput value={userRating} onChange={handleRate} size={24} />
              </View>
            </View>

            {business.member_note ? (
              <View style={[styles.specialtyRow, { backgroundColor: colors.prayerIconBg }]}>
                <Ionicons name="ribbon-outline" size={14} color={colors.emerald} />
                <Text style={[styles.specialtyText, { color: colors.text }]}>{business.member_note}</Text>
              </View>
            ) : null}

            {business.description ? (
              <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{business.description}</Text>
            ) : null}

            {business.specialty ? (
              <View style={[styles.specialtyRow, { backgroundColor: colors.prayerIconBg }]}>
                <Ionicons name="pricetag-outline" size={14} color={colors.emerald} />
                <Text style={[styles.specialtyText, { color: colors.text }]}>{business.specialty}</Text>
              </View>
            ) : null}

            {business.hospital_affiliation ? (
              <View style={[styles.specialtyRow, { backgroundColor: colors.prayerIconBg }]}>
                <Ionicons name="business-outline" size={14} color={colors.emerald} />
                <Text style={[styles.specialtyText, { color: colors.text }]}>{business.hospital_affiliation}</Text>
              </View>
            ) : null}

            {business.keywords && business.keywords.length > 0 ? (
              <View style={styles.keywordDisplayGrid}>
                {business.keywords.map((kw: string) => (
                  <View key={kw} style={[styles.keywordDisplayChip, { backgroundColor: colors.prayerIconBg }]}>
                    <Text style={[styles.keywordDisplayText, { color: colors.text }]}>{kw}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {(() => {
              const actions: Array<{ icon: string; label: string; color: string; onPress: () => void }> = [];
              if (business.phone) actions.push({ icon: "call", label: "Call", color: colors.emerald, onPress: () => Linking.openURL(`tel:${business.phone}`) });
              if (business.address && /\d/.test(business.address)) actions.push({ icon: "navigate", label: "Directions", color: colors.gold, onPress: openMaps });
              if (business.website) actions.push({ icon: "globe", label: "Website", color: isDark ? "#4B5563" : "#374151", onPress: () => Linking.openURL(business.website) });
              if (business.booking_url) actions.push({ icon: "calendar", label: "Book", color: "#2563EB", onPress: () => Linking.openURL(business.booking_url!) });
              if (business.instagram_url) actions.push({ icon: "logo-instagram", label: "Instagram", color: "#E1306C", onPress: () => Linking.openURL(business.instagram_url!) });
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

            {(business.address || business.phone || business.website || business.booking_url || (hours && hours.length > 0)) ? (
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
                    {business.address ? (
                      <Pressable style={styles.detailInfoRow} onPress={openMaps}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.text }]}>{business.address}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : business.lat ? (
                      <Pressable style={styles.detailInfoRow} onPress={openMaps}>
                        <Ionicons name="location-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.textSecondary, fontStyle: "italic" as const }]}>View on map</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : null}

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

                    {business.booking_url ? (
                      <Pressable style={styles.detailInfoRow} onPress={() => Linking.openURL(business.booking_url!)}>
                        <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
                        <Text style={[styles.detailInfoText, { color: colors.text }]}>Book an appointment</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </Pressable>
                    ) : null}

                    {hours && hours.length > 0 ? (
                      <View style={{ marginTop: 8 }}>
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
                  </View>
                ) : null}
              </View>
            ) : null}
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
  const [googleUrl, setGoogleUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [hospitalAffiliation, setHospitalAffiliation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [autoUrl, setAutoUrl] = useState("");
  const [autoLoaded, setAutoLoaded] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/businesses/lookup", { url: autoUrl });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.name) setName(data.name);
      if (data.address) setAddress(data.address);
      if (data.phone) setPhone(data.phone);
      if (data.website) setWebsite(data.website);
      if (data.google_url) setGoogleUrl(data.google_url);
      setAutoLoaded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Alert.alert("Lookup Failed", err.message || "Could not find that business. Try entering details manually.");
    },
  });

  const availableKeywords = BUSINESS_KEYWORDS[category] || BUSINESS_KEYWORDS._default;

  const toggleKeyword = useCallback((kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/businesses/submit", {
        name, category, description, address, phone, website, email, google_url: googleUrl,
        specialty, keywords: selectedKeywords, photo_url: photoUrl, booking_url: bookingUrl, instagram_url: instagramUrl, hospital_affiliation: hospitalAffiliation,
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
    setGoogleUrl("");
    setPhone("");
    setWebsite("");
    setEmail("");
    setSpecialty("");
    setSelectedKeywords([]);
    setPhotoUrl("");
    setBookingUrl("");
    setInstagramUrl("");
    setSubmitted(false);
    setAutoUrl("");
    setAutoLoaded(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) { Alert.alert("Required", "Please enter the business name"); return; }
    if (!category) { Alert.alert("Required", "Please select a category"); return; }
    if (SPECIALTIES[category] && !specialty) { Alert.alert("Required", "Please select a specialty"); return; }
    
    if (!email.trim()) { Alert.alert("Required", "Please enter your email for verification"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { Alert.alert("Invalid Email", "Please enter a valid email address"); return; }
    submitMutation.mutate();
  }, [name, category, address, googleUrl, email, submitMutation]);

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

            <View style={[styles.autoSection, { backgroundColor: colors.surface, borderColor: autoLoaded ? colors.emerald : colors.border }]}>
              <View style={styles.autoHeader}>
                <Ionicons name="flash" size={18} color={colors.emerald} />
                <Text style={[styles.autoTitle, { color: colors.text }]}>Quick Add</Text>
              </View>
              <Text style={[styles.autoHint, { color: colors.textSecondary }]}>
                Paste a Google Maps link and we'll fill in the details for you
              </Text>
              <View style={styles.autoRow}>
                <TextInput
                  style={[styles.autoInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, flex: 1 }]}
                  value={autoUrl}
                  onChangeText={(t) => { setAutoUrl(t); setAutoLoaded(false); }}
                  placeholder="Paste Google Maps link..."
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.autoButton,
                    { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : lookupMutation.isPending ? 0.6 : 1 },
                  ]}
                  onPress={() => {
                    if (!autoUrl.trim()) { Alert.alert("Paste a link", "Enter a Google Maps URL first"); return; }
                    lookupMutation.mutate();
                  }}
                  disabled={lookupMutation.isPending}
                >
                  {lookupMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : autoLoaded ? (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  ) : (
                    <Ionicons name="search" size={20} color="#fff" />
                  )}
                </Pressable>
              </View>
              {autoLoaded ? (
                <Text style={[styles.autoSuccess, { color: colors.emerald }]}>
                  Fields populated — review below, pick a category, then submit
                </Text>
              ) : null}
            </View>

            <View style={[styles.autoDivider, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.autoDividerText, { color: colors.textTertiary, backgroundColor: colors.background }]}>
                {autoLoaded ? "Review & complete" : "Or enter manually"}
              </Text>
            </View>

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
                      if (cat !== category) {
                        setCategory(cat);
                        setSelectedKeywords([]);
                        setSpecialty("");
                      }
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

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Address</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Full business address"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Google Maps URL</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={googleUrl}
              onChangeText={setGoogleUrl}
              placeholder="Share link from Google Maps"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              Optionally provide an address or Google Maps URL. Ensure the business Google listing is up to date.
            </Text>

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

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Booking / Appointment Link</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={bookingUrl}
              onChangeText={setBookingUrl}
              placeholder="https://booking.example.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Photo URL</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={photoUrl}
              onChangeText={setPhotoUrl}
              placeholder="Link to a photo of your business or headshot"
              placeholderTextColor={colors.textSecondary}
              keyboardType="url"
              autoCapitalize="none"
            />
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              Paste a link to a profile photo, logo, or storefront image
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Instagram URL</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={instagramUrl}
              onChangeText={setInstagramUrl}
              placeholder="https://instagram.com/yourbusiness"
              placeholderTextColor={colors.textSecondary}
              keyboardType="url"
              autoCapitalize="none"
            />

            {SPECIALTIES[category] ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{category === "Healthcare" ? "Specialty" : "Type"} *</Text>
                <View style={styles.categoryGrid}>
                  {SPECIALTIES[category].map((spec) => {
                    const isSelected = specialty === spec;
                    return (
                      <Pressable
                        key={spec}
                        style={[
                          styles.categoryOption,
                          { backgroundColor: colors.surface, borderColor: isSelected ? colors.emerald : colors.border },
                          isSelected && { borderWidth: 2 },
                        ]}
                        onPress={() => {
                          setSpecialty(spec);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={[styles.categoryOptionText, { color: isSelected ? colors.emerald : colors.text }]}>
                          {spec}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {category === "Healthcare" ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Affiliation</Text>
                <View style={styles.categoryGrid}>
                  {["UNC-Rex", "Duke", "WakeMed", "MyEyeDr"].map((hosp) => {
                    const isSelected = hospitalAffiliation === hosp;
                    return (
                      <Pressable
                        key={hosp}
                        style={[
                          styles.categoryOption,
                          { backgroundColor: colors.surface, borderColor: isSelected ? colors.emerald : colors.border },
                          isSelected && { borderWidth: 2 },
                        ]}
                        onPress={() => {
                          setHospitalAffiliation(isSelected ? "" : hosp);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={[styles.categoryOptionText, { color: isSelected ? colors.emerald : colors.text }]}>
                          {hosp}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
                  If your practice is not affiliated with these, leave blank or add your Google Maps listing above
                </Text>
              </>
            ) : null}

            {category ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Tags</Text>
                <View style={styles.keywordGrid}>
                  {availableKeywords.map((kw) => {
                    const isSelected = selectedKeywords.includes(kw);
                    return (
                      <Pressable
                        key={kw}
                        style={[
                          styles.keywordChip,
                          { backgroundColor: isSelected ? colors.emerald : colors.surface, borderColor: isSelected ? colors.emerald : colors.border },
                        ]}
                        onPress={() => {
                          toggleKeyword(kw);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        {isSelected ? <Ionicons name="checkmark" size={14} color="#fff" style={{ marginRight: 4 }} /> : null}
                        <Text style={[styles.keywordChipText, { color: isSelected ? "#fff" : colors.text }]}>
                          {kw}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const { pendingTarget, consumeTarget } = useDeepLink();

  useEffect(() => { trackScreenView("Directory"); }, []);

  const { data: businesses, isLoading } = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!businesses || businesses.length === 0) return;
    if (!pendingTarget || pendingTarget.type !== "business") return;
    const targetId = consumeTarget("business");
    if (targetId) {
      const b = businesses.find((biz) => String(biz.id) === targetId);
      if (b) setSelectedBusiness(b);
    }
  }, [businesses, pendingTarget]);

  const categoryCounts = businesses
    ? businesses.reduce<Record<string, number>>((acc, b) => {
        acc[b.category] = (acc[b.category] || 0) + 1;
        return acc;
      }, {})
    : {};

  const searchTrimmed = searchQuery.trim().toLowerCase();
  const expandedTerms = expandSearchTerms(searchTrimmed);

  const filtered = businesses
    ? businesses.filter((b) => {
        const matchesCategory = selectedCategory === "All" || b.category === selectedCategory;
        if (!searchTrimmed) return matchesCategory;
        const haystack = [
          b.name, b.description, b.address, b.specialty,
          ...(b.keywords || []), ...(b.search_tags || []),
        ].filter(Boolean).join(" ").toLowerCase();
        const matchesSearch = expandedTerms.some(term => haystack.includes(term));
        return matchesCategory && matchesSearch;
      })
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
            trackEvent("business_viewed", { name: item.name, id: item.id });
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
                {item.category !== "Services" && item.category !== "Healthcare" ? (
                  item.community_rating != null && item.community_rating > 0 ? (
                    <View style={styles.cardRatingRow}>
                      <Ionicons name="star" size={11} color={colors.gold} />
                      <Text style={[styles.cardRatingScore, { color: colors.gold }]}>{Number(item.community_rating).toFixed(1)}</Text>
                      <Text style={[styles.cardRatingCount, { color: colors.textTertiary }]}>({item.community_rating_count})</Text>
                    </View>
                  ) : rating && rating > 0 ? (
                    <View style={styles.cardRatingRow}>
                      <Text style={[styles.cardRatingScore, { color: colors.gold }]}>{rating.toFixed(1)}</Text>
                      <Text style={styles.cardRatingStars}>{renderStars(rating)}</Text>
                    </View>
                  ) : null
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

          {item.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          ) : item.lat ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.addressText, { color: colors.textTertiary }]} numberOfLines={1}>
                Service area business
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors]
  );

  const dropdownCategories = CATEGORIES.filter(c => c !== "All");
  const activeCategories = dropdownCategories.filter(c => (categoryCounts[c] || 0) > 0);
  const totalCount = businesses?.length || 0;

  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Muslim Businesses</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Support local Muslim-owned businesses
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, { backgroundColor: "rgba(255,255,255,0.15)", opacity: pressed ? 0.8 : 1 }]}
            onPress={() => {
              setShowSubmitModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            testID="add-business-button"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
        <TickerBanner />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={styles.searchFilterRow}>
            <View style={[styles.searchBar, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.6)" />
              <TextInput
                style={[styles.searchInput, { color: "#FFFFFF" }]}
                placeholder="Search businesses..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                testID="business-search-input"
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[styles.dropdownTrigger, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" }]}
              onPress={() => {
                setShowDropdown(!showDropdown);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              testID="category-dropdown"
            >
              {selectedCategory !== "All" ? (
                <Ionicons name={getCategoryInfo(selectedCategory).icon as any} size={16} color={getCategoryInfo(selectedCategory).color} />
              ) : (
                <Ionicons name="filter-outline" size={16} color="rgba(255,255,255,0.6)" />
              )}
              <Text style={[styles.dropdownTriggerText, { color: selectedCategory === "All" ? "rgba(255,255,255,0.6)" : "#FFFFFF" }]} numberOfLines={1}>
                {selectedCategory === "All" ? "All" : selectedCategory}
              </Text>
              <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={14} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        </View>
      </GlassHeader>

      {showDropdown ? (
        <>
          <Pressable style={styles.dropdownOverlay} onPress={() => setShowDropdown(false)} />
          <View style={[styles.dropdownMenu, { top: headerHeight + 4, backgroundColor: colors.surface, borderColor: colors.border, ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.15)" } as any : {}) }]}>
            <Pressable
              style={[styles.dropdownItem, selectedCategory === "All" && { backgroundColor: colors.prayerIconBg }]}
              onPress={() => { setSelectedCategory("All"); setShowDropdown(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="grid-outline" size={18} color={selectedCategory === "All" ? colors.emerald : colors.textSecondary} />
              <Text style={[styles.dropdownItemText, { color: selectedCategory === "All" ? colors.emerald : colors.text }]}>All Categories</Text>
              <Text style={[styles.dropdownCount, { color: colors.textTertiary }]}>{totalCount}</Text>
            </Pressable>
            {activeCategories.map((cat) => {
              const info = getCategoryInfo(cat);
              const count = categoryCounts[cat] || 0;
              const isActive = cat === selectedCategory;
              return (
                <Pressable
                  key={cat}
                  style={[styles.dropdownItem, isActive && { backgroundColor: colors.prayerIconBg }]}
                  onPress={() => { setSelectedCategory(cat); setShowDropdown(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name={info.icon as any} size={18} color={isActive ? colors.emerald : info.color} />
                  <Text style={[styles.dropdownItemText, { color: isActive ? colors.emerald : colors.text }]}>{cat}</Text>
                  <Text style={[styles.dropdownCount, { color: colors.textTertiary }]}>{count}</Text>
                </Pressable>
              );
            })}
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
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: headerHeight + 12 }]}
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
                {searchQuery ? "Try a different search term" : "Try selecting a different category"}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
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
  dropdownOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 98,
  },
  dropdownMenu: {
    position: "absolute" as const,
    left: 16,
    right: 16,
    zIndex: 100,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  dropdownCount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    minWidth: 24,
    textAlign: "right" as const,
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
  cardRatingCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
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
  communitySection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 4,
  },
  rateLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  autoSection: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  autoHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 6,
  },
  autoTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  autoHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    lineHeight: 18,
  },
  autoRow: {
    flexDirection: "row" as const,
    gap: 8,
    alignItems: "center" as const,
  },
  autoInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  autoButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  autoSuccess: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 10,
  },
  autoDivider: {
    borderBottomWidth: 1,
    alignItems: "center" as const,
    marginBottom: 4,
    marginTop: 4,
  },
  autoDividerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    position: "relative" as const,
    top: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    lineHeight: 16,
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
  specialtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  specialtyText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  keywordDisplayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  keywordDisplayChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  keywordDisplayText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  keywordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keywordChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  keywordChipText: {
    fontSize: 12,
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
