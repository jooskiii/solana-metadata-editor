export type WalletState = "disconnected" | "connecting" | "connected" | "disconnecting";

export type WalletErrorKind =
  | "no-wallet"
  | "rejected"
  | "timeout"
  | "unknown";

export interface WalletError {
  kind: WalletErrorKind;
  message: string;
}

export function classifyWalletError(err: unknown): WalletError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
    return { kind: "rejected", message: "connection rejected" };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { kind: "timeout", message: "connection failed, try again" };
  }
  return { kind: "unknown", message: "something went wrong, try again" };
}
