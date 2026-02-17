"use client";

import { useState, useEffect } from "react";
import { WalletButton } from "@/components/WalletButton";
import { NFTGallery } from "@/components/NFTGallery";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { useNFTsByUpdateAuthority } from "@/hooks/useNFTsByUpdateAuthority";

export default function Home() {
  const { connected, address, isReady } = useWalletStatus();
  const { nfts, loading, loadingOffChain, offChainProgress, error } =
    useNFTsByUpdateAuthority(connected ? address : null);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  // clear selection when wallet changes
  useEffect(() => {
    setSelectedMint(null);
  }, [address]);

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
          <NFTGallery
            nfts={nfts}
            loading={loading}
            loadingOffChain={loadingOffChain}
            offChainProgress={offChainProgress}
            error={error}
            selectedMint={selectedMint}
            onSelect={setSelectedMint}
          />
        </div>
      )}
    </main>
  );
}
