import { useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useTheme } from "@/lib/theme-context";

const HALAL_EATS_URL = "https://halaleatsnc.com";
const TIMEOUT_MS = 15000;

export default function HalalScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError(true);
      }
    }, TIMEOUT_MS);
  }, [loading]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    setWebViewKey((k) => k + 1);
  }, []);

  const handleLoadEnd = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(false);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(false);
    setError(true);
  }, []);

  const handleLoadStart = useCallback(() => {
    setLoading(true);
    startTimeout();
  }, [startTimeout]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: 67 + insets.top, backgroundColor: colors.background }]}>
        <View style={styles.webFallbackContainer}>
          <View style={[styles.webFallbackCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="restaurant" size={48} color={colors.gold} />
            <Text style={[styles.webFallbackTitle, { color: colors.text }]}>Halal Eats NC</Text>
            <Text style={[styles.webFallbackDesc, { color: colors.textSecondary }]}>
              Find halal restaurants and food options in North Carolina
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.webOpenButton,
                { backgroundColor: colors.gold, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => Linking.openURL(HALAL_EATS_URL)}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.webOpenButtonText}>Open Website</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to Load</Text>
        <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
          Halal Eats NC may be temporarily unavailable. Check your connection and try again.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.gold, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleRetry}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {canGoBack ? (
        <View style={[styles.navBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => webViewRef.current?.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={colors.gold} />
          </Pressable>
          <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
            Halal Eats NC
          </Text>
          <Pressable
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={handleRetry}
          >
            <Ionicons name="refresh" size={20} color={colors.gold} />
          </Pressable>
        </View>
      ) : null}
      {loading ? (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading Halal Eats NC...</Text>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        key={webViewKey}
        source={{ uri: HALAL_EATS_URL }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleError}
        onNavigationStateChange={(navState) => setCanGoBack(!!navState.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        pullToRefreshEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webFallbackContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  webFallbackCard: {
    alignItems: "center",
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    width: "100%",
    maxWidth: 360,
  },
  webFallbackTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
  },
  webFallbackDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  webOpenButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  webOpenButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  navTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
    gap: 6,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
