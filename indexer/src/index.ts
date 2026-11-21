import { ponder } from "ponder:registry";
import {
  erc20Approval,
  erc20Transfer,
  safeExecution,
  safeGovernanceEvent,
} from "ponder:schema";
import { getAddress } from "viem";

const TRACKED_SAFE = getAddress(
  process.env.INDEXED_SAFE_ADDRESS ?? "0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"
).toLowerCase();

ponder.on("SafeAccount:ExecutionSuccess", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeExecution).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    safeTxHash: event.args.txHash,
    transactionHash: event.transaction.hash,
    paymentWei: event.args.payment,
    success: true,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SafeAccount:ExecutionFailure", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeExecution).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    safeTxHash: event.args.txHash,
    transactionHash: event.transaction.hash,
    paymentWei: event.args.payment,
    success: false,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SafeAccount:AddedOwner", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeGovernanceEvent).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    eventType: "ADDED_OWNER",
    actorAddress: getAddress(event.args.owner),
    numericValue: null,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SafeAccount:RemovedOwner", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeGovernanceEvent).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    eventType: "REMOVED_OWNER",
    actorAddress: getAddress(event.args.owner),
    numericValue: null,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SafeAccount:ChangedThreshold", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeGovernanceEvent).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    eventType: "CHANGED_THRESHOLD",
    actorAddress: null,
    numericValue: event.args.threshold,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SafeAccount:SafeReceived", async ({ event, context }) => {
  const chainId = context.network.chainId;
  await context.db.insert(safeGovernanceEvent).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    safeAddress: getAddress(event.log.address),
    eventType: "SAFE_RECEIVED",
    actorAddress: getAddress(event.args.sender),
    numericValue: event.args.value,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("TrackedErc20:Transfer", async ({ event, context }) => {
  const fromLower = event.args.from.toLowerCase();
  const toLower = event.args.to.toLowerCase();
  if (fromLower !== TRACKED_SAFE && toLower !== TRACKED_SAFE) {
    return;
  }

  const chainId = context.network.chainId;
  const direction = toLower === TRACKED_SAFE ? "IN" : "OUT";
  const safeAddress = getAddress(
    direction === "IN" ? event.args.to : event.args.from
  );

  await context.db.insert(erc20Transfer).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    tokenAddress: getAddress(event.log.address),
    from: getAddress(event.args.from),
    to: getAddress(event.args.to),
    valueWei: event.args.value,
    direction,
    safeAddress,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });
});

ponder.on("TrackedErc20:Approval", async ({ event, context }) => {
  if (event.args.owner.toLowerCase() !== TRACKED_SAFE) {
    return;
  }

  const chainId = context.network.chainId;
  const safeAddress = getAddress(event.args.owner);
  const tokenAddress = getAddress(event.log.address);
  const spenderAddress = getAddress(event.args.spender);
  const id = `${chainId}:${safeAddress}:${tokenAddress}:${spenderAddress}`;

  await context.db
    .insert(erc20Approval)
    .values({
      id,
      chainId,
      safeAddress,
      tokenAddress,
      spenderAddress,
      allowanceWei: event.args.value,
      lastTxHash: event.transaction.hash,
      updatedAtBlock: event.block.number,
      updatedAtTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate({
      allowanceWei: event.args.value,
      lastTxHash: event.transaction.hash,
      updatedAtBlock: event.block.number,
      updatedAtTimestamp: event.block.timestamp,
    });
});
