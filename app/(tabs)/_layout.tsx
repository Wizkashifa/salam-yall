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
          <NativeTabs.Trigger name="halal">
            <Icon sf={{ default: "fork.knife", selected: "fork.knife" }} />
            <Label>Dines</Label>
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
            <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
            <Label>Settings</Label>
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
            backgroundColor: isIOS ? "transparent" : colors.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            elevation: 0,
            shadowColor: "transparent",
            ...(isWeb ? { height: 84 } : {}),
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={80}
                tint={isDark ? "dark" : "light"}
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
            title: "Dines",
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
            title: "Settings",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={size - 2} color={color} />
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
