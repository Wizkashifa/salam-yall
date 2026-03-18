import React, { ReactNode } from "react";
import { View, StyleSheet, Platform, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";

interface GlassModalContainerProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function GlassModalContainer({ children, style }: GlassModalContainerProps) {
  const { colors, isDark } = useTheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  if (isIOS) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? "rgba(10,26,18,0.82)" : "rgba(245,248,246,0.82)" }, style]}>
        <BlurView
          intensity={isDark ? 60 : 45}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            colors.gradientStart + "1A",
            colors.gradientEnd + "10",
          ]}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  const frostStyle = isWeb
    ? ({
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      } as any)
    : {};

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? "rgba(10,26,18,0.85)"
            : "rgba(245,248,246,0.85)",
        },
        frostStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={[
          colors.gradientStart + "14",
          colors.gradientEnd + "0D",
        ]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
});
