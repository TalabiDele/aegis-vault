import { createConfig } from "ponder";
import { getAddress, http, type Address } from "viem";

const safeEventsAbi = [
  {
    type: "event",
    name: "ExecutionSuccess",
    anonymous: false,
    inputs: [
      { indexed: true, name: "txHash", type: "bytes32" },
      { indexed: false, name: "payment", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ExecutionFailure",
    anonymous: false,
    inputs: [
      { indexed: true, name: "txHash", type: "bytes32" },
      { indexed: false, name: "payment", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "AddedOwner",
    anonymous: false,
    inputs: [{ indexed: true, name: "owner", type: "address" }],
  },
  {
    type: "event",
    name: "RemovedOwner",
    anonymous: false,
    inputs: [{ indexed: true, name: "owner", type: "address" }],
  },
  {
    type: "event",
    name: "ChangedThreshold",
    anonymous: false,
    inputs: [{ indexed: false, name: "threshold", type: "uint256" }],
  },
  {
    type: "event",
    name: "SafeReceived",
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

const erc20EventsAbi = [
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

const trackedSafeAddress: Address = getAddress(
  process.env.INDEXED_SAFE_ADDRESS ?? "0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"
);
const startBlock = Number(process.env.PONDER_START_BLOCK ?? "0");

export default createConfig({
  database: process.env.DATABASE_URL
    ? {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL,
      }
    : {
        kind: "pglite",
      },
  networks: {
    base: {
      chainId: 8453,
      transport: http(process.env.RPC_URL_BASE || "https://mainnet.base.org"),
    },
    anvil: {
      chainId: 31337,
      transport: http(process.env.RPC_URL_ANVIL || "http://127.0.0.1:8545"),
    },
  },
  contracts: {
    SafeAccount: {
      abi: safeEventsAbi,
      network: {
        base: {
          address: trackedSafeAddress,
          startBlock,
        },
        anvil: {
          address: trackedSafeAddress,
          startBlock: 0,
        },
      },
    },
    TrackedErc20: {
      abi: erc20EventsAbi,
      network: {
        base: {
          address: [
            getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), // USDC
            getAddress("0x4200000000000000000000000000000000000006"), // WETH
            getAddress("0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"), // DAI
          ],
          startBlock,
        },
        anvil: {
          address: [
            getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), // Mainnet USDC
            getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"), // Mainnet WETH
          ],
          startBlock: 0,
        },
      },
    },
  },
});
