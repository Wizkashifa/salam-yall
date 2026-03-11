import { useRef, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker, Callout } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Masjid } from "@/lib/prayer-utils";

interface MasjidMapProps {
  masjids: Array<{ masjid: Masjid; distanceMiles: number }>;
  preferredMasjid: string | null;
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  hasUserLocation: boolean;
  onSelectMasjid: (masjid: Masjid) => void;
  borderColor: string;
  emeraldColor: string;
}

export function MasjidMap({ masjids, preferredMasjid, region, hasUserLocation, onSelectMasjid, borderColor, emeraldColor }: MasjidMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (hasUserLocation && mapRef.current) {
      mapRef.current.animateToRegion(region, 500);
    }
  }, [hasUserLocation, region]);

  return (
    <View style={[styles.container, { borderColor }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={hasUserLocation}
        showsMyLocationButton={false}
      >
        {masjids.map((entry, i) => {
          const m = entry.masjid;
          const isPreferred = preferredMasjid === m.name;
          const markerBg = isPreferred ? "#D4AF37" : m.hasIqama ? "#D4A843" : "#047857";
          return (
            <Marker
              key={i}
              coordinate={{ latitude: m.latitude, longitude: m.longitude }}
              onCalloutPress={() => onSelectMasjid(m)}
            >
              <View style={styles.customMarker}>
                <View style={[styles.markerCircle, { backgroundColor: markerBg }]}>
                  <MaterialCommunityIcons name="mosque" size={14} color="#fff" />
                </View>
                {isPreferred && (
                  <View style={styles.starBadge}>
                    <MaterialCommunityIcons name="star" size={10} color="#D4AF37" />
                  </View>
                )}
              </View>
              <Callout tooltip={false}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.calloutSub}>Tap for details</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  callout: {
    width: 180,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  calloutSub: {
    fontSize: 11,
    color: "#6B7280",
  },
  customMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  markerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  starBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#fff",
    borderRadius: 7,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
