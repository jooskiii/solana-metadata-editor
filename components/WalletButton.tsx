"use client";

import { useWalletConnection } from "@solana/react-hooks";
import { useState, useEffect, useCallback, useRef } from "react";
import { classifyWalletError } from "@/lib/types";
import type { WalletError } from "@/lib/types";
import { ERROR_DISPLAY_MS } from "@/lib/constants";

export function WalletButton() {
  const {
    connect,
    disconnect,
    connected,
    connecting,
    connectors,
    isReady,
    wallet,
  } = useWalletConnection();

  const [error, setError] = useState<WalletError | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const clearError = useCallback(() => {
    setError(null);
    if (errorTimer.current) {
      clearTimeout(errorTimer.current);
      errorTimer.current = null;
    }
  }, []);

  const showError = useCallback(
    (err: WalletError) => {
      clearError();
      setError(err);
      errorTimer.current = setTimeout(() => {
        setError(null);
        errorTimer.current = null;
      }, ERROR_DISPLAY_MS);
    },
    [clearError]
  );

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  const handleConnect = useCallback(
    async (connectorId: string) => {
      clearError();
      try {
        await connect(connectorId);
      } catch (err) {
        showError(classifyWalletError(err));
      }
    },
    [connect, clearError, showError]
  );

  const handleDisconnect = useCallback(async () => {
    clearError();
    setDisconnecting(true);
    try {
      await disconnect();
    } catch (err) {
      showError(classifyWalletError(err));
    } finally {
      setDisconnecting(false);
    }
  }, [disconnect, clearError, showError]);

  // not hydrated yet
  if (!isReady) {
    return (
      <div>
        <button
          disabled
          className="border border-foreground/20 px-4 py-2 text-sm text-foreground/40 cursor-default"
        >
          loading...
        </button>
      </div>
    );
  }

  // connected state
  if (connected && wallet) {
    const address = wallet.account.address;
    const short = `${address.slice(0, 4)}...${address.slice(-4)}`;

    return (
      <div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70 disabled:opacity-40"
        >
          {disconnecting ? "disconnecting..." : short}
        </button>
        {error && (
          <p className="text-sm text-foreground/50 mt-2">{error.message}</p>
        )}
      </div>
    );
  }

  // no wallets detected
  if (connectors.length === 0) {
    return (
      <div>
        <p className="text-sm text-foreground/50">
          no wallet found.{" "}
          <a
            href="https://phantom.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
          >
            install phantom
          </a>
          {" or "}
          <a
            href="https://solflare.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
          >
            solflare
          </a>
          {" to get started."}
        </p>
      </div>
    );
  }

  // disconnected with wallets available
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => handleConnect(connector.id)}
            disabled={connecting}
            className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70 disabled:opacity-40"
          >
            {connecting ? "connecting..." : `connect ${connector.name.toLowerCase()}`}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-sm text-foreground/50 mt-2">{error.message}</p>
      )}
    </div>
  );
}
