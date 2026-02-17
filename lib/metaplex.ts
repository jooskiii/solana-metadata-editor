const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
  // MetadataV1 key = 4, minimum size: 1 + 32 + 32 + 4 = 69
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
  attributes?: Array<{ trait_type: string; value: string | number }>;
}

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

export async function fetchNFTsByUpdateAuthority(
  walletAddress: string,
  rpcEndpoint: string
): Promise<NFTData[]> {
  console.log(`Fetching NFTs for update authority: ${walletAddress}`);

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
    console.error("RPC error:", result.error);
    throw new Error(result.error.message || "Failed to fetch NFTs from RPC");
  }

  const accounts: Array<{
    account: { data: [string, string] };
    pubkey: string;
  }> = result.result || [];
  console.log(`Found ${accounts.length} metadata accounts`);

  const rawMetadata: RawMetadata[] = [];
  for (const account of accounts) {
    try {
      const base64Data = account.account.data[0];
      const data = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const parsed = parseMetadataAccount(data);
      if (parsed) rawMetadata.push(parsed);
    } catch (err) {
      console.warn("Failed to parse metadata account:", account.pubkey, err);
    }
  }

  console.log(
    `Parsed ${rawMetadata.length} metadata accounts, fetching off-chain data...`
  );

  const nfts: NFTData[] = await Promise.all(
    rawMetadata.map(async (raw): Promise<NFTData> => {
      const { data: offChain, broken: uriBroken } =
        await fetchOffChainMetadata(raw.uri);

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
        mint: raw.mint,
        name: raw.name || offChain?.name || "Unnamed",
        symbol: raw.symbol || offChain?.symbol || "",
        uri: raw.uri,
        updateAuthority: raw.updateAuthority,
        image,
        description: offChain?.description || null,
        collection,
        uriBroken,
      };
    })
  );

  console.log(
    `Loaded ${nfts.length} NFTs (${nfts.filter((n) => n.uriBroken).length} with broken URIs)`
  );

  return nfts;
}
