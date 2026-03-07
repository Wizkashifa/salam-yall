import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CALC_METHOD_LABELS, type CalcMethodKey } from "@/lib/prayer-utils";

const VALID_METHODS = Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[];

interface SettingsContextValue {
  calcMethod: CalcMethodKey;
  setCalcMethod: (method: CalcMethodKey) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

const CALC_METHOD_KEY = "prayer_calc_method";
const NOTIF_PREF_KEY = "prayer_notifications_enabled";

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [calcMethod, setCalcMethodState] = useState<CalcMethodKey>("NorthAmerica");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CALC_METHOD_KEY),
      AsyncStorage.getItem(NOTIF_PREF_KEY),
    ]).then(([method, notif]) => {
      if (method && VALID_METHODS.includes(method as CalcMethodKey)) {
        setCalcMethodState(method as CalcMethodKey);
      }
      if (notif === "true") setNotificationsEnabledState(true);
    });
  }, []);

  const setCalcMethod = useCallback((method: CalcMethodKey) => {
    setCalcMethodState(method);
    AsyncStorage.setItem(CALC_METHOD_KEY, method);
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    AsyncStorage.setItem(NOTIF_PREF_KEY, enabled ? "true" : "false");
  }, []);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <SettingsContext.Provider value={{
      calcMethod,
      setCalcMethod,
      notificationsEnabled,
      setNotificationsEnabled,
      menuOpen,
      openMenu,
      closeMenu,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
