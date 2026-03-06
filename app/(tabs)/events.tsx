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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  isAllDay: boolean;
  organizer: string;
}

function formatEventDate(dateStr: string, isAllDay: boolean): { day: string; month: string; weekday: string; time: string } {
  const date = new Date(dateStr);
  const day = date.getDate().toString();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const time = isAllDay
    ? "All Day"
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return { day, month, weekday, time };
}

function getEventColor(index: number): string {
  const palette = ["#1B6B4A", "#D4A843", "#2563EB", "#DC2626", "#7C3AED", "#0891B2"];
  return palette[index % palette.length];
}

function groupEventsByDate(events: CalendarEvent[]): { dateLabel: string; events: CalendarEvent[] }[] {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const event of events) {
    const date = new Date(event.start);
    const key = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }
  return Object.entries(groups).map(([dateLabel, events]) => ({ dateLabel, events }));
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    staleTime: 5 * 60 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    setRefreshing(false);
  }, [queryClient]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const grouped = events ? groupEventsByDate(events) : [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
        paddingBottom: Platform.OS === "web" ? 34 : 100,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
      }
    >
      <View style={styles.headerSection}>
        <Text style={[styles.title, { color: colors.text }]}>Community Events</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Programs and events in the local area
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.text }]}>Unable to load events</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.gold, opacity: pressed ? 0.8 : 1 }]}
            onPress={onRefresh}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No upcoming events</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Pull down to refresh
          </Text>
        </View>
      ) : (
        grouped.map((group) => (
          <View key={group.dateLabel} style={styles.dateGroup}>
            <Text style={[styles.dateGroupLabel, { color: colors.textSecondary }]}>{group.dateLabel}</Text>
            {group.events.map((event, idx) => {
              const dateInfo = formatEventDate(event.start, event.isAllDay);
              const color = getEventColor(idx);
              const isExpanded = expandedId === event.id;

              return (
                <Pressable
                  key={event.id}
                  onPress={() => toggleExpand(event.id)}
                  style={({ pressed }) => [
                    styles.eventCard,
                    { backgroundColor: colors.surface, opacity: pressed ? 0.95 : 1 },
                  ]}
                >
                  <View style={[styles.eventAccent, { backgroundColor: color }]} />
                  <View style={styles.eventDateColumn}>
                    <Text style={[styles.eventDay, { color: colors.text }]}>{dateInfo.day}</Text>
                    <Text style={[styles.eventMonth, { color: colors.textSecondary }]}>{dateInfo.month}</Text>
                  </View>
                  <View style={styles.eventContent}>
                    <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 2}>
                      {event.title}
                    </Text>

                    {event.organizer ? (
                      <View style={styles.organizerRow}>
                        <View style={[styles.organizerBadge, { backgroundColor: colors.accentMuted }]}>
                          <MaterialCommunityIcons name="account-group-outline" size={12} color={colors.gold} />
                        </View>
                        <Text style={[styles.organizerText, { color: colors.gold }]} numberOfLines={1}>
                          {event.organizer}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.eventMeta}>
                      <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                      <Text style={[styles.eventMetaText, { color: colors.textSecondary }]}>
                        {dateInfo.time}
                      </Text>
                    </View>
                    {event.location ? (
                      <View style={styles.eventMeta}>
                        <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                        <Text style={[styles.eventMetaText, { color: colors.textSecondary }]} numberOfLines={isExpanded ? undefined : 1}>
                          {event.location}
                        </Text>
                      </View>
                    ) : null}
                    {isExpanded && event.description ? (
                      <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                        {event.description.replace(/<[^>]*>/g, "")}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
  dateGroup: {
    marginBottom: 20,
  },
  dateGroupLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  eventCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 10,
  },
  eventAccent: {
    width: 4,
  },
  eventDateColumn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  eventDay: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  eventMonth: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
  },
  eventContent: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 16,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  organizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  organizerBadge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  organizerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  eventMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  eventDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: 8,
  },
});
