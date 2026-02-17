export type Network = "mainnet-beta" | "devnet";

export const NETWORK_OPTIONS: Record<Network, { label: string; rpc: string }> = {
  "mainnet-beta": {
    label: "mainnet",
    rpc: "https://api.mainnet-beta.solana.com",
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
