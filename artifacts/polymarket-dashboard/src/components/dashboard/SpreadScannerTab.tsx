import React from "react"
import { ExternalLink, RefreshCw, Zap, Loader2 } from "lucide-react"
import { SpreadData } from "@/hooks/use-polymarket"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPercent, cn } from "@/lib/utils"

interface SpreadScannerTabProps {
  spreads: SpreadData[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function getTradeUrl(market: SpreadData["market"]): string {
  const eventSlug = market.events?.[0]?.slug;
  if (eventSlug) return "https://polymarket.com/event/" + eventSlug;
  return "https://polymarket.com/event/" + market.slug;
}

export function SpreadScannerTab({ spreads, isLoading, isRefreshing, onRefresh }: SpreadScannerTabProps) {

  const getSpreadColor = (spread: number) => {
    if (spread > 0.08) return "text-green-400 bg-green-500/10 border-green-500/20";
    if (spread >= 0.04) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    return "text-muted-foreground bg-secondary/50 border-transparent";
  };

  const getSpreadBadge = (spread: number) => {
    if (spread > 0.08) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Wide Spread</Badge>;
    if (spread >= 0.04) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">Medium Spread</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Tight</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-in fade-in duration-300">
        <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
        <p className="text-muted-foreground font-mono text-sm animate-pulse">
          Scanning 200 active markets for spreads...
        </p>
        <p className="text-xs text-muted-foreground/60 font-mono">
          Filtering bid 5–95¢ · spread &gt; 2¢ · vol &gt; $2K
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            Live Spread Scanner
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {spreads.length} markets with spread &gt; 2¢, bid 5–95¢, vol &gt; $2K — sorted widest first
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Market</th>
                <th className="px-6 py-4 font-semibold text-right">24h Vol</th>
                <th className="px-6 py-4 font-semibold text-right">Best Bid</th>
                <th className="px-6 py-4 font-semibold text-right">Best Ask</th>
                <th className="px-6 py-4 font-semibold text-right">Spread</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {spreads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No markets with spread &gt; 2¢ found across 200 active markets.
                  </td>
                </tr>
              )}
              {spreads.map((row) => (
                <tr key={row.market.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 max-w-xs">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground line-clamp-2 leading-snug" title={row.market.question}>
                        {row.market.question}
                      </span>
                      {getSpreadBadge(row.spread)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                    {formatCurrency(row.market.volume24hr)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-green-400">
                    {formatPercent(row.bestBid)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-red-400">
                    {formatPercent(row.bestAsk)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded font-mono font-bold border",
                      getSpreadColor(row.spread)
                    )}>
                      {formatPercent(row.spread)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="font-semibold"
                      onClick={() => window.open(getTradeUrl(row.market), "_blank")}
                    >
                      Trade <ExternalLink size={13} className="ml-1" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
