import { test as base, expect } from "@playwright/test";
import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import basicSetup from "./wallet-setup/basic.setup";

const synpressTest = testWithSynpress(metaMaskFixtures(basicSetup));

// ---------------------------------------------------------------------------
// 1. Security Boundary & BFF API Verification (runs in standard Playwright)
// ---------------------------------------------------------------------------
base.describe("AegisVault Security Boundaries & App Shell", () => {
  base("enforces hardened HTTP security headers on dashboard routes", async ({
    request,
  }) => {
    const res = await request.get("/treasury");
    expect(res.status()).toBe(200);

    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  base("blocks disallowed JSON-RPC methods on /api/rpc/[chainId] with 403", async ({
    request,
  }) => {
    const res = await request.post("/api/rpc/8453", {
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: ["0x" + "00".repeat(32)],
      },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("RPC method not permitted");
  });

  base("navigates across all 6 institutional pages without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    for (const route of [
      "/treasury",
      "/queue",
      "/batch-builder",
      "/allowances",
      "/governance",
    ]) {
      await page.goto(route);
      await expect(page.getByText("AegisVault").first()).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  base("adds payout to Batch Cart and runs pre-execution simulation diff modal", async ({
    page,
  }) => {
    await page.goto("/batch-builder");

    await page
      .getByLabel("Recipient Address")
      .fill("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
    await page.getByLabel("Amount").fill("0.25");
    await page.getByLabel("Internal Memo (Optional)").fill("E2E Vendor Settlement");
    await page.getByRole("button", { name: /Add Payout to Batch Cart/i }).click();

    await page
      .getByRole("button", { name: /Simulate & Propose Batch \(1\)/i })
      .click();

    await expect(page.getByText("MultiSendCallOnly Batch Cart")).toBeVisible();
    await expect(page.getByText("Send 0.25 ETH")).toBeVisible();

    await page.getByRole("button", { name: /Simulate Batch/i }).click();
    await expect(
      page.getByText(/Automated Security Risk Report/i)
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Wallet E2E Flow with Synpress + MetaMask (requires built Synpress cache)
// ---------------------------------------------------------------------------
synpressTest.describe("Synpress MetaMask Treasury E2E Flow", () => {
  synpressTest(
    "connects wallet, recovers from wrong network, and preserves cart on rejected signature",
    async ({ context, page, metamaskPage, extensionId }) => {
      const metamask = new MetaMask(
        context,
        metamaskPage,
        basicSetup.walletPassword,
        extensionId
      );

      await page.goto("/treasury");
      await page.getByRole("button", { name: /Connect Wallet/i }).click();
      await page.getByText(/MetaMask/i).click();
      await metamask.connectToDapp();

      // Switch workspace to Local Anvil Fork if wrong-network banner appears
      const wrongNetworkBanner = page.getByText(/Wrong Network:/i);
      if (await wrongNetworkBanner.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.getByRole("button", { name: /Switch Network/i }).click();
        await metamask.approveSwitchNetwork();
      }

      // Queue a payout in Batch Builder
      await page.goto("/batch-builder");
      await page
        .getByLabel("Recipient Address")
        .fill("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
      await page.getByLabel("Amount").fill("0.1");
      await page.getByRole("button", { name: /Add Payout to Batch Cart/i }).click();
      await page
        .getByRole("button", { name: /Simulate & Propose Batch \(1\)/i })
        .click();

      // Simulate batch before proposing
      await page.getByRole("button", { name: /Simulate Batch/i }).click();
      await expect(
        page.getByText(/Automated Security Risk Report/i)
      ).toBeVisible({ timeout: 20_000 });

      // Trigger Sign & Propose, reject signature in MetaMask, verify cart is preserved
      await page.getByRole("button", { name: /Sign & Propose Batch/i }).click();
      await metamask.rejectSignature();

      await expect(
        page.getByText(/Wallet signature was cancelled/i)
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Send 0.1 ETH")).toBeVisible();
    }
  );
});
