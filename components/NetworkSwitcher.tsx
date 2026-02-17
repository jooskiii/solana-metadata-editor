"use client";

import { useState } from "react";
import { useNetworkContext } from "./NetworkProvider";
import { NETWORK_OPTIONS } from "@/lib/constants";
import type { Network } from "@/lib/constants";

export function NetworkSwitcher() {
  const { network, setNetwork, customRpc, setCustomRpc, isReady } =
    useNetworkContext();
  const [showRpcInput, setShowRpcInput] = useState(!!customRpc);
  const [rpcDraft, setRpcDraft] = useState(customRpc);

  if (!isReady) return null;

  const handleRpcSave = () => {
    const trimmed = rpcDraft.trim();
    setCustomRpc(trimmed);
  };

  const handleRpcClear = () => {
    setCustomRpc("");
    setRpcDraft("");
    setShowRpcInput(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value as Network)}
          className="border border-foreground/20 px-2 py-1 text-xs bg-transparent outline-none cursor-pointer text-foreground/60"
        >
          {(
            Object.entries(NETWORK_OPTIONS) as [Network, { label: string }][]
          ).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowRpcInput(!showRpcInput)}
          className="text-xs text-foreground/40 hover:text-foreground/60"
          title="Custom RPC endpoint"
        >
          {customRpc ? "rpc*" : "rpc"}
        </button>
      </div>

      {showRpcInput && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={rpcDraft}
            onChange={(e) => setRpcDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRpcSave()}
            placeholder="https://your-rpc-endpoint.com"
            className="border border-foreground/20 px-2 py-1 text-xs bg-transparent outline-none focus:border-foreground/40 w-64"
          />
          <button
            onClick={handleRpcSave}
            className="text-xs text-foreground/50 hover:text-foreground/80 px-1"
          >
            save
          </button>
          {customRpc && (
            <button
              onClick={handleRpcClear}
              className="text-xs text-foreground/40 hover:text-foreground/60 px-1"
            >
              clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
