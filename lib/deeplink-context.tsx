import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

export type DeepLinkType = "event" | "restaurant" | "business" | "janaza" | "verification";

export type DeepLinkTarget = {
  type: DeepLinkType;
  id: string;
} | null;

interface DeepLinkContextValue {
  pendingTarget: DeepLinkTarget;
  setPendingTarget: (target: DeepLinkTarget) => void;
  consumeTarget: (type: DeepLinkType) => string | null;
}

const DeepLinkContext = createContext<DeepLinkContextValue | null>(null);

export function DeepLinkProvider({ children }: { children: ReactNode }) {
  const [pendingTarget, setPendingTarget] = useState<DeepLinkTarget>(null);

  const consumeTarget = useCallback(
    (type: DeepLinkType): string | null => {
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
      { regex: /salamyall:\/\/event\/([^/?#]+)/, type: "event" as const },
      { regex: /salamyall:\/\/restaurant\/([^/?#]+)/, type: "restaurant" as const },
      { regex: /salamyall:\/\/business\/([^/?#]+)/, type: "business" as const },
      { regex: /salamyall:\/\/janaza/, type: "janaza" as const },
    ];
    for (const { regex, type } of patterns) {
      const match = url.match(regex);
      if (match) {
        return { type, id: match[1] ? decodeURIComponent(match[1]) : "" };
      }
    }
  } catch {}
  return null;
}
