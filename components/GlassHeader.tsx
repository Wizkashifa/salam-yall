import React, { ReactNode } from "react";
import { View, StyleSheet, Platform, ViewStyle, LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";

interface GlassHeaderProps {
  children: ReactNode;
  style?: ViewStyle;
  onHeaderHeight?: (height: number) => void;
}

export function GlassHeader({ children, style, onHeaderHeight }: GlassHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  const topPad = isWeb ? 67 : insets.top;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    onHeaderHeight?.(height);
  };

  const containerStyle: ViewStyle = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: topPad,
    ...style,
  };

  // iOS 26+ — true native Liquid Glass with deep green brand tint.
  // backgroundColor is a solid fallback in case GlassView hasn't painted yet.
  if (isIOS && isLiquidGlassAvailable()) {
    return (
      <View style={[containerStyle, { backgroundColor: isDark ? colors.deepGreen : colors.emerald }]} onLayout={handleLayout}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme={isDark ? "dark" : "light"}
          tintColor={isDark ? colors.deepGreen : colors.emerald}
        />
        {children}
      </View>
    );
  }

  // iOS < 26 — BlurView + diagonal gradient matching the widget's visual recipe:
  // Dark:  #0A1A12 → #0F3D2B at 75% opacity, top-left to bottom-right
  // Light: pageBgStart → emerald at 9% opacity, same direction
  if (isIOS) {
    return (
      <View style={containerStyle} onLayout={handleLayout}>
        <BlurView
          intensity={isDark ? 150 : 100}
          tint={isDark ? "systemChromeMaterialDark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            isDark ? colors.background + "99" : colors.pageBgStart + "66",
            isDark ? colors.deepGreen + "99"  : colors.emerald + "26",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  const webBlurStyle = isWeb ? {
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  } as any : {};

  return (
    <View style={[containerStyle, webBlurStyle]} onLayout={handleLayout}>
      <LinearGradient
        colors={[
          colors.gradientStart + (isDark ? "B3" : "F2"),
          colors.gradientEnd + (isDark ? "99" : "E6"),
        ]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
