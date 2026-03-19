import React, { useMemo, useState } from "react"
import { Search, Activity, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { GammaMarket } from "@/hooks/use-polymarket"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent } from "@/lib/utils"

interface EventGroupsTabProps {
  markets: GammaMarket[];
}

export function EventGroupsTab({ markets }: EventGroupsTabProps) {
  const [search, setSearch] = useState("")

  const groupedMarkets = useMemo(() => {
    const filtered = markets.filter(m => 
      m.question.toLowerCase().includes(search.toLowerCase()) || 
      (m.eventSlug && m.eventSlug.toLowerCase().includes(search.toLowerCase()))
    );

    const groups: Record<string, GammaMarket[]> = {};
    filtered.forEach(m => {
      const slug = m.eventSlug || "Other Markets";
      if (!groups[slug]) groups[slug] = [];
      groups[slug].push(m);
    });

    return Object.entries(groups)
      .sort((a, b) => b[1].reduce((sum, m) => sum + (m.volume || 0), 0) - a[1].reduce((sum, m) => sum + (m.volume || 0), 0));
  }, [markets, search]);

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

      {groupedMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No markets found matching "{search}"
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {groupedMarkets.map(([slug, groupMarkets]) => (
            <Card key={slug} className="flex flex-col h-full bg-card hover:border-primary/30 transition-colors duration-300">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-lg text-primary/90 uppercase tracking-wider text-xs flex justify-between items-center">
                  <span className="truncate mr-2 font-bold">{slug.replace(/-/g, ' ')}</span>
                  <Badge variant="secondary">{groupMarkets.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col space-y-4">
                {groupMarkets.map((market) => {
                  const priceChange = market.priceChange ? parseFloat(market.priceChange.toString()) : 0;
                  const isBigMove = Math.abs(priceChange) >= 0.05;
                  
                  // Parse probability from outcomePrices or fallback to lastTradePrice
                  let prob = market.lastTradePrice || 0;
                  try {
                    const parsed = JSON.parse(market.outcomePrices || "[]");
                    if (parsed.length > 0) prob = parseFloat(parsed[0]);
                  } catch(e) {}

                  return (
                    <div key={market.id} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border/50">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-medium text-sm leading-snug line-clamp-2 text-foreground/90">
                          {market.question}
                        </h4>
                      </div>
                      
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs text-muted-foreground font-mono">
                          Vol: {formatCurrency(market.volume)}
                        </span>
                        
                        {priceChange === 0 ? (
                          <span className="text-[10px] text-warning font-medium flex items-center gap-1">
                            <Clock size={10} /> Hasn't repriced yet
                          </span>
                        ) : isBigMove ? (
                          <Badge variant={priceChange > 0 ? "success" : "destructive"} className="text-[10px] py-0 px-1.5 h-4">
                            {priceChange > 0 ? "+" : ""}{(priceChange * 100).toFixed(1)}% 24h
                          </Badge>
                        ) : (
                          <span className={cn("text-[10px] font-mono", priceChange > 0 ? "text-success" : "text-danger")}>
                            {priceChange > 0 ? "+" : ""}{(priceChange * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Probability Progress Bar */}
                      <div className="relative h-2 bg-background rounded-full overflow-hidden border border-border/30">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${prob * 100}%` }}
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
          ))}
        </div>
      )}
    </div>
  )
}
