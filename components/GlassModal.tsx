import React, { ReactNode } from "react";
import { View, StyleSheet, Platform, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { GlassView, GlassContainer, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/lib/theme-context";

interface GlassModalContainerProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function GlassModalContainer({ children, style }: GlassModalContainerProps) {
  const { colors, isDark } = useTheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  // iOS 26+ — true native Liquid Glass. GlassContainer with spacing={8} means
  // when this modal and the GlassHeader are within 8pt of each other, they
  // merge into one continuous liquid surface — the signature iOS 26 behavior.
  if (isIOS && isLiquidGlassAvailable()) {
    return (
      <GlassContainer spacing={8} style={[styles.container, style]}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme={isDark ? "dark" : "light"}
          tintColor={isDark ? colors.deepGreen : colors.pageBgStart}
          isInteractive={false}
        />
        {children}
      </GlassContainer>
    );
  }

  // iOS < 26 — BlurView + diagonal gradient, slightly stronger than before
  // to better match the widget's deep green glass aesthetic
  if (isIOS) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? "rgba(10,26,18,0.65)" : "rgba(245,248,246,0.55)" }, style]}>
        <BlurView
          intensity={isDark ? 60 : 45}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            colors.gradientStart + (isDark ? "33" : "1A"),
            colors.gradientEnd   + (isDark ? "26" : "10"),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
            ? "rgba(10,26,18,0.70)"
            : "rgba(245,248,246,0.60)",
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
