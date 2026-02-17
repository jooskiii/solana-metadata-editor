"use client";

import { createContext, useContext } from "react";
import { useNetwork } from "@/hooks/useNetwork";
import type { Network } from "@/lib/constants";

interface NetworkContextValue {
  network: Network;
  setNetwork: (n: Network) => void;
  rpcEndpoint: string;
  label: string;
  isReady: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const value = useNetwork();
  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetworkContext() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetworkContext must be used within NetworkProvider");
  return ctx;
}
