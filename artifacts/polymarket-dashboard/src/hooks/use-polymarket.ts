import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  url?: string;
  endDate: string;
  startDate?: string;
  volume: number;
  volume24hr: number;
  volumeClob: number;
  createdAt: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string | string[];
  outcomePrices: string;
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  oneDayPriceChange?: number;
  priceChange?: number;
  eventSlug?: string;
  groupItemTitle?: string;
  events?: Array<{ id: string; slug: string; title?: string }>;
}

export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  markets: GammaMarket[];
  tags?: Array<{ id: string; label: string; slug: string }>;
}

export interface SpreadData {
  market: GammaMarket;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

export interface ChainMarket extends GammaMarket {
  probability: number;
  moved: boolean;
  moveDirection: "up" | "down" | "flat";
  tradeUrl: string;
}

export interface CrossChain {
  theme: string;
  description: string;
  emoji: string;
  groupALabel: string;
  groupBLabel: string;
  groupA: ChainMarket[];
  groupB: ChainMarket[];
  totalVolume: number;
  source?: "keyword" | "ai";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function parseClobTokenId(raw: string | string[]): string | null {
  try {
    if (Array.isArray(raw)) return raw[0] ?? null;
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  } catch {
    return null;
  }
}

// Use the event slug (not the market slug) for correct Polymarket URLs
function getTradeUrl(m: GammaMarket): string {
  const eventSlug = m.events?.[0]?.slug;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return `https://polymarket.com/event/${m.slug}`;
}

// ── Filter & enrich a single market ──────────────────────────────────────────
function enrichMarket(m: GammaMarket): ChainMarket | null {
  try {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    if (yes <= 0.04 || yes >= 0.96) return null;
    if (parseFloat(m.volume24hr as any) < 5000) return null;
    const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any);
    return {
      ...m,
      probability: yes,
      moved: Math.abs(change) > 0.03,
      moveDirection: change > 0.03 ? "up" : change < -0.03 ? "down" : "flat",
      tradeUrl: getTradeUrl(m),
    };
  } catch {
    return null;
  }
}

// ── Fetch 500 markets from Gamma ─────────────────────────────────────────────
async function fetchAllMarkets(): Promise<GammaMarket[]> {
  const pages = await Promise.all(
    [0, 100, 200, 300, 400].map(offset =>
      fetch(
        `${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`
      ).then(r => (r.ok ? r.json() : []))
    )
  );
  return (pages.flat() as GammaMarket[]).filter(m => m.active === true && m.closed === false);
}

// ── Shared 500-market query (5 min refetch) ──────────────────────────────────
export function useAllMarkets() {
  return useQuery({
    queryKey: ["all-markets"],
    queryFn: fetchAllMarkets,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
}

// ── Build single Claude prompt — all 200 markets, compressed pipe format ──────
function buildChainPrompt(markets: GammaMarket[]): string {
  const lines = markets.map((m, i) => {
    const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
    const vol = parseFloat(m.volume24hr as any) || 0;
    const change = parseFloat((m.oneDayPriceChange ?? m.priceChange ?? 0) as any) || 0;
    const dir = change > 0.03 ? "\u25b2" : change < -0.03 ? "\u25bc" : "=";
    return `${i}|${m.question}|${(yes * 100).toFixed(0)}%|$${(vol / 1000).toFixed(0)}K|${dir}`;
  });
  const marketList = lines.join("\n");
  const maxIdx = markets.length - 1;

  return (
    `You are a senior macro trader analyzing ALL active Polymarket prediction markets.\n` +
    `\n` +
    `Format: index|question|probability|24h_volume|price_direction (\u25b2=up >3%, \u25bc=down >3%, ==flat)\n` +
    `\n` +
    `Here are all ${markets.length} active markets right now:\n` +
    `${marketList}\n` +
    `\n` +
    `Find 15-20 groups where markets from COMPLETELY DIFFERENT topics are causally connected in the real world. A trader betting on one should ALSO check the other.\n` +
    `\n` +
    `=== VALID CAUSAL CHAINS ===\n` +
    `\n` +
    `CONFLICT \u2192 COMMODITY (direct supply disruption):\n` +
    `- "US invades Iran" + "Crude oil hits $100" \u2192 Hormuz disruption spikes oil\n` +
    `- "Iran ceasefire" + "Crude oil drops" \u2192 ceasefire removes risk premium\n` +
    `- "Ukraine ceasefire" + "European gas prices drop" \u2192 pipelines reopen\n` +
    `- "Russia attacks NATO" + "Gold hits $3000" \u2192 war = flight to safety\n` +
    `\n` +
    `MONETARY POLICY \u2192 RISK ASSETS (direct rate mechanism):\n` +
    `- "Fed holds rates" + "Bitcoin dips" \u2192 high rates = risk off = crypto sells\n` +
    `- "Fed cuts rates" + "Bitcoin rallies" \u2192 rate cuts = risk on\n` +
    `- "Fed holds rates" + "S&P500 drops" \u2192 tight policy pressures equities\n` +
    `- "Inflation stays high" + "Fed cuts rates" \u2192 logically inconsistent pair\n` +
    `\n` +
    `POLITICS \u2192 POLICY (direct legislative path):\n` +
    `- "Democrats win Senate" + "Climate bill passes" \u2192 need Senate majority\n` +
    `- "Republicans win House" + "Tax cuts extended" \u2192 house controls budget\n` +
    `- "Trump wins" + "US leaves Paris Agreement" \u2192 direct executive action\n` +
    `\n` +
    `TRADE POLICY \u2192 ECONOMICS (direct trade impact):\n` +
    `- "Trump tariffs on China" + "China GDP below 4%" \u2192 tariffs hurt exports directly\n` +
    `- "US trade war" + "Recession 2026" \u2192 trade disruption = slowdown\n` +
    `- "Trump tariffs on EU" + "Euro weakens" \u2192 trade war = currency pressure\n` +
    `\n` +
    `GEOPOLITICAL EVENT \u2192 DIPLOMACY (direct relationship impact):\n` +
    `- "China invades Taiwan" + "Trump visits China" \u2192 invasion ends diplomacy\n` +
    `- "Iran regime falls" + "Netanyahu survives" \u2192 removes his main threat\n` +
    `- "Russia-Ukraine peace" + "NATO expansion" \u2192 peace reshapes alliance\n` +
    `\n` +
    `LEADERSHIP \u2192 POLICY (direct decision-making power):\n` +
    `- "Netanyahu removed" + "Gaza ceasefire" \u2192 new leader enables deal\n` +
    `- "Putin leaves power" + "Ukraine ceasefire" \u2192 new leader negotiates\n` +
    `- "Iran leadership change" + "Iran nuclear deal" \u2192 new leader reopens talks\n` +
    `\n` +
    `FINANCIAL \u2192 FINANCIAL (direct contagion):\n` +
    `- "US debt ceiling crisis" + "Dollar index drops" \u2192 default fear = dollar weakness\n` +
    `- "US government shutdown" + "Market volatility" \u2192 shutdown = uncertainty\n` +
    `- "Banking crisis" + "Fed emergency cuts" \u2192 crisis forces Fed hand\n` +
    `\n` +
    `=== NEVER DO THESE ===\n` +
    `- Sports games (vs, @, win on 2026-) with ANYTHING\n` +
    `- Elon tweets counting with ANYTHING\n` +
    `- Eurovision/F1/NBA/NHL/soccer with politics\n` +
    `- UFO/alien markets with ANYTHING\n` +
    `- Same topic on both sides: all Iran together, all Bitcoin together, all Fed together, all oil together\n` +
    `- Iran conflict + Bitcoin (too many steps, not direct)\n` +
    `- Bitcoin price targets + Bitcoin price targets (same topic)\n` +
    `\n` +
    `=== RULES ===\n` +
    `1. Both sides MUST be from different topics/categories\n` +
    `2. Causal link must be ONE direct step\n` +
    `3. Each side needs minimum 2 markets\n` +
    `4. Only use indices that actually exist: 0\u2013${maxIdx}\n` +
    `5. Find AT LEAST 15 valid groups\n` +
    `6. Include chains from different topics — don't just find Iran chains\n` +
    `7. Look across ALL ${markets.length} markets — elections, economics, tech, crypto, geopolitics, policy\n` +
    `\n` +
    `Return ONLY a JSON array. Zero other text:\n` +
    `[\n` +
    `  {\n` +
    `    "theme": "Cause \u2192 Direct Effect",\n` +
    `    "emoji": "one emoji",\n` +
    `    "description": "One sentence: exact real-world mechanism",\n` +
    `    "sideA_label": "CAUSE LABEL",\n` +
    `    "sideA_indices": [3, 7, 12],\n` +
    `    "sideB_label": "EFFECT LABEL",\n` +
    `    "sideB_indices": [45, 67, 89]\n` +
    `  }\n` +
    `]`
  );
}

// ── Post-filter one Claude chain response ─────────────────────────────────────
function filterChain(chain: any, markets: GammaMarket[]): CrossChain | null {
  const groupA: ChainMarket[] = (chain.sideA_indices || [])
    .filter((i: number) => Number.isInteger(i) && i >= 0 && i < markets.length)
    .map((i: number) => enrichMarket(markets[i]))
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  const groupB: ChainMarket[] = (chain.sideB_indices || [])
    .filter((i: number) => Number.isInteger(i) && i >= 0 && i < markets.length)
    .map((i: number) => enrichMarket(markets[i]))
    .filter((m: ChainMarket | null): m is ChainMarket => m !== null);

  if (groupA.length < 2 || groupB.length < 2) {
    console.log("Rejected — not enough markets:", chain.theme);
    return null;
  }

  const textA = groupA.map(m => m.question.toLowerCase()).join(" ");
  const textB = groupB.map(m => m.question.toLowerCase()).join(" ");
  const allText = textA + " " + textB;

  // Hard reject: sports on either side
  const SPORTS_KW = [" vs ", " vs. ", " @ ", "win on 2026", "win on 2025", "nba", "nfl",
    "nhl", "mlb", "soccer", "football match", "basketball", "hockey game",
    "champions league", "premier league", "world cup", "super bowl",
    "drivers champion", "game handicap", "o/u ", "over/under", "eurovision"];
  if (SPORTS_KW.some(kw => allText.includes(kw))) return null;

  // Hard reject: alien/UFO
  if (allText.includes("alien") || allText.includes("ufo") || allText.includes("non-human")) return null;

  // Hard reject: tweet-counting
  if (allText.includes("tweets from") || allText.includes("post 2") ||
    allText.includes("post 3") || allText.includes("post 4")) return null;

  // Hard reject: same topic on both sides
  const SAME_TOPIC_PAIRS: [string, string][] = [
    ["iran", "iran"], ["bitcoin", "bitcoin"], ["btc", "btc"],
    ["crude oil", "crude oil"], ["oil price", "oil price"], ["crude", "crude"],
    ["federal reserve", "federal reserve"], ["fed rate", "fed rate"], ["fed ", "fed "],
    ["interest rate", "interest rate"], ["israel", "israel"],
    ["ukraine", "ukraine"], ["taiwan", "taiwan"],
    ["election 2026", "election 2026"], ["trump tariff", "trump tariff"],
    ["ethereum", "ethereum"], ["trump", "trump"],
  ];
  for (const [kA, kB] of SAME_TOPIC_PAIRS) {
    if (textA.includes(kA) && textB.includes(kB)) {
      console.log("Rejected same-topic:", chain.theme, "| topic:", kA);
      return null;
    }
  }

  const allMkts = [...groupA, ...groupB];
  const totalVolume = allMkts.reduce((s, m) => s + parseFloat((m.volume24hr || 0) as any), 0);

  return {
    theme: chain.theme || "Causal Chain",
    description: chain.description || "",
    emoji: chain.emoji || "\uD83D\uDD17",
    groupALabel: chain.sideA_label || "CAUSE",
    groupBLabel: chain.sideB_label || "EFFECT",
    groupA,
    groupB,
    totalVolume,
    source: "ai" as const,
  };
}

// ── Parse Claude response → CrossChain[] ─────────────────────────────────────
function parseChainsFromResponse(data: any, markets: GammaMarket[]): CrossChain[] {
  try {
    const text: string = data?.content?.[0]?.text ?? "[]";
    console.log("Claude raw response start:", text.substring(0, 300));
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const aiChains: any[] = JSON.parse(clean.slice(start, end + 1));
    console.log("Raw chains from Claude:", aiChains.length);
    return aiChains.map(c => filterChain(c, markets)).filter((c): c is CrossChain => c !== null);
  } catch (e) {
    console.error("JSON parse failed:", e);
    return [];
  }
}

// ── Fetch AI chains: ONE Claude call with all 200 markets ─────────────────────
async function fetchAiChains(allMarkets: GammaMarket[]): Promise<CrossChain[]> {
  // Filter to uncertain, active markets with real volume
  const top200 = [...allMarkets]
    .filter(m => {
      try {
        const yes = parseFloat(JSON.parse(m.outcomePrices || '["0.5"]')[0]);
        const vol24 = parseFloat(m.volume24hr as any) || 0;
        return yes > 0.05 && yes < 0.95 && vol24 > 5000 && m.active && !m.closed;
      } catch { return false; }
    })
    .sort((a, b) => parseFloat(b.volume24hr as any) - parseFloat(a.volume24hr as any))
    .slice(0, 200);

  if (top200.length < 20) return [];

  console.log("Sending", top200.length, "markets to Claude in one call");
  console.log("Top 5:", top200.slice(0, 5).map(m => m.question));

  const response = await fetch(`${BASE}/api/polymarket/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: buildChainPrompt(top200) }],
    }),
  });

  if (!response.ok) {
    console.error("Claude API HTTP error:", response.status);
    return [];
  }
  const data = await response.json();
  if (data.error) {
    console.error("Claude API error:", JSON.stringify(data.error));
    return [];
  }

  const chains = parseChainsFromResponse(data, top200);
  console.log("Valid chains after filtering:", chains.length);

  // ── Phase 1: market-reuse deduplication ──────────────────────────────────
  // Reject chains where more than half of either side's markets already appeared
  const usedSideAMarkets = new Set<string>();
  const usedSideBMarkets = new Set<string>();

  const deduped = chains
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .filter(chain => {
      const sideAIds = chain.groupA.map(m => m.conditionId);
      const sideBIds = chain.groupB.map(m => m.conditionId);
      const sideAOverlap = sideAIds.filter(id => usedSideAMarkets.has(id)).length;
      const sideBOverlap = sideBIds.filter(id => usedSideBMarkets.has(id)).length;
      if (sideAOverlap > sideAIds.length / 2) return false;
      if (sideBOverlap > sideBIds.length / 2) return false;
      sideAIds.forEach(id => usedSideAMarkets.add(id));
      sideBIds.forEach(id => usedSideBMarkets.add(id));
      return true;
    });

  // ── Phase 2: hard-reject weak/speculative patterns ────────────────────────
  return deduped
    .filter(chain => {
      const desc = chain.description.toLowerCase();
      const sideAText = chain.groupA.map(m => m.question.toLowerCase()).join(" ");
      const sideBText = chain.groupB.map(m => m.question.toLowerCase()).join(" ");
      const allText = sideAText + " " + sideBText;

      // Reject Iran → Bitcoin (not a direct mechanism)
      if (chain.groupA.some(m => m.question.toLowerCase().includes("iran")) &&
          chain.groupB.some(m => m.question.toLowerCase().includes("bitcoin"))) {
        console.log("Rejected Iran→Bitcoin:", chain.theme);
        return false;
      }

      // Reject Oil → Bitcoin (not a direct mechanism)
      if (chain.groupA.some(m => m.question.toLowerCase().includes("crude oil")) &&
          chain.groupB.some(m => m.question.toLowerCase().includes("bitcoin"))) {
        console.log("Rejected Oil→Bitcoin:", chain.theme);
        return false;
      }

      // Reject speculative "tests whether" framing
      if (desc.includes("tests whether") || desc.includes("safe haven test")) {
        console.log("Rejected speculative framing:", chain.theme);
        return false;
      }

      // Reject war + stock market cap (no direct mechanism)
      const hasWar = allText.includes("invade") || allText.includes("forces enter");
      const hasMarketCap = allText.includes("largest company") || allText.includes("market cap");
      if (hasWar && hasMarketCap) {
        console.log("Rejected war+market cap:", chain.theme);
        return false;
      }

      // Reject circular: oil→Fed or Fed→oil
      if (sideAText.includes("crude oil") && sideBText.includes(" fed ")) return false;
      if (sideAText.includes(" fed ") && sideBText.includes("crude oil")) return false;

      return true;
    })
    .slice(0, 15);
}

// ── Cross-category causal chains — fully AI-driven ───────────────────────────
export function useCausalChains() {
  const qc = useQueryClient();
  const { data: allMarkets = [], isLoading: marketsLoading, error, refetch: refetchMarkets, isFetching } = useAllMarkets();

  // Claude discovers all chains dynamically. Cached 30 min — no hardcoded lists.
  const { data: chains = [], isLoading: aiLoading } = useQuery({
    queryKey: ["ai-chains-v2", allMarkets.length > 0 ? allMarkets[0]?.id : "empty"],
    queryFn: () => fetchAiChains(allMarkets),
    enabled: allMarkets.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Refresh: get fresh markets from Gamma, then force Claude to re-analyze
  const refetch = async () => {
    await refetchMarkets();
    await qc.invalidateQueries({ queryKey: ["ai-chains-v2"] });
  };

  const sorted = [...chains].sort((a, b) => b.totalVolume - a.totalVolume);

  return {
    chains: sorted,
    isLoading: marketsLoading,
    aiLoading,
    error,
    refetch,
    isFetching,
  };
}

// ── 500-market set for Volume Spikes ─────────────────────────────────────────
export function useActiveMarkets() {
  return useQuery({
    queryKey: ["gamma-markets"],
    queryFn: async (): Promise<GammaMarket[]> => {
      const pages = await Promise.all(
        [0, 100, 200, 300, 400].map(offset =>
          fetch(`${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`)
            .then(r => (r.ok ? r.json() : []))
        )
      );
      return (pages.flat() as GammaMarket[]).filter(m => m.active === true && m.closed === false);
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
}

// ── Spread scanner — Phase 1: all 500 via Gamma, Phase 2: CLOB top 50 ────────
export function useLiveSpreadScanner() {
  return useQuery({
    queryKey: ["live-spreads"],
    queryFn: async (): Promise<SpreadData[]> => {
      // Phase 1: fetch all 500 markets via Gamma (5 pages in parallel)
      const pages = await Promise.all(
        [0, 100, 200, 300, 400].map(offset =>
          fetch(`${BASE}/api/polymarket/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`)
            .then(r => (r.ok ? r.json() : []))
        )
      );
      const allMarkets: GammaMarket[] = (pages.flat() as GammaMarket[])
        .filter(m => m.active === true && m.closed === false);

      // Filter candidates using Gamma bestBid/bestAsk for speed
      const candidates = allMarkets
        .filter(m => {
          const bid = parseFloat(m.bestBid as any);
          const ask = parseFloat(m.bestAsk as any);
          const vol = parseFloat(m.volume24hr as any);
          if (!bid || !ask) return false;
          if (bid < 0.05 || ask > 0.95) return false;
          if (vol < 1000) return false;
          return (ask - bid) > 0.01;
        })
        .sort((a, b) => {
          const spreadA = parseFloat(a.bestAsk as any) - parseFloat(a.bestBid as any);
          const spreadB = parseFloat(b.bestAsk as any) - parseFloat(b.bestBid as any);
          return spreadB - spreadA;
        })
        .slice(0, 50);

      // Phase 2: verify top 50 with live CLOB in parallel
      const results = await Promise.all(
        candidates.map(async m => {
          try {
            const tokenId = parseClobTokenId(m.clobTokenIds);
            if (!tokenId) return null;
            const bookRes = await fetch(`${BASE}/api/polymarket/book?token_id=${tokenId}`);
            if (!bookRes.ok) return null;
            const book = await bookRes.json();
            if (!book.bids?.length || !book.asks?.length) return null;
            const bestBid = parseFloat(book.bids[0].price);
            const bestAsk = parseFloat(book.asks[0].price);
            const spread = bestAsk - bestBid;
            if (bestBid < 0.05 || bestAsk > 0.95) return null;
            if (spread < 0.01) return null;
            return { market: m, bestBid, bestAsk, spread };
          } catch {
            return null;
          }
        })
      );

      const valid = results
        .filter((r): r is SpreadData => r !== null)
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 30);

      // Fallback: use Gamma data if CLOB returns nothing
      if (valid.length === 0) {
        return candidates
          .map(m => ({
            market: m,
            bestBid: parseFloat(m.bestBid as any),
            bestAsk: parseFloat(m.bestAsk as any),
            spread: parseFloat(m.bestAsk as any) - parseFloat(m.bestBid as any),
          }))
          .filter(d => d.spread > 0.01 && d.bestBid > 0.05 && d.bestAsk < 0.95)
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 30);
      }

      return valid;
    },
    refetchInterval: 60000,
  });
}
