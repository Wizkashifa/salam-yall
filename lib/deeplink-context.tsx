import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

export type DeepLinkTarget = {
  type: "event" | "restaurant" | "business";
  id: string;
} | null;

interface DeepLinkContextValue {
  pendingTarget: DeepLinkTarget;
  setPendingTarget: (target: DeepLinkTarget) => void;
  consumeTarget: (type: "event" | "restaurant" | "business") => string | null;
}

const DeepLinkContext = createContext<DeepLinkContextValue | null>(null);

export function DeepLinkProvider({ children }: { children: ReactNode }) {
  const [pendingTarget, setPendingTarget] = useState<DeepLinkTarget>(null);

  const consumeTarget = useCallback(
    (type: "event" | "restaurant" | "business"): string | null => {
      if (pendingTarget && pendingTarget.type === type) {
        const id = pendingTarget.id;
        setPendingTarget(null);
        return id;
      }
      return null;
    },
    [pendingTarget]
  );

  const value = useMemo(
    () => ({ pendingTarget, setPendingTarget, consumeTarget }),
    [pendingTarget, consumeTarget]
  );

  return (
    <DeepLinkContext.Provider value={value}>{children}</DeepLinkContext.Provider>
  );
}

export function useDeepLink() {
  const context = useContext(DeepLinkContext);
  if (!context) {
    throw new Error("useDeepLink must be used within a DeepLinkProvider");
  }
  return context;
}

export function parseDeepLinkUrl(url: string): DeepLinkTarget {
  try {
    const patterns = [
      { regex: /\/share\/event\/([^/?#]+)/, type: "event" as const },
      { regex: /\/share\/restaurant\/([^/?#]+)/, type: "restaurant" as const },
      { regex: /\/share\/business\/([^/?#]+)/, type: "business" as const },
      { regex: /ummahconnect:\/\/event\/([^/?#]+)/, type: "event" as const },
      { regex: /ummahconnect:\/\/restaurant\/([^/?#]+)/, type: "restaurant" as const },
      { regex: /ummahconnect:\/\/business\/([^/?#]+)/, type: "business" as const },
    ];
    for (const { regex, type } of patterns) {
      const match = url.match(regex);
      if (match && match[1]) {
        return { type, id: decodeURIComponent(match[1]) };
      }
    }
  } catch {}
  return null;
}
