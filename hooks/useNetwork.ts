"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DEFAULT_NETWORK,
  NETWORK_OPTIONS,
  NETWORK_STORAGE_KEY,
} from "@/lib/constants";
import type { Network } from "@/lib/constants";

function getSavedNetwork(): Network {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (saved && saved in NETWORK_OPTIONS) return saved as Network;
  return DEFAULT_NETWORK;
}

export function useNetwork() {
  const [network, setNetworkState] = useState<Network>(DEFAULT_NETWORK);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setNetworkState(getSavedNetwork());
    setIsReady(true);
  }, []);

  const setNetwork = useCallback((n: Network) => {
    setNetworkState(n);
    localStorage.setItem(NETWORK_STORAGE_KEY, n);
  }, []);

  const rpcEndpoint = NETWORK_OPTIONS[network].rpc;
  const label = NETWORK_OPTIONS[network].label;

  return { network, setNetwork, rpcEndpoint, label, isReady };
}
