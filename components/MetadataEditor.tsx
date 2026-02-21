"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CopyText } from "./CopyText";
import { useNetworkContext } from "./NetworkProvider";
import { useSendTransaction } from "@solana/react-hooks";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import type { NFTData } from "@/lib/metaplex";
import { fetchFullOffChainJson } from "@/lib/metaplex";
import {
  validateName,
  validateSymbol,
  validateUrl,
  validateSellerFee,
  validateCreatorAddress,
  validateCreatorShares,
  validateMetadataJson,
} from "@/lib/validation";
import {
  DEFAULT_COMPUTE_UNITS,
  PRIORITY_FEE_BY_NETWORK,
  CONFIRMATION_TIMEOUT_MS,
  CONFIRMATION_POLL_MS,
} from "@/lib/constants";
import { fetchOnChainMetadata } from "@/lib/metadata-account";
import type { OnChainMetadata } from "@/lib/metadata-account";
import {
  buildUpdateMetadataV2Instruction,
  mergeCreators,
  classifyTransactionError,
  estimateTransactionFee,
  pollConfirmation,
  getExplorerUrl,
  addTransactionToHistory,
  getTransactionHistory,
  type TransactionState,
  type TransactionError,
  type TransactionHistoryEntry,
} from "@/lib/transaction";
import { deriveMetadataPDA } from "@/lib/metadata-account";

interface MetadataEditorProps {
  nft: NFTData;
  onClose: () => void;
  onRefresh?: () => void;
}

interface Creator {
  address: string;
  share: number;
  verified: boolean;
}

interface Attribute {
  trait_type: string;
  value: string;
}

interface FieldErrors {
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  externalUrl?: string | null;
  sellerFeeBasisPoints?: string | null;
  creators?: string | null;
  creatorAddresses?: Record<number, string | null>;
}

export function MetadataEditor({ nft, onClose, onRefresh }: MetadataEditorProps) {
  const { network, rpcEndpoint } = useNetworkContext();
  const { address: walletAddress, connected } = useWalletStatus();
  const { send, isSending, reset: resetSend } = useSendTransaction();

  // loading state
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // original JSON for diff
  const [originalJson, setOriginalJson] = useState<Record<
    string,
    unknown
  > | null>(null);

  // form fields
  const [name, setName] = useState(nft.name);
  const [symbol, setSymbol] = useState(nft.symbol);
  const [description, setDescription] = useState(nft.description || "");
  const [imageUrl, setImageUrl] = useState(nft.image || "");
  const [externalUrl, setExternalUrl] = useState("");
  const [sellerFeeBasisPoints, setSellerFeeBasisPoints] = useState(0);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  // ui state
  const [showImageHelp, setShowImageHelp] = useState(false);
  const [generatedJson, setGeneratedJson] = useState<string | null>(null);
  const [jsonManualText, setJsonManualText] = useState("");
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [newUri, setNewUri] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [jsonCopied, setJsonCopied] = useState(false);

  // transaction state
  const [txState, setTxState] = useState<TransactionState>("idle");
  const [txError, setTxError] = useState<TransactionError | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [onChainMeta, setOnChainMeta] = useState<OnChainMetadata | null>(null);
  const [txHistory, setTxHistory] = useState<TransactionHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [jsonApplied, setJsonApplied] = useState(false);

  // advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const customRpcInUse = !!(
    network !== "mainnet-beta" && network !== "devnet"
  );
  const defaultPriorityFee = customRpcInUse
    ? PRIORITY_FEE_BY_NETWORK.custom
    : PRIORITY_FEE_BY_NETWORK[network];
  const [priorityFee, setPriorityFee] = useState(defaultPriorityFee);
  const [skipPreflight, setSkipPreflight] = useState(false);
  const [commitment, setCommitment] = useState<"confirmed" | "finalized">(
    "confirmed"
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load transaction history on mount
  useEffect(() => {
    setTxHistory(getTransactionHistory());
  }, []);

  // fetch full off-chain JSON on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);

      const json = await fetchFullOffChainJson(nft.uri);

      if (cancelled) return;

      if (json) {
        setOriginalJson(json);
        setName((json.name as string) || nft.name);
        setSymbol((json.symbol as string) || nft.symbol);
        setDescription((json.description as string) || "");
        setImageUrl((json.image as string) || "");
        setExternalUrl((json.external_url as string) || "");
        setSellerFeeBasisPoints(
          typeof json.seller_fee_basis_points === "number"
            ? json.seller_fee_basis_points
            : 0
        );

        if (Array.isArray(json.creators)) {
          setCreators(
            (json.creators as Array<Record<string, unknown>>).map((c) => ({
              address: String(c.address || ""),
              share: Number(c.share) || 0,
              verified: Boolean(c.verified),
            }))
          );
        }

        if (Array.isArray(json.attributes)) {
          setAttributes(
            (json.attributes as Array<Record<string, unknown>>).map((a) => ({
              trait_type: String(a.trait_type || ""),
              value: String(a.value || ""),
            }))
          );
        }
      } else {
        setFetchError(
          "could not fetch off-chain metadata. you can still create metadata from scratch."
        );
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nft.uri, nft.name, nft.symbol]);

  // validation
  const runValidation = useCallback((): boolean => {
    const e: FieldErrors = {};
    e.name = validateName(name);
    e.symbol = validateSymbol(symbol);
    e.imageUrl = validateUrl(imageUrl, true);
    e.externalUrl = validateUrl(externalUrl, false);
    e.sellerFeeBasisPoints = validateSellerFee(sellerFeeBasisPoints);
    e.creators = validateCreatorShares(creators);

    const addrErrors: Record<number, string | null> = {};
    creators.forEach((c, i) => {
      addrErrors[i] = validateCreatorAddress(c.address);
    });
    e.creatorAddresses = addrErrors;

    setErrors(e);

    const hasFieldError = [
      e.name,
      e.symbol,
      e.imageUrl,
      e.externalUrl,
      e.sellerFeeBasisPoints,
      e.creators,
    ].some((v) => v != null);
    const hasAddrError = Object.values(addrErrors).some((v) => v != null);

    return !hasFieldError && !hasAddrError;
  }, [name, symbol, imageUrl, externalUrl, sellerFeeBasisPoints, creators]);

  // pre-transaction validation
  const runPreTransactionValidation = useCallback((): string[] => {
    const issues: string[] = [];

    if (!connected || !walletAddress) {
      issues.push("Wallet is not connected");
    }

    const uriError = validateUrl(newUri, true);
    if (uriError) issues.push(`New URI: ${uriError}`);

    const nameErr = validateName(name);
    if (nameErr) issues.push(`Name: ${nameErr}`);

    const symErr = validateSymbol(symbol);
    if (symErr) issues.push(`Symbol: ${symErr}`);

    const feeErr = validateSellerFee(sellerFeeBasisPoints);
    if (feeErr) issues.push(`Seller fee: ${feeErr}`);

    if (creators.length > 0) {
      const shareErr = validateCreatorShares(creators);
      if (shareErr) issues.push(`Creators: ${shareErr}`);

      creators.forEach((c, i) => {
        const addrErr = validateCreatorAddress(c.address);
        if (addrErr) issues.push(`Creator ${i + 1}: ${addrErr}`);
      });
    }

    return issues;
  }, [connected, walletAddress, newUri, name, symbol, sellerFeeBasisPoints, creators]);

  // changes diff
  const getChanges = useCallback((): Array<{
    field: string;
    from: string;
    to: string;
  }> => {
    if (!originalJson) return [];

    const changes: Array<{ field: string; from: string; to: string }> = [];

    if (name !== (originalJson.name || ""))
      changes.push({
        field: "name",
        from: String(originalJson.name || ""),
        to: name,
      });
    if (symbol !== (originalJson.symbol || ""))
      changes.push({
        field: "symbol",
        from: String(originalJson.symbol || ""),
        to: symbol,
      });
    if (description !== (originalJson.description || ""))
      changes.push({
        field: "description",
        from: String(originalJson.description || ""),
        to: description,
      });
    if (imageUrl !== (originalJson.image || ""))
      changes.push({
        field: "image",
        from: String(originalJson.image || ""),
        to: imageUrl,
      });
    if (externalUrl !== (originalJson.external_url || ""))
      changes.push({
        field: "external_url",
        from: String(originalJson.external_url || ""),
        to: externalUrl,
      });

    const origFee =
      typeof originalJson.seller_fee_basis_points === "number"
        ? originalJson.seller_fee_basis_points
        : 0;
    if (sellerFeeBasisPoints !== origFee)
      changes.push({
        field: "seller_fee_basis_points",
        from: String(origFee),
        to: String(sellerFeeBasisPoints),
      });

    return changes;
  }, [
    originalJson,
    name,
    symbol,
    description,
    imageUrl,
    externalUrl,
    sellerFeeBasisPoints,
  ]);

  // build JSON object from form
  const buildJsonObject = useCallback((): Record<string, unknown> => {
    const obj: Record<string, unknown> = {
      name,
      symbol,
      description,
      image: imageUrl,
      seller_fee_basis_points: sellerFeeBasisPoints,
    };

    if (externalUrl) {
      obj.external_url = externalUrl;
    }

    if (creators.length > 0) {
      obj.creators = creators.map((c) => ({
        address: c.address,
        share: c.share,
        verified: c.verified,
      }));
    }

    if (attributes.length > 0) {
      obj.attributes = attributes.map((a) => ({
        trait_type: a.trait_type,
        value: a.value,
      }));
    }

    // preserve extra fields from original JSON
    if (originalJson) {
      const knownKeys = new Set([
        "name",
        "symbol",
        "description",
        "image",
        "seller_fee_basis_points",
        "external_url",
        "creators",
        "attributes",
      ]);
      for (const [key, value] of Object.entries(originalJson)) {
        if (!knownKeys.has(key)) {
          obj[key] = value;
        }
      }
    }

    return obj;
  }, [
    name,
    symbol,
    description,
    imageUrl,
    externalUrl,
    sellerFeeBasisPoints,
    creators,
    attributes,
    originalJson,
  ]);

  const handleGenerate = () => {
    if (!runValidation()) return;
    const obj = buildJsonObject();
    const text = JSON.stringify(obj, null, 2);
    setGeneratedJson(text);
    setJsonManualText(text);
    setJsonErrors([]);
    setJsonApplied(false);
  };

  const handleJsonManualChange = (text: string) => {
    setJsonManualText(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = validateMetadataJson(text);
      setJsonErrors(result.errors);
      if (result.valid) {
        setGeneratedJson(text);
      }
    }, 500);
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonManualText || generatedJson || "");
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch {
      console.warn("Failed to copy JSON");
    }
  };

  const handleDownloadJson = () => {
    const text = jsonManualText || generatedJson || "";
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nft.mint.slice(0, 8)}-metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    if (!originalJson) return;
    if (!confirm("reset all fields to original values?")) return;

    setName((originalJson.name as string) || nft.name);
    setSymbol((originalJson.symbol as string) || nft.symbol);
    setDescription((originalJson.description as string) || "");
    setImageUrl((originalJson.image as string) || "");
    setExternalUrl((originalJson.external_url as string) || "");
    setSellerFeeBasisPoints(
      typeof originalJson.seller_fee_basis_points === "number"
        ? originalJson.seller_fee_basis_points
        : 0
    );

    if (Array.isArray(originalJson.creators)) {
      setCreators(
        (originalJson.creators as Array<Record<string, unknown>>).map((c) => ({
          address: String(c.address || ""),
          share: Number(c.share) || 0,
          verified: Boolean(c.verified),
        }))
      );
    } else {
      setCreators([]);
    }

    if (Array.isArray(originalJson.attributes)) {
      setAttributes(
        (originalJson.attributes as Array<Record<string, unknown>>).map(
          (a) => ({
            trait_type: String(a.trait_type || ""),
            value: String(a.value || ""),
          })
        )
      );
    } else {
      setAttributes([]);
    }

    setGeneratedJson(null);
    setJsonManualText("");
    setJsonErrors([]);
    setNewUri("");
    setErrors({});
    setTxState("idle");
    setTxError(null);
    setTxSignature(null);
    setJsonApplied(false);
    resetSend();
  };

  const handleClose = () => {
    const isDirty = generatedJson || getChanges().length > 0;
    if (isDirty && txState !== "success" && !confirm("discard unsaved changes?")) return;
    onClose();
  };

  // creator helpers
  const addCreator = () => {
    setCreators([...creators, { address: "", share: 0, verified: false }]);
  };

  const removeCreator = (index: number) => {
    setCreators(creators.filter((_, i) => i !== index));
  };

  const updateCreator = (
    index: number,
    field: keyof Creator,
    value: string | number | boolean
  ) => {
    setCreators(
      creators.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  // attribute helpers
  const addAttribute = () => {
    setAttributes([...attributes, { trait_type: "", value: "" }]);
  };

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (
    index: number,
    field: keyof Attribute,
    value: string
  ) => {
    setAttributes(
      attributes.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };

  // fee estimate (reactive)
  const feeEstimate = estimateTransactionFee(DEFAULT_COMPUTE_UNITS, priorityFee);

  // check for new creators (compared to on-chain)
  const hasNewCreators = creators.some((fc) => {
    if (!onChainMeta?.creators) return creators.length > 0;
    return !onChainMeta.creators.find((oc) => oc.address === fc.address);
  });

  // check for seller fee change
  const sellerFeeChanged =
    onChainMeta != null &&
    sellerFeeBasisPoints !== onChainMeta.sellerFeeBasisPoints;

  // -----------------------------------------------------------------
  // Transaction handler
  // -----------------------------------------------------------------

  const handleUpdateOnChain = async () => {
    // Pre-transaction validation
    const issues = runPreTransactionValidation();
    if (issues.length > 0) {
      setTxError({
        kind: "unknown",
        message: "Validation failed",
        details: issues.join("; "),
      });
      setTxState("error");
      return;
    }

    try {
      // Phase 1: Fetch on-chain metadata
      setTxState("preparing");
      setTxError(null);
      setTxSignature(null);

      console.log("[MetadataEditor] Fetching on-chain metadata...");
      const onChain = await fetchOnChainMetadata(nft.mint, rpcEndpoint);
      setOnChainMeta(onChain);

      // Validate immutability
      if (!onChain.isMutable) {
        setTxError({
          kind: "immutable",
          message: "This NFT is immutable — updates will fail",
        });
        setTxState("error");
        return;
      }

      // Validate update authority
      if (onChain.updateAuthority !== walletAddress) {
        setTxError({
          kind: "invalid-authority",
          message: `You are not the update authority for this NFT. Authority is ${onChain.updateAuthority.slice(0, 8)}...`,
        });
        setTxState("error");
        return;
      }

      // Phase 2: Build instruction
      console.log("[MetadataEditor] Building instruction...");
      const metadataPda = await deriveMetadataPDA(nft.mint);

      // Merge creators: preserve on-chain verified status
      const mergedCreators =
        creators.length > 0
          ? mergeCreators(creators, onChain.creators)
          : onChain.creators;

      const instruction = buildUpdateMetadataV2Instruction(
        metadataPda,
        walletAddress!,
        {
          name,
          symbol,
          uri: newUri,
          sellerFeeBasisPoints,
          creators: mergedCreators,
          collection: onChain.collection,
          uses: onChain.uses,
        }
      );

      // Phase 3: Sign and send
      setTxState("signing");
      console.log("[MetadataEditor] Requesting wallet signature...");

      const signature = await send(
        {
          instructions: [instruction],
          computeUnitLimit: DEFAULT_COMPUTE_UNITS,
          computeUnitPrice: BigInt(priorityFee),
        },
        {
          skipPreflight,
          commitment,
        }
      );

      const sigString = String(signature);
      console.log("[MetadataEditor] Transaction sent:", sigString);

      // Phase 4: Confirm
      setTxState("confirming");
      setTxSignature(sigString);

      const confirmResult = await pollConfirmation(
        sigString,
        rpcEndpoint,
        commitment,
        CONFIRMATION_TIMEOUT_MS,
        CONFIRMATION_POLL_MS
      );

      if (confirmResult.confirmed) {
        setTxState("success");
        console.log("[MetadataEditor] Transaction confirmed!");

        // Save to history
        const entry: TransactionHistoryEntry = {
          nftName: name,
          mint: nft.mint,
          signature: sigString,
          timestamp: new Date().toISOString(),
          network: customRpcInUse ? "custom" : network,
        };
        addTransactionToHistory(entry);
        setTxHistory(getTransactionHistory());

        // Mark JSON as applied
        setJsonApplied(true);

        // Clear the new URI
        setNewUri("");

        // Trigger gallery refresh
        if (onRefresh) {
          setTimeout(() => onRefresh(), 2000);
        }
      } else if (confirmResult.err === "timeout") {
        setTxState("success"); // optimistic — tx was sent
        setTxError({
          kind: "timeout",
          message:
            "Transaction sent but confirmation timed out. It may still succeed — check explorer.",
        });
      } else {
        setTxState("error");
        setTxError({
          kind: "unknown",
          message: "Transaction failed on-chain",
          details: confirmResult.err || undefined,
        });
      }
    } catch (err) {
      console.error("[MetadataEditor] Transaction error:", err);
      const classified = classifyTransactionError(err);
      setTxError(classified);
      setTxState("error");
      resetSend();
    }
  };

  const handleRetry = () => {
    setTxState("idle");
    setTxError(null);
    setTxSignature(null);
    resetSend();
  };

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  if (loading) {
    return (
      <div className="border border-foreground/20 p-6">
        <p className="text-sm text-foreground/50">
          loading off-chain metadata...
        </p>
      </div>
    );
  }

  const changes = getChanges();
  const preIssues = generatedJson && newUri ? runPreTransactionValidation() : [];
  const explorerUrl = txSignature ? getExplorerUrl(txSignature, network) : null;

  // Button label based on transaction state
  const txButtonLabel = {
    idle: "update nft metadata",
    preparing: "preparing...",
    signing: "sign in wallet...",
    confirming: "confirming...",
    success: "update nft metadata",
    error: "update nft metadata",
  }[txState];

  const txButtonDisabled =
    !newUri ||
    preIssues.length > 0 ||
    txState === "preparing" ||
    txState === "signing" ||
    txState === "confirming" ||
    isSending;

  return (
    <div className="border border-foreground/20 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-medium">edit metadata</h2>
        <button
          onClick={handleClose}
          className="text-sm text-foreground/50 hover:opacity-70"
        >
          close
        </button>
      </div>

      {fetchError && (
        <p className="text-xs text-yellow-600 mb-4">{fetchError}</p>
      )}

      {/* section 1: current state */}
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">current state</h3>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground/40 w-16 shrink-0">uri</span>
            <CopyText
              text={nft.uri || "(no uri)"}
              className="font-mono text-foreground/60 truncate"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground/40 w-16 shrink-0">mint</span>
            <CopyText
              text={nft.mint}
              className="font-mono text-foreground/60 truncate"
            />
          </div>
        </div>
        {nft.image && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nft.image}
              alt={nft.name}
              className="w-20 h-20 object-cover border border-foreground/10"
            />
          </div>
        )}
        <p className="text-xs text-foreground/40 mt-2">
          to change the image, upload to arweave/ipfs and paste the new url
          below.
        </p>
      </div>

      {/* section 2: basic metadata */}
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">basic metadata</h3>
        <div className="flex flex-col gap-3">
          {/* name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-foreground/60">name</label>
              <span className="text-xs text-foreground/30">
                {name.length}/32
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, name: validateName(name) }))
              }
              maxLength={32}
              className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40"
            />
            {errors.name && (
              <p className="text-xs text-red-500/70 mt-1">{errors.name}</p>
            )}
          </div>

          {/* symbol */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-foreground/60">symbol</label>
              <span className="text-xs text-foreground/30">
                {symbol.length}/10
              </span>
            </div>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onBlur={() =>
                setErrors((prev) => ({
                  ...prev,
                  symbol: validateSymbol(symbol),
                }))
              }
              maxLength={10}
              className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40"
            />
            {errors.symbol && (
              <p className="text-xs text-red-500/70 mt-1">{errors.symbol}</p>
            )}
          </div>

          {/* description */}
          <div>
            <label className="text-xs text-foreground/60 mb-1 block">
              description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40 resize-y"
            />
          </div>

          {/* image url */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-foreground/60">image url</label>
              <button
                onClick={() => setShowImageHelp(!showImageHelp)}
                className="text-xs text-foreground/40 hover:opacity-70"
              >
                {showImageHelp ? "hide help" : "upload help"}
              </button>
            </div>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onBlur={() =>
                setErrors((prev) => ({
                  ...prev,
                  imageUrl: validateUrl(imageUrl, true),
                }))
              }
              placeholder="https://... or ipfs://... or ar://..."
              className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40"
            />
            {errors.imageUrl && (
              <p className="text-xs text-red-500/70 mt-1">{errors.imageUrl}</p>
            )}
            {showImageHelp && (
              <div className="mt-2 p-3 border border-foreground/10 text-xs text-foreground/50">
                <p className="mb-1">
                  upload your image to a permanent storage provider:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>arweave — use arweave.net or bundlr</li>
                  <li>ipfs — use nft.storage, pinata, or infura</li>
                  <li>
                    then paste the url here (ipfs:// and ar:// prefixes
                    supported)
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* external url */}
          <div>
            <label className="text-xs text-foreground/60 mb-1 block">
              external url (optional)
            </label>
            <input
              type="text"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              onBlur={() =>
                setErrors((prev) => ({
                  ...prev,
                  externalUrl: validateUrl(externalUrl, false),
                }))
              }
              placeholder="https://..."
              className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40"
            />
            {errors.externalUrl && (
              <p className="text-xs text-red-500/70 mt-1">
                {errors.externalUrl}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* section 3: royalties & creators */}
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">royalties & creators</h3>

        {/* seller fee */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs text-foreground/60">
              seller fee basis points
            </label>
            <span className="text-xs text-foreground/30">
              ({(sellerFeeBasisPoints / 100).toFixed(2)}%)
            </span>
          </div>
          <input
            type="number"
            value={sellerFeeBasisPoints}
            onChange={(e) =>
              setSellerFeeBasisPoints(parseInt(e.target.value) || 0)
            }
            onBlur={() =>
              setErrors((prev) => ({
                ...prev,
                sellerFeeBasisPoints: validateSellerFee(sellerFeeBasisPoints),
              }))
            }
            min={0}
            max={10000}
            className="w-32 border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40"
          />
          {errors.sellerFeeBasisPoints && (
            <p className="text-xs text-red-500/70 mt-1">
              {errors.sellerFeeBasisPoints}
            </p>
          )}
          {sellerFeeChanged && (
            <p className="text-xs text-foreground/40 mt-1">
              royalty changes apply to future sales
            </p>
          )}
        </div>

        {/* creators */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-foreground/60">creators</label>
            <button
              onClick={addCreator}
              className="text-xs text-foreground/50 hover:opacity-70"
            >
              + add creator
            </button>
          </div>

          {creators.length === 0 && (
            <p className="text-xs text-foreground/30">no creators defined</p>
          )}

          {creators.map((creator, i) => (
            <div key={i} className="flex gap-2 mb-2 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={creator.address}
                  onChange={(e) => updateCreator(i, "address", e.target.value)}
                  onBlur={() =>
                    setErrors((prev) => ({
                      ...prev,
                      creatorAddresses: {
                        ...prev.creatorAddresses,
                        [i]: validateCreatorAddress(creator.address),
                      },
                    }))
                  }
                  placeholder="wallet address"
                  className="w-full border border-foreground/20 px-3 py-1.5 text-xs font-mono bg-transparent outline-none focus:border-foreground/40"
                />
                {errors.creatorAddresses?.[i] && (
                  <p className="text-xs text-red-500/70 mt-0.5">
                    {errors.creatorAddresses[i]}
                  </p>
                )}
              </div>
              <input
                type="number"
                value={creator.share}
                onChange={(e) =>
                  updateCreator(i, "share", parseInt(e.target.value) || 0)
                }
                min={0}
                max={100}
                placeholder="%"
                className="w-16 border border-foreground/20 px-2 py-1.5 text-xs bg-transparent outline-none focus:border-foreground/40"
              />
              {creator.verified && (
                <span className="text-xs text-green-600 py-1.5" title="verified">
                  ✓
                </span>
              )}
              <button
                onClick={() => removeCreator(i)}
                className="text-xs text-foreground/40 hover:opacity-70 py-1.5"
              >
                remove
              </button>
            </div>
          ))}

          {creators.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-foreground/40">
                total: {creators.reduce((s, c) => s + c.share, 0)}%
              </span>
              {errors.creators && (
                <span className="text-xs text-red-500/70">
                  {errors.creators}
                </span>
              )}
            </div>
          )}

          {hasNewCreators && (
            <p className="text-xs text-foreground/40 mt-2">
              new creators must sign separately to become verified.
              existing creators keep their verified status.
            </p>
          )}
        </div>
      </div>

      {/* section 4: attributes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">attributes</h3>
          <button
            onClick={addAttribute}
            className="text-xs text-foreground/50 hover:opacity-70"
          >
            + add attribute
          </button>
        </div>

        {attributes.length === 0 && (
          <p className="text-xs text-foreground/30">no attributes defined</p>
        )}

        {attributes.map((attr, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="text"
              value={attr.trait_type}
              onChange={(e) => updateAttribute(i, "trait_type", e.target.value)}
              placeholder="trait type"
              className="flex-1 border border-foreground/20 px-3 py-1.5 text-xs bg-transparent outline-none focus:border-foreground/40"
            />
            <input
              type="text"
              value={attr.value}
              onChange={(e) => updateAttribute(i, "value", e.target.value)}
              placeholder="value"
              className="flex-1 border border-foreground/20 px-3 py-1.5 text-xs bg-transparent outline-none focus:border-foreground/40"
            />
            <button
              onClick={() => removeAttribute(i)}
              className="text-xs text-foreground/40 hover:opacity-70 py-1.5"
            >
              remove
            </button>
          </div>
        ))}
      </div>

      {/* section 5: changes preview */}
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">changes preview</h3>
        {changes.length === 0 ? (
          <p className="text-xs text-foreground/30">no changes</p>
        ) : (
          <div className="flex flex-col gap-1">
            {changes.map((change) => (
              <p key={change.field} className="text-xs font-mono">
                <span className="text-foreground/50">{change.field}:</span>{" "}
                <span className="text-red-500/70">
                  &lsquo;{change.from}&rsquo;
                </span>{" "}
                <span className="text-foreground/40">&rarr;</span>{" "}
                <span className="text-green-600">
                  &lsquo;{change.to}&rsquo;
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* section 6: generate JSON */}
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">generate json</h3>
        <button
          onClick={handleGenerate}
          className="border border-foreground/20 px-4 py-1.5 text-sm hover:opacity-70 mb-3"
        >
          generate json
        </button>

        {generatedJson && (
          <div>
            {jsonApplied && (
              <p className="text-xs text-green-600 mb-2">
                ✓ applied successfully
              </p>
            )}
            <textarea
              value={jsonManualText}
              onChange={(e) => handleJsonManualChange(e.target.value)}
              rows={16}
              className="w-full font-mono text-sm bg-foreground/5 p-4 border border-foreground/10 outline-none resize-y"
            />
            {jsonErrors.length > 0 && (
              <div className="mt-1">
                {jsonErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500/70">
                    {err}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCopyJson}
                className="border border-foreground/20 px-3 py-1 text-xs hover:opacity-70"
              >
                {jsonCopied ? "copied!" : "copy json"}
              </button>
              <button
                onClick={handleDownloadJson}
                className="border border-foreground/20 px-3 py-1 text-xs hover:opacity-70"
              >
                download json
              </button>
            </div>
          </div>
        )}
      </div>

      {/* section 7: new URI + transaction */}
      {generatedJson && (
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">update on-chain uri</h3>
          <p className="text-xs text-foreground/40 mb-2">
            upload the json above to arweave or ipfs, then paste the new uri
            here.
          </p>
          <input
            type="text"
            value={newUri}
            onChange={(e) => {
              setNewUri(e.target.value);
              // Reset transaction state when URI changes
              if (txState === "error" || txState === "success") {
                setTxState("idle");
                setTxError(null);
              }
            }}
            placeholder="new metadata uri (https://, ipfs://, ar://)"
            className="w-full border border-foreground/20 px-3 py-1.5 text-sm bg-transparent outline-none focus:border-foreground/40 mb-3"
          />

          {/* transaction preview */}
          {newUri && (
            <div className="border border-foreground/10 p-3 mb-3">
              <p className="text-xs font-medium mb-1">transaction preview</p>
              <p className="text-xs font-mono text-foreground/50">
                mint: {nft.mint}
              </p>
              <p className="text-xs font-mono text-foreground/50">
                name: {name}
              </p>
              <p className="text-xs font-mono text-foreground/50">
                symbol: {symbol}
              </p>
              <p className="text-xs font-mono text-foreground/50">
                uri: {nft.uri || "(empty)"} &rarr; {newUri}
              </p>
              <p className="text-xs font-mono text-foreground/50">
                seller fee: {sellerFeeBasisPoints} ({(sellerFeeBasisPoints / 100).toFixed(2)}%)
              </p>
              {creators.length > 0 && (
                <p className="text-xs font-mono text-foreground/50">
                  creators: {creators.length} ({creators.map(c => `${c.address.slice(0, 4)}...${c.share}%`).join(", ")})
                </p>
              )}
              <div className="mt-2 pt-2 border-t border-foreground/5">
                <p className="text-xs text-foreground/40">
                  estimated cost: ~{feeEstimate.totalSol} SOL
                </p>
                <p className="text-xs text-foreground/30">
                  base fee: {feeEstimate.baseFee} lamports + priority fee: {feeEstimate.priorityFee} lamports
                </p>
              </div>
            </div>
          )}

          {/* immutability warning */}
          {onChainMeta && !onChainMeta.isMutable && (
            <div className="border border-red-500/30 bg-red-500/5 p-3 mb-3">
              <p className="text-xs text-red-500">
                this NFT is immutable — metadata updates will fail
              </p>
            </div>
          )}

          {/* pre-transaction validation errors */}
          {preIssues.length > 0 && (
            <div className="mb-3">
              {preIssues.map((issue, i) => (
                <p key={i} className="text-xs text-red-500/70">
                  {issue}
                </p>
              ))}
            </div>
          )}

          {/* advanced options */}
          <div className="mb-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-foreground/40 hover:opacity-70"
            >
              {showAdvanced ? "hide" : "show"} advanced transaction options
            </button>

            {showAdvanced && (
              <div className="mt-2 p-3 border border-foreground/10 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-foreground/50 w-40">
                    priority fee (micro-lamports)
                  </label>
                  <input
                    type="number"
                    value={priorityFee}
                    onChange={(e) =>
                      setPriorityFee(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    min={0}
                    className="w-28 border border-foreground/20 px-2 py-1 text-xs bg-transparent outline-none focus:border-foreground/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-foreground/50 w-40">
                    skip preflight checks
                  </label>
                  <input
                    type="checkbox"
                    checked={skipPreflight}
                    onChange={(e) => setSkipPreflight(e.target.checked)}
                    className="accent-foreground/60"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-foreground/50 w-40">
                    commitment level
                  </label>
                  <select
                    value={commitment}
                    onChange={(e) =>
                      setCommitment(e.target.value as "confirmed" | "finalized")
                    }
                    className="border border-foreground/20 px-2 py-1 text-xs bg-transparent outline-none"
                  >
                    <option value="confirmed">confirmed</option>
                    <option value="finalized">finalized</option>
                  </select>
                </div>
                <p className="text-xs text-foreground/30">
                  compute unit limit: {DEFAULT_COMPUTE_UNITS.toLocaleString()} (fixed)
                </p>
              </div>
            )}
          </div>

          {/* transaction button */}
          <button
            onClick={handleUpdateOnChain}
            disabled={txButtonDisabled}
            className="border border-foreground/20 px-4 py-1.5 text-sm hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {(txState === "preparing" || txState === "signing" || txState === "confirming") && (
              <span className="inline-block w-3 h-3 border border-foreground/40 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
            )}
            {txButtonLabel}
          </button>

          {/* transaction state messages */}
          {txState === "preparing" && (
            <p className="text-xs text-foreground/50 mt-2">
              fetching on-chain metadata and building transaction...
            </p>
          )}
          {txState === "signing" && (
            <p className="text-xs text-foreground/50 mt-2">
              waiting for wallet approval...
            </p>
          )}
          {txState === "confirming" && (
            <p className="text-xs text-foreground/50 mt-2">
              transaction submitted, waiting for confirmation...
            </p>
          )}

          {/* success state */}
          {txState === "success" && txSignature && (
            <div className="mt-3 border border-green-600/30 bg-green-600/5 p-3">
              <p className="text-xs text-green-600 font-medium mb-2">
                NFT metadata updated successfully!
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground/40">signature:</span>
                <CopyText
                  text={txSignature}
                  className="font-mono text-foreground/60 truncate"
                />
              </div>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground/50 underline hover:opacity-70 mt-1 block"
                >
                  view on explorer
                </a>
              )}
              {txError?.kind === "timeout" && (
                <p className="text-xs text-yellow-600 mt-2">
                  {txError.message}
                </p>
              )}
            </div>
          )}

          {/* error state */}
          {txState === "error" && txError && (
            <div className="mt-3 border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-xs text-red-500 font-medium">
                {txError.message}
              </p>
              {txError.details && (
                <p className="text-xs text-red-500/60 mt-1 font-mono break-all">
                  {txError.details}
                </p>
              )}
              {txError.kind === "rejected" && (
                <button
                  onClick={handleRetry}
                  className="text-xs text-foreground/50 underline hover:opacity-70 mt-2"
                >
                  try again
                </button>
              )}
              {txError.kind !== "immutable" && txError.kind !== "invalid-authority" && txError.kind !== "rejected" && (
                <button
                  onClick={handleRetry}
                  className="text-xs text-foreground/50 underline hover:opacity-70 mt-2"
                >
                  retry
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* section 8: recent updates */}
      {txHistory.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-foreground/40 hover:opacity-70"
          >
            {showHistory ? "hide" : "show"} recent updates ({txHistory.length})
          </button>
          {showHistory && (
            <div className="mt-2 border border-foreground/10 p-3">
              {txHistory.map((entry, i) => {
                const entryUrl = getExplorerUrl(entry.signature, entry.network === "custom" ? "custom" : entry.network);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs py-1 border-b border-foreground/5 last:border-0"
                  >
                    <span className="text-foreground/40 w-36 shrink-0">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <span className="text-foreground/60 truncate flex-1">
                      {entry.nftName}
                    </span>
                    <CopyText
                      text={entry.signature}
                      className="font-mono text-foreground/40 w-20 truncate"
                    />
                    {entryUrl && (
                      <a
                        href={entryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground/40 underline hover:opacity-70 shrink-0"
                      >
                        explorer
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* section 9: reset / cancel */}
      <div className="flex gap-2 pt-4 border-t border-foreground/10">
        {originalJson && (
          <button
            onClick={handleReset}
            className="border border-foreground/20 px-4 py-1.5 text-sm hover:opacity-70"
          >
            reset
          </button>
        )}
        <button
          onClick={handleClose}
          className="border border-foreground/20 px-4 py-1.5 text-sm hover:opacity-70"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
