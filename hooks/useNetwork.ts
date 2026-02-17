"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DEFAULT_NETWORK,
  NETWORK_OPTIONS,
  NETWORK_STORAGE_KEY,
  CUSTOM_RPC_STORAGE_KEY,
} from "@/lib/constants";
import type { Network } from "@/lib/constants";

function getSavedNetwork(): Network {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (saved && saved in NETWORK_OPTIONS) return saved as Network;
  return DEFAULT_NETWORK;
}

function getSavedCustomRpc(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CUSTOM_RPC_STORAGE_KEY) || "";
}

export function useNetwork() {
  const [network, setNetworkState] = useState<Network>(DEFAULT_NETWORK);
  const [customRpc, setCustomRpcState] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setNetworkState(getSavedNetwork());
    setCustomRpcState(getSavedCustomRpc());
    setIsReady(true);
  }, []);

  const setNetwork = useCallback((n: Network) => {
    setNetworkState(n);
    localStorage.setItem(NETWORK_STORAGE_KEY, n);
  }, []);

  const setCustomRpc = useCallback((rpc: string) => {
    setCustomRpcState(rpc);
    localStorage.setItem(CUSTOM_RPC_STORAGE_KEY, rpc);
  }, []);

  const rpcEndpoint = customRpc || NETWORK_OPTIONS[network].rpc;
  const label = NETWORK_OPTIONS[network].label;

  return {
    network,
    setNetwork,
    customRpc,
    setCustomRpc,
    rpcEndpoint,
    label,
    isReady,
  };
}
