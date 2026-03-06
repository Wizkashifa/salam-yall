import { createContext, useContext, useMemo, ReactNode } from "react";
import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

type ThemeColors = typeof Colors.light;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const value = useMemo(
    () => ({
      colors: isDark ? Colors.dark : Colors.light,
      isDark,
    }),
    [isDark]
  );

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
