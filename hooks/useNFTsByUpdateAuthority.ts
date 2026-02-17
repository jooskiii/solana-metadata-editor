"use client";

import { useState, useEffect, useRef } from "react";
import { fetchNFTsByUpdateAuthority } from "@/lib/metaplex";
import type { NFTData } from "@/lib/metaplex";
import { RPC_ENDPOINT } from "@/lib/constants";

export function useNFTsByUpdateAuthority(address: string | null) {
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!address) {
      setNfts([]);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetchNFTsByUpdateAuthority(address, RPC_ENDPOINT)
      .then((result) => {
        if (!controller.signal.aborted) {
          setNfts(result);
          setLoading(false);
          console.log(`Loaded ${result.length} NFTs for ${address}`);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load NFTs";
          setError(msg);
          setLoading(false);
          console.error("Error loading NFTs:", err);
        }
      });

    return () => {
      controller.abort();
    };
  }, [address]);

  return { nfts, loading, error };
}
