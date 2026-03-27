import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_600SemiBold,
} from "@expo-google-fonts/playfair-display";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { AppDrawer } from "@/components/AppDrawer";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/lib/theme-context";
import { SettingsProvider } from "@/lib/settings-context";
import { registerPushToken } from "@/lib/push-utils";
import { trackEvent } from "@/lib/analytics";
import { DeepLinkProvider, parseDeepLinkUrl, useDeepLink } from "@/lib/deeplink-context";
import { AuthProvider } from "@/lib/auth-context";
import { LocationOverrideProvider } from "@/lib/location-override-context";

const ONBOARDING_VERSION_KEY = "onboarding_version";
const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

SplashScreen.preventAutoHideAsync();

const DEEP_LINK_TAB_MAP: Record<string, string> = {
  event: "/(tabs)/events",
  restaurant: "/(tabs)/halal",
  business: "/(tabs)/businesses",
  janaza: "/(tabs)/settings",
};

function DeepLinkListener() {
  const { setPendingTarget } = useDeepLink();

  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const target = parseDeepLinkUrl(url);
        if (target) {
          setPendingTarget(target);
          const tab = DEEP_LINK_TAB_MAP[target.type];
          if (tab) {
            setTimeout(() => {
              try { router.push(tab as Href); } catch {}
            }, 500);
          }
        }
      } catch {}
    };

    try {
      Linking.getInitialURL().then((url) => {
        if (url) handleDeepLink(url);
      }).catch(() => {});
    } catch {}

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Linking.addEventListener("url", (event) => handleDeepLink(event.url));
    } catch {}
    return () => { try { subscription?.remove(); } catch {} };
  }, [setPendingTarget]);

  return null;
}

function PushNotificationHandler() {
  const { setPendingTarget } = useDeepLink();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "janaza") {
        setPendingTarget({ type: "janaza", id: "" });
        setTimeout(() => router.replace("/(tabs)/settings" as Href), 100);
      } else if (data?.type === "event" && data?.eventId) {
        setPendingTarget({ type: "event", id: String(data.eventId) });
        setTimeout(() => router.replace("/(tabs)/events" as Href), 100);
      } else if (data?.type === "url" && data?.url) {
        const { Linking } = await import("react-native");
        Linking.openURL(String(data.url));
      }
    });

    return () => sub.remove();
  }, [setPendingTarget]);

  return null;
}

function RootLayoutNav() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    registerPushToken();
    trackEvent("app_open");

    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        trackEvent("app_open");
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <DeepLinkListener />
      <PushNotificationHandler />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <AppDrawer />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold,
  });
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_VERSION_KEY).then((val) => {
      setShowOnboarding(val !== APP_VERSION);
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const handleOnboardingComplete = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_VERSION_KEY, APP_VERSION);
    setShowOnboarding(false);
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsProvider>
            <AuthProvider>
              <DeepLinkProvider>
                <LocationOverrideProvider>
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <RootLayoutNav />
                    {showSplash && (
                      <AnimatedSplash onFinish={() => setShowSplash(false)} />
                    )}
                    {!showSplash && showOnboarding && (
                      <OnboardingFlow onComplete={handleOnboardingComplete} />
                    )}
                  </KeyboardProvider>
                </GestureHandlerRootView>
                </LocationOverrideProvider>
              </DeepLinkProvider>
            </AuthProvider>
          </SettingsProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
