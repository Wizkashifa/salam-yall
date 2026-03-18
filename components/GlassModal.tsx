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
      <View style={[styles.container, { backgroundColor: colors.background }, style]}>
        <BlurView
          intensity={isDark ? 30 : 20}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            colors.gradientStart + "12",
            colors.gradientEnd + "08",
          ]}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  const frostStyle = isWeb
    ? ({
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      } as any)
    : {};

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        frostStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={[
          colors.gradientStart + "0A",
          colors.gradientEnd + "06",
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
