import React, { useMemo, useState } from "react"
import { Search, AlertTriangle, TrendingUp, TrendingDown, Link2 } from "lucide-react"
import { motion } from "framer-motion"
import { CorrelationGroup, CorrelatedMarket } from "@/hooks/use-polymarket"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent, cn } from "@/lib/utils"

interface EventGroupsTabProps {
  groups: CorrelationGroup[];
}

function getYesPrice(outcomePrices: string): number {
  try {
    const parsed = JSON.parse(outcomePrices || "[]");
    if (parsed.length > 0) return parseFloat(parsed[0]);
  } catch { /* ignore */ }
  return 0.5;
}

function PriceChangeBadge({ change }: { change: number }) {
  if (Math.abs(change) < 0.005) return null;
  const pct = (change * 100).toFixed(1);
  const up = change > 0;
  return (
    <span className={cn(
      "text-[10px] font-mono font-semibold flex items-center gap-0.5",
      up ? "text-green-400" : "text-red-400"
    )}>
      {up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

function CorrelatedMarketRow({ item, isMispriced }: { item: CorrelatedMarket; isMispriced: boolean }) {
  const prob = getYesPrice(item.market.outcomePrices);
  const change = parseFloat((item.market.oneDayPriceChange as any) || 0);

  return (
    <div className={cn(
      "p-3 rounded-lg border transition-colors",
      isMispriced
        ? "bg-orange-500/5 border-orange-500/25 hover:bg-orange-500/10"
        : "bg-secondary/20 border-transparent hover:bg-secondary/50"
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground/90 leading-snug line-clamp-2">
            {item.market.question}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {item.eventTitle}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-mono font-bold text-primary">{formatPercent(prob)}</span>
          <PriceChangeBadge change={change} />
        </div>
      </div>

      {isMispriced && (
        <div className="flex items-center gap-1 text-[10px] text-orange-400 font-semibold mt-1">
          <AlertTriangle size={9} />
          Lagging — hasn't repriced
        </div>
      )}

      <div className="mt-2 relative h-1.5 bg-background rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, prob * 100)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute top-0 left-0 h-full bg-primary rounded-full"
        />
      </div>
    </div>
  );
}

export function EventGroupsTab({ groups }: EventGroupsTabProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g =>
      g.tag.toLowerCase().includes(q) ||
      g.markets.some(m =>
        m.market.question?.toLowerCase().includes(q) ||
        m.eventTitle?.toLowerCase().includes(q)
      )
    );
  }, [groups, search]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <Search size={18} />
          </div>
          <Input
            placeholder="Search tags or questions..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono shrink-0">
          {groups.length} cross-event correlation{groups.length !== 1 ? "s" : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? `No correlations found for "${search}"` : "No qualifying correlations found."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((group, gi) => {
            const uniqueEvents = new Set(group.markets.map(m => m.eventSlug));

            const mispricedMarkets = group.hasMispricing
              ? new Set(
                  group.markets
                    .filter(a => {
                      const aChange = Math.abs(parseFloat((a.market.oneDayPriceChange as any) || 0));
                      return aChange < 0.01 && group.markets.some(b => {
                        if (b.eventSlug === a.eventSlug) return false;
                        return Math.abs(parseFloat((b.market.oneDayPriceChange as any) || 0)) >= 0.05;
                      });
                    })
                    .map(m => m.market.id)
                )
              : new Set<string>();

            return (
              <motion.div
                key={group.tag}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.04 }}
              >
                <Card className={cn(
                  "flex flex-col h-full transition-colors duration-300",
                  group.hasMispricing
                    ? "border-orange-500/30 bg-card hover:border-orange-500/50"
                    : "bg-card hover:border-primary/30"
                )}>
                  <CardHeader className="pb-3 border-b border-border/50">
                    <CardTitle className="flex justify-between items-start gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-primary/90 leading-snug">
                        <Link2 size={14} className="shrink-0" />
                        {group.tag}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {group.hasMispricing && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] py-0 px-1.5">
                            ⚠ Mispricing
                          </Badge>
                        )}
                        <Badge variant="secondary">{uniqueEvents.size} events</Badge>
                      </div>
                    </CardTitle>

                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground font-mono">
                      <span>{group.markets.length} markets</span>
                      <span>·</span>
                      <span>Vol 24h: {formatCurrency(group.totalVol)}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 flex-1 flex flex-col gap-3">
                    {group.markets.map(item => (
                      <CorrelatedMarketRow
                        key={item.market.id}
                        item={item}
                        isMispriced={mispricedMarkets.has(item.market.id)}
                      />
                    ))}
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
