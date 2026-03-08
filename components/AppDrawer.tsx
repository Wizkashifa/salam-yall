import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  Linking,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";
import { useSettings } from "@/lib/settings-context";
import {
  NEARBY_MASJIDS,
  CALC_METHOD_LABELS,
  matchEventsToMasjid,
  type CalcMethodKey,
  type Masjid,
} from "@/lib/prayer-utils";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
  organizer: string;
  imageUrl: string;
  registrationUrl: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 340);
const USE_NATIVE_DRIVER = Platform.OS !== "web";

type DrawerSection = "main" | "settings" | "masjids" | "feedback" | "calcMethod" | "masjidDetail";

export function AppDrawer() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { calcMethod, setCalcMethod, notificationsEnabled, setNotificationsEnabled, menuOpen, closeMenu } = useSettings();
  const [section, setSection] = useState<DrawerSection>("main");
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [selectedMasjid, setSelectedMasjid] = useState<Masjid | null>(null);

  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (menuOpen) {
      setVisible(true);
      setSection("main");
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, tension: 65, friction: 11 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: -DRAWER_WIDTH, useNativeDriver: USE_NATIVE_DRIVER, tension: 65, friction: 11 }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start(() => setVisible(false));
    }
  }, [menuOpen, slideAnim, overlayAnim]);

  const handleToggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Notifications Permission", "Please enable notifications in your device settings.");
          return;
        }
        setNotificationsEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else {
      setNotificationsEnabled(false);
      Notifications.cancelAllScheduledNotificationsAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notificationsEnabled, setNotificationsEnabled]);

  const openMasjidDirections = useCallback(async (address: string) => {
    const encoded = encodeURIComponent(address);
    try {
      if (Platform.OS === "ios") {
        const mapsUrl = `maps://maps.apple.com/?daddr=${encoded}&dirflg=d`;
        const canOpen = await Linking.canOpenURL(mapsUrl);
        await Linking.openURL(canOpen ? mapsUrl : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      } else {
        await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      }
    } catch {
      Alert.alert("Unable to Open Maps", "Could not open a maps application.");
    }
  }, []);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedbackText.trim()) {
      Alert.alert("Required", "Please describe your feedback");
      return;
    }
    const subject = feedbackType === "bug" ? "Bug Report" : "Feature Request";
    const body = `${subject}\n\n${feedbackText}\n\nFrom: ${feedbackEmail || "Anonymous"}`;
    const mailUrl = `mailto:feedback@salamyall.app?subject=${encodeURIComponent(`[Salam Y'all] ${subject}`)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailUrl).catch(() => {
      Alert.alert("Feedback Noted", "Thank you for your feedback! We'll review it soon.");
    });
    setFeedbackText("");
    setFeedbackEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeMenu();
  }, [feedbackType, feedbackText, feedbackEmail, closeMenu]);

  const masjidEvents = useMemo(() => {
    if (!selectedMasjid || !events) return [];
    const indices = matchEventsToMasjid(selectedMasjid, events);
    return indices.map(i => events[i]);
  }, [selectedMasjid, events]);

  if (!visible) return null;

  const renderMainMenu = () => (
    <>
      <Text style={[styles.drawerTitle, { color: colors.text }]}>Salam Y'all</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
        onPress={() => { setSection("settings"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="settings-outline" size={20} color={colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text }]}>Settings</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
        onPress={() => { setSection("masjids"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="mosque" size={20} color={colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text }]}>Masjid Directory</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
        onPress={() => { setSection("feedback"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text }]}>Bug / Feature Request</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    </>
  );

  const renderSettings = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Settings</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CALCULATION METHOD</Text>
      <Pressable
        style={[styles.settingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("calcMethod"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>Prayer Calculation</Text>
          <Text style={[styles.settingValue, { color: colors.gold }]}>{CALC_METHOD_LABELS[calcMethod]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
      <Pressable
        style={[styles.settingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleToggleNotifications}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>Adhan Alerts</Text>
          <Text style={[styles.settingSubtext, { color: colors.textSecondary }]}>Get notified at prayer times</Text>
        </View>
        <View style={[styles.toggle, notificationsEnabled ? { backgroundColor: colors.emerald } : { backgroundColor: colors.border }]}>
          <View style={[styles.toggleKnob, notificationsEnabled ? { transform: [{ translateX: 16 }] } : {}]} />
        </View>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>APPEARANCE</Text>
      <View style={[styles.themeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["system", "light", "dark"] as const).map((mode) => {
          const isActive = themeMode === mode;
          const icons = { system: "phone-portrait-outline", light: "sunny-outline", dark: "moon-outline" } as const;
          const labels = { system: "System", light: "Light", dark: "Dark" };
          return (
            <Pressable
              key={mode}
              style={[styles.themeOption, isActive && { backgroundColor: colors.emerald }]}
              onPress={() => { setThemeMode(mode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name={icons[mode]} size={16} color={isActive ? "#fff" : colors.textSecondary} />
              <Text style={[styles.themeOptionText, { color: isActive ? "#fff" : colors.text }]}>{labels[mode]}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const renderCalcMethodPicker = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("settings"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Calculation Method</Text>
      </Pressable>

      {(Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[]).map((key) => {
        const isActive = calcMethod === key;
        return (
          <Pressable
            key={key}
            style={[styles.calcMethodRow, { backgroundColor: isActive ? colors.prayerIconBg : "transparent" }]}
            onPress={() => { setCalcMethod(key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSection("settings"); }}
          >
            <Text style={[styles.calcMethodText, { color: isActive ? colors.emerald : colors.text }]}>
              {CALC_METHOD_LABELS[key]}
            </Text>
            {isActive ? <Ionicons name="checkmark" size={20} color={colors.emerald} /> : null}
          </Pressable>
        );
      })}
    </>
  );

  const renderMasjids = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Masjid Directory</Text>
      </Pressable>

      {NEARBY_MASJIDS.map((masjid, i) => (
        <Pressable
          key={i}
          style={({ pressed }) => [styles.masjidRow, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
          onPress={() => { setSelectedMasjid(masjid); setSection("masjidDetail"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.masjidIcon, { backgroundColor: colors.prayerIconBg }]}>
            <MaterialCommunityIcons name="mosque" size={16} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.masjidName, { color: colors.text }]} numberOfLines={1}>{masjid.name}</Text>
            <Text style={[styles.masjidAddr, { color: colors.textSecondary }]} numberOfLines={1}>{masjid.address}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      ))}
    </>
  );

  const renderMasjidDetail = () => {
    if (!selectedMasjid) return null;

    return (
      <>
        <Pressable
          style={styles.backRow}
          onPress={() => { setSection("masjids"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text }]}>Back</Text>
        </Pressable>

        <View style={styles.masjidDetailHeader}>
          <View style={[styles.masjidDetailIcon, { backgroundColor: colors.prayerIconBg }]}>
            <MaterialCommunityIcons name="mosque" size={28} color={colors.emerald} />
          </View>
          <Text style={[styles.masjidDetailName, { color: colors.text }]}>{selectedMasjid.name}</Text>
        </View>

        <View style={[styles.masjidDetailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={styles.masjidDetailRow}
            onPress={() => openMasjidDirections(selectedMasjid.address)}
          >
            <Ionicons name="location-outline" size={18} color={colors.emerald} />
            <Text style={[styles.masjidDetailText, { color: colors.text, flex: 1 }]}>{selectedMasjid.address}</Text>
            <Ionicons name="navigate-outline" size={14} color={colors.gold} />
          </Pressable>

          {selectedMasjid.website ? (
            <Pressable
              style={styles.masjidDetailRow}
              onPress={() => { Linking.openURL(selectedMasjid.website!).catch(() => {}); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="globe-outline" size={18} color={colors.emerald} />
              <Text style={[styles.masjidDetailText, { color: colors.gold, flex: 1 }]} numberOfLines={1}>
                {selectedMasjid.website!.replace(/^https?:\/\/(www\.)?/, "")}
              </Text>
              <Ionicons name="open-outline" size={14} color={colors.gold} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>UPCOMING EVENTS</Text>

        {masjidEvents.length > 0 ? (
          masjidEvents.map((ev) => {
            const date = new Date(ev.start);
            const day = date.getDate().toString();
            const month = date.toLocaleDateString("en-US", { month: "short" });
            const time = ev.isAllDay
              ? "All Day"
              : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

            return (
              <Pressable
                key={ev.id}
                style={({ pressed }) => [styles.eventCard, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  closeMenu();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[styles.eventDateBadge, { backgroundColor: colors.prayerIconBg }]}>
                  <Text style={[styles.eventDateDay, { color: colors.emerald }]}>{day}</Text>
                  <Text style={[styles.eventDateMonth, { color: colors.emerald }]}>{month}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>{ev.title}</Text>
                  <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{time}</Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={[styles.noEventsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>No upcoming events at this location</Text>
          </View>
        )}
      </>
    );
  };

  const renderFeedback = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Bug / Feature Request</Text>
      </Pressable>

      <View style={[styles.feedbackTypeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["bug", "feature"] as const).map((type) => {
          const isActive = feedbackType === type;
          return (
            <Pressable
              key={type}
              style={[styles.feedbackTypeBtn, isActive && { backgroundColor: colors.emerald }]}
              onPress={() => { setFeedbackType(type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons
                name={type === "bug" ? "bug-outline" : "bulb-outline"}
                size={16}
                color={isActive ? "#fff" : colors.textSecondary}
              />
              <Text style={[styles.feedbackTypeText, { color: isActive ? "#fff" : colors.text }]}>
                {type === "bug" ? "Bug Report" : "Feature Request"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[styles.feedbackInput, styles.feedbackTextArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder={feedbackType === "bug" ? "Describe the bug..." : "Describe the feature you'd like..."}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
      />

      <TextInput
        style={[styles.feedbackInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackEmail}
        onChangeText={setFeedbackEmail}
        placeholder="Email (optional)"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Pressable
        style={({ pressed }) => [styles.feedbackSubmit, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
        onPress={handleSubmitFeedback}
      >
        <Ionicons name="send" size={16} color="#fff" />
        <Text style={styles.feedbackSubmitText}>Send Feedback</Text>
      </Pressable>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.overlayBg, { opacity: overlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeMenu} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            { backgroundColor: colors.background, transform: [{ translateX: slideAnim }] },
          ]}
        >
          <View style={{ paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }}>
            <Pressable style={styles.closeBtn} onPress={closeMenu} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {section === "main" && renderMainMenu()}
            {section === "settings" && renderSettings()}
            {section === "calcMethod" && renderCalcMethodPicker()}
            {section === "masjids" && renderMasjids()}
            {section === "masjidDetail" && renderMasjidDetail()}
            {section === "feedback" && renderFeedback()}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
  },
  closeBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  drawerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  backLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  settingTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  settingValue: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  settingSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    padding: 2,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  themeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  themeOptionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  calcMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  calcMethodText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  masjidRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 12,
  },
  masjidIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  masjidName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  masjidAddr: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  feedbackTypeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  feedbackTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  feedbackTypeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  feedbackTextArea: {
    minHeight: 100,
  },
  feedbackSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  feedbackSubmitText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  masjidDetailHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  masjidDetailIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  masjidDetailName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center" as const,
  },
  masjidDetailCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  masjidDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  masjidDetailText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  eventDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  eventDateDay: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  eventDateMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    marginTop: -2,
  },
  eventTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  eventTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  noEventsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  noEventsText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center" as const,
  },
});
