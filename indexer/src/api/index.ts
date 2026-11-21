import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { and, desc, eq, graphql } from "ponder";
import { getAddress, isAddress } from "viem";

const app = new Hono();

app.use("/graphql", graphql({ db, schema }));

app.get("/api/cashflow", async (c) => {
  const safeParam = c.req.query("safeAddress");
  const chainParam = c.req.query("chainId");
  if (!safeParam || !isAddress(safeParam) || !chainParam || !/^\d+$/.test(chainParam)) {
    return c.json({ error: "Invalid safeAddress or chainId" }, 400);
  }

  const safeAddress = getAddress(safeParam);
  const chainId = Number(chainParam);

  const [executions, transfers] = await Promise.all([
    db
      .select()
      .from(schema.safeExecution)
      .where(
        and(
          eq(schema.safeExecution.safeAddress, safeAddress),
          eq(schema.safeExecution.chainId, chainId)
        )
      )
      .orderBy(desc(schema.safeExecution.timestamp))
      .limit(200),
    db
      .select()
      .from(schema.erc20Transfer)
      .where(
        and(
          eq(schema.erc20Transfer.safeAddress, safeAddress),
          eq(schema.erc20Transfer.chainId, chainId)
        )
      )
      .orderBy(desc(schema.erc20Transfer.timestamp))
      .limit(200),
  ]);

  const buckets = new Map<
    string,
    { period: string; inflowCount: number; outflowCount: number; executions: number }
  >();

  const toPeriod = (ts: bigint) =>
    new Date(Number(ts) * 1000).toISOString().slice(0, 7);

  for (const ex of executions) {
    const period = toPeriod(ex.timestamp);
    const entry = buckets.get(period) ?? {
      period,
      inflowCount: 0,
      outflowCount: 0,
      executions: 0,
    };
    entry.executions += 1;
    buckets.set(period, entry);
  }

  for (const tr of transfers) {
    const period = toPeriod(tr.timestamp);
    const entry = buckets.get(period) ?? {
      period,
      inflowCount: 0,
      outflowCount: 0,
      executions: 0,
    };
    if (tr.direction === "IN") {
      entry.inflowCount += 1;
    } else {
      entry.outflowCount += 1;
    }
    buckets.set(period, entry);
  }

  const series = Array.from(buckets.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  return c.json({ source: "ponder", series });
});

app.get("/api/allowances", async (c) => {
  const safeParam = c.req.query("safeAddress");
  const chainParam = c.req.query("chainId");
  if (!safeParam || !isAddress(safeParam) || !chainParam || !/^\d+$/.test(chainParam)) {
    return c.json({ error: "Invalid safeAddress or chainId" }, 400);
  }

  const safeAddress = getAddress(safeParam);
  const chainId = Number(chainParam);

  const approvals = await db
    .select()
    .from(schema.erc20Approval)
    .where(
      and(
        eq(schema.erc20Approval.safeAddress, safeAddress),
        eq(schema.erc20Approval.chainId, chainId)
      )
    )
    .limit(200);

  return c.json({
    source: "ponder",
    pairs: approvals.map((row) => ({
      token: row.tokenAddress,
      spender: row.spenderAddress,
      allowanceWei: row.allowanceWei.toString(),
    })),
  });
});

export default app;
