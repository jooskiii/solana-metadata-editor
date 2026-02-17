"use client";

import { useNetworkContext } from "./NetworkProvider";
import { NETWORK_OPTIONS } from "@/lib/constants";
import type { Network } from "@/lib/constants";

export function NetworkSwitcher() {
  const { network, setNetwork, isReady } = useNetworkContext();

  if (!isReady) return null;

  return (
    <select
      value={network}
      onChange={(e) => setNetwork(e.target.value as Network)}
      className="border border-foreground/20 px-2 py-1 text-xs bg-transparent outline-none cursor-pointer text-foreground/60"
    >
      {(Object.entries(NETWORK_OPTIONS) as [Network, { label: string }][]).map(
        ([value, { label }]) => (
          <option key={value} value={value}>
            {label}
          </option>
        )
      )}
    </select>
  );
}
