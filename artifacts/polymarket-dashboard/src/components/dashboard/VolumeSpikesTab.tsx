import React, { useMemo } from "react"
import { AlertTriangle, TrendingUp } from "lucide-react"
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
}

export function VolumeSpikesTab({ markets }: VolumeSpikesTabProps) {
  const spikedMarkets = useMemo(() => {
    const activeMarkets = markets.filter(m => m.active !== false && m.closed !== true);

    const data: SpikeData[] = activeMarkets.map(market => {
      const daysSinceCreation = Math.max(
        1,
        (Date.now() - new Date(market.createdAt).getTime()) / 86400000
      );
      const avgDailyVolume = (market.volumeClob || 0) / daysSinceCreation;
      const score = avgDailyVolume > 0 ? (market.volume24hr || 0) / avgDailyVolume : 0;
      return { market, score, daysAlive: daysSinceCreation };
    });

    return data
      .filter(d => d.score > 5)
      .sort((a, b) => b.score - a.score);
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
            Markets where 24h volume is 5× or more than the historical daily average.
          </p>
        </div>
      </div>

      {spikedMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p>No unusual volume spikes detected right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {spikedMarkets.map(({ market, score, daysAlive }, i) => {
            let prob = market.lastTradePrice || 0;
            try {
              const parsed = JSON.parse(market.outcomePrices || "[]");
              if (parsed.length > 0) prob = parseFloat(parsed[0]);
            } catch {}

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
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="destructive" className="animate-pulse">
                          🚨 {score.toFixed(1)}× spike
                        </Badge>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                          {daysAlive.toFixed(0)}d old
                        </span>
                      </div>
                      <h4 className="text-base font-medium">{market.question}</h4>
                    </div>

                    <div className="flex gap-6 w-full md:w-auto bg-background/50 p-4 rounded-xl border border-border/30">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">24h Vol</span>
                        <span className="font-mono font-bold">{formatCurrency(market.volume24hr)}</span>
                      </div>
                      <div className="w-px bg-border/50" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Vol</span>
                        <span className="font-mono font-bold">{formatCurrency(market.volumeClob)}</span>
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
