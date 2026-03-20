import React, { useMemo, useState } from "react"
import { Search, Clock, TrendingUp, TrendingDown, AlertCircle } from "lucide-react"
import { motion } from "framer-motion"
import { GammaEvent, GammaMarket } from "@/hooks/use-polymarket"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent, cn } from "@/lib/utils"

interface EventGroupsTabProps {
  events: GammaEvent[];
}

function getYesPrice(market: GammaMarket): number {
  try {
    const parsed = JSON.parse(market.outcomePrices || "[]");
    if (parsed.length > 0) return parseFloat(parsed[0]);
  } catch { /* ignore */ }
  return market.lastTradePrice ?? 0;
}

function isValuableGroup(event: GammaEvent): boolean {
  const markets = (event.markets || []).filter(m => m.active !== false && m.closed !== true);
  if (!markets || markets.length < 2) return false;

  // Filter 1: Skip events dominated by sports micro-markets (spreads, O/U lines)
  const sportsMicro = markets.filter(m => {
    const q = m.question?.toLowerCase() ?? "";
    return (
      q.includes("o/u") ||
      q.includes("over/under") ||
      q.includes("-0.5") ||
      q.includes("-1.5") ||
      q.includes("-2.5") ||
      q.includes("spread:")
    );
  });
  if (sportsMicro.length / markets.length > 0.3) return false;

  // Filter 2: Skip pure winner markets
  const allWinner = markets.every(m => {
    const q = m.question?.toLowerCase() ?? "";
    return (
      q.includes("win the") ||
      q.includes("finish 1st") ||
      q.includes("win the championship") ||
      q.includes("win the series")
    );
  });
  if (allWinner) return false;

  // Filter 3: At least 2 genuinely uncertain markets (10–90%)
  const uncertainCount = markets.filter(m => {
    try {
      const prices = JSON.parse(m.outcomePrices || '["0.5","0.5"]');
      const yes = parseFloat(prices[0]);
      return yes > 0.10 && yes < 0.90;
    } catch { return false; }
  }).length;
  if (uncertainCount < 2) return false;

  // Filter 4: Meaningful group volume
  const totalVol = markets.reduce((s, m) => s + parseFloat((m.volume24hr as any) || 0), 0);
  if (totalVol < 50000) return false;

  // Filter 5: Skip single-game events (they're already obvious on Polymarket)
  const title = (event.title ?? "").toLowerCase();
  if (title.includes(" vs ") || title.includes(" vs. ") || title.includes(" @ ")) return false;

  return true;
}


export function EventGroupsTab({ events }: EventGroupsTabProps) {
  const [search, setSearch] = useState("");

  const valuableEvents = useMemo(() => {
    return events
      .filter(isValuableGroup)
      .sort((a, b) => {
        const volA = (a.markets || []).reduce((s, m) => s + parseFloat((m.volume24hr as any) || 0), 0);
        const volB = (b.markets || []).reduce((s, m) => s + parseFloat((m.volume24hr as any) || 0), 0);
        return volB - volA;
      });
  }, [events]);

  const filtered = useMemo(() => {
    if (!search.trim()) return valuableEvents;
    const q = search.toLowerCase();
    return valuableEvents.filter(e =>
      e.title?.toLowerCase().includes(q) ||
      e.slug?.toLowerCase().includes(q) ||
      e.markets?.some(m => m.question?.toLowerCase().includes(q))
    );
  }, [valuableEvents, search]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <Search size={18} />
          </div>
          <Input
            placeholder="Search events..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono shrink-0">
          {valuableEvents.length} multi-question event{valuableEvents.length !== 1 ? "s" : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? `No events found matching "${search}"` : "No qualifying events found."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((event, ei) => {
            const markets = (event.markets || []).filter(
              m => m.active !== false && m.closed !== true
            );
            const totalVol = markets.reduce(
              (s, m) => s + parseFloat((m.volume24hr as any) || 0), 0
            );

            // Detect which markets haven't repriced while at least one sibling moved
            const hasAnyMove = markets.some(m => Math.abs(parseFloat((m.priceChange as any) || 0)) >= 0.03);
            const staleMktIds = new Set(
              hasAnyMove
                ? markets
                    .filter(m => Math.abs(parseFloat((m.priceChange as any) || 0)) < 0.005)
                    .map(m => m.id)
                : []
            );

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
                      <span className="text-sm font-bold text-primary/90 leading-snug flex-1">
                        {event.title || event.slug?.replace(/-/g, " ")}
                      </span>
                      <Badge variant="secondary" className="shrink-0">{markets.length}</Badge>
                    </CardTitle>

                    <div className="mt-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        Vol 24h: {formatCurrency(totalVol)}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 flex-1 flex flex-col space-y-3">
                    {markets.map(market => {
                      const prob = getYesPrice(market);
                      const priceChange = parseFloat((market.priceChange as any) || 0);
                      const isBigMove = Math.abs(priceChange) >= 0.05;
                      const isStale = staleMktIds.has(market.id);

                      return (
                        <div
                          key={market.id}
                          className={cn(
                            "p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors border",
                            isStale
                              ? "border-orange-500/30 bg-orange-500/5"
                              : "border-transparent hover:border-border/50"
                          )}
                        >
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <h4 className="font-medium text-sm leading-snug line-clamp-2 text-foreground/90">
                              {market.question}
                            </h4>
                          </div>

                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs text-muted-foreground font-mono">
                              Vol: {formatCurrency(market.volume24hr)}
                            </span>

                            {isStale && hasAnyMove ? (
                              <span className="text-[10px] text-orange-400 font-semibold flex items-center gap-1">
                                <AlertCircle size={10} /> Hasn't repriced
                              </span>
                            ) : isBigMove ? (
                              <Badge
                                variant={priceChange > 0 ? "success" : "destructive"}
                                className="text-[10px] py-0 px-1.5 h-4 flex items-center gap-0.5"
                              >
                                {priceChange > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                {priceChange > 0 ? "+" : ""}{(priceChange * 100).toFixed(1)}% 24h
                              </Badge>
                            ) : priceChange === 0 ? (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock size={10} /> Unchanged
                              </span>
                            ) : (
                              <span className={cn("text-[10px] font-mono", priceChange > 0 ? "text-green-400" : "text-red-400")}>
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
