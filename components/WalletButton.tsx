"use client";

import { useWalletConnection } from "@solana/react-hooks";

export function WalletButton() {
  const { connect, disconnect, connected, connecting, connectors, isReady, wallet } =
    useWalletConnection();

  if (!isReady) {
    return (
      <button
        disabled
        className="border border-foreground/20 px-4 py-2 text-sm text-foreground/40 cursor-default"
      >
        loading...
      </button>
    );
  }

  if (connected && wallet) {
    const address = wallet.account.address;
    const short = address
      ? `${address.slice(0, 4)}...${address.slice(-4)}`
      : "connected";

    return (
      <button
        onClick={() => disconnect()}
        className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70"
      >
        {short}
      </button>
    );
  }

  if (connectors.length === 0) {
    return (
      <a
        href="https://phantom.app"
        target="_blank"
        rel="noopener noreferrer"
        className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70 inline-block"
      >
        get a wallet
      </a>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {connectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => connect(connector.id)}
          disabled={connecting}
          className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70 disabled:opacity-40"
        >
          {connecting ? "connecting..." : `connect ${connector.name.toLowerCase()}`}
        </button>
      ))}
    </div>
  );
}
