import React, { useState, useRef, useCallback, useEffect } from "react";
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
  ScrollView,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NEARBY_MASJIDS, CALC_METHOD_LABELS, type Masjid, type CalcMethodKey } from "@/lib/prayer-utils";
import { useSettings, type AsrCalc } from "@/lib/settings-context";
import { useQuery } from "@tanstack/react-query";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const emerald = "#1B6B4A";
const deepGreen = "#0F3D2B";
const richGold = "#D4A843";

interface OnboardingFlowProps {
  onComplete: () => void;
}

function AnimatedContent({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  const anims = useRef(
    Array.from({ length: 4 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(24),
    }))
  ).current;

  useEffect(() => {
    if (isActive) {
      anims.forEach((a, i) => {
        Animated.parallel([
          Animated.timing(a.opacity, {
            toValue: 1,
            duration: 400,
            delay: i * 120,
            useNativeDriver: true,
          }),
          Animated.spring(a.translateY, {
            toValue: 0,
            tension: 50,
            friction: 8,
            delay: i * 120,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      anims.forEach((a) => {
        a.opacity.setValue(0);
        a.translateY.setValue(24);
      });
    }
  }, [isActive]);

  const childArray = React.Children.toArray(children);
  return (
    <>
      {childArray.map((child, i) => {
        const anim = anims[Math.min(i, anims.length - 1)];
        return (
          <Animated.View
            key={i}
            style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}
          >
            {child}
          </Animated.View>
        );
      })}
    </>
  );
}

function WelcomeScreen({ isActive }: { isActive: boolean }) {
  return (
    <View style={screenStyles.container}>
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 96, height: 96, borderRadius: 20 }}
          />
        </View>
        <Text style={screenStyles.title}>Salams y'all</Text>
        <Text style={screenStyles.subtitle}>Triangle NC Muslim Community</Text>
        <Text style={screenStyles.body}>
          Your companion for the Triangle NC Muslim community — prayer times, events, halal restaurants, and local businesses all in one place.
        </Text>
      </AnimatedContent>
    </View>
  );
}

function LocationScreen({ isActive }: { isActive: boolean }) {
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
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <Ionicons name="location" size={48} color={richGold} />
        </View>
        <Text style={screenStyles.title}>Enable Location</Text>
        <Text style={screenStyles.body}>
          We use your location to show accurate prayer times, find nearby masjids, and calculate distances to halal restaurants and businesses.
        </Text>
        <View>
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
                <Pressable style={[screenStyles.actionBtn, { backgroundColor: "#374151", marginTop: 12 }]} onPress={openSettings}>
                  <Ionicons name="settings" size={20} color="#FFF" />
                  <Text style={screenStyles.actionBtnText}>Open Settings</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </AnimatedContent>
    </View>
  );
}

function PrayerSettingsScreen({
  isActive,
  onCalcMethodChange,
  onAsrCalcChange,
  onNotifGranted,
  initialCalcMethod,
  initialAsrCalc,
}: {
  isActive: boolean;
  onCalcMethodChange: (m: CalcMethodKey) => void;
  onAsrCalcChange: (a: AsrCalc) => void;
  onNotifGranted: () => void;
  initialCalcMethod: CalcMethodKey;
  initialAsrCalc: AsrCalc;
}) {
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [selectedMethod, setSelectedMethod] = useState<CalcMethodKey>(initialCalcMethod);
  const [selectedAsr, setSelectedAsr] = useState<AsrCalc>(initialAsrCalc);

  const requestNotifications = useCallback(async () => {
    if (Platform.OS === "web") {
      setNotifStatus("denied");
      return;
    }
    try {
      const { status: permStatus } = await Notifications.requestPermissionsAsync();
      if (permStatus === "granted") {
        setNotifStatus("granted");
        onNotifGranted();
      } else {
        setNotifStatus("denied");
      }
    } catch {
      setNotifStatus("denied");
    }
  }, [onNotifGranted]);

  const topMethods: CalcMethodKey[] = ["NorthAmerica", "MuslimWorldLeague", "Egyptian", "Karachi", "UmmAlQura"];

  return (
    <View style={screenStyles.container}>
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <Ionicons name="notifications" size={48} color={richGold} />
        </View>
        <Text style={screenStyles.title}>Prayer Settings</Text>
        <ScrollView
          style={{ maxHeight: 380, width: "100%" }}
          contentContainerStyle={{ alignItems: "center", paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[screenStyles.body, { marginBottom: 16 }]}>
            Get notified when it's time to pray.
          </Text>
          {notifStatus === "idle" && (
            <Pressable style={[screenStyles.actionBtn, { marginBottom: 20 }]} onPress={requestNotifications}>
              <Ionicons name="notifications" size={20} color="#FFF" />
              <Text style={screenStyles.actionBtnText}>Enable Notifications</Text>
            </Pressable>
          )}
          {notifStatus === "granted" && (
            <View style={[screenStyles.statusRow, { marginBottom: 20 }]}>
              <Ionicons name="checkmark-circle" size={24} color={emerald} />
              <Text style={[screenStyles.statusText, { color: emerald }]}>Notifications enabled</Text>
            </View>
          )}
          {notifStatus === "denied" && (
            <View style={[screenStyles.statusRow, { marginBottom: 20 }]}>
              <Ionicons name="close-circle" size={24} color="#EF4444" />
              <Text style={[screenStyles.statusText, { color: "#EF4444" }]}>Not available</Text>
            </View>
          )}

          <Text style={settingsStyles.sectionLabel}>Calculation Method</Text>
          <View style={settingsStyles.optionsWrap}>
            {topMethods.map((key) => {
              const isSelected = selectedMethod === key;
              return (
                <Pressable
                  key={key}
                  style={[settingsStyles.optionRow, isSelected && settingsStyles.optionRowSelected]}
                  onPress={() => { setSelectedMethod(key); onCalcMethodChange(key); }}
                >
                  <Text style={[settingsStyles.optionText, isSelected && settingsStyles.optionTextSelected]} numberOfLines={1}>
                    {CALC_METHOD_LABELS[key]}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={richGold} />}
                </Pressable>
              );
            })}
          </View>

          <Text style={[settingsStyles.sectionLabel, { marginTop: 16 }]}>Asr Calculation</Text>
          <View style={settingsStyles.toggleRow}>
            <Pressable
              style={[settingsStyles.toggleBtn, selectedAsr === "standard" && settingsStyles.toggleBtnActive]}
              onPress={() => { setSelectedAsr("standard"); onAsrCalcChange("standard"); }}
            >
              <Text style={[settingsStyles.toggleText, selectedAsr === "standard" && settingsStyles.toggleTextActive]}>
                Standard (Shafi'i)
              </Text>
            </Pressable>
            <Pressable
              style={[settingsStyles.toggleBtn, selectedAsr === "hanafi" && settingsStyles.toggleBtnActive]}
              onPress={() => { setSelectedAsr("hanafi"); onAsrCalcChange("hanafi"); }}
            >
              <Text style={[settingsStyles.toggleText, selectedAsr === "hanafi" && settingsStyles.toggleTextActive]}>
                Hanafi
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </AnimatedContent>
    </View>
  );
}

const settingsStyles = StyleSheet.create({
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 10,
    alignSelf: "flex-start" as const,
    paddingHorizontal: 4,
  },
  optionsWrap: {
    width: "100%" as const,
    gap: 6,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  optionRowSelected: {
    borderColor: emerald,
    backgroundColor: "rgba(27,107,74,0.15)",
  },
  optionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    flex: 1,
    marginRight: 8,
  },
  optionTextSelected: {
    color: richGold,
  },
  toggleRow: {
    flexDirection: "row" as const,
    width: "100%" as const,
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  toggleBtnActive: {
    borderColor: emerald,
    backgroundColor: "rgba(27,107,74,0.15)",
  },
  toggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
  toggleTextActive: {
    color: richGold,
  },
});

function TrackerScreen({ isActive }: { isActive: boolean }) {
  return (
    <View style={screenStyles.container}>
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <Ionicons name="checkmark-done" size={48} color={richGold} />
        </View>
        <Text style={screenStyles.title}>Track Your Ibadah</Text>
        <View>
          <Text style={[screenStyles.body, { marginBottom: 16 }]}>
            Tap any prayer on the home screen to track your salah. Each tap cycles through:
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

          <View style={trackerStyles.divider} />

          <View style={trackerStyles.featureRow}>
            <Ionicons name="calendar-outline" size={20} color={richGold} />
            <Text style={trackerStyles.featureText}>
              Track missed Ramadan fasts — tap any date on your prayer calendar to log it
            </Text>
          </View>

          <Text style={[screenStyles.body, { marginBottom: 0, marginTop: 12, fontSize: 13, opacity: 0.5 }]}>
            View your full history anytime in the Worship tab.
          </Text>
        </View>
      </AnimatedContent>
    </View>
  );
}

const trackerStyles = StyleSheet.create({
  statesWrap: {
    gap: 12,
    marginBottom: 16,
    alignItems: "flex-start" as const,
    width: "100%" as const,
    maxWidth: 260,
    alignSelf: "center" as const,
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
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 14,
    width: "100%" as const,
  },
  featureRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    paddingHorizontal: 4,
  },
  featureText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 20,
    flex: 1,
  },
});

function CommunityScreen({ isActive }: { isActive: boolean }) {
  return (
    <View style={screenStyles.container}>
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <Ionicons name="people" size={48} color={richGold} />
        </View>
        <Text style={screenStyles.title}>Community-Powered</Text>
        <View>
          <View style={communityStyles.card}>
            <View style={communityStyles.cardHeader}>
              <Ionicons name="information-circle" size={20} color={richGold} />
              <Text style={communityStyles.cardTitle}>Halal Disclaimer</Text>
            </View>
            <Text style={communityStyles.cardBody}>
              Halal status is community-sourced. We encourage you to trust but verify with the restaurant directly.
            </Text>
          </View>

          <View style={[communityStyles.card, { marginTop: 12 }]}>
            <View style={communityStyles.cardHeader}>
              <Ionicons name="add-circle" size={20} color={richGold} />
              <Text style={communityStyles.cardTitle}>Add a Business</Text>
            </View>
            <Text style={communityStyles.cardBody}>
              Know a halal restaurant or Muslim-owned business that should be listed? Submit it through the Home tab menu and we'll review it.
            </Text>
          </View>
        </View>
      </AnimatedContent>
    </View>
  );
}

const communityStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 16,
    width: "100%" as const,
    maxWidth: 320,
  },
  cardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  cardBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 20,
  },
});

function MasjidScreen({ isActive, onSelect }: { isActive: boolean; onSelect: (name: string | null) => void }) {
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
      <AnimatedContent isActive={isActive}>
        <View style={screenStyles.iconWrap}>
          <MaterialCommunityIcons name="mosque" size={48} color={richGold} />
        </View>
        <Text style={screenStyles.title}>Your Masjid</Text>
        <Text style={screenStyles.body}>
          Select your preferred masjid to see its iqama times on the home screen. You can change this anytime.
        </Text>
      </AnimatedContent>
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
  const { setPreferredMasjid, setCalcMethod, setAsrCalc, setNotificationsEnabled, calcMethod, asrCalc, preferredMasjid } = useSettings();
  const selectedMasjidRef = useRef<string | null>(preferredMasjid);
  const selectedCalcMethodRef = useRef<CalcMethodKey>(calcMethod);
  const selectedAsrCalcRef = useRef<AsrCalc>(asrCalc);
  const calcMethodChangedRef = useRef(false);
  const asrCalcChangedRef = useRef(false);

  const totalPages = 6;

  const handleMasjidSelect = useCallback((name: string | null) => {
    selectedMasjidRef.current = name;
  }, []);

  const handleNotifGranted = useCallback(() => {
    setNotificationsEnabled(true);
  }, [setNotificationsEnabled]);

  const handleCalcMethodChange = useCallback((m: CalcMethodKey) => {
    selectedCalcMethodRef.current = m;
    calcMethodChangedRef.current = true;
  }, []);

  const handleAsrCalcChange = useCallback((a: AsrCalc) => {
    selectedAsrCalcRef.current = a;
    asrCalcChangedRef.current = true;
  }, []);

  const applySettingsAndComplete = useCallback(() => {
    if (selectedMasjidRef.current) {
      setPreferredMasjid(selectedMasjidRef.current);
    }
    if (calcMethodChangedRef.current) {
      setCalcMethod(selectedCalcMethodRef.current);
    }
    if (asrCalcChangedRef.current) {
      setAsrCalc(selectedAsrCalcRef.current);
    }
    onComplete();
  }, [onComplete, setPreferredMasjid, setCalcMethod, setAsrCalc]);

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
      setCurrentPage(currentPage + 1);
    } else {
      applySettingsAndComplete();
    }
  }, [currentPage, applySettingsAndComplete]);

  const goBack = useCallback(() => {
    if (currentPage > 0) {
      flatListRef.current?.scrollToIndex({ index: currentPage - 1, animated: true });
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  const skip = useCallback(() => {
    applySettingsAndComplete();
  }, [applySettingsAndComplete]);

  const renderPage = useCallback(({ index }: { item: number; index: number }) => {
    const isActive = currentPage === index;
    switch (index) {
      case 0: return <WelcomeScreen isActive={isActive} />;
      case 1: return <LocationScreen isActive={isActive} />;
      case 2: return <PrayerSettingsScreen isActive={isActive} onCalcMethodChange={handleCalcMethodChange} onAsrCalcChange={handleAsrCalcChange} onNotifGranted={handleNotifGranted} initialCalcMethod={calcMethod} initialAsrCalc={asrCalc} />;
      case 3: return <TrackerScreen isActive={isActive} />;
      case 4: return <CommunityScreen isActive={isActive} />;
      case 5: return <MasjidScreen isActive={isActive} onSelect={handleMasjidSelect} />;
      default: return null;
    }
  }, [currentPage, handleMasjidSelect, handleCalcMethodChange, handleAsrCalcChange, handleNotifGranted, calcMethod, asrCalc]);

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
        data={[0, 1, 2, 3, 4, 5]}
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
    alignSelf: "center" as const,
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
    alignSelf: "center" as const,
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
