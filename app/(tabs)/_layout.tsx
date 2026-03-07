import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { useTheme } from "@/lib/theme-context";
import { TickerBanner } from "@/components/TickerBanner";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function NativeTabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: insets.top, backgroundColor: "transparent" }} />
      <TickerBanner />
      <View style={{ flex: 1 }}>
        <NativeTabs>
          <NativeTabs.Trigger name="index">
            <Icon sf={{ default: "moon.stars", selected: "moon.stars.fill" }} />
            <Label>Prayer</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="halal">
            <Icon sf={{ default: "fork.knife", selected: "fork.knife" }} />
            <Label>Halal Eats</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="events">
            <Icon sf={{ default: "calendar", selected: "calendar" }} />
            <Label>Events</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="businesses">
            <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
            <Label>Directory</Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </View>
    </View>
  );
}

function ClassicTabLayout() {
  const { colors, isDark } = useTheme();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {isWeb ? (
        <View style={{ paddingTop: 67, backgroundColor: colors.background }}>
          <TickerBanner />
        </View>
      ) : (
        <View style={{ paddingTop: insets.top, backgroundColor: colors.tickerBg }}>
          <TickerBanner />
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            backgroundColor: isIOS ? "transparent" : colors.background,
            borderTopWidth: 0,
            elevation: 0,
            ...(isWeb ? { height: 84 } : {}),
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={100}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : isWeb ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: colors.background },
                ]}
              />
            ) : null,
          tabBarLabelStyle: {
            fontFamily: "Inter_500Medium",
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Prayer",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="moon-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="halal"
          options={{
            title: "Halal Eats",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="restaurant-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="events"
          options={{
            title: "Events",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="businesses"
          options={{
            title: "Directory",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
