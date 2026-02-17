import { WalletButton } from "@/components/WalletButton";

export default function Home() {
  return (
    <main className="mx-auto max-w-[800px] px-6 py-16">
      <h1 className="text-xl font-normal mb-4">nft metadata editor</h1>
      <p className="text-foreground/60 mb-8">
        connect your wallet to view and edit metadata for your nfts on devnet.
        that&apos;s basically it.
      </p>
      <WalletButton />
    </main>
  );
}
