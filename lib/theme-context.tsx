import { createContext, useContext, useMemo, useState, useEffect, useCallback, ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

type ThemeMode = "system" | "light" | "dark";
type ThemeColors = typeof Colors.light;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  ramadanMode: boolean;
  setRamadanMode: (enabled: boolean) => void;
}

const THEME_MODE_KEY = "theme_mode";
const RAMADAN_MODE_KEY = "ramadan_mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [ramadanMode, setRamadanModeState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_MODE_KEY),
      AsyncStorage.getItem(RAMADAN_MODE_KEY),
    ]).then(([themeVal, ramadanVal]) => {
      if (themeVal === "light" || themeVal === "dark" || themeVal === "system") {
        setThemeModeState(themeVal);
      }
      if (ramadanVal === "true") setRamadanModeState(true);
      setLoaded(true);
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode);
  }, []);

  const setRamadanMode = useCallback((enabled: boolean) => {
    setRamadanModeState(enabled);
    AsyncStorage.setItem(RAMADAN_MODE_KEY, enabled ? "true" : "false");
  }, []);

  const isDark = useMemo(() => {
    if (themeMode === "system") return systemScheme === "dark";
    return themeMode === "dark";
  }, [themeMode, systemScheme]);

  const value = useMemo(() => {
    let colors: ThemeColors;
    if (ramadanMode) {
      colors = isDark ? Colors.darkRamadan : Colors.lightRamadan;
    } else {
      colors = isDark ? Colors.dark : Colors.light;
    }
    return {
      colors,
      isDark,
      themeMode,
      setThemeMode,
      ramadanMode,
      setRamadanMode,
    };
  }, [isDark, themeMode, setThemeMode, ramadanMode, setRamadanMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
