"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Info,
  XCircle,
} from "lucide-react";
import { AddressDisplay } from "@/entities/token/address-display";
import type {
  SimulatedCallNode,
  SimulationResponse,
} from "@/features/tx-simulation/lib/types";
import { cn } from "@/shared/lib/utils";
import { StatusBadge } from "@/shared/ui/status-badge";
import type { DecodedCallData } from "@/shared/web3/decode";
import type { RiskSeverity } from "@/shared/web3/security";

function CallTraceBranch({
  node,
  chainId,
  depth = 0,
}: {
  node: SimulatedCallNode;
  chainId: number;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.calls.length > 0;

  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border pl-3")}>
      <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse call branch" : "Expand call branch"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <StatusBadge
          tone={node.type === "DELEGATECALL" ? "critical" : "info"}
          mono
          className="text-[10px]"
        >
          {node.type}
        </StatusBadge>
        <span className="font-mono text-xs font-medium text-foreground">
          {node.functionName ?? "call"}
        </span>
        <span className="text-muted-foreground">→</span>
        <AddressDisplay
          address={node.to}
          chainId={chainId}
          showCopy={false}
          showExplorer={false}
        />
        {node.gasUsed !== undefined ? (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            ({node.gasUsed.toLocaleString()} gas)
          </span>
        ) : null}
        {node.error ? (
          <StatusBadge tone="critical">{node.error}</StatusBadge>
        ) : null}
      </div>
      {expanded && hasChildren ? (
        <div>
          {node.calls.map((child, idx) => (
            <CallTraceBranch
              key={`${child.to}-${idx}`}
              node={child}
              chainId={chainId}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DecodedCallInspector({
  decoded,
  chainId,
}: {
  decoded: DecodedCallData;
  chainId: number;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone="info" mono>
            {decoded.standard}
          </StatusBadge>
          <span className="font-mono text-xs font-semibold text-foreground">
            {decoded.functionName}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{decoded.summary}</span>
      </div>

      {decoded.args.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-2">
          {decoded.args.map((arg, idx) => (
            <div
              key={`${arg.name}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className="font-mono text-muted-foreground">{arg.name}</span>
              <span className="max-w-full break-all font-mono text-foreground tabular-nums">
                {arg.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {decoded.nestedCalls.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unpacked MultiSendCallOnly Calls ({decoded.nestedCalls.length})
          </p>
          {decoded.nestedCalls.map((nested) => (
            <div
              key={nested.index}
              className="rounded border border-border bg-card p-2.5 text-xs"
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    #{nested.index + 1}
                  </span>
                  <StatusBadge
                    tone={nested.operation === 1 ? "critical" : "info"}
                    mono
                  >
                    {nested.operation === 1 ? "DELEGATECALL" : "CALL"}
                  </StatusBadge>
                  <span className="font-medium text-foreground">
                    {nested.decoded.summary}
                  </span>
                </div>
                <AddressDisplay address={nested.to} chainId={chainId} />
              </div>
              {nested.decoded.args.length > 0 ? (
                <div className="space-y-0.5 pl-5 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {nested.decoded.args.map((a, i) => (
                    <div key={`${a.name}-${i}`} className="truncate">
                      {a.name}: <span className="text-foreground">{a.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function riskIcon(severity: RiskSeverity) {
  switch (severity) {
    case "CRITICAL":
      return <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-[#FB7185]" />;
    case "HIGH":
    case "MEDIUM":
      return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" />;
    default:
      return <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#CBD5E1]" />;
  }
}

function riskTone(severity: RiskSeverity) {
  switch (severity) {
    case "CRITICAL":
      return "border-[#881337] bg-[#2D0E14] text-[#FB7185]";
    case "HIGH":
    case "MEDIUM":
      return "border-[#78350F] bg-[#2A1F08] text-[#FBBF24]";
    default:
      return "border-[#334155] bg-[#161F30] text-[#CBD5E1]";
  }
}

export interface SimulationPanelProps {
  result: SimulationResponse;
  chainId: number;
}

export function SimulationPanel({ result, chainId }: SimulationPanelProps) {
  return (
    <div className="space-y-4">
      {/* Execution Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3.5">
        <div className="flex items-center gap-2.5">
          {result.success ? (
            <CheckCircle2 className="h-5 w-5 text-[#34D399]" />
          ) : (
            <XCircle className="h-5 w-5 text-[#FB7185]" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {result.success ? "Simulation Will Succeed" : "Simulation Will Revert"}
              </span>
              <StatusBadge tone={result.success ? "verified" : "critical"}>
                {result.success ? "PASS" : "REVERT"}
              </StatusBadge>
            </div>
            {result.revertReason ? (
              <p className="mt-0.5 font-mono text-xs text-[#FB7185]">
                {result.revertReason}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Executed with Safe storage slot-4 threshold override (v=1 pre-validated signature).
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Estimated Gas</p>
            <p className="font-mono font-medium text-foreground tabular-nums">
              {result.gasUsed !== null ? result.gasUsed.toLocaleString() : "N/A"}
            </p>
          </div>
          <StatusBadge tone="info" mono>
            <Cpu className="h-3 w-3" />
            {result.engine === "tenderly" ? "Tenderly" : "EVM StateOverride"}
          </StatusBadge>
        </div>
      </div>

      {/* Security Risk Findings */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Automated Security Risk Report ({result.risks.length})
        </h4>
        {result.risks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-[#065F46] bg-[#052E1E] px-3 py-2 text-xs text-[#34D399]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>No static security anomalies or DELEGATECALL violations detected.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {result.risks.map((finding, idx) => (
              <div
                key={`${finding.code}-${idx}`}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border p-3 text-xs",
                  riskTone(finding.severity)
                )}
              >
                {riskIcon(finding.severity)}
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{finding.title}</span>
                    <span className="font-mono text-[10px] uppercase opacity-80">
                      [{finding.severity} · {finding.code}]
                    </span>
                  </div>
                  <p className="leading-relaxed opacity-90">{finding.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Net Asset Balance Diffs */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Net Asset Balance Changes ({result.assetChanges.length})
        </h4>
        {result.assetChanges.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            No net ETH or ERC-20 balance changes detected for this Safe.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Asset</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Counterparty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.assetChanges.map((change, idx) => (
                  <tr key={`${change.tokenAddress}-${idx}`}>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={change.direction === "IN" ? "verified" : "critical"}
                        mono
                      >
                        {change.direction === "IN" ? "+ IN" : "- OUT"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {change.tokenSymbol}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium tabular-nums">
                      {change.direction === "IN" ? "+" : "-"}
                      {change.formattedAmount} {change.tokenSymbol}
                    </td>
                    <td className="px-3 py-2">
                      <AddressDisplay
                        address={change.direction === "IN" ? change.from : change.to}
                        chainId={chainId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decoded Calldata Inspector */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Decoded Calldata Inspector
        </h4>
        <DecodedCallInspector decoded={result.decoded} chainId={chainId} />
      </div>

      {/* Internal Call Trace */}
      {result.callTrace ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Internal Call Trace
          </h4>
          <div className="rounded-md border border-border bg-card p-3">
            <CallTraceBranch node={result.callTrace} chainId={chainId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
