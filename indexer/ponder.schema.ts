import { index, onchainTable } from "ponder";

export const safeExecution = onchainTable(
  "safe_execution",
  (t) => ({
    id: t.text().primaryKey(), // `${chainId}:${txHash}:${logIndex}`
    chainId: t.integer().notNull(),
    safeAddress: t.hex().notNull(),
    safeTxHash: t.hex().notNull(),
    transactionHash: t.hex().notNull(),
    paymentWei: t.bigint().notNull(),
    success: t.boolean().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    safeIdx: index().on(table.safeAddress, table.chainId),
    tsIdx: index().on(table.timestamp),
  })
);

export const safeGovernanceEvent = onchainTable(
  "safe_governance_event",
  (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    safeAddress: t.hex().notNull(),
    eventType: t.text().notNull(), // ADDED_OWNER | REMOVED_OWNER | CHANGED_THRESHOLD | SAFE_RECEIVED
    actorAddress: t.hex(),
    numericValue: t.bigint(),
    transactionHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    safeIdx: index().on(table.safeAddress, table.chainId),
  })
);

export const erc20Transfer = onchainTable(
  "erc20_transfer",
  (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    tokenAddress: t.hex().notNull(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    valueWei: t.bigint().notNull(),
    direction: t.text().notNull(), // IN | OUT
    safeAddress: t.hex().notNull(),
    transactionHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    safeIdx: index().on(table.safeAddress, table.chainId),
    tsIdx: index().on(table.timestamp),
  })
);

export const erc20Approval = onchainTable(
  "erc20_approval",
  (t) => ({
    id: t.text().primaryKey(), // `${chainId}:${owner}:${token}:${spender}`
    chainId: t.integer().notNull(),
    safeAddress: t.hex().notNull(),
    tokenAddress: t.hex().notNull(),
    spenderAddress: t.hex().notNull(),
    allowanceWei: t.bigint().notNull(),
    lastTxHash: t.hex().notNull(),
    updatedAtBlock: t.bigint().notNull(),
    updatedAtTimestamp: t.bigint().notNull(),
  }),
  (table) => ({
    safeIdx: index().on(table.safeAddress, table.chainId),
  })
);
