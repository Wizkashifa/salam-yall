import React, { ReactNode } from "react";
import { View, StyleSheet, Platform, ViewStyle, LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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

  if (isIOS) {
    return (
      <View style={containerStyle} onLayout={handleLayout}>
        <BlurView
          intensity={isDark ? 120 : 80}
          tint={isDark ? "systemChromeMaterialDark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            colors.gradientStart + (isDark ? "CC" : "E6"),
            colors.gradientEnd + (isDark ? "99" : "B3"),
          ]}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  return (
    <View style={containerStyle} onLayout={handleLayout}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
