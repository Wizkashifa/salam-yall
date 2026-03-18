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
      <View style={[styles.container, style]}>
        <BlurView
          intensity={isDark ? 120 : 80}
          tint={isDark ? "systemChromeMaterialDark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            colors.gradientStart + (isDark ? "CC" : "F2"),
            colors.gradientEnd + (isDark ? "B3" : "E6"),
          ]}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  const webBlurStyle = isWeb
    ? ({
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
      } as any)
    : {};

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? "rgba(10,26,18,0.92)"
            : "rgba(245,248,246,0.92)",
        },
        webBlurStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={[
          colors.gradientStart + (isDark ? "40" : "26"),
          colors.gradientEnd + (isDark ? "33" : "1A"),
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
