import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface MetroArea {
  name: string;
  lat: number;
  lng: number;
}

export const METRO_AREAS: MetroArea[] = [
  { name: "Triangle NC", lat: 35.7796, lng: -78.6382 },
  { name: "Bay Area CA", lat: 37.5485, lng: -121.9886 },
  { name: "Los Angeles CA", lat: 34.0522, lng: -118.2437 },
  { name: "DFW TX", lat: 32.7767, lng: -96.7970 },
  { name: "Houston TX", lat: 29.7604, lng: -95.3698 },
  { name: "Chicago IL", lat: 41.8781, lng: -87.6298 },
  { name: "NYC Metro", lat: 40.7128, lng: -74.0060 },
  { name: "DMV", lat: 38.9072, lng: -77.0369 },
  { name: "Detroit MI", lat: 42.3314, lng: -83.0458 },
  { name: "Atlanta GA", lat: 33.7490, lng: -84.3880 },
  { name: "Philadelphia PA", lat: 39.9526, lng: -75.1652 },
  { name: "Minneapolis MN", lat: 44.9778, lng: -93.2650 },
  { name: "San Diego CA", lat: 32.7157, lng: -117.1611 },
  { name: "Orlando FL", lat: 28.5383, lng: -81.3792 },
  { name: "Tampa FL", lat: 27.9506, lng: -82.4572 },
  { name: "Miami FL", lat: 25.7617, lng: -80.1918 },
  { name: "Phoenix AZ", lat: 33.4484, lng: -112.0740 },
  { name: "Seattle WA", lat: 47.6062, lng: -122.3321 },
  { name: "Denver CO", lat: 39.7392, lng: -104.9903 },
  { name: "Charlotte NC", lat: 35.2271, lng: -80.8431 },
  { name: "Columbus OH", lat: 39.9612, lng: -82.9988 },
  { name: "Nashville TN", lat: 36.1627, lng: -86.7816 },
  { name: "San Antonio TX", lat: 29.4241, lng: -98.4936 },
  { name: "Austin TX", lat: 30.2672, lng: -97.7431 },
  { name: "St. Louis MO", lat: 38.6270, lng: -90.1994 },
  { name: "Sacramento CA", lat: 38.5816, lng: -121.4944 },
  { name: "Boston MA", lat: 42.3601, lng: -71.0589 },
  { name: "Baltimore MD", lat: 39.2904, lng: -76.6122 },
];

const STORAGE_KEY = "location_override_metro";

interface LocationOverrideContextValue {
  overrideMetro: MetroArea | null;
  setOverrideMetro: (metro: MetroArea | null) => void;
  getEffectiveLocation: (realLat: number, realLng: number) => { lat: number; lng: number };
  isOverrideActive: boolean;
}

const LocationOverrideContext = createContext<LocationOverrideContextValue | null>(null);

export function LocationOverrideProvider({ children }: { children: ReactNode }) {
  const [overrideMetro, setOverrideMetroState] = useState<MetroArea | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const found = METRO_AREAS.find((m) => m.name === parsed.name);
          if (found) setOverrideMetroState(found);
        } catch {}
      }
    });
  }, []);

  const setOverrideMetro = useCallback((metro: MetroArea | null) => {
    setOverrideMetroState(metro);
    if (metro) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ name: metro.name }));
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const getEffectiveLocation = useCallback(
    (realLat: number, realLng: number) => {
      if (overrideMetro) {
        return { lat: overrideMetro.lat, lng: overrideMetro.lng };
      }
      return { lat: realLat, lng: realLng };
    },
    [overrideMetro]
  );

  return (
    <LocationOverrideContext.Provider
      value={{
        overrideMetro,
        setOverrideMetro,
        getEffectiveLocation,
        isOverrideActive: overrideMetro !== null,
      }}
    >
      {children}
    </LocationOverrideContext.Provider>
  );
}

export function useLocationOverride() {
  const ctx = useContext(LocationOverrideContext);
  if (!ctx) throw new Error("useLocationOverride must be used within LocationOverrideProvider");
  return ctx;
}
