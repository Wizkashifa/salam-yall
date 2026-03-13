import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const AUTH_TOKEN_KEY = "auth_session_token";
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

interface AuthUser {
  id: number;
  email: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signInWithApple: () => Promise<string>;
  signInWithGoogle: (idToken?: string) => Promise<string>;
  devSignIn: () => Promise<string>;
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
      identityToken: credential.identityToken,
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

  const signInWithGoogle = useCallback(async (idToken?: string): Promise<string> => {
    let tokenToSend = idToken;

    if (!tokenToSend && Platform.OS !== "web") {
      const AuthSession = await import("expo-auth-session");
      const WebBrowser = await import("expo-web-browser");

      WebBrowser.maybeCompleteAuthSession();

      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
      };

      const redirectUri = AuthSession.makeRedirectUri({ scheme: "salamyall" });

      const state = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

      const authRequest = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri,
        scopes: ["openid", "profile", "email"],
        responseType: "id_token" as any,
        usePKCE: false,
        extraParams: {
          nonce: state,
        },
      });

      const result = await authRequest.promptAsync(discovery);

      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") {
          const cancelErr = new Error("Sign in cancelled");
          (cancelErr as any).code = "ERR_REQUEST_CANCELED";
          throw cancelErr;
        }
        throw new Error("Google Sign-In failed");
      }

      tokenToSend = (result.params as any)?.id_token;
      if (!tokenToSend) {
        throw new Error("No ID token received from Google");
      }
    }

    if (!tokenToSend) {
      throw new Error("No Google ID token provided");
    }

    const response = await apiRequest("POST", "/api/auth/google", { idToken: tokenToSend });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    setSessionToken(data.token);
    setUser(data.user);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
    return data.token;
  }, []);

  const devSignIn = useCallback(async (): Promise<string> => {
    const response = await apiRequest("POST", "/api/auth/dev-signin", {});
    const data = await response.json();
    setSessionToken(data.token);
    setUser(data.user);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
    return data.token;
  }, []);

  const signOut = useCallback(async () => {
    if (sessionToken) {
      try {
        const baseUrl = getApiUrl();
        await fetch(new URL("/api/auth/signout", baseUrl).toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch {}
    }
    setUser(null);
    setSessionToken(null);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  }, [sessionToken]);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!sessionToken) return {};
    return { Authorization: `Bearer ${sessionToken}` };
  }, [sessionToken]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithApple, signInWithGoogle, devSignIn, signOut, getAuthHeaders }}>
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
