import React from "react";
import { View, Text, StyleSheet } from "react-native";

const emerald = "#1B6B4A";
const richGold = "#D4A843";
const excusedRed = "#EF4444";

interface PrayerPillMockupProps {
  variant?: "onboarding" | "modal";
  colors?: {
    text?: string;
    textSecondary?: string;
    textTertiary?: string;
    surface?: string;
    border?: string;
    gold?: string;
    emerald?: string;
  };
}

const EXAMPLE_PILLS = [
  { name: "Fajr", time: "5:42", status: 0 },
  { name: "Dhuhr", time: "12:15", status: 1 },
  { name: "Asr", time: "3:38", status: 2 },
  { name: "Mgrb", time: "6:12", status: 3 },
  { name: "Isha", time: "7:45", status: 4 },
] as const;

function getPillBg(status: number, variant: "onboarding" | "modal", themeColors?: PrayerPillMockupProps["colors"]) {
  if (variant === "onboarding") {
    switch (status) {
      case 1: return richGold + "30";
      case 2: return emerald + "35";
      case 3: return richGold + "18";
      case 4: return "rgba(239,68,68,0.2)";
      default: return "rgba(255,255,255,0.08)";
    }
  }
  const g = themeColors?.gold ?? richGold;
  const e = themeColors?.emerald ?? emerald;
  switch (status) {
    case 1: return g + "20";
    case 2: return e + "25";
    case 3: return g + "12";
    case 4: return "rgba(239,68,68,0.15)";
    default: return undefined;
  }
}

function getNameColor(status: number, variant: "onboarding" | "modal", themeColors?: PrayerPillMockupProps["colors"]) {
  if (status === 4) return excusedRed;
  if (variant === "onboarding") {
    return status === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.7)";
  }
  return status === 0
    ? (themeColors?.textTertiary ?? "rgba(255,255,255,0.35)")
    : (themeColors?.textSecondary ?? "rgba(255,255,255,0.7)");
}

function getTimeColor(status: number, variant: "onboarding" | "modal", themeColors?: PrayerPillMockupProps["colors"]) {
  if (status === 4) return excusedRed;
  if (variant === "onboarding") {
    return status === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)";
  }
  return status === 0
    ? (themeColors?.textTertiary ?? "rgba(255,255,255,0.4)")
    : (themeColors?.text ?? "rgba(255,255,255,0.9)");
}

export default function PrayerPillMockup({ variant = "onboarding", colors: themeColors }: PrayerPillMockupProps) {
  const isOnboarding = variant === "onboarding";

  return (
    <View style={[
      styles.container,
      isOnboarding
        ? styles.onboardingContainer
        : {
            backgroundColor: themeColors?.surface ?? "rgba(22,22,22,0.9)",
            borderColor: themeColors?.border ?? "rgba(255,255,255,0.06)",
          },
    ]}>
      <Text style={[
        styles.label,
        { color: isOnboarding ? "rgba(255,255,255,0.4)" : (themeColors?.textTertiary ?? "rgba(255,255,255,0.4)") },
      ]}>
        Example
      </Text>
      <View style={styles.pillRow}>
        {EXAMPLE_PILLS.map((pill) => {
          const bg = getPillBg(pill.status, variant, themeColors);
          return (
            <View
              key={pill.name}
              style={[styles.pill, bg ? { backgroundColor: bg } : undefined]}
            >
              <Text
                style={[styles.pillName, { color: getNameColor(pill.status, variant, themeColors) }]}
                allowFontScaling={false}
              >
                {pill.name}
              </Text>
              <Text
                style={[styles.pillTime, { color: getTimeColor(pill.status, variant, themeColors) }]}
                allowFontScaling={false}
              >
                {pill.time}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 8,
    marginVertical: 12,
    borderWidth: 1,
  },
  onboardingContainer: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
  },
  pill: {
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 2,
  },
  pillName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillTime: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginTop: 3,
  },
});
