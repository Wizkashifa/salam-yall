import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CALC_METHOD_LABELS, type CalcMethodKey } from "@/lib/prayer-utils";

const VALID_METHODS = Object.keys(CALC_METHOD_LABELS) as CalcMethodKey[];

export type AsrCalc = "standard" | "hanafi";

interface SettingsContextValue {
  calcMethod: CalcMethodKey;
  setCalcMethod: (method: CalcMethodKey) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  iqamaAlertsEnabled: boolean;
  setIqamaAlertsEnabled: (enabled: boolean) => void;
  preferredMasjid: string | null;
  setPreferredMasjid: (name: string | null) => void;
  hijriOffset: number;
  setHijriOffset: (offset: number) => void;
  asrCalc: AsrCalc;
  setAsrCalc: (calc: AsrCalc) => void;
  menuOpen: boolean;
  openMenu: () => void;
  openMenuToSection: (section: string) => void;
  pendingDrawerSection: string | null;
  consumePendingDrawerSection: () => string | null;
  closeMenu: () => void;
  pendingSettingsSection: string | null;
  setPendingSettingsSection: (section: string | null) => void;
  consumePendingSettingsSection: () => string | null;
}

const CALC_METHOD_KEY = "prayer_calc_method";
const NOTIF_PREF_KEY = "prayer_notifications_enabled";
const PREFERRED_MASJID_KEY = "preferred_masjid";
const HIJRI_OFFSET_KEY = "hijri_offset";
const ASR_CALC_KEY = "asr_calc";
const IQAMA_ALERTS_KEY = "iqama_alerts_enabled";
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [calcMethod, setCalcMethodState] = useState<CalcMethodKey>("NorthAmerica");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [iqamaAlertsEnabled, setIqamaAlertsEnabledState] = useState(false);
  const [preferredMasjid, setPreferredMasjidState] = useState<string | null>(null);
  const [hijriOffset, setHijriOffsetState] = useState(0);
  const [asrCalc, setAsrCalcState] = useState<AsrCalc>("standard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDrawerSection, setPendingDrawerSection] = useState<string | null>(null);
  const [pendingSettingsSection, setPendingSettingsSectionState] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CALC_METHOD_KEY),
      AsyncStorage.getItem(NOTIF_PREF_KEY),
      AsyncStorage.getItem(PREFERRED_MASJID_KEY),
      AsyncStorage.getItem(HIJRI_OFFSET_KEY),
      AsyncStorage.getItem(ASR_CALC_KEY),
      AsyncStorage.getItem(IQAMA_ALERTS_KEY),
    ]).then(([method, notif, masjid, offset, asr, iqamaAlerts]) => {
      if (method && VALID_METHODS.includes(method as CalcMethodKey)) {
        setCalcMethodState(method as CalcMethodKey);
      }
      if (notif === "true") setNotificationsEnabledState(true);
      if (iqamaAlerts === "true") setIqamaAlertsEnabledState(true);
      if (masjid) setPreferredMasjidState(masjid);
      if (offset) {
        const n = parseInt(offset, 10);
        if (n === -1 || n === 0 || n === 1) setHijriOffsetState(n);
      }
      if (asr === "hanafi") setAsrCalcState("hanafi");
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

  const setIqamaAlertsEnabled = useCallback((enabled: boolean) => {
    setIqamaAlertsEnabledState(enabled);
    AsyncStorage.setItem(IQAMA_ALERTS_KEY, enabled ? "true" : "false");
  }, []);

  const setPreferredMasjid = useCallback((name: string | null) => {
    setPreferredMasjidState(name);
    if (name) {
      AsyncStorage.setItem(PREFERRED_MASJID_KEY, name);
    } else {
      AsyncStorage.removeItem(PREFERRED_MASJID_KEY);
    }
  }, []);

  const setHijriOffset = useCallback((offset: number) => {
    setHijriOffsetState(offset);
    AsyncStorage.setItem(HIJRI_OFFSET_KEY, String(offset));
  }, []);

  const setAsrCalc = useCallback((calc: AsrCalc) => {
    setAsrCalcState(calc);
    AsyncStorage.setItem(ASR_CALC_KEY, calc);
  }, []);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const openMenuToSection = useCallback((section: string) => {
    setPendingDrawerSection(section);
    setMenuOpen(true);
  }, []);
  const consumePendingDrawerSection = useCallback(() => {
    const s = pendingDrawerSection;
    setPendingDrawerSection(null);
    return s;
  }, [pendingDrawerSection]);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const setPendingSettingsSection = useCallback((section: string | null) => {
    setPendingSettingsSectionState(section);
  }, []);
  const consumePendingSettingsSection = useCallback(() => {
    const s = pendingSettingsSection;
    setPendingSettingsSectionState(null);
    return s;
  }, [pendingSettingsSection]);

  return (
    <SettingsContext.Provider value={{
      calcMethod,
      setCalcMethod,
      notificationsEnabled,
      setNotificationsEnabled,
      iqamaAlertsEnabled,
      setIqamaAlertsEnabled,
      preferredMasjid,
      setPreferredMasjid,
      hijriOffset,
      setHijriOffset,
      asrCalc,
      setAsrCalc,
      menuOpen,
      openMenu,
      openMenuToSection,
      pendingDrawerSection,
      consumePendingDrawerSection,
      closeMenu,
      pendingSettingsSection,
      setPendingSettingsSection,
      consumePendingSettingsSection,
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
