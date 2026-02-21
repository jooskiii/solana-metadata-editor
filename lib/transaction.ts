import {
  address,
  getAddressEncoder,
  AccountRole,
  type Address,
} from "@solana/kit";
import type {
  OnChainMetadata,
  OnChainCreator,
  OnChainCollection,
  OnChainUses,
} from "./metadata-account";

const TOKEN_METADATA_PROGRAM_ID =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

const TX_HISTORY_KEY = "recentTransactions";
const MAX_TX_HISTORY = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransactionState =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "success"
  | "error";

export interface TransactionError {
  kind:
    | "rejected"
    | "insufficient-funds"
    | "invalid-authority"
    | "immutable"
    | "simulation-failed"
    | "rpc-error"
    | "timeout"
    | "unknown";
  message: string;
  details?: string;
}

export interface TransactionHistoryEntry {
  nftName: string;
  mint: string;
  signature: string;
  timestamp: string;
  network: string;
}

export interface UpdateMetadataArgs {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: OnChainCreator[] | null;
  collection: OnChainCollection | null;
  uses: OnChainUses | null;
}

// ---------------------------------------------------------------------------
// Borsh serialization helpers
// ---------------------------------------------------------------------------

const addressEncoder = getAddressEncoder();

function writeU8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

function writeU16LE(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  return buf;
}

function writeU32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  buf[2] = (value >> 16) & 0xff;
  buf[3] = (value >> 24) & 0xff;
  return buf;
}

function writeU64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return buf;
}

function writeBorshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concat([writeU32LE(bytes.length), bytes]);
}

function writePubkey(addr: string): Uint8Array {
  return new Uint8Array(addressEncoder.encode(address(addr)));
}

function writeBool(value: boolean): Uint8Array {
  return new Uint8Array([value ? 1 : 0]);
}

function writeOptionNone(): Uint8Array {
  return new Uint8Array([0]);
}

function writeOptionSome(data: Uint8Array): Uint8Array {
  return concat([new Uint8Array([1]), data]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Serialize DataV2
// ---------------------------------------------------------------------------

function serializeDataV2(args: UpdateMetadataArgs): Uint8Array {
  const parts: Uint8Array[] = [];

  // name (Borsh string)
  parts.push(writeBorshString(args.name));

  // symbol (Borsh string)
  parts.push(writeBorshString(args.symbol));

  // uri (Borsh string)
  parts.push(writeBorshString(args.uri));

  // seller_fee_basis_points (u16)
  parts.push(writeU16LE(args.sellerFeeBasisPoints));

  // creators: Option<Vec<Creator>>
  if (args.creators && args.creators.length > 0) {
    const creatorParts: Uint8Array[] = [];
    creatorParts.push(writeU32LE(args.creators.length));
    for (const c of args.creators) {
      creatorParts.push(writePubkey(c.address));
      creatorParts.push(writeBool(c.verified));
      creatorParts.push(writeU8(c.share));
    }
    parts.push(writeOptionSome(concat(creatorParts)));
  } else {
    parts.push(writeOptionNone());
  }

  // collection: Option<Collection>
  if (args.collection) {
    parts.push(
      writeOptionSome(
        concat([writeBool(args.collection.verified), writePubkey(args.collection.key)])
      )
    );
  } else {
    parts.push(writeOptionNone());
  }

  // uses: Option<Uses>
  if (args.uses) {
    parts.push(
      writeOptionSome(
        concat([
          writeU8(args.uses.useMethod),
          writeU64LE(args.uses.remaining),
          writeU64LE(args.uses.total),
        ])
      )
    );
  } else {
    parts.push(writeOptionNone());
  }

  return concat(parts);
}

// ---------------------------------------------------------------------------
// Build UpdateMetadataAccountV2 instruction data
// ---------------------------------------------------------------------------

export function serializeUpdateMetadataAccountV2(
  args: UpdateMetadataArgs
): Uint8Array {
  const parts: Uint8Array[] = [];

  // Instruction discriminator: 15 (UpdateMetadataAccountV2)
  parts.push(writeU8(15));

  // data: Option<DataV2> = Some(dataV2)
  parts.push(writeOptionSome(serializeDataV2(args)));

  // new_update_authority: Option<Pubkey> = None (don't change)
  parts.push(writeOptionNone());

  // primary_sale_happened: Option<bool> = None (preserve current)
  parts.push(writeOptionNone());

  // is_mutable: Option<bool> = None (preserve current)
  parts.push(writeOptionNone());

  const data = concat(parts);
  console.log(
    `[transaction] Serialized UpdateMetadataAccountV2 instruction: ${data.length} bytes`
  );
  return data;
}

// ---------------------------------------------------------------------------
// Build the instruction object for @solana/kit
// ---------------------------------------------------------------------------

export function buildUpdateMetadataV2Instruction(
  metadataPda: string,
  updateAuthority: string,
  args: UpdateMetadataArgs
) {
  const data = serializeUpdateMetadataAccountV2(args);

  const instruction = {
    programAddress: address(TOKEN_METADATA_PROGRAM_ID),
    accounts: [
      {
        address: address(metadataPda) as Address,
        role: AccountRole.WRITABLE as const,
      },
      {
        address: address(updateAuthority) as Address,
        role: AccountRole.READONLY_SIGNER as const,
      },
    ],
    data,
  };

  console.log("[transaction] Built instruction:", {
    program: TOKEN_METADATA_PROGRAM_ID,
    metadataPda,
    updateAuthority,
    dataLength: data.length,
  });

  return instruction;
}

// ---------------------------------------------------------------------------
// Merge creators: preserve verified status from on-chain
// ---------------------------------------------------------------------------

export function mergeCreators(
  formCreators: Array<{ address: string; share: number; verified: boolean }>,
  onChainCreators: OnChainCreator[] | null
): OnChainCreator[] {
  const onChainMap = new Map<string, boolean>();
  if (onChainCreators) {
    for (const c of onChainCreators) {
      onChainMap.set(c.address, c.verified);
    }
  }

  return formCreators.map((fc) => ({
    address: fc.address,
    share: fc.share,
    // Preserve on-chain verified status for existing creators,
    // new creators are unverified
    verified: onChainMap.get(fc.address) ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Transaction error classification
// ---------------------------------------------------------------------------

export function classifyTransactionError(err: unknown): TransactionError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  console.error("[transaction] Error:", err);

  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("cancel") ||
    lower.includes("user rejected")
  ) {
    return { kind: "rejected", message: "Transaction cancelled" };
  }

  if (
    lower.includes("insufficient") ||
    lower.includes("not enough") ||
    lower.includes("0x1")
  ) {
    return {
      kind: "insufficient-funds",
      message: "Not enough SOL for transaction fee",
      details: msg,
    };
  }

  if (
    lower.includes("authority") ||
    lower.includes("constraint") ||
    lower.includes("0x7") ||
    lower.includes("unauthorized")
  ) {
    return {
      kind: "invalid-authority",
      message: "You are not the update authority for this NFT",
      details: msg,
    };
  }

  if (lower.includes("immutable") || lower.includes("0x4")) {
    return {
      kind: "immutable",
      message: "This NFT is immutable and cannot be updated",
      details: msg,
    };
  }

  if (lower.includes("simulation") || lower.includes("simulate")) {
    return {
      kind: "simulation-failed",
      message: "Transaction simulation failed",
      details: msg,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("blockhash")
  ) {
    return {
      kind: "timeout",
      message: "Transaction may still succeed - check explorer",
      details: msg,
    };
  }

  if (
    lower.includes("rpc") ||
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("failed to send")
  ) {
    return {
      kind: "rpc-error",
      message: "Network error. Try again or switch RPC",
      details: msg,
    };
  }

  return { kind: "unknown", message: msg };
}

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

export function estimateTransactionFee(
  computeUnits: number,
  microLamportsPerUnit: number
): { baseFee: number; priorityFee: number; totalSol: string } {
  const baseFee = 5000; // lamports
  const priorityFee = Math.ceil(
    (computeUnits * microLamportsPerUnit) / 1_000_000
  );
  const totalLamports = baseFee + priorityFee;
  const totalSol = (totalLamports / 1_000_000_000).toFixed(6);
  return { baseFee, priorityFee, totalSol };
}

// ---------------------------------------------------------------------------
// Confirmation polling
// ---------------------------------------------------------------------------

export async function pollConfirmation(
  signature: string,
  rpcEndpoint: string,
  commitment: string = "confirmed",
  timeoutMs: number = 60_000,
  pollIntervalMs: number = 2_000
): Promise<{ confirmed: boolean; err: string | null }> {
  const start = Date.now();

  console.log(
    `[transaction] Polling confirmation for ${signature} (timeout: ${timeoutMs}ms)`
  );

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[signature], { searchTransactionHistory: true }],
        }),
      });

      const result = await response.json();
      const status = result.result?.value?.[0];

      if (status) {
        if (status.err) {
          console.error("[transaction] Transaction failed:", status.err);
          return {
            confirmed: false,
            err: JSON.stringify(status.err),
          };
        }

        const confirmationStatus = status.confirmationStatus;
        console.log(
          `[transaction] Status: ${confirmationStatus}`
        );

        if (
          confirmationStatus === commitment ||
          confirmationStatus === "finalized"
        ) {
          console.log("[transaction] Transaction confirmed!");
          return { confirmed: true, err: null };
        }
      }
    } catch (err) {
      console.warn("[transaction] Poll error:", err);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  console.warn("[transaction] Confirmation timeout");
  return { confirmed: false, err: "timeout" };
}

// ---------------------------------------------------------------------------
// Explorer URL
// ---------------------------------------------------------------------------

export function getExplorerUrl(
  signature: string,
  network: string
): string | null {
  if (network === "mainnet-beta") {
    return `https://explorer.solana.com/tx/${signature}`;
  }
  if (network === "devnet") {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  }
  // Custom RPC — no reliable explorer link
  return null;
}

// ---------------------------------------------------------------------------
// Transaction history (localStorage)
// ---------------------------------------------------------------------------

export function getTransactionHistory(): TransactionHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TX_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TransactionHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addTransactionToHistory(
  entry: TransactionHistoryEntry
): void {
  if (typeof window === "undefined") return;
  try {
    const history = getTransactionHistory();
    history.unshift(entry);
    if (history.length > MAX_TX_HISTORY) {
      history.length = MAX_TX_HISTORY;
    }
    localStorage.setItem(TX_HISTORY_KEY, JSON.stringify(history));
  } catch {
    console.warn("[transaction] Failed to save transaction history");
  }
}
