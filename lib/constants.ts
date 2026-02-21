export type Network = "mainnet-beta" | "devnet";

export const NETWORK_OPTIONS: Record<Network, { label: string; rpc: string }> = {
  "mainnet-beta": {
    label: "mainnet",
    rpc:
      process.env.NEXT_PUBLIC_MAINNET_RPC ||
      "https://api.mainnet-beta.solana.com",
  },
  devnet: {
    label: "devnet",
    rpc: "https://api.devnet.solana.com",
  },
};

export const DEFAULT_NETWORK: Network = "mainnet-beta";
export const NETWORK_STORAGE_KEY = "solana-network";
export const CUSTOM_RPC_STORAGE_KEY = "solana-custom-rpc";
export const ERROR_DISPLAY_MS = 5000;

// Transaction defaults
export const DEFAULT_COMPUTE_UNITS = 200_000;
export const PRIORITY_FEE_BY_NETWORK: Record<Network | "custom", number> = {
  "mainnet-beta": 10_000,
  devnet: 1_000,
  custom: 5_000,
};
export const CONFIRMATION_TIMEOUT_MS = 60_000;
export const CONFIRMATION_POLL_MS = 2_000;
