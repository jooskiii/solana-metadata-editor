"use client";

import { SolanaProvider } from "@solana/react-hooks";
import type { ReactNode } from "react";
import { NetworkProvider, useNetworkContext } from "./NetworkProvider";

function SolanaClientWrapper({ children }: { children: ReactNode }) {
  const { network } = useNetworkContext();

  return (
    <SolanaProvider key={network} config={{ cluster: network }}>
      {children}
    </SolanaProvider>
  );
}

export function SolanaProviders({ children }: { children: ReactNode }) {
  return (
    <NetworkProvider>
      <SolanaClientWrapper>{children}</SolanaClientWrapper>
    </NetworkProvider>
  );
}
