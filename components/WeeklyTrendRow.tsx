import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme-context";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

type HeatmapDay = {
  date: string;
  fajr: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
};

interface WeeklyTrendRowProps {
  heatmapData: HeatmapDay[];
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDayCompleted(day: HeatmapDay | undefined): boolean {
  if (!day) return false;
  return day.fajr > 0 && day.dhuhr > 0 && day.asr > 0 && day.maghrib > 0 && day.isha > 0;
}

function isDayPartial(day: HeatmapDay | undefined): boolean {
  if (!day) return false;
  const count = [day.fajr, day.dhuhr, day.asr, day.maghrib, day.isha].filter(s => s > 0).length;
  return count > 0 && count < 5;
}

export function WeeklyTrendRow({ heatmapData }: WeeklyTrendRowProps) {
  const { colors } = useTheme();

  const today = new Date();
  const todayKey = formatDateKey(today);

  // Build Monday-first week dates
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDateKey(d);
  });

  const logsMap = Object.fromEntries(heatmapData.map(d => [d.date, d]));

  return (
    <View>
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
          color: colors.textSecondary,
          letterSpacing: 0.8,
          marginBottom: 14,
          textTransform: "uppercase",
        }}
      >
        7 Day Trend
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {weekDates.map((dateKey, idx) => {
          const log = logsMap[dateKey];
          const isToday = dateKey === todayKey;
          const completed = isDayCompleted(log);
          const partial = isDayPartial(log);
          const isFuture = dateKey > todayKey;

          let circleStyle: any = {
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center" as const,
            justifyContent: "center" as const,
          };
          let textColor = colors.textTertiary;

          if (isToday) {
            circleStyle = {
              ...circleStyle,
              borderWidth: 2,
              borderColor: colors.gold,
              backgroundColor: completed ? colors.gold + "20" : "transparent",
            };
            textColor = colors.gold;
          } else if (completed) {
            circleStyle = {
              ...circleStyle,
              backgroundColor: colors.emerald + "25",
              borderWidth: 1,
              borderColor: colors.emerald + "60",
            };
            textColor = colors.emerald;
          } else if (partial) {
            circleStyle = {
              ...circleStyle,
              backgroundColor: colors.gold + "15",
              borderWidth: 1,
              borderColor: colors.gold + "40",
            };
            textColor = colors.gold;
          } else if (isFuture) {
            circleStyle = {
              ...circleStyle,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
            };
            textColor = colors.textTertiary;
          } else {
            circleStyle = {
              ...circleStyle,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
            };
            textColor = colors.textTertiary;
          }

          return (
            <View key={idx} style={{ alignItems: "center" as const }}>
              <View style={circleStyle}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                    color: textColor,
                  }}
                >
                  {DAY_LETTERS[idx]}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
