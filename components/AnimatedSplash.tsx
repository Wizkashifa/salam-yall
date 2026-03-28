import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
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
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(12)).current;
  const overallOpacity = useRef(new Animated.Value(1)).current;

  const USE_NATIVE = Platform.OS !== "web";

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: USE_NATIVE,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: USE_NATIVE,
        }),
      ]),
      Animated.delay(300),
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
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require("@/assets/images/splash-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: subtitleOpacity,
              transform: [{ translateY: subtitleTranslateY }],
            },
          ]}
        >
          Your Muslim Community App
        </Animated.Text>
      </View>
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
    backgroundColor: "#0d2b1a",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  logoWrap: {
    alignItems: "center" as const,
  },
  logo: {
    width: width * 0.6,
    height: width * 0.6,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
