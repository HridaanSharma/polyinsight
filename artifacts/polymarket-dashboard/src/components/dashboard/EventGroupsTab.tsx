import { useCausalChains, type CrossChain, type ChainMarket } from "@/hooks/use-polymarket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, RefreshCw, Loader2, TrendingUp, TrendingDown, Activity, ArrowRight } from "lucide-react";

function formatVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function pctStr(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function MarketRow({ m }: { m: ChainMarket }) {
  const rawChange = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any);
  const changeStr = m.moved
    ? `${rawChange > 0 ? "+" : ""}${(rawChange * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/75 leading-snug truncate group-hover:text-white transition-colors">
          {m.question}
        </p>
      </div>

      <div className="shrink-0 text-right w-12">
        <span className="text-xs font-bold text-white tabular-nums">{pctStr(m.probability)}</span>
      </div>

      <div className="shrink-0 w-12 text-right">
        {m.moved ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded-full ${
              m.moveDirection === "up"
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {m.moveDirection === "up" ? (
              <TrendingUp className="w-2.5 h-2.5" />
            ) : (
              <TrendingDown className="w-2.5 h-2.5" />
            )}
            {changeStr}
          </span>
        ) : (
          <span className="text-[10px] text-white/25">—</span>
        )}
      </div>

      <a
        href={m.tradeUrl}
        target="_blank"
        rel="noreferrer"
        title="Trade on Polymarket"
        className="shrink-0 text-white/30 hover:text-blue-400 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

function GroupColumn({
  label,
  markets,
  accent,
}: {
  label: string;
  markets: ChainMarket[];
  accent: "blue" | "amber";
}) {
  const accentCls =
    accent === "blue"
      ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
      : "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div
        className={`inline-flex self-start items-center text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${accentCls}`}
      >
        {label}
      </div>

      {/* Column header row */}
      <div className="flex items-center gap-2 pb-1 border-b border-white/8">
        <div className="flex-1 text-[9px] text-white/25 uppercase tracking-wider">Market</div>
        <div className="w-12 text-right text-[9px] text-white/25 uppercase tracking-wider">YES</div>
        <div className="w-12 text-right text-[9px] text-white/25 uppercase tracking-wider">24h</div>
        <div className="w-3" />
      </div>

      {markets.map((m, i) => (
        <MarketRow key={m.conditionId || m.id || i} m={m} />
      ))}
    </div>
  );
}

function CrossChainCard({ chain }: { chain: CrossChain }) {
  const allMarkets = [...chain.groupA, ...chain.groupB];
  const movedCount = allMarkets.filter(m => m.moved).length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3 hover:bg-white/[0.07] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{chain.emoji}</span>
          <div>
            <h3 className="text-sm font-bold text-white leading-snug">{chain.theme}</h3>
            <p className="text-xs text-white/40 mt-0.5">{chain.description}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-semibold text-white/60 tabular-nums">{formatVol(chain.totalVolume)}</div>
          <div className="text-[10px] text-white/30">24h vol</div>
        </div>
      </div>

      {/* Moved alert */}
      {movedCount > 0 && (
        <div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-300 bg-orange-500/15 border border-orange-500/25 px-2 py-0.5 rounded-full">
            <Activity className="w-3 h-3" />
            {movedCount} market{movedCount > 1 ? "s" : ""} moved &gt;3% — check for repricing
          </span>
        </div>
      )}

      {/* Two-column cross-category layout */}
      <div className="flex gap-4 items-start">
        <GroupColumn label={chain.groupALabel} markets={chain.groupA} accent="blue" />

        <div className="shrink-0 mt-6 self-center">
          <ArrowRight className="w-4 h-4 text-white/20" />
        </div>

        <GroupColumn label={chain.groupBLabel} markets={chain.groupB} accent="amber" />
      </div>
    </div>
  );
}

export function EventGroupsTab() {
  const { chains, isLoading, error, refetch, isFetching } = useCausalChains();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-white/50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm text-white/60">Loading 500 markets and building causal chains…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-white/50">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-red-300">Failed to load</p>
          <p className="text-xs text-white/40 mt-1">{String(error)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/20 text-white/70">
          <RefreshCw className="w-3 h-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const totalMoved = chains.reduce(
    (s, c) => s + [...c.groupA, ...c.groupB].filter(m => m.moved).length,
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/60">
            {chains.length} cross-category chain{chains.length !== 1 ? "s" : ""}
          </span>
          {totalMoved > 0 && (
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs border">
              {totalMoved} moved
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-white/50 hover:text-white/80 h-7 text-xs"
        >
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Refresh
        </Button>
      </div>

      {chains.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <p className="text-sm">No cross-category pairs found — markets may be thin right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {chains.map(chain => (
            <CrossChainCard key={chain.theme} chain={chain} />
          ))}
        </div>
      )}
    </div>
  );
}
