"use client";

import { useState, useMemo, useEffect } from "react";
import { NFTCard } from "./NFTCard";
import type { NFTData } from "@/lib/metaplex";

type SortOption = "newest" | "oldest" | "broken" | "title" | "collection";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest First",
  oldest: "Oldest First",
  broken: "Broken First",
  title: "Title (A-Z)",
  collection: "Collection (A-Z)",
};

const SORT_KEY = "nft-sort-pref";

function getSavedSort(): SortOption {
  if (typeof window === "undefined") return "newest";
  const saved = localStorage.getItem(SORT_KEY);
  if (saved && saved in SORT_LABELS) return saved as SortOption;
  return "newest";
}

interface NFTGalleryProps {
  nfts: NFTData[];
  loading: boolean;
  error: string | null;
  selectedMint: string | null;
  onSelect: (mint: string | null) => void;
}

export function NFTGallery({
  nfts,
  loading,
  error,
  selectedMint,
  onSelect,
}: NFTGalleryProps) {
  const [sort, setSort] = useState<SortOption>("newest");
  const [search, setSearch] = useState("");
  const [showImages, setShowImages] = useState(true);

  useEffect(() => {
    setSort(getSavedSort());
  }, []);

  const handleSortChange = (value: string) => {
    const newSort = value as SortOption;
    setSort(newSort);
    localStorage.setItem(SORT_KEY, newSort);
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...nfts];

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((nft) =>
        nft.name.toLowerCase().includes(lower)
      );
    }

    switch (sort) {
      case "newest":
        result.reverse();
        break;
      case "oldest":
        break;
      case "broken":
        result.sort((a, b) => {
          const aBroken = a.uriBroken ? 1 : 0;
          const bBroken = b.uriBroken ? 1 : 0;
          return bBroken - aBroken;
        });
        break;
      case "title":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "collection":
        result.sort((a, b) => {
          const aCol = a.collection || "\uffff";
          const bCol = b.collection || "\uffff";
          return aCol.localeCompare(bCol);
        });
        break;
    }

    return result;
  }, [nfts, search, sort]);

  if (loading) {
    return <p className="text-sm text-foreground/50">loading nfts...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500/70">{error}</p>;
  }

  if (nfts.length === 0) {
    return (
      <p className="text-sm text-foreground/50">
        no nfts found where you have update authority
      </p>
    );
  }

  const brokenCount = nfts.filter((n) => n.uriBroken).length;

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search by name..."
          className="border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40 w-48"
        />

        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none cursor-pointer"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-foreground/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showImages}
            onChange={(e) => setShowImages(e.target.checked)}
            className="cursor-pointer"
          />
          images
        </label>
      </div>

      {/* result count */}
      <p className="text-xs text-foreground/40 mb-4">
        {search && filteredAndSorted.length !== nfts.length
          ? `showing ${filteredAndSorted.length} of ${nfts.length} nfts`
          : `${nfts.length} nfts found`}
        {brokenCount > 0 && ` (${brokenCount} broken)`}
        {selectedMint && ", 1 selected"}
      </p>

      {/* no search results */}
      {filteredAndSorted.length === 0 && search && (
        <p className="text-sm text-foreground/50">
          no nfts match &ldquo;{search}&rdquo;
        </p>
      )}

      {/* grid */}
      {filteredAndSorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredAndSorted.map((nft) => (
            <NFTCard
              key={nft.mint}
              nft={nft}
              selected={selectedMint === nft.mint}
              showImage={showImages}
              onSelect={() =>
                onSelect(selectedMint === nft.mint ? null : nft.mint)
              }
            />
          ))}
        </div>
      )}

      {/* edit button */}
      {selectedMint && (
        <div className="mt-8">
          <button className="border border-foreground/20 px-4 py-2 text-sm hover:opacity-70">
            edit metadata
          </button>
        </div>
      )}
    </div>
  );
}
