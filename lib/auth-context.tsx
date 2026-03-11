import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const AUTH_TOKEN_KEY = "auth_session_token";

interface AuthUser {
  id: number;
  email: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signInWithApple: () => Promise<string>;
  signOut: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then(async (token) => {
      if (token) {
        try {
          const baseUrl = getApiUrl();
          const url = new URL("/api/auth/me", baseUrl);
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            setSessionToken(token);
          } else {
            await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
          }
        } catch {
          await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
        }
      }
      setIsLoading(false);
    });
  }, []);

  const signInWithApple = useCallback(async (): Promise<string> => {
    if (Platform.OS === "web") {
      throw new Error("Apple Sign-In is not available on web");
    }

    const AppleAuth = await import("expo-apple-authentication");

    const isAvailable = await AppleAuth.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("Apple Sign-In is not available on this device");
    }

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    const displayName =
      credential.fullName?.givenName && credential.fullName?.familyName
        ? `${credential.fullName.givenName} ${credential.fullName.familyName}`
        : credential.fullName?.givenName || null;

    const response = await apiRequest("POST", "/api/auth/apple", {
      appleId: credential.user,
      email: credential.email,
      displayName,
    });

    const data = await response.json();
    setSessionToken(data.token);
    setUser(data.user);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
    return data.token;
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setSessionToken(null);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!sessionToken) return {};
    return { Authorization: `Bearer ${sessionToken}` };
  }, [sessionToken]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithApple, signOut, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
