import { useEffect, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  LayoutAnimation,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";
import { useSettings } from "@/lib/settings-context";
import { registerPushToken } from "@/lib/push-utils";
import {
  getPrayerTimes,
  getNextPrayer,
  getCountdown,
  formatTime,
  toHijriDate,
  findNearestMasjid,
  getAllMasjidsByDistance,
  calculateQiblaBearing,
  checkNearMosque,
  matchEventsToMasjid,
  NEARBY_MASJIDS,
  type PrayerTimeEntry,
  type Masjid,
} from "@/lib/prayer-utils";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function useCompassHeading() {
  const [heading, setHeading] = useState(0);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let subscription: any = null;

    (async () => {
      try {
        const { Magnetometer } = await import("expo-sensors");
        const isAvail = await Magnetometer.isAvailableAsync();
        if (!isAvail) return;
        setAvailable(true);

        Magnetometer.setUpdateInterval(100);
        subscription = Magnetometer.addListener((data) => {
          let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angle = (angle + 360) % 360;
          setHeading(angle);
        });
      } catch {}
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  return { heading, available };
}

function QiblaCompass({ qiblaBearing, colors, isDark }: { qiblaBearing: number; colors: any; isDark: boolean }) {
  const { heading, available } = useCompassHeading();
  const rotation = available ? qiblaBearing - heading : qiblaBearing;
  const arrowRotation = `${rotation}deg`;

  return (
    <View style={[styles.compassContainer, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0", borderColor: colors.borderLight }]}>
      <View style={[styles.compassRing, { borderColor: colors.gold }]}>
        <View style={[styles.compassArrowWrap, { transform: [{ rotate: arrowRotation }] }]}>
          <View style={[styles.compassArrowHead, { borderBottomColor: colors.emerald }]} />
          <View style={[styles.compassArrow, { backgroundColor: colors.emerald }]} />
        </View>
        <View style={[styles.compassDot, { backgroundColor: colors.gold }]} />
      </View>
      <View style={styles.compassLabels}>
        <Text style={[styles.compassTitle, { color: colors.text }]}>Qibla</Text>
        <Text style={[styles.compassBearing, { color: colors.textSecondary }]}>{Math.round(qiblaBearing)}°</Text>
      </View>
    </View>
  );
}

function SectionHeader({ title, colors, rightElement }: { title: string; colors: any; rightElement?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {rightElement}
    </View>
  );
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { calcMethod, notificationsEnabled, setNotificationsEnabled, openMenu } = useSettings();
  const [prayers, setPrayers] = useState<PrayerTimeEntry[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTimeEntry | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [hijriDate, setHijriDate] = useState("");
  const [nearestMasjid, setNearestMasjid] = useState<{ name: string; distanceMiles: number; masjid: Masjid } | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [qiblaBearing, setQiblaBearing] = useState(58.5);
  const [userCoords, setUserCoords] = useState({ lat: 35.7796, lon: -78.6382 });
  const [nearMosque, setNearMosque] = useState<Masjid | null>(null);
  const [silenceAlertDismissed, setSilenceAlertDismissed] = useState(false);
  const [tonightOpen, setTonightOpen] = useState(false);
  const [prayWhereOpen, setPrayWhereOpen] = useState(false);

  const { data: calendarEvents } = useQuery<any[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const nearbyMasjids = useMemo(() => {
    return getAllMasjidsByDistance(userCoords.lat, userCoords.lon).slice(0, 3);
  }, [userCoords]);

  const tonightEvents = useMemo(() => {
    if (!calendarEvents) return [];
    const now = new Date();
    const endOfTonight = new Date(now);
    endOfTonight.setDate(endOfTonight.getDate() + 1);
    endOfTonight.setHours(2, 0, 0, 0);

    const allNearby = getAllMasjidsByDistance(userCoords.lat, userCoords.lon).slice(0, 8);

    return calendarEvents
      .filter((ev: any) => {
        const start = new Date(ev.start);
        const end = ev.end ? new Date(ev.end) : start;
        return !ev.isAllDay && ((start >= now && start <= endOfTonight) || (start <= now && end >= now));
      })
      .slice(0, 4)
      .map((ev: any) => {
        let venue = "";
        for (const item of allNearby) {
          const matched = matchEventsToMasjid(item.masjid, [ev]);
          if (matched.length > 0) {
            venue = item.masjid.name.replace(/\s*\(.*\)/, "");
            break;
          }
        }
        if (!venue) {
          venue = ev.organizer || (ev.location || "").split(",")[0] || "";
        }
        return {
          id: ev.id,
          title: ev.title,
          masjidName: venue,
          time: new Date(ev.start),
        };
      });
  }, [calendarEvents, userCoords]);

  const loadDefaultPrayers = useCallback((lat = 35.7796, lon = -78.6382) => {
    const now = new Date();
    const todayPrayers = getPrayerTimes(lat, lon, now, calcMethod);
    setPrayers(todayPrayers);
    setHijriDate(toHijriDate(now));
    setQiblaBearing(calculateQiblaBearing(lat, lon));
    setUserCoords({ lat, lon });

    const nearMosqueCheck = checkNearMosque(lat, lon);
    setNearMosque(nearMosqueCheck);

    const next = getNextPrayer(todayPrayers, now);
    if (next) {
      setNextPrayer(next);
      setCountdown(getCountdown(next.time, now));
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow, calcMethod);
      setNextPrayer(tomorrowPrayers[0]);
      setCountdown(getCountdown(tomorrowPrayers[0].time, now));
    }
  }, [calcMethod]);

  const loadPrayerData = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        let lat = 35.7796;
        let lon = -78.6382;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          setLocationPermission(true);
          const nearest = findNearestMasjid(lat, lon);
          setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
        } catch {
          setLocationPermission(false);
        }
        loadDefaultPrayers(lat, lon);
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationPermission(false);
        loadDefaultPrayers();
        setLoading(false);
        return;
      }
      setLocationPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;

      loadDefaultPrayers(latitude, longitude);

      const nearest = findNearestMasjid(latitude, longitude);
      setNearestMasjid({ name: nearest.masjid.name, distanceMiles: nearest.distanceMiles, masjid: nearest.masjid });
    } catch (err) {
      console.error("Error loading prayer data:", err);
      loadDefaultPrayers();
    } finally {
      setLoading(false);
    }
  }, [loadDefaultPrayers]);

  useEffect(() => {
    loadPrayerData();
  }, [loadPrayerData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (nextPrayer) {
        const now = new Date();
        const cd = getCountdown(nextPrayer.time, now);
        setCountdown(cd);
        if (cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0) {
          loadPrayerData();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextPrayer, loadPrayerData]);

  useEffect(() => {
    if (userCoords.lat && prayers.length > 0) {
      loadDefaultPrayers(userCoords.lat, userCoords.lon);
    }
  }, [calcMethod]);

  const schedulePrayerNotifications = useCallback(async (prayerList: PrayerTimeEntry[], lat: number, lon: number) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const now = new Date();
      const todayPrayers = prayerList.filter(p => p.name !== "sunrise" && p.time > now);

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowPrayers = getPrayerTimes(lat, lon, tomorrow, calcMethod).filter(p => p.name !== "sunrise");

      const allPrayers = [...todayPrayers, ...tomorrowPrayers];

      for (const prayer of allPrayers) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${prayer.label} Prayer Time`,
            body: `It's time for ${prayer.label} prayer (${formatTime(prayer.time)})`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: prayer.time,
          },
        });
      }
    } catch (err) {
      console.error("Error scheduling notifications:", err);
    }
  }, [calcMethod]);

  useEffect(() => {
    if (notificationsEnabled && prayers.length > 0) {
      schedulePrayerNotifications(prayers, userCoords.lat, userCoords.lon);
    }
  }, [notificationsEnabled, prayers, schedulePrayerNotifications, userCoords]);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Notifications Permission",
            "Please enable notifications in your device settings to receive prayer time alerts.",
            [{ text: "OK" }]
          );
          return;
        }
        setNotificationsEnabled(true);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        registerPushToken();
        if (prayers.length > 0) {
          await schedulePrayerNotifications(prayers, userCoords.lat, userCoords.lon);
        }
      } catch (err) {
        console.error("Error enabling notifications:", err);
      }
    } else {
      setNotificationsEnabled(false);
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notificationsEnabled, prayers, schedulePrayerNotifications, setNotificationsEnabled]);

  const dismissSilenceAlert = useCallback(() => {
    setSilenceAlertDismissed(true);
  }, []);

  const toggleTonight = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTonightOpen((prev) => !prev);
  }, []);

  const togglePrayWhere = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPrayWhereOpen((prev) => !prev);
  }, []);

  const openMasjidNav = useCallback(async (masjid: Masjid) => {
    const encoded = encodeURIComponent(masjid.address);
    try {
      if (Platform.OS === "ios") {
        const mapsUrl = `maps://maps.apple.com/?daddr=${encoded}&dirflg=d`;
        const canOpen = await Linking.canOpenURL(mapsUrl);
        if (canOpen) {
          await Linking.openURL(mapsUrl);
        } else {
          await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
        }
      } else {
        await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
      }
    } catch {
      Alert.alert("Unable to Open Maps", "Could not open a maps application for directions.");
    }
  }, []);

  const now = new Date();
  const gregorianDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const padNum = (n: number) => n.toString().padStart(2, "0");
  const countdownMins = countdown.hours * 60 + countdown.minutes;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}
    >
      <View style={styles.headerSection}>
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [
              styles.menuButton,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => { openMenu(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            testID="menu-button"
            hitSlop={8}
          >
            <Ionicons name="menu" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerDateBlock}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{gregorianDate}</Text>
            {hijriDate ? (
              <Text style={[styles.hijriDate, { color: colors.gold }]}>{hijriDate}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => Linking.openURL("https://qiblafinder.withgoogle.com/intl/en/finder/ar")}>
            <QiblaCompass qiblaBearing={qiblaBearing} colors={colors} isDark={isDark} />
          </Pressable>
        </View>
      </View>

      {nearMosque && !silenceAlertDismissed ? (
        <View style={[styles.silenceAlert, { backgroundColor: isDark ? "#2A1818" : "#FEF2F2", borderColor: isDark ? "#3D2323" : "#FECACA" }]}>
          <View style={styles.silenceAlertContent}>
            <View style={[styles.silenceIconWrap, { backgroundColor: isDark ? "rgba(248, 113, 113, 0.15)" : "rgba(220, 38, 38, 0.08)" }]}>
              <MaterialCommunityIcons name="volume-off" size={16} color={isDark ? "#F87171" : "#DC2626"} />
            </View>
            <Text style={[styles.silenceAlertTitle, { color: isDark ? "#F87171" : "#DC2626", flex: 1 }]}>
              Near {nearMosque.name} — silence your phone
            </Text>
            <Pressable onPress={dismissSilenceAlert} hitSlop={8}>
              <Ionicons name="close" size={16} color={isDark ? "#FCA5A5" : "#991B1B"} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.heroCardWrapper}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroGoldAccent} />
          <View style={styles.heroBottomAccent} />
          {nextPrayer ? (
            <>
              <View style={styles.heroTopRow}>
                <View style={styles.heroLabelPill}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.heroLabelText}>Next Prayer</Text>
                </View>
                <Text style={styles.heroTimeAt}>at {formatTime(nextPrayer.time)}</Text>
              </View>
              <Text style={styles.heroPrayerName}>{nextPrayer.label}</Text>
              <View style={styles.heroTimerRow}>
                <View style={styles.heroTimerUnit}>
                  <Text style={styles.heroTimerNumber}>{padNum(countdown.hours)}</Text>
                  <Text style={styles.heroTimerLabel}>hrs</Text>
                </View>
                <Text style={styles.heroTimerSep}>:</Text>
                <View style={styles.heroTimerUnit}>
                  <Text style={styles.heroTimerNumber}>{padNum(countdown.minutes)}</Text>
                  <Text style={styles.heroTimerLabel}>min</Text>
                </View>
                <Text style={styles.heroTimerSep}>:</Text>
                <View style={styles.heroTimerUnit}>
                  <Text style={styles.heroTimerNumber}>{padNum(countdown.seconds)}</Text>
                  <Text style={styles.heroTimerLabel}>sec</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.heroLabelText}>All prayers completed for today</Text>
          )}
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.scrollableContent}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 80 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
      <View style={styles.cardsSection}>
        <Pressable
          style={({ pressed }) => [
            styles.dropdownHeader,
            {
              backgroundColor: colors.surface,
              borderColor: prayWhereOpen ? colors.emerald + "40" : colors.border,
              opacity: pressed ? 0.95 : 1,
              ...(prayWhereOpen ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
            },
          ]}
          onPress={togglePrayWhere}
          testID="pray-where-toggle"
        >
          <View style={[styles.dropdownIconWrap, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }]}>
            <MaterialCommunityIcons name="mosque" size={16} color={colors.emerald} />
          </View>
          <View style={styles.dropdownHeaderText}>
            <Text style={[styles.dropdownTitle, { color: colors.text }]}>Where Should I Pray?</Text>
            {!prayWhereOpen && nextPrayer ? (
              <Text style={[styles.dropdownSubtitle, { color: colors.textSecondary }]}>
                {nextPrayer.label} in {countdownMins > 0 ? `${countdownMins} min` : "< 1 min"}
              </Text>
            ) : null}
          </View>
          <View style={[styles.chevronCircle, { backgroundColor: isDark ? "#1A2E22" : "#EDF5F0" }]}>
            <Ionicons name={prayWhereOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
          </View>
        </Pressable>
        {prayWhereOpen ? (
          <View style={[styles.dropdownBody, { backgroundColor: colors.surface, borderColor: prayWhereOpen ? colors.emerald + "40" : colors.border }]}>
            {nextPrayer ? (
              <View style={styles.prayWhereSubhead}>
                <Text style={[styles.prayWhereTimerLabel, { color: colors.gold }]}>
                  {nextPrayer.label} in {countdownMins > 0 ? `${countdownMins} minutes` : "< 1 minute"}
                </Text>
                <Text style={[styles.prayWhereSubtext, { color: colors.textSecondary }]}>Best options near you</Text>
              </View>
            ) : null}
            {nearbyMasjids.map((item, idx) => (
              <Pressable
                key={item.masjid.name}
                style={({ pressed }) => [
                  styles.prayWhereRow,
                  idx < nearbyMasjids.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                  pressed && { opacity: 0.7, backgroundColor: colors.heroOverlay },
                ]}
                onPress={() => openMasjidNav(item.masjid)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.prayWhereName, { color: colors.text }]} numberOfLines={1}>
                    {item.masjid.name.replace(/\s*\(.*\)/, "")}
                  </Text>
                </View>
                <View style={styles.prayWhereDistPill}>
                  <Text style={[styles.prayWhereDist, { color: colors.gold }]}>{item.driveMinutes} min</Text>
                </View>
                <Ionicons name="navigate-outline" size={14} color={colors.emerald} style={{ marginLeft: 8 }} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {tonightEvents.length > 0 ? (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownHeader,
                {
                  backgroundColor: colors.surface,
                  borderColor: tonightOpen ? colors.gold + "40" : colors.border,
                  marginTop: 10,
                  opacity: pressed ? 0.95 : 1,
                  ...(tonightOpen ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
                },
              ]}
              onPress={toggleTonight}
              testID="tonight-toggle"
            >
              <View style={[styles.dropdownIconWrap, { backgroundColor: isDark ? "#2A2318" : "#FFF8E7" }]}>
                <Ionicons name="moon" size={14} color={colors.gold} />
              </View>
              <View style={styles.dropdownHeaderText}>
                <Text style={[styles.dropdownTitle, { color: colors.text }]}>Tonight Near You</Text>
                {!tonightOpen ? (
                  <Text style={[styles.dropdownSubtitle, { color: colors.textSecondary }]}>
                    {tonightEvents.length} event{tonightEvents.length !== 1 ? "s" : ""} happening
                  </Text>
                ) : null}
              </View>
              <View style={[styles.chevronCircle, { backgroundColor: isDark ? "#2A2318" : "#FFF8E7" }]}>
                <Ionicons name={tonightOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
              </View>
            </Pressable>
            {tonightOpen ? (
              <View style={[styles.dropdownBody, { backgroundColor: colors.surface, borderColor: tonightOpen ? colors.gold + "40" : colors.border }]}>
                {tonightEvents.map((ev, idx) => (
                  <View
                    key={ev.id}
                    style={[styles.tonightRow, idx < tonightEvents.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }]}
                  >
                    <View style={[styles.tonightDot, { backgroundColor: colors.gold }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tonightTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
                      {ev.masjidName ? (
                        <Text style={[styles.tonightMasjid, { color: colors.textSecondary }]} numberOfLines={1}>{ev.masjidName}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tonightTime, { color: colors.gold }]}>
                      {ev.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {locationPermission === false ? (
        <Pressable
          style={[styles.permissionBanner, { backgroundColor: colors.bannerBg }]}
          onPress={loadPrayerData}
        >
          <Ionicons name="location-outline" size={14} color={colors.bannerText} />
          <Text style={{ color: colors.bannerText, fontSize: 12, flex: 1, marginLeft: 8, fontFamily: "Inter_500Medium" }}>
            Enable location for accurate prayer times
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.prayerListSection}>
        <SectionHeader
          title="Prayer Times"
          colors={colors}
          rightElement={
            <Pressable
              style={[
                styles.notifToggle,
                {
                  backgroundColor: notificationsEnabled ? colors.emerald : colors.surface,
                  borderColor: notificationsEnabled ? colors.emerald : colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={toggleNotifications}
              testID="notification-toggle"
            >
              <Ionicons
                name={notificationsEnabled ? "notifications" : "notifications-outline"}
                size={14}
                color={notificationsEnabled ? "#fff" : colors.textSecondary}
              />
            </Pressable>
          }
        />
        <View style={[styles.prayerListCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {prayers.map((prayer, idx) => {
            const isNext = nextPrayer?.name === prayer.name;
            const isPast = prayer.time < now && !isNext;

            return (
              <View
                key={prayer.name}
                style={[
                  styles.prayerRow,
                  isNext && { backgroundColor: isDark ? colors.goldLight : "#FDFAF2" },
                  idx < prayers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
                ]}
              >
                <View style={[
                  styles.prayerIconBg,
                  isNext ? { backgroundColor: colors.gold + "20" } : { backgroundColor: colors.prayerIconBg },
                ]}>
                  <MaterialCommunityIcons
                    name={prayer.icon as any}
                    size={16}
                    color={isNext ? colors.gold : isPast ? colors.textTertiary : colors.emerald}
                  />
                </View>
                <Text
                  style={[
                    styles.prayerName,
                    { color: isPast ? colors.textTertiary : colors.text },
                    isNext && { color: colors.gold, fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {prayer.label}
                </Text>
                {isNext ? (
                  <View style={[styles.nextBadge, { backgroundColor: colors.gold + "18" }]}>
                    <Text style={[styles.nextBadgeText, { color: colors.gold }]}>Next</Text>
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.prayerTime,
                    { color: isPast ? colors.textTertiary : colors.text },
                    isNext && { color: colors.gold, fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {formatTime(prayer.time)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
  },
  scrollableContent: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerDateBlock: {
    flex: 1,
    marginLeft: 14,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  hijriDate: {
    fontSize: 14,
    fontFamily: "PlayfairDisplay_700Bold",
    marginTop: 2,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  compassContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compassRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  compassArrowWrap: {
    position: "absolute",
    width: 10,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  compassArrow: {
    width: 2,
    height: 12,
    borderRadius: 1,
  },
  compassArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  compassDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    position: "absolute",
  },
  compassLabels: {
    alignItems: "center",
  },
  compassTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  compassBearing: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
  silenceAlert: {
    marginHorizontal: 20,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  silenceAlertContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  silenceIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  silenceAlertTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 16,
  },
  heroCardWrapper: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  heroGoldAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#D4A843",
  },
  heroBottomAccent: {
    position: "absolute",
    bottom: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: "rgba(212, 168, 67, 0.2)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 4,
  },
  heroLabelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroLabelText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  heroTimeAt: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  heroPrayerName: {
    color: "#D4A843",
    fontSize: 36,
    fontFamily: "PlayfairDisplay_700Bold",
    marginTop: 4,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  heroTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  heroTimerUnit: {
    alignItems: "center",
    minWidth: 50,
  },
  heroTimerNumber: {
    color: "#FFFFFF",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
  },
  heroTimerLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginTop: -1,
  },
  heroTimerSep: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 30,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 2,
    marginTop: -8,
  },
  cardsSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  dropdownHeader: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  dropdownIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  dropdownHeaderText: {
    flex: 1,
  },
  dropdownTitle: {
    fontSize: 15,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  dropdownSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownBody: {
    marginTop: -1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  prayWhereSubhead: {
    paddingVertical: 8,
    marginBottom: 2,
  },
  prayWhereTimerLabel: {
    fontSize: 13,
    fontFamily: "PlayfairDisplay_600SemiBold",
  },
  prayWhereSubtext: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  prayWhereRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  prayWhereName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  prayWhereDistPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  prayWhereDist: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  tonightRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },
  tonightDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tonightTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tonightMasjid: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  tonightTime: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 8,
  },
  permissionBanner: {
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  notifToggle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerListSection: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  prayerListCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  prayerIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  prayerName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 12,
  },
  nextBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 10,
  },
  nextBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  prayerTime: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
