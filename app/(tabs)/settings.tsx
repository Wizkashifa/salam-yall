import { useCallback, useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  Linking,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
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

type SettingsSection = "main" | "calcMethod" | "masjids" | "masjidDetail" | "feedback";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { calcMethod, setCalcMethod, notificationsEnabled, setNotificationsEnabled } = useSettings();
  const [section, setSection] = useState<SettingsSection>("main");
  const [selectedMasjid, setSelectedMasjid] = useState<Masjid | null>(null);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 5 * 60 * 1000,
  });

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
    const mailUrl = `mailto:feedback@ummahconnect.app?subject=${encodeURIComponent(`[Ummah Connect] ${subject}`)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailUrl).catch(() => {
      Alert.alert("Feedback Noted", "Thank you for your feedback!");
    });
    setFeedbackText("");
    setFeedbackEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [feedbackType, feedbackText, feedbackEmail]);

  const masjidEvents = useMemo(() => {
    if (!selectedMasjid || !events) return [];
    const indices = matchEventsToMasjid(selectedMasjid, events);
    return indices.map(i => events[i]);
  }, [selectedMasjid, events]);

  const renderMain = () => (
    <>
      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("calcMethod"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="calculator-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Calculation Method</Text>
          <Text style={[styles.menuSublabel, { color: colors.gold }]}>{CALC_METHOD_LABELS[calcMethod]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={handleToggleNotifications}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="notifications-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Adhan Alerts</Text>
          <Text style={[styles.menuSublabel, { color: colors.textSecondary }]}>Get notified at prayer times</Text>
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

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>COMMUNITY</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("masjids"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <MaterialCommunityIcons name="mosque" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Masjid Directory</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => { setSection("feedback"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Bug / Feature Request</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LEGAL</Text>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/privacy")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Privacy Policy</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
        onPress={() => Linking.openURL("https://muslim-life-hub.replit.app/support")}
      >
        <View style={[styles.menuIcon, { backgroundColor: colors.prayerIconBg }]}>
          <Ionicons name="help-circle-outline" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>Support</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
      </Pressable>

      <Text style={[styles.versionText, { color: colors.textTertiary }]}>Ummah Connect v1.0</Text>
    </>
  );

  const renderCalcMethod = () => (
    <>
      <Pressable
        style={styles.backRow}
        onPress={() => { setSection("main"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
        <Text style={[styles.backLabel, { color: colors.text }]}>Calculation Method</Text>
      </Pressable>

      {(Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[]).map((key) => {
        const isActive = calcMethod === key;
        return (
          <Pressable
            key={key}
            style={[styles.calcRow, { backgroundColor: isActive ? (isDark ? "#1C2E24" : "#E8F0EC") : colors.surface, borderColor: colors.border }]}
            onPress={() => { setCalcMethod(key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSection("main"); }}
          >
            <Text style={[styles.calcText, { color: isActive ? colors.emerald : colors.text }]}>
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
          style={({ pressed }) => [styles.masjidRow, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border }]}
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

        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={styles.detailRow} onPress={() => openMasjidDirections(selectedMasjid.address)}>
            <Ionicons name="location-outline" size={18} color={colors.emerald} />
            <Text style={[styles.detailText, { color: colors.text, flex: 1 }]}>{selectedMasjid.address}</Text>
            <Ionicons name="navigate-outline" size={14} color={colors.gold} />
          </Pressable>
          {selectedMasjid.website ? (
            <Pressable style={styles.detailRow} onPress={() => Linking.openURL(selectedMasjid.website!).catch(() => {})}>
              <Ionicons name="globe-outline" size={18} color={colors.emerald} />
              <Text style={[styles.detailText, { color: colors.gold, flex: 1 }]} numberOfLines={1}>
                {selectedMasjid.website!.replace(/^https?:\/\/(www\.)?/, "")}
              </Text>
              <Ionicons name="open-outline" size={14} color={colors.gold} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>UPCOMING EVENTS</Text>
        {masjidEvents.length > 0 ? masjidEvents.map((ev) => {
          const date = new Date(ev.start);
          const time = ev.isAllDay ? "All Day" : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          return (
            <View key={ev.id} style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.eventBadge, { backgroundColor: isDark ? "#1C2E24" : "#E8F0EC" }]}>
                <Text style={[styles.eventDay, { color: colors.emerald }]}>{date.getDate()}</Text>
                <Text style={[styles.eventMonth, { color: colors.emerald }]}>{date.toLocaleDateString("en-US", { month: "short" })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>{ev.title}</Text>
                <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{time}</Text>
              </View>
            </View>
          );
        }) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No upcoming events</Text>
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

      <View style={[styles.typeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["bug", "feature"] as const).map((type) => {
          const isActive = feedbackType === type;
          return (
            <Pressable
              key={type}
              style={[styles.typeBtn, isActive && { backgroundColor: colors.emerald }]}
              onPress={() => { setFeedbackType(type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name={type === "bug" ? "bug-outline" : "bulb-outline"} size={16} color={isActive ? "#fff" : colors.textSecondary} />
              <Text style={[styles.typeText, { color: isActive ? "#fff" : colors.text }]}>
                {type === "bug" ? "Bug Report" : "Feature Request"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder={feedbackType === "bug" ? "Describe the bug..." : "Describe the feature..."}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        value={feedbackEmail}
        onChangeText={setFeedbackEmail}
        placeholder="Email (optional)"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Pressable
        style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
        onPress={handleSubmitFeedback}
      >
        <Ionicons name="send" size={16} color="#fff" />
        <Text style={styles.submitText}>Send Feedback</Text>
      </Pressable>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TickerBanner />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ paddingHorizontal: 20, paddingVertical: 14 }}
      >
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Settings</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
          Customize your experience
        </Text>
      </LinearGradient>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === "web" ? 34 : 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {section === "main" && renderMain()}
        {section === "calcMethod" && renderCalcMethod()}
        {section === "masjids" && renderMasjids()}
        {section === "masjidDetail" && renderMasjidDetail()}
        {section === "feedback" && renderFeedback()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 20,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
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
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  menuSublabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
  calcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  calcText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  masjidRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  masjidIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  masjidName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  masjidAddr: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  masjidDetailHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  masjidDetailIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  masjidDetailName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    gap: 12,
  },
  eventBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  eventDay: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  eventMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  eventTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  typeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  typeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  textArea: {
    height: 120,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 30,
    marginBottom: 10,
  },
});
