"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchNFTsViaDAS,
  isDASUnsupported,
  fetchMetadataAccounts,
  enrichAllProgressively,
} from "@/lib/metaplex";
import type { NFTData } from "@/lib/metaplex";

export interface OffChainProgress {
  loaded: number;
  total: number;
}

export function useNFTsByUpdateAuthority(
  address: string | null,
  rpcEndpoint: string
) {
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOffChain, setLoadingOffChain] = useState(false);
  const [offChainProgress, setOffChainProgress] = useState<OffChainProgress>({
    loaded: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), []);

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

    setNfts([]);
    setLoading(true);
    setLoadingOffChain(false);
    setError(null);

    (async () => {
      try {
        // Try DAS API first (faster, includes off-chain data)
        try {
          console.log("Trying DAS API...");
          const dasNfts = await fetchNFTsViaDAS(address, rpcEndpoint);
          if (controller.signal.aborted) return;

          setNfts(dasNfts);
          setLoading(false);
          console.log(`DAS returned ${dasNfts.length} NFTs`);
          return;
        } catch (dasErr) {
          if (controller.signal.aborted) return;

          if (isDASUnsupported(dasErr)) {
            console.log("DAS not supported, falling back to getProgramAccounts...");
          } else {
            console.warn("DAS error, falling back to getProgramAccounts:", dasErr);
          }
        }

        // Fallback: getProgramAccounts (two-phase loading)
        const rawNfts = await fetchMetadataAccounts(address, rpcEndpoint);
        if (controller.signal.aborted) return;

        // Phase 1 done — show on-chain data immediately
        setNfts(rawNfts);
        setLoading(false);
        console.log(
          `Showing ${rawNfts.length} NFTs (on-chain), fetching off-chain data...`
        );

        if (rawNfts.length === 0) return;

        // Phase 2 — enrich with off-chain data in batches
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
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load NFTs";
          setError(msg);
          setLoading(false);
          setLoadingOffChain(false);
          console.error("Error loading NFTs:", err);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [address, rpcEndpoint, refreshCounter]);

  return { nfts, loading, loadingOffChain, offChainProgress, error, refresh };
}
