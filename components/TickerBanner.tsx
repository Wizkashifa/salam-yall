import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

interface TickerMessage {
  id: number;
  message: string;
  type: string;
  created_at: string;
  expires_at: string | null;
}

export function TickerBanner() {
  const { colors } = useTheme();
  const { data: messages } = useQuery<TickerMessage[]>({
    queryKey: ["/api/ticker"],
    refetchInterval: 30 * 1000,
    staleTime: 0,
  });

  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  const activeMessages = messages?.filter(m => m.type !== "urgent") || [];
  const urgentMessages = messages?.filter(m => m.type === "urgent") || [];
  const allMessages = [...urgentMessages, ...activeMessages];
  const messageSignature = allMessages.map(m => m.id).join(",");

  const needsScroll = allMessages.length > 1 || (allMessages.length === 1 && allMessages[0].message.length > 30);

  useEffect(() => {
    if (!needsScroll || !allMessages.length || !containerWidth) return;
    const textWidth = allMessages.reduce((sum, m) => sum + m.message.length * 8 + 60, 0);
    const totalWidth = Math.max(textWidth, containerWidth * 1.5);

    scrollAnim.setValue(containerWidth);
    const animation = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -totalWidth,
        duration: totalWidth * 25,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [messageSignature, containerWidth, needsScroll]);

  if (!allMessages.length) {
    return null;
  }

  const hasUrgent = urgentMessages.length > 0;
  const bgColor = hasUrgent ? colors.tickerUrgentBg : colors.tickerBg;
  const textColor = hasUrgent ? colors.tickerUrgentText : colors.tickerText;
  const iconColor = hasUrgent ? colors.tickerUrgentText : colors.gold;

  return (
    <View style={[styles.tickerContainer, { backgroundColor: bgColor, borderBottomColor: colors.borderLight }]}>
      <View style={styles.tickerIconWrap}>
        <Ionicons name={hasUrgent ? "alert-circle" : "megaphone"} size={14} color={iconColor} />
      </View>
      {needsScroll ? (
        <View
          style={styles.tickerScrollArea}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.tickerTextRow, { transform: [{ translateX: scrollAnim }] }]}>
            {allMessages.map((msg, i) => (
              <Text key={msg.id} style={[styles.tickerText, { color: textColor }]}>
                {msg.message}
                {i < allMessages.length - 1 ? "     ✦     " : ""}
              </Text>
            ))}
          </Animated.View>
        </View>
      ) : (
        <View style={styles.tickerScrollArea}>
          <Text style={[styles.tickerText, { color: textColor }]} numberOfLines={1}>
            {allMessages[0].message}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  tickerIconWrap: {
    marginRight: 10,
  },
  tickerScrollArea: {
    flex: 1,
    overflow: "hidden",
    height: 18,
  },
  tickerTextRow: {
    flexDirection: "row",
    position: "absolute",
  },
  tickerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
});
