import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from "react-native";

const { width, height } = Dimensions.get("window");

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const salamsOpacity = useRef(new Animated.Value(0)).current;
  const salamsTranslateY = useRef(new Animated.Value(18)).current;
  const yallOpacity = useRef(new Animated.Value(0)).current;
  const yallTranslateY = useRef(new Animated.Value(18)).current;
  const crescentOpacity = useRef(new Animated.Value(0)).current;
  const crescentScale = useRef(new Animated.Value(0.5)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(12)).current;
  const overallOpacity = useRef(new Animated.Value(1)).current;

  const USE_NATIVE = Platform.OS !== "web";

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(crescentOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: USE_NATIVE,
        }),
        Animated.spring(crescentScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: USE_NATIVE,
        }),
      ]),
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(salamsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
        Animated.timing(salamsTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(yallOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
        Animated.timing(yallTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: USE_NATIVE,
        }),
      ]),
      Animated.delay(800),
      Animated.timing(overallOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: USE_NATIVE,
      }),
    ]);
    anim.start(() => {
      onFinish();
    });
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: overallOpacity }]}>
      <View style={styles.content}>
        <Animated.Text
          style={[
            styles.crescent,
            {
              opacity: crescentOpacity,
              transform: [{ scale: crescentScale }],
            },
          ]}
        >
          ☪
        </Animated.Text>

        <View style={styles.textRow}>
          <Animated.Text
            style={[
              styles.salams,
              {
                opacity: salamsOpacity,
                transform: [{ translateY: salamsTranslateY }],
              },
            ]}
          >
            Salams
          </Animated.Text>
          <Animated.Text
            style={[
              styles.yall,
              {
                opacity: yallOpacity,
                transform: [{ translateY: yallTranslateY }],
              },
            ]}
          >
            {" y'all"}
          </Animated.Text>
        </View>

        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: subtitleOpacity,
              transform: [{ translateY: subtitleTranslateY }],
            },
          ]}
        >
          Triangle NC Muslim Community
        </Animated.Text>
      </View>

      <Animated.Text style={[styles.appName, { opacity: subtitleOpacity }]}>
        Ummah Connect
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F3D2B",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  crescent: {
    fontSize: 48,
    marginBottom: 24,
    color: "#D4A843",
  },
  textRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  salams: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontStyle: "italic" as const,
    fontSize: 42,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  yall: {
    fontFamily: "Inter_400Regular",
    fontSize: 42,
    color: "#D4A843",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  appName: {
    position: "absolute",
    bottom: 60,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 1,
  },
});
