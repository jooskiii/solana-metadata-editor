const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const OFFCHAIN_BATCH_SIZE = 10;
const DAS_PAGE_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface NFTData {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string;
  image: string | null;
  description: string | null;
  collection: string | null;
  uriBroken: boolean;
  offChainLoaded: boolean;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;

  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }

  const chars: string[] = [];
  while (num > 0n) {
    chars.unshift(B58[Number(num % 58n)]);
    num = num / 58n;
  }

  return "1".repeat(zeros) + chars.join("");
}

export function resolveGatewayUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  if (url.startsWith("ar://")) {
    return url.replace("ar://", "https://arweave.net/");
  }
  return url;
}

// ---------------------------------------------------------------------------
// DAS API (Digital Asset Standard) — preferred path
// ---------------------------------------------------------------------------

interface DASAssetContent {
  json_uri?: string;
  metadata?: {
    name?: string;
    symbol?: string;
    description?: string;
  };
  links?: {
    image?: string;
    external_url?: string;
  };
  files?: Array<{ uri?: string; mime?: string }>;
}

interface DASAsset {
  id: string;
  content?: DASAssetContent;
  authorities?: Array<{
    address: string;
    scopes: string[];
  }>;
  ownership?: {
    owner?: string;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
  mutable?: boolean;
  interface?: string;
}

function dasAssetToNFTData(asset: DASAsset): NFTData {
  const content = asset.content;
  const meta = content?.metadata;
  const uri = content?.json_uri || "";
  const image = content?.links?.image
    ? resolveGatewayUrl(content.links.image)
    : null;

  const updateAuthority =
    asset.authorities?.find((a) => a.scopes.includes("full"))?.address ||
    asset.authorities?.[0]?.address ||
    "";

  const collectionGrouping = asset.grouping?.find(
    (g) => g.group_key === "collection"
  );
  const collection = collectionGrouping?.group_value || null;

  return {
    mint: asset.id,
    name: meta?.name || "Unnamed",
    symbol: meta?.symbol || "",
    uri,
    updateAuthority,
    image,
    description: meta?.description || null,
    collection,
    uriBroken: !uri,
    offChainLoaded: true,
  };
}

export async function fetchNFTsViaDAS(
  walletAddress: string,
  rpcEndpoint: string
): Promise<NFTData[]> {
  console.log(`[DAS] Fetching NFTs for authority: ${walletAddress}`);

  const allNfts: NFTData[] = [];
  let page = 1;

  while (true) {
    const response = await fetch(rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetsByAuthority",
        params: {
          authorityAddress: walletAddress,
          page,
          limit: DAS_PAGE_LIMIT,
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new DASError(result.error.code, result.error.message);
    }

    const items: DASAsset[] = result.result?.items || [];
    console.log(`[DAS] Page ${page}: ${items.length} assets`);

    for (const item of items) {
      allNfts.push(dasAssetToNFTData(item));
    }

    if (items.length < DAS_PAGE_LIMIT) break;
    page++;
  }

  console.log(`[DAS] Total: ${allNfts.length} NFTs`);
  return allNfts;
}

class DASError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** Returns true if the error indicates DAS is not supported by this RPC. */
export function isDASUnsupported(err: unknown): boolean {
  if (err instanceof DASError) {
    // -32601 = method not found, -32600 = invalid request
    return err.code === -32601 || err.code === -32600;
  }
  return false;
}

// ---------------------------------------------------------------------------
// getProgramAccounts fallback (for RPCs without DAS support)
// ---------------------------------------------------------------------------

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  );
}

function readBorshString(
  data: Uint8Array,
  offset: number
): [string, number] {
  const len = readU32LE(data, offset);
  offset += 4;
  const end = Math.min(offset + len, data.length);
  const raw = new TextDecoder().decode(data.slice(offset, end));
  return [raw.replace(/\0/g, "").trim(), offset + len];
}

interface RawMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string;
}

function parseMetadataAccount(data: Uint8Array): RawMetadata | null {
  if (data.length < 69 || data[0] !== 4) return null;

  const updateAuthority = base58Encode(data.slice(1, 33));
  const mint = base58Encode(data.slice(33, 65));

  let offset = 65;

  let name: string;
  [name, offset] = readBorshString(data, offset);

  if (offset + 4 > data.length) {
    return { mint, name, symbol: "", uri: "", updateAuthority };
  }

  let symbol: string;
  [symbol, offset] = readBorshString(data, offset);

  if (offset + 4 > data.length) {
    return { mint, name, symbol, uri: "", updateAuthority };
  }

  let uri: string;
  [uri] = readBorshString(data, offset);

  return { mint, name, symbol, uri, updateAuthority };
}

interface OffChainMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  collection?: { name?: string; family?: string } | string;
}

async function fetchOffChainMetadata(
  uri: string
): Promise<{ data: OffChainMetadata | null; broken: boolean }> {
  if (!uri) return { data: null, broken: true };

  const resolved = resolveGatewayUrl(uri);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(resolved, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return { data: null, broken: true };

    const data = (await response.json()) as OffChainMetadata;
    return { data, broken: false };
  } catch {
    return { data: null, broken: true };
  }
}

/** Phase 1: Fetch on-chain metadata accounts via getProgramAccounts. */
export async function fetchMetadataAccounts(
  walletAddress: string,
  rpcEndpoint: string
): Promise<NFTData[]> {
  console.log(
    `[gPA] Fetching NFTs for update authority: ${walletAddress}`
  );

  const response = await fetch(rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [
        TOKEN_METADATA_PROGRAM_ID,
        {
          encoding: "base64",
          filters: [{ memcmp: { offset: 1, bytes: walletAddress } }],
        },
      ],
    }),
  });

  const result = await response.json();

  if (result.error) {
    console.error("[gPA] RPC error:", result.error);
    throw new Error(
      result.error.message || "Failed to fetch NFTs from RPC"
    );
  }

  const accounts: Array<{
    account: { data: [string, string] };
    pubkey: string;
  }> = result.result || [];
  console.log(`[gPA] Found ${accounts.length} metadata accounts`);

  const nfts: NFTData[] = [];
  for (const account of accounts) {
    try {
      const base64Data = account.account.data[0];
      const data = Uint8Array.from(atob(base64Data), (c) =>
        c.charCodeAt(0)
      );
      const parsed = parseMetadataAccount(data);
      if (parsed) {
        nfts.push({
          mint: parsed.mint,
          name: parsed.name || "Unnamed",
          symbol: parsed.symbol || "",
          uri: parsed.uri,
          updateAuthority: parsed.updateAuthority,
          image: null,
          description: null,
          collection: null,
          uriBroken: false,
          offChainLoaded: false,
        });
      }
    } catch (err) {
      console.warn("[gPA] Failed to parse:", account.pubkey, err);
    }
  }

  console.log(`[gPA] Parsed ${nfts.length} metadata accounts`);
  return nfts;
}

/** Phase 2: Enrich a single NFT with off-chain metadata. */
export async function enrichWithOffChainData(
  nft: NFTData
): Promise<NFTData> {
  const { data: offChain, broken: uriBroken } =
    await fetchOffChainMetadata(nft.uri);

  let collection: string | null = null;
  if (offChain?.collection) {
    if (typeof offChain.collection === "string") {
      collection = offChain.collection;
    } else if (offChain.collection.name) {
      collection = offChain.collection.name;
    }
  }

  const image = offChain?.image ? resolveGatewayUrl(offChain.image) : null;

  return {
    ...nft,
    name: nft.name || offChain?.name || "Unnamed",
    symbol: nft.symbol || offChain?.symbol || "",
    image,
    description: offChain?.description || null,
    collection,
    uriBroken,
    offChainLoaded: true,
  };
}

/**
 * Phase 2 runner: enrich NFTs in batches, calling onProgress after each batch.
 */
export async function enrichAllProgressively(
  nfts: NFTData[],
  onProgress: (updated: NFTData[], loaded: number, total: number) => void,
  signal: AbortSignal
): Promise<void> {
  const total = nfts.length;
  const results = [...nfts];
  let loaded = 0;

  for (let i = 0; i < total; i += OFFCHAIN_BATCH_SIZE) {
    if (signal.aborted) return;

    const batchEnd = Math.min(i + OFFCHAIN_BATCH_SIZE, total);
    const batch = nfts.slice(i, batchEnd);

    const enriched = await Promise.all(batch.map(enrichWithOffChainData));

    if (signal.aborted) return;

    for (let j = 0; j < enriched.length; j++) {
      results[i + j] = enriched[j];
    }
    loaded += enriched.length;

    onProgress([...results], loaded, total);
  }

  const brokenCount = results.filter((n) => n.uriBroken).length;
  console.log(
    `[gPA] Enriched ${total} NFTs (${brokenCount} with broken URIs)`
  );
}
