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
  avgDaily: number;
  daysAlive: number;
  tradeUrl: string;
  priceChange: number;
  prob: number;
}

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

      // ── Pure math gates — no topic filtering ──────────────────────────────

      // Must have real trading history: 21+ days old for a reliable baseline
      const ts = m.startDate || m.createdAt;
      const daysOld = ts
        ? (Date.now() - new Date(ts).getTime()) / 86400000
        : 0;
      if (daysOld < 21) continue;

      // Must have real money today
      const vol24 = parseFloat(m.volume24hr as any) || 0;
      if (vol24 < 100000) continue;

      // Must have total volume to calculate a meaningful average
      const volTotal = parseFloat((m.volumeClob || m.volume || 0) as any) || 0;
      if (volTotal < 100000) continue;

      // Must be genuinely uncertain — not basically resolved
      const prob = getProb(m);
      if (prob < 0.06 || prob > 0.94) continue;

      // Calculate spike score against historical daily average
      const avgDaily = volTotal / daysOld;
      if (avgDaily < 1000) continue; // skip markets with tiny trading history
      const score = vol24 / avgDaily;
      if (score < 3) continue;

      // Price must move alongside volume — pure volume without price move
      // = single large order, not informed trading
      const priceChange = getPriceChange(m);
      if (Math.abs(priceChange) < 0.03) continue;

      results.push({
        market: m,
        score,
        avgDaily,
        daysAlive: daysOld,
        tradeUrl: getTradeUrl(m),
        priceChange,
        prob,
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
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
            Pure math: any market 21+ days old doing 3× its daily average, with ≥3% price movement today.
            Scans all 500 markets — no category filters.
          </p>
        </div>
      </div>

      {spikedMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p>No genuine volume spikes detected right now.</p>
          <p className="text-xs mt-2 text-muted-foreground/60">
            Requires 3× spike vs 21-day baseline, $100K/24h, ≥3% price move, and 6–94% probability.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {spikedMarkets.map(({ market, score, avgDaily, daysAlive, tradeUrl, priceChange, prob }, i) => {
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
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Avg Daily</span>
                        <span className="font-mono font-bold text-muted-foreground">{formatCurrency(avgDaily)}</span>
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
