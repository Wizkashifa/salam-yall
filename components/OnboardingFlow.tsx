import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
  FlatList,
  Animated,
  Linking,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { TriangleCrescentIcon } from "@/components/TriangleCrescentIcon";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NEARBY_MASJIDS, type Masjid } from "@/lib/prayer-utils";
import { useSettings } from "@/lib/settings-context";
import { useQuery } from "@tanstack/react-query";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const emerald = "#1B6B4A";
const deepGreen = "#0F3D2B";
const richGold = "#D4A843";

interface OnboardingFlowProps {
  onComplete: () => void;
}

function WelcomeScreen() {
  return (
    <View style={screenStyles.container}>
      <View style={screenStyles.iconWrap}>
        <TriangleCrescentIcon size={48} color={richGold} />
      </View>
      <Text style={screenStyles.title}>Salams y'all</Text>
      <Text style={screenStyles.subtitle}>Welcome to Salam Y'all</Text>
      <Text style={screenStyles.body}>
        Your companion for the Triangle NC Muslim community — prayer times, events, halal restaurants, and local businesses all in one place.
      </Text>
      <View style={screenStyles.disclaimerWrap}>
        <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.4)" />
        <Text style={screenStyles.disclaimerText}>
          Halal status is community-sourced. We encourage you to trust but verify.
        </Text>
      </View>
    </View>
  );
}

function LocationScreen() {
  const [status, setStatus] = useState<"idle" | "granted" | "denied">("idle");

  const requestLocation = useCallback(async () => {
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      setStatus(permStatus === "granted" ? "granted" : "denied");
    } catch {
      setStatus("denied");
    }
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS !== "web") {
      try { Linking.openSettings(); } catch {}
    }
  }, []);

  return (
    <View style={screenStyles.container}>
      <View style={screenStyles.iconWrap}>
        <Ionicons name="location" size={48} color={richGold} />
      </View>
      <Text style={screenStyles.title}>Enable Location</Text>
      <Text style={screenStyles.body}>
        We use your location to show accurate prayer times, find nearby masjids, and calculate distances to halal restaurants and businesses.
      </Text>
      {status === "idle" && (
        <Pressable style={screenStyles.actionBtn} onPress={requestLocation}>
          <Ionicons name="location" size={20} color="#FFF" />
          <Text style={screenStyles.actionBtnText}>Allow Location Access</Text>
        </Pressable>
      )}
      {status === "granted" && (
        <View style={screenStyles.statusRow}>
          <Ionicons name="checkmark-circle" size={24} color={emerald} />
          <Text style={[screenStyles.statusText, { color: emerald }]}>Location enabled</Text>
        </View>
      )}
      {status === "denied" && (
        <>
          <View style={screenStyles.statusRow}>
            <Ionicons name="close-circle" size={24} color="#EF4444" />
            <Text style={[screenStyles.statusText, { color: "#EF4444" }]}>Permission denied</Text>
          </View>
          {Platform.OS !== "web" && (
            <Pressable style={[screenStyles.actionBtn, { backgroundColor: "#374151" }]} onPress={openSettings}>
              <Ionicons name="settings" size={20} color="#FFF" />
              <Text style={screenStyles.actionBtnText}>Open Settings</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function NotificationScreen() {
  const [status, setStatus] = useState<"idle" | "granted" | "denied">("idle");

  const requestNotifications = useCallback(async () => {
    if (Platform.OS === "web") {
      setStatus("denied");
      return;
    }
    try {
      const { status: permStatus } = await Notifications.requestPermissionsAsync();
      setStatus(permStatus === "granted" ? "granted" : "denied");
    } catch {
      setStatus("denied");
    }
  }, []);

  return (
    <View style={screenStyles.container}>
      <View style={screenStyles.iconWrap}>
        <Ionicons name="notifications" size={48} color={richGold} />
      </View>
      <Text style={screenStyles.title}>Prayer Alerts</Text>
      <Text style={screenStyles.body}>
        Get notified when it's time to pray. We'll send gentle reminders for each prayer so you never miss a salah.
      </Text>
      {status === "idle" && (
        <Pressable style={screenStyles.actionBtn} onPress={requestNotifications}>
          <Ionicons name="notifications" size={20} color="#FFF" />
          <Text style={screenStyles.actionBtnText}>Enable Notifications</Text>
        </Pressable>
      )}
      {status === "granted" && (
        <View style={screenStyles.statusRow}>
          <Ionicons name="checkmark-circle" size={24} color={emerald} />
          <Text style={[screenStyles.statusText, { color: emerald }]}>Notifications enabled</Text>
        </View>
      )}
      {status === "denied" && (
        <View style={screenStyles.statusRow}>
          <Ionicons name="close-circle" size={24} color="#EF4444" />
          <Text style={[screenStyles.statusText, { color: "#EF4444" }]}>Not available</Text>
        </View>
      )}
    </View>
  );
}

function TrackerScreen() {
  return (
    <View style={screenStyles.container}>
      <View style={screenStyles.iconWrap}>
        <Ionicons name="checkmark-done" size={48} color={richGold} />
      </View>
      <Text style={screenStyles.title}>Prayer Tracker</Text>
      <Text style={screenStyles.body}>
        Tap any prayer on the home screen to track your salah. Each tap cycles through three states:
      </Text>
      <View style={trackerStyles.statesWrap}>
        <View style={trackerStyles.stateRow}>
          <View style={[trackerStyles.dot, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
          <Text style={trackerStyles.stateLabel}>Not tracked</Text>
        </View>
        <View style={trackerStyles.stateRow}>
          <View style={[trackerStyles.dot, { backgroundColor: richGold }]} />
          <Text style={trackerStyles.stateLabel}>Prayed</Text>
        </View>
        <View style={trackerStyles.stateRow}>
          <View style={[trackerStyles.dot, { backgroundColor: emerald }]} />
          <Text style={trackerStyles.stateLabel}>Prayed at the Masjid</Text>
        </View>
      </View>
      <Text style={[screenStyles.body, { marginBottom: 0, marginTop: 8, fontSize: 14, opacity: 0.6 }]}>
        View your monthly history anytime in the More tab.
      </Text>
    </View>
  );
}

const trackerStyles = StyleSheet.create({
  statesWrap: {
    gap: 14,
    marginBottom: 20,
    alignItems: "flex-start" as const,
    width: "100%" as const,
    maxWidth: 260,
  },
  stateRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  stateLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
  },
});

function MasjidScreen({ onSelect }: { onSelect: (name: string | null) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: fetchedMasjids } = useQuery<Masjid[]>({
    queryKey: ["/api/masjids"],
    staleTime: 60 * 60 * 1000,
  });
  const masjidList = fetchedMasjids && fetchedMasjids.length > 0 ? fetchedMasjids : NEARBY_MASJIDS;

  const handleSelect = useCallback((name: string) => {
    const newVal = selected === name ? null : name;
    setSelected(newVal);
    onSelect(newVal);
  }, [selected, onSelect]);

  return (
    <View style={screenStyles.container}>
      <View style={screenStyles.iconWrap}>
        <MaterialCommunityIcons name="mosque" size={48} color={richGold} />
      </View>
      <Text style={screenStyles.title}>Your Masjid</Text>
      <Text style={screenStyles.body}>
        Select your preferred masjid to see its iqama times on the home screen. You can change this anytime in settings.
      </Text>
      <FlatList
        data={masjidList}
        keyExtractor={(item) => item.name}
        scrollEnabled={true}
        style={screenStyles.masjidList}
        contentContainerStyle={screenStyles.masjidListContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = selected === item.name;
          return (
            <Pressable
              style={[
                screenStyles.masjidItem,
                isSelected && screenStyles.masjidItemSelected,
              ]}
              onPress={() => handleSelect(item.name)}
            >
              <View style={screenStyles.masjidInfo}>
                <Text
                  style={[
                    screenStyles.masjidName,
                    isSelected && screenStyles.masjidNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={screenStyles.masjidAddress} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={emerald} />
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const { setPreferredMasjid } = useSettings();
  const selectedMasjidRef = useRef<string | null>(null);

  const totalPages = 5;

  const handleMasjidSelect = useCallback((name: string | null) => {
    selectedMasjidRef.current = name;
  }, []);

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
      setCurrentPage(currentPage + 1);
    } else {
      if (selectedMasjidRef.current) {
        setPreferredMasjid(selectedMasjidRef.current);
      }
      onComplete();
    }
  }, [currentPage, onComplete, setPreferredMasjid]);

  const goBack = useCallback(() => {
    if (currentPage > 0) {
      flatListRef.current?.scrollToIndex({ index: currentPage - 1, animated: true });
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  const skip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const renderPage = useCallback(({ index }: { item: number; index: number }) => {
    switch (index) {
      case 0: return <WelcomeScreen />;
      case 1: return <LocationScreen />;
      case 2: return <NotificationScreen />;
      case 3: return <TrackerScreen />;
      case 4: return <MasjidScreen onSelect={handleMasjidSelect} />;
      default: return null;
    }
  }, [handleMasjidSelect]);

  const onMomentumScrollEnd = useCallback((e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <View style={styles.header}>
        {currentPage > 0 ? (
          <Pressable onPress={goBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={28} color="rgba(255,255,255,0.7)" />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
        <Pressable onPress={skip} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={[0, 1, 2, 3, 4]}
        renderItem={renderPage}
        keyExtractor={(item) => item.toString()}
        horizontal
        pagingEnabled
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.pager}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {Array.from({ length: totalPages }).map((_, i) => {
            const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [1, 1.3, 1],
              extrapolate: "clamp",
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    transform: [{ scale }],
                    opacity,
                    backgroundColor: i === currentPage ? richGold : "rgba(255,255,255,0.5)",
                  },
                ]}
              />
            );
          })}
        </View>
        <Pressable style={styles.nextBtn} onPress={goNext}>
          {currentPage === totalPages - 1 ? (
            <Text style={styles.nextBtnText}>Get Started</Text>
          ) : (
            <>
              <Text style={styles.nextBtnText}>Next</Text>
              <Ionicons name="chevron-forward" size={20} color="#FFF" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 32,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    marginBottom: 20,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    maxWidth: 320,
  },
  actionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: emerald,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  disclaimerWrap: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    maxWidth: 300,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
  },
  disclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    lineHeight: 17,
    flex: 1,
  },
  masjidList: {
    width: "100%" as const,
    maxHeight: 280,
  },
  masjidListContent: {
    paddingBottom: 16,
  },
  masjidItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  masjidItemSelected: {
    borderColor: emerald,
    backgroundColor: "rgba(27,107,74,0.15)",
  },
  masjidInfo: {
    flex: 1,
    marginRight: 12,
  },
  masjidName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  masjidNameSelected: {
    color: richGold,
  },
  masjidAddress: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },
});

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: deepGreen,
    zIndex: 9998,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
  },
  pager: {
    flex: 1,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: emerald,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 6,
  },
  nextBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#FFFFFF",
  },
});
