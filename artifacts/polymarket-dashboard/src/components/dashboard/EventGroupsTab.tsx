import React, { useMemo, useState } from "react"
import { Search, Clock, TrendingUp, TrendingDown, Link2 } from "lucide-react"
import { motion } from "framer-motion"
import { GammaMarket } from "@/hooks/use-polymarket"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent } from "@/lib/utils"

interface EventGroupsTabProps {
  markets: GammaMarket[];
}

const STOP_WORDS = new Set([
  "will","that","this","from","with","have","does","what","when","where",
  "which","their","there","would","could","should","about","than","then",
  "them","they","more","some","also","been","into","your","just","only",
  "over","like","make","most","both","after","before","these","those",
  "other","each","much","very","such","even","many","same","well","still",
  "while","since","until","under","through","between","during","without",
  "within","against","first","second","third","total","market","price",
  "times","years","months","weeks","elect","election","votes","next",
  "last","wins","winner","percent","rates","january","february","march",
  "april","june","july","august","september","october","november","december",
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
  "point","score","game","match","round","season","world","title",
  "level","right","state","party","three","number","result","presidential",
  "nomination","candidate","reach","above","below","least","least","least",
]);

function extractKeywords(question: string): Set<string> {
  const lower = question.toLowerCase().replace(/[^a-z\s]/g, " ");
  const base = lower.split(/\s+/).filter(w => w.length >= 5 && !STOP_WORDS.has(w));
  // Proper nouns from original (capitalized words in source text, length >= 4)
  const proper = (question.match(/\b[A-Z][a-z]{3,}\b/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => !STOP_WORDS.has(w));
  return new Set([...base, ...proper]);
}

interface TopicCluster {
  label: string;
  keywords: string[];
  markets: GammaMarket[];
  totalVolume: number;
}

function clusterByKeywords(markets: GammaMarket[]): TopicCluster[] {
  const marketKws = new Map<string, Set<string>>();
  for (const m of markets) {
    marketKws.set(m.id, extractKeywords(m.question || ""));
  }

  // Union-Find
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const m of markets) { parent.set(m.id, m.id); rank.set(m.id, 0); }

  function find(id: string): string {
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if ((rank.get(ra) ?? 0) < (rank.get(rb) ?? 0)) parent.set(ra, rb);
    else if ((rank.get(ra) ?? 0) > (rank.get(rb) ?? 0)) parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, (rank.get(ra) ?? 0) + 1); }
  }

  // Only merge markets from DIFFERENT event slugs that share 2+ keywords
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const a = markets[i], b = markets[j];
      const evA = a.events?.[0]?.slug ?? a.slug;
      const evB = b.events?.[0]?.slug ?? b.slug;
      if (evA === evB) continue;

      const kwsA = marketKws.get(a.id)!;
      const kwsB = marketKws.get(b.id)!;
      let shared = 0;
      for (const kw of kwsA) {
        if (kwsB.has(kw)) { shared++; if (shared >= 2) break; }
      }
      if (shared >= 2) union(a.id, b.id);
    }
  }

  // Group markets by cluster root
  const groups = new Map<string, GammaMarket[]>();
  for (const m of markets) {
    const root = find(m.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(m);
  }

  const result: TopicCluster[] = [];
  for (const [, grpMarkets] of groups) {
    const eventSlugs = new Set(grpMarkets.map(m => m.events?.[0]?.slug ?? m.slug));
    if (eventSlugs.size < 2 || grpMarkets.length < 2) continue;

    // Rank keywords by frequency across group members
    const kwFreq = new Map<string, number>();
    for (const m of grpMarkets) {
      for (const kw of marketKws.get(m.id)!) {
        kwFreq.set(kw, (kwFreq.get(kw) ?? 0) + 1);
      }
    }
    const topKws = [...kwFreq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([kw]) => kw.charAt(0).toUpperCase() + kw.slice(1));

    const label = topKws.join(" ") || "Related Markets";
    const totalVolume = grpMarkets.reduce((s, m) => s + (m.volume24hr ?? 0), 0);

    result.push({
      label,
      keywords: topKws,
      markets: grpMarkets.sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0)),
      totalVolume,
    });
  }

  return result.sort((a, b) => b.totalVolume - a.totalVolume);
}

export function EventGroupsTab({ markets }: EventGroupsTabProps) {
  const [search, setSearch] = useState("");

  const clusters = useMemo(() => clusterByKeywords(markets), [markets]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clusters;
    const q = search.toLowerCase();
    return clusters.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.keywords.some(kw => kw.toLowerCase().includes(q)) ||
      c.markets.some(m => m.question?.toLowerCase().includes(q))
    );
  }, [clusters, search]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <Search size={18} />
          </div>
          <Input
            placeholder="Search topic clusters..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono shrink-0">
          {clusters.length} cross-event theme{clusters.length !== 1 ? "s" : ""} detected
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search
            ? `No clusters found matching "${search}"`
            : "No cross-event theme clusters found in current data."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((cluster, ci) => (
            <motion.div
              key={cluster.label + ci}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.05 }}
            >
              <Card className="flex flex-col h-full bg-card hover:border-primary/30 transition-colors duration-300">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Link2 size={12} className="text-primary/60 shrink-0" />
                        <span className="text-[10px] text-primary/60 font-mono uppercase tracking-wider">
                          Cross-Event Cluster
                        </span>
                      </div>
                      <span className="text-sm font-bold text-primary/90 leading-snug block">
                        {cluster.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {cluster.markets.length}
                    </Badge>
                  </CardTitle>
                  <div className="text-xs text-muted-foreground font-mono mt-1">
                    Vol 24h: {formatCurrency(cluster.totalVolume)}
                  </div>
                </CardHeader>

                <CardContent className="pt-4 flex-1 flex flex-col space-y-3">
                  {cluster.markets.map((market) => {
                    const lastTrade = market.lastTradePrice ?? 0;
                    const bestAsk = market.bestAsk ?? 0;
                    const mktSpread = market.spread ?? 0;
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
                    } catch { /* ignore */ }

                    const evSlug = market.events?.[0]?.slug ?? market.slug;

                    return (
                      <div
                        key={market.id}
                        className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border/50"
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <h4 className="font-medium text-sm leading-snug line-clamp-2 text-foreground/90">
                            {market.question}
                          </h4>
                        </div>
                        <div className="mb-2">
                          <span className="text-[10px] font-mono text-muted-foreground/60 truncate block">
                            {evSlug?.replace(/-/g, " ")}
                          </span>
                        </div>

                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs text-muted-foreground font-mono">
                            Vol: {formatCurrency(market.volume24hr)}
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
                              {priceChange > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
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
          ))}
        </div>
      )}
    </div>
  );
}
