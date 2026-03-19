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
    const data: SpikeData[] = markets.map(market => {
      const createdAt = new Date(market.createdAt).getTime();
      const now = Date.now();
      const daysAlive = Math.max(1, (now - createdAt) / (1000 * 60 * 60 * 24));
      
      const avgDailyVolume = (market.volumeClob || 0) / daysAlive;
      const score = avgDailyVolume > 0 ? (market.volume24hr || 0) / avgDailyVolume : 0;
      
      return { market, score, daysAlive };
    });

    return data
      .filter(d => d.score > 5) // Flag unusual activity > 5x avg volume
      .sort((a, b) => b.score - a.score);
  }, [markets]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex items-center gap-3 mb-8 bg-danger/10 text-danger p-4 rounded-xl border border-danger/20">
        <div className="bg-danger/20 p-2 rounded-full">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <div>
          <h3 className="font-bold text-lg leading-none mb-1">Unusual Activity Detected</h3>
          <p className="text-sm text-danger/80">Markets where 24h volume is at least 5x the historical daily average.</p>
        </div>
      </div>

      {spikedMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p>No unusual volume spikes right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {spikedMarkets.map(({ market, score, daysAlive }, i) => {
            let prob = market.lastTradePrice || 0;
            try {
              const parsed = JSON.parse(market.outcomePrices || "[]");
              if (parsed.length > 0) prob = parseFloat(parsed[0]);
            } catch(e) {}

            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={market.id}
              >
                <Card className="hover:border-danger/40 transition-colors border-border/50">
                  <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="destructive" className="animate-pulse">🚨 Spike: {score.toFixed(1)}x</Badge>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                          {market.eventSlug || "Market"}
                        </span>
                      </div>
                      <h4 className="text-lg font-medium">{market.question}</h4>
                    </div>

                    <div className="flex gap-8 w-full md:w-auto bg-background/50 p-4 rounded-xl border border-border/30">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">24h Vol</span>
                        <span className="font-mono font-bold text-foreground">{formatCurrency(market.volume24hr)}</span>
                      </div>
                      <div className="w-px bg-border/50" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Vol</span>
                        <span className="font-mono font-bold text-foreground">{formatCurrency(market.volumeClob)}</span>
                      </div>
                      <div className="w-px bg-border/50" />
                      <div className="flex flex-col min-w-[80px]">
                        <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Probability</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{formatPercent(prob)}</span>
                          <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${prob * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
