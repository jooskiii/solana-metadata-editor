"use client";

import { useState, useEffect } from "react";
import { WalletButton } from "@/components/WalletButton";
import { NFTGallery } from "@/components/NFTGallery";
import { MetadataEditor } from "@/components/MetadataEditor";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { useNetworkContext } from "@/components/NetworkProvider";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { useNFTsByUpdateAuthority } from "@/hooks/useNFTsByUpdateAuthority";
import type { NFTData } from "@/lib/metaplex";

export default function Home() {
  const { connected, address, isReady } = useWalletStatus();
  const { rpcEndpoint, label } = useNetworkContext();
  const { nfts, loading, loadingOffChain, offChainProgress, error } =
    useNFTsByUpdateAuthority(connected ? address : null, rpcEndpoint);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [editingNft, setEditingNft] = useState<NFTData | null>(null);

  // clear selection and editor when wallet or network changes
  useEffect(() => {
    setSelectedMint(null);
    setEditingNft(null);
  }, [address, rpcEndpoint]);

  return (
    <main className="mx-auto max-w-[800px] px-6 py-16">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-normal">nft metadata editor</h1>
        <NetworkSwitcher />
      </div>

      {!connected && (
        <p className="text-foreground/60 mb-8">
          connect your wallet to view and edit metadata for your nfts on {label}.
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
            onEdit={(nft) => setEditingNft(nft)}
          />
          {editingNft && (
            <div className="mt-8">
              <MetadataEditor
                nft={editingNft}
                onClose={() => setEditingNft(null)}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
