import { useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Share,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { captureRef } from "react-native-view-shot";
import { useTheme } from "@/lib/theme-context";
import { BADGES, type BadgeDefinition } from "@/lib/prayer-badges";
import { trackEvent } from "@/lib/analytics";

interface MilestoneCelebrationModalProps {
  badgeKey: string | null;
  onClose: () => void;
  userName?: string | null;
}

function getBadgeCardContent(def: BadgeDefinition): { bigText: string; unitText: string } {
  switch (def.key) {
    case "iron_streak": return { bigText: "30", unitText: "day streak" };
    case "consistency_king": return { bigText: "7", unitText: "day streak" };
    case "fajr_warrior": return { bigText: "7", unitText: "fajr streak" };
    case "masjid_regular": return { bigText: "7", unitText: "days at masjid" };
    case "first_step": return { bigText: "1", unitText: "prayer logged" };
    case "full_day": return { bigText: "5/5", unitText: "prayers in a day" };
    case "monthly_champion": return { bigText: "90%", unitText: "monthly consistency" };
    case "daily_reader": return { bigText: "7", unitText: "day Quran streak" };
    case "tasbeeh_fatima": return { bigText: "1×", unitText: "Tasbeeh Fatima" };
    case "first_read": return { bigText: "1", unitText: "Quran session" };
    case "juz_scholar": return { bigText: "1", unitText: "juz completed" };
    case "khatm": return { bigText: "114", unitText: "surahs read" };
    default: return { bigText: "✓", unitText: def.title };
  }
}

export function MilestoneCelebrationModal({
  badgeKey,
  onClose,
  userName,
}: MilestoneCelebrationModalProps) {
  const { colors } = useTheme();
  const cardRef = useRef<ViewShot | null>(null);

  if (!badgeKey) return null;

  const def = BADGES.find(b => b.key === badgeKey);
  if (!def) return null;

  const { bigText, unitText } = getBadgeCardContent(def);

  const handleShare = async (platform?: "instagram") => {
    try {
      await new Promise(resolve => setTimeout(resolve, 80));
      if (!cardRef.current) return;
      const uri = await captureRef(cardRef.current, { format: "png", quality: 1 });

      if (platform === "instagram") {
        if (Platform.OS === "ios") {
          const igUrl = `instagram://library?AssetPath=${encodeURIComponent(uri)}`;
          const canOpen = await Linking.canOpenURL(igUrl);
          if (canOpen) {
            await Linking.openURL(igUrl);
          } else {
            await Share.share({
              message: `I earned the ${def.title} badge on Salam Y'all! ${def.description}\n\nTrack your prayer progress: https://apps.apple.com/us/app/salam-yall/id6760231963`,
              url: uri,
            });
          }
        } else {
          await Share.share({
            message: `I earned the ${def.title} badge on Salam Y'all! ${def.description}\n\nTrack your prayer progress: https://apps.apple.com/us/app/salam-yall/id6760231963`,
          });
        }
      } else {
        await Share.share({
          message: `I earned the ${def.title} badge on Salam Y'all! ${def.description}\n\nTrack your prayer progress: https://apps.apple.com/us/app/salam-yall/id6760231963`,
          url: Platform.OS === "ios" ? uri : undefined,
        });
      }

      trackEvent("milestone_shared", { badge: badgeKey, platform: platform ?? "generic" });
    } catch {
      // user cancelled
    }
  };

  return (
    <Modal
      visible={!!badgeKey}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Close button */}
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>Alhamdullilah!</Text>
          <Text style={styles.subtitle}>You've hit an important milestone.</Text>

          {/* Badge card (captured for sharing) */}
          <ViewShot ref={cardRef as any} options={{ format: "png", quality: 1 }} style={styles.cardWrapper}>
            <View style={styles.card}>
              {/* App label */}
              <Text style={styles.cardAppLabel}>Salam Y'all</Text>

              {/* Decorative circles */}
              <View style={styles.decorCircleOuter} />
              <View style={styles.decorCircleInner} />

              {/* Achievement text */}
              <View style={styles.cardBody}>
                <Text style={styles.cardBigText}>{bigText}</Text>
                <Text style={styles.cardUnitText}>{unitText}</Text>
                {userName && (
                  <Text style={styles.cardUserName}>{userName}</Text>
                )}
              </View>
            </View>
          </ViewShot>

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.shareButton}
              onPress={() => handleShare()}
            >
              <Text style={styles.shareButtonText}>Share the Moment</Text>
            </Pressable>

            <Pressable
              style={styles.igButton}
              onPress={() => handleShare("instagram")}
              hitSlop={4}
            >
              <Ionicons name="logo-instagram" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CARD_BG = "#EBF4F8";
const SHARE_BTN_BG = "#F08060";

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(8, 20, 30, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  closeButton: {
    position: "absolute",
    top: 56,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    alignItems: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginBottom: 32,
  },
  cardWrapper: {
    borderRadius: 20,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  card: {
    width: 280,
    height: 240,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    overflow: "hidden",
    padding: 24,
  },
  cardAppLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#8A9EAA",
    letterSpacing: 0.4,
    position: "absolute",
    top: 18,
    left: 20,
  },
  decorCircleOuter: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#E8A040",
    opacity: 0.55,
  },
  decorCircleInner: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#F0C060",
    opacity: 0.7,
  },
  cardBody: {
    position: "absolute",
    bottom: 24,
    left: 24,
  },
  cardBigText: {
    fontFamily: "Inter_700Bold",
    fontSize: 72,
    color: "#1A1A1A",
    lineHeight: 76,
  },
  cardUnitText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: "#1A1A1A",
    marginTop: 2,
  },
  cardUserName: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#5A6A74",
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  shareButton: {
    flex: 1,
    backgroundColor: SHARE_BTN_BG,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  shareButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  igButton: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: SHARE_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
