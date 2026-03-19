import React, { useMemo, useState } from "react"
import { Search, Clock, TrendingUp, TrendingDown } from "lucide-react"
import { motion } from "framer-motion"
import { GammaEvent } from "@/hooks/use-polymarket"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent } from "@/lib/utils"

interface EventGroupsTabProps {
  events: GammaEvent[];
}

export function EventGroupsTab({ events }: EventGroupsTabProps) {
  const [search, setSearch] = useState("")

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(e =>
      e.title?.toLowerCase().includes(q) ||
      e.slug?.toLowerCase().includes(q) ||
      e.markets?.some(m => m.question?.toLowerCase().includes(q))
    );
  }, [events, search]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
          <Search size={18} />
        </div>
        <Input
          placeholder="Search markets or events..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? `No events found matching "${search}"` : "No active events found."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEvents.map((event, ei) => {
            const markets = (event.markets || []).filter(
              m => m.active !== false && m.closed !== true
            );
            if (markets.length === 0) return null;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ei * 0.04 }}
              >
                <Card className="flex flex-col h-full bg-card hover:border-primary/30 transition-colors duration-300">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <CardTitle className="flex justify-between items-start gap-2">
                      <span className="text-sm font-bold text-primary/90 leading-snug">
                        {event.title || event.slug?.replace(/-/g, " ")}
                      </span>
                      <Badge variant="secondary" className="shrink-0">{markets.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 flex-1 flex flex-col space-y-3">
                    {markets.map((market) => {
                      const lastTrade = market.lastTradePrice || 0;
                      const bestAsk = market.bestAsk || 0;
                      const mktSpread = market.spread || 0;
                      const impliedBid = bestAsk > 0 ? bestAsk - mktSpread : 0;
                      const isLagging = impliedBid > 0 && Math.abs(lastTrade - impliedBid) > 0.03;

                      const priceChange = market.priceChange
                        ? parseFloat(market.priceChange.toString())
                        : 0;
                      const isBigMove = Math.abs(priceChange) >= 0.05;

                      let prob = lastTrade;
                      try {
                        const parsed = JSON.parse(market.outcomePrices || "[]");
                        if (parsed.length > 0) prob = parseFloat(parsed[0]);
                      } catch {}

                      return (
                        <div
                          key={market.id}
                          className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border/50"
                        >
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <h4 className="font-medium text-sm leading-snug line-clamp-2 text-foreground/90">
                              {market.question}
                            </h4>
                          </div>

                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs text-muted-foreground font-mono">
                              Vol: {formatCurrency(market.volume)}
                            </span>

                            {isLagging ? (
                              <span className="text-[10px] text-orange-400 font-medium flex items-center gap-1">
                                <Clock size={10} /> Lagging
                              </span>
                            ) : isBigMove ? (
                              <Badge
                                variant={priceChange > 0 ? "success" : "destructive"}
                                className="text-[10px] py-0 px-1.5 h-4 flex items-center gap-0.5"
                              >
                                {priceChange > 0
                                  ? <TrendingUp size={9} />
                                  : <TrendingDown size={9} />}
                                {priceChange > 0 ? "+" : ""}{(priceChange * 100).toFixed(1)}% 24h
                              </Badge>
                            ) : priceChange === 0 ? (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock size={10} /> Unchanged
                              </span>
                            ) : (
                              <span className={`text-[10px] font-mono ${priceChange > 0 ? "text-green-400" : "text-red-400"}`}>
                                {priceChange > 0 ? "+" : ""}{(priceChange * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>

                          <div className="relative h-2 bg-background rounded-full overflow-hidden border border-border/30">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, prob * 100)}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="absolute top-0 left-0 h-full bg-primary"
                            />
                          </div>
                          <div className="mt-1 flex justify-end">
                            <span className="text-xs font-mono font-bold text-primary">
                              {formatPercent(prob)} YES
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
