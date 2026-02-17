"use client";

import { useWalletConnection } from "@solana/react-hooks";
import type { WalletState } from "@/lib/types";

export function useWalletStatus() {
  const { connected, connecting, wallet, isReady } = useWalletConnection();

  let state: WalletState = "disconnected";
  if (connecting) state = "connecting";
  else if (connected) state = "connected";

  return {
    isReady,
    state,
    connected,
    connecting,
    address: wallet?.account.address ?? null,
  };
}
