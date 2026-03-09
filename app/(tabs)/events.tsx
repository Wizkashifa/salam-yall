import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
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
  Share,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { GlassHeader } from "@/components/GlassHeader";
import { useDeepLink } from "@/lib/deeplink-context";
import { getApiUrl } from "@/lib/query-client";
import { trackEvent, trackScreenView } from "@/lib/analytics";

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
  speaker: string;
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
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const event of events) {
    const startDate = new Date(event.start);
    const displayDate = startDate < todayStart ? todayStart : startDate;
    const key = displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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
  const { colors, isDark } = useTheme();

  if (!event) return null;

  const dateInfo = formatEventDate(event.start, event.isAllDay);
  const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
  const timeRange = endInfo && !event.isAllDay
    ? `${dateInfo.time} – ${endInfo.time}`
    : dateInfo.time;

  const cleanDescription = event.description.trim();

  const openMaps = () => {
    if (event.location) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, justifyContent: "space-between" }]}>
          <Pressable onPress={onClose} hitSlop={8} style={[styles.modalCloseBtn, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="close" size={20} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
          <Pressable onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const shareUrl = `${getApiUrl()}share/event/${encodeURIComponent(event.id)}`;
            Share.share({ message: `${event.title} — check it out on Salam Y'all! ${shareUrl}` });
          }} hitSlop={8} style={[styles.modalCloseBtn, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)" }]}>
            <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : "#374151"} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} bounces={false} showsVerticalScrollIndicator={false}>
          {event.imageUrl ? (
            <Image source={{ uri: event.imageUrl }} style={styles.modalImage} resizeMode="cover" />
          ) : (
            <View style={[styles.modalImagePlaceholder, { backgroundColor: colors.prayerIconBg }]}>
              <Ionicons name="calendar" size={48} color={colors.emerald} />
            </View>
          )}

          <View style={styles.modalBody}>
            {event.organizer ? (
              <View style={[styles.modalOrganizerPill, { backgroundColor: colors.categoryBadgeBg ? colors.categoryBadgeBg(colors.gold) : (colors.gold + "20") }]}>
                <MaterialCommunityIcons
                  name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                  size={12}
                  color={colors.gold}
                />
                <Text style={[styles.modalOrganizerText, { color: colors.gold }]}>{event.organizer}</Text>
              </View>
            ) : null}

            <Text style={[styles.modalTitle, { color: colors.text }]}>{event.title}</Text>

            <View style={[styles.modalInfoSection, { borderTopColor: colors.divider }]}>
              <View style={styles.modalInfoRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{dateInfo.fullDate}</Text>
              </View>
              <View style={styles.modalInfoRow}>
                <Ionicons name="time-outline" size={18} color={colors.emerald} />
                <Text style={[styles.modalInfoText, { color: colors.text }]}>{timeRange}</Text>
              </View>
              {event.location ? (
                <Pressable style={styles.modalInfoRow} onPress={openMaps}>
                  <Ionicons name="location-outline" size={18} color={colors.emerald} />
                  <Text style={[styles.modalInfoText, { color: colors.text }]}>{event.location}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>

            {cleanDescription ? (
              <View style={[styles.modalDescriptionSection, { borderTopColor: colors.divider }]}>
                <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Details</Text>
                <Text style={[styles.modalDescription, { color: colors.text }]}>
                  {event.speaker && cleanDescription.includes(event.speaker) ? (
                    <>
                      {cleanDescription.split(event.speaker).map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <Text style={{ fontFamily: "Inter_700Bold" }}>{event.speaker}</Text>
                          )}
                        </React.Fragment>
                      ))}
                    </>
                  ) : cleanDescription}
                </Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              {event.registrationUrl ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(event.registrationUrl);
                  }}
                  style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: colors.emerald, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={styles.modalActionText}>Register / RSVP</Text>
                </Pressable>
              ) : null}
              {event.location ? (
                <Pressable
                  style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 }]}
                  onPress={openMaps}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.modalActionText}>Directions</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function EventsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const { pendingTarget, consumeTarget } = useDeepLink();

  useEffect(() => { trackScreenView("Events"); }, []);

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (!events || events.length === 0) return;
    if (!pendingTarget || pendingTarget.type !== "event") return;
    const targetId = consumeTarget("event");
    if (targetId) {
      const ev = events.find((e) => e.id === targetId);
      if (ev) setSelectedEvent(ev);
    }
  }, [events, pendingTarget]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    setRefreshing(false);
  }, [queryClient]);

  const now = new Date();
  const activeEvents = events
    ? events.filter((ev) => {
        const end = ev.end ? new Date(ev.end) : new Date(ev.start);
        return end >= now;
      })
    : [];
  const grouped = groupEventsByDate(activeEvents);

  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader onHeaderHeight={setHeaderHeight}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" }}>Community Events</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
            Programs and events in the local area
          </Text>
        </View>
        <TickerBanner />
      </GlassHeader>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 34 : 100,
          paddingTop: headerHeight + 12,
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
                  const endInfo = event.end ? formatEventDate(event.end, event.isAllDay) : null;
                  const cardTimeRange = endInfo && !event.isAllDay
                    ? `${dateInfo.time} – ${endInfo.time}`
                    : dateInfo.time;

                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedEvent(event);
                        trackEvent("event_viewed", { title: event.title });
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
                      <View style={styles.eventCardRow}>
                        {event.imageUrl ? (
                          <Image
                            source={{ uri: event.imageUrl }}
                            style={styles.eventThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.eventThumbPlaceholder, { backgroundColor: colors.prayerIconBg }]}>
                            <Ionicons name="calendar" size={24} color={colors.emerald} />
                          </View>
                        )}

                        <View style={styles.eventCardBody}>
                          <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>
                            {event.title}
                          </Text>

                          <Text style={[styles.eventTimeText, { color: colors.gold }]} numberOfLines={1}>
                            {cardTimeRange}
                          </Text>

                          {event.organizer ? (
                            <View style={styles.organizerRow}>
                              <MaterialCommunityIcons
                                name={isMasjid(event.organizer) ? "mosque" : "office-building-outline"}
                                size={13}
                                color={colors.gold}
                              />
                              <Text style={[styles.organizerText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {event.organizer}
                              </Text>
                            </View>
                          ) : null}

                          {event.location ? (
                            <View style={styles.locationRow}>
                              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                              <Text style={[styles.locationText, { color: colors.textTertiary }]} numberOfLines={1}>
                                {event.location}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginRight: 4 }} />
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
  eventCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventThumb: {
    width: 85,
    height: 85,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  eventThumbPlaceholder: {
    width: 85,
    height: 85,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  eventCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  eventTimeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
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
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    flex: 1,
  },
  modalImage: {
    width: SCREEN_WIDTH,
    aspectRatio: 1,
  },
  modalImagePlaceholder: {
    width: SCREEN_WIDTH,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBody: {
    padding: 20,
  },
  modalOrganizerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  modalOrganizerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    marginBottom: 4,
  },
  modalInfoSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  modalInfoText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
    lineHeight: 20,
  },
  modalDescriptionSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
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
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalActionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
