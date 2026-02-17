import type { Metadata } from "next";
import "./globals.css";
import { SolanaProviders } from "@/components/SolanaProviders";

export const metadata: Metadata = {
  title: "metadata editor",
  description: "fix your nft metadata on solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
