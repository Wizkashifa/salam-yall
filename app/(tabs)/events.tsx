import { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Image,
  Modal,
  Dimensions,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";

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

function formatEventDate(dateStr: string, isAllDay: boolean): { day: string; month: string; weekday: string; time: string; fullDate: string } {
  const date = new Date(dateStr);
  const day = date.getDate().toString();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const time = isAllDay
    ? "All Day"
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const fullDate = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return { day, month, weekday, time, fullDate };
}

const MASJID_KEYWORDS = [
  "masjid", "mosque", "islamic association", "islamic center", "islamic society",
  "as-salaam", "al-noor", "ar-razzaq", "king khalid", "jamaat ibad",
  "chapel hill islamic", "parkwood", "apex masjid",
];

function isMasjid(organizer: string): boolean {
  const lower = organizer.toLowerCase();
  return MASJID_KEYWORDS.some((kw) => lower.includes(kw));
}

function groupEventsByDate(events: CalendarEvent[]): { dateLabel: string; dateKey: string; events: CalendarEvent[] }[] {
  const groups: Record<string, CalendarEvent[]> = {};
  const keyOrder: string[] = [];
  for (const event of events) {
    const date = new Date(event.start);
    const key = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups[key]) {
      groups[key] = [];
      keyOrder.push(key);
    }
    groups[key].push(event);
  }
  return keyOrder.map((dateLabel) => ({ dateLabel, dateKey: dateLabel, events: groups[dateLabel] }));
}

function isToday(dateLabel: string): boolean {
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return dateLabel === todayLabel;
}

function isTomorrow(dateLabel: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return dateLabel === tomorrowLabel;
}

function getRelativeLabel(dateLabel: string): string {
  if (isToday(dateLabel)) return "Today";
  if (isTomorrow(dateLabel)) return "Tomorrow";
  return dateLabel;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function EventDetailModal({ event, visible, onClose }: { event: CalendarEvent | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (!event) return null;

  const dateInfo = formatEventDate(event.start, event.isAllDay);
  const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
  const timeRange = endInfo && !event.isAllDay
    ? `${dateInfo.time} – ${endInfo.time}`
    : dateInfo.time;

  const cleanDescription = event.description.trim();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} bounces={false}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={styles.modalImage} resizeMode="contain" />
          ) : null}

          <View style={styles.modalBody}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{event.title}</Text>

            {event.organizer ? (
              <View style={styles.modalOrganizerRow}>
                <MaterialCommunityIcons
                  name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                  size={16}
                  color={colors.gold}
                />
                <Text style={[styles.modalOrganizerText, { color: colors.gold }]}>{event.organizer}</Text>
              </View>
            ) : null}

            <View style={[styles.modalInfoCard, { backgroundColor: colors.surface }]}>
              <View style={styles.modalInfoRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{dateInfo.fullDate}</Text>
              </View>
              <View style={styles.modalInfoRow}>
                <Ionicons name="time-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{timeRange}</Text>
              </View>
              {event.location ? (
                <View style={styles.modalInfoRow}>
                  <Ionicons name="location-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.modalInfoText, { color: colors.text }]}>{event.location}</Text>
                </View>
              ) : null}
            </View>

            {event.registrationUrl ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Linking.openURL(event.registrationUrl);
                }}
                style={({ pressed }) => [styles.registerButton, { backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 }]}
              >
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.registerButtonText}>Register / RSVP</Text>
              </Pressable>
            ) : null}

            {cleanDescription ? (
              <View style={styles.modalDescriptionSection}>
                <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Details</Text>
                <Text style={[styles.modalDescription, { color: colors.text }]}>{cleanDescription}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    setRefreshing(false);
  }, [queryClient]);

  const grouped = events ? groupEventsByDate(events) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TickerBanner />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={{ paddingHorizontal: 20, paddingVertical: 14 }}
      >
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Community Events</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
          Programs and events in the local area
        </Text>
      </LinearGradient>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 34 : 20,
          paddingTop: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
      >
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.emerald} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.errorText, { color: colors.text }]}>Unable to load events</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.emerald, opacity: pressed ? 0.8 : 1 }]}
              onPress={onRefresh}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>No upcoming events</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Pull down to refresh
            </Text>
          </View>
        ) : (
          grouped.map((group, groupIdx) => {
            const relativeLabel = getRelativeLabel(group.dateLabel);
            const isTodayGroup = isToday(group.dateLabel);

            return (
              <View key={group.dateKey} style={[styles.dateGroup, groupIdx === 0 && { marginTop: 0 }]}>
                <View style={styles.dateHeaderRow}>
                  {isTodayGroup ? (
                    <View style={[styles.todayDot, { backgroundColor: colors.emerald }]} />
                  ) : null}
                  <Text style={[
                    styles.dateGroupLabel,
                    { color: isTodayGroup ? colors.emerald : colors.textSecondary },
                  ]}>
                    {relativeLabel}
                  </Text>
                </View>

                {group.events.map((event) => {
                  const dateInfo = formatEventDate(event.start, event.isAllDay);

                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedEvent(event);
                      }}
                      style={({ pressed }) => [
                        styles.eventCard,
                        {
                          backgroundColor: colors.surface,
                          opacity: pressed ? 0.92 : 1,
                          shadowColor: colors.cardShadow,
                        },
                      ]}
                    >
                      {event.imageUrl ? (
                        <Image
                          source={{ uri: event.imageUrl }}
                          style={styles.eventImage}
                          resizeMode="cover"
                        />
                      ) : null}

                      <View style={styles.eventBody}>
                        <View style={styles.eventRow}>
                          <View style={[styles.timeColumn, { borderRightColor: colors.borderLight }]}>
                            <Text style={[styles.timeText, { color: colors.emerald }]}>
                              {dateInfo.time}
                            </Text>
                          </View>

                          <View style={styles.eventContent}>
                            <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>
                              {event.title}
                            </Text>

                            {event.organizer ? (
                              <View style={styles.organizerRow}>
                                <MaterialCommunityIcons
                                  name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                                  size={14}
                                  color={colors.gold}
                                />
                                <Text style={[styles.organizerText, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {event.organizer}
                                </Text>
                              </View>
                            ) : null}

                            {event.location ? (
                              <View style={styles.locationRow}>
                                <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                                <Text style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {event.location}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      <EventDetailModal
        event={selectedEvent}
        visible={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 14,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 14,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  dateGroup: {
    marginTop: 24,
    marginBottom: 4,
  },
  dateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 6,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dateGroupLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  eventCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  eventImage: {
    width: "100%",
    height: 140,
  },
  eventBody: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeColumn: {
    width: 64,
    borderRightWidth: 1,
    paddingRight: 10,
    alignItems: "flex-end",
  },
  timeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  eventContent: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  organizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  organizerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },

  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
    zIndex: 10,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    flex: 1,
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: "#000",
  },
  modalBody: {
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
  },
  modalOrganizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  modalOrganizerText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  modalInfoCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginTop: 20,
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  modalInfoText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 20,
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  registerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalDescriptionSection: {
    marginTop: 20,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});
