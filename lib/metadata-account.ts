import {
  getProgramDerivedAddress,
  address,
  getAddressEncoder,
  type Address,
} from "@solana/kit";

const TOKEN_METADATA_PROGRAM_ID =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnChainCreator {
  address: string;
  verified: boolean;
  share: number;
}

export interface OnChainCollection {
  verified: boolean;
  key: string;
}

export interface OnChainUses {
  useMethod: number;
  remaining: bigint;
  total: bigint;
}

export interface OnChainMetadata {
  updateAuthority: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: OnChainCreator[] | null;
  primarySaleHappened: boolean;
  isMutable: boolean;
  collection: OnChainCollection | null;
  uses: OnChainUses | null;
}

// ---------------------------------------------------------------------------
// PDA derivation
// ---------------------------------------------------------------------------

const addressEncoder = getAddressEncoder();

export async function deriveMetadataPDA(mint: string): Promise<Address> {
  const programAddr = address(TOKEN_METADATA_PROGRAM_ID);
  const [pda] = await getProgramDerivedAddress({
    programAddress: programAddr,
    seeds: [
      new TextEncoder().encode("metadata"),
      addressEncoder.encode(programAddr),
      addressEncoder.encode(address(mint)),
    ],
  });
  return pda;
}

// ---------------------------------------------------------------------------
// Fetch on-chain metadata
// ---------------------------------------------------------------------------

export async function fetchOnChainMetadata(
  mint: string,
  rpcEndpoint: string
): Promise<OnChainMetadata> {
  const metadataAddress = await deriveMetadataPDA(mint);

  console.log(
    `[metadata-account] Fetching metadata for mint ${mint} at PDA ${metadataAddress}`
  );

  const response = await fetch(rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [metadataAddress, { encoding: "base64" }],
    }),
  });

  const result = await response.json();

  if (result.error) {
    console.error("[metadata-account] RPC error:", result.error);
    throw new Error(
      result.error.message || "Failed to fetch metadata account"
    );
  }

  if (!result.result?.value) {
    throw new Error(
      "Metadata account not found. NFT may not exist or RPC issue."
    );
  }

  const base64Data = result.result.value.data[0];
  const data = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  const parsed = parseFullMetadataAccount(data);
  console.log("[metadata-account] Parsed on-chain metadata:", {
    name: parsed.name,
    isMutable: parsed.isMutable,
    primarySaleHappened: parsed.primarySaleHappened,
    creatorsCount: parsed.creators?.length ?? 0,
    hasCollection: !!parsed.collection,
    hasUses: !!parsed.uses,
  });

  return parsed;
}

// ---------------------------------------------------------------------------
// Binary parsing helpers
// ---------------------------------------------------------------------------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;
  let num = 0n;
  for (const byte of bytes) num = num * 256n + BigInt(byte);
  const chars: string[] = [];
  while (num > 0n) {
    chars.unshift(B58[Number(num % 58n)]);
    num = num / 58n;
  }
  return "1".repeat(zeros) + chars.join("");
}

function readU8(data: Uint8Array, offset: number): [number, number] {
  return [data[offset], offset + 1];
}

function readU16LE(data: Uint8Array, offset: number): [number, number] {
  return [(data[offset] | (data[offset + 1] << 8)) & 0xffff, offset + 2];
}

function readU32LE(data: Uint8Array, offset: number): [number, number] {
  return [
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
      0,
    offset + 4,
  ];
}

function readU64LE(data: Uint8Array, offset: number): [bigint, number] {
  let val = 0n;
  for (let i = 7; i >= 0; i--) {
    val = (val << 8n) | BigInt(data[offset + i]);
  }
  return [val, offset + 8];
}

function readPubkey(data: Uint8Array, offset: number): [string, number] {
  const bytes = data.slice(offset, offset + 32);
  return [base58Encode(bytes), offset + 32];
}

function readBorshString(
  data: Uint8Array,
  offset: number
): [string, number] {
  let len: number;
  [len, offset] = readU32LE(data, offset);
  const end = Math.min(offset + len, data.length);
  const raw = new TextDecoder().decode(data.slice(offset, end));
  return [raw.replace(/\0/g, "").trim(), offset + len];
}

function readBool(data: Uint8Array, offset: number): [boolean, number] {
  return [data[offset] !== 0, offset + 1];
}

// ---------------------------------------------------------------------------
// Full metadata account parser
// ---------------------------------------------------------------------------

function parseFullMetadataAccount(data: Uint8Array): OnChainMetadata {
  if (data.length < 69) {
    throw new Error("Metadata account data too short");
  }
  if (data[0] !== 4) {
    throw new Error(
      `Invalid metadata account discriminator: ${data[0]} (expected 4)`
    );
  }

  let offset = 1;

  // Update authority (32 bytes)
  let updateAuthority: string;
  [updateAuthority, offset] = readPubkey(data, offset);

  // Mint (32 bytes)
  let mint: string;
  [mint, offset] = readPubkey(data, offset);

  // Data struct
  let name: string;
  [name, offset] = readBorshString(data, offset);

  let symbol: string;
  [symbol, offset] = readBorshString(data, offset);

  let uri: string;
  [uri, offset] = readBorshString(data, offset);

  // Seller fee basis points (u16)
  let sellerFeeBasisPoints: number;
  [sellerFeeBasisPoints, offset] = readU16LE(data, offset);

  // Option<Vec<Creator>>
  let creators: OnChainCreator[] | null = null;
  let hasCreators: number;
  [hasCreators, offset] = readU8(data, offset);
  if (hasCreators === 1) {
    let numCreators: number;
    [numCreators, offset] = readU32LE(data, offset);
    creators = [];
    for (let i = 0; i < numCreators; i++) {
      let creatorAddr: string;
      [creatorAddr, offset] = readPubkey(data, offset);
      let verified: boolean;
      [verified, offset] = readBool(data, offset);
      let share: number;
      [share, offset] = readU8(data, offset);
      creators.push({ address: creatorAddr, verified, share });
    }
  }

  // primary_sale_happened (bool)
  let primarySaleHappened: boolean;
  [primarySaleHappened, offset] = readBool(data, offset);

  // is_mutable (bool)
  let isMutable: boolean;
  [isMutable, offset] = readBool(data, offset);

  // edition_nonce: Option<u8>
  let hasEditionNonce: number;
  [hasEditionNonce, offset] = readU8(data, offset);
  if (hasEditionNonce === 1) {
    offset += 1; // skip the nonce byte
  }

  // token_standard: Option<TokenStandard> (u8 enum)
  let collection: OnChainCollection | null = null;
  let uses: OnChainUses | null = null;

  if (offset < data.length) {
    let hasTokenStandard: number;
    [hasTokenStandard, offset] = readU8(data, offset);
    if (hasTokenStandard === 1) {
      offset += 1; // skip token standard byte
    }
  }

  // collection: Option<Collection>
  if (offset < data.length) {
    let hasCollection: number;
    [hasCollection, offset] = readU8(data, offset);
    if (hasCollection === 1) {
      let verified: boolean;
      [verified, offset] = readBool(data, offset);
      let key: string;
      [key, offset] = readPubkey(data, offset);
      collection = { verified, key };
    }
  }

  // uses: Option<Uses>
  if (offset < data.length) {
    let hasUses: number;
    [hasUses, offset] = readU8(data, offset);
    if (hasUses === 1) {
      let useMethod: number;
      [useMethod, offset] = readU8(data, offset);
      let remaining: bigint;
      [remaining, offset] = readU64LE(data, offset);
      let total: bigint;
      [total, offset] = readU64LE(data, offset);
      uses = { useMethod, remaining, total };
    }
  }

  return {
    updateAuthority,
    mint,
    name,
    symbol,
    uri,
    sellerFeeBasisPoints,
    creators,
    primarySaleHappened,
    isMutable,
    collection,
    uses,
  };
}
