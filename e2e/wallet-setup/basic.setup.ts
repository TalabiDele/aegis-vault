import { defineWalletSetup } from "@synthetixio/synpress";
import { MetaMask } from "@synthetixio/synpress/playwright";

const ANVIL_SEED_PHRASE =
  process.env.SYNPRESS_SEED_PHRASE ??
  "test test test test test test test test test test test junk";
const WALLET_PASSWORD = process.env.SYNPRESS_WALLET_PASSWORD ?? "AegisVault2026!";

export default defineWalletSetup(
  WALLET_PASSWORD,
  async (context, walletPage) => {
    const metamask = new MetaMask(
      context as unknown as ConstructorParameters<typeof MetaMask>[0],
      walletPage as unknown as ConstructorParameters<typeof MetaMask>[1],
      WALLET_PASSWORD
    );
    await metamask.importWallet(ANVIL_SEED_PHRASE);

    await metamask.addNetwork({
      name: "Anvil Local Fork",
      rpcUrl: process.env.RPC_URL_ANVIL ?? "http://127.0.0.1:8545",
      chainId: 31337,
      symbol: "ETH",
    });
  }
);
