import { cn } from "@/shared/lib/utils";
import { formatTokenAmount } from "@/shared/web3/bigint";

export interface TokenAmountProps {
  amount: bigint;
  decimals: number;
  symbol?: string;
  maxFractionDigits?: number;
  className?: string;
}

export function TokenAmount({
  amount,
  decimals,
  symbol,
  maxFractionDigits = 4,
  className,
}: TokenAmountProps) {
  const formatted = formatTokenAmount(amount, decimals, maxFractionDigits);

  return (
    <span className={cn("font-mono tabular-nums text-foreground", className)}>
      {formatted}
      {symbol ? (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {symbol}
        </span>
      ) : null}
    </span>
  );
}
