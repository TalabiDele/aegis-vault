import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { getServerWagmiConfig } from "@/shared/config/wagmi";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AegisVault — Institutional Multi-Sig Treasury & Governance Portal",
  description:
    "Enterprise Safe Smart Account treasury workspace with pre-execution Tenderly simulation, MultiSend batching, ERC-20 allowance auditing, and nonce conflict management.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieHeader = (await headers()).get("cookie");
  const initialState = cookieToInitialState(getServerWagmiConfig(), cookieHeader);

  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
