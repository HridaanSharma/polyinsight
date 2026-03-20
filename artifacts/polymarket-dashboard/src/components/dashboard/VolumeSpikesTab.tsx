import React, { useMemo } from "react"
import { AlertTriangle, TrendingUp, TrendingDown, ExternalLink } from "lucide-react"
import { motion } from "framer-motion"
import { GammaMarket } from "@/hooks/use-polymarket"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatPercent } from "@/lib/utils"

interface VolumeSpikesTabProps {
  markets: GammaMarket[];
}

interface SpikeData {
  market: GammaMarket;
  score: number;
  daysAlive: number;
  tradeUrl: string;
  priceChange: number;
  prob: number;
}

// Sports / entertainment markets — volume doesn't carry information signal
const SKIP_KEYWORDS = [
  " vs ", " vs. ", " @ ", "tweets", "tweet",
  "o/u ", "over/under", "win on 2026", "win on 2025",
  "drivers champion", "eurovision", "ncaa tournament",
  "-0.5", "-1.5", "-2.5",
  "super bowl", "stanley cup", "world series", "nba finals", "march madness",
];

// Local/obscure elections — no insider info is plausible, single whale = spike
const OBSCURE_KEYWORDS = [
  "la paz", "mayoral", "municipal", "provincial",
  "steyer", "city council", "local election",
  "parish", "borough", "alderman", "aldermanic",
  "ward election", "school board",
];

function getTradeUrl(m: GammaMarket): string {
  const eventSlug = m.events?.[0]?.slug;
  if (eventSlug) return "https://polymarket.com/event/" + eventSlug;
  return "https://polymarket.com/event/" + m.slug;
}

function getPriceChange(m: GammaMarket): number {
  return parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
}

function getProb(m: GammaMarket): number {
  try {
    const parsed = JSON.parse(m.outcomePrices || "[]");
    if (parsed.length > 0) return parseFloat(parsed[0]);
  } catch {}
  return m.lastTradePrice || 0.5;
}

export function VolumeSpikesTab({ markets }: VolumeSpikesTabProps) {
  const spikedMarkets = useMemo((): SpikeData[] => {
    const results: SpikeData[] = [];

    for (const m of markets) {
      if (m.active === false || m.closed === true) continue;

      const q = (m.question || "").toLowerCase();

      // Skip sports / entertainment
      if (SKIP_KEYWORDS.some(kw => q.includes(kw))) continue;

      // Skip obscure local elections — can't have informed trading
      if (OBSCURE_KEYWORDS.some(kw => q.includes(kw))) continue;

      // Genuine uncertainty: 8–88%
      const prob = getProb(m);
      if (prob < 0.08 || prob > 0.88) continue;

      // ── Key new gate: price must move ≥3% alongside volume ──────────────────
      // Volume without price movement = single large order, not informed trading
      const priceChange = getPriceChange(m);
      if (Math.abs(priceChange) < 0.03) continue;

      const vol24 = parseFloat(m.volume24hr as any) || 0;
      const volTotal = parseFloat((m.volumeClob || m.volume || 0) as any) || 0;

      // Minimum $200K today
      if (vol24 < 200000) continue;

      // Need a baseline: market must be at least 7 days old
      const ts = m.startDate || m.createdAt;
      const daysOld = ts
        ? (Date.now() - new Date(ts).getTime()) / 86400000
        : 0;
      if (daysOld < 7) continue;

      const avgDaily = volTotal / Math.max(daysOld, 1);
      if (avgDaily <= 0) continue;

      const score = vol24 / avgDaily;
      if (score < 4) continue;

      results.push({ market: m, score, daysAlive: daysOld, tradeUrl: getTradeUrl(m), priceChange, prob });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 15);
  }, [markets]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex items-center gap-3 mb-8 bg-red-500/10 text-red-400 p-4 rounded-xl border border-red-500/20">
        <div className="bg-red-500/20 p-2 rounded-full">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <div>
          <h3 className="font-bold text-lg leading-none mb-1">Unusual Activity Detected</h3>
          <p className="text-sm text-red-400/80">
            Markets where 24h volume is 4× their daily average AND price moved ≥3% — both signals together
            suggest informed trading, not a single whale.
          </p>
        </div>
      </div>

      {spikedMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p>No genuine volume spikes detected right now.</p>
          <p className="text-xs mt-2 text-muted-foreground/60">
            Requires 4× spike, $200K/24h, ≥3% price move, market age &gt;7 days, and 8–88% probability.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {spikedMarkets.map(({ market, score, daysAlive, tradeUrl, priceChange, prob }, i) => {
            const pctChange = priceChange * 100;
            const isUp = pctChange > 0;

            return (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-border/50 hover:border-red-500/30 transition-colors">
                  <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="destructive" className="animate-pulse">
                          🚨 {score.toFixed(1)}× spike
                        </Badge>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded ${
                            isUp
                              ? "bg-green-500/15 text-green-400 border border-green-500/25"
                              : "bg-red-500/15 text-red-400 border border-red-500/25"
                          }`}
                        >
                          {isUp
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />
                          }
                          {isUp ? "+" : ""}{pctChange.toFixed(1)}% today
                        </span>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                          {Math.floor(daysAlive)}d old
                        </span>
                      </div>
                      <h4 className="text-base font-medium">{market.question}</h4>
                    </div>

                    <div className="flex gap-4 w-full md:w-auto bg-background/50 p-4 rounded-xl border border-border/30 flex-wrap">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">24h Vol</span>
                        <span className="font-mono font-bold">{formatCurrency(market.volume24hr)}</span>
                      </div>
                      <div className="w-px bg-border/50" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Vol</span>
                        <span className="font-mono font-bold">{formatCurrency(market.volumeClob || market.volume)}</span>
                      </div>
                      <div className="w-px bg-border/50" />
                      <div className="flex flex-col min-w-[80px]">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Probability</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{formatPercent(prob)}</span>
                          <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, prob * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="w-px bg-border/50" />
                      <a
                        href={tradeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="self-center flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Trade
                      </a>
                    </div>

                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
