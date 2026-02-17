"use client";

import { WalletButton } from "@/components/WalletButton";
import { useWalletStatus } from "@/hooks/useWalletStatus";

export default function Home() {
  const { connected, address, isReady } = useWalletStatus();

  return (
    <main className="mx-auto max-w-[800px] px-6 py-16">
      <h1 className="text-xl font-normal mb-4">nft metadata editor</h1>

      {!connected && (
        <p className="text-foreground/60 mb-8">
          connect your wallet to view and edit metadata for your nfts on devnet.
          that&apos;s basically it.
        </p>
      )}

      <WalletButton />

      {isReady && connected && address && (
        <div className="mt-12">
          <p className="text-foreground/60 text-sm">
            connected as{" "}
            <span className="font-mono text-foreground">
              {address.slice(0, 4)}...{address.slice(-4)}
            </span>
            {" "}on devnet
          </p>
          <p className="text-foreground/40 text-sm mt-4">
            nft metadata editing coming soon.
          </p>
        </div>
      )}
    </main>
  );
}
