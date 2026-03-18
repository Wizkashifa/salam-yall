import { useMemo } from "react";
import { View, StyleSheet } from "react-native";

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
  distanceFilter?: number | "all";
  onSelectEvent?: (eventId: string) => void;
}

function getZoomForRadius(miles: number | "all"): number {
  if (miles === "all") return 8;
  if (miles <= 10) return 11.5;
  if (miles <= 25) return 10;
  if (miles <= 50) return 9;
  return 8.5;
}

export function EventsMap({ events, userLocation, borderColor, backgroundColor, emeraldColor, distanceFilter = "all" }: EventsMapProps) {
  const leafletHtml = useMemo(() => {
    const mappableEvents = events.filter((e) => e.latitude != null && e.longitude != null && !e.isVirtual);

    const center = userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude }
      : mappableEvents.length > 0
        ? {
            lat: mappableEvents.reduce((sum, e) => sum + e.latitude, 0) / mappableEvents.length,
            lng: mappableEvents.reduce((sum, e) => sum + e.longitude, 0) / mappableEvents.length,
          }
        : { lat: 35.78, lng: -78.64 };

    const zoomLevel = Math.round(getZoomForRadius(distanceFilter));

    const markers = mappableEvents.map((e) => {
      const title = e.title.replace(/'/g, "\\'");
      const org = (e.organizer || "").replace(/'/g, "\\'");
      const popup = org ? `<b>${title}</b><br>${org}` : `<b>${title}</b>`;
      return `L.circleMarker([${e.latitude},${e.longitude}],{radius:8,fillColor:'${emeraldColor}',color:'#fff',weight:2,opacity:1,fillOpacity:1}).addTo(map).bindPopup('${popup}');`;
    }).join("");

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>html,body,#map{margin:0;padding:0;width:100%;height:100%}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lng}],${zoomLevel});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);${markers}<\/script></body></html>`;
  }, [events, userLocation, emeraldColor, distanceFilter]);

  return (
    <View style={[styles.container, { borderColor, backgroundColor, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 } as any]}>
      <iframe
        srcDoc={leafletHtml}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 16 } as any}
        title="Events Map"
      />
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
});
