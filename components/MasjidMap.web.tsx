import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
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
  const leafletHtml = useMemo(() => {
    const zoomLevel = hasUserLocation ? 11 : 10;
    const markers = masjids.map(({ masjid: m }) => {
      const isPreferred = preferredMasjid === m.name;
      const color = isPreferred ? "#D4AF37" : m.hasIqama ? "#D4A843" : "#047857";
      const name = m.name.replace(/'/g, "\\'");
      const addr = m.address.replace(/'/g, "\\'");
      return `L.circleMarker([${m.latitude},${m.longitude}],{radius:${isPreferred ? 10 : 8},fillColor:'${color}',color:'#fff',weight:2,opacity:1,fillOpacity:1}).addTo(map).bindPopup('<b>${name}</b><br>${addr}');`;
    }).join("");
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>html,body,#map{margin:0;padding:0;width:100%;height:100%}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${region.latitude},${region.longitude}],${zoomLevel});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);${markers}<\/script></body></html>`;
  }, [masjids, preferredMasjid, region, hasUserLocation]);

  return (
    <View style={[styles.container, { borderColor }]}>
      <iframe
        srcDoc={leafletHtml}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 16 } as any}
        title="Masjid Map"
      />
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
});
