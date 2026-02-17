"use client";

import { useWalletConnection } from "@solana/react-hooks";

export function useWalletStatus() {
  const { connected, wallet, isReady } = useWalletConnection();

  return {
    isReady,
    connected,
    address: wallet?.account.address ?? null,
  };
}
