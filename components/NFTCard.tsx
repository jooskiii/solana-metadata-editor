"use client";

import { useState } from "react";
import { CopyText } from "./CopyText";
import type { NFTData } from "@/lib/metaplex";

interface NFTCardProps {
  nft: NFTData;
  selected: boolean;
  showImage: boolean;
  onSelect: () => void;
}

export function NFTCard({ nft, selected, showImage, onSelect }: NFTCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const shortMint = `${nft.mint.slice(0, 4)}...${nft.mint.slice(-4)}`;
  const isBroken = nft.uriBroken || imageError;

  return (
    <div
      onClick={onSelect}
      className={`p-4 cursor-pointer border ${
        selected
          ? "border-foreground"
          : isBroken
            ? "border-red-400/40"
            : "border-foreground/10"
      } hover:opacity-80`}
    >
      {showImage && (
        <div className="w-full aspect-square mb-3 bg-foreground/5 flex items-center justify-center overflow-hidden">
          {nft.image && !imageError ? (
            <>
              {!imageLoaded && (
                <span className="text-xs text-foreground/30 absolute">
                  loading...
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={nft.image}
                alt={nft.name}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`w-full h-full object-cover ${imageLoaded ? "" : "opacity-0"}`}
              />
            </>
          ) : (
            <span className="text-xs text-foreground/30">
              {imageError ? "image broken" : "no image"}
            </span>
          )}
        </div>
      )}

      <p className="text-sm truncate">{nft.name}</p>
      {nft.symbol && (
        <p className="text-xs text-foreground/40">{nft.symbol}</p>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <CopyText
          text={nft.mint}
          display={shortMint}
          className="text-xs font-mono text-foreground/50"
        />
        <CopyText
          text={nft.uri || "(no uri)"}
          className="text-xs font-mono text-foreground/50 block truncate max-w-full"
        />
      </div>

      {isBroken && (
        <p className="text-xs text-red-500/70 mt-2">
          {nft.uriBroken ? "broken link" : "broken image"}
        </p>
      )}
    </div>
  );
}
