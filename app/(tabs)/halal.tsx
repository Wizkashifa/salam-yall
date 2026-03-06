import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import Colors from "@/constants/colors";

const C = Colors.light;
const HALAL_EATS_URL = "https://halaleatsnc.com";

export default function HalalScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    setWebViewKey((k) => k + 1);
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: 67 + insets.top }]}>
        <View style={styles.webHeader}>
          <Text style={[styles.webHeaderTitle, { color: C.text }]}>Halal Eats NC</Text>
        </View>
        <iframe
          src={HALAL_EATS_URL}
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            border: "none",
          } as any}
          title="Halal Eats NC"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={C.textSecondary} />
        <Text style={[styles.errorTitle, { color: C.text }]}>Unable to Load</Text>
        <Text style={[styles.errorMessage, { color: C.textSecondary }]}>
          Could not connect to Halal Eats NC. Check your connection and try again.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}
          onPress={handleRetry}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={C.emerald} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>Loading Halal Eats NC...</Text>
        </View>
      ) : null}
      <WebView
        key={webViewKey}
        source={{ uri: HALAL_EATS_URL }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  webHeaderTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
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
    backgroundColor: "#fff",
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
    backgroundColor: "#0D7C5F",
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
