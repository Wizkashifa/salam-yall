import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, Text } from "react-native";
import React, { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme-context";
import { getMissedPrayerCount } from "@/lib/prayer-tracker";
import { useSettings } from "@/lib/settings-context";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="halal">
        <Icon sf={{ default: "fork.knife", selected: "fork.knife" }} />
        <Label>HalalEats</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <Icon sf={{ default: "calendar", selected: "calendar" }} />
        <Label>Events</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="businesses">
        <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
        <Label>Directory</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "moon.stars", selected: "moon.stars.fill" }} />
        <Label>Worship</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { colors, isDark, ramadanMode } = useTheme();
  const { notificationsEnabled } = useSettings();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const isDarkRamadan = isDark && ramadanMode;
  const [missedCount, setMissedCount] = useState(0);

  useEffect(() => {
    getMissedPrayerCount().then(setMissedCount);
    const interval = setInterval(() => {
      getMissedPrayerCount().then(setMissedCount);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const worshipBadge = missedCount > 0 ? missedCount : (!notificationsEnabled ? "!" : undefined);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: isDarkRamadan ? "transparent" : (isIOS ? "transparent" : colors.surface),
          borderTopWidth: isDarkRamadan ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: isDarkRamadan ? "transparent" : colors.borderLight,
          elevation: 0,
          shadowColor: "transparent",
          ...(isWeb ? { height: 84, paddingBottom: 34 } : {}),
        },
        tabBarBackground: () =>
          isDarkRamadan ? (
            <LinearGradient
              colors={[(colors as any).tabBarGradientStart || "#2A1545", (colors as any).tabBarGradientEnd || "#1A0E30"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : isIOS ? (
            <BlurView
              intensity={isDark ? 120 : 80}
              tint={isDark ? "systemChromeMaterialDark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.surface },
              ]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="halal"
        options={{
          title: "HalalEats",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "restaurant" : "restaurant-outline"} size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="businesses"
        options={{
          title: "Directory",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "storefront" : "storefront-outline"} size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Worship",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="mosque" size={size - 2} color={color} />
          ),
          tabBarBadge: worshipBadge,
          tabBarBadgeStyle: { backgroundColor: typeof worshipBadge === "number" ? "#EF4444" : colors.gold, fontSize: 10, fontFamily: "Inter_700Bold" },
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
