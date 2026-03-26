import { useCallback, useEffect, useRef, useState } from "react";
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
import { useTheme } from "@/lib/theme-context";
import { useSettings } from "@/lib/settings-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 340);
const USE_NATIVE_DRIVER = Platform.OS !== "web";

type DrawerSection = "main" | "feedback";

export function AppDrawer() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode, setThemeMode, ramadanMode, setRamadanMode } = useTheme();
  const { menuOpen, closeMenu, consumePendingDrawerSection } = useSettings();
  const [section, setSection] = useState<DrawerSection>("main");
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  useEffect(() => {
    if (menuOpen) {
      setVisible(true);
      const pending = consumePendingDrawerSection();
      setSection((pending as DrawerSection) || "main");
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

  const handleSubmitFeedback = useCallback(() => {
    if (!feedbackText.trim()) {
      Alert.alert("Required", "Please describe your feedback");
      return;
    }
    const subject = feedbackType === "bug" ? "Bug Report" : "Feature Request";
    const body = `${subject}\n\n${feedbackText}\n\nFrom: ${feedbackEmail || "Anonymous"}`;
    const mailUrl = `mailto:feedback@salamyall.net?subject=${encodeURIComponent(`[Salam Y'all] ${subject}`)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailUrl).catch(() => {
      Alert.alert("Feedback Noted", "Thank you for your feedback! We'll review it soon.");
    });
    setFeedbackText("");
    setFeedbackEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeMenu();
  }, [feedbackType, feedbackText, feedbackEmail, closeMenu]);

  if (!visible) return null;

  const renderMainMenu = () => (
    <>
      <Text style={[styles.drawerTitle, { color: colors.text }]}>Salam Y'all</Text>

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

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent", marginTop: 10 }]}
        onPress={() => { setRamadanMode(!ramadanMode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: ramadanMode ? "#6B3FA020" : colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="moon-waning-crescent" size={20} color={ramadanMode ? "#6B3FA0" : colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text, flex: 1 }]}>Ramadan Mode</Text>
        <View style={[styles.toggle, ramadanMode ? { backgroundColor: "#6B3FA0" } : { backgroundColor: colors.border }]}>
          <View style={[styles.toggleKnob, ramadanMode ? { transform: [{ translateX: 16 }] } : {}]} />
        </View>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LEGAL</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/privacy")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text }]}>Privacy Policy</Text>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/support")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="help-circle-outline" size={20} color={colors.emerald} />
        </View>
        <Text style={[styles.menuLabel, { color: colors.text }]}>Support</Text>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
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

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ATTRIBUTIONS</Text>

      <View style={[styles.attributionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable style={styles.attributionRow} onPress={() => Linking.openURL("https://halaleatsnc.com")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg, marginRight: 0 }]}>
            <Ionicons name="restaurant-outline" size={18} color="#DC2626" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.attributionName, { color: colors.text }]}>HalalEats NC</Text>
            <Text style={[styles.attributionDesc, { color: colors.textSecondary }]}>Halal restaurant directory for North Carolina</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
        <View style={[styles.attributionDivider, { backgroundColor: colors.divider }]} />
        <Pressable style={styles.attributionRow} onPress={() => Linking.openURL("https://www.nctrianglemuslims.org")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg, marginRight: 0 }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.attributionName, { color: colors.text }]}>NC Triangle Muslims</Text>
            <Text style={[styles.attributionDesc, { color: colors.textSecondary }]}>Community events and gatherings</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
        <View style={[styles.attributionDivider, { backgroundColor: colors.divider }]} />
        <Pressable style={styles.attributionRow} onPress={() => Linking.openURL("https://github.com/batoulapps/adhan-js")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg, marginRight: 0 }]}>
            <MaterialCommunityIcons name="mosque" size={18} color={colors.gold} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.attributionName, { color: colors.text }]}>Adhan by Batoul Apps</Text>
            <Text style={[styles.attributionDesc, { color: colors.textSecondary }]}>Prayer time calculation library</Text>
          </View>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={[styles.versionText, { color: colors.textTertiary }]}>Salam Y'all v1.1.2</Text>
    </>
  );

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
  attributionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  attributionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 14,
  },
  attributionDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  attributionName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  attributionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  versionText: {
    textAlign: "center" as const,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 30,
    marginBottom: 10,
  },
});
