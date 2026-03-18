import { useRef, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker, Callout } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

interface EventLocation {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  isVirtual?: boolean;
  organizer?: string;
}

interface EventsMapProps {
  events: EventLocation[];
  userLocation: { latitude: number; longitude: number } | null;
  borderColor: string;
  backgroundColor: string;
  emeraldColor: string;
  goldColor: string;
  onSelectEvent?: (eventId: string) => void;
}

export function EventsMap({ events, userLocation, borderColor, backgroundColor, emeraldColor, goldColor, onSelectEvent }: EventsMapProps) {
  const mapRef = useRef<MapView>(null);

  const mappableEvents = events.filter((e) => e.latitude != null && e.longitude != null && !e.isVirtual);

  const region = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.45, longitudeDelta: 0.45 }
    : mappableEvents.length > 0
      ? {
          latitude: mappableEvents.reduce((sum, e) => sum + e.latitude, 0) / mappableEvents.length,
          longitude: mappableEvents.reduce((sum, e) => sum + e.longitude, 0) / mappableEvents.length,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }
      : { latitude: 35.78, longitude: -78.64, latitudeDelta: 0.5, longitudeDelta: 0.5 };

  useEffect(() => {
    if (mapRef.current && mappableEvents.length > 0) {
      mapRef.current.animateToRegion(region, 500);
    }
  }, [userLocation]);

  return (
    <View style={[styles.container, { borderColor, backgroundColor, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
      >
        {mappableEvents.map((event) => (
          <Marker
            key={event.id}
            coordinate={{ latitude: event.latitude, longitude: event.longitude }}
            onCalloutPress={() => onSelectEvent?.(event.id)}
          >
            <View style={styles.customMarker}>
              <View style={[styles.markerCircle, { backgroundColor: emeraldColor }]}>
                <Ionicons name="calendar" size={12} color="#fff" />
              </View>
            </View>
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle} numberOfLines={2}>{event.title}</Text>
                {event.organizer ? (
                  <Text style={styles.calloutSub} numberOfLines={1}>{event.organizer}</Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const MAP_HEIGHT = 280;

const styles = StyleSheet.create({
  container: {
    height: MAP_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  callout: {
    width: 200,
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
});
