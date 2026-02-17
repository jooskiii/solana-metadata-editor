"use client";

import { useState, useEffect, useRef } from "react";
import {
  fetchMetadataAccounts,
  enrichAllProgressively,
} from "@/lib/metaplex";
import type { NFTData } from "@/lib/metaplex";
import { RPC_ENDPOINT } from "@/lib/constants";

export interface OffChainProgress {
  loaded: number;
  total: number;
}

export function useNFTsByUpdateAuthority(address: string | null) {
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOffChain, setLoadingOffChain] = useState(false);
  const [offChainProgress, setOffChainProgress] = useState<OffChainProgress>({
    loaded: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!address) {
      setNfts([]);
      setLoading(false);
      setLoadingOffChain(false);
      setOffChainProgress({ loaded: 0, total: 0 });
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadingOffChain(false);
    setError(null);

    fetchMetadataAccounts(address, RPC_ENDPOINT)
      .then(async (rawNfts) => {
        if (controller.signal.aborted) return;

        // phase 1 done — show on-chain data immediately
        setNfts(rawNfts);
        setLoading(false);
        console.log(`Showing ${rawNfts.length} NFTs (on-chain), fetching off-chain data...`);

        if (rawNfts.length === 0) return;

        // phase 2 — enrich with off-chain data in batches
        setLoadingOffChain(true);
        setOffChainProgress({ loaded: 0, total: rawNfts.length });

        await enrichAllProgressively(
          rawNfts,
          (updated, loaded, total) => {
            setNfts(updated);
            setOffChainProgress({ loaded, total });
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setLoadingOffChain(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load NFTs";
          setError(msg);
          setLoading(false);
          setLoadingOffChain(false);
          console.error("Error loading NFTs:", err);
        }
      });

    return () => {
      controller.abort();
    };
  }, [address]);

  return { nfts, loading, loadingOffChain, offChainProgress, error };
}
