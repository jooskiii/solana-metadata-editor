"use client";

import { SolanaProvider } from "@solana/react-hooks";
import type { ReactNode } from "react";

export function SolanaProviders({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider config={{ cluster: "devnet" }}>
      {children}
    </SolanaProvider>
  );
}
