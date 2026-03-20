import { useCorrelationPairs, type CorrelationPair } from "@/hooks/use-polymarket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, RefreshCw, Loader2, Link2, TrendingUp, TrendingDown } from "lucide-react";

function pctStr(p: number) {
  return `${(p * 100).toFixed(1)}%`;
}

function directionLabel(dir: string, side: 1 | 2): string {
  if (dir === "market1_underpriced" && side === 1) return "Underpriced?";
  if (dir === "market1_overpriced" && side === 1) return "Overpriced?";
  if (dir === "market2_underpriced" && side === 2) return "Underpriced?";
  if (dir === "market2_overpriced" && side === 2) return "Overpriced?";
  return "";
}

function PairCard({ pair }: { pair: CorrelationPair }) {
  const m1Label = directionLabel(pair.direction, 1);
  const m2Label = directionLabel(pair.direction, 2);
  const flagged1 = pair.direction.includes("market1");
  const flagged2 = pair.direction.includes("market2");

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3 hover:bg-white/[0.08] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-blue-400">
          <Link2 className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide">Possible Mispricing</span>
        </div>
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
      </div>

      <div className="flex flex-col gap-2">
        {/* Market 1 */}
        <div className={`rounded-lg p-3 flex items-start justify-between gap-3 ${flagged1 ? "bg-yellow-400/10 border border-yellow-400/20" : "bg-white/5"}`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/90 leading-snug">{pair.market1.question}</p>
            {m1Label && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-yellow-400 font-semibold">
                <TrendingUp className="w-3 h-3" /> {m1Label}
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-white tabular-nums">{pctStr(pair.market1.probability)}</div>
            <div className="text-xs text-white/40">YES</div>
          </div>
        </div>

        {/* Market 2 */}
        <div className={`rounded-lg p-3 flex items-start justify-between gap-3 ${flagged2 ? "bg-yellow-400/10 border border-yellow-400/20" : "bg-white/5"}`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/90 leading-snug">{pair.market2.question}</p>
            {m2Label && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-yellow-400 font-semibold">
                <TrendingDown className="w-3 h-3" /> {m2Label}
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-white tabular-nums">{pctStr(pair.market2.probability)}</div>
            <div className="text-xs text-white/40">YES</div>
          </div>
        </div>
      </div>

      {/* Relationship */}
      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
        <p className="text-xs text-blue-300 leading-relaxed">
          <span className="font-semibold text-blue-200">Link: </span>
          {pair.relationship}
        </p>
      </div>

      {/* Inconsistency */}
      <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
        <p className="text-xs text-yellow-200 leading-relaxed">
          <span className="font-semibold">⚠ </span>
          {pair.inconsistency}
        </p>
      </div>

      {/* Trade buttons */}
      <div className="flex gap-2 mt-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs border-white/15 bg-white/5 hover:bg-white/10 text-white/70"
          onClick={() => window.open(`https://polymarket.com/event/${pair.market1.eventSlug}`, "_blank")}
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          Trade 1
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs border-white/15 bg-white/5 hover:bg-white/10 text-white/70"
          onClick={() => window.open(`https://polymarket.com/event/${pair.market2.eventSlug}`, "_blank")}
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          Trade 2
        </Button>
      </div>
    </div>
  );
}

export function EventGroupsTab() {
  const { data: pairs, isLoading, error, refetch, isFetching } = useCorrelationPairs();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-white/50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-white/70">Analyzing 150 markets with Claude AI…</p>
          <p className="text-xs text-white/40 mt-1">Finding cross-event logical inconsistencies. This takes ~15 seconds.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-white/50">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-red-300">Analysis failed</p>
          <p className="text-xs text-white/40 mt-1">{String(error)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/20 text-white/70">
          <RefreshCw className="w-3 h-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const validPairs = pairs ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/60">
            {validPairs.length} cross-event inconsistenc{validPairs.length === 1 ? "y" : "ies"} found
          </span>
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
            Claude AI
          </Badge>
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

      {validPairs.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <p className="text-sm">No significant inconsistencies detected right now.</p>
          <p className="text-xs mt-1">Markets may be efficiently priced, or try refreshing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {validPairs.map((pair, i) => (
            <PairCard key={`${pair.market1.slug}-${pair.market2.slug}-${i}`} pair={pair} />
          ))}
        </div>
      )}
    </div>
  );
}
